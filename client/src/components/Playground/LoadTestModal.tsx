import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Play,
  Square,
  Users,
  Gauge,
  BarChart3,
  Download,
  CheckCircle2,
  Flame,
  Activity,
  FileCode
} from 'lucide-react';
import {
  FlowStepConfig,
  Variant,
  ExecutionContext,
  CsvDataset,
  LoadTestMetrics
} from '../../types';
import { api } from '../../api';
import { useFeedback } from '../../context/FeedbackContext';

interface LoadTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  flowName: string;
  steps: FlowStepConfig[];
  variants: Variant[];
  dataset?: CsvDataset;
  initialContext?: ExecutionContext;
  debugMode?: boolean;
  onNavigateToMetrics?: (executionId?: string) => void;
}

export const LoadTestModal: React.FC<LoadTestModalProps> = ({
  isOpen,
  onClose,
  flowName,
  steps,
  variants,
  dataset,
  initialContext,
  debugMode = false,
  onNavigateToMetrics
}) => {
  const { toast } = useFeedback();

  // Configuration State
  const [vus, setVus] = useState<number>(5);
  const [mode, setMode] = useState<'ITERATIONS' | 'DURATION'>('ITERATIONS');
  const [iterationsPerVu, setIterationsPerVu] = useState<number>(3);
  const [durationSeconds, setDurationSeconds] = useState<number>(20);
  const [rampUpSeconds, setRampUpSeconds] = useState<number>(0);
  const [thinkTimeMs, setThinkTimeMs] = useState<number>(200);

  // Execution Running State
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [completedRequests, setCompletedRequests] = useState<number>(0);
  const [successfulRequests, setSuccessfulRequests] = useState<number>(0);
  const [failedRequests, setFailedRequests] = useState<number>(0);
  const [activeVusCount, setActiveVusCount] = useState<number>(0);
  const [elapsedTimeMs, setElapsedTimeMs] = useState<number>(0);
  const [durationsList, setDurationsList] = useState<number[]>([]);
  const [lastHistoryId, setLastHistoryId] = useState<string | null>(null);
  const [logs, setLogs] = useState<Array<{ id: string; time: string; vu: number; message: string; isError?: boolean }>>([]);

  const abortRef = useRef<boolean>(false);
  const timerRef = useRef<any>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      abortRef.current = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  if (!isOpen) return null;

  const activeSteps = steps.filter(s => !s.skipped && s.variantId);

  // Compute live percentiles & statistics
  const computeMetrics = (durations: number[], totalReqs: number, succReqs: number, failReqs: number, elapsedMs: number): LoadTestMetrics => {
    const sorted = [...durations].sort((a, b) => a - b);
    const n = sorted.length;
    const p = (pct: number) => {
      if (n === 0) return 0;
      const index = Math.min(Math.floor((pct / 100) * n), n - 1);
      return Math.round(sorted[index]);
    };

    const sum = sorted.reduce((acc, d) => acc + d, 0);
    const avg = n > 0 ? Math.round(sum / n) : 0;
    const rps = elapsedMs > 0 ? Number(((totalReqs / (elapsedMs / 1000))).toFixed(1)) : 0;

    return {
      vus,
      totalRequests: totalReqs,
      successfulRequests: succReqs,
      failedRequests: failReqs,
      durationMs: elapsedMs,
      rps,
      p50Ms: p(50),
      p90Ms: p(90),
      p95Ms: p(95),
      p99Ms: p(99),
      avgMs: avg,
      minMs: sorted[0] || 0,
      maxMs: sorted[n - 1] || 0
    };
  };

  const currentMetrics = computeMetrics(durationsList, completedRequests, successfulRequests, failedRequests, elapsedTimeMs);

  const startLoadTest = async () => {
    if (activeSteps.length === 0) {
      toast('El flujo no contiene pasos activos para ejecutar', 'error');
      return;
    }

    abortRef.current = false;
    setIsRunning(true);
    setIsCompleted(false);
    setCompletedRequests(0);
    setSuccessfulRequests(0);
    setFailedRequests(0);
    setActiveVusCount(vus);
    setDurationsList([]);
    setLogs([]);
    setLastHistoryId(null);

    startTimeRef.current = performance.now();
    timerRef.current = setInterval(() => {
      setElapsedTimeMs(Math.round(performance.now() - startTimeRef.current));
    }, 200);

    let totalDone = 0;
    let totalSuccess = 0;
    let totalFail = 0;
    const durationsCollector: number[] = [];

    // Worker execution for each Virtual User (VU)
    const runVuWorker = async (vuId: number) => {
      let iteration = 0;

      // Ramp-up delay for this VU if rampUpSeconds > 0
      if (rampUpSeconds > 0 && vus > 1) {
        const staggerDelay = (vuId / (vus - 1)) * (rampUpSeconds * 1000);
        await new Promise(r => setTimeout(r, staggerDelay));
      }

      while (!abortRef.current) {
        iteration++;
        // Check mode condition
        if (mode === 'ITERATIONS' && iteration > iterationsPerVu) {
          break;
        }
        if (mode === 'DURATION') {
          const runElapsedSec = (performance.now() - startTimeRef.current) / 1000;
          if (runElapsedSec >= durationSeconds) {
            break;
          }
        }

        // Initialize execution context for this VU iteration
        let vuCtx: ExecutionContext = {
          cartId: initialContext?.cartId || null,
          token: initialContext?.token || null,
          orderNumber: null,
          variables: { ...(initialContext?.variables || {}) },
          logs: []
        };

        // If dataset has rows, pick a row for this VU iteration
        if (dataset && dataset.rows && dataset.rows.length > 0) {
          const row = dataset.rows[(iteration - 1) % dataset.rows.length];
          vuCtx.variables = { ...vuCtx.variables, ...row };
        }

        let vuIterationSuccess = true;

        // Run steps sequentially for this virtual user
        for (let sIdx = 0; sIdx < activeSteps.length; sIdx++) {
          if (abortRef.current) break;

          const step = activeSteps[sIdx];
          const stepStart = performance.now();
          try {
            const res = await api.executeStep(
              { ...step, debugMode },
              vuCtx,
              { debugMode },
              false // No saturar cada paso individual en el historial durante load test
            );

            const duration = Math.round(performance.now() - stepStart);
            durationsCollector.push(duration);
            totalDone++;
            setCompletedRequests(totalDone);
            setDurationsList([...durationsCollector]);

            vuCtx = res.updatedContext;
            const failedTests = res.stepResult.testResults?.filter(t => !t.passed) || [];
            const isOk = res.status === 'SUCCESS' && failedTests.length === 0 && res.stepResult.status < 400;

            if (isOk) {
              totalSuccess++;
              setSuccessfulRequests(totalSuccess);
            } else {
              totalFail++;
              setFailedRequests(totalFail);
              vuIterationSuccess = false;
            }

            // Step sleep if defined
            if (step.sleepMs && step.sleepMs > 0 && !abortRef.current) {
              await new Promise(r => setTimeout(r, step.sleepMs));
            }
          } catch (stepErr: any) {
            totalDone++;
            totalFail++;
            setCompletedRequests(totalDone);
            setFailedRequests(totalFail);
            vuIterationSuccess = false;
            break;
          }
        }

        // Add to log stream
        const timeStr = new Date().toLocaleTimeString();
        setLogs(prev => [
          {
            id: `log-${Date.now()}-${Math.random()}`,
            time: timeStr,
            vu: vuId + 1,
            message: `VU #${vuId + 1} completó iteración ${iteration} ${vuIterationSuccess ? '✅ Exitosa' : '❌ Con fallos'}`,
            isError: !vuIterationSuccess
          },
          ...prev.slice(0, 40)
        ]);

        // Think time between iterations
        if (thinkTimeMs > 0 && !abortRef.current) {
          await new Promise(r => setTimeout(r, thinkTimeMs));
        }
      }
    };

    // Run all VUs concurrently
    const vuPromises = Array.from({ length: vus }, (_, i) => runVuWorker(i));
    await Promise.all(vuPromises);

    clearInterval(timerRef.current);
    const finalElapsed = Math.round(performance.now() - startTimeRef.current);
    setElapsedTimeMs(finalElapsed);
    setIsRunning(false);
    setIsCompleted(true);
    setActiveVusCount(0);

    const finalMetrics = computeMetrics(durationsCollector, totalDone, totalSuccess, totalFail, finalElapsed);

    // Save load test run into History
    try {
      const recorded = await api.recordFlowHistory({
        flowName: `${flowName} [Prueba de Carga: ${vus} VUs]`,
        status: totalFail === 0 ? 'SUCCESS' : 'FAILED',
        totalTimeMs: finalElapsed,
        failedAtCategory: totalFail > 0 ? 'Concurrencia / Carga' : null,
        errorMessage: totalFail > 0 ? `${totalFail} de ${totalDone} peticiones fallaron bajo carga` : undefined,
        steps: [
          {
            category: 'Resumen de Carga k6',
            variantId: 'load-test',
            variantName: `${vus} Usuarios Concurrentes`,
            durationMs: finalMetrics.avgMs,
            status: totalFail === 0 ? 200 : 500,
            testResults: [
              {
                id: 'k6-p95',
                name: 'Latencia p95 <= 2000ms',
                passed: finalMetrics.p95Ms <= 2000,
                source: 'GLOBAL',
                message: `p95 registrado: ${finalMetrics.p95Ms}ms`
              },
              {
                id: 'k6-error-rate',
                name: 'Tasa de errores < 5%',
                passed: totalDone > 0 ? (totalFail / totalDone) < 0.05 : true,
                source: 'GLOBAL',
                message: `Tasa de errores: ${totalDone > 0 ? ((totalFail / totalDone) * 100).toFixed(1) : 0}%`
              }
            ]
          }
        ]
      });

      if (recorded?.id) {
        setLastHistoryId(recorded.id);
      }
      toast('Prueba de carga completada y registrada en Métricas', 'success');
    } catch (saveErr) {
      console.error('Error guardando métricas de carga:', saveErr);
    }
  };

  const handleAbort = () => {
    abortRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRunning(false);
    setIsCompleted(true);
    setActiveVusCount(0);
    toast('Prueba de carga interrumpida', 'info');
  };

  // Generate official k6 standalone JS script
  const generateK6Script = (): string => {
    const k6StepsCode = activeSteps.map((step, idx) => {
      const v = variants.find(vr => vr.id === step.variantId);
      const isRest = v?.apiType === 'REST' || step.apiType === 'REST';
      const method = (step.method || v?.method || (isRest ? 'GET' : 'POST')).toLowerCase();
      const customUrl = step.customUrl || v?.customUrl;
      const targetUrl = customUrl ? `"${customUrl}"` : (isRest ? '`${__ENV.MAGENTO_REST_URL || "https://app.kosmos.test/rest/V1"}`' : '`${__ENV.MAGENTO_URL || "https://app.kosmos.test/graphql"}`');
      const payloadObj = isRest
        ? (step.body || v?.body || '{}')
        : JSON.stringify({ query: step.query || v?.query || '', variables: step.overrideVariables || v?.defaultVariables || {} }, null, 2);

      return `
    // Paso ${idx + 1}: ${v?.name || step.category}
    {
      const res = http.${isRest && method === 'get' ? 'get' : 'post'}(
        ${targetUrl},
        ${isRest && method === 'get' ? 'null' : `'${payloadObj.replace(/'/g, "\\'")}'`},
        {
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': \`Bearer \${token}\` } : {}),
            ${debugMode ? "'Cookie': 'XDEBUG_SESSION=PHPSTORM'," : ''}
          }
        }
      );

      check(res, {
        'status is 200': (r) => r.status === 200,
        'duration < 2000ms': (r) => r.timings.duration < 2000,
      });

      // Extraer datos si aplica
      try {
        const body = JSON.parse(res.body);
        if (body.data && body.data.cart && body.data.cart.id) {
          cartId = body.data.cart.id;
        }
      } catch (e) {}

      ${step.sleepMs ? `sleep(${step.sleepMs / 1000});` : ''}
    }`;
    }).join('\n');

    return `// ====================================================================
