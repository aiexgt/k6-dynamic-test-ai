import React, { useState, useMemo } from 'react';
import { Copy, Check, ArrowLeft, Braces } from 'lucide-react';
import { GraphQLSchemaService } from '../../services/graphqlSchemaService';
import { useFeedback } from '../../context/FeedbackContext';

interface TypedSchemaJsonViewerProps {
  query: string;
  onCopyAllToEditor?: (jsonText: string) => void;
  height?: string;
  className?: string;
}

export const TypedSchemaJsonViewer: React.FC<TypedSchemaJsonViewerProps> = ({
  query,
  onCopyAllToEditor,
  height,
  className = ''
}) => {
  const { toast } = useFeedback();
  const [copied, setCopied] = useState<boolean>(false);
  const [copiedToEditor, setCopiedToEditor] = useState<boolean>(false);
  const [mode, setMode] = useState<'types' | 'values'>('types');

  const typedJson = useMemo(() => {
    return GraphQLSchemaService.generateTypedSchemaJson(query);
  }, [query]);

  const exampleValuesJson = useMemo(() => {
    const inputs = GraphQLSchemaService.getOperationInputs(query);
    return GraphQLSchemaService.generateExampleVariablesJson(inputs);
  }, [query]);

  const displayJson = mode === 'types' ? typedJson : exampleValuesJson;

  const lines = useMemo(() => {
    return displayJson.split('\n');
  }, [displayJson]);

  const handleCopyClipboard = () => {
    navigator.clipboard.writeText(displayJson);
    setCopied(true);
    toast('JSON copiado al portapapeles', 'info');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyToEditor = () => {
    if (onCopyAllToEditor) {
      onCopyAllToEditor(displayJson);
      setCopiedToEditor(true);
      toast('JSON insertado en tus variables', 'success');
      setTimeout(() => setCopiedToEditor(false), 2000);
    }
  };

  return (
    <div className={`flex flex-col space-y-1.5 h-full ${className}`}>
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-1.5 flex-wrap">
        <div className="flex items-center gap-1.5">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
            <Braces className="w-3.5 h-3.5 text-orange-500" />
            <span>Schema / Tipado del Input</span>
          </label>

          {/* Toggle Tipado vs Valores */}
          <div className="inline-flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[10px]">
            <button
              type="button"
              onClick={() => setMode('types')}
              className={`px-1.5 py-0.5 rounded font-mono font-medium transition-colors ${
                mode === 'types'
                  ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-2xs font-bold'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
              title="Muestra los tipos de datos de cada campo (ej. String!, Float, etc.)"
            >
              Tipos
            </button>
            <button
              type="button"
              onClick={() => setMode('values')}
              className={`px-1.5 py-0.5 rounded font-mono font-medium transition-colors ${
                mode === 'values'
                  ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-2xs font-bold'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
              title="Muestra valores de ejemplo listos para ejecutar"
            >
              Valores
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1">
          {onCopyAllToEditor && (
            <button
              type="button"
              onClick={handleCopyToEditor}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/60 border border-orange-200 dark:border-orange-800/80 transition-colors shadow-2xs"
              title="Pasa este JSON completo al editor de variables"
            >
              {copiedToEditor ? (
                <Check className="w-3 h-3 text-emerald-500" />
              ) : (
                <ArrowLeft className="w-3 h-3 text-orange-500" />
              )}
              <span>Pasar a variables</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleCopyClipboard}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Copiar JSON al portapapeles"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Code Container with Gutter */}
      <div
        className="flex-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex overflow-hidden shadow-2xs min-h-[160px]"
        style={{ height: height || '100%' }}
      >
        {/* Line Numbers Gutter */}
        <div className="select-none py-2.5 pl-2.5 pr-2 bg-slate-100/70 dark:bg-slate-900/70 border-r border-slate-200 dark:border-slate-800 text-right font-mono text-[11px] text-slate-400 dark:text-slate-600 overflow-hidden shrink-0 w-8">
          {lines.map((_, i) => (
            <div key={i + 1} className="leading-5">
              {i + 1}
            </div>
          ))}
        </div>

        {/* Read-only JSON View */}
        <pre className="flex-1 p-2.5 font-mono text-xs leading-5 text-slate-800 dark:text-slate-200 overflow-auto whitespace-pre selection:bg-orange-500/20">
          <code>{displayJson}</code>
        </pre>
      </div>
    </div>
  );
};
