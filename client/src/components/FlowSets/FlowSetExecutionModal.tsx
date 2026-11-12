import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Play,
  CheckCircle2,
  XCircle,
  BarChart3,
  ListOrdered,
  Square,
  Clock,
  Layers
} from 'lucide-react';
import { FlowSet, SavedFlow, Variant, FlowExecutionResponse, StepExecutionResult, ExecutionContext } from '../../types';
import { api } from '../../api';
import { useFeedback } from '../../context/FeedbackContext';

interface FlowSetExecutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  flowSet: FlowSet;
  allFlows: SavedFlow[];
  variants?: Variant[];
  debugMode?: boolean;
  onNavigateToMetrics?: (executionId?: string) => void;
}

export const FlowSetExecutionModal: React.FC<FlowSetExecutionModalProps> = ({
  isOpen,
  onClose,
  flowSet,
  allFlows,
  debugMode = false,
  onNavigateToMetrics
}) => {
  const { toast } = useFeedback();

  // Execution States
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [currentFlowIndex, setCurrentFlowIndex] = useState<number>(0);
  const [flowStatuses, setFlowStatuses] = useState<Record<string, 'pending' | 'running' | 'success' | 'failed'>>({});
  const [flowResults, setFlowResults] = useState<FlowExecutionResponse[]>([]);
  const [lastHistoryId, setLastHistoryId] = useState<string | null>(null);
  const [totalElapsedTimeMs, setTotalElapsedTimeMs] = useState<number>(0);

  const abortRef = useRef<boolean>(false);
  const timerRef = useRef<any>(null);

  const suiteFlows = flowSet.flowIds
    .map(id => allFlows.find(f => f.id === id))
    .filter((f): f is SavedFlow => Boolean(f));

  useEffect(() => {
    return () => {
      abortRef.current = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  if (!isOpen) return null;

  const startSequentialExecution = async () => {
    if (suiteFlows.length === 0) {
      toast('El set no tiene flujos válidos para ejecutar', 'error');
      return;
    }

    abortRef.current = false;
    setIsRunning(true);
    setIsCompleted(false);
    setCurrentFlowIndex(0);
    setFlowResults([]);
    setLastHistoryId(null);

    const initialStatuses: Record<string, 'pending' | 'running' | 'success' | 'failed'> = {};
    suiteFlows.forEach(f => {
      initialStatuses[f.id] = 'pending';
    });
    setFlowStatuses(initialStatuses);

    const startTime = performance.now();
    timerRef.current = setInterval(() => {
      setTotalElapsedTimeMs(Math.round(performance.now() - startTime));
    }, 200);

    const resultsCollector: FlowExecutionResponse[] = [];
    const allExecutedStepsAcrossFlows: StepExecutionResult[] = [];
    let suiteFailed = false;

    // EXECUTE SEQUENTIALLY: ONE AFTER THE OTHER (NO TODOS AL MISMO TIEMPO)
    for (let fIdx = 0; fIdx < suiteFlows.length; fIdx++) {
      if (abortRef.current) break;

      const flow = suiteFlows[fIdx];
      setCurrentFlowIndex(fIdx);
      setFlowStatuses(prev => ({ ...prev, [flow.id]: 'running' }));

      // Prepare context for this flow
      let flowCtx: ExecutionContext = {
        cartId: null,
        token: null,
        orderNumber: null,
        variables: {},
        logs: []
      };

      const flowSteps = (flow.steps || []).filter(s => !s.skipped && s.variantId);
      const flowExecutedSteps: StepExecutionResult[] = [];
      let flowIsOk = true;
      let flowOrderNumber: string | null = null;
      let failedCat: string | null = null;
      let failedErr: string | undefined = undefined;

      // Run each step in this flow sequentially
      for (let sIdx = 0; sIdx < flowSteps.length; sIdx++) {
        if (abortRef.current) break;

        const step = flowSteps[sIdx];
        try {
          const stepResp = await api.executeStep(
            { ...step, debugMode },
            flowCtx,
            { debugMode },
            false
          );

          flowCtx = stepResp.updatedContext;
          if (flowCtx.orderNumber) flowOrderNumber = flowCtx.orderNumber;

          const taggedStep: StepExecutionResult = {
            ...stepResp.stepResult,
            category: `[${flow.name}] ${stepResp.stepResult.category}`
          };
          flowExecutedSteps.push(taggedStep);
          allExecutedStepsAcrossFlows.push(taggedStep);

          const failedTests = stepResp.stepResult.testResults?.filter(t => !t.passed) || [];
          const stepFailed = stepResp.status !== 'SUCCESS' || failedTests.length > 0 || stepResp.stepResult.status >= 400;

          if (stepFailed) {
            flowIsOk = false;
            failedCat = stepResp.stepResult.category;
            failedErr = stepResp.stepResult.errors?.[0]?.message || 'Error en validaciones de paso';
            break;
          }

          // Step sleep if defined
          const effectiveStepSleep = step.sleepMs || flow.defaultDelayMs || 0;
          if (effectiveStepSleep > 0 && sIdx < flowSteps.length - 1 && !abortRef.current) {
            await new Promise(r => setTimeout(r, effectiveStepSleep));
          }
        } catch (stepErr: any) {
          flowIsOk = false;
          failedCat = step.category;
          failedErr = stepErr.message;
          break;
        }
      }

      const flowDuration = flowExecutedSteps.reduce((acc, s) => acc + (s.durationMs || 0), 0);
      const flowStatus = flowIsOk ? 'SUCCESS' : 'FAILED';
      setFlowStatuses(prev => ({ ...prev, [flow.id]: flowIsOk ? 'success' : 'failed' }));

      const singleFlowResponse: FlowExecutionResponse = {
        id: `flow-res-${Date.now().toString(36)}-${fIdx}`,
        executionType: 'FLOW',
        targetName: flow.name,
        status: flowStatus,
        orderNumber: flowOrderNumber,
        totalTimeMs: flowDuration,
        failedAtCategory: failedCat,
        errorMessage: failedErr,
        steps: flowExecutedSteps
      };
      resultsCollector.push(singleFlowResponse);
      setFlowResults([...resultsCollector]);

      if (!flowIsOk) {
        suiteFailed = true;
        if (flowSet.stopOnFailure !== false) {
          // Stop on failure enabled: halt execution of subsequent flows
          break;
        }
      }

      // Delay between flows if defined
      const delayBetween = flowSet.delayBetweenFlowsMs !== undefined ? flowSet.delayBetweenFlowsMs : 500;
      if (delayBetween > 0 && fIdx < suiteFlows.length - 1 && !abortRef.current) {
        await new Promise(r => setTimeout(r, delayBetween));
      }
    }

    clearInterval(timerRef.current);
    const finalTotalTime = Math.round(performance.now() - startTime);
    setTotalElapsedTimeMs(finalTotalTime);
    setIsRunning(false);
    setIsCompleted(true);

    // Record Suite History
    try {
      const rec = await api.recordFlowHistory({
        flowName: `[SET] ${flowSet.name} (${suiteFlows.length} Flujos)`,
        status: suiteFailed ? 'FAILED' : 'SUCCESS',
        totalTimeMs: finalTotalTime,
        failedAtCategory: suiteFailed ? 'Flujo del Set' : null,
        errorMessage: suiteFailed ? 'Uno o más flujos del set no completaron con éxito' : undefined,
        steps: allExecutedStepsAcrossFlows
      });

      if (rec?.id) {
        setLastHistoryId(rec.id);
      }
      toast(suiteFailed ? 'Ejecución del set finalizada con fallos' : '¡Set de flujos completado con éxito! 🎉', suiteFailed ? 'error' : 'success');
    } catch (recErr) {
      console.error('Error registrando historial de set:', recErr);
    }
  };

  const handleAbort = () => {
    abortRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRunning(false);
    setIsCompleted(true);
    toast('Ejecución del set interrumpida', 'info');
  };

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-[94vw] max-w-5xl h-[88vh] max-h-[88vh] flex flex-col shadow-2xl overflow-hidden transition-colors">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-orange-600 flex items-center justify-center text-white shadow-md shadow-orange-600/30">
              <ListOrdered className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>Ejecutar Set de Flujos en Secuencia</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 font-mono font-bold">
                  {flowSet.name}
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Los flujos se ejecutan secuencialmente uno tras otro ({suiteFlows.length} flujos en cola)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isRunning}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Status Banner */}
          <div className="bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold font-mono ${
                isRunning
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-pulse'
                  : isCompleted
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}>
                {isRunning ? `EJECUTANDO [${currentFlowIndex + 1}/${suiteFlows.length}]` : isCompleted ? 'SET COMPLETADO' : 'LISTO PARA EJECUTAR'}
              </span>

              <div className="text-xs font-mono text-slate-600 dark:text-slate-300">
                Tiempo: <strong className="text-orange-600 dark:text-orange-400">{totalElapsedTimeMs}ms</strong>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isRunning ? (
                <button
                  onClick={handleAbort}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-md animate-pulse"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Detener</span>
                </button>
              ) : (
                <button
                  onClick={startSequentialExecution}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition-all shadow-md shadow-orange-600/30"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{isCompleted ? 'Reejecutar Set' : 'Iniciar Set'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Sequential Flows Queue */}
          <div className="space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-orange-500" />
              <span>Flujos en Secuencia ({suiteFlows.length})</span>
            </span>

            <div className="space-y-2">
              {suiteFlows.map((flow, idx) => {
                const status = flowStatuses[flow.id] || 'pending';
                const result = flowResults.find(r => r.targetName === flow.name);

                return (
                  <div
                    key={flow.id}
                    className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                      status === 'running'
                        ? 'border-orange-500 bg-orange-50/30 dark:bg-orange-950/20 ring-2 ring-orange-500/20 shadow-xs'
                        : status === 'success'
                        ? 'border-emerald-500/40 bg-emerald-50/10 dark:bg-emerald-950/10'
                        : status === 'failed'
                        ? 'border-rose-500/40 bg-rose-50/10 dark:bg-rose-950/10'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="text-xs font-mono font-bold text-slate-400 w-6 text-center">
                        #{idx + 1}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                            {flow.name}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            ({flow.steps?.length || 0} pasos)
                          </span>
                        </div>
                        {result?.orderNumber && (
                          <span className="text-[11px] font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                            Orden #{result.orderNumber}
                          </span>
                        )}
                        {result?.errorMessage && (
                          <span className="text-[11px] text-rose-500 truncate block">
                            {result.errorMessage}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {status === 'running' && (
                        <span className="flex items-center gap-1 text-xs font-bold text-orange-600 dark:text-orange-400 animate-pulse">
                          <Clock className="w-3.5 h-3.5" />
                          <span>En curso...</span>
                        </span>
                      )}
                      {status === 'success' && (
                        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>{result?.totalTimeMs || 0}ms</span>
                        </div>
                      )}
                      {status === 'failed' && (
                        <div className="flex items-center gap-1.5 text-xs font-bold text-rose-600 dark:text-rose-400">
                          <XCircle className="w-4 h-4" />
                          <span>Falló</span>
                        </div>
                      )}
                      {status === 'pending' && (
                        <span className="text-xs font-semibold text-slate-400">En espera</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Result Banner when finished */}
          {isCompleted && (
            <div className="p-4 rounded-2xl bg-orange-50/60 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800/60 flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-200">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-orange-600 dark:text-orange-400 shrink-0" />
                <div>
                  <span className="text-xs font-bold text-orange-950 dark:text-orange-200 block">
                    Secuencia Finalizada
                  </span>
                  <p className="text-[11px] text-orange-800/80 dark:text-orange-300">
                    Se completaron los flujos del set en {totalElapsedTimeMs}ms totales.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {onNavigateToMetrics && (
                  <button
                    onClick={() => {
                      onClose();
                      onNavigateToMetrics(lastHistoryId || undefined);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition-all shadow-md"
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    <span>Ver en Métricas</span>
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
