import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  ListOrdered,
  Plus,
  Play,
  Trash2,
  Edit2,
  Search,
  ArrowUp,
  ArrowDown,
  FolderKanban,
  X
} from 'lucide-react';
import { FlowSet, SavedFlow, Variant, Environment } from '../../types';
import { api } from '../../api';
import { useFeedback } from '../../context/FeedbackContext';
import { FlowSetExecutionModal } from './FlowSetExecutionModal';
import { Pagination } from '../common/Pagination';
import { SearchableSelect } from '../common/SearchableSelect';

interface FlowSetsViewProps {
  environments?: Environment[];
  activeEnvironmentId?: string;
  onNavigateToMetrics?: (executionId?: string) => void;
}

export const FlowSetsView: React.FC<FlowSetsViewProps> = ({
  onNavigateToMetrics
}) => {
  const { confirm, toast } = useFeedback();
  const [flowSets, setFlowSets] = useState<FlowSet[]>([]);
  const [savedFlows, setSavedFlows] = useState<SavedFlow[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Execution Modal state
  const [executingSet, setExecutingSet] = useState<FlowSet | null>(null);

  // Edit / Create Modal state
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [editingSet, setEditingSet] = useState<FlowSet | null>(null);
  const [formName, setFormName] = useState<string>('');
  const [formDescription, setFormDescription] = useState<string>('');
  const [formFlowIds, setFormFlowIds] = useState<string[]>([]);
  const [formDelayMs, setFormDelayMs] = useState<number>(500);
  const [formStopOnFailure, setFormStopOnFailure] = useState<boolean>(true);

  // Pagination state
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  const loadData = async () => {
    try {
      setLoading(true);
      const [sets, flows, vars] = await Promise.all([
        api.getFlowSets(),
        api.getFlows(),
        api.getVariants()
      ]);
      setFlowSets(sets);
      setSavedFlows(flows);
      setVariants(vars);
    } catch (err: any) {
      toast(`Error cargando sets de flujos: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenCreate = () => {
    setEditingSet(null);
    setFormName('');
    setFormDescription('');
    setFormFlowIds([]);
    setFormDelayMs(500);
    setFormStopOnFailure(true);
    setIsEditorOpen(true);
  };

  const handleOpenEdit = (set: FlowSet) => {
    setEditingSet(set);
    setFormName(set.name);
    setFormDescription(set.description || '');
    setFormFlowIds(set.flowIds || []);
    setFormDelayMs(set.delayBetweenFlowsMs !== undefined ? set.delayBetweenFlowsMs : 500);
    setFormStopOnFailure(set.stopOnFailure !== false);
    setIsEditorOpen(true);
  };

  const handleSaveSet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      toast('El nombre del set es obligatorio', 'error');
      return;
    }
    if (formFlowIds.length === 0) {
      toast('Agrega al menos un flujo al set', 'error');
      return;
    }

    try {
      if (editingSet) {
        const updated = await api.updateFlowSet(editingSet.id, {
          name: formName.trim(),
          description: formDescription.trim(),
          flowIds: formFlowIds,
          delayBetweenFlowsMs: formDelayMs,
          stopOnFailure: formStopOnFailure
        });
        setFlowSets(prev => prev.map(s => (s.id === updated.id ? updated : s)));
        toast('Set de flujos actualizado con éxito', 'success');
      } else {
        const created = await api.createFlowSet({
          name: formName.trim(),
          description: formDescription.trim(),
          flowIds: formFlowIds,
          delayBetweenFlowsMs: formDelayMs,
          stopOnFailure: formStopOnFailure
        });
        setFlowSets(prev => [created, ...prev]);
        toast('Set de flujos creado con éxito', 'success');
      }
      setIsEditorOpen(false);
    } catch (err: any) {
      toast(`Error guardando set: ${err.message}`, 'error');
    }
  };

  const handleDeleteSet = async (set: FlowSet) => {
    const ok = await confirm({
      title: `¿Eliminar set "${set.name}"?`,
      message: 'Esta acción no se puede deshacer.',
      confirmText: 'Eliminar',
      isDestructive: true
    });
    if (ok) {
      try {
        await api.deleteFlowSet(set.id);
        setFlowSets(prev => prev.filter(s => s.id !== set.id));
        toast('Set eliminado', 'success');
      } catch (err: any) {
        toast(`Error eliminando set: ${err.message}`, 'error');
      }
    }
  };

  const handleMoveFlowInForm = (idx: number, direction: 'up' | 'down') => {
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= formFlowIds.length) return;
    const next = [...formFlowIds];
    const [moved] = next.splice(idx, 1);
    next.splice(newIdx, 0, moved);
    setFormFlowIds(next);
  };

  const handleAddFlowToForm = (flowId: string) => {
    if (!formFlowIds.includes(flowId)) {
      setFormFlowIds(prev => [...prev, flowId]);
    }
  };

  const handleRemoveFlowFromForm = (idx: number) => {
    setFormFlowIds(prev => prev.filter((_, i) => i !== idx));
  };

  // Filtered and paginated
  const filteredSets = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return flowSets;
    return flowSets.filter(
      s => s.name.toLowerCase().includes(q) || (s.description && s.description.toLowerCase().includes(q))
    );
  }, [flowSets, searchTerm]);

  const paginatedSets = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredSets.slice(start, start + pageSize);
  }, [filteredSets, page, pageSize]);

  const flowSelectOptions = useMemo(() => {
    return savedFlows.map(f => ({
      value: f.id,
      label: f.name,
      sublabel: `${f.steps?.length || 0} pasos`
    }));
  }, [savedFlows]);

  return (
    <div className="max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Header Standard */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200/80 dark:border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-orange-500/10 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
            <ListOrdered className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>Sets de Flujos (Suites)</span>
              <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                {flowSets.length} sets
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Agrupa varios flujos para ejecutarlos secuencialmente uno tras otro y analizar métricas consolidadas
            </p>
          </div>
        </div>

        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition-all shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Crear Nuevo Set</span>
        </button>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar set por nombre o descripción..."
            className="w-full pl-9 pr-4 py-1.5 text-xs rounded-xl bg-transparent text-slate-900 dark:text-slate-100 focus:outline-none"
          />
        </div>
      </div>

      {/* Grid of Sets */}
      {loading ? (
        <div className="py-20 text-center text-xs text-slate-400">Cargando sets de flujos...</div>
      ) : paginatedSets.length === 0 ? (
        <div className="py-20 text-center rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 space-y-3">
          <FolderKanban className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
          <p className="text-xs text-slate-500">No hay sets de flujos creados aún.</p>
          <button
            onClick={handleOpenCreate}
            className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition-all shadow-sm"
          >
            Crear mi primer Set
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {paginatedSets.map(set => {
            const count = set.flowIds?.length || 0;
            return (
              <div
                key={set.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-all flex flex-col justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                      {set.name}
                    </h3>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 shrink-0">
                      {count} {count === 1 ? 'Flujo' : 'Flujos'}
                    </span>
                  </div>

                  {set.description && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                      {set.description}
                    </p>
                  )}

                  {/* Flow list preview */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-1">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Orden de Ejecución Secuencial:
                    </span>
                    <div className="space-y-1 max-h-24 overflow-y-auto">
                      {(set.flowIds || []).map((fid, fIdx) => {
                        const foundFlow = savedFlows.find(f => f.id === fid);
                        return (
                          <div
                            key={fIdx}
                            className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5 truncate"
                          >
                            <span className="text-[10px] font-mono text-slate-400 w-4">#{fIdx + 1}</span>
                            <span className="truncate">{foundFlow?.name || 'Flujo eliminado'}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(set)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      title="Editar set"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteSet(set)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors"
                      title="Eliminar set"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <button
                    onClick={() => setExecutingSet(set)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition-all shadow-sm shadow-orange-600/30"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Ejecutar Set</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      <Pagination
        currentPage={page}
        pageSize={pageSize}
        totalItems={filteredSets.length}
        onPageChange={setPage}
        onPageSizeChange={ps => {
          setPageSize(ps);
          setPage(1);
        }}
      />

      {/* Create / Edit Modal */}
      {isEditorOpen && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-5 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-[94vw] max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <ListOrdered className="w-4 h-4 text-orange-600" />
                <span>{editingSet ? 'Editar Set de Flujos' : 'Crear Nuevo Set de Flujos'}</span>
              </h2>
              <button
                onClick={() => setIsEditorOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSet} className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Nombre del Set:
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="ej: Regresión Completa de Checkout"
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500 font-medium"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Descripción (opcional):
                </label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  placeholder="Explica qué valida este conjunto de flujos..."
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Pausa entre Flujos (ms):
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={formDelayMs}
                    onChange={e => setFormDelayMs(Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-xs font-mono font-bold rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div className="flex items-center gap-2 pt-6">
                  <input
                    type="checkbox"
                    id="stopOnFailure"
                    checked={formStopOnFailure}
                    onChange={e => setFormStopOnFailure(e.target.checked)}
                    className="rounded border-slate-300 text-orange-600 focus:ring-orange-500 w-4 h-4 cursor-pointer"
                  />
                  <label htmlFor="stopOnFailure" className="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                    Detener el set si algún flujo falla
                  </label>
                </div>
              </div>

              {/* Sequential Flow Selection */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between gap-4">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Flujos del Set ({formFlowIds.length})
                  </label>

                  {/* Flow adder searchable select */}
                  <div className="w-72">
                    <SearchableSelect
                      options={flowSelectOptions}
                      value=""
                      onChange={flowId => {
                        if (flowId) handleAddFlowToForm(flowId);
                      }}
                      placeholder="+ Buscar y añadir flujo..."
                    />
                  </div>
                </div>

                {formFlowIds.length === 0 ? (
                  <div className="py-6 text-center rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-400">
                    Busca y selecciona flujos arriba para ordenarlos en este set.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {formFlowIds.map((fid, idx) => {
                      const f = savedFlows.find(flow => flow.id === fid);
                      return (
                        <div
                          key={idx}
                          className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="font-mono text-slate-400 w-5 text-center font-bold">
                              #{idx + 1}
                            </span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                              {f?.name || 'Flujo desconocido'}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              ({f?.steps?.length || 0} pasos)
                            </span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => handleMoveFlowInForm(idx, 'up')}
                              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-20"
                              title="Mover arriba"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === formFlowIds.length - 1}
                              onClick={() => handleMoveFlowInForm(idx, 'down')}
                              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-20"
                              title="Mover abajo"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveFlowFromForm(idx)}
                              className="p-1 text-slate-400 hover:text-rose-500 rounded-lg"
                              title="Quitar del set"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition-all shadow-md"
                >
                  {editingSet ? 'Guardar Cambios' : 'Crear Set'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Execution Modal */}
      {executingSet && (
        <FlowSetExecutionModal
          isOpen={!!executingSet}
          onClose={() => setExecutingSet(null)}
          flowSet={executingSet}
          allFlows={savedFlows}
          variants={variants}
          onNavigateToMetrics={onNavigateToMetrics}
        />
      )}
    </div>
  );
};
