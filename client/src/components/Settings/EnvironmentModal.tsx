import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, Edit2, Server, Save, Sparkles, CopyPlus } from 'lucide-react';
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
  const [headerRows, setHeaderRows] = useState<HeaderRow[]>([]);

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
    setHeaderRows([
      { id: '1', key: 'Content-Type', value: 'application/json' },
      { id: '2', key: 'AuthToken', value: '' }
    ]);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (env: Environment) => {
    setEditingEnv(env);
    const rows = Object.entries(env.customHeaders || {}).map(([k, v], idx) => ({
      id: `hdr-${idx}-${Date.now().toString(36)}`,
      key: k,
      value: String(v)
    }));
    setHeaderRows(
      rows.length > 0
        ? rows
        : [{ id: '1', key: 'Content-Type', value: 'application/json' }]
    );
    setIsFormOpen(true);
  };

  const handleAddHeaderRow = (presetKey = '', presetValue = '') => {
    setHeaderRows(prev => [
      ...prev,
      {
        id: 'hdr-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 5),
        key: presetKey,
        value: presetValue
      }
    ]);
  };

  const handleRemoveHeaderRow = (id: string) => {
    setHeaderRows(prev => prev.filter(r => r.id !== id));
  };

  const handleHeaderChange = (id: string, field: 'key' | 'value', val: string) => {
    setHeaderRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: val } : r)));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEnv?.name || !editingEnv?.magentoUrl) return;

    const parsedHeaders: Record<string, string> = {};
    headerRows.forEach(r => {
      const k = r.key.trim();
      if (k) {
        parsedHeaders[k] = r.value.trim();
      }
    });

    onSaveEnvironment({
      ...editingEnv,
      customHeaders: parsedHeaders
    });
    setIsFormOpen(false);
    setEditingEnv(null);
  };

  const commonHeaderPresets = [
    { label: 'AuthToken', key: 'AuthToken', val: '' },
    { label: 'X-Client-Type', key: 'X-Client-Type', val: '1' },
    { label: 'Authorization', key: 'Authorization', val: 'Bearer ' },
    { label: 'Content-Type', key: 'Content-Type', val: 'application/json' }
  ];

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

              {/* Headers Manager Row by Row */}
              <div className="space-y-2 pt-1 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Custom HTTP Headers
                    </label>
                    <span className="text-[11px] text-slate-400">
                      Configura los headers individuales enviados a Magento
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddHeaderRow()}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-semibold transition-colors"
                  >
                    <Plus className="w-3 h-3 text-orange-500" />
                    <span>Agregar Header</span>
                  </button>
                </div>

                {/* Quick Presets */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-500" /> Presets:
                  </span>
                  {commonHeaderPresets.map(preset => {
                    const alreadyExists = headerRows.some(r => r.key.toLowerCase() === preset.key.toLowerCase());
                    return (
                      <button
                        key={preset.key}
                        type="button"
                        disabled={alreadyExists}
                        onClick={() => handleAddHeaderRow(preset.key, preset.val)}
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-md border transition-all ${
                          alreadyExists
                            ? 'opacity-30 border-slate-200 dark:border-slate-800 text-slate-400 cursor-not-allowed'
                            : 'border-slate-200 dark:border-slate-800 hover:border-orange-500 text-slate-600 dark:text-slate-400 hover:text-orange-500'
                        }`}
                      >
                        +{preset.label}
                      </button>
                    );
                  })}
                </div>

                {/* Rows List */}
                <div className="space-y-1.5 pt-1 max-h-48 overflow-y-auto pr-1">
                  {headerRows.length === 0 ? (
                    <div className="py-4 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                      No hay headers configurados. Pulsa "+ Agregar Header".
                    </div>
                  ) : (
                    headerRows.map(row => (
                      <div
                        key={row.id}
                        className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 p-2 rounded-xl border border-slate-200 dark:border-slate-800"
                      >
                        <input
                          type="text"
                          value={row.key}
                          onChange={e => handleHeaderChange(row.id, 'key', e.target.value)}
                          placeholder="Header (ej. Store)"
                          className="w-1/3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500"
                        />
                        <span className="text-slate-400 text-xs">:</span>
                        <input
                          type="text"
                          value={row.value}
                          onChange={e => handleHeaderChange(row.id, 'value', e.target.value)}
                          placeholder="Valor (ej. max_com_gt)"
                          className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveHeaderRow(row.id)}
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
