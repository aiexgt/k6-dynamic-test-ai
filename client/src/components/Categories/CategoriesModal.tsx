import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, Edit2, Check, FolderTree } from 'lucide-react';
import { Variant } from '../../types';
import { useFeedback } from '../../context/FeedbackContext';

interface CategoriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: string[];
  variants: Variant[];
  onCreateCategory: (name: string) => void;
  onRenameCategory: (oldName: string, newName: string) => void;
  onDeleteCategory: (name: string) => void;
}

export const CategoriesModal: React.FC<CategoriesModalProps> = ({
  isOpen,
  onClose,
  categories,
  variants,
  onCreateCategory,
  onRenameCategory,
  onDeleteCategory
}) => {
  const { confirm } = useFeedback();
  const [newCatName, setNewCatName] = useState('');
  const [editingCatName, setEditingCatName] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

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

  if (!isOpen) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    onCreateCategory(newCatName.trim());
    setNewCatName('');
  };

  const startRename = (cat: string) => {
    setEditingCatName(cat);
    setRenameValue(cat);
  };

  const handleSaveRename = (oldName: string) => {
    if (!renameValue.trim() || renameValue.trim() === oldName) {
      setEditingCatName(null);
      return;
    }
    onRenameCategory(oldName, renameValue.trim());
    setEditingCatName(null);
  };

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden transition-colors">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-orange-600 dark:text-orange-400" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Administrar Categorías
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Add Category Form */}
          <form onSubmit={handleCreate} className="flex gap-2">
            <input
              type="text"
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              placeholder="Nueva categoría..."
              className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500"
            />
            <button
              type="submit"
              disabled={!newCatName.trim()}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold disabled:opacity-40 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Añadir</span>
            </button>
          </form>

          {/* Categories List */}
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {categories.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                No hay categorías registradas.
              </div>
            ) : (
              categories.map(cat => {
                const count = variants.filter(v => v.category === cat).length;
                const isEditing = editingCatName === cat;

                return (
                  <div
                    key={cat}
                    className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between gap-2 transition-colors"
                  >
                    {isEditing ? (
                      <div className="flex-1 flex items-center gap-1.5">
                        <input
                          type="text"
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          className="flex-1 bg-white dark:bg-slate-900 border border-orange-500 rounded px-2 py-0.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveRename(cat)}
                          className="p-1 text-emerald-600 hover:text-emerald-700"
                          title="Guardar"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCatName(null)}
                          className="p-1 text-slate-400 hover:text-slate-600"
                          title="Cancelar"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 truncate flex-1">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                            {cat}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                            {count} variantes
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          {cat !== 'Sin Categoría' && (
                            <button
                              type="button"
                              onClick={() => startRename(cat)}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                              title="Renombrar"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {cat !== 'Sin Categoría' && (
                            <button
                              type="button"
                              onClick={async () => {
                                const ok = await confirm({
                                  title: `¿Eliminar la categoría "${cat}"?`,
                                  message: 'Las variantes asociadas a esta categoría pasarán automáticamente a "Sin Categoría".',
                                  confirmText: 'Eliminar categoría',
                                  isDestructive: true
                                });
                                if (ok) {
                                  onDeleteCategory(cat);
                                }
                              }}
                              className="p-1 rounded text-slate-400 hover:text-rose-500"
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
        </div>
      </div>
    </div>,
    document.body
  );
};
