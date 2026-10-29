import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  History,
  RotateCcw,
  CheckCircle2,
  Calendar,
  User,
  ChevronRight,
  ChevronDown,
  Layers,
  Sparkles,
  Loader2
} from 'lucide-react';
import { ItemVersion } from '../../types';
import { api } from '../../api';
import { useFeedback } from '../../context/FeedbackContext';

interface VersionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: 'FLOW' | 'VARIANT' | 'CATEGORIES';
  entityId: string;
  entityTitle: string;
  onRollbackSuccess?: (restoredData: any) => void;
}

export const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({
  isOpen,
  onClose,
  entityType,
  entityId,
  entityTitle,
  onRollbackSuccess
}) => {
  const { toast, confirm } = useFeedback();
  const [versions, setVersions] = useState<ItemVersion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedVersionId, setExpandedVersionId] = useState<string | null>(null);
  const [isRollingBack, setIsRollingBack] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && entityId) {
      loadVersions();
    }
  }, [isOpen, entityType, entityId]);

  // Lock body scroll and handle Escape key
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen, onClose]);

  const loadVersions = async () => {
    setIsLoading(true);
    try {
      let list: ItemVersion[] = [];
      if (entityType === 'CATEGORIES') {
        list = await api.getCategoriesVersions();
      } else {
        list = await api.getEntityVersions(entityType, entityId);
      }
      setVersions(list);
    } catch (err: any) {
      toast(`Error cargando historial de versiones: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleRollback = async (ver: ItemVersion) => {
    const ok = await confirm({
      title: `¿Regresar a la versión v${ver.versionNumber}?`,
      message: `Esta acción restaurará "${entityTitle}" exactamente al estado de esta versión (${ver.changeSummary || 'Sin resumen'}). Se creará un nuevo punto en el historial documentando la restauración.`,
      confirmText: `Restaurar a v${ver.versionNumber}`,
      cancelText: 'Cancelar'
    });
    if (!ok) return;

    setIsRollingBack(ver.id);
    try {
      let restoredData: any;
      if (entityType === 'CATEGORIES') {
        restoredData = await api.rollbackCategoriesVersion(ver.id);
      } else {
        const res = await api.rollbackEntityVersion(entityType, entityId, ver.id);
        restoredData = res.restored;
      }

      toast(`¡Restaurado exitosamente a la versión v${ver.versionNumber}!`, 'success');
      if (onRollbackSuccess) {
        onRollbackSuccess(restoredData);
      }
      onClose();
    } catch (err: any) {
      toast(`Error al restaurar versión: ${err.message}`, 'error');
    } finally {
      setIsRollingBack(null);
    }
  };

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return new Intl.DateTimeFormat('es-MX', {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(d);
    } catch {
      return isoStr;
    }
  };

  const typeLabels = {
    FLOW: 'Flujo',
    VARIANT: 'Variante',
    CATEGORIES: 'Categorías'
  };

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] transition-colors">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                  {typeLabels[entityType]}
                </span>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate max-w-xs">
                  {entityTitle}
                </h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Historial de versiones y puntos de restauración en el tiempo
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content list */}
        <div className="p-5 overflow-y-auto flex-1 space-y-3">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
              <span className="text-xs font-medium">Cargando versiones...</span>
            </div>
          ) : versions.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400 text-center">
              <Layers className="w-8 h-8 text-slate-300 dark:text-slate-700" />
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Aún no hay versiones registradas para este elemento
              </p>
              <p className="text-[11px] text-slate-400 max-w-xs">
                Cada vez que guardes o modifiques este elemento se creará automáticamente una nueva versión.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {versions.map((ver, idx) => {
                const isCurrent = idx === 0;
                const isExpanded = expandedVersionId === ver.id;

                return (
                  <div
                    key={ver.id}
                    className={`rounded-xl border transition-all overflow-hidden ${
                      isCurrent
                        ? 'border-orange-500/50 bg-orange-50/20 dark:bg-orange-950/10 shadow-xs'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="p-3.5 flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                            isCurrent
                              ? 'bg-orange-600 text-white shadow-xs'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          v{ver.versionNumber}
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                              {ver.changeSummary || `Versión ${ver.versionNumber}`}
                            </span>
                            {isCurrent && (
                              <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 flex items-center gap-1">
                                <CheckCircle2 className="w-2.5 h-2.5" />
                                <span>Actual</span>
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3 text-slate-400" />
                              <strong className="text-slate-700 dark:text-slate-300">
                                {ver.createdByName || ver.createdBy || 'Desarrollador'}
                              </strong>
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-slate-400" />
                              <span>{formatDate(ver.createdAt)}</span>
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {!isCurrent && (
                          <button
                            type="button"
                            onClick={() => handleRollback(ver)}
                            disabled={isRollingBack === ver.id}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white shadow-xs transition-colors flex items-center gap-1"
                            title="Regresar a esta versión"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>{isRollingBack === ver.id ? 'Restaurando...' : 'Restaurar'}</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setExpandedVersionId(isExpanded ? null : ver.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          title="Ver detalle del snapshot"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Snapshot Preview */}
                    {isExpanded && (
                      <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/40 text-xs">
                        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 mb-1.5">
                          <span>Instantánea de datos (Snapshot)</span>
                          {ver.snapshot?.steps && (
                            <span className="text-orange-600 dark:text-orange-400">
                              {ver.snapshot.steps.length} pasos configurados
                            </span>
                          )}
                          {Array.isArray(ver.snapshot) && (
                            <span className="text-orange-600 dark:text-orange-400">
                              {ver.snapshot.length} categorías
                            </span>
                          )}
                        </div>
                        <pre className="p-2.5 rounded-lg bg-slate-900 text-slate-200 font-mono text-[10px] max-h-48 overflow-y-auto overflow-x-auto">
                          {JSON.stringify(ver.snapshot, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-orange-500" />
            <span>Todos los miembros pueden consultar o regresar a cualquier versión sin restricciones.</span>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
