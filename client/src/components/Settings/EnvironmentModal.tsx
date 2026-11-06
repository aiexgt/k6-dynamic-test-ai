import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, Edit2, Server, Save, CopyPlus } from 'lucide-react';
import { Environment } from '../../types';
import { useFeedback } from '../../context/FeedbackContext';

interface HeaderRow {
  id: string;
  key: string;
  value: string;
}

interface EnvironmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  environments: Environment[];
  activeEnvironmentId?: string;
  onSelectEnvironment: (id: string) => void;
  onSaveEnvironment: (env: Partial<Environment>) => void;
  onDeleteEnvironment: (id: string) => void;
  onCloneEnvironment?: (id: string, name?: string) => void;
}

export const EnvironmentModal: React.FC<EnvironmentModalProps> = ({
  isOpen,
  onClose,
  environments,
  activeEnvironmentId,
  onSelectEnvironment,
  onSaveEnvironment,
  onDeleteEnvironment,
  onCloneEnvironment
}) => {
  const { prompt } = useFeedback();
  const [editingEnv, setEditingEnv] = useState<Partial<Environment> | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [graphqlHeaderRows, setGraphqlHeaderRows] = useState<HeaderRow[]>([]);
  const [restHeaderRows, setRestHeaderRows] = useState<HeaderRow[]>([]);

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

  const handleOpenCreate = () => {
    setEditingEnv({
      name: '',
      magentoUrl: 'https://',
      magentoRestUrl: '',
      useMockSimulator: false,
      customHeaders: { 'Content-Type': 'application/json' }
    });
    setGraphqlHeaderRows([
      { id: 'g1', key: 'Content-Type', value: 'application/json' },
      { id: 'g2', key: 'AuthToken', value: '' }
    ]);
    setRestHeaderRows([
      { id: 'r1', key: 'Content-Type', value: 'application/json' },
      { id: 'r2', key: 'Authorization', value: 'Bearer {{customerToken}}' }
    ]);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (env: Environment) => {
    setEditingEnv(env);
    let gqlHeaders: Record<string, string> = env.graphqlHeaders ? { ...env.graphqlHeaders } : {};
    let rstHeaders: Record<string, string> = env.restHeaders ? { ...env.restHeaders } : {};

    if (Object.keys(gqlHeaders).length === 0 && Object.keys(rstHeaders).length === 0 && env.customHeaders) {
      for (const [k, v] of Object.entries(env.customHeaders)) {
        if (typeof v === 'object' && v !== null && ('value' in v || 'graphql' in v || 'rest' in v)) {
          if ((v as any).graphql !== false) gqlHeaders[k] = String((v as any).value ?? '');
          if ((v as any).rest !== false) rstHeaders[k] = String((v as any).value ?? '');
        } else if (typeof v === 'string') {
          gqlHeaders[k] = v;
          rstHeaders[k] = v;
        }
      }
    }

    const gRows = Object.entries(gqlHeaders).map(([k, v], idx) => ({
      id: `g-${idx}-${Date.now().toString(36)}`,
      key: k,
      value: String(v)
    }));
    setGraphqlHeaderRows(
      gRows.length > 0 ? gRows : [{ id: 'g1', key: 'Content-Type', value: 'application/json' }]
    );

    const rRows = Object.entries(rstHeaders).map(([k, v], idx) => ({
      id: `r-${idx}-${Date.now().toString(36)}`,
      key: k,
      value: String(v)
    }));
    setRestHeaderRows(
      rRows.length > 0 ? rRows : [{ id: 'r1', key: 'Content-Type', value: 'application/json' }]
    );
    setIsFormOpen(true);
  };

  const handleAddGraphqlHeader = (presetKey = '', presetValue = '') => {
    setGraphqlHeaderRows(prev => [
      ...prev,
      {
        id: 'g-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 5),
        key: presetKey,
        value: presetValue
      }
    ]);
  };

  const handleRemoveGraphqlHeader = (id: string) => {
    setGraphqlHeaderRows(prev => prev.filter(r => r.id !== id));
  };

  const handleGraphqlHeaderChange = (id: string, field: 'key' | 'value', val: string) => {
    setGraphqlHeaderRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: val } : r)));
  };

  const handleAddRestHeader = (presetKey = '', presetValue = '') => {
    setRestHeaderRows(prev => [
      ...prev,
      {
        id: 'r-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 5),
        key: presetKey,
        value: presetValue
      }
    ]);
  };

  const handleRemoveRestHeader = (id: string) => {
    setRestHeaderRows(prev => prev.filter(r => r.id !== id));
  };

  const handleRestHeaderChange = (id: string, field: 'key' | 'value', val: string) => {
    setRestHeaderRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: val } : r)));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEnv?.name || !editingEnv?.magentoUrl) return;

    const parsedGqlHeaders: Record<string, string> = {};
    graphqlHeaderRows.forEach(r => {
      const k = r.key.trim();
      if (k) parsedGqlHeaders[k] = r.value.trim();
    });

    const parsedRestHeaders: Record<string, string> = {};
    restHeaderRows.forEach(r => {
      const k = r.key.trim();
      if (k) parsedRestHeaders[k] = r.value.trim();
    });

    const parsedCustomHeaders: Record<string, any> = {};
    for (const [k, v] of Object.entries(parsedGqlHeaders)) {
      parsedCustomHeaders[k] = {
        value: v,
        graphql: true,
        rest: Boolean(parsedRestHeaders[k])
      };
    }
    for (const [k, v] of Object.entries(parsedRestHeaders)) {
      if (!parsedCustomHeaders[k]) {
        parsedCustomHeaders[k] = {
          value: v,
          graphql: false,
          rest: true
        };
      }
    }

    onSaveEnvironment({
      ...editingEnv,
      graphqlHeaders: parsedGqlHeaders,
      restHeaders: parsedRestHeaders,
      customHeaders: parsedCustomHeaders
    });
    setIsFormOpen(false);
    setEditingEnv(null);
  };

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden transition-colors">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-orange-500" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Gestión de Environments
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[85vh] overflow-y-auto">
          {!isFormOpen ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Entornos Disponibles</span>
                <button
                  onClick={handleOpenCreate}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition-all shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Nuevo Entorno</span>
                </button>
              </div>

              <div className="space-y-2">
                {environments.map(env => {
                  const isActive = env.id === activeEnvironmentId;
                  const headerCount = Object.keys(env.customHeaders || {}).length;
                  return (
                    <div
                      key={env.id}
                      className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                        isActive
                          ? 'border-orange-500/50 bg-orange-500/5 dark:bg-orange-500/10'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950'
                      }`}
                    >
                      <div className="space-y-1 truncate">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                            {env.name}
                          </span>
                          {isActive && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-600 dark:text-orange-400 font-semibold">
                              ACTIVO
                            </span>
                          )}
                          {env.useMockSimulator && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-600 dark:text-purple-400 font-semibold">
                              MOCK
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] font-mono text-slate-400 truncate">
                          GraphQL: {env.magentoUrl}
                        </p>
                        {env.magentoRestUrl && (
                          <p className="text-[11px] font-mono text-slate-400 truncate">
                            REST: {env.magentoRestUrl}
                          </p>
                        )}
                        <p className="text-[10px] text-slate-500">
                          {headerCount} headers configurados
                        </p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {!isActive && (
                          <button
                            onClick={() => onSelectEnvironment(env.id)}
                            className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors"
                          >
                            Activar
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenEdit(env)}
                          className="p-1.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                          title="Editar"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={async () => {
                            const newName = await prompt({
                              title: 'Duplicar Entorno',
                              message: `Ingresa el nuevo nombre para la copia de "${env.name}":`,
                              defaultValue: `${env.name} (Copia)`,
                              confirmText: 'Duplicar',
                              placeholder: 'Nombre del entorno'
                            });
                            if (!newName || !newName.trim()) return;
                            onCloneEnvironment?.(env.id, newName.trim());
                          }}
                          className="p-1.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                          title="Duplicar"
                        >
                          <CopyPlus className="w-3.5 h-3.5" />
                        </button>
                        {environments.length > 1 && (
                          <button
                            onClick={() => onDeleteEnvironment(env.id)}
                            className="p-1.5 rounded text-slate-400 hover:text-rose-500 transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            /* Form for Create/Edit */
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nombre del Entorno
                </label>
                <input
                  type="text"
                  required
                  value={editingEnv?.name || ''}
                  onChange={e => setEditingEnv(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ej. Local Kosmos, Staging KCC, Producción..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  URL de Magento GraphQL
                </label>
                <input
                  type="url"
                  required
                  value={editingEnv?.magentoUrl || ''}
                  onChange={e => setEditingEnv(prev => ({ ...prev, magentoUrl: e.target.value }))}
                  placeholder="https://app.kosmos.test/graphql"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Endpoint REST API
                </label>
                <input
                  type="text"
                  value={editingEnv?.magentoRestUrl || ''}
                  onChange={e => setEditingEnv(prev => ({ ...prev, magentoRestUrl: e.target.value }))}
                  placeholder="https://app.kosmos.test/rest/V1"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="flex items-center pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingEnv?.useMockSimulator || false}
                    onChange={e =>
                      setEditingEnv(prev => ({ ...prev, useMockSimulator: e.target.checked }))
                    }
                    className="w-3.5 h-3.5 rounded text-orange-600 focus:ring-0"
                  />
                  <span className="text-xs text-slate-700 dark:text-slate-300">
                    Usar Simulador Mock
                  </span>
                </label>
              </div>

              {/* GraphQL Headers */}
              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-xs font-semibold text-orange-600 dark:text-orange-400">
                      Cabeceras GraphQL
                    </label>
                    <span className="text-[11px] text-slate-400">
                      Enviadas en peticiones GraphQL hacia este entorno
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddGraphqlHeader()}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-semibold transition-colors"
                  >
                    <Plus className="w-3 h-3 text-orange-500" />
                    <span>+ Header GQL</span>
                  </button>
                </div>

                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {graphqlHeaderRows.length === 0 ? (
                    <div className="py-2.5 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                      Sin cabeceras GraphQL.
                    </div>
                  ) : (
                    graphqlHeaderRows.map(row => (
                      <div
                        key={row.id}
                        className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800"
                      >
                        <input
                          type="text"
                          value={row.key}
                          onChange={e => handleGraphqlHeaderChange(row.id, 'key', e.target.value)}
                          placeholder="Header (ej. Store, AuthToken)"
                          className="w-1/3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500"
                        />
                        <span className="text-slate-400 text-xs">:</span>
                        <input
                          type="text"
                          value={row.value}
                          onChange={e => handleGraphqlHeaderChange(row.id, 'value', e.target.value)}
                          placeholder="Valor"
                          className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveGraphqlHeader(row.id)}
                          className="p-1 rounded text-slate-400 hover:text-rose-500 transition-colors"
                          title="Eliminar header"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* REST Headers */}
              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-xs font-semibold text-blue-600 dark:text-blue-400">
                      Cabeceras REST
                    </label>
                    <span className="text-[11px] text-slate-400">
                      Enviadas en peticiones REST API hacia este entorno
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddRestHeader()}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-semibold transition-colors"
                  >
                    <Plus className="w-3 h-3 text-blue-500" />
                    <span>+ Header REST</span>
                  </button>
                </div>

                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {restHeaderRows.length === 0 ? (
                    <div className="py-2.5 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                      Sin cabeceras REST.
                    </div>
                  ) : (
                    restHeaderRows.map(row => (
                      <div
                        key={row.id}
                        className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800"
                      >
                        <input
                          type="text"
                          value={row.key}
                          onChange={e => handleRestHeaderChange(row.id, 'key', e.target.value)}
                          placeholder="Header (ej. Authorization)"
                          className="w-1/3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                        />
                        <span className="text-slate-400 text-xs">:</span>
                        <input
                          type="text"
                          value={row.value}
                          onChange={e => handleRestHeaderChange(row.id, 'value', e.target.value)}
                          placeholder="Valor (ej. Bearer {{customerToken}})"
                          className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveRestHeader(row.id)}
                          className="p-1 rounded text-slate-400 hover:text-rose-500 transition-colors"
                          title="Eliminar header"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Volver a Lista
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-sm transition-all"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Guardar Entorno</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
