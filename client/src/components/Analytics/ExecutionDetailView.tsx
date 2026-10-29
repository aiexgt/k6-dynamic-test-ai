import React, { useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Copy,
  Check
} from 'lucide-react';
import { FlowExecutionResponse, StepExecutionResult } from '../../types';
import { useFeedback } from '../../context/FeedbackContext';

interface ExecutionDetailViewProps {
  execution: FlowExecutionResponse;
  onBack: () => void;
}

export const ExecutionDetailView: React.FC<ExecutionDetailViewProps> = ({ execution, onBack }) => {
  const { toast } = useFeedback();
  const [selectedStepIndex, setSelectedStepIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<'tests' | 'request' | 'response' | 'variables'>('tests');
  const [copied, setCopied] = useState(false);

  const steps = execution.steps || [];
  const currentStep: StepExecutionResult | undefined = steps[selectedStepIndex];

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast('Copiado al portapapeles', 'info');
    setTimeout(() => setCopied(false), 2000);
  };

  const totalTests = (execution.totalTestsPassed || 0) + (execution.totalTestsFailed || 0);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Volver a Métricas</span>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                  execution.executionType === 'SINGLE'
                    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                    : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                }`}
              >
                {execution.executionType === 'SINGLE' ? 'Petición Individual' : 'Flujo Completo'}
              </span>
              <h1 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {execution.targetName || 'Ejecución'}
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              ID: <span className="font-mono">{execution.id}</span> • Entorno: <strong className="text-slate-700 dark:text-slate-300">{execution.environmentName || 'Default'}</strong> • Fecha: {execution.createdAt ? new Date(execution.createdAt).toLocaleString() : 'N/A'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`px-3 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
              execution.status === 'SUCCESS'
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
            }`}
          >
            {execution.status === 'SUCCESS' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
            <span>{execution.status}</span>
          </span>
        </div>
      </div>

      {/* KPI Cards Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Latencia Total</span>
          <div className="mt-1 flex items-baseline gap-1 text-slate-900 dark:text-slate-100 font-mono font-bold text-xl text-orange-600 dark:text-orange-400">
            {execution.totalTimeMs} <span className="text-xs text-slate-400 font-normal">ms</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Peticiones Hechas</span>
          <div className="mt-1 flex items-baseline gap-1 text-slate-900 dark:text-slate-100 font-mono font-bold text-xl">
            {steps.length} <span className="text-xs text-slate-400 font-normal">reqs</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Pruebas & Aserciones</span>
          <div className="mt-1 flex items-baseline gap-1 font-mono font-bold text-xl">
            <span className="text-emerald-600 dark:text-emerald-400">{execution.totalTestsPassed ?? 0}</span>
            <span className="text-xs text-slate-400 font-normal">/ {totalTests} pasadas</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Orden Generada</span>
          <div className="mt-1 font-mono font-bold text-sm text-slate-800 dark:text-slate-200 truncate">
            {execution.orderNumber ? (
              <span className="text-emerald-600 dark:text-emerald-400">#{execution.orderNumber}</span>
            ) : (
              <span className="text-slate-400 font-normal">Ninguna</span>
            )}
          </div>
        </div>
      </div>

      {execution.errorMessage && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs text-rose-600 dark:text-rose-400">
          <strong>Error de Ejecución:</strong> {execution.errorMessage}
        </div>
      )}

      {/* Main Breakdown: Steps List on Left/Top and Step Inspector on Right */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Step Selector List */}
        <div className="space-y-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block px-1">
            Peticiones Realizadas ({steps.length})
          </span>

          <div className="space-y-1.5">
            {steps.map((st, idx) => {
              const isSelected = idx === selectedStepIndex;
              const hasErr = !!(st.errors && st.errors.length > 0) || st.status >= 400;
              const testsCount = st.testResults?.length || 0;
              const testsPassed = st.testResults?.filter(t => t.passed).length || 0;

              return (
                <button
                  key={st.stepId || idx}
                  onClick={() => setSelectedStepIndex(idx)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${
                    isSelected
                      ? 'border-orange-500 bg-orange-50/20 dark:bg-orange-950/20 shadow-sm ring-1 ring-orange-500/30'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                      {idx + 1}. {st.variantName}
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                        hasErr
                          ? 'bg-rose-500/10 text-rose-600'
                          : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      HTTP {st.status}
                    </span>
                  </div>

                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                    <span className="truncate max-w-[120px]">{st.category}</span>
                    <div className="flex items-center gap-2">
                      {testsCount > 0 && (
                        <span className={testsPassed === testsCount ? 'text-emerald-500' : 'text-amber-500'}>
                          {testsPassed}/{testsCount} tests
                        </span>
                      )}
                      <span className="text-orange-600 dark:text-orange-400 font-bold">{st.durationMs}ms</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step Inspector Panel */}
        <div className="md:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden flex flex-col">
          {currentStep ? (
            <>
              {/* Step Top Bar */}
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {currentStep.variantName}
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    Categoría: {currentStep.category} • Duración: {currentStep.durationMs} ms
                  </p>
                </div>

                {/* Inspection Tabs */}
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
                  <button
                    onClick={() => setActiveTab('tests')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                      activeTab === 'tests'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                    }`}
                  >
                    Pruebas ({currentStep.testResults?.length || 0})
                  </button>
                  <button
                    onClick={() => setActiveTab('request')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                      activeTab === 'request'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                    }`}
                  >
                    Petición
                  </button>
                  <button
                    onClick={() => setActiveTab('response')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                      activeTab === 'response'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                    }`}
                  >
                    Respuesta
                  </button>
                  <button
                    onClick={() => setActiveTab('variables')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                      activeTab === 'variables'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                    }`}
                  >
                    Variables
                  </button>
                </div>
              </div>

              {/* Tab Contents */}
              <div className="p-4 flex-1 overflow-y-auto max-h-[600px]">
                {/* 1. TESTS TAB */}
                {activeTab === 'tests' && (
                  <div className="space-y-3">
                    {(!currentStep.testResults || currentStep.testResults.length === 0) ? (
                      <div className="py-8 text-center text-xs text-slate-400">
                        No se registraron pruebas para esta petición.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {currentStep.testResults.map(test => (
                          <div
                            key={test.id}
                            className={`p-3 rounded-xl border flex items-start gap-3 ${
                              test.passed
                                ? 'bg-emerald-50/20 dark:bg-emerald-950/10 border-emerald-500/20'
                                : 'bg-rose-50/30 dark:bg-rose-950/20 border-rose-500/30'
                            }`}
                          >
                            <div className="mt-0.5">
                              {test.passed ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                              ) : (
                                <XCircle className="w-4 h-4 text-rose-500" />
                              )}
                            </div>

                            <div className="flex-1 space-y-0.5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                                  {test.name}
                                </span>
                                <span
                                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                                    test.passed
                                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                      : 'bg-rose-500/10 text-rose-600'
                                  }`}
                                >
                                  {test.passed ? 'PASÓ' : 'FALLÓ'}
                                </span>
                              </div>
                              <p className="text-xs text-slate-600 dark:text-slate-400">
                                {test.message}
                              </p>
                              {test.actual !== undefined && (
                                <div className="text-[11px] font-mono text-slate-400 pt-1">
                                  Valor obtenido: <span className="text-slate-700 dark:text-slate-300 font-bold">{String(test.actual)}</span>
                                  {test.expected !== undefined && (
                                    <> • Esperado: <span className="text-slate-700 dark:text-slate-300">{String(test.expected)}</span></>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 2. REQUEST TAB */}
                {activeTab === 'request' && (
                  <div className="space-y-4">
                    {currentStep.requestPayload?.url && (
                      <div>
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide block mb-1">
                          Endpoint
                        </span>
                        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-800 dark:text-slate-200">
                          POST {currentStep.requestPayload.url}
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                          Headers Enviados
                        </span>
                        <button
                          onClick={() => handleCopy(JSON.stringify(currentStep.requestPayload?.headers || {}, null, 2))}
                          className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center gap-1"
                        >
                          {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          <span>Copiar</span>
                        </button>
                      </div>
                      <pre className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-800 dark:text-slate-200 overflow-x-auto">
                        {JSON.stringify(currentStep.requestPayload?.headers || {}, null, 2)}
                      </pre>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                          GraphQL Query Procesada
                        </span>
                        <button
                          onClick={() => handleCopy(currentStep.requestPayload?.query || '')}
                          className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center gap-1"
                        >
                          <Copy className="w-3 h-3" />
                          <span>Copiar</span>
                        </button>
                      </div>
                      <pre className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-800 dark:text-slate-200 overflow-x-auto whitespace-pre-wrap">
                        {currentStep.requestPayload?.query || 'Sin query'}
                      </pre>
                    </div>

                    <div>
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide block mb-1">
                        Variables Enviadas
                      </span>
                      <pre className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-800 dark:text-slate-200 overflow-x-auto">
                        {JSON.stringify(currentStep.requestPayload?.variables || {}, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}

                {/* 3. RESPONSE TAB */}
                {activeTab === 'response' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                        Cuerpo de Respuesta JSON
                      </span>
                      <button
                        onClick={() => handleCopy(JSON.stringify(currentStep.responsePreview || {}, null, 2))}
                        className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center gap-1"
                      >
                        {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        <span>Copiar JSON</span>
                      </button>
                    </div>
                    <pre className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-800 dark:text-slate-200 overflow-x-auto max-h-[450px]">
                      {JSON.stringify(currentStep.responsePreview || {}, null, 2)}
                    </pre>
                  </div>
                )}

                {/* 4. VARIABLES TAB */}
                {activeTab === 'variables' && (
                  <div className="space-y-4">
                    <div>
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide block mb-1">
                        Variables Extraídas &amp; Guardadas en Contexto
                      </span>
                      {(!currentStep.extractedVariables || Object.keys(currentStep.extractedVariables).length === 0) ? (
                        <div className="py-4 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                          No se extrajeron variables en esta petición.
                        </div>
                      ) : (
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs space-y-1">
                          {Object.entries(currentStep.extractedVariables).map(([k, v]) => (
                            <div key={k} className="flex items-center gap-2">
                              <span className="text-orange-500 font-bold">{k}:</span>
                              <span className="text-slate-800 dark:text-slate-200">{String(v)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="py-12 text-center text-xs text-slate-400">
              Selecciona una petición de la lista para ver su detalle.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
