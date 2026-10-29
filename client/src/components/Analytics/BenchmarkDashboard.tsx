import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Flame,
  Trash2,
  RefreshCw,
  ChevronRight
} from 'lucide-react';
import { FlowExecutionResponse } from '../../types';
import { api } from '../../api';
import { ExecutionDetailView } from './ExecutionDetailView';
import { useFeedback } from '../../context/FeedbackContext';

export const BenchmarkDashboard: React.FC = () => {
  const { confirm, toast } = useFeedback();
  const [history, setHistory] = useState<FlowExecutionResponse[]>([]);
  const [selectedExecution, setSelectedExecution] = useState<FlowExecutionResponse | null>(null);
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'FLOW' | 'SINGLE'>('ALL');

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const data = await api.getHistory();
      setHistory(data);
    } catch (err) {
      console.error('Error loading history:', err);
    }
  };

  const handleClearHistory = async () => {
    const ok = await confirm({
      title: '¿Vaciar historial?',
      message: 'Se eliminarán todas las métricas y registros de ejecuciones previas.',
      confirmText: 'Vaciar historial',
      isDestructive: true
    });
    if (!ok) return;

    try {
      await api.clearHistory();
      setHistory([]);
      setSelectedExecution(null);
      toast('Historial vaciado', 'success');
    } catch (err: any) {
      toast(`Error: ${err.message}`, 'error');
    }
  };

  // If viewing details of a specific execution, render ExecutionDetailView
  if (selectedExecution) {
    return (
      <ExecutionDetailView
        execution={selectedExecution}
        onBack={() => {
          setSelectedExecution(null);
          loadHistory();
        }}
      />
    );
  }

  const filteredHistory = history.filter(h => {
    if (typeFilter === 'FLOW') return h.executionType === 'FLOW';
    if (typeFilter === 'SINGLE') return h.executionType === 'SINGLE';
    return true;
  });

  const totalRuns = history.length;
  const successfulRuns = history.filter(h => h.status === 'SUCCESS').length;
  const successRate = totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 100) : 0;
  const avgTotalTime =
    totalRuns > 0
      ? Math.round(history.reduce((acc, h) => acc + (h.totalTimeMs || 0), 0) / totalRuns)
      : 0;

  // Bottleneck por Categoría
  const categoryTimes: Record<string, { totalMs: number; count: number }> = {};
  history.forEach(run => {
    run.steps?.forEach(step => {
      const cat = step.category || 'General';
      if (!step.skipped && step.durationMs > 0) {
        if (!categoryTimes[cat]) {
          categoryTimes[cat] = { totalMs: 0, count: 0 };
        }
        categoryTimes[cat].totalMs += step.durationMs;
        categoryTimes[cat].count += 1;
      }
    });
  });

  let slowestCategory: string | null = null;
  let slowestAvgMs = 0;
  Object.entries(categoryTimes).forEach(([cat, data]) => {
    const avg = data.count > 0 ? data.totalMs / data.count : 0;
    if (avg > slowestAvgMs) {
      slowestAvgMs = Math.round(avg);
      slowestCategory = cat;
    }
  });

  return (
    <div className="max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Métricas &amp; Historial de Peticiones
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter Type */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
            <button
              onClick={() => setTypeFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                typeFilter === 'ALL'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
              }`}
            >
              Todas ({history.length})
            </button>
            <button
              onClick={() => setTypeFilter('FLOW')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                typeFilter === 'FLOW'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
              }`}
            >
              Flujos
            </button>
            <button
              onClick={() => setTypeFilter('SINGLE')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                typeFilter === 'SINGLE'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
              }`}
            >
              Individuales
            </button>
          </div>

          <button
            onClick={loadHistory}
            className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Recargar"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          {history.length > 0 && (
            <button
              onClick={handleClearHistory}
              className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20"
              title="Limpiar historial"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 shadow-sm transition-colors">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Ejecuciones</span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100">{totalRuns}</span>
            <span className="text-xs text-slate-400">runs</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 shadow-sm transition-colors">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Tiempo Medio</span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-orange-600 dark:text-orange-400">{avgTotalTime}</span>
            <span className="text-xs text-slate-400">ms</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 shadow-sm transition-colors">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Tasa de Éxito</span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span
              className={`text-2xl font-bold font-mono ${
                successRate >= 80 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500'
              }`}
            >
              {successRate}%
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 shadow-sm transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Cuello de Botella</span>
            <Flame className="w-3.5 h-3.5 text-rose-500" />
          </div>
          <div className="mt-1">
            {slowestCategory ? (
              <span className="text-xs font-bold text-rose-600 dark:text-rose-400 font-mono">
                {slowestCategory} ({slowestAvgMs}ms)
              </span>
            ) : (
              <span className="text-xs text-slate-400">Sin datos</span>
            )}
          </div>
        </div>
      </div>

      {/* Bottleneck Recommendation */}
      {slowestCategory && (
        <div className="bg-amber-50 dark:bg-slate-900 border border-amber-200 dark:border-amber-500/30 rounded-xl p-3 flex items-center gap-3 text-xs text-slate-700 dark:text-slate-300">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <div>
            <strong>Categoría más lenta:</strong> {slowestCategory} promedia <strong>{slowestAvgMs} ms</strong>.
          </div>
        </div>
      )}

      {/* History Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden transition-colors">
        {filteredHistory.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            Sin ejecuciones que coincidan con el filtro seleccionado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950 text-slate-400 font-mono border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Petición / Flujo</th>
                  <th className="px-4 py-3">Entorno</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Pruebas</th>
                  <th className="px-4 py-3">Latencia</th>
                  <th className="px-4 py-3">Hora</th>
                  <th className="px-4 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredHistory.map(run => {
                  const isSingle = run.executionType === 'SINGLE';
                  const totalT = (run.totalTestsPassed || 0) + (run.totalTestsFailed || 0);

                  return (
                    <tr
                      key={run.id || Math.random()}
                      onClick={() => setSelectedExecution(run)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            isSingle
                              ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                              : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                          }`}
                        >
                          {isSingle ? 'Individual' : 'Flujo'}
                        </span>
                      </td>

                      <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">
                        <div className="flex items-center gap-1.5">
                          <span>{run.targetName || (isSingle ? 'Petición' : 'Flujo Dinámico')}</span>
                          {run.orderNumber && (
                            <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                              #{run.orderNumber}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-slate-500 font-mono text-[11px]">
                        {run.environmentName || 'Por defecto'}
                      </td>

                      <td className="px-4 py-3">
                        {run.status === 'SUCCESS' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            Success
                          </span>
                        )}
                        {run.status === 'FAILED' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                            Failed
                          </span>
                        )}
                        {run.status === 'TESTS_FAILED' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20" title="El flujo terminó pero fallaron algunas pruebas de validación">
                            Pruebas No Pasadas
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 font-mono text-[11px]">
                        {totalT > 0 ? (
                          <span
                            className={
                              run.totalTestsFailed === 0
                                ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                                : 'text-amber-500 font-semibold'
                            }
                          >
                            {run.totalTestsPassed}/{totalT}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      <td className="px-4 py-3 font-bold font-mono text-orange-600 dark:text-orange-400">
                        {run.totalTimeMs} ms
                      </td>

                      <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">
                        {run.createdAt ? new Date(run.createdAt).toLocaleTimeString() : 'N/A'}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setSelectedExecution(run);
                          }}
                          className="p-1 rounded-lg text-slate-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/20"
                          title="Ver detalle completo"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
