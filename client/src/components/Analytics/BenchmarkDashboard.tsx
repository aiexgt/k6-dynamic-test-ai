import React, { useState, useEffect, useMemo } from 'react';
import {
  AlertTriangle,
  Trash2,
  RefreshCw,
  ChevronRight,
  Layers,
  Search,
  BarChart3,
  X,
  History as HistoryIcon
} from 'lucide-react';
import { FlowExecutionResponse, VariantMetric } from '../../types';
import { api } from '../../api';
import { ExecutionDetailView } from './ExecutionDetailView';
import { Pagination } from '../common/Pagination';
import { useFeedback } from '../../context/FeedbackContext';

export const BenchmarkDashboard: React.FC = () => {
  const { confirm, toast } = useFeedback();
  const [history, setHistory] = useState<FlowExecutionResponse[]>([]);
  const [variantMetrics, setVariantMetrics] = useState<VariantMetric[]>([]);
  const [selectedExecution, setSelectedExecution] = useState<FlowExecutionResponse | null>(null);

  // Tab View: 'history' (Peticiones y Flujos) | 'variants' (Métricas por Variante)
  const [viewMode, setViewMode] = useState<'history' | 'variants'>(() => {
    if (typeof window !== 'undefined') {
      const v = new URLSearchParams(window.location.search).get('view');
      if (v === 'variants' || v === 'history') return v;
    }
    return 'history';
  });

  const [typeFilter, setTypeFilter] = useState<'ALL' | 'FLOW' | 'SINGLE'>(() => {
    if (typeof window !== 'undefined') {
      const t = new URLSearchParams(window.location.search).get('type');
      if (t === 'FLOW' || t === 'SINGLE' || t === 'ALL') return t;
    }
    return 'ALL';
  });

  // Pagination states
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(15);

  const [variantPage, setVariantPage] = useState(1);
  const [variantPageSize, setVariantPageSize] = useState(15);
  const [variantSearch, setVariantSearch] = useState('');

  const updateUrl = (params: { execution?: string | null; view?: string; type?: string }) => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);

    if (params.execution !== undefined) {
      if (params.execution) url.searchParams.set('execution', params.execution);
      else url.searchParams.delete('execution');
    }
    if (params.view !== undefined) {
      if (params.view && params.view !== 'history') url.searchParams.set('view', params.view);
      else url.searchParams.delete('view');
    }
    if (params.type !== undefined) {
      if (params.type && params.type !== 'ALL') url.searchParams.set('type', params.type);
      else url.searchParams.delete('type');
    }

    if (window.location.pathname + window.location.search !== url.pathname + url.search) {
      window.history.pushState(null, '', url.pathname + url.search);
    }
  };

  const handleSelectExecution = (exec: FlowExecutionResponse) => {
    setSelectedExecution(exec);
    updateUrl({ execution: exec.id || null });
  };

  const handleCloseExecution = () => {
    setSelectedExecution(null);
    updateUrl({ execution: null });
    loadData();
  };

  const handleViewModeChange = (mode: 'history' | 'variants') => {
    setViewMode(mode);
    updateUrl({ view: mode });
  };

  const handleTypeFilterChange = (filter: 'ALL' | 'FLOW' | 'SINGLE') => {
    setTypeFilter(filter);
    setHistoryPage(1);
    updateUrl({ type: filter });
  };

  useEffect(() => {
    loadData();
  }, []);

  // Sync with URL parameters and popstate
  useEffect(() => {
    const handleUrlSync = () => {
      if (typeof window === 'undefined') return;
      const params = new URLSearchParams(window.location.search);
      const execId = params.get('execution');
      const viewParam = params.get('view');
      const typeParam = params.get('type') as 'ALL' | 'FLOW' | 'SINGLE' | null;

      if (viewParam === 'variants' || viewParam === 'history') {
        setViewMode(viewParam);
      }
      if (typeParam && (typeParam === 'ALL' || typeParam === 'FLOW' || typeParam === 'SINGLE')) {
        setTypeFilter(typeParam);
      }
      if (execId) {
        const found = history.find(h => h.id === execId);
        if (found) {
          setSelectedExecution(found);
        }
      } else if (selectedExecution) {
        setSelectedExecution(null);
      }
    };

    handleUrlSync();
    window.addEventListener('popstate', handleUrlSync);
    return () => window.removeEventListener('popstate', handleUrlSync);
  }, [history, selectedExecution?.id]);

  const loadData = async () => {
    try {
      const [hList, vList] = await Promise.all([
        api.getHistory(),
        api.getVariantMetrics().catch(() => [])
      ]);
      setHistory(hList);
      setVariantMetrics(vList);

      if (typeof window !== 'undefined') {
        const execId = new URLSearchParams(window.location.search).get('execution');
        if (execId) {
          const found = hList.find(h => h.id === execId);
          if (found) setSelectedExecution(found);
        }
      }
    } catch (err) {
      console.error('Error loading analytics data:', err);
    }
  };

  const handleClearHistory = async () => {
    const ok = await confirm({
      title: '¿Vaciar historial de ejecuciones?',
      message: 'Se eliminarán los registros de flujos y peticiones previas.',
      confirmText: 'Vaciar historial',
      isDestructive: true
    });
    if (!ok) return;

    try {
      await api.clearHistory();
      setHistory([]);
      handleCloseExecution();
      toast('Historial de ejecuciones vaciado', 'success');
    } catch (err: any) {
      toast(`Error: ${err.message}`, 'error');
    }
  };

  const handleClearVariantMetrics = async () => {
    const ok = await confirm({
      title: '¿Reiniciar métricas por variante?',
      message: 'Se restablecerán a cero el contador de veces ejecutadas, tiempos promedio y porcentaje de aciertos de cada variante.',
      confirmText: 'Reiniciar métricas',
      isDestructive: true
    });
    if (!ok) return;

    try {
      await api.clearVariantMetrics();
      setVariantMetrics([]);
      setVariantPage(1);
      toast('Métricas locales por variante restablecidas', 'success');
    } catch (err: any) {
      toast(`Error: ${err.message}`, 'error');
    }
  };

  // Filtered History
  const filteredHistory = history.filter(h => {
    if (typeFilter === 'FLOW') return h.executionType === 'FLOW';
    if (typeFilter === 'SINGLE') return h.executionType === 'SINGLE';
    return true;
  });

  // Paginated History
  const paginatedHistory = useMemo(() => {
    const start = (historyPage - 1) * historyPageSize;
    return filteredHistory.slice(start, start + historyPageSize);
  }, [filteredHistory, historyPage, historyPageSize]);

  // Filtered & Paginated Variant Metrics
  const filteredVariantMetrics = useMemo(() => {
    if (!variantSearch.trim()) return variantMetrics;
    const term = variantSearch.toLowerCase();
    return variantMetrics.filter(
      m =>
        m.variantName.toLowerCase().includes(term) ||
        m.category.toLowerCase().includes(term) ||
        m.apiType.toLowerCase().includes(term)
    );
  }, [variantMetrics, variantSearch]);

  const paginatedVariantMetrics = useMemo(() => {
    const start = (variantPage - 1) * variantPageSize;
    return filteredVariantMetrics.slice(start, start + variantPageSize);
  }, [filteredVariantMetrics, variantPage, variantPageSize]);

  // If viewing details of a specific execution, render ExecutionDetailView
  // Placed AFTER all hooks to adhere strictly to React Rules of Hooks
  if (selectedExecution) {
    return (
      <ExecutionDetailView
        execution={selectedExecution}
        onBack={handleCloseExecution}
      />
    );
  }

  // History KPIs
  const totalRuns = history.length;
  const successfulRuns = history.filter(h => h.status === 'SUCCESS').length;
  const successRate = totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 100) : 0;
  const avgTotalTime =
    totalRuns > 0
      ? Math.round(history.reduce((acc, h) => acc + (h.totalTimeMs || 0), 0) / totalRuns)
      : 0;

  // Variant KPIs
  const totalVariantRuns = variantMetrics.reduce((acc, m) => acc + m.totalRuns, 0);
  const totalVariantSuccesses = variantMetrics.reduce((acc, m) => acc + m.successRuns, 0);
  const overallVariantSuccessRate =
    totalVariantRuns > 0 ? Math.round((totalVariantSuccesses / totalVariantRuns) * 100) : 0;
  const overallVariantAvgMs =
    totalVariantRuns > 0
      ? Math.round(variantMetrics.reduce((acc, m) => acc + m.totalTimeMs, 0) / totalVariantRuns)
      : 0;

  // Bottlenecks calculation
  const categoryTimes: Record<string, { totalMs: number; count: number }> = {};
  history.forEach(h => {
    (h.steps || []).forEach(s => {
      if (s.category && !s.skipped) {
        if (!categoryTimes[s.category]) {
          categoryTimes[s.category] = { totalMs: 0, count: 0 };
        }
        categoryTimes[s.category].totalMs += s.durationMs || 0;
        categoryTimes[s.category].count += 1;
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
      {/* Top Header & Main Mode Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-orange-500" />
            <span>Métricas &amp; Rendimiento</span>
          </h1>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
            <button
              onClick={() => handleViewModeChange('history')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                viewMode === 'history'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
              }`}
            >
              <HistoryIcon className="w-3.5 h-3.5 text-orange-500" />
              <span>Historial ({history.length})</span>
            </button>
            <button
              onClick={() => handleViewModeChange('variants')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                viewMode === 'variants'
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
              }`}
              title="Métricas por variante guardadas localmente"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Por Variante ({variantMetrics.length})</span>
            </button>
          </div>
        </div>

        {/* Right Action Tools */}
        <div className="flex items-center gap-2">
          {viewMode === 'history' && (
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
              <button
                onClick={() => handleTypeFilterChange('ALL')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  typeFilter === 'ALL'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                }`}
              >
                Todas ({history.length})
              </button>
              <button
                onClick={() => handleTypeFilterChange('FLOW')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  typeFilter === 'FLOW'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                }`}
              >
                Flujos
              </button>
              <button
                onClick={() => handleTypeFilterChange('SINGLE')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  typeFilter === 'SINGLE'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                }`}
              >
                Individuales
              </button>
            </div>
          )}

          <button
            onClick={loadData}
            className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Recargar datos"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          {viewMode === 'history' && history.length > 0 && (
            <button
              onClick={handleClearHistory}
              className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20"
              title="Limpiar historial de ejecuciones"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          {viewMode === 'variants' && variantMetrics.length > 0 && (
            <button
              onClick={handleClearVariantMetrics}
              className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20"
              title="Reiniciar métricas por variante (BD local)"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VIEW MODE 1: HISTORIAL DE EJECUCIONES (Peticiones & Flujos) */}
      {/* ========================================================================= */}
      {viewMode === 'history' && (
        <>
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
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Tasa de Éxito</span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className={`text-2xl font-bold font-mono ${successRate >= 90 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500'}`}>
                  {successRate}%
                </span>
                <span className="text-xs text-slate-400">({successfulRuns}/{totalRuns})</span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 shadow-sm transition-colors">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Tiempo Promedio</span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-bold font-mono text-orange-600 dark:text-orange-400">{avgTotalTime}</span>
                <span className="text-xs text-slate-400">ms</span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 shadow-sm transition-colors">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Cuello de Botella</span>
              <div className="mt-1 flex items-baseline gap-1.5 truncate">
                {slowestCategory ? (
                  <>
                    <span className="text-sm font-bold text-rose-600 dark:text-rose-400 truncate" title={`${slowestCategory} (${slowestAvgMs}ms)`}>
                      {slowestCategory}
                    </span>
                    <span className="text-xs font-mono text-slate-400 shrink-0">({slowestAvgMs}ms)</span>
                  </>
                ) : (
                  <span className="text-sm text-slate-400 font-mono">Sin datos</span>
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
                    {paginatedHistory.map(run => {
                      const isSingle = run.executionType === 'SINGLE';
                      const totalT = (run.totalTestsPassed || 0) + (run.totalTestsFailed || 0);

                      return (
                        <tr
                          key={run.id || Math.random()}
                          onClick={() => handleSelectExecution(run)}
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
                                handleSelectExecution(run);
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

            {/* Pagination for History */}
            <div className="px-4 pb-4">
              <Pagination
                currentPage={historyPage}
                totalItems={filteredHistory.length}
                pageSize={historyPageSize}
                onPageChange={setHistoryPage}
                onPageSizeChange={setHistoryPageSize}
                pageSizeOptions={[15, 30, 50, 100]}
              />
            </div>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* VIEW MODE 2: MÉTRICAS POR VARIANTE (Base de Datos Local / No compartida)   */}
      {/* ========================================================================= */}
      {viewMode === 'variants' && (
        <div className="space-y-4">
          {/* Variant KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 shadow-sm transition-colors">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Variantes Registradas</span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100">
                  {variantMetrics.length}
                </span>
                <span className="text-xs text-slate-400">variantes</span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 shadow-sm transition-colors">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Total Ejecuciones</span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100">
                  {totalVariantRuns}
                </span>
                <span className="text-xs text-slate-400">veces</span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 shadow-sm transition-colors">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Promedio Latencia</span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-bold font-mono text-orange-600 dark:text-orange-400">
                  {overallVariantAvgMs}
                </span>
                <span className="text-xs text-slate-400">ms</span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 shadow-sm transition-colors">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Efectividad Global</span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className={`text-2xl font-bold font-mono ${overallVariantSuccessRate >= 90 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500'}`}>
                  {overallVariantSuccessRate}%
                </span>
                <span className="text-xs text-slate-400">({totalVariantSuccesses}/{totalVariantRuns})</span>
              </div>
            </div>
          </div>

          {/* Search bar for variants */}
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={variantSearch}
              onChange={e => {
                setVariantSearch(e.target.value);
                setVariantPage(1);
              }}
              placeholder="Buscar variante por nombre, categoría o tipo de API..."
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-9 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-orange-500 transition-colors shadow-xs"
            />
            {variantSearch && (
              <button
                onClick={() => {
                  setVariantSearch('');
                  setVariantPage(1);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                title="Limpiar búsqueda"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Variant Metrics Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden transition-colors">
            {filteredVariantMetrics.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                {variantMetrics.length === 0
                  ? 'Aún no hay ejecuciones registradas por variante. Ejecuta una prueba o flujo para comenzar a medir.'
                  : `No se encontraron variantes que coincidan con "${variantSearch}".`}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-950 text-slate-400 font-mono border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-4 py-3">Variante</th>
                      <th className="px-4 py-3">Categoría</th>
                      <th className="px-4 py-3 text-center">Tipo</th>
                      <th className="px-4 py-3 text-center">Ejecutado</th>
                      <th className="px-4 py-3 text-right">Promedio ms</th>
                      <th className="px-4 py-3 text-center">Correctas</th>
                      <th className="px-4 py-3 text-center">Incorrectas</th>
                      <th className="px-4 py-3">Tasa Éxito</th>
                      <th className="px-4 py-3">Última Ejecución</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {paginatedVariantMetrics.map(item => (
                      <tr key={item.variantId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        {/* Variant Name */}
                        <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                          {item.variantName}
                        </td>

                        {/* Category */}
                        <td className="px-4 py-3 text-slate-500 font-mono text-[11px]">
                          {item.category}
                        </td>

                        {/* API Type Badge */}
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                              item.apiType === 'REST'
                                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                                : 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20'
                            }`}
                          >
                            {item.apiType}
                          </span>
                        </td>

                        {/* Total Runs */}
                        <td className="px-4 py-3 text-center font-bold font-mono text-slate-800 dark:text-slate-200">
                          {item.totalRuns}
                        </td>

                        {/* Avg Duration ms */}
                        <td className="px-4 py-3 text-right font-bold font-mono text-orange-600 dark:text-orange-400">
                          {item.avgResponseTimeMs} ms
                        </td>

                        {/* Success Runs */}
                        <td className="px-4 py-3 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {item.successRuns}
                        </td>

                        {/* Failed Runs */}
                        <td className="px-4 py-3 text-center font-mono font-bold text-rose-500">
                          {item.failedRuns}
                        </td>

                        {/* Success Rate Progress Bar */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 w-20 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div
                                style={{ width: `${item.successRate}%` }}
                                className={`h-full rounded-full ${
                                  item.successRate >= 90
                                    ? 'bg-emerald-500'
                                    : item.successRate >= 70
                                    ? 'bg-amber-500'
                                    : 'bg-rose-500'
                                }`}
                              />
                            </div>
                            <span
                              className={`font-mono text-[11px] font-bold ${
                                item.successRate >= 90
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : item.successRate >= 70
                                  ? 'text-amber-500'
                                  : 'text-rose-500'
                              }`}
                            >
                              {item.successRate}%
                            </span>
                          </div>
                        </td>

                        {/* Last Run Date and Status */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                item.lastStatus === 'SUCCESS' ? 'bg-emerald-500' : 'bg-rose-500'
                              }`}
                              title={`Último estado: ${item.lastStatus}`}
                            />
                            <span className="text-[11px] font-mono text-slate-400">
                              {item.lastExecutedAt
                                ? new Date(item.lastExecutedAt).toLocaleDateString('es-MX', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })
                                : 'N/A'}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination for Variant Metrics */}
            <div className="px-4 pb-4">
              <Pagination
                currentPage={variantPage}
                totalItems={filteredVariantMetrics.length}
                pageSize={variantPageSize}
                onPageChange={setVariantPage}
                onPageSizeChange={setVariantPageSize}
                pageSizeOptions={[15, 30, 50, 100]}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
