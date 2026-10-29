import React, { useRef, useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Wand2,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ChevronsUpDown,
  ChevronsDownUp,
  Maximize2,
  Minimize2,
  RefreshCw,
  Database
} from 'lucide-react';
import { useFeedback } from '../../context/FeedbackContext';
import {
  GraphQLSchemaService,
  ValidationDiagnostic
} from '../../services/graphqlSchemaService';

export interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: 'graphql' | 'json';
  label?: string;
  placeholder?: string;
  compactHeight?: string; // default ~135px
  expandedHeight?: string; // default ~440px
  defaultExpanded?: boolean; // default false (starts reduced)
  allowFullscreen?: boolean;
  required?: boolean;
  className?: string;
  graphqlQuery?: string; // Query de referencia para inferir y validar variables en JSON
  environmentId?: string; // ID del entorno para sincronizar schema
}

// ---------------- GraphQL Formatter ----------------
export function formatGraphQL(code: string): { formatted: string; error?: string } {
  if (!code || !code.trim()) return { formatted: code };

  const validation = validateGraphQL(code);
  if (!validation.valid) {
    return { formatted: code, error: validation.error };
  }

  try {
    let indent = 0;
    const tab = '  ';
    let out = '';
    let inString = false;
    let inComment = false;
    let strChar = '';

    const tokens: { type: string; val: string }[] = [];
    let cur = '';

    for (let i = 0; i < code.length; i++) {
      const c = code[i];

      if (inComment) {
        cur += c;
        if (c === '\n') {
          tokens.push({ type: 'comment', val: cur.trim() });
          cur = '';
          inComment = false;
        }
        continue;
      }

      if ((c === '"' || c === "'") && (i === 0 || code[i - 1] !== '\\')) {
        if (!inString) {
          inString = true;
          strChar = c;
        } else if (strChar === c) {
          inString = false;
        }
        cur += c;
        continue;
      }

      if (inString) {
        cur += c;
        continue;
      }

      if (c === '#') {
        if (cur.trim()) tokens.push({ type: 'code', val: cur.trim() });
        cur = '#';
        inComment = true;
        continue;
      }

      if (c === '{' || c === '}' || c === '(' || c === ')' || c === '[' || c === ']') {
        if (cur.trim()) tokens.push({ type: 'code', val: cur.trim() });
        cur = '';
        tokens.push({ type: c, val: c });
        continue;
      }

      if (/\s/.test(c)) {
        if (cur.trim()) tokens.push({ type: 'code', val: cur.trim() });
        cur = '';
        continue;
      }

      cur += c;
    }
    if (cur.trim()) {
      tokens.push({ type: inComment ? 'comment' : 'code', val: cur.trim() });
    }

    let line = '';
    let inParen = 0;

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];

      if (t.type === 'comment') {
        if (line.trim()) {
          out += tab.repeat(indent) + line.trim() + '\n';
          line = '';
        }
        out += tab.repeat(indent) + t.val + '\n';
      } else if (t.type === '(') {
        inParen++;
        line += '(';
      } else if (t.type === ')') {
        inParen = Math.max(0, inParen - 1);
        line += ')';
      } else if (t.type === '[') {
        line += '[';
      } else if (t.type === ']') {
        line += ']';
      } else if (t.type === '{') {
        if (line.trim()) {
          out += tab.repeat(indent) + line.trim() + ' {\n';
        } else {
          out += tab.repeat(indent) + '{\n';
        }
        indent++;
        line = '';
      } else if (t.type === '}') {
        if (line.trim()) {
          out += tab.repeat(indent) + line.trim() + '\n';
          line = '';
        }
        indent = Math.max(0, indent - 1);
        out += tab.repeat(indent) + '}\n';
      } else {
        if (inParen > 0) {
          const sep =
            line.endsWith('(') || line.endsWith('[')
              ? ''
              : line.endsWith(':') || line.endsWith(',')
              ? ' '
              : ' ';
          line += sep + t.val;
        } else {
          if (line.length > 0) {
            out += tab.repeat(indent) + line.trim() + '\n';
            line = t.val;
          } else {
            line = t.val;
          }
        }
      }
    }

    if (line.trim()) {
      out += tab.repeat(indent) + line.trim() + '\n';
    }

    return { formatted: out.trimEnd() + '\n' };
  } catch (err: any) {
    return { formatted: code, error: err.message };
  }
}