// Script oficial de k6 generado automáticamente desde Flow Runner
// Flujo: ${flowName}
// ====================================================================

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    ${rampUpSeconds > 0 ? `{ duration: '${rampUpSeconds}s', target: ${vus} },` : ''}
    { duration: '${mode === 'DURATION' ? `${durationSeconds}s` : '30s'}', target: ${vus} },
    { duration: '5s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<3000'],
    http_req_failed: ['rate<0.05'],
  },
};

export default function () {
  let cartId = '';
  let token = '';

  ${k6StepsCode}

  sleep(${thinkTimeMs / 1000});
}
`;
  };

  const handleDownloadK6Script = () => {
    const script = generateK6Script();
    const blob = new Blob([script], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `k6-${flowName.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}.js`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Script k6 descargado con éxito. Ejecútalo con: k6 run <archivo>.js', 'success');
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-[95vw] max-w-6xl h-[90vh] max-h-[90vh] flex flex-col shadow-2xl overflow-hidden transition-colors">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>Prueba de Carga & Concurrencia (Multi-Usuario / k6)</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-mono font-bold">
                  {flowName}
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Simula tráfico de usuarios concurrentes en tiempo real y genera scripts nativos de k6
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadK6Script}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 text-xs font-semibold transition-colors shadow-2xs"
              title="Descargar script de k6 oficial ejecutable en consola"
            >
              <FileCode className="w-3.5 h-3.5 text-indigo-500" />
              <span>Exportar k6 (.js)</span>
            </button>

            <button
              onClick={onClose}
              disabled={isRunning}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 1. Configuration Panel */}
          <div className="bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-4.5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Gauge className="w-4 h-4 text-indigo-500" />
                <span>Parámetros de Simulación de Carga</span>
              </span>
              {isRunning && (
                <span className="flex items-center gap-1.5 text-xs font-bold text-amber-500 animate-pulse">
                  <Flame className="w-4 h-4" />
                  <span>Ejecutando con {activeVusCount} VUs activas</span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
              {/* Virtual Users */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Usuarios (VUs):
                  </label>
                  <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{vus} VUs</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="50"
                  disabled={isRunning}
                  value={vus}
                  onChange={e => setVus(Number(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer disabled:opacity-50"
                />
              </div>

              {/* Mode Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                  Modo de Parada:
                </label>
                <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
                  <button
                    disabled={isRunning}
                    onClick={() => setMode('ITERATIONS')}
                    className={`flex-1 py-1 text-xs font-semibold rounded-lg transition-all ${
                      mode === 'ITERATIONS'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Iteraciones
                  </button>
                  <button
                    disabled={isRunning}
                    onClick={() => setMode('DURATION')}
                    className={`flex-1 py-1 text-xs font-semibold rounded-lg transition-all ${
                      mode === 'DURATION'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Duración (s)
                  </button>
                </div>
              </div>

              {/* Target iterations / seconds */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                  {mode === 'ITERATIONS' ? 'Iteraciones por VU:' : 'Duración de Carga (s):'}
                </label>
                {mode === 'ITERATIONS' ? (
                  <input
                    type="number"
                    min="1"
                    max="100"
                    disabled={isRunning}
                    value={iterationsPerVu}
                    onChange={e => setIterationsPerVu(Math.max(1, Number(e.target.value)))}
                    className="w-full px-3 py-1.5 text-xs font-mono font-bold rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 disabled:opacity-50"
                  />
                ) : (
                  <input
                    type="number"
                    min="5"
                    max="300"
                    disabled={isRunning}
                    value={durationSeconds}
                    onChange={e => setDurationSeconds(Math.max(5, Number(e.target.value)))}
                    className="w-full px-3 py-1.5 text-xs font-mono font-bold rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 disabled:opacity-50"
                  />
                )}
              </div>

              {/* Ramp-up (s) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                  Ramp-up (s):
                </label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  disabled={isRunning}
                  value={rampUpSeconds}
                  onChange={e => setRampUpSeconds(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-1.5 text-xs font-mono font-bold rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 disabled:opacity-50"
                />
              </div>

              {/* Think Time between iterations */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                  Pausa / Think Time (ms):
                </label>
                <input
                  type="number"
                  min="0"
                  max="5000"
                  step="50"
                  disabled={isRunning}
                  value={thinkTimeMs}
                  onChange={e => setThinkTimeMs(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-1.5 text-xs font-mono font-bold rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 disabled:opacity-50"
                />
              </div>
              </div>
            </div>

            {/* Launch / Stop Controls */}
            <div className="pt-2 flex items-center justify-between">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {mode === 'ITERATIONS'
                  ? `Se realizarán aprox. ${vus * iterationsPerVu * activeSteps.length} peticiones HTTP en total.`
                  : `Se generará tráfico constante durante ${durationSeconds} segundos con ${vus} usuarios concurrentes.`}
              </div>

              <div className="flex items-center gap-2">
                {isRunning ? (
                  <button
                    onClick={handleAbort}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-md animate-pulse"
                  >
                    <Square className="w-4 h-4 fill-current" />
                    <span>Detener Carga</span>
                  </button>
                ) : (
                  <button
                    onClick={startLoadTest}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/30 hover:scale-[1.02]"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Iniciar Prueba de Carga</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 2. Real-time Metrics HUD */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <span className="text-[11px] font-semibold text-slate-400 block mb-1">Peticiones Totales</span>
              <div className="text-xl font-bold font-mono text-slate-900 dark:text-white">
                {completedRequests}
              </div>
              <span className="text-[10px] text-emerald-500 font-semibold">{successfulRequests} exitosas</span>
            </div>

            <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <span className="text-[11px] font-semibold text-slate-400 block mb-1">RPS (Throughput)</span>
              <div className="text-xl font-bold font-mono text-indigo-600 dark:text-indigo-400">
                {currentMetrics.rps} <span className="text-xs font-normal">req/s</span>
              </div>
              <span className="text-[10px] text-slate-400 font-semibold">{(elapsedTimeMs / 1000).toFixed(1)}s transcurridos</span>
            </div>

            <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <span className="text-[11px] font-semibold text-slate-400 block mb-1">Latencia Media</span>
              <div className="text-xl font-bold font-mono text-orange-600 dark:text-orange-400">
                {currentMetrics.avgMs} <span className="text-xs font-normal">ms</span>
              </div>
              <span className="text-[10px] text-slate-400 font-semibold">Min: {currentMetrics.minMs}ms</span>
            </div>

            <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <span className="text-[11px] font-semibold text-slate-400 block mb-1">Latencia p95</span>
              <div className={`text-xl font-bold font-mono ${currentMetrics.p95Ms > 2000 ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {currentMetrics.p95Ms} <span className="text-xs font-normal">ms</span>
              </div>
              <span className="text-[10px] text-slate-400 font-semibold">p90: {currentMetrics.p90Ms}ms</span>
            </div>

            <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <span className="text-[11px] font-semibold text-slate-400 block mb-1">Latencia p99</span>
              <div className="text-xl font-bold font-mono text-purple-600 dark:text-purple-400">
                {currentMetrics.p99Ms} <span className="text-xs font-normal">ms</span>
              </div>
              <span className="text-[10px] text-slate-400 font-semibold">Max: {currentMetrics.maxMs}ms</span>
            </div>

            <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <span className="text-[11px] font-semibold text-slate-400 block mb-1">Tasa de Fallos</span>
              <div className={`text-xl font-bold font-mono ${failedRequests > 0 ? 'text-rose-600' : 'text-slate-900 dark:text-white'}`}>
                {completedRequests > 0 ? ((failedRequests / completedRequests) * 100).toFixed(1) : 0}%
              </div>
              <span className="text-[10px] text-rose-500 font-semibold">{failedRequests} errores</span>
            </div>
          </div>

          {/* 3. Action on Finished & Live Log Stream */}
          {isCompleted && (
            <div className="p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60 flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-200">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <div>
                  <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200 block">
                    ¡Prueba de Carga Finalizada con Éxito!
                  </span>
                  <p className="text-[11px] text-indigo-800/80 dark:text-indigo-300">
                    Se procesaron {completedRequests} peticiones en {(elapsedTimeMs / 1000).toFixed(1)}s con {currentMetrics.rps} RPS promedio.
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
                  onClick={handleDownloadK6Script}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-md"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Descargar k6 (.js)</span>
                </button>
              </div>
            </div>
          )}

          {/* Activity Stream */}
          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-indigo-500" />
              <span>Transmisión en Vivo de Usuarios Virtuales</span>
            </span>

            <div className="h-44 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-900 text-slate-200 p-3 font-mono text-[11px] space-y-1">
              {logs.length === 0 ? (
                <div className="text-slate-500 italic py-8 text-center">
                  Presiona "Iniciar Prueba de Carga" para ver las peticiones de los usuarios concurrentes en tiempo real...
                </div>
              ) : (
                logs.map(log => (
                  <div key={log.id} className="flex items-center justify-between gap-2 border-b border-slate-800/60 pb-0.5">
                    <span className="text-slate-500 text-[10px]">[{log.time}]</span>
                    <span className={`flex-1 truncate ${log.isError ? 'text-rose-400 font-bold' : 'text-emerald-400'}`}>
                      {log.message}
                    </span>
                    <span className="text-slate-500 text-[10px]">Worker #{log.vu}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>,
    document.body
  );
};
