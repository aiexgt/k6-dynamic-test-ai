import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, BookmarkPlus, Save, CopyPlus, Lock } from 'lucide-react';
import { SavedFlow } from '../../types';

interface SaveFlowModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveNew: (name: string, description: string) => void;
  onOverwrite?: (flowId: string, name: string, description: string) => void;
  activeFlow?: SavedFlow | null;
}

export const SaveFlowModal: React.FC<SaveFlowModalProps> = ({
  isOpen,
  onClose,
  onSaveNew,
  onOverwrite,
  activeFlow
}) => {
  const [mode, setMode] = useState<'overwrite' | 'new'>('overwrite');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

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

  useEffect(() => {
    if (isOpen) {
      if (activeFlow) {
        setMode('overwrite');
        setName(activeFlow.name);
        setDescription(activeFlow.description || '');
      } else {
        setMode('new');
        setName(`TC-${new Date().toISOString().substring(5, 10)}`);
        setDescription('');
      }
    }
  }, [isOpen, activeFlow]);

  const handleModeChange = (newMode: 'overwrite' | 'new') => {
    setMode(newMode);
    if (newMode === 'new' && activeFlow) {
      setName(`${activeFlow.name} (Copia)`);
    } else if (newMode === 'overwrite' && activeFlow) {
      setName(activeFlow.name);
      setDescription(activeFlow.description || '');
    }
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (mode === 'overwrite' && activeFlow && onOverwrite) {
      onOverwrite(activeFlow.id, name.trim(), description.trim());
    } else {
      onSaveNew(name.trim(), description.trim());
    }
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden transition-colors">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {mode === 'overwrite' ? (
              <Save className="w-4 h-4 text-orange-500" />
            ) : (
              <BookmarkPlus className="w-4 h-4 text-orange-500" />
            )}
            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
              {activeFlow ? 'Guardar Flujo' : 'Guardar Nuevo Flujo'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Option switcher if there is an active flow */}
        {activeFlow && (
          <div className="px-5 pt-4 pb-1 space-y-2">
            {activeFlow.isLocked && (
              <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-200 text-[11px] flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>
                  Flujo marcado como bloqueado por <strong>{activeFlow.lockedByName || activeFlow.lockedBy || 'un compañero'}</strong>.
                </span>
              </div>
            )}
            <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl gap-1">
              <button
                type="button"
                onClick={() => handleModeChange('overwrite')}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
                  mode === 'overwrite'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Save className="w-3.5 h-3.5 text-orange-500" />
                <span>Sobrescribir</span>
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('new')}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
                  mode === 'new'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <CopyPlus className="w-3.5 h-3.5 text-orange-500" />
                <span>Como Nuevo</span>
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {mode === 'overwrite' && activeFlow && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Se actualizarán los pasos del flujo actual <strong className="text-slate-700 dark:text-slate-300">"{activeFlow.name}"</strong> con la configuración del playground.
            </p>
          )}

          {mode === 'new' && activeFlow && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Se creará un flujo independiente sin modificar <strong className="text-slate-700 dark:text-slate-300">"{activeFlow.name}"</strong>.
            </p>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Nombre del Flujo
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ej: TC04: Express + Cuotas"
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Descripción (Opcional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Propósito de la prueba o flujo..."
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
            >
              {mode === 'overwrite' ? (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Actualizar Flujo</span>
                </>
              ) : (
                <>
                  <BookmarkPlus className="w-3.5 h-3.5" />
                  <span>Guardar Nuevo</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