// ---------------- JSON Formatter ----------------
export function formatJSON(code: string): { formatted: string; error?: string } {
  if (!code || !code.trim()) return { formatted: '{}' };
  try {
    const parsed = JSON.parse(code);
    return { formatted: JSON.stringify(parsed, null, 2) };
  } catch (err: any) {
    try {
      const quoted = code.replace(/:\s*(\{\{[^}]+\}\})/g, ': "$1"');
      const parsed = JSON.parse(quoted);
      return { formatted: JSON.stringify(parsed, null, 2) };
    } catch {
      return { formatted: code, error: `Error de sintaxis JSON: ${err.message}` };
    }
  }
}

// ---------------- Basic Fallback Syntax Validators ----------------
export function validateGraphQL(code: string): { valid: boolean; error?: string; line?: number } {
  if (!code || !code.trim()) return { valid: true };
  const stack: { char: string; line: number }[] = [];
  const lines = code.split('\n');
  let inString = false;
  let stringChar = '';
  let inComment = false;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    inComment = false;
    for (let colIdx = 0; colIdx < line.length; colIdx++) {
      const ch = line[colIdx];
      if (inComment) continue;
      if (ch === '#') {
        inComment = true;
        continue;
      }
      if ((ch === '"' || ch === "'") && (colIdx === 0 || line[colIdx - 1] !== '\\')) {
        if (!inString) {
          inString = true;
          stringChar = ch;
        } else if (stringChar === ch) {
          inString = false;
        }
        continue;
      }
      if (inString) continue;

      if (ch === '{' || ch === '(' || ch === '[') {
        stack.push({ char: ch, line: lineIdx + 1 });
      } else if (ch === '}' || ch === ')' || ch === ']') {
        const expected = ch === '}' ? '{' : ch === ')' ? '(' : '[';
        if (stack.length === 0 || stack[stack.length - 1].char !== expected) {
          return {
            valid: false,
            error: `Cierre '${ch}' inesperado sin apertura previa`,
            line: lineIdx + 1
          };
        }
        stack.pop();
      }
    }
  }

  if (inString) {
    return { valid: false, error: 'Comilla de texto sin cerrar' };
  }

  if (stack.length > 0) {
    const last = stack[stack.length - 1];
    const expectedClose = last.char === '{' ? '}' : last.char === '(' ? ')' : ']';
    return {
      valid: false,
      error: `Falta cerrar '${expectedClose}' correspondiente a la línea ${last.line}`,
      line: last.line
    };
  }

  return { valid: true };
}

