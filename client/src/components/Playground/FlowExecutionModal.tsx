import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  RotateCcw,
  Check,
  AlertTriangle,
  Copy,
  ExternalLink
} from 'lucide-react';
import { FlowStepConfig, Variant, StepExecutionResult, ExecutionContext, FlowExecutionResponse, CsvDataset } from '../../types';
import { api } from '../../api';

interface FlowExecutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  flowName: string;
  steps: FlowStepConfig[];
  variants: Variant[];
  dataset?: CsvDataset;
  initialContext?: ExecutionContext;
  onExecutionComplete: (
    result: FlowExecutionResponse,
    stepResultsMap: Record<string, StepExecutionResult>,
    finalContext: ExecutionContext
  ) => void;
  onInspectStep?: (stepResult: StepExecutionResult) => void;
}

// Compute natural zigzag climbing waypoints on the snowy mountain flank
function getMountainWaypoints(totalSteps: number): { x: number; y: number }[] {
  if (totalSteps <= 0) return [];
  if (totalSteps === 1) return [{ x: 505, y: 185 }];

  return Array.from({ length: totalSteps }, (_, i) => {
    const t = i / (totalSteps - 1); // 0 at base, 1 at summit
    // Y ascends from 690 (mountain base) to 185 (summit flag)
    const y = 690 - t * (690 - 185);

    // X moves from right base (~760) towards central summit (505)
    const baseX = 760 - t * (760 - 505);

    // Zigzag oscillation that tapers off near the summit
    const zigzagFreq = totalSteps > 4 ? 3 : 2;
    const oscillation = Math.sin(t * Math.PI * zigzagFreq) * 55 * (1 - t * 0.7);
    const x = Math.round(baseX + oscillation);

    return { x, y: Math.round(y) };
  });
}

