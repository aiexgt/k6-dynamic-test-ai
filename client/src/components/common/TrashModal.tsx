import React, { useState, useEffect } from 'react';
import { X, Trash2, RotateCcw, Layers, BookmarkCheck, Search } from 'lucide-react';
import { SavedFlow, Variant } from '../../types';
import { api } from '../../api';
import { useFeedback } from '../../context/FeedbackContext';

interface TrashModalProps {
  isOpen: boolean;
  onClose: () => void;
  onItemRestored: () => void;
}

export const TrashModal: React.FC<TrashModalProps> = ({
  isOpen,
  onClose,
  onItemRestored
}) => {
  const { toast, confirm } = useFeedback();
  const [loading, setLoading] = useState(false);
  const [trashData, setTrashData] = useState<{ flows: SavedFlow[]; variants: Variant[] }>({ flows: [], variants: [] });
  const [activeTab, setActiveTab] = useState<'all' | 'flows' | 'variants'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const loadTrash = async () => {
    try {
      setLoading(true);
      const data = await api.getTrash();
      setTrashData(data);
    } catch (err: any) {
      toast(`Error cargando papelera: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadTrash();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRestore = async (type: 'FLOW' | 'VARIANT', id: string, name: string) => {
    try {
      await api.restoreFromTrash(type, id);
      toast(`"${name}" ha sido restaurado a la lista activa.`, 'success');
      await loadTrash();
      onItemRestored();
    } catch (err: any) {
      toast(`Error al restaurar: ${err.message}`, 'error');
    }
  };

  const handlePurge = async (type: 'FLOW' | 'VARIANT', id: string, name: string) => {
    const ok = await confirm({
      title: '¿Eliminar definitivamente?',
      message: `Esta acción no se puede deshacer. "${name}" será borrado permanentemente de la base de datos compartida.`,
      confirmText: 'Sí, eliminar permanentemente',
      cancelText: 'Cancelar',
      isDestructive: true
    });

    if (!ok) return;

    try {
      await api.purgeFromTrash(type, id);
      toast(`"${name}" fue eliminado definitivamente.`, 'success');
      await loadTrash();
    } catch (err: any) {
      toast(`Error al purgar: ${err.message}`, 'error');
    }
  };

  const filteredFlows = trashData.flows.filter(f =>
    f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (f.deletedByName || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredVariants = trashData.variants.filter(v =>
    v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (v.category || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (v.deletedByName || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalItems = trashData.flows.length + trashData.variants.length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 flex items-center justify-center text-rose-600 dark:text-rose-400">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Papelera de Reciclaje
                </h2>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  {totalItems} {totalItems === 1 ? 'elemento' : 'elementos'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Los elementos eliminados se conservan aquí para evitar pérdidas accidentales
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

        {/* Filters & Search */}
        <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/30 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1 rounded-md font-medium transition-all ${
                activeTab === 'all'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Todos ({totalItems})
            </button>
            <button
              onClick={() => setActiveTab('flows')}
              className={`px-3 py-1 rounded-md font-medium transition-all ${
                activeTab === 'flows'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Flujos ({trashData.flows.length})
            </button>
            <button
              onClick={() => setActiveTab('variants')}
              className={`px-3 py-1 rounded-md font-medium transition-all ${
                activeTab === 'variants'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Variantes ({trashData.variants.length})
            </button>
          </div>

          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar en papelera..."
              className="w-full text-xs pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all"
            />
          </div>
        </div>

        {/* Content List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {loading ? (
            <div className="text-center py-12 text-xs text-slate-500">Cargando elementos eliminados...</div>
          ) : totalItems === 0 ? (
            <div className="text-center py-12">
              <Trash2 className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-700 mb-2" />
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                La papelera está vacía
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                No hay flujos ni variantes eliminados recientemente
              </p>
            </div>
          ) : (
            <>
              {/* Flows */}
              {(activeTab === 'all' || activeTab === 'flows') &&
                filteredFlows.map(flow => (
                  <div
                    key={flow.id}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 hover:border-rose-200 dark:hover:border-rose-900/40 transition-colors flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-900/40 flex items-center gap-1">
                          <BookmarkCheck className="w-3 h-3" /> FLUJO
                        </span>
                        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                          {flow.name}
                        </h4>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {flow.steps?.length || 0} pasos • Eliminado por:{' '}
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {flow.deletedByName || flow.deletedBy || 'Desconocido'}
                        </span>
                        {flow.deletedAt && (
                          <span> • {new Date(flow.deletedAt).toLocaleString()}</span>
                        )}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => handleRestore('FLOW', flow.id, flow.name)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                        title="Restaurar este flujo"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Restaurar</span>
                      </button>
                      <button
                        onClick={() => handlePurge('FLOW', flow.id, flow.name)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                        title="Eliminar permanentemente"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}

              {/* Variants */}
              {(activeTab === 'all' || activeTab === 'variants') &&
                filteredVariants.map(variant => (
                  <div
                    key={variant.id}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 hover:border-rose-200 dark:hover:border-rose-900/40 transition-colors flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/40 flex items-center gap-1">
                          <Layers className="w-3 h-3" /> {variant.category}
                        </span>
                        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                          {variant.name}
                        </h4>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {variant.apiType || 'GRAPHQL'} • Eliminado por:{' '}
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {variant.deletedByName || variant.deletedBy || 'Desconocido'}
                        </span>
                        {variant.deletedAt && (
                          <span> • {new Date(variant.deletedAt).toLocaleString()}</span>
                        )}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => handleRestore('VARIANT', variant.id, variant.name)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                        title="Restaurar esta variante"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Restaurar</span>
                      </button>
                      <button
                        onClick={() => handlePurge('VARIANT', variant.id, variant.name)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                        title="Eliminar permanentemente"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
