import React, { useState } from 'react';
import { Server, Plus, Edit2, Trash2, CheckCircle2, ArrowLeft, Save, Variable, CopyPlus, Search, X } from 'lucide-react';
import { Environment } from '../../types';
import { useFeedback } from '../../context/FeedbackContext';
import { api } from '../../api';

interface HeaderRow {
  id: string;
  key: string;
  value: string;
}

interface VariableRow {
  id: string;
  key: string;
  value: string;
}

interface EnvironmentsViewProps {
  environments: Environment[];
  activeEnvironmentId?: string;
  onSelectEnvironment: (id: string) => void;
  onSaveEnvironment: (env: Partial<Environment>) => Promise<void>;
  onDeleteEnvironment: (id: string) => Promise<void>;
  onCloneEnvironment?: (id: string, name?: string) => Promise<void>;
}

export const EnvironmentsView: React.FC<EnvironmentsViewProps> = ({
  environments,
  activeEnvironmentId,
  onSelectEnvironment,
  onSaveEnvironment,
  onDeleteEnvironment,
  onCloneEnvironment
}) => {
  const { confirm, prompt, toast } = useFeedback();
  const [editingEnv, setEditingEnv] = useState<Partial<Environment> | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [headerRows, setHeaderRows] = useState<HeaderRow[]>([]);
  const [variableRows, setVariableRows] = useState<VariableRow[]>([]);

  const handleStartCreate = () => {
    setEditingEnv({
      name: '',
      magentoUrl: 'https://app.kosmos.test/graphql',
      magentoRestUrl: 'https://app.kosmos.test/rest/V1',
      useMockSimulator: false,
      customHeaders: { 'Content-Type': 'application/json' },
      variables: { CartId: '', sku: 'MD2', quantity: '1' }
    });
    setHeaderRows([
      { id: '1', key: 'Content-Type', value: 'application/json' },
      { id: '2', key: 'AuthToken', value: '' }
    ]);
    setVariableRows([
      { id: 'v1', key: 'CartId', value: '' },
      { id: 'v2', key: 'sku', value: 'MD2' },
      { id: 'v3', key: 'quantity', value: '1' },
      { id: 'v4', key: 'customerToken', value: '' }
    ]);
    setIsEditing(true);
  };

  const handleStartEdit = (env: Environment) => {
    setEditingEnv(env);

    // Headers
    const hRows = Object.entries(env.customHeaders || {}).map(([k, v], idx) => ({
      id: `hdr-${idx}-${Date.now().toString(36)}`,
      key: k,
      value: String(v)
    }));
    setHeaderRows(hRows.length > 0 ? hRows : [{ id: '1', key: 'Content-Type', value: 'application/json' }]);

    // Variables (Requirement 2)
    const vRows = Object.entries(env.variables || {}).map(([k, v], idx) => ({
      id: `var-${idx}-${Date.now().toString(36)}`,
      key: k,
      value: String(v)
    }));
    setVariableRows(vRows.length > 0 ? vRows : [{ id: 'v1', key: 'CartId', value: '' }]);

    setIsEditing(true);
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

  const handleAddVariableRow = (presetKey = '', presetValue = '') => {
    setVariableRows(prev => [
      ...prev,
      {
        id: 'var-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 5),
        key: presetKey,
        value: presetValue
      }
    ]);
  };

  const handleRemoveVariableRow = (id: string) => {
    setVariableRows(prev => prev.filter(r => r.id !== id));
  };

  const handleVariableChange = (id: string, field: 'key' | 'value', val: string) => {
    setVariableRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: val } : r)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEnv?.name?.trim() || !editingEnv?.magentoUrl?.trim()) {
      toast('Nombre y URL de Magento son obligatorios', 'error');
      return;
    }

    const parsedHeaders: Record<string, string> = {};
    headerRows.forEach(r => {
      const k = r.key.trim();
      if (k) parsedHeaders[k] = r.value.trim();
    });

    const parsedVars: Record<string, string> = {};
    variableRows.forEach(r => {
      const k = r.key.trim();
      if (k) parsedVars[k] = r.value.trim();
    });

    await onSaveEnvironment({
      ...editingEnv,
      name: editingEnv.name.trim(),
      magentoUrl: editingEnv.magentoUrl.trim(),
      magentoRestUrl: editingEnv.magentoRestUrl?.trim() || '',
      customHeaders: parsedHeaders,
      variables: parsedVars
    });

    setIsEditing(false);
    setEditingEnv(null);
  };

  const handleDelete = async (env: Environment) => {
    const ok = await confirm({
      title: `¿Eliminar entorno "${env.name}"?`,
      message: 'Se eliminarán sus cabeceras y variables asociadas permanentemente.',
      confirmText: 'Eliminar',
      isDestructive: true
    });
    if (ok) {
      await onDeleteEnvironment(env.id);
    }
  };

  const handleClone = async (env: Environment) => {
    const newName = await prompt({
      title: 'Duplicar Entorno',
      message: `Ingresa el nuevo nombre para la copia de "${env.name}":`,
      defaultValue: `${env.name} (Copia)`,
      confirmText: 'Duplicar',
      placeholder: 'Nombre del entorno'
    });
    if (!newName || !newName.trim()) return;

    try {
      if (onCloneEnvironment) {
        await onCloneEnvironment(env.id, newName.trim());
      } else {
        const cloned = await api.cloneEnvironment(env.id, newName.trim());
        toast(`Entorno "${cloned.name}" duplicado con éxito`, 'success');
      }
    } catch (err: any) {
      toast(`Error al duplicar entorno: ${err.message}`, 'error');
    }
  };

  // --- RENDER EDITOR SCREEN ---
  if (isEditing && editingEnv) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 space-y-6 pb-28">
        {/* Top Sticky Bar */}
        <div className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-md py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between -mx-4 sm:-mx-6 px-4 sm:px-6 transition-colors shadow-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setIsEditing(false);
                setEditingEnv(null);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Volver a Entornos</span>
            </button>
            <div>
              <h1 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {editingEnv.id ? `Editar Entorno: ${editingEnv.name}` : 'Nuevo Entorno'}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Configura URL, cabeceras HTTP y variables globales que se compartirán entre variantes y flujos
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setIsEditing(false);
                setEditingEnv(null);
              }}
              className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-sm transition-all"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{editingEnv.id ? 'Guardar Cambios' : 'Crear Entorno'}</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Conexión Básica */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              1. Conexión Magento GraphQL
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nombre del Entorno *
                </label>
                <input
                  type="text"
                  value={editingEnv.name || ''}
                  onChange={e => setEditingEnv({ ...editingEnv, name: e.target.value })}
                  placeholder="Ej: Local Kosmos, Staging GT, Producción"
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Endpoint GraphQL de Magento *
                </label>
                <input
                  type="text"
                  value={editingEnv.magentoUrl || ''}
                  onChange={e => setEditingEnv({ ...editingEnv, magentoUrl: e.target.value })}
                  placeholder="https://app.kosmos.test/graphql"
                  className="w-full font-mono text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Endpoint REST API de Magento
                </label>
                <input
                  type="text"
                  value={editingEnv.magentoRestUrl || ''}
                  onChange={e => setEditingEnv({ ...editingEnv, magentoRestUrl: e.target.value })}
                  placeholder="https://app.kosmos.test/rest/V1"
                  className="w-full font-mono text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="useMockSimulator"
                checked={!!editingEnv.useMockSimulator}
                onChange={e => setEditingEnv({ ...editingEnv, useMockSimulator: e.target.checked })}
                className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
              />
              <label htmlFor="useMockSimulator" className="text-xs text-slate-600 dark:text-slate-400 select-none">
                Usar Simulador Mock interno (para desarrollo sin backend Magento activo)
              </label>
            </div>
          </div>

          {/* Variables de Entorno (Requirement 2) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Variable className="w-3.5 h-3.5 text-blue-500" />
                  <span>2. Variables de Entorno (Globales)</span>
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Usa &#123;&#123;nombreVariable&#125;&#125; en tus peticiones GraphQL, cabeceras o variables JSON
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleAddVariableRow('sku', 'MD2')}
                  className="px-2 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  + sku
                </button>
                <button
                  type="button"
                  onClick={() => handleAddVariableRow('CartId', '')}
                  className="px-2 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  + CartId
                </button>
                <button
                  type="button"
                  onClick={() => handleAddVariableRow('', '')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm"
                >
                  <Plus className="w-3 h-3" />
                  <span>Nueva Variable</span>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {variableRows.map(row => (
                <div key={row.id} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={row.key}
                    onChange={e => handleVariableChange(row.id, 'key', e.target.value)}
                    placeholder="Nombre (ej: CartId, sku)"
                    className="w-1/3 px-3 py-1.5 text-xs font-mono font-semibold rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    value={row.value}
                    onChange={e => handleVariableChange(row.id, 'value', e.target.value)}
                    placeholder="Valor por defecto"
                    className="flex-1 px-3 py-1.5 text-xs font-mono rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveVariableRow(row.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/20"
                    title="Eliminar variable"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Cabeceras HTTP Personalizadas */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  3. Cabeceras HTTP (Headers)
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Cabeceras enviadas en cada petición hacia este entorno
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleAddHeaderRow('AuthToken', '')}
                  className="px-2 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  + AuthToken
                </button>
                <button
                  type="button"
                  onClick={() => handleAddHeaderRow('X-Client-Type', '1')}
                  className="px-2 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  + X-Client-Type
                </button>
                <button
                  type="button"
                  onClick={() => handleAddHeaderRow('', '')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-sm"
                >
                  <Plus className="w-3 h-3" />
                  <span>Nuevo Header</span>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {headerRows.map(row => (
                <div key={row.id} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={row.key}
                    onChange={e => handleHeaderChange(row.id, 'key', e.target.value)}
                    placeholder="Header Key (ej: Store, AuthToken)"
                    className="w-1/3 px-3 py-1.5 text-xs font-mono font-semibold rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <input
                    type="text"
                    value={row.value}
                    onChange={e => handleHeaderChange(row.id, 'value', e.target.value)}
                    placeholder="Header Value"
                    className="flex-1 px-3 py-1.5 text-xs font-mono rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveHeaderRow(row.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/20"
                    title="Eliminar header"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setIsEditing(false);
                setEditingEnv(null);
              }}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-md transition-all"
            >
              <Save className="w-4 h-4" />
              <span>{editingEnv.id ? 'Guardar Cambios' : 'Crear Entorno'}</span>
            </button>
          </div>
        </form>

        {/* Floating Action Dock */}
        <div className="fixed bottom-6 right-6 md:right-10 z-40 flex items-center gap-2 p-1.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl animate-in fade-in slide-in-from-bottom-2 duration-200">
          <button
            type="button"
            onClick={() => {
              setIsEditing(false);
              setEditingEnv(null);
            }}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-lg shadow-orange-500/25 transition-all active:scale-95"
            title="Guardar entorno"
          >
            <Save className="w-4 h-4" />
            <span>{editingEnv.id ? 'Guardar Cambios' : 'Crear Entorno'}</span>
          </button>
        </div>
      </div>
    );
  }

  const filteredEnvironments = environments.filter(env => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const nameMatch = env.name.toLowerCase().includes(term);
    const urlMatch = env.magentoUrl.toLowerCase().includes(term);
    const restMatch = (env.magentoRestUrl || '').toLowerCase().includes(term);
    return nameMatch || urlMatch || restMatch;
  });

  // --- RENDER ENVIRONMENTS LIST SCREEN ---
  return (
    <div className="max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-orange-500/10 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 flex items-center justify-center">
            <Server className="w-4 h-4" />
          </div>
          <h1 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Administración de Entornos
          </h1>
        </div>

        <button
          onClick={handleStartCreate}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-sm transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Nuevo Entorno</span>
        </button>
      </div>

      {/* Buscador de Entornos */}
      {environments.length > 0 && (
        <div className="relative w-full">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar entornos por nombre, URL de GraphQL o endpoint REST..."
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

      {/* Environments Grid */}
      {filteredEnvironments.length === 0 ? (
        <div className="py-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 p-6">
          <p className="text-xs text-slate-500 mb-2">
            No se encontraron entornos que coincidan con "<strong>{searchTerm}</strong>".
          </p>
          <button
            onClick={() => setSearchTerm('')}
            className="text-xs font-semibold text-orange-600 dark:text-orange-400 hover:underline"
          >
            Limpiar búsqueda
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredEnvironments.map(env => {
          const isActive = env.id === activeEnvironmentId;
          const headerCount = Object.keys(env.customHeaders || {}).length;
          const varCount = Object.keys(env.variables || {}).length;

          return (
            <div
              key={env.id}
              className={`p-4 rounded-2xl border transition-all ${
                isActive
                  ? 'border-orange-500 bg-orange-50/20 dark:bg-orange-950/10 shadow-sm ring-1 ring-orange-500/30'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                      {env.name}
                    </span>
                    {isActive && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30">
                        <CheckCircle2 className="w-3 h-3" />
                        Activo
                      </span>
                    )}
                    {env.useMockSimulator && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                        Mock
                      </span>
                    )}
                  </div>
                  <div className="space-y-0.5 mt-1">
                    <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate max-w-sm flex items-center gap-1.5">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-orange-500 bg-orange-500/10 px-1 rounded">GraphQL</span>
                      <span>{env.magentoUrl}</span>
                    </p>
                    {env.magentoRestUrl && (
                      <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate max-w-sm flex items-center gap-1.5">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-blue-500 bg-blue-500/10 px-1 rounded">REST</span>
                        <span>{env.magentoRestUrl}</span>
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleStartEdit(env)}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    title="Editar entorno"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleClone(env)}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    title="Duplicar entorno"
                  >
                    <CopyPlus className="w-3.5 h-3.5" />
                  </button>
                  {environments.length > 1 && (
                    <button
                      onClick={() => handleDelete(env)}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors"
                      title="Eliminar entorno"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Pills / Metadata */}
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
                  <span>{headerCount} headers</span>
                  <span>•</span>
                  <span>{varCount} variables</span>
                </div>

                {!isActive && (
                  <button
                    onClick={() => onSelectEnvironment(env.id)}
                    className="text-xs font-bold text-orange-600 dark:text-orange-400 hover:underline"
                  >
                    Activar
                  </button>
                )}
              </div>
            </div>
          );
        })}
        </div>
      )}
    </div>
  );
};
