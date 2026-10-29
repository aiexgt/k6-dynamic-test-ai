import React, { useState } from 'react';
import { FolderTree, Plus, Trash2, Edit2, Check, X, ArrowLeft, History, Layers, ShieldCheck } from 'lucide-react';
import { Variant } from '../../types';
import { useFeedback } from '../../context/FeedbackContext';
import { VersionHistoryModal } from '../common/VersionHistoryModal';

interface CategoriesViewProps {
  categories: string[];
  variants: Variant[];
  onCreateCategory: (name: string) => void;
  onRenameCategory: (oldName: string, newName: string) => void;
  onDeleteCategory: (name: string) => void;
  onBack?: () => void;
  onReloadCategories?: () => void;
}

export const CategoriesView: React.FC<CategoriesViewProps> = ({
  categories,
  variants,
  onCreateCategory,
  onRenameCategory,
  onDeleteCategory,
  onBack,
  onReloadCategories
}) => {
  const { confirm, toast } = useFeedback();
  const [newCatName, setNewCatName] = useState('');
  const [editingCatName, setEditingCatName] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newCatName.trim();
    if (!clean) return;
    if (categories.some(c => c.toLowerCase() === clean.toLowerCase())) {
      toast('Esta categoría ya existe', 'error');
      return;
    }
    onCreateCategory(clean);
    setNewCatName('');
  };

  const startRename = (cat: string) => {
    setEditingCatName(cat);
    setRenameValue(cat);
  };

  const handleSaveRename = (oldName: string) => {
    const clean = renameValue.trim();
    if (!clean || clean === oldName) {
      setEditingCatName(null);
      return;
    }
    onRenameCategory(oldName, clean);
    setEditingCatName(null);
  };

  return (
    <div className="max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Volver</span>
            </button>
          )}
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <FolderTree className="w-5 h-5 text-orange-500" />
              <span>Gestión de Categorías ({categories.length})</span>
            </h1>
          </div>
        </div>

        <button
          onClick={() => setIsHistoryOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors shadow-xs"
        >
          <History className="w-3.5 h-3.5 text-orange-500" />
          <span>Historial de Versiones</span>
        </button>
      </div>

      {/* Add Category Form Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
        <form onSubmit={handleCreate} className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <input
              type="text"
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              placeholder="Escribe el nombre de la nueva categoría (ej. Carrito, Envío, Pago...)"
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500"
            />
          </div>
          <button
            type="submit"
            disabled={!newCatName.trim()}
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition-all shadow-sm disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Crear Categoría</span>
          </button>
        </form>
      </div>

      {/* Categories Grid List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {categories.length === 0 ? (
          <div className="col-span-2 py-12 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
            No hay categorías creadas.
          </div>
        ) : (
          categories.map(cat => {
            const count = variants.filter(v => v.category === cat).length;
            const isEditing = editingCatName === cat;
            const isSystemCategory = cat === 'Sin Categoría';

            return (
              <div
                key={cat}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
              >
                {isEditing ? (
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="text"
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      className="flex-1 bg-slate-50 dark:bg-slate-950 border border-orange-500 rounded-lg px-2.5 py-1 text-xs text-slate-800 dark:text-slate-200 focus:outline-none"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveRename(cat)}
                      className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors"
                      title="Guardar"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingCatName(null)}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      title="Cancelar"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1 truncate flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                          {cat}
                        </span>
                        {isSystemCategory && (
                          <span className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-semibold">
                            <ShieldCheck className="w-3 h-3 text-orange-500" />
                            SISTEMA
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <Layers className="w-3 h-3" />
                        <span>{count} {count === 1 ? 'variante' : 'variantes'}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {!isSystemCategory && (
                        <button
                          type="button"
                          onClick={() => startRename(cat)}
                          className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          title="Renombrar categoría"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {!isSystemCategory && (
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = await confirm({
                              title: `¿Eliminar categoría "${cat}"?`,
                              message: 'Las variantes que pertenezcan a esta categoría se moverán automáticamente a "Sin Categoría".',
                              confirmText: 'Eliminar categoría',
                              isDestructive: true
                            });
                            if (ok) {
                              onDeleteCategory(cat);
                            }
                          }}
                          className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                          title="Eliminar categoría"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      <VersionHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        entityType="CATEGORIES"
        entityId="all_categories"
        entityTitle="Categorías de Checkout"
        onRollbackSuccess={() => {
          if (onReloadCategories) onReloadCategories();
        }}
      />
    </div>
  );
};