export function validateJSON(code: string): { valid: boolean; error?: string; line?: number } {
  if (!code || !code.trim()) return { valid: true };
  try {
    const sanitized = code.replace(/:\s*\{\{([^{}]+)\}\}/g, ': "__VAR__"');
    JSON.parse(sanitized);
    return { valid: true };
  } catch (err: any) {
    let line: number | undefined;
    const match = err.message.match(/at line (\d+)|at position (\d+)/i);
    if (match) {
      if (match[1]) {
        line = parseInt(match[1], 10);
      } else if (match[2]) {
        const pos = parseInt(match[2], 10);
        line = code.substring(0, pos).split('\n').length;
      }
    }
    return {
      valid: false,
      error: err.message.replace(/in JSON at line \d+ column \d+/i, '').replace(/in JSON at position \d+/i, '').trim(),
      line
    };
  }
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  onChange,
  language,
  label,
  placeholder,
  compactHeight = '135px',
  expandedHeight = '450px',
  defaultExpanded = false,
  allowFullscreen = true,
  required,
  className = '',
  graphqlQuery = '',
  environmentId
}) => {
  const { toast } = useFeedback();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const modalTextareaRef = useRef<HTMLTextAreaElement>(null);
  const modalGutterRef = useRef<HTMLDivElement>(null);

  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Schema state & auto-validation
  const [schemaVersion, setSchemaVersion] = useState<number>(0);
  const [isSyncingSchema, setIsSyncingSchema] = useState<boolean>(false);
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(true);

  // Sync schema on mount if not loaded
  useEffect(() => {
    GraphQLSchemaService.loadFromLocalCache(environmentId);
    setSchemaVersion(v => v + 1);
  }, [environmentId]);

  const schemaInfo = useMemo(() => {
    return GraphQLSchemaService.getSchemaInfo();
  }, [schemaVersion]);

  // Handle schema sync
  const handleSyncSchema = async () => {
    setIsSyncingSchema(true);
    try {
      const res = await GraphQLSchemaService.syncSchema(environmentId, true);
      if (res.success) {
        setSchemaVersion(v => v + 1);
        toast(`¡Schema sincronizado exitosamente! (${res.typesCount} tipos detectados)`, 'success');
      } else {
        toast(`Aviso con el Schema: ${res.error}`, 'error');
      }
    } catch (err: any) {
      toast(`Error al obtener schema: ${err.message}`, 'error');
    } finally {
      setIsSyncingSchema(false);
    }
  };

  // Deep Schema & Typings Validation
  const schemaValidation = useMemo(() => {
    if (!value || !value.trim()) return null;
    if (language === 'graphql') {
      // En el editor de GraphQL validamos la estructura, sintaxis y campos contra el esquema
      // Los errores de variables pertenecen al editor de Variables (JSON)
      const res = GraphQLSchemaService.validateOperation(value, '');
      return {
        ...res,
        diagnostics: res.diagnostics.filter(d => d.source === 'syntax' || d.source === 'schema')
      };
    } else if (language === 'json') {
      // En el editor de JSON validamos la sintaxis JSON y los tipos/datos contra la Query
      return GraphQLSchemaService.validateOperation(graphqlQuery || '', value);
    }
    return null;
  }, [value, language, graphqlQuery, schemaVersion]);

  // Basic syntax validation fallback
  const basicValidation = useMemo(() => {
    if (language === 'json') {
      return validateJSON(value);
    }
    return validateGraphQL(value);
  }, [value, language]);

  // Aggregate errors & warnings
  const diagnostics = useMemo<ValidationDiagnostic[]>(() => {
    const list: ValidationDiagnostic[] = [];
    if (schemaValidation && schemaValidation.diagnostics.length > 0) {
      list.push(...schemaValidation.diagnostics);
    } else if (!basicValidation.valid && basicValidation.error) {
      list.push({
        message: basicValidation.error,
        line: basicValidation.line,
        severity: 'error',
        source: 'syntax'
      });
    }
    return list;
  }, [schemaValidation, basicValidation]);

  const errorCount = useMemo(() => diagnostics.filter(d => d.severity === 'error').length, [diagnostics]);
  const warningCount = useMemo(() => diagnostics.filter(d => d.severity === 'warning').length, [diagnostics]);

  // Line count
  const lineCount = useMemo(() => {
    return Math.max(1, value.split('\n').length);
  }, [value]);

  // Sync gutter scroll with textarea
  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>, isModal = false) => {
    const target = isModal ? modalGutterRef.current : gutterRef.current;
    if (target) {
      target.scrollTop = e.currentTarget.scrollTop;
    }
  };

  // Keyboard Superpowers (Indentation & Auto-close)
  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    targetRef: React.RefObject<HTMLTextAreaElement>
  ) => {
    const textarea = targetRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const val = textarea.value;

    // 1. Tab / Shift+Tab Indentation
    if (e.key === 'Tab') {
      e.preventDefault();

      if (e.shiftKey) {
        const before = val.substring(0, start);
        const lineStart = before.lastIndexOf('\n') + 1;
        const after = val.substring(end);
        const selectedText = val.substring(lineStart, end);
        const lines = selectedText.split('\n');
        let removedCount = 0;
        const unindentedLines = lines.map(line => {
          if (line.startsWith('  ')) {
            removedCount += 2;
            return line.slice(2);
          } else if (line.startsWith(' ') || line.startsWith('\t')) {
            removedCount += 1;
            return line.slice(1);
          }
          return line;
        });
        const newText = val.substring(0, lineStart) + unindentedLines.join('\n') + after;
        onChange(newText);
        setTimeout(() => {
          textarea.selectionStart = Math.max(lineStart, start - (val.startsWith('  ', lineStart) ? 2 : 0));
          textarea.selectionEnd = Math.max(lineStart, end - removedCount);
        }, 0);
      } else {
        if (start !== end && val.substring(start, end).includes('\n')) {
          const before = val.substring(0, start);
          const lineStart = before.lastIndexOf('\n') + 1;
          const selectedText = val.substring(lineStart, end);
          const lines = selectedText.split('\n');
          const indentedLines = lines.map(line => '  ' + line);
          const newText = val.substring(0, lineStart) + indentedLines.join('\n') + val.substring(end);
          onChange(newText);
          setTimeout(() => {
            textarea.selectionStart = start + 2;
            textarea.selectionEnd = end + lines.length * 2;
          }, 0);
        } else {
          const newText = val.substring(0, start) + '  ' + val.substring(end);
          onChange(newText);
          setTimeout(() => {
            textarea.selectionStart = textarea.selectionEnd = start + 2;
          }, 0);
        }
      }
      return;
    }

    // 2. Enter: Auto-indentation
    if (e.key === 'Enter') {
      e.preventDefault();
      const before = val.substring(0, start);
      const lastNewline = before.lastIndexOf('\n');
      const currentLine = before.substring(lastNewline + 1);
      const matchIndent = currentLine.match(/^\s*/);
      let indent = matchIndent ? matchIndent[0] : '';

      const trimmedLine = currentLine.trim();
      const opensBlock =
        trimmedLine.endsWith('{') || trimmedLine.endsWith('[') || trimmedLine.endsWith('(');
      if (opensBlock) {
        indent += '  ';
      }

      const nextChar = val.charAt(end);
      const isClosingPair =
        (trimmedLine.endsWith('{') && nextChar === '}') ||
        (trimmedLine.endsWith('[') && nextChar === ']') ||
        (trimmedLine.endsWith('(') && nextChar === ')');

      let insertText = '\n' + indent;
      const cursorOffset = insertText.length;

      if (isClosingPair) {
        const parentIndent = matchIndent ? matchIndent[0] : '';
        insertText += '\n' + parentIndent;
      }

      const newText = val.substring(0, start) + insertText + val.substring(end);
      onChange(newText);
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + cursorOffset;
      }, 0);
      return;
    }

    // 3. Auto-close pairs: { [ ( " '
    const pairs: Record<string, string> = {
      '{': '}',
      '[': ']',
      '(': ')',
      '"': '"',
      "'": "'"
    };
    if (pairs[e.key]) {
      if (start !== end) {
        e.preventDefault();
        const selected = val.substring(start, end);
        const wrapped = e.key + selected + pairs[e.key];
        const newText = val.substring(0, start) + wrapped + val.substring(end);
        onChange(newText);
        setTimeout(() => {
          textarea.selectionStart = start + 1;
          textarea.selectionEnd = end + 1;
        }, 0);
        return;
      }

      if (val.charAt(start) === e.key && ['}', ']', ')', '"', "'"].includes(e.key)) {
        e.preventDefault();
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 1;
        }, 0);
        return;
      }

      e.preventDefault();
      const newText = val.substring(0, start) + e.key + pairs[e.key] + val.substring(end);
      onChange(newText);
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 1;
      }, 0);
      return;
    }

    // 4. Backspace
    if (e.key === 'Backspace') {
      if (start === end && start > 0) {
        const prev = val.charAt(start - 1);
        const next = val.charAt(start);
        if (
          (prev === '{' && next === '}') ||
          (prev === '[' && next === ']') ||
          (prev === '(' && next === ')') ||
          (prev === '"' && next === '"') ||
          (prev === "'" && next === "'")
        ) {
          e.preventDefault();
          const newText = val.substring(0, start - 1) + val.substring(start + 1);
          onChange(newText);
          setTimeout(() => {
            textarea.selectionStart = textarea.selectionEnd = start - 1;
          }, 0);
          return;
        }
      }
    }
  };

  // Prettier / Format action
  const handlePrettier = () => {
    if (language === 'json') {
      const result = formatJSON(value);
      if (result.error) {
        toast(result.error, 'error');
      } else {
        onChange(result.formatted);
        toast('JSON formateado correctamente', 'success');
      }
    } else {
      const result = formatGraphQL(value);
      if (result.error) {
        toast(`No se pudo formatear: ${result.error}`, 'error');
      } else {
        onChange(result.formatted);
        toast('GraphQL formateado correctamente', 'success');
      }
    }
  };

  // Copy code action
  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    toast('Código copiado al portapapeles', 'info');
    setTimeout(() => setCopied(false), 2000);
  };

  // Scroll to line when error is clicked
  const scrollToLine = (line?: number) => {
    if (!line || !textareaRef.current) return;
    const lines = value.split('\n');
    let charPos = 0;
    for (let i = 0; i < Math.min(line - 1, lines.length); i++) {
      charPos += lines[i].length + 1;
    }
    textareaRef.current.focus();
    textareaRef.current.selectionStart = textareaRef.current.selectionEnd = charPos;
  };

  // Fullscreen escape key
  useEffect(() => {
    if (!isFullscreen) return;
    document.body.style.overflow = 'hidden';
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKey);
    };
  }, [isFullscreen]);

  return (
    <div className={`space-y-1.5 ${className}`}>
      {/* Top Header & Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {label && (
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              {label} {required && <span className="text-rose-500">*</span>}
            </label>
          )}

          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 font-semibold">
            {language}
          </span>

          <span className="text-[10px] font-mono text-slate-400">
            {lineCount} {lineCount === 1 ? 'línea' : 'líneas'}
          </span>

          {/* Schema Indicator & Sync Button */}
          {schemaInfo.hasSchema ? (
            <button
              type="button"
              onClick={handleSyncSchema}
              disabled={isSyncingSchema}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
              title={`Schema activo (${schemaInfo.typesCount} tipos). Clic para refrescar.`}
            >
              <Database className="w-2.5 h-2.5" />
              <span>Schema ({schemaInfo.typesCount} tipos)</span>
              <RefreshCw className={`w-2.5 h-2.5 ml-0.5 ${isSyncingSchema ? 'animate-spin' : ''}`} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSyncSchema}
              disabled={isSyncingSchema}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 hover:bg-orange-500/20 transition-colors"
              title="Obtener schema del entorno para validar estructura y tipos"
            >
              <RefreshCw className={`w-2.5 h-2.5 ${isSyncingSchema ? 'animate-spin' : ''}`} />
              <span>Sincronizar Schema</span>
            </button>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          {/* Typings & Diagnostics Pill */}
          {value.trim() && (
            <div className="flex items-center gap-1 text-[11px] font-mono mr-1">
              {errorCount === 0 && warningCount === 0 ? (
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Estructura y Tipado Válidos</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowDiagnostics(prev => !prev)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded border transition-colors ${
                    errorCount > 0
                      ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 hover:bg-rose-500/20'
                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                  }`}
                  title={showDiagnostics ? 'Ocultar lista de errores' : 'Mostrar lista de errores'}
                >
                  {errorCount > 0 ? (
                    <AlertCircle className="w-3 h-3" />
                  ) : (
                    <AlertTriangle className="w-3 h-3" />
                  )}
                  <span>
                    {errorCount > 0 ? `${errorCount} error${errorCount > 1 ? 'es' : ''}` : `${warningCount} aviso${warningCount > 1 ? 's' : ''}`}
                  </span>
                </button>
              )}
            </div>
          )}

          {/* Toggle Expand / Collapse */}
          <button
            type="button"
            onClick={() => setIsExpanded(prev => !prev)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border transition-all ${
              isExpanded
                ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
            title={isExpanded ? 'Contraer editor' : 'Expandir editor'}
          >
            {isExpanded ? (
              <>
                <ChevronsDownUp className="w-3 h-3 text-orange-500" />
                <span>Contraer</span>
              </>
            ) : (
              <>
                <ChevronsUpDown className="w-3 h-3 text-orange-500" />
                <span>Expandir</span>
              </>
            )}
          </button>

          {/* Fullscreen Button */}
          {allowFullscreen && (
            <button
              type="button"
              onClick={() => setIsFullscreen(true)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Pantalla completa"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Format / Prettier Button */}
          <button
            type="button"
            onClick={handlePrettier}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/50 border border-orange-200 dark:border-orange-800/80 transition-colors shadow-2xs"
            title="Formatear código con indentación limpia"
          >
            <Wand2 className="w-3 h-3 text-orange-500" />
            <span>Formatear</span>
          </button>

          {/* Copy Button */}
          <button
            type="button"
            onClick={handleCopy}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Copiar código"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Code Editor Container */}
      <div
        className={`relative flex flex-col rounded-xl border transition-all overflow-hidden ${
          errorCount > 0 && value.trim()
            ? 'border-rose-400 dark:border-rose-500/60 ring-1 ring-rose-400/20'
            : 'border-slate-200 dark:border-slate-800 focus-within:border-orange-500 dark:focus-within:border-orange-500 focus-within:ring-1 focus-within:ring-orange-500/20'
        } bg-slate-50 dark:bg-slate-950`}
      >
        <div
          className="flex overflow-hidden transition-all duration-200"
          style={{ height: isExpanded ? expandedHeight : compactHeight }}
        >
          {/* Line Numbers Gutter */}
          <div
            ref={gutterRef}
            className="select-none py-2.5 pl-2.5 pr-2 bg-slate-100/70 dark:bg-slate-900/70 border-r border-slate-200 dark:border-slate-800 text-right font-mono text-[11px] text-slate-400 dark:text-slate-600 overflow-hidden shrink-0"
            style={{ width: lineCount > 99 ? '42px' : '32px' }}
          >
            {Array.from({ length: lineCount }, (_, i) => {
              const lineNum = i + 1;
              const hasErr = diagnostics.some(d => d.line === lineNum && d.severity === 'error');
              return (
                <div
                  key={lineNum}
                  className={`leading-5 ${hasErr ? 'text-rose-500 font-bold bg-rose-500/15' : ''}`}
                >
                  {lineNum}
                </div>
              );
            })}
          </div>

          {/* Interactive Textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={e => handleKeyDown(e, textareaRef)}
            onScroll={e => handleScroll(e, false)}
            placeholder={placeholder}
            required={required}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            className="flex-1 w-full font-mono text-xs leading-5 px-3 py-2.5 bg-transparent text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none resize-none selection:bg-orange-500/30 overflow-auto whitespace-pre"
          />
        </div>

        {/* Expand / Collapse Bar */}
        {!isExpanded && lineCount > 6 && (
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-slate-100/90 dark:bg-slate-900/90 hover:bg-slate-200/80 dark:hover:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-600 dark:text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
          >
            <ChevronsUpDown className="w-3.5 h-3.5 text-orange-500" />
            <span>Código extenso ({lineCount} líneas) — Clic para expandir</span>
          </button>
        )}

        {isExpanded && (
          <button
            type="button"
            onClick={() => setIsExpanded(false)}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-slate-100/90 dark:bg-slate-900/90 hover:bg-slate-200/80 dark:hover:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-600 dark:text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
          >
            <ChevronsDownUp className="w-3.5 h-3.5 text-orange-500" />
            <span>Contraer editor</span>
          </button>
        )}
      </div>

      {/* DIAGNOSTICS & TYPING ERROR DETAILS (VISIBLE WHEN THERE ARE ERRORS) */}
      {showDiagnostics && diagnostics.length > 0 && (
        <div className="space-y-1 p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs animate-in fade-in duration-100">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 dark:text-slate-300 pb-1 border-b border-slate-200 dark:border-slate-800">
            <span className="flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
              <span>Errores de tipado o estructura detectados ({diagnostics.length})</span>
            </span>
            <button
              type="button"
              onClick={() => setShowDiagnostics(false)}
              className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              Ocultar
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {diagnostics.map((diag, idx) => (
              <div
                key={idx}
                onClick={() => scrollToLine(diag.line)}
                className={`flex items-start gap-1.5 p-1.5 rounded-lg text-[11px] font-mono cursor-pointer transition-colors ${
                  diag.severity === 'error'
                    ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100'
                    : 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 hover:bg-amber-100'
                }`}
                title="Clic para saltar a la línea"
              >
                {diag.severity === 'error' ? (
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                )}
                <div className="flex-1">
                  {diag.line && <span className="font-bold underline mr-1.5">Línea {diag.line}:</span>}
                  <span className="text-[10px] px-1 py-0.2 rounded bg-slate-200/60 dark:bg-slate-800 text-slate-700 dark:text-slate-300 mr-1.5 uppercase font-sans">
                    {diag.source}
                  </span>
                  <span>{diag.message}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick compact error banner if drawer is closed */}
      {!showDiagnostics && diagnostics.length > 0 && (
        <div
          onClick={() => setShowDiagnostics(true)}
          className="flex items-start gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 text-xs cursor-pointer hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors"
          title="Clic para ver detalles de validación"
        >
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span className="font-mono text-[11px] flex-1">
            {diagnostics[0].line ? `Línea ${diagnostics[0].line}: ` : ''}
            {diagnostics[0].message}
            {diagnostics.length > 1 && (
              <span className="underline ml-2 font-bold">(+{diagnostics.length - 1} más)</span>
            )}
          </span>
        </div>
      )}

      {/* Fullscreen Overlay Modal */}
      {isFullscreen && createPortal(
        <div className="fixed inset-0 z-[99999] p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md flex flex-col justify-center items-center animate-in fade-in duration-150">
          <div className="w-full max-w-5xl h-[90vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950/50">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  {label || 'Editor de Código'}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded uppercase bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold">
                  {language}
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {lineCount} líneas
                </span>

                {schemaInfo.hasSchema && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    Schema ({schemaInfo.typesCount} tipos)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrettier}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-orange-600 hover:bg-orange-700 text-white transition-colors"
                  title="Formatear código"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>Formatear</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopy}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="Copiar código"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </button>

                <button
                  type="button"
                  onClick={() => setIsFullscreen(false)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors"
                  title="Cerrar pantalla completa (Esc)"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span>Cerrar (Esc)</span>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 flex overflow-hidden bg-slate-50 dark:bg-slate-950">
              <div
                ref={modalGutterRef}
                className="select-none py-3 pl-3 pr-2.5 bg-slate-100/70 dark:bg-slate-900/70 border-r border-slate-200 dark:border-slate-800 text-right font-mono text-xs text-slate-400 dark:text-slate-600 overflow-hidden shrink-0"
                style={{ width: lineCount > 99 ? '46px' : '36px' }}
              >
                {Array.from({ length: lineCount }, (_, i) => {
                  const lineNum = i + 1;
                  const hasErr = diagnostics.some(d => d.line === lineNum && d.severity === 'error');
                  return (
                    <div
                      key={lineNum}
                      className={`leading-6 ${hasErr ? 'text-rose-500 font-bold bg-rose-500/15' : ''}`}
                    >
                      {lineNum}
                    </div>
                  );
                })}
              </div>

              <textarea
                ref={modalTextareaRef}
                value={value}
                onChange={e => onChange(e.target.value)}
                onKeyDown={e => handleKeyDown(e, modalTextareaRef)}
                onScroll={e => handleScroll(e, true)}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
                className="flex-1 w-full font-mono text-xs leading-6 px-4 py-3 bg-transparent text-slate-900 dark:text-slate-100 focus:outline-none resize-none selection:bg-orange-500/30 overflow-auto whitespace-pre"
              />
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-2.5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between text-xs">
              <span className="text-slate-400 font-mono text-[11px]">
                Tab: Indentar · Shift+Tab: Desindentar · Esc: Salir
              </span>

              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                className="px-4 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs transition-colors"
              >
                Aplicar y Cerrar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
