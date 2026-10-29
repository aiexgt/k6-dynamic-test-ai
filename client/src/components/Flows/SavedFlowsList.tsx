import React, { useState, useEffect } from 'react';
import {
  BookmarkCheck,
  Trash2,
  ArrowRight,
  Play,
  Download,
  Edit2,
  Check,
  X,
  Search,
  CopyPlus,
  Lock,
  Unlock,
  User,
  History
} from 'lucide-react';
import { SavedFlow, Variant, StepExecutionResult } from '../../types';
import { api } from '../../api';
import { useFeedback } from '../../context/FeedbackContext';
import { FlowExecutionModal } from '../Playground/FlowExecutionModal';
import { StepDetailModal } from '../Playground/StepDetailModal';
import { VersionHistoryModal } from '../common/VersionHistoryModal';
import { downloadJson, sanitizeFilename } from '../../utils/fileTransfer';

interface SavedFlowsListProps {
  onLoadFlowInPlayground: (flow: SavedFlow) => void;
}

export const SavedFlowsList: React.FC<SavedFlowsListProps> = ({ onLoadFlowInPlayground }) => {
  const { confirm, prompt, toast } = useFeedback();
  const [flows, setFlows] = useState<SavedFlow[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [executingFlow, setExecutingFlow] = useState<SavedFlow | null>(null);
  const [selectedStepDetail, setSelectedStepDetail] = useState<StepExecutionResult | null>(null);
  const [editingFlowId, setEditingFlowId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');
  const [editingDesc, setEditingDesc] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const [versionHistoryTarget, setVersionHistoryTarget] = useState<SavedFlow | null>(null);

  useEffect(() => {
    loadFlows();
  }, []);

  const loadFlows = async () => {
    try {
      const [flowsData, variantsData] = await Promise.all([api.getFlows(), api.getVariants()]);
      setFlows(flowsData);
      setVariants(variantsData);
    } catch (err) {
      console.error('Error loading flows:', err);
    }
  };

  const handleExportSingle = (flow: SavedFlow) => {
    const filename = `flujo-${sanitizeFilename(flow.name)}.json`;
    downloadJson(filename, flow);
    toast(`Flujo "${flow.name}" exportado`, 'success');
  };

  const handleToggleLock = async (flow: SavedFlow) => {
    if (flow.isLocked) {
      const ok = await confirm({
        title: '¿Desbloquear flujo?',
        message: `Este flujo está marcado como bloqueado por ${flow.lockedByName || flow.lockedBy || 'un compañero'}. Cualquiera puede desbloquearlo cuando lo necesite.`,
        confirmText: 'Desbloquear Flujo',
        cancelText: 'Mantener Bloqueado'
      });
      if (!ok) return;

      try {
        const unlocked = await api.unlockFlow(flow.id);
        setFlows(prev => prev.map(f => (f.id === unlocked.id ? unlocked : f)));
        toast('Flujo desbloqueado exitosamente', 'success');
      } catch (err: any) {
        toast(err.message || 'Error al desbloquear', 'error');
      }
    } else {
      const ok = await confirm({
        title: '¿Marcar flujo como bloqueado?',
        message: `Al marcar "${flow.name}" como bloqueado se indicará al equipo que está en revisión o protegido. Cualquiera podrá desbloquearlo si requiere editarlo.`,
        confirmText: 'Marcar Bloqueado',
        cancelText: 'Cancelar'
      });
      if (!ok) return;

      try {
        const locked = await api.lockFlow(flow.id);
        setFlows(prev => prev.map(f => (f.id === locked.id ? locked : f)));
        toast('Flujo marcado como bloqueado', 'success');
      } catch (err: any) {
        toast(err.message || 'Error al bloquear', 'error');
      }
    }
  };

  const handleDelete = async (flow: SavedFlow) => {
    const ok = await confirm({
      title: flow.isLocked ? '¿Mover flujo bloqueado a la Papelera?' : '¿Mover flujo a la Papelera?',
      message: flow.isLocked
        ? `Este flujo está marcado como bloqueado por ${flow.lockedByName || flow.lockedBy || 'un compañero'}. ¿Deseas enviarlo a la papelera de todos modos?`
        : `El flujo "${flow.name}" se moverá a la Papelera de Reciclaje. Podrás restaurarlo en cualquier momento si lo necesitas.`,
      confirmText: 'Mover a Papelera',
      isDestructive: true
    });
    if (!ok) return;

    try {
      await api.deleteFlow(flow.id);
      setFlows(prev => prev.filter(f => f.id !== flow.id));
      toast('Flujo movido a la Papelera de Reciclaje', 'success');
    } catch (err: any) {
      toast(`Error: ${err.message}`, 'error');
    }
  };

  const handleClone = async (flow: SavedFlow) => {
    const newName = await prompt({
      title: 'Duplicar Flujo',
      message: `Ingresa el nuevo nombre para la copia de "${flow.name}":`,
      defaultValue: `${flow.name} (Copia)`,
      confirmText: 'Duplicar',
      placeholder: 'Nombre del flujo'
    });
    if (!newName || !newName.trim()) return;

    try {
      const cloned = await api.cloneFlow(flow.id, newName.trim());
      setFlows(prev => [cloned, ...prev]);
      toast(`Flujo "${cloned.name}" duplicado con éxito`, 'success');
    } catch (err: any) {
      toast(err.message || 'Error al duplicar flujo', 'error');
    }
  };

  const handleStartEdit = (flow: SavedFlow) => {
    setEditingFlowId(flow.id);
    setEditingName(flow.name);
    setEditingDesc(flow.description || '');
  };

  const handleCancelEdit = () => {
    setEditingFlowId(null);
    setEditingName('');
    setEditingDesc('');
  };

  const handleSaveEdit = async (flowId: string) => {
    if (!editingName.trim()) {
      toast('El nombre del flujo no puede estar vacío', 'error');
      return;
    }
    try {
      const updated = await api.updateFlow(flowId, {
        name: editingName.trim(),
        description: editingDesc.trim()
      });
      setFlows(prev =>
        prev.map(f => (f.id === updated.id ? { ...f, name: updated.name, description: updated.description } : f))
      );
      toast('Nombre del flujo actualizado con éxito', 'success');
      handleCancelEdit();
    } catch (err: any) {
      toast(`Error al actualizar flujo: ${err.message}`, 'error');
    }
  };

  const handleQuickRun = (flow: SavedFlow) => {
    setExecutingFlow(flow);
  };

  const filteredFlows = flows.filter(flow => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const nameMatch = flow.name.toLowerCase().includes(term);
    const descMatch = (flow.description || '').toLowerCase().includes(term);
    const categoryMatch = (flow.steps || []).some(s => (s.category || '').toLowerCase().includes(term));
    return nameMatch || descMatch || categoryMatch;
  });

  return (
    <div className="max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <BookmarkCheck className="w-4 h-4 text-orange-600 dark:text-orange-400" />
          <span>
            Flujos Guardados ({filteredFlows.length}
            {filteredFlows.length !== flows.length ? ` de ${flows.length}` : ''})
          </span>
        </h1>
      </div>

      {/* Buscador de Flujos */}
      {flows.length > 0 && (
        <div className="relative w-full">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar flujos por nombre, descripción o categorías de pasos..."
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-9 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-orange-500 transition-colors shadow-xs"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              title="Limpiar búsqueda"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {flows.length === 0 ? (
        <div className="py-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 p-6">
          <p className="text-xs text-slate-500 mb-2">No tienes flujos guardados todavía.</p>
          <p className="text-[11px] text-slate-400">
            Arma tus pasos con categorías en el <strong>Playground</strong> y presiona <strong>"Guardar Flujo"</strong>.
          </p>
        </div>
      ) : filteredFlows.length === 0 ? (
        <div className="py-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 p-6">
          <p className="text-xs text-slate-500 mb-2">
            No se encontraron flujos que coincidan con "<strong>{searchTerm}</strong>".
          </p>
          <button
            onClick={() => setSearchTerm('')}
            className="text-xs font-semibold text-orange-600 dark:text-orange-400 hover:underline"
          >
            Limpiar búsqueda
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
          {filteredFlows.map(flow => {
            const activeSteps = (flow.steps || []).filter(s => !s.skipped);

            return (
              <div
                key={flow.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-sm transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono font-bold bg-orange-500/10 text-orange-600 dark:text-orange-400 px-2 py-0.5 rounded">
                        {activeSteps.length} pasos
                      </span>
                      {flow.isLocked && (
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60 flex items-center gap-1"
                          title={`Flujo bloqueado por ${flow.lockedByName || flow.lockedBy || 'otro desarrollador'} para proteger la prueba`}
                        >
                          <Lock className="w-2.5 h-2.5" />
                          <span>{flow.lockedByName ? flow.lockedByName.split(' ')[0] : 'Bloqueado'}</span>
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(flow.updatedAt || flow.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  {editingFlowId === flow.id ? (
                    <div className="space-y-1.5 my-1">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={editingName}
                          onChange={e => setEditingName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleSaveEdit(flow.id);
                            if (e.key === 'Escape') handleCancelEdit();
                          }}
                          placeholder="Nombre del flujo"
                          autoFocus
                          className="flex-1 bg-slate-50 dark:bg-slate-800 border border-orange-500 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-900 dark:text-slate-100 outline-none shadow-xs"
                        />
                        <button
                          onClick={() => handleSaveEdit(flow.id)}
                          className="p-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                          title="Guardar nombre"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="p-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition-colors"
                          title="Cancelar"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <input
                        type="text"
                        value={editingDesc}
                        onChange={e => setEditingDesc(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleSaveEdit(flow.id);
                          if (e.key === 'Escape') handleCancelEdit();
                        }}
                        placeholder="Descripción opcional"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-[11px] text-slate-600 dark:text-slate-300 outline-none"
                      />
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-1 group/title">
                        <h3
                          onClick={() => handleStartEdit(flow)}
                          className="text-xs font-bold text-slate-900 dark:text-slate-100 hover:text-orange-600 dark:hover:text-orange-400 cursor-pointer transition-colors flex items-center gap-1.5"
                          title="Clic para editar nombre del flujo"
                        >
                          <span>{flow.name}</span>
                          <Edit2 className="w-3 h-3 text-slate-400 opacity-0 group-hover/title:opacity-100 transition-opacity" />
                        </h3>
                      </div>
                      {flow.description && (
                        <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                          {flow.description}
                        </p>
                      )}
                    </>
                  )}

                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {(flow.steps || []).map((step, idx) => (
                      <span
                        key={step.id || idx}
                        className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                          step.skipped
                            ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 line-through'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {step.category}
                      </span>
                    ))}
                  </div>
                  {(flow.createdByName || flow.updatedByName) && (
                    <div className="mt-2 text-[10px] text-slate-400 flex items-center justify-between gap-1.5 truncate">
                      <div className="flex items-center gap-1 truncate">
                        <User className="w-2.5 h-2.5 flex-shrink-0" />
                        <span className="truncate">
                          {flow.updatedByName ? `Última edición: ${flow.updatedByName}` : `Creado por: ${flow.createdByName}`}
                        </span>
                      </div>
                      {flow.updatedAt && (
                        <span className="text-[9px] text-slate-400 shrink-0">
                          {new Date(flow.updatedAt).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleToggleLock(flow)}
                      className={`p-1 rounded transition-colors ${
                        flow.isLocked
                          ? 'text-amber-500 hover:text-amber-600 bg-amber-50 dark:bg-amber-950/40'
                          : 'text-slate-400 hover:text-amber-500'
                      }`}
                      title={
                        flow.isLocked
                          ? `Desbloquear flujo (bloqueado por ${flow.lockedByName || 'equipo'})`
                          : 'Marcar flujo como bloqueado'
                      }
                    >
                      {flow.isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => setVersionHistoryTarget(flow)}
                      className="p-1 rounded text-slate-400 hover:text-orange-500 transition-colors"
                      title="Historial de versiones y rollback"
                    >
                      <History className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleStartEdit(flow)}
                      className="p-1 rounded text-slate-400 hover:text-orange-500 transition-colors"
                      title="Editar nombre y descripción"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleClone(flow)}
                      className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                      title="Duplicar flujo"
                    >
                      <CopyPlus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(flow)}
                      className="p-1 rounded text-slate-400 hover:text-rose-500 transition-colors"
                      title={flow.isLocked ? 'Flujo bloqueado (puedes enviarlo a la papelera)' : 'Mover flujo a la papelera'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleExportSingle(flow)}
                      className="p-1 rounded text-slate-400 hover:text-orange-500 transition-colors"
                      title="Exportar flujo a JSON"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleQuickRun(flow)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-300 text-xs font-semibold"
                      title="Ejecutar flujo con animación de montaña"
                    >
                      <Play className="w-3 h-3 text-orange-500 fill-orange-500" />
                      <span>Ejecutar</span>
                    </button>

                    <button
                      onClick={() => onLoadFlowInPlayground(flow)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold"
                    >
                      <span>Cargar</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Mountain Expedition Execution Modal */}
      {executingFlow && (
        <FlowExecutionModal
          isOpen={!!executingFlow}
          onClose={() => setExecutingFlow(null)}
          flowName={executingFlow.name}
          steps={executingFlow.steps}
          variants={variants}
          onExecutionComplete={(result) => {
            if (result.status === 'SUCCESS') {
              toast(`¡Flujo completado en ${result.totalTimeMs}ms! 🎉`, 'success');
            } else {
              toast(`Flujo detenido en ${result.failedAtCategory || 'paso'}`, 'error');
            }
          }}
          onInspectStep={(stepResult) => setSelectedStepDetail(stepResult)}
        />
      )}

      {/* Step Detail Modal when inspecting from flows */}
      {selectedStepDetail && (
        <StepDetailModal
          step={selectedStepDetail}
          onClose={() => setSelectedStepDetail(null)}
        />
      )}

      {/* Version History & Rollback Modal */}
      {versionHistoryTarget && (
        <VersionHistoryModal
          isOpen={!!versionHistoryTarget}
          onClose={() => setVersionHistoryTarget(null)}
          entityType="FLOW"
          entityId={versionHistoryTarget.id}
          entityTitle={versionHistoryTarget.name}
          onRollbackSuccess={(restoredFlow: SavedFlow) => {
            setFlows(prev => prev.map(f => (f.id === restoredFlow.id ? restoredFlow : f)));
          }}
        />
      )}
    </div>
  );
};
