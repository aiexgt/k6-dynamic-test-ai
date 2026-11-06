import React, { useState, useEffect } from 'react';
import { Server, Plus, Edit2, Trash2, CheckCircle2, ArrowLeft, Save, Variable, CopyPlus, Search, X, ShieldAlert, Download, CheckSquare, Square } from 'lucide-react';
import { Environment } from '../../types';
import { useFeedback } from '../../context/FeedbackContext';
import { api } from '../../api';
import { Pagination } from '../common/Pagination';
import { downloadJson, sanitizeFilename } from '../../utils/fileTransfer';

interface SimpleHeaderRow {
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
  const [searchTerm, setSearchTerm] = useState(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get('search') || '';
    }
    return '';
  });
  const [graphqlHeaderRows, setGraphqlHeaderRows] = useState<SimpleHeaderRow[]>([]);
  const [restHeaderRows, setRestHeaderRows] = useState<SimpleHeaderRow[]>([]);
  const [variableRows, setVariableRows] = useState<VariableRow[]>([]);
  const [envPage, setEnvPage] = useState(1);
  const [envPageSize, setEnvPageSize] = useState(9);
  const [selectedEnvIds, setSelectedEnvIds] = useState<string[]>([]);

  const handleToggleSelectEnv = (envId: string) => {
    setSelectedEnvIds(prev =>
      prev.includes(envId) ? prev.filter(id => id !== envId) : [...prev, envId]
    );
  };

  const handleSelectAllVisible = (visibleEnvs: Environment[]) => {
    const visibleIds = visibleEnvs.map(e => e.id);
    const allSelected = visibleIds.every(id => selectedEnvIds.includes(id));
    if (allSelected) {
      setSelectedEnvIds(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      setSelectedEnvIds(prev => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const handleExportSelected = () => {
    const toExport = environments.filter(e => selectedEnvIds.includes(e.id));
    if (toExport.length === 0) {
      toast('Selecciona al menos un entorno para exportar marcando su casilla', 'info');
      return;
    }
    const filename = `entornos-seleccionados-${toExport.length}.json`;
    downloadJson(filename, { environments: toExport });
    toast(`Exportados ${toExport.length} entornos seleccionados`, 'success');
  };

  const handleExportSingle = (env: Environment) => {
    const filename = `entorno-${sanitizeFilename(env.name)}.json`;
    downloadJson(filename, env);
    toast(`Entorno "${env.name}" exportado`, 'success');
  };

  const updateUrlEnv = (envParam: string | null) => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (envParam) {
      url.searchParams.set('env', envParam);
    } else {
      url.searchParams.delete('env');
    }
    if (window.location.pathname + window.location.search !== url.pathname + url.search) {
      window.history.pushState(null, '', url.pathname + url.search);
    }
  };

  const handleStartCreate = (updateUrl = true) => {
    setEditingEnv({
      name: '',
      magentoUrl: 'https://app.kosmos.test/graphql',
      magentoRestUrl: 'https://app.kosmos.test/rest/V1',
      useMockSimulator: false,
      isProtected: false,
      securityCode: '',
      customHeaders: { 'Content-Type': 'application/json' },
      variables: { cartId: '', sku: 'MD2', quantity: '1' }
    });
    setGraphqlHeaderRows([
      { id: 'g1', key: 'Content-Type', value: 'application/json' },
      { id: 'g2', key: 'AuthToken', value: '' }
    ]);
    setRestHeaderRows([
      { id: 'r1', key: 'Content-Type', value: 'application/json' },
      { id: 'r2', key: 'Authorization', value: 'Bearer {{customerToken}}' }
    ]);
    setVariableRows([
      { id: 'v1', key: 'cartId', value: '' },
      { id: 'v2', key: 'sku', value: 'MD2' },
      { id: 'v3', key: 'quantity', value: '1' },
      { id: 'v4', key: 'customerToken', value: '' }
    ]);
    setIsEditing(true);
    if (updateUrl) updateUrlEnv('new');
  };

  const handleStartEdit = (env: Environment, updateUrl = true) => {
    setEditingEnv({
      ...env,
      isProtected: !!env.isProtected,
      securityCode: env.securityCode || ''
    });

    // GraphQL Headers
    let gqlHeaders: Record<string, string> = env.graphqlHeaders ? { ...env.graphqlHeaders } : {};
    // REST Headers
    let rstHeaders: Record<string, string> = env.restHeaders ? { ...env.restHeaders } : {};

    // Fallback migration from customHeaders if separated headers aren't present yet
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

    // Variables (Requirement 2)
    const vRows = Object.entries(env.variables || {}).map(([k, v], idx) => ({
      id: `var-${idx}-${Date.now().toString(36)}`,
      key: k,
      value: String(v)
    }));
    setVariableRows(vRows.length > 0 ? vRows : [{ id: 'v1', key: 'cartId', value: '' }]);

    setIsEditing(true);
    if (updateUrl) updateUrlEnv(env.id);
  };

  const handleCloseEditor = () => {
    setIsEditing(false);
    setEditingEnv(null);
    updateUrlEnv(null);
  };

  // URL synchronization on mount and on popstate (Back/Forward)
  useEffect(() => {
    const handleUrlSync = () => {
      if (typeof window === 'undefined') return;
      const params = new URLSearchParams(window.location.search);
      const envParam = params.get('env');
      const searchParam = params.get('search');
      if (searchParam !== null && searchParam !== searchTerm) {
        setSearchTerm(searchParam);
      }
      if (envParam === 'new') {
        if (!isEditing || editingEnv?.id) {
          handleStartCreate(false);
        }
      } else if (envParam) {
        const found = environments.find(e => e.id === envParam);
        if (found && (!isEditing || editingEnv?.id !== found.id)) {
          handleStartEdit(found, false);
        }
      } else if (!envParam && isEditing) {
        setIsEditing(false);
        setEditingEnv(null);
      }
    };

    handleUrlSync();
    window.addEventListener('popstate', handleUrlSync);
    return () => window.removeEventListener('popstate', handleUrlSync);
  }, [environments, isEditing, editingEnv?.id]);

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
      isProtected: !!editingEnv.isProtected,
      securityCode: editingEnv.securityCode?.trim() || '',
      graphqlHeaders: parsedGqlHeaders,
      restHeaders: parsedRestHeaders,
      customHeaders: parsedCustomHeaders,
      variables: parsedVars
    });

    handleCloseEditor();
  };

  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    setEnvPage(1);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (val) url.searchParams.set('search', val);
      else url.searchParams.delete('search');
      window.history.replaceState(null, '', url.pathname + url.search);
    }
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
      <div className="max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 space-y-6 pb-28">
        {/* Top Sticky Bar */}
        <div className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-md py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 -mx-4 sm:-mx-6 px-4 sm:px-6 lg:-mx-8 lg:px-8 transition-colors shadow-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={handleCloseEditor}
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
              onClick={handleCloseEditor}
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

            {/* Protección de Entorno (Producción / Staging) */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <div className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  id="isProtected"
                  checked={!!editingEnv.isProtected}
                  onChange={e => setEditingEnv({ ...editingEnv, isProtected: e.target.checked })}
                  className="mt-0.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                />
                <div className="space-y-0.5">
                  <label htmlFor="isProtected" className="text-xs font-bold text-slate-800 dark:text-slate-200 select-none flex items-center gap-1.5 cursor-pointer">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                    <span>Proteger entorno contra ejecuciones accidentales (Producción / Staging)</span>
                  </label>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Al intentar ejecutar un flujo completo en este ambiente, solicitará un código de seguridad o el nombre del entorno. Al ejecutar una variante individual, solicitará confirmar (Aceptar / Cancelar).
                  </p>
                </div>
              </div>

              {editingEnv.isProtected && (
                <div className="ml-6 pl-3 border-l-2 border-amber-500/40 space-y-2 pt-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Código de Seguridad (Opcional)
                  </label>
                  <input
                    type="text"
                    value={editingEnv.securityCode || ''}
                    onChange={e => setEditingEnv({ ...editingEnv, securityCode: e.target.value })}
                    placeholder={`Dejar vacío para requerir el nombre: "${editingEnv.name || 'Nombre del entorno'}"`}
                    className="w-full font-mono text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <p className="text-[11px] text-slate-400">
                    {editingEnv.securityCode?.trim()
                      ? `Para ejecutar un flujo completo, el usuario deberá ingresar este código: "${editingEnv.securityCode.trim()}".`
                      : `Al dejarlo vacío, el usuario deberá escribir exactamente "${editingEnv.name || 'Nombre del entorno'}" para confirmar.`}
                  </p>
                </div>
              )}
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
                  onClick={() => handleAddVariableRow('cartId', '')}
                  className="px-2 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  + cartId
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

          {/* 3. Cabeceras GraphQL */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400">
                  3. Cabeceras GraphQL
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Cabeceras enviadas exclusivamente en peticiones GraphQL hacia este entorno
                </p>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleAddGraphqlHeader('Content-Type', 'application/json')}
                  className="px-2 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  + Content-Type
                </button>
                <button
                  type="button"
                  onClick={() => handleAddGraphqlHeader('AuthToken', '')}
                  className="px-2 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  + AuthToken
                </button>
                <button
                  type="button"
                  onClick={() => handleAddGraphqlHeader('Store', 'default')}
                  className="px-2 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  + Store
                </button>
                <button
                  type="button"
                  onClick={() => handleAddGraphqlHeader('', '')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-sm"
                >
                  <Plus className="w-3 h-3" />
                  <span>Nuevo Header GraphQL</span>
                </button>
              </div>
            </div>

            {graphqlHeaderRows.length === 0 ? (
              <div className="py-3 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-400">
                No hay cabeceras GraphQL configuradas. Pulsa "+ Nuevo Header GraphQL".
              </div>
            ) : (
              <div className="space-y-2">
                {graphqlHeaderRows.map(row => (
                  <div key={row.id} className="flex items-center gap-2 p-1.5 rounded-xl bg-slate-50/70 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800/80">
                    <input
                      type="text"
                      value={row.key}
                      onChange={e => handleGraphqlHeaderChange(row.id, 'key', e.target.value)}
                      placeholder="Header Key (ej: Store, AuthToken)"
                      className="w-1/3 px-3 py-1.5 text-xs font-mono font-semibold rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                    <input
                      type="text"
                      value={row.value}
                      onChange={e => handleGraphqlHeaderChange(row.id, 'value', e.target.value)}
                      placeholder="Header Value (ej: {{customerToken}})"
                      className="flex-1 px-3 py-1.5 text-xs font-mono rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveGraphqlHeader(row.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/20 shrink-0 transition-colors"
                      title="Eliminar header"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 4. Cabeceras REST */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  4. Cabeceras REST
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Cabeceras enviadas exclusivamente en peticiones REST API hacia este entorno
                </p>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleAddRestHeader('Content-Type', 'application/json')}
                  className="px-2 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  + Content-Type
                </button>
                <button
                  type="button"
                  onClick={() => handleAddRestHeader('Authorization', 'Bearer {{customerToken}}')}
                  className="px-2 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  + Bearer
                </button>
                <button
                  type="button"
                  onClick={() => handleAddRestHeader('', '')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm"
                >
                  <Plus className="w-3 h-3" />
                  <span>Nuevo Header REST</span>
                </button>
              </div>
            </div>

            {restHeaderRows.length === 0 ? (
              <div className="py-3 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-400">
                No hay cabeceras REST configuradas. Pulsa "+ Nuevo Header REST".
              </div>
            ) : (
              <div className="space-y-2">
                {restHeaderRows.map(row => (
                  <div key={row.id} className="flex items-center gap-2 p-1.5 rounded-xl bg-slate-50/70 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800/80">
                    <input
                      type="text"
                      value={row.key}
                      onChange={e => handleRestHeaderChange(row.id, 'key', e.target.value)}
                      placeholder="Header Key (ej: Authorization)"
                      className="w-1/3 px-3 py-1.5 text-xs font-mono font-semibold rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="text"
                      value={row.value}
                      onChange={e => handleRestHeaderChange(row.id, 'value', e.target.value)}
                      placeholder="Header Value (ej: Bearer {{token}})"
                      className="flex-1 px-3 py-1.5 text-xs font-mono rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveRestHeader(row.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/20 shrink-0 transition-colors"
                      title="Eliminar header"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
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
        <div className="fixed bottom-4 sm:bottom-6 right-4 sm:right-10 z-40 max-w-[calc(100vw-2rem)] flex flex-wrap items-center gap-2 p-1.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl animate-in fade-in slide-in-from-bottom-2 duration-200">
          <button
            type="button"
            onClick={handleCloseEditor}
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

  const totalEnvPages = Math.ceil(filteredEnvironments.length / envPageSize) || 1;
  const currentEnvPage = Math.min(envPage, totalEnvPages);
  const paginatedEnvironments = filteredEnvironments.slice(
    (currentEnvPage - 1) * envPageSize,
    currentEnvPage * envPageSize
  );

  // --- RENDER ENVIRONMENTS LIST SCREEN ---
  return (
    <div className="max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-orange-500/10 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 flex items-center justify-center">
            <Server className="w-4 h-4" />
          </div>
          <h1 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Administración de Entornos
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {environments.length > 0 && (
            <button
              onClick={handleExportSelected}
              disabled={selectedEnvIds.length === 0}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border text-xs font-semibold transition-all shadow-xs ${
                selectedEnvIds.length > 0
                  ? 'bg-orange-500/10 border-orange-500/40 text-orange-600 dark:text-orange-400 font-bold hover:bg-orange-500/20'
                  : 'border-slate-200 dark:border-slate-800 text-slate-400 cursor-not-allowed opacity-60'
              }`}
              title={
                selectedEnvIds.length > 0
                  ? `Exportar los ${selectedEnvIds.length} entornos seleccionados`
                  : 'Selecciona entornos con las casillas para exportar'
              }
            >
              <Download className="w-3.5 h-3.5" />
              <span>
                {selectedEnvIds.length > 0
                  ? `Exportar (${selectedEnvIds.length})`
                  : 'Exportar seleccionados'}
              </span>
            </button>
          )}

          <button
            onClick={() => handleStartCreate(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-sm transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nuevo Entorno</span>
          </button>
        </div>
      </div>

      {/* Buscador de Entornos y Barra de Selección */}
      {environments.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="Buscar entornos por nombre, URL de GraphQL o endpoint REST..."
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-9 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-orange-500 transition-colors shadow-xs"
            />
            {searchTerm && (
              <button
                onClick={() => handleSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                title="Limpiar búsqueda"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => handleSelectAllVisible(filteredEnvironments)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors shadow-xs"
              title="Marcar o desmarcar todos los entornos visibles"
            >
              {filteredEnvironments.length > 0 && filteredEnvironments.every(e => selectedEnvIds.includes(e.id)) ? (
                <>
                  <CheckSquare className="w-3.5 h-3.5 text-orange-500" />
                  <span>Deseleccionar todos</span>
                </>
              ) : (
                <>
                  <Square className="w-3.5 h-3.5 text-slate-400" />
                  <span>Seleccionar todos ({filteredEnvironments.length})</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Environments Grid */}
      {filteredEnvironments.length === 0 ? (
        <div className="py-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 p-6">
          <p className="text-xs text-slate-500 mb-2">
            No se encontraron entornos que coincidan con "<strong>{searchTerm}</strong>".
          </p>
          <button
            onClick={() => handleSearchChange('')}
            className="text-xs font-semibold text-orange-600 dark:text-orange-400 hover:underline"
          >
            Limpiar búsqueda
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedEnvironments.map(env => {
            const isActive = env.id === activeEnvironmentId;
            const isChecked = selectedEnvIds.includes(env.id);
            const headerCount = Object.keys(env.customHeaders || {}).length;
            const varCount = Object.keys(env.variables || {}).length;

            return (
              <div
                key={env.id}
                className={`p-4 rounded-2xl border transition-all ${
                  isChecked
                    ? 'border-orange-500/70 bg-orange-50/30 dark:bg-orange-950/20 shadow-sm ring-2 ring-orange-500/30'
                    : isActive
                    ? 'border-orange-500 bg-orange-50/20 dark:bg-orange-950/10 shadow-sm ring-1 ring-orange-500/30'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-start gap-2.5 flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleSelectEnv(env.id)}
                      className="mt-1 w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-orange-600 focus:ring-orange-500 cursor-pointer shrink-0"
                      title="Seleccionar para exportar"
                    />

                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
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
                        {env.isProtected && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                            title={env.securityCode ? 'Protegido con código PIN' : `Protegido con nombre: "${env.name}"`}
                          >
                            <ShieldAlert className="w-3 h-3 text-amber-500" />
                            <span>Protegido</span>
                          </span>
                        )}
                      </div>
                      <div className="space-y-0.5 mt-1">
                        <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate flex-1 min-w-0 flex items-center gap-1.5">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-orange-500 bg-orange-500/10 px-1 rounded shrink-0">GraphQL</span>
                          <span className="truncate">{env.magentoUrl}</span>
                        </p>
                        {env.magentoRestUrl && (
                          <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate flex-1 min-w-0 flex items-center gap-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-blue-500 bg-blue-500/10 px-1 rounded shrink-0">REST</span>
                            <span className="truncate">{env.magentoRestUrl}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleExportSingle(env)}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-orange-500 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/20 transition-colors"
                      title="Exportar este entorno a JSON"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
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

          <Pagination
            currentPage={currentEnvPage}
            totalItems={filteredEnvironments.length}
            pageSize={envPageSize}
            onPageChange={setEnvPage}
            onPageSizeChange={size => {
              setEnvPageSize(size);
              setEnvPage(1);
            }}
            pageSizeOptions={[6, 9, 12, 24]}
          />
        </>
      )}
    </div>
  );
};
