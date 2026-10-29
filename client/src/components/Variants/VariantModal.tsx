import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Save } from 'lucide-react';
import { Variant } from '../../types';
import { SearchableSelect } from '../common/SearchableSelect';

interface VariantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (variantData: Partial<Variant>) => void;
  initialVariant?: Variant | null;
  categories: string[];
  defaultCategory?: string;
}

export const VariantModal: React.FC<VariantModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialVariant,
  categories,
  defaultCategory = 'Crear Carrito'
}) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState(defaultCategory);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isCreatingNewCat, setIsCreatingNewCat] = useState(false);
  const [description, setDescription] = useState('');
  const [query, setQuery] = useState('');
  const [defaultVariablesStr, setDefaultVariablesStr] = useState('{}');
  const [contextOutputsStr, setContextOutputsStr] = useState('cartId');
  const [contextMappingStr, setContextMappingStr] = useState('{}');
  const [isVirtualOnly, setIsVirtualOnly] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

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
    if (initialVariant) {
      setName(initialVariant.name);
      setCategory(initialVariant.category || 'General');
      setIsCreatingNewCat(false);
      setDescription(initialVariant.description || '');
      setQuery(initialVariant.query);
      setDefaultVariablesStr(JSON.stringify(initialVariant.defaultVariables || {}, null, 2));
      setContextOutputsStr((initialVariant.contextOutputs || []).join(', '));
      setContextMappingStr(JSON.stringify(initialVariant.contextMapping || {}, null, 2));
      setIsVirtualOnly(!!initialVariant.isVirtualOnly);
    } else {
      setName('');
      setCategory(defaultCategory);
      setIsCreatingNewCat(false);
      setDescription('');
      setQuery(`mutation MyMutation($cartId: String!) {\n  // GraphQL mutation\n}`);
      setDefaultVariablesStr('{}');
      setContextOutputsStr(defaultCategory === 'Crear Carrito' ? 'cartId' : '');
      setContextMappingStr(
        defaultCategory === 'Crear Carrito'
          ? '{\n  "cartId": "createEmptyCart"\n}'
          : defaultCategory === 'Finalizar Carrito'
          ? '{\n  "orderNumber": "placeOrder.order.order_number"\n}'
          : '{}'
      );
      setIsVirtualOnly(false);
    }
    setJsonError(null);
  }, [initialVariant, defaultCategory, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let parsedVars = {};
    let parsedMapping = {};
    try {
      parsedVars = JSON.parse(defaultVariablesStr || '{}');
      parsedMapping = JSON.parse(contextMappingStr || '{}');
    } catch (err: any) {
      setJsonError(`JSON inválido: ${err.message}`);
      return;
    }

    const contextOutputs = contextOutputsStr
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const finalCategory = isCreatingNewCat && newCategoryName.trim() ? newCategoryName.trim() : category;

    onSave({
      name,
      category: finalCategory,
      description,
      query,
      defaultVariables: parsedVars,
      contextOutputs,
      contextMapping: parsedMapping,
      isVirtualOnly
    });
    onClose();
  };

  const categoryOptions = categories.map(c => ({ value: c, label: c }));

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden my-6 transition-colors">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            {initialVariant ? 'Editar Variante' : 'Nueva Variante'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nombre
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ej. Simple Product"
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Categoría
                </label>
                <button
                  type="button"
                  onClick={() => setIsCreatingNewCat(prev => !prev)}
                  className="text-[10px] text-orange-600 dark:text-orange-400 hover:underline"
                >
                  {isCreatingNewCat ? 'Elegir existente' : '+ Crear nueva'}
                </button>
              </div>

              {isCreatingNewCat ? (
                <input
                  type="text"
                  required
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  placeholder="Nombre de nueva categoría..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500"
                />
              ) : (
                <SearchableSelect
                  options={categoryOptions}
                  value={category}
                  onChange={setCategory}
                  placeholder="Seleccionar Categoría"
                />
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Documento GraphQL (Mutation / Query)
            </label>
            <textarea
              rows={6}
              required
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="mutation ($cartId: String!) { ... }"
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 font-mono text-xs text-slate-800 dark:text-orange-200 focus:outline-none focus:border-orange-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Variables por Defecto (JSON)
              </label>
              <textarea
                rows={3}
                value={defaultVariablesStr}
                onChange={e => {
                  setDefaultVariablesStr(e.target.value);
                  setJsonError(null);
                }}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2 font-mono text-xs text-slate-800 dark:text-emerald-300 focus:outline-none focus:border-orange-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Ruta de Extracción Contextual (JSON Path)
              </label>
              <textarea
                rows={3}
                value={contextMappingStr}
                onChange={e => {
                  setContextMappingStr(e.target.value);
                  setJsonError(null);
                }}
                placeholder='{\n  "cartId": "createEmptyCart"\n}'
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2 font-mono text-xs text-slate-800 dark:text-sky-300 focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>

          {jsonError && <p className="text-rose-500 text-xs font-mono">{jsonError}</p>}

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold"
            >
              <Save className="w-3.5 h-3.5" />
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
