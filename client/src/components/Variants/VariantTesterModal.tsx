import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Play,
  RefreshCw,
  X,
  Code2,
  Variable,
  Layers,
  ShieldCheck,
  Check,
  Copy,
  Save,
  CheckCircle2,
  XCircle,
  ArrowDownLeft,
  ArrowUpRight,
  FlaskConical,
  Sliders,
  Plus,
  Trash2,
  Sparkles,
  Search,
  Globe
} from 'lucide-react';
import {
  Variant,
  CustomValidation,
  FlowStepConfig,
  StepExecutionResult,
  ExecutionContext,
  ValidationType,
  Environment
} from '../../types';
import { api } from '../../api';
import { CodeEditor, formatGraphQL } from '../common/CodeEditor';
import { TypedSchemaJsonViewer } from '../common/TypedSchemaJsonViewer';
import { useFeedback } from '../../context/FeedbackContext';

interface VariantTesterModalProps {
  variant: Variant;
  onClose: () => void;
  onVariantUpdated?: (updatedVariant: Variant) => void;
}

type RequestTab = 'query' | 'variables' | 'headers' | 'context' | 'validations';
type ResponseTab = 'response' | 'tests' | 'extracted' | 'requestPayload';

export const VariantTesterModal: React.FC<VariantTesterModalProps> = ({
  variant,
  onClose,
  onVariantUpdated
}) => {
  const { toast } = useFeedback();

  // Request State
  const [query, setQuery] = useState<string>(variant.query || '');
  const [variablesStr, setVariablesStr] = useState<string>(() => {
    return JSON.stringify(variant.defaultVariables || {}, null, 2);
  });
  const [headers, setHeaders] = useState<Array<{ id: string; key: string; value: string }>>(() => {
    const custom = variant.customHeaders || {};
    return Object.entries(custom).map(([k, v], idx) => ({
      id: `h-${idx}-${Date.now().toString(36)}`,
      key: k,
      value: String(v)
    }));
  });
  const [validations, setValidations] = useState<CustomValidation[]>(() => {
    return variant.customValidations || [];
  });

  // Simulator Context State (for {{cartId}}, {{customerToken}}, etc.)
  const [contextCartId, setContextCartId] = useState<string>('');
  const [contextToken, setContextToken] = useState<string>('');
  const [contextOrderNumber, setContextOrderNumber] = useState<string>('');
  const [customContextVars, setCustomContextVars] = useState<Array<{ id: string; key: string; value: string }>>([]);

  // Active Tabs
  const [activeReqTab, setActiveReqTab] = useState<RequestTab>('query');
  const [activeResTab, setActiveResTab] = useState<ResponseTab>('response');

  // Environments
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [selectedEnvId, setSelectedEnvId] = useState<string>(variant.environmentId || '');

  useEffect(() => {
    api.getEnvironments().then(envs => {
      setEnvironments(envs);
      const targetEnv = envs.find(e => e.id === selectedEnvId) || envs[0];
      if (targetEnv?.variables) {
        if (!contextCartId && (targetEnv.variables.CartId || targetEnv.variables.cartId)) {
          setContextCartId(targetEnv.variables.CartId || targetEnv.variables.cartId || '');
        }
        if (!contextToken && (targetEnv.variables.customerToken || targetEnv.variables.token)) {
          setContextToken(targetEnv.variables.customerToken || targetEnv.variables.token || '');
        }
        if (!contextOrderNumber && (targetEnv.variables.orderNumber || targetEnv.variables.order_number)) {
          setContextOrderNumber(targetEnv.variables.orderNumber || targetEnv.variables.order_number || '');
        }
        const reserved = ['cartid', 'customertoken', 'token', 'authtoken', 'ordernumber', 'cart_id', 'order_number', 'customer_token'];
        const otherVars: Array<{ id: string; key: string; value: string }> = [];
        Object.entries(targetEnv.variables).forEach(([k, v], idx) => {
          if (!reserved.includes(k.toLowerCase().replace(/[-_]/g, '')) && v !== undefined && v !== null) {
            otherVars.push({
              id: `ctx-${k}-${idx}`,
              key: k,
              value: String(v)
            });
          }
        });
        if (otherVars.length > 0) {
          setCustomContextVars(otherVars);
        }
      }
    }).catch(console.error);
  }, []);

  const handleSelectEnvironment = (envId: string) => {
    setSelectedEnvId(envId);
    const env = environments.find(e => e.id === envId);
    if (env?.variables) {
      if (env.variables.CartId || env.variables.cartId) {
        setContextCartId(env.variables.CartId || env.variables.cartId || '');
      }
      if (env.variables.customerToken || env.variables.token) {
        setContextToken(env.variables.customerToken || env.variables.token || '');
      }
      if (env.variables.orderNumber || env.variables.order_number) {
        setContextOrderNumber(env.variables.orderNumber || env.variables.order_number || '');
      }
      const reserved = ['cartid', 'customertoken', 'token', 'authtoken', 'ordernumber', 'cart_id', 'order_number', 'customer_token'];
      const otherVars: Array<{ id: string; key: string; value: string }> = [];
      Object.entries(env.variables).forEach(([k, v], idx) => {
        if (!reserved.includes(k.toLowerCase().replace(/[-_]/g, '')) && v !== undefined && v !== null) {
          otherVars.push({
            id: `ctx-${k}-${idx}`,
            key: k,
            value: String(v)
          });
        }
      });
      setCustomContextVars(otherVars);
    }
  };

  // Lock body scroll and handle Escape key
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Execution State
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [executionResult, setExecutionResult] = useState<StepExecutionResult | null>(null);
  const [hasExecuted, setHasExecuted] = useState<boolean>(false);
  const [responseSearch, setResponseSearch] = useState<string>('');
  const [copiedRes, setCopiedRes] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Dirty detection
  const isQueryDirty = query !== (variant.query || '');
  const isEnvDirty = selectedEnvId !== (variant.environmentId || '');
  const isVariablesDirty = (() => {
    try {
      const orig = JSON.stringify(variant.defaultVariables || {});
      const curr = JSON.stringify(JSON.parse(variablesStr || '{}'));
      return orig !== curr;
    } catch {
      return true;
    }
  })();
  const isDirty = isQueryDirty || isVariablesDirty || isEnvDirty;

  // Execute Request (Cmd+Enter or button)
  const handleExecute = async () => {
    if (isRunning) return;

    // Validate variables JSON
    let parsedVariables: Record<string, any> = {};
    if (variablesStr.trim()) {
      try {
        parsedVariables = JSON.parse(variablesStr);
      } catch (err: any) {
        toast('El JSON de Variables contiene errores de sintaxis', 'error');
        setActiveReqTab('variables');
        return;
      }
    }

    // Prepare headers object
    const customHeadersObj: Record<string, string> = {};
    headers.forEach(h => {
      if (h.key.trim()) {
        customHeadersObj[h.key.trim()] = h.value;
      }
    });

    // Prepare custom context variables
    const extraVars: Record<string, any> = {};
    customContextVars.forEach(c => {
      if (c.key.trim()) {
        extraVars[c.key.trim()] = c.value;
      }
    });

    const stepConfig: FlowStepConfig = {
      id: `step-test-${Date.now().toString(36)}`,
      category: variant.category,
      variantId: variant.id,
      environmentId: selectedEnvId || variant.environmentId || undefined,
      skipped: false,
      query,
      endpoint: variant.endpoint,
      body: variant.body,
      method: variant.method,
      apiType: variant.apiType,
      overrideVariables: parsedVariables,
      customHeaders: customHeadersObj,
      contextMapping: variant.contextMapping,
      customValidations: validations
    };

    const simulatedContext: Partial<ExecutionContext> = {
      cartId: contextCartId.trim() || undefined,
      token: contextToken.trim() || undefined,
      orderNumber: contextOrderNumber.trim() || undefined,
      variables: extraVars
    };

    setIsRunning(true);
    try {
      // Execute without writing to global history benchmarks to keep playground clean
      const res = await api.executeStep(stepConfig, simulatedContext, undefined, false);
      setExecutionResult(res.stepResult);
      setHasExecuted(true);

      // Auto update context if step returned extracted variables (e.g. cartId or token)
      if (res.updatedContext?.cartId) {
        setContextCartId(res.updatedContext.cartId);
      }
      if (res.updatedContext?.token) {
        setContextToken(res.updatedContext.token);
      }
      if (res.updatedContext?.orderNumber) {
        setContextOrderNumber(res.updatedContext.orderNumber);
      }

      // Update customContextVars with other extracted variables
      if (res.stepResult.extractedVariables && Object.keys(res.stepResult.extractedVariables).length > 0) {
        setCustomContextVars(prev => {
          const map = new Map(prev.map(v => [v.key, v.value]));
          for (const [k, val] of Object.entries(res.stepResult.extractedVariables || {})) {
            if (!['cartid', 'token', 'customertoken', 'ordernumber'].includes(k.toLowerCase())) {
              map.set(k, String(val));
            }
          }
          return Array.from(map.entries()).map(([k, v], idx) => ({
            id: `ctx-${k}-${idx}`,
            key: k,
            value: v
          }));
        });
      }

      // Refresh environments from server so client cache reflects the saved environment variables
      api.getEnvironments().then(setEnvironments).catch(console.error);

      const extractedKeys = Object.keys(res.stepResult.extractedVariables || {});
      const varsSummary = extractedKeys.length > 0 ? ` · Variables guardadas: ${extractedKeys.join(', ')}` : '';

      // If test failed, switch to tests tab to see what failed
      const failed = (res.stepResult.testResults || []).filter(t => !t.passed);
      if (failed.length > 0) {
        setActiveResTab('tests');
        toast(`Petición completada con ${failed.length} validación(es) fallida(s)${varsSummary}`, 'error');
      } else if (res.stepResult.status >= 200 && res.stepResult.status < 300 && (!res.stepResult.errors || res.stepResult.errors.length === 0)) {
        toast(`Petición 200 OK (${res.stepResult.durationMs}ms)${varsSummary}`, 'success');
      } else {
        toast(`Respuesta con errores (HTTP ${res.stepResult.status})${varsSummary}`, 'error');
      }
    } catch (err: any) {
      toast(`Error al ejecutar: ${err.message}`, 'error');
    } finally {
      setIsRunning(false);
    }
  };

  // Keyboard shortcut: Cmd + Enter / Ctrl + Enter to execute
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleExecute();
      }
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [query, variablesStr, headers, validations, contextCartId, contextToken, contextOrderNumber, customContextVars, isRunning]);

  // Format Code Helper
  const handlePrettifyAll = () => {
    if (variant.apiType !== 'REST') {
      const formattedQ = formatGraphQL(query);
      if (formattedQ.formatted) {
        setQuery(formattedQ.formatted);
      }
    }
    if (variablesStr.trim()) {
      try {
        const parsed = JSON.parse(variablesStr);
        setVariablesStr(JSON.stringify(parsed, null, 2));
      } catch {
        // ignore
      }
    }
    toast('Código formateado correctamente', 'success');
  };

  // Save changes back to Variant
  const handleSaveToVariant = async () => {
    let parsedVariables: Record<string, any> = {};
    if (variablesStr.trim()) {
      try {
        parsedVariables = JSON.parse(variablesStr);
      } catch (err: any) {
        toast('Corrige la sintaxis JSON de Variables antes de guardar', 'error');
        setActiveReqTab('variables');
        return;
      }
    }

    const customHeadersObj: Record<string, string> = {};
    headers.forEach(h => {
      if (h.key.trim()) {
        customHeadersObj[h.key.trim()] = h.value;
      }
    });

    setIsSaving(true);
    try {
      const updated = await api.updateVariant(variant.id, {
        query,
        defaultVariables: parsedVariables,
        customHeaders: customHeadersObj,
        customValidations: validations,
        environmentId: selectedEnvId || null
      });
      toast(`Variante "${variant.name}" actualizada con los cambios`, 'success');
      if (onVariantUpdated) {
        onVariantUpdated(updated);
      }
    } catch (err: any) {
      toast(`Error al guardar en variante: ${err.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Copy response
  const handleCopyResponse = () => {
    if (!executionResult) return;
    const bodyText = JSON.stringify(
      executionResult.errors && executionResult.errors.length > 0
        ? { errors: executionResult.errors }
        : { data: executionResult.responsePreview },
      null,
      2
    );
    navigator.clipboard.writeText(bodyText);
    setCopiedRes(true);
    setTimeout(() => setCopiedRes(false), 2000);
    toast('Respuesta copiada al portapapeles', 'info');
  };

  // Formatted response text
  const responseFormatted = useMemo(() => {
    if (!executionResult) return '';
    const payload = executionResult.errors && executionResult.errors.length > 0
      ? { errors: executionResult.errors, data: executionResult.responsePreview }
      : { data: executionResult.responsePreview };
    return JSON.stringify(payload, null, 2);
  }, [executionResult]);

  // Response filter
  const filteredResponseLines = useMemo(() => {
    if (!responseFormatted) return [];
    const lines = responseFormatted.split('\n');
    if (!responseSearch.trim()) return lines;
    const s = responseSearch.toLowerCase();
    return lines.filter(l => l.toLowerCase().includes(s));
  }, [responseFormatted, responseSearch]);

  const testResults = executionResult?.testResults || [];
  const passedTestsCount = testResults.filter(t => t.passed).length;
  const failedTestsCount = testResults.filter(t => !t.passed).length;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex flex-col bg-slate-900/80 backdrop-blur-md overflow-hidden animate-in fade-in duration-200">
      {/* Top Header Bar */}
      <div className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between shrink-0 shadow-xs z-10">
        {/* Left: Branding & Variant Metadata */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
              <FlaskConical className="w-4 h-4" />
            </span>
            <span className="font-bold text-sm text-slate-900 dark:text-slate-100 hidden sm:inline">
              GraphiQL · Sandbox
            </span>
          </div>

          <div className="h-4 w-px bg-slate-200 dark:border-slate-800 hidden sm:block" />

          {/* Variant Name & Category */}
          <div className="flex items-center gap-1.5 truncate">
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 truncate">
              {variant.category}
            </span>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
              {variant.name}
            </span>
            {variant.apiType === 'REST' ? (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                REST · {variant.method || 'POST'}
              </span>
            ) : (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                GraphQL
              </span>
            )}

            {/* Environment Picker */}
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-300 ml-1">
              <Globe className="w-3 h-3 text-blue-500 shrink-0" />
              <select
                value={selectedEnvId}
                onChange={e => handleSelectEnvironment(e.target.value)}
                className="bg-transparent text-[11px] font-semibold text-blue-700 dark:text-blue-300 focus:outline-none cursor-pointer max-w-[130px] truncate"
                title="Entorno destino para esta prueba"
              >
                <option value="" className="text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900">
                  (Entorno Activo)
                </option>
                {environments.map(e => (
                  <option key={e.id} value={e.id} className="text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900">
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Center / Right: Actions & Execute Button */}
        <div className="flex items-center gap-2">
          {/* Format button */}
          <button
            onClick={handlePrettifyAll}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors"
            title="Formatear Query y Variables"
          >
            <Sparkles className="w-3.5 h-3.5 text-orange-500" />
            <span className="hidden md:inline">Formatear</span>
          </button>

          {/* Save to Variant button */}
          <button
            onClick={handleSaveToVariant}
            disabled={isSaving}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              isDirty
                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20 shadow-xs ring-1 ring-amber-500/20'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
            title="Guardar cambios editados directamente en la variante"
          >
            <Save className="w-3.5 h-3.5 text-amber-500" />
            <span className="hidden md:inline">Guardar en Variante</span>
            {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
          </button>

          {/* Big Prominent Execute Button */}
          <button
            onClick={handleExecute}
            disabled={isRunning}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md shadow-emerald-500/20 active:scale-95 transition-all disabled:opacity-50"
            title="Ejecutar petición (⌘+Enter / Ctrl+Enter)"
          >
            {isRunning ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-white" />
            )}
            <span>Ejecutar</span>
            <span className="text-[10px] opacity-75 font-mono hidden lg:inline ml-0.5">⌘↵</span>
          </button>

          {/* Close button */}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ml-1"
            title="Cerrar Playground (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Split Body */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 overflow-hidden bg-slate-50 dark:bg-slate-950">
        {/* ================= LEFT COLUMN: REQUEST ================= */}
        <div className="flex flex-col border-r border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
          {/* Request Navigation Tabs */}
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-3 bg-slate-50 dark:bg-slate-950/60 shrink-0">
            <div className="flex items-center gap-1 overflow-x-auto py-1.5">
              <button
                onClick={() => setActiveReqTab('query')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeReqTab === 'query'
                    ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs border border-slate-200 dark:border-slate-800'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>{variant.apiType === 'REST' ? 'Body / Query' : 'Query GraphQL'}</span>
              </button>

              <button
                onClick={() => setActiveReqTab('variables')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeReqTab === 'variables'
                    ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs border border-slate-200 dark:border-slate-800'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Variable className="w-3.5 h-3.5" />
                <span>Variables</span>
              </button>

              <button
                onClick={() => setActiveReqTab('headers')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeReqTab === 'headers'
                    ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs border border-slate-200 dark:border-slate-800'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Headers</span>
                {headers.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-800 font-mono">
                    {headers.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveReqTab('context')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeReqTab === 'context'
                    ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs border border-slate-200 dark:border-slate-800'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Contexto Simulado</span>
                {(contextCartId || contextToken || contextOrderNumber) && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                )}
              </button>

              <button
                onClick={() => setActiveReqTab('validations')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeReqTab === 'validations'
                    ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs border border-slate-200 dark:border-slate-800'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Validaciones</span>
                {validations.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-purple-500/20 text-purple-600 dark:text-purple-400 font-mono">
                    {validations.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Request Tab Contents */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col">
            {/* TAB 1: QUERY */}
            {activeReqTab === 'query' && (
              <div className="flex-1 flex flex-col space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Edita tu operación GraphQL en tiempo real:</span>
                  <span className="font-mono text-[11px] text-slate-400">Atajo: ⌘+Enter ejecuta</span>
                </div>
                <div className="flex-1 flex flex-col min-h-[350px]">
                  <CodeEditor
                    value={query}
                    onChange={setQuery}
                    language={variant.apiType === 'REST' ? 'json' : 'graphql'}
                    environmentId={selectedEnvId}
                    expandedHeight="100%"
                    compactHeight="100%"
                    defaultExpanded={true}
                    className="flex-1 h-full"
                  />
                </div>
              </div>
            )}

            {/* TAB 2: VARIABLES */}
            {activeReqTab === 'variables' && (
              <div className="flex-1 flex flex-col space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Variables GraphQL (Formato JSON):</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-slate-400">Pills rápidas:</span>
                    <button
                      onClick={() => {
                        setVariablesStr(prev => {
                          try {
                            const parsed = JSON.parse(prev || '{}');
                            parsed.cartId = '{{cartId}}';
                            return JSON.stringify(parsed, null, 2);
                          } catch {
                            return prev;
                          }
                        });
                      }}
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-600 dark:text-orange-400 hover:bg-orange-500/20"
                    >
                      + {"{{cartId}}"}
                    </button>
                    <button
                      onClick={() => {
                        setVariablesStr(prev => {
                          try {
                            const parsed = JSON.parse(prev || '{}');
                            parsed.token = '{{customerToken}}';
                            return JSON.stringify(parsed, null, 2);
                          } catch {
                            return prev;
                          }
                        });
                      }}
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
                    >
                      + {"{{customerToken}}"}
                    </button>
                  </div>
                </div>

                {/* 60% Editor Variables / 40% JSON con Tipado del Schema */}
                <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-3.5 min-h-[350px]">
                  <div className="lg:col-span-3 flex flex-col h-full">
                    <CodeEditor
                      value={variablesStr}
                      onChange={setVariablesStr}
                      language="json"
                      graphqlQuery={query}
                      environmentId={selectedEnvId}
                      expandedHeight="100%"
                      compactHeight="100%"
                      defaultExpanded={true}
                      className="flex-1 h-full"
                    />
                  </div>

                  <div className="lg:col-span-2 flex flex-col h-full">
                    <TypedSchemaJsonViewer
                      query={query}
                      onCopyAllToEditor={setVariablesStr}
                      height="100%"
                      className="flex-1 h-full"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: HEADERS */}
            {activeReqTab === 'headers' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Headers Personalizados de la Variante
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Se envían junto a la petición. Soportan interpolación con variables: `{"{{customerToken}}"}`.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setHeaders(prev => [
                        ...prev,
                        { id: `h-${Date.now().toString(36)}`, key: '', value: '' }
                      ]);
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-800"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Agregar Header</span>
                  </button>
                </div>

                {headers.length === 0 ? (
                  <div className="p-6 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-slate-400 text-xs">
                    Sin headers personalizados configurados. (Se aplicarán los del Entorno Activo).
                  </div>
                ) : (
                  <div className="space-y-2">
                    {headers.map(h => (
                      <div key={h.id} className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Header (ej. Store, Authorization)"
                          value={h.key}
                          onChange={e => {
                            const val = e.target.value;
                            setHeaders(prev => prev.map(item => item.id === h.id ? { ...item, key: val } : item));
                          }}
                          className="flex-1 px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-orange-500"
                        />
                        <input
                          type="text"
                          placeholder="Valor (ej. default, Bearer {{customerToken}})"
                          value={h.value}
                          onChange={e => {
                            const val = e.target.value;
                            setHeaders(prev => prev.map(item => item.id === h.id ? { ...item, value: val } : item));
                          }}
                          className="flex-1 px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-orange-500"
                        />
                        <button
                          onClick={() => setHeaders(prev => prev.filter(item => item.id !== h.id))}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: CONTEXTO SIMULADO */}
            {activeReqTab === 'context' && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Valores de Contexto Simulado
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Útiles si tu mutación o variables usan sustitución como `{"{{cartId}}"}` o `{"{{customerToken}}"}`.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Cart ID (`{"{{cartId}}"}`):
                    </label>
                    <input
                      type="text"
                      placeholder="ej. pP9dI9kP10xZ..."
                      value={contextCartId}
                      onChange={e => setContextCartId(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-orange-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Customer Token (`{"{{customerToken}}"}`):
                    </label>
                    <input
                      type="text"
                      placeholder="ej. eyJhbGciOi..."
                      value={contextToken}
                      onChange={e => setContextToken(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-orange-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Order Number (`{"{{orderNumber}}"}`):
                    </label>
                    <input
                      type="text"
                      placeholder="ej. 000000042"
                      value={contextOrderNumber}
                      onChange={e => setContextOrderNumber(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                {/* Custom extra variables */}
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Otras variables de contexto personalizadas:
                    </span>
                    <button
                      onClick={() => setCustomContextVars(prev => [...prev, { id: `ctx-${Date.now().toString(36)}`, key: '', value: '' }])}
                      className="text-xs text-orange-600 dark:text-orange-400 font-semibold hover:underline flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Variable</span>
                    </button>
                  </div>
                  {customContextVars.map(c => (
                    <div key={c.id} className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Nombre (ej. sku)"
                        value={c.key}
                        onChange={e => {
                          const val = e.target.value;
                          setCustomContextVars(prev => prev.map(item => item.id === c.id ? { ...item, key: val } : item));
                        }}
                        className="w-1/3 px-3 py-1 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                      />
                      <input
                        type="text"
                        placeholder="Valor (ej. 24-MB01)"
                        value={c.value}
                        onChange={e => {
                          const val = e.target.value;
                          setCustomContextVars(prev => prev.map(item => item.id === c.id ? { ...item, value: val } : item));
                        }}
                        className="flex-1 px-3 py-1 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                      />
                      <button
                        onClick={() => setCustomContextVars(prev => prev.filter(item => item.id !== c.id))}
                        className="p-1 text-slate-400 hover:text-rose-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 5: VALIDACIONES */}
            {activeReqTab === 'validations' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Reglas de Validación Personalizadas
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Se comprueban automáticamente sobre la respuesta en cada ejecución.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setValidations(prev => [
                        ...prev,
                        {
                          id: `val-${Date.now().toString(36)}`,
                          type: 'JSON_PATH_EXISTS',
                          name: 'Existe valor',
                          targetPath: 'data.',
                          expectedValue: '',
                          enabled: true
                        }
                      ]);
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Agregar Validación</span>
                  </button>
                </div>

                {validations.length === 0 ? (
                  <div className="p-6 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-slate-400 text-xs">
                    Sin validaciones personalizadas. (Solo se verificarán las pruebas globales 200 OK y sin errores).
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {validations.map((v, idx) => (
                      <div
                        key={v.id || idx}
                        className="p-3 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <select
                            value={v.type}
                            onChange={e => {
                              const t = e.target.value as ValidationType;
                              setValidations(prev => prev.map((item, i) => i === idx ? { ...item, type: t } : item));
                            }}
                            className="px-2 py-1 text-xs font-semibold rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                          >
                            <option value="JSON_PATH_EXISTS">Existe valor en JSONPath</option>
                            <option value="JSON_PATH_EQUALS">Valor en JSONPath es igual a...</option>
                            <option value="JSON_PATH_NOT_EMPTY">Campo no está vacío</option>
                            <option value="STATUS_CODE">Código HTTP</option>
                            <option value="NO_GRAPHQL_ERRORS">Sin errores GraphQL</option>
                            <option value="CONTAINS_STRING">Respuesta contiene texto</option>
                            <option value="RESPONSE_TIME_UNDER">Tiempo de respuesta menor a (ms)</option>
                          </select>
                          <button
                            onClick={() => setValidations(prev => prev.filter((_, i) => i !== idx))}
                            className="p-1 text-slate-400 hover:text-rose-500"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="text"
                            placeholder="Ruta JSONPath (ej: cart.id o items[0].id)"
                            value={v.targetPath || ''}
                            onChange={e => {
                              const val = e.target.value;
                              setValidations(prev => prev.map((item, i) => i === idx ? { ...item, targetPath: val } : item));
                            }}
                            className="px-2.5 py-1 text-xs font-mono rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                          />
                          {(v.type === 'JSON_PATH_EQUALS' || v.type === 'STATUS_CODE') && (
                            <input
                              type="text"
                              placeholder="Valor esperado (ej: {{cartId}} o 200)"
                              value={v.expectedValue || ''}
                              onChange={e => {
                                const val = e.target.value;
                                setValidations(prev => prev.map((item, i) => i === idx ? { ...item, expectedValue: val } : item));
                              }}
                              className="px-2.5 py-1 text-xs font-mono rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ================= RIGHT COLUMN: RESPONSE & RESULTS ================= */}
        <div className="flex flex-col overflow-hidden bg-white dark:bg-slate-900">
          {/* Response Status & Subheader Bar */}
          <div className="h-10 border-b border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between shrink-0 bg-slate-50 dark:bg-slate-950/60">
            {/* Status pills */}
            <div className="flex items-center gap-2">
              {hasExecuted && executionResult ? (
                <>
                  <span
                    className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                      executionResult.status >= 200 && executionResult.status < 300 && (!executionResult.errors || executionResult.errors.length === 0)
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    <span>HTTP {executionResult.status}</span>
                  </span>

                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                    {executionResult.durationMs}ms
                  </span>

                  {testResults.length > 0 && (
                    <span
                      className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md border ${
                        failedTestsCount === 0
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                          : 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800'
                      }`}
                    >
                      {passedTestsCount}/{testResults.length} pruebas
                    </span>
                  )}
                </>
              ) : (
                <span className="text-xs text-slate-400 italic">
                  Esperando ejecución...
                </span>
              )}
            </div>

            {/* Quick Actions */}
            {hasExecuted && executionResult && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleCopyResponse}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  title="Copiar JSON de respuesta"
                >
                  {copiedRes ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-500">Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Response Navigation Tabs */}
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-3 bg-slate-50 dark:bg-slate-950/40 shrink-0">
            <div className="flex items-center gap-1 overflow-x-auto py-1.5">
              <button
                onClick={() => setActiveResTab('response')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeResTab === 'response'
                    ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs border border-slate-200 dark:border-slate-800'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <ArrowDownLeft className="w-3.5 h-3.5" />
                <span>Respuesta JSON</span>
              </button>

              <button
                onClick={() => setActiveResTab('tests')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeResTab === 'tests'
                    ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs border border-slate-200 dark:border-slate-800'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Validaciones</span>
                {testResults.length > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      failedTestsCount > 0 ? 'bg-rose-500 text-white' : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {testResults.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveResTab('extracted')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeResTab === 'extracted'
                    ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs border border-slate-200 dark:border-slate-800'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Variable className="w-3.5 h-3.5" />
                <span>Variables Capturadas</span>
              </button>

              <button
                onClick={() => setActiveResTab('requestPayload')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeResTab === 'requestPayload'
                    ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs border border-slate-200 dark:border-slate-800'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>Petición Enviada</span>
              </button>
            </div>

            {/* Quick search inside response */}
            {activeResTab === 'response' && hasExecuted && (
              <div className="relative w-40 sm:w-48 my-1">
                <Search className="w-3 h-3 absolute left-2 top-2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar en JSON..."
                  value={responseSearch}
                  onChange={e => setResponseSearch(e.target.value)}
                  className="w-full pl-7 pr-2 py-1 text-[11px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500 font-mono"
                />
              </div>
            )}
          </div>

          {/* Response Body Area */}
          <div className="flex-1 overflow-auto p-4 flex flex-col">
            {!hasExecuted || !executionResult ? (
              // Empty GraphiQL State
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-400 space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-500 border border-orange-500/20">
                  <FlaskConical className="w-8 h-8" />
                </div>
                <div className="max-w-sm space-y-1">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Playground Listo
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Edita la petición GraphQL o variables a la izquierda y presiona <strong className="text-emerald-600 dark:text-emerald-400">Ejecutar</strong> o usa el atajo <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[10px]">⌘+Enter</kbd> para probarla en vivo.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* TAB 1: RESPONSE JSON */}
                {activeResTab === 'response' && (
                  <div className="flex-1 flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 overflow-hidden">
                    <div className="flex-1 overflow-auto p-3 font-mono text-xs text-slate-900 dark:text-orange-300 leading-5 whitespace-pre">
                      {responseSearch.trim() ? (
                        filteredResponseLines.length > 0 ? (
                          filteredResponseLines.join('\n')
                        ) : (
                          <span className="text-slate-400 italic">No se encontraron líneas con "{responseSearch}"</span>
                        )
                      ) : (
                        responseFormatted
                      )}
                    </div>
                  </div>
                )}

                {/* TAB 2: TESTS / VALIDATIONS */}
                {activeResTab === 'tests' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700 dark:text-slate-300">
                        Resultados de Pruebas ({testResults.length})
                      </span>
                      <span className="text-slate-400 text-[11px]">
                        {failedTestsCount === 0 ? '¡Todas superadas!' : `${failedTestsCount} fallo(s)`}
                      </span>
                    </div>

                    {testResults.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No se ejecutaron validaciones.</p>
                    ) : (
                      <div className="space-y-2">
                        {testResults.map(t => (
                          <div
                            key={t.id}
                            className={`p-3 rounded-xl border transition-all text-xs flex items-start justify-between gap-3 ${
                              t.passed
                                ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60'
                                : 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/60'
                            }`}
                          >
                            <div className="flex items-start gap-2.5">
                              {t.passed ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                              ) : (
                                <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                              )}
                              <div className="space-y-1">
                                <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                  <span>{t.name}</span>
                                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-normal">
                                    {t.source}
                                  </span>
                                </div>
                                <p className="text-slate-600 dark:text-slate-300 text-[11px]">
                                  {t.message}
                                </p>
                                {(t.expected !== undefined || t.actual !== undefined) && (
                                  <div className="pt-1 text-[10px] font-mono flex items-center gap-3 text-slate-500">
                                    {t.expected !== undefined && (
                                      <span>Esperado: <strong className="text-slate-700 dark:text-slate-300">{String(t.expected)}</strong></span>
                                    )}
                                    {t.actual !== undefined && (
                                      <span>Recibido: <strong className="text-slate-700 dark:text-slate-300">{String(t.actual)}</strong></span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            <span
                              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md ${
                                t.passed
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                              }`}
                            >
                              {t.passed ? 'PASSED' : 'FAILED'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 3: EXTRACTED VARIABLES */}
                {activeResTab === 'extracted' && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Variables Capturadas en el Contexto
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Valores que esta variante extrajo de la respuesta y guardó para los siguientes pasos.
                    </p>

                    {executionResult.extractedVariables && Object.keys(executionResult.extractedVariables).length > 0 ? (
                      <div className="bg-slate-50 dark:bg-slate-950 rounded-xl p-3 border border-slate-200 dark:border-slate-800 space-y-2">
                        {Object.entries(executionResult.extractedVariables).map(([k, v]) => (
                          <div key={k} className="flex items-center justify-between text-xs font-mono py-1 border-b border-slate-100 dark:border-slate-800/80 last:border-none">
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">{k}:</span>
                            <span className="text-slate-800 dark:text-slate-200 truncate max-w-xs">{JSON.stringify(v)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic">No se extrajeron variables en esta ejecución.</p>
                    )}
                  </div>
                )}

                {/* TAB 4: REQUEST PAYLOAD */}
                {activeResTab === 'requestPayload' && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Petición HTTP Enviada al Servidor
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Inspecciona los headers interpolados, la URL exacta y el payload despachado.
                    </p>

                    <div className="space-y-3">
                      <div>
                        <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                          Endpoint:
                        </span>
                        <div className="bg-slate-50 dark:bg-slate-950 p-2 rounded-lg border border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-700 dark:text-slate-300 truncate">
                          {executionResult.requestPayload?.method || 'POST'} {executionResult.requestPayload?.url || 'Magento Endpoint'}
                        </div>
                      </div>

                      <div>
                        <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                          Headers HTTP Enviados:
                        </span>
                        <pre className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800 font-mono text-[11px] text-slate-700 dark:text-slate-300 overflow-x-auto">
                          {JSON.stringify(executionResult.requestPayload?.headers || {}, null, 2)}
                        </pre>
                      </div>

                      <div>
                        <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                          Variables Enviadas:
                        </span>
                        <pre className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800 font-mono text-[11px] text-slate-700 dark:text-slate-300 overflow-x-auto">
                          {JSON.stringify(executionResult.requestPayload?.variables || {}, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