export const FlowExecutionModal: React.FC<FlowExecutionModalProps> = ({
  isOpen,
  onClose,
  flowName,
  steps,
  variants,
  dataset,
  initialContext,
  onExecutionComplete,
  onInspectStep
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [currentDatasetRowIndex, setCurrentDatasetRowIndex] = useState<number>(0);
  const [datasetResults, setDatasetResults] = useState<
    Array<{
      rowIndex: number;
      rowVariables: Record<string, any>;
      status: 'SUCCESS' | 'FAILED' | 'TESTS_FAILED';
      orderNumber?: string | null;
      durationMs: number;
      errorMessage?: string;
    }>
  >([]);
  const [stepStatusMap, setStepStatusMap] = useState<Record<string, 'pending' | 'running' | 'success' | 'failed'>>({});
  const [stepResultsMap, setStepResultsMap] = useState<Record<string, StepExecutionResult>>({});
  const [currentContext, setCurrentContext] = useState<ExecutionContext>(
    initialContext || { cartId: null, token: null, orderNumber: null, variables: {}, logs: [] }
  );
  const [flowStatus, setFlowStatus] = useState<'idle' | 'running' | 'success' | 'failed'>('idle');
  const [copiedOrder, setCopiedOrder] = useState(false);
  const [failedError, setFailedError] = useState<string | null>(null);
  const [failureType, setFailureType] = useState<
    'TESTS_FAILED' | 'GRAPHQL_ERROR' | 'HTTP_ERROR' | 'CONNECTION_ERROR' | 'GENERAL_ERROR' | null
  >(null);
  const [failedStepResult, setFailedStepResult] = useState<StepExecutionResult | null>(null);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : true
  );

  useEffect(() => {
    const checkDark = () => setIsDarkMode(document.documentElement.classList.contains('dark'));
    checkDark();
    const observer = new MutationObserver(checkDark);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const activeSteps = steps.filter(s => !s.skipped && s.variantId);
  const abortControllerRef = useRef<boolean>(false);

  const waypoints = getMountainWaypoints(activeSteps.length);

  // Close with Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when modal is open to prevent background scrolling
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Start execution when modal opens
  useEffect(() => {
    if (isOpen) {
      startExecution();
    } else {
      abortControllerRef.current = true;
      setIsRunning(false);
    }
  }, [isOpen]);

  const startExecution = async () => {
    if (activeSteps.length === 0) return;

    abortControllerRef.current = false;
    setIsRunning(true);
    setFlowStatus('running');
    setFailedError(null);
    setFailureType(null);
    setFailedStepResult(null);
    setCurrentStepIndex(0);
    setDatasetResults([]);

    const rowsToRun = dataset && dataset.rows && dataset.rows.length > 0 ? dataset.rows : [{}];
    const consolidatedDatasetMetrics: typeof datasetResults = [];
    const allExecutedStepsAcrossRows: StepExecutionResult[] = [];

    let overallFinalResp: FlowExecutionResponse | null = null;
    let finalCollector: Record<string, StepExecutionResult> = {};
    let finalRunningCtx: ExecutionContext = {
      cartId: null,
      token: null,
      orderNumber: null,
      variables: {},
      logs: []
    };

    for (let rIdx = 0; rIdx < rowsToRun.length; rIdx++) {
      if (abortControllerRef.current) break;

      setCurrentDatasetRowIndex(rIdx);
      const rowVariables = rowsToRun[rIdx];

      const initialMap: Record<string, 'pending' | 'running' | 'success' | 'failed'> = {};
      activeSteps.forEach(s => {
        initialMap[s.id] = 'pending';
      });
      setStepStatusMap(initialMap);

      const resultsCollector: Record<string, StepExecutionResult> = {};
      let runningCtx: ExecutionContext = {
        cartId: null,
        token: null,
        orderNumber: null,
        variables: { ...rowVariables },
        logs: []
      };
      setCurrentContext(runningCtx);

      const executedStepsList: StepExecutionResult[] = [];
      let flowFailed = false;
      let failedCat: string | null = null;
      let failedErrMsg: string | null = null;
      const rowStart = Date.now();

      for (let i = 0; i < activeSteps.length; i++) {
        if (abortControllerRef.current) break;

        const baseStep = activeSteps[i];
        // Inject current row variables into step overrides
        const stepWithCsvVars: FlowStepConfig = {
          ...baseStep,
          overrideVariables: {
            ...(baseStep.overrideVariables || {}),
            ...rowVariables
          }
        };

        setCurrentStepIndex(i);
        setStepStatusMap(prev => ({ ...prev, [baseStep.id]: 'running' }));

        try {
          const response = await api.executeStep(stepWithCsvVars, runningCtx, undefined, false);
          if (abortControllerRef.current) break;

          resultsCollector[baseStep.id] = response.stepResult;
          
          // Formatear el nombre en el reporte para identificar la fila si hay dataset
          const rowPrefix = rowsToRun.length > 1 ? `[Fila ${rIdx + 1}] ` : '';
          const taggedStepResult: StepExecutionResult = {
            ...response.stepResult,
            category: rowPrefix + response.stepResult.category
          };

          executedStepsList.push(response.stepResult);
          allExecutedStepsAcrossRows.push(taggedStepResult);

          runningCtx = response.updatedContext;
          setCurrentContext(runningCtx);
          setStepResultsMap({ ...resultsCollector });

          const failedTests = response.stepResult.testResults?.filter(t => !t.passed) || [];
          const hasFailedTests = failedTests.length > 0;
          const hasErrors = response.stepResult.errors && response.stepResult.errors.length > 0;
          const isHttpError = response.stepResult.status >= 400 || response.stepResult.status === 0;

          const isStepOk =
            response.status === 'SUCCESS' &&
            !hasErrors &&
            !hasFailedTests &&
            !isHttpError;

          if (isStepOk) {
            setStepStatusMap(prev => ({ ...prev, [baseStep.id]: 'success' }));
          } else {
            flowFailed = true;
            failedCat = baseStep.category || 'Paso';
            setFailedStepResult(response.stepResult);

            if (hasFailedTests) {
              setFailureType('TESTS_FAILED');
              const testNames = failedTests.map(t => t.name).join(', ');
              failedErrMsg = failedTests.length === 1
                ? `No pasó la prueba: ${testNames}`
                : `No pasaron ${failedTests.length} pruebas: ${testNames}`;
            } else if (hasErrors) {
              setFailureType('GRAPHQL_ERROR');
              const errItem = response.stepResult.errors?.[0];
              failedErrMsg =
                (errItem && typeof errItem === 'object' && errItem.message ? errItem.message : null) ||
                (typeof errItem === 'string' ? errItem : null) ||
                'Error en respuesta GraphQL';
            } else if (isHttpError) {
              setFailureType('HTTP_ERROR');
              failedErrMsg = `Error HTTP ${response.stepResult.status}: Respuesta fallida del servidor`;
            } else {
              setFailureType('GENERAL_ERROR');
              failedErrMsg = 'Error al ejecutar el paso';
            }

            setStepStatusMap(prev => ({ ...prev, [baseStep.id]: 'failed' }));
            setFailedError(failedErrMsg);
            break;
          }
        } catch (err: any) {
          if (abortControllerRef.current) break;
          flowFailed = true;
          failedCat = baseStep.category || 'Paso';
          setFailureType('CONNECTION_ERROR');
          failedErrMsg = err.message || 'Error de conexión con el servicio';
          setStepStatusMap(prev => ({ ...prev, [baseStep.id]: 'failed' }));
          setFailedError(failedErrMsg);
          break;
        }
      }

      const rowDuration = Date.now() - rowStart;
      const hasFailedTests = executedStepsList.some(s => s.testResults?.some(t => !t.passed));
      const rowStatus: 'SUCCESS' | 'FAILED' | 'TESTS_FAILED' = flowFailed
        ? 'FAILED'
        : hasFailedTests
        ? 'TESTS_FAILED'
        : 'SUCCESS';

      consolidatedDatasetMetrics.push({
        rowIndex: rIdx + 1,
        rowVariables,
        status: rowStatus,
        orderNumber: runningCtx.orderNumber,
        durationMs: rowDuration,
        errorMessage: failedErrMsg || undefined
      });
      setDatasetResults([...consolidatedDatasetMetrics]);

      finalCollector = resultsCollector;
      finalRunningCtx = runningCtx;
      overallFinalResp = {
        status: rowStatus,
        orderNumber: runningCtx.orderNumber,
        totalTimeMs: rowDuration,
        failedAtCategory: failedCat,
        errorMessage: failedErrMsg || undefined,
        steps: executedStepsList
      };

      // If aborted, stop
      if (abortControllerRef.current) break;
    }

    setIsRunning(false);

    if (abortControllerRef.current) return;

    const anyFailed = consolidatedDatasetMetrics.some(m => m.status === 'FAILED');
    const anyTestsFailed = consolidatedDatasetMetrics.some(m => m.status === 'TESTS_FAILED');
    const consolidatedStatus: 'SUCCESS' | 'FAILED' | 'TESTS_FAILED' = anyFailed
      ? 'FAILED'
      : anyTestsFailed
      ? 'TESTS_FAILED'
      : 'SUCCESS';

    if (anyFailed) {
      setFlowStatus('failed');
    } else {
      setFlowStatus('success');
    }

    // Consolidated single record in History containing ALL steps executed across all dataset rows
    const totalDuration = consolidatedDatasetMetrics.reduce((acc, curr) => acc + curr.durationMs, 0);
    const lastFailed = consolidatedDatasetMetrics.find(m => m.status === 'FAILED');
    const datasetInfo = rowsToRun.length > 1 ? ` [Dataset: ${rowsToRun.length} iteraciones]` : '';

    try {
      await api.recordFlowHistory({
        flowName: (flowName || 'Flujo de Checkout') + datasetInfo,
        status: consolidatedStatus,
        orderNumber: finalRunningCtx.orderNumber,
        totalTimeMs: totalDuration,
        failedAtCategory: lastFailed ? (overallFinalResp?.failedAtCategory || 'Paso') : null,
        errorMessage: lastFailed?.errorMessage || undefined,
        steps: allExecutedStepsAcrossRows.length > 0 ? allExecutedStepsAcrossRows : (overallFinalResp?.steps || [])
      });
    } catch (recErr) {
      console.error('Error saving single consolidated flow history:', recErr);
    }

    if (overallFinalResp) {
      onExecutionComplete(
        { ...overallFinalResp, status: consolidatedStatus, totalTimeMs: totalDuration },
        finalCollector,
        finalRunningCtx
      );
    }
  };

  const handleCopyOrder = () => {
    if (currentContext.orderNumber) {
      navigator.clipboard.writeText(currentContext.orderNumber);
      setCopiedOrder(true);
      setTimeout(() => setCopiedOrder(false), 2000);
    }
  };

  if (!isOpen) return null;

  // Path SVG string connecting all waypoints
  const pathD = waypoints.length > 0
    ? waypoints.map((pt, idx) => (idx === 0 ? `M ${pt.x} ${pt.y}` : `L ${pt.x} ${pt.y}`)).join(' ')
    : '';

  // Current climber position
  const currentPt = waypoints[currentStepIndex] || waypoints[0] || { x: 505, y: 185 };

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2 sm:p-4 bg-slate-900/35 dark:bg-slate-950/85 backdrop-blur-md transition-colors duration-200">
      {/* Modal Container: exactly 95% of screen with elegant rounded corners */}
      <div className="w-[95vw] h-[95vh] max-w-[95vw] max-h-[95vh] rounded-[28px] sm:rounded-[36px] bg-slate-50 dark:bg-slate-950 border border-slate-200/90 dark:border-slate-700/60 shadow-2xl overflow-hidden flex flex-col justify-between select-none relative transition-colors duration-200">
        
        {/* Background Mountain Sky / Alpine Atmosphere */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-sky-100 via-sky-50/70 to-slate-50 dark:from-sky-950 dark:via-slate-900 dark:to-slate-950 transition-colors duration-300">
          {/* Light mode soft alpine clouds */}
          <div className="absolute inset-0 opacity-70 dark:hidden">
            <div className="absolute top-10 left-16 w-36 h-9 bg-white/80 rounded-full blur-[1px] shadow-sm" />
            <div className="absolute top-8 left-24 w-18 h-12 bg-white/80 rounded-full blur-[1px]" />
            <div className="absolute top-20 right-28 w-44 h-10 bg-white/75 rounded-full blur-[1px] shadow-sm" />
            <div className="absolute top-16 right-36 w-24 h-14 bg-white/75 rounded-full blur-[1px]" />
            <div className="absolute top-36 left-1/3 w-32 h-8 bg-white/60 rounded-full blur-[1px]" />
          </div>

          {/* Dark mode twinkling alpine stars */}
          <div className="absolute inset-0 opacity-40 hidden dark:block">
            <div className="absolute top-12 left-1/4 w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            <div className="absolute top-24 left-1/3 w-1 h-1 bg-white/70 rounded-full animate-ping" />
            <div className="absolute top-16 right-1/4 w-1.5 h-1.5 bg-amber-200/90 rounded-full animate-pulse" />
            <div className="absolute top-32 right-1/3 w-1 h-1 bg-white/60 rounded-full" />
            <div className="absolute top-48 left-16 w-1 h-1 bg-white/80 rounded-full" />
          </div>
        </div>

        {/* Top Header Bar - Minimal & Apple-clean */}
        <div className="relative z-20 px-6 sm:px-8 py-4 flex items-center justify-between backdrop-blur-md bg-white/75 dark:bg-slate-950/40 border-b border-slate-200/80 dark:border-white/5 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-orange-500/10 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-500/30 flex items-center justify-center font-bold text-xs">
              🥋
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white tracking-tight">
                {flowName || 'Flujo de Checkout'}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {flowStatus === 'success'
                  ? '¡Cima conquistada en Super Saiyajin!'
                  : flowStatus === 'failed'
                  ? 'Expedición detenida'
                  : `Ascendiendo montaña • Paso ${currentStepIndex + 1} de ${activeSteps.length}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isRunning && (
              <button
                onClick={startExecution}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 dark:bg-white/10 dark:hover:bg-white/15 text-slate-700 dark:text-slate-200 text-xs font-semibold backdrop-blur-sm border border-slate-200/80 dark:border-white/10 transition-colors shadow-sm"
                title="Reiniciar escalada"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reintentar</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white hover:bg-slate-100 dark:bg-white/10 dark:hover:bg-white/20 text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200/80 dark:border-white/10 transition-colors shadow-sm"
              title="Cerrar (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Central Interactive Mountain Canvas */}
        <div className="relative z-10 flex-1 w-full h-full flex items-center justify-center overflow-hidden">
          <svg
            viewBox="0 0 1000 800"
            className="w-full h-full max-h-[82vh] object-contain drop-shadow-2xl"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              {/* Mountain Gradient Definitions */}
              <linearGradient id="snowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="60%" stopColor="#e2f1f5" />
                <stop offset="100%" stopColor="#c5e3ea" />
              </linearGradient>

              <linearGradient id="rockDark" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#1e5c6e" />
                <stop offset="100%" stopColor="#143e4b" />
              </linearGradient>

              <linearGradient id="iceRidge" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#d5ebf1" />
                <stop offset="100%" stopColor="#89bdcb" />
              </linearGradient>

              {/* Glowing beacon filter */}
              <filter id="glowBeacon" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              {/* Super Saiyan Golden Ki Aura filter */}
              <filter id="superSaiyanAura" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
                <feColorMatrix
                  in="blur"
                  type="matrix"
                  values="1 0 0 0 1
                          0.8 0 0 0 0.8
                          0 0 0 0 0.1
                          0 0 0 1 0"
                  result="goldenGlow"
                />
                <feMerge>
                  <feMergeNode in="goldenGlow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* BACKGROUND MOUNTAIN PEAKS */}
            {/* Far Left Peak */}
            <polygon points="-50,800 120,480 320,800" fill="#133d49" opacity="0.75" />
            {/* Far Right Peak */}
            <polygon points="680,800 840,430 1050,800" fill="#184b59" opacity="0.8" />
            <polygon points="840,430 870,510 820,530 840,430" fill="#88bcca" opacity="0.7" />

            {/* MAIN CENTRAL MOUNTAIN */}
            {/* Left Dark Rocky Facets (Base silhouette) */}
            <polygon
              points="500,165 420,290 490,370 410,460 460,540 330,650 360,710 220,800 0,800 0,680 180,510 500,165"
              fill="url(#rockDark)"
            />

            {/* Rocky ridges on left flank */}
            <polygon points="500,165 460,260 435,280 475,340 430,420 500,165" fill="#10343f" opacity="0.6" />
            <polygon points="410,460 380,520 440,550 350,650 320,680 410,460" fill="#10343f" opacity="0.6" />
            <polygon points="340,640 280,720 370,760 340,640" fill="#0d2b34" opacity="0.7" />

            {/* RIGHT FACET: Alpine Snow & Ice (Matches the reference image) */}
            {/* Base Ice Mass */}
            <polygon
              points="500,165 500,800 1020,800 820,560 690,480 590,340 500,165"
              fill="url(#iceRidge)"
            />

            {/* Crisp Snow Shards & Faceted Crevasses */}
            <polygon
              points="500,165 540,250 515,310 570,360 535,460 610,530 565,630 655,710 600,800 500,800 500,165"
              fill="url(#snowGrad)"
            />

            <polygon
              points="540,250 620,330 570,360 650,440 600,480 700,560 640,620 740,710 680,770 780,800 1000,800 820,560 690,480 590,340 540,250"
              fill="#a1cbda"
            />

            {/* Snow highlights along ridges */}
            <polygon points="500,165 525,230 495,290 530,340 500,165" fill="#ffffff" />
            <polygon points="570,360 595,430 550,470 605,520 570,360" fill="#ffffff" />
            <polygon points="610,530 645,610 590,650 655,710 610,530" fill="#ffffff" />

            {/* SUMMIT FLAG (Right at the peak!) */}
            <g transform="translate(505, 105)">
              <line x1="0" y1="80" x2="0" y2="0" stroke="#94a3b8" strokeWidth="4" strokeLinecap="round" />
              <circle cx="0" cy="0" r="5" fill="#f87171" />

              <path
                d="M 0 5 Q 30 -5 55 10 Q 30 25 0 20 Z"
                fill="#e11d48"
                className={flowStatus === 'success' ? 'animate-pulse' : ''}
              />

              <circle cx="0" cy="80" r="9" fill="#e11d48" stroke="#ffffff" strokeWidth="3" />
            </g>

            {/* RED DASHED CLIMBING TRAIL */}
            {pathD && (
              <path
                d={pathD}
                fill="none"
                stroke="#e11d48"
                strokeWidth="4"
                strokeDasharray="8 8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="drop-shadow-sm opacity-95"
              />
            )}

            {/* WAYPOINTS (EACH PETITION / REQUEST) */}
            {waypoints.map((pt, idx) => {
              const step = activeSteps[idx];
              if (!step) return null;
              const variant = variants.find(v => v.id === step.variantId);
              const status = stepStatusMap[step.id] || 'pending';
              const title = step.category || variant?.category || `Paso ${idx + 1}`;
              const isCurrent = currentStepIndex === idx && flowStatus === 'running';
              const isCompleted = status === 'success';
              const isFailed = status === 'failed';

              const isRightSide = pt.x <= 620;
              const labelX = isRightSide ? pt.x + 22 : pt.x - 22;
              const textAnchor = isRightSide ? 'start' : 'end';

              return (
                <g key={step.id} className="transition-all duration-300">
                  {/* Active Waypoint Pulse Ring */}
                  {isCurrent && (
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="20"
                      fill="none"
                      stroke="#fb923c"
                      strokeWidth="3"
                      opacity="0.8"
                      className="animate-ping"
                    />
                  )}

                  {/* Waypoint Circle */}
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isCurrent ? "11" : "9"}
                    fill={
                      isCompleted
                        ? "#10b981"
                        : isFailed
                        ? "#ef4444"
                        : isCurrent
                        ? "#ea580c"
                        : "#ffffff"
                    }
                    stroke={isCompleted ? "#ffffff" : isFailed ? "#ffffff" : "#dc2626"}
                    strokeWidth="3.5"
                    filter={isCurrent ? "url(#glowBeacon)" : undefined}
                  />

                  {/* Inner dot for pending */}
                  {!isCompleted && !isFailed && !isCurrent && (
                    <circle cx={pt.x} cy={pt.y} r="3" fill="#dc2626" />
                  )}

                  {/* STEP TITLE PILL (Clean Apple typography, only title) */}
                  <g transform={`translate(${labelX}, ${pt.y})`}>
                    <rect
                      x={isRightSide ? 0 : - (title.length * 9 + 28)}
                      y="-15"
                      width={title.length * 9 + 28}
                      height="30"
                      rx="15"
                      fill={
                        isCurrent
                          ? "rgba(234, 88, 12, 0.95)"
                          : isCompleted
                          ? isDarkMode ? "rgba(15, 23, 42, 0.85)" : "rgba(240, 253, 244, 0.95)"
                          : isFailed
                          ? "rgba(225, 29, 72, 0.9)"
                          : isDarkMode ? "rgba(15, 23, 42, 0.75)" : "rgba(255, 255, 255, 0.92)"
                      }
                      stroke={
                        isCurrent
                          ? "rgba(251, 146, 60, 0.7)"
                          : isCompleted
                          ? isDarkMode ? "rgba(52, 211, 153, 0.4)" : "rgba(34, 197, 94, 0.5)"
                          : isFailed
                          ? "rgba(248, 113, 113, 0.6)"
                          : isDarkMode ? "rgba(255, 255, 255, 0.15)" : "rgba(203, 213, 225, 0.9)"
                      }
                      strokeWidth="1.5"
                      style={{ backdropFilter: 'blur(8px)' }}
                      className="transition-all duration-300"
                    />

                    <text
                      x={isRightSide ? 14 : -14}
                      y="5"
                      textAnchor={textAnchor}
                      fill={
                        isCurrent
                          ? "#ffffff"
                          : isCompleted
                          ? isDarkMode ? "#ffffff" : "#065f46"
                          : isFailed
                          ? "#ffffff"
                          : isDarkMode ? "#ffffff" : "#1e293b"
                      }
                      fontSize="13"
                      fontWeight={isCurrent ? "700" : "500"}
                      style={{
                        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
                        letterSpacing: '-0.015em'
                      }}
                    >
                      {isCompleted ? `✓ ${title}` : title}
                    </text>
                  </g>
                </g>
              );
            })}

            {/* GOKU FROM DRAGON BALL Z CLIMBER */}
            <g
              style={{
                transform: `translate(${currentPt.x}px, ${currentPt.y}px)`,
                transition: 'transform 0.75s cubic-bezier(0.34, 1.56, 0.64, 1)'
              }}
            >
              {/* Goku character group */}
              <g transform="translate(-20, -56)">
                
                {/* Super Saiyan Golden Ki Aura (active when finished at the peak) */}
                {flowStatus === 'success' && (
                  <g filter="url(#superSaiyanAura)">
                    {/* Flaming Ki Aura Path */}
                    <path
                      d="M 20 -15 Q 40 10 38 45 Q 20 60 2 45 Q 0 10 20 -15 Z"
                      fill="#fde047"
                      opacity="0.65"
                      className="animate-pulse"
                    />
                    {/* Electric Ki sparks */}
                    <circle cx="5" cy="5" r="2" fill="#ffffff" />
                    <circle cx="35" cy="12" r="2.5" fill="#fef08a" />
                    <circle cx="10" cy="40" r="1.5" fill="#ffffff" />
                    <circle cx="32" cy="36" r="2" fill="#ffffff" />
                  </g>
                )}

                {/* GOKU'S SPIKY HAIR */}
                {/* Super Saiyan Golden Yellow if finished, classic jet black during climb */}
                <path
                  d="
                    M 20 2
                    L 14 -12 L 18 -6
                    L 8 -16 L 14 -2
                    L 2 -10 L 10 6
                    L 4 14 L 14 12
                    L 18 16
                    L 26 12 L 34 14
                    L 28 6 L 36 -8
                    L 26 -2 L 32 -16
                    L 22 -6 L 26 -14
                    Z
                  "
                  fill={flowStatus === 'success' ? "#facc15" : "#09090b"}
                  stroke={flowStatus === 'success' ? "#eab308" : "#18181b"}
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />

                {/* Hair highlights / texture */}
                <path
                  d="M 16 -8 L 19 0 M 24 -8 L 22 0 M 11 -4 L 15 4"
                  stroke={flowStatus === 'success' ? "#fef08a" : "#3f3f46"}
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />

                {/* Head / Anime Face */}
                <circle cx="20" cy="14" r="7.5" fill="#fed7aa" />

                {/* Eyes and Eyebrows */}
                <path d="M 16 12 L 19 13 M 24 12 L 21 13" stroke="#09090b" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="17.5" cy="14.5" r="1" fill="#09090b" />
                <circle cx="22.5" cy="14.5" r="1" fill="#09090b" />
                {/* Confident Goku Smile */}
                <path d="M 18 18 Q 20 20 22 18" stroke="#7c2d12" strokeWidth="1" fill="none" strokeLinecap="round" />

                {/* GOKU'S DRAGON BALL Z DOGI (ORANGE GI) */}
                {/* Orange Martial Arts Gi Top */}
                <path
                  d="M 12 21 L 28 21 L 27 38 L 13 38 Z"
                  fill="#ea580c"
                  stroke="#c2410c"
                  strokeWidth="1.5"
                />

                {/* Navy Blue Undershirt (V-neck peek) */}
                <polygon points="17,21 23,21 20,28" fill="#1e3a8a" />

                {/* Kame Symbol 龜 on chest */}
                <circle cx="16" cy="27" r="3.2" fill="#ffffff" stroke="#1e3a8a" strokeWidth="0.8" />
                <line x1="14.5" y1="27" x2="17.5" y2="27" stroke="#09090b" strokeWidth="0.8" />
                <line x1="16" y1="25.5" x2="16" y2="28.5" stroke="#09090b" strokeWidth="0.8" />

                {/* Goku's Navy Blue Obi Belt Sash */}
                <rect x="13" y="35" width="14" height="4" rx="1.5" fill="#1e3a8a" />
                {/* Belt tails hanging on the side */}
                <path d="M 23 38 L 26 47 L 24 48 L 22 39 Z" fill="#1e3a8a" />

                {/* GOKU'S ARMS AND WRISTBANDS */}
                {flowStatus === 'success' ? (
                  // Super Saiyan Victory Pose (Arms raised \o/ charging Ki / Spirit Bomb)
                  <>
                    <line x1="13" y1="23" x2="6" y2="7" stroke="#ea580c" strokeWidth="3.5" strokeLinecap="round" />
                    <line x1="27" y1="23" x2="34" y2="7" stroke="#ea580c" strokeWidth="3.5" strokeLinecap="round" />
                    {/* Navy blue wristbands */}
                    <circle cx="7.5" cy="10" r="2.5" fill="#1e3a8a" />
                    <circle cx="32.5" cy="10" r="2.5" fill="#1e3a8a" />
                    {/* Hands */}
                    <circle cx="5" cy="6" r="2" fill="#fed7aa" />
                    <circle cx="35" cy="6" r="2" fill="#fed7aa" />
                  </>
                ) : (
                  // Climbing / Walking Arm Stance
                  <>
                    <line x1="13" y1="24" x2="9" y2="33" stroke="#ea580c" strokeWidth="3.5" strokeLinecap="round" />
                    <line x1="27" y1="24" x2="31" y2="31" stroke="#ea580c" strokeWidth="3.5" strokeLinecap="round" />
                    {/* Navy blue wristbands */}
                    <circle cx="9.5" cy="32" r="2.3" fill="#1e3a8a" />
                    <circle cx="30.5" cy="30" r="2.3" fill="#1e3a8a" />
                    {/* Hands */}
                    <circle cx="9" cy="35" r="2" fill="#fed7aa" />
                    <circle cx="32" cy="32" r="2" fill="#fed7aa" />
                  </>
                )}

                {/* GOKU'S ORANGE PANTS */}
                <line x1="16" y1="39" x2="13" y2="49" stroke="#ea580c" strokeWidth="4.5" strokeLinecap="round" />
                <line x1="24" y1="39" x2="27" y2="48" stroke="#ea580c" strokeWidth="4.5" strokeLinecap="round" />

                {/* GOKU'S ICONIC NAVY BOOTS WITH RED TRIM AND YELLOW CORDS */}
                {/* Left Boot */}
                <path d="M 11 48 L 15 48 L 14 54 L 9 54 Z" fill="#1e3a8a" stroke="#0f172a" strokeWidth="0.8" />
                <line x1="12" y1="48" x2="12" y2="54" stroke="#dc2626" strokeWidth="1" />
                <circle cx="12" cy="50" r="0.8" fill="#facc15" />

                {/* Right Boot */}
                <path d="M 25 47 L 29 47 L 30 53 L 24 53 Z" fill="#1e3a8a" stroke="#0f172a" strokeWidth="0.8" />
                <line x1="27" y1="47" x2="27" y2="53" stroke="#dc2626" strokeWidth="1" />
                <circle cx="27" cy="49" r="0.8" fill="#facc15" />
              </g>
            </g>
          </svg>
        </div>

        {/* Bottom Floating Victory or Error Card */}
        <div className="relative z-20 px-6 pb-6 pt-2 flex flex-col items-center">
          {/* SUCCESS VICTORY CARD */}
          {flowStatus === 'success' && (
            <div className="backdrop-blur-xl bg-white/95 dark:bg-slate-900/95 border border-emerald-500/40 shadow-2xl rounded-3xl p-4 sm:px-6 sm:py-4 max-w-2xl w-full flex flex-col sm:flex-row items-center justify-between gap-4 animate-in slide-in-from-bottom-5 duration-300">
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <div className="w-11 h-11 rounded-2xl bg-emerald-500 text-white flex items-center justify-center font-bold shadow-lg shadow-emerald-500/30 shrink-0">
                  <Check className="w-6 h-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
                    ¡Flujo Exitoso!
                  </span>
                  <div className="text-base font-bold text-slate-900 dark:text-white font-mono truncate">
                    {currentContext.orderNumber ? `Orden #${currentContext.orderNumber}` : 'Todas las pruebas superadas'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                {currentContext.orderNumber && (
                  <button
                    onClick={handleCopyOrder}
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-md transition-all"
                  >
                    {copiedOrder ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedOrder ? 'Copiado' : 'Copiar'}</span>
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-slate-100 dark:text-slate-950 text-xs font-bold transition-all shadow-md"
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}

          {/* FAILED CARD */}
          {flowStatus === 'failed' && (
            <div className="backdrop-blur-xl bg-white/95 dark:bg-slate-900/95 border border-rose-500/40 dark:border-rose-500/30 shadow-2xl rounded-3xl p-4 sm:px-6 sm:py-4 max-w-2xl w-full flex flex-col sm:flex-row items-center justify-between gap-4 animate-in slide-in-from-bottom-5 duration-300">
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <div
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold shadow-lg shrink-0 ${
                    failureType === 'TESTS_FAILED'
                      ? 'bg-amber-500 text-white shadow-amber-500/30'
                      : 'bg-rose-500 text-white shadow-rose-500/30'
                  }`}
                >
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <span
                    className={`text-[11px] font-bold uppercase tracking-wider block ${
                      failureType === 'TESTS_FAILED'
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {failureType === 'TESTS_FAILED'
                      ? 'Prueba(s) no superada(s)'
                      : failureType === 'HTTP_ERROR'
                      ? 'Error del servidor'
                      : failureType === 'GRAPHQL_ERROR'
                      ? 'Error en respuesta GraphQL'
                      : failureType === 'CONNECTION_ERROR'
                      ? 'Error de conexión'
                      : 'Expedición Interrumpida'}
                  </span>
                  <p
                    className="text-xs text-slate-700 dark:text-slate-200 font-medium truncate mt-0.5"
                    title={failedError || ''}
                  >
                    {failedError || 'El paso no pudo completarse con éxito'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                {onInspectStep && (failedStepResult || stepResultsMap[activeSteps[currentStepIndex]?.id]) && (
                  <button
                    onClick={() => {
                      const target = failedStepResult || stepResultsMap[activeSteps[currentStepIndex]?.id];
                      onClose();
                      onInspectStep(target);
                    }}
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-all border border-slate-200 dark:border-slate-700 shadow-xs"
                    title="Cerrar modal e inspeccionar detalles del paso fallido"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-orange-500" />
                    <span>Inspeccionar</span>
                  </button>
                )}
                <button
                  onClick={startExecution}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-md"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reintentar</span>
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 text-xs font-bold transition-all border border-slate-800 dark:border-slate-700 shadow-xs"
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}

          {/* IN PROGRESS FOOTER (Clean subtle indicator) */}
          {flowStatus === 'running' && (
            <div className="backdrop-blur-md bg-white/90 dark:bg-slate-950/60 border border-slate-200/90 dark:border-white/10 px-5 py-2.5 rounded-full flex items-center gap-3 text-xs text-slate-700 dark:text-slate-300 shadow-sm transition-colors">
              <div className="w-2 h-2 rounded-full bg-orange-500 animate-ping" />
              <span className="font-medium">
                {dataset && dataset.rows && dataset.rows.length > 1
                  ? `[Fila ${currentDatasetRowIndex + 1}/${dataset.rows.length}] Goku subiendo la montaña: `
                  : 'Goku subiendo la montaña: '}
                {activeSteps[currentStepIndex]?.category || variants.find(v => v.id === activeSteps[currentStepIndex]?.variantId)?.name || 'Petición en curso'}
              </span>
            </div>
          )}

          {/* DATASET EXECUTION RESULTS SUMMARY TABLE */}
          {datasetResults.length > 1 && (
            <div className="mt-3 w-full max-w-2xl bg-white/90 dark:bg-slate-900/90 backdrop-blur border border-slate-200 dark:border-slate-800 rounded-2xl p-3 shadow-lg">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  Resumen de Iteraciones CSV ({datasetResults.length}/{dataset?.rows.length || 0})
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  Éxitos: {datasetResults.filter(d => d.status === 'SUCCESS').length} • Fallos: {datasetResults.filter(d => d.status !== 'SUCCESS').length}
                </span>
              </div>
              <div className="max-h-32 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80 text-xs font-mono">
                {datasetResults.map(r => (
                  <div key={r.rowIndex} className="py-1 px-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${r.status === 'SUCCESS' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                      <span className="font-bold">Fila #{r.rowIndex}</span>
                      <span className="text-slate-400 font-sans text-[11px]">
                        {Object.entries(r.rowVariables).slice(0, 3).map(([k, v]) => `${k}=${v}`).join(', ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {r.orderNumber && (
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                          #{r.orderNumber}
                        </span>
                      )}
                      <span className="text-slate-400 text-[11px]">{r.durationMs}ms</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
