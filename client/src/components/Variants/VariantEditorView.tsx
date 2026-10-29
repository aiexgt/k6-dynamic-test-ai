import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Save, Plus, Code2, Globe, Trash2, ShieldCheck, Variable, Terminal, FlaskConical } from 'lucide-react';
import { Variant, CustomValidation, ValidationType, ApiType, HttpMethod, Environment } from '../../types';
import { SearchableSelect } from '../common/SearchableSelect';
import { CodeEditor } from '../common/CodeEditor';
import { TypedSchemaJsonViewer } from '../common/TypedSchemaJsonViewer';
import { VariantTesterModal } from './VariantTesterModal';
import { useFeedback } from '../../context/FeedbackContext';
import { api } from '../../api';

interface KeyValueRow {
  id: string;
  key: string;
  value: string;
}

interface MappingRow {
  id: string;
  targetKey: string;
  jsonPath: string;
}

interface VariantEditorViewProps {
  initialVariant?: Variant | null;
  categories: string[];
  defaultCategory?: string;
  onSave: (variantData: Partial<Variant>) => void;
  onBack: () => void;
  onCreateCategory: (name: string) => Promise<void>;
}

export const VariantEditorView: React.FC<VariantEditorViewProps> = ({
  initialVariant,
  categories,
  defaultCategory = 'Crear Carrito',
  onSave,
  onBack,
  onCreateCategory
}) => {
  const { toast } = useFeedback();
  const [name, setName] = useState('');
  const [category, setCategory] = useState(defaultCategory);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isCreatingNewCat, setIsCreatingNewCat] = useState(false);
  const [description, setDescription] = useState('');
  const [apiType, setApiType] = useState<ApiType>(initialVariant?.apiType || 'GRAPHQL');
  const [method, setMethod] = useState<HttpMethod>(initialVariant?.method || 'POST');
  const [endpoint, setEndpoint] = useState<string>(initialVariant?.endpoint || '');
  const [body, setBody] = useState<string>(initialVariant?.body || '');
  const [query, setQuery] = useState('');
  const [defaultVariablesStr, setDefaultVariablesStr] = useState('{}');
  const [contextOutputsStr, setContextOutputsStr] = useState('cartId');
  const [isVirtualOnly, setIsVirtualOnly] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Response -> Environment Variable Mappings
  const [mappingRows, setMappingRows] = useState<MappingRow[]>([]);

  // Custom Headers for this variant (overrides environment headers and supports {{vars}})
  const [headerRows, setHeaderRows] = useState<KeyValueRow[]>([]);

  // Custom Validations
  const [validations, setValidations] = useState<CustomValidation[]>([]);
  const [isTesterOpen, setIsTesterOpen] = useState(false);

  // Environments
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [useCustomEnvironment, setUseCustomEnvironment] = useState<boolean>(!!initialVariant?.environmentId);
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<string>(initialVariant?.environmentId || '');

  useEffect(() => {
    api.getEnvironments().then(envs => {
      setEnvironments(envs);
      if (initialVariant?.environmentId) {
        setSelectedEnvironmentId(initialVariant.environmentId);
      } else if (envs.length > 0 && !selectedEnvironmentId) {
        setSelectedEnvironmentId(envs[0].id);
      }
    }).catch(console.error);
  }, [initialVariant]);

  const currentVariantDraft: Variant = useMemo(() => {
    let parsedVars = {};
    try {
      parsedVars = JSON.parse(defaultVariablesStr || '{}');
    } catch {
      // ignore
    }
    const cHeaders: Record<string, string> = {};
    headerRows.forEach(h => {
      if (h.key.trim()) cHeaders[h.key.trim()] = h.value;
    });

    const parsedMapping: Record<string, string> = {};
    mappingRows.forEach(m => {
      if (m.targetKey.trim() && m.jsonPath.trim()) {
        parsedMapping[m.targetKey.trim()] = m.jsonPath.trim();
      }
    });

    return {
      id: initialVariant?.id || `temp-variant-${Date.now().toString(36)}`,
      name: name.trim() || 'Borrador de Variante',
      category: isCreatingNewCat ? newCategoryName : category,
      description,
      apiType,
      method,
      endpoint,
      body,
      query,
      defaultVariables: parsedVars,
      variables: {},
      contextOutputs: contextOutputsStr.split(',').map(s => s.trim()).filter(Boolean),
      contextMapping: parsedMapping,
      customHeaders: cHeaders,
      environmentId: useCustomEnvironment ? (selectedEnvironmentId || null) : null,
      customValidations: validations,
      isVirtualOnly,
      createdAt: initialVariant?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }, [initialVariant, name, category, isCreatingNewCat, newCategoryName, description, apiType, method, endpoint, body, query, defaultVariablesStr, contextOutputsStr, headerRows, mappingRows, validations, isVirtualOnly, useCustomEnvironment, selectedEnvironmentId]);

  const handleTesterUpdated = (updated: Variant) => {
    setQuery(updated.query || '');
    if (updated.defaultVariables) {
      setDefaultVariablesStr(JSON.stringify(updated.defaultVariables, null, 2));
    }
    if (updated.customValidations) {
      setValidations(updated.customValidations);
    }
    if (updated.customHeaders) {
      const hRows = Object.entries(updated.customHeaders).map(([k, v], idx) => ({
        id: `hdr-${idx}-${Date.now().toString(36)}`,
        key: k,
        value: String(v)
      }));
      setHeaderRows(hRows);
    }
  };

  useEffect(() => {
    if (initialVariant) {
      setName(initialVariant.name);
      setCategory(initialVariant.category || 'General');
      setIsCreatingNewCat(false);
      setDescription(initialVariant.description || '');
      setApiType(initialVariant.apiType || 'GRAPHQL');
      setMethod(initialVariant.method || 'POST');
      setEndpoint(initialVariant.endpoint || '');
      setBody(initialVariant.body || '');
      setQuery(initialVariant.query || '');
      setDefaultVariablesStr(JSON.stringify(initialVariant.defaultVariables || {}, null, 2));
      setContextOutputsStr((initialVariant.contextOutputs || []).join(', '));
      setIsVirtualOnly(!!initialVariant.isVirtualOnly);
      setValidations(initialVariant.customValidations || []);
      setUseCustomEnvironment(!!initialVariant.environmentId);
      setSelectedEnvironmentId(initialVariant.environmentId || '');

      // Mapping Rows (Response -> Variable)
      const ctxMap = initialVariant.contextMapping || {};
      const mRows = Object.entries(ctxMap).map(([k, v], idx) => ({
        id: `map-${idx}-${Date.now().toString(36)}`,
        targetKey: k,
        jsonPath: String(v)
      }));
      setMappingRows(mRows);

      // Custom Headers
      const cHeaders = initialVariant.customHeaders || {};
      const hRows = Object.entries(cHeaders).map(([k, v], idx) => ({
        id: `hdr-${idx}-${Date.now().toString(36)}`,
        key: k,
        value: String(v)
      }));
      setHeaderRows(hRows);
    } else {
      setName('');
      setCategory(defaultCategory || categories[0] || 'Crear Carrito');
      setIsCreatingNewCat(false);
      setDescription('');
      setQuery(`mutation MyMutation($cartId: String!) {\n  // Escribe tu mutación GraphQL aquí\n}`);
      setDefaultVariablesStr('{}');
      setContextOutputsStr('cartId');
      setIsVirtualOnly(false);
      setUseCustomEnvironment(false);
      setSelectedEnvironmentId(environments[0]?.id || '');
      setValidations([
        {
          id: 'val-' + Date.now().toString(36) + '-1',
          name: 'Status HTTP 200',
          type: 'STATUS_CODE',
          expectedValue: '200',
          enabled: true
        },
        {
          id: 'val-' + Date.now().toString(36) + '-2',
          name: 'Sin errores GraphQL',
          type: 'NO_GRAPHQL_ERRORS',
          enabled: true
        }
      ]);
      setMappingRows([]);
      setHeaderRows([]);
    }
    setJsonError(null);
  }, [initialVariant, defaultCategory, categories]);

  // Mapping Rows Handlers
  const handleAddMappingRow = (targetKey = '', jsonPath = '') => {
    setMappingRows(prev => [
      ...prev,
      {
        id: 'map-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 5),
        targetKey,
        jsonPath
      }
    ]);
  };

  const handleRemoveMappingRow = (id: string) => {
    setMappingRows(prev => prev.filter(r => r.id !== id));
  };

  const handleMappingChange = (id: string, field: 'targetKey' | 'jsonPath', val: string) => {
    setMappingRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: val } : r)));
  };

  // Header Rows Handlers
  const handleAddHeaderRow = (key = '', value = '') => {
    setHeaderRows(prev => [
      ...prev,
      {
        id: 'hdr-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 5),
        key,
        value
      }
    ]);
  };

  const handleRemoveHeaderRow = (id: string) => {
    setHeaderRows(prev => prev.filter(r => r.id !== id));
  };

  const handleHeaderChange = (id: string, field: 'key' | 'value', val: string) => {
    setHeaderRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: val } : r)));
  };

  // Custom Validation Handlers
  const handleAddValidation = (type: ValidationType, presetName = '', defaultPath = '', expected = '') => {
    const newV: CustomValidation = {
      id: 'val-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 5),
      name: presetName || 'Nueva Validación',
      type,
      targetPath: defaultPath,
      expectedValue: expected,
      enabled: true
    };
    setValidations(prev => [...prev, newV]);
  };

  const handleUpdateValidation = (id: string, patch: Partial<CustomValidation>) => {
    setValidations(prev => prev.map(v => (v.id === id ? { ...v, ...patch } : v)));
  };

  const handleRemoveValidation = (id: string) => {
    setValidations(prev => prev.filter(v => v.id !== id));
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!name.trim()) {
      toast('El nombre de la variante es obligatorio', 'error');
      return;
    }

    let parsedVars = {};
    try {
      parsedVars = JSON.parse(defaultVariablesStr || '{}');
    } catch (err: any) {
      setJsonError(`JSON de variables inválido: ${err.message}`);
      toast('Error en JSON de Variables', 'error');
      return;
    }

    // Build context mapping
    const parsedMapping: Record<string, string> = {};
    mappingRows.forEach(r => {
      const k = r.targetKey.trim();
      const p = r.jsonPath.trim();
      if (k && p) {
        parsedMapping[k] = p;
      }
    });

    // Build custom headers
    const parsedHeaders: Record<string, string> = {};
    headerRows.forEach(r => {
      const k = r.key.trim();
      if (k) {
        parsedHeaders[k] = r.value.trim();
      }
    });

    let finalCategory = category;
    if (isCreatingNewCat && newCategoryName.trim()) {
      await onCreateCategory(newCategoryName.trim());
      finalCategory = newCategoryName.trim();
    }

    const contextOutputs = contextOutputsStr
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    onSave({
      name: name.trim(),
      category: finalCategory,
      description: description.trim(),
      apiType,
      method,
      endpoint: endpoint.trim(),
      body: body.trim(),
      query: query.trim(),
      defaultVariables: parsedVars,
      contextOutputs,
      contextMapping: parsedMapping,
      customHeaders: parsedHeaders,
      environmentId: useCustomEnvironment ? (selectedEnvironmentId || null) : null,
      customValidations: validations,
      isVirtualOnly
    });
  };

  // Keyboard shortcut: Cmd+S / Ctrl+S to save
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSubmit();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [
    name,
    category,
    description,
    apiType,
    method,
    endpoint,
    body,
    query,
    defaultVariablesStr,
    contextOutputsStr,
    mappingRows,
    headerRows,
    validations,
    isVirtualOnly,
    useCustomEnvironment,
    selectedEnvironmentId,
    isCreatingNewCat,
    newCategoryName
  ]);

  const categoryOptions = categories.map(c => ({ value: c, label: c }));

  return (
    <div className="max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 space-y-6 pb-28">
      {/* Top Sticky Bar */}
      <div className="sticky top-0 z-30 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-md py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 -mx-4 sm:-mx-6 px-4 sm:px-6 lg:-mx-8 lg:px-8 transition-colors shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Volver</span>
          </button>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
              {initialVariant ? `Editar Variante: ${initialVariant.name}` : 'Crear Nueva Variante'}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsTesterOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-orange-200 dark:border-orange-800/60 bg-orange-50 dark:bg-orange-950/30 hover:bg-orange-100 dark:hover:bg-orange-900/40 text-orange-700 dark:text-orange-300 text-xs font-semibold transition-all shadow-xs"
            title="Probar petición en vivo en GraphiQL Sandbox"
          >
            <FlaskConical className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
            <span>Probar en GraphiQL</span>
          </button>
          <button
            type="button"
            onClick={onBack}
            className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-sm transition-all"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{initialVariant ? 'Guardar Cambios' : 'Crear Variante'}</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {jsonError && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs text-rose-600 dark:text-rose-400">
            {jsonError}
          </div>
        )}

        {/* 1. Metadatos */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            1. Metadatos
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nombre de la Variante *
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ej: Agregar Dirección Envío Pickup"
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Categoría *
              </label>
              {!isCreatingNewCat ? (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <SearchableSelect
                      options={categoryOptions}
                      value={category}
                      onChange={setCategory}
                      placeholder="Seleccionar Categoría"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsCreatingNewCat(true)}
                    className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold"
                    title="Crear nueva categoría"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    placeholder="Nueva categoría..."
                    className="flex-1 px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <button
                    type="button"
                    onClick={() => setIsCreatingNewCat(false)}
                    className="px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Descripción / Notas
            </label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Ej: Utiliza el método de pickup store con ubicación GT"
              className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="isVirtualOnly"
              checked={isVirtualOnly}
              onChange={e => setIsVirtualOnly(e.target.checked)}
              className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
            />
            <label htmlFor="isVirtualOnly" className="text-xs text-slate-600 dark:text-slate-400 select-none">
              Solo para carritos virtuales / digitales
            </label>
          </div>

          {/* Opción para consumir un Environment diferente */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="useCustomEnvironment"
                checked={useCustomEnvironment}
                onChange={e => {
                  const checked = e.target.checked;
                  setUseCustomEnvironment(checked);
                  if (checked && !selectedEnvironmentId && environments.length > 0) {
                    setSelectedEnvironmentId(environments[0].id);
                  }
                }}
                className="rounded border-slate-300 text-orange-600 focus:ring-orange-500 w-4 h-4 cursor-pointer"
              />
              <label htmlFor="useCustomEnvironment" className="text-xs font-semibold text-slate-700 dark:text-slate-300 select-none cursor-pointer flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-blue-500" />
                <span>Consumir un environment diferente</span>
              </label>
            </div>

            {useCustomEnvironment && (
              <div className="p-3.5 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 animate-in fade-in duration-200">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Seleccionar Environment para esta variante:
                </label>
                <select
                  value={selectedEnvironmentId}
                  onChange={e => setSelectedEnvironmentId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500 font-medium"
                >
                  {environments.length === 0 ? (
                    <option value="">No hay entornos disponibles</option>
                  ) : (
                    environments.map(env => (
                      <option key={env.id} value={env.id}>
                        {env.name} — GraphQL: {env.magentoUrl} {env.magentoRestUrl ? `| REST: ${env.magentoRestUrl}` : ''} {env.useMockSimulator ? '(Mock)' : ''}
                      </option>
                    ))
                  )}
                </select>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Esta variante se ejecutará contra este entorno específico en lugar del entorno activo global.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* 2. Definición de la Petición: GraphQL o API / REST */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              {apiType === 'GRAPHQL' ? (
                <Code2 className="w-3.5 h-3.5 text-orange-500" />
              ) : (
                <Globe className="w-3.5 h-3.5 text-blue-500" />
              )}
              <span>2. Tipo de Petición &amp; Payload</span>
            </h2>

            {/* Toggle Switcher: GraphQL vs API / REST */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700/80 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setApiType('GRAPHQL')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  apiType === 'GRAPHQL'
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Code2 className="w-3 h-3" />
                <span>GraphQL</span>
              </button>
              <button
                type="button"
                onClick={() => setApiType('REST')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  apiType === 'REST'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Globe className="w-3 h-3" />
                <span>API / REST</span>
              </button>
            </div>
          </div>

          {apiType === 'GRAPHQL' ? (
            <div className="space-y-4">
              <CodeEditor
                label="Query / Mutation GraphQL"
                language="graphql"
                value={query}
                onChange={setQuery}
                environmentId={useCustomEnvironment ? selectedEnvironmentId : undefined}
                compactHeight="140px"
                expandedHeight="480px"
                defaultExpanded={false}
                required
              />

              {/* Variables: 60% Editor y 40% JSON con Tipado del Schema */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-3.5 items-stretch">
                <div className="lg:col-span-3">
                  <CodeEditor
                    label="Variables por Defecto (JSON)"
                    language="json"
                    value={defaultVariablesStr}
                    onChange={setDefaultVariablesStr}
                    graphqlQuery={query}
                    environmentId={useCustomEnvironment ? selectedEnvironmentId : undefined}
                    compactHeight="160px"
                    expandedHeight="340px"
                    defaultExpanded={false}
                    placeholder={'{\n  "sku": "MD2",\n  "quantity": 1\n}'}
                  />
                </div>

                <div className="lg:col-span-2 flex flex-col">
                  <TypedSchemaJsonViewer
                    query={query}
                    onCopyAllToEditor={setDefaultVariablesStr}
                    height="160px"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Method and Endpoint */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Método HTTP
                  </label>
                  <select
                    value={method}
                    onChange={e => setMethod(e.target.value as HttpMethod)}
                    className="w-full px-3 py-2 text-xs font-mono font-bold rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="POST">POST</option>
                    <option value="GET">GET</option>
                    <option value="PUT">PUT</option>
                    <option value="PATCH">PATCH</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Endpoint / Ruta de la API
                  </label>
                  <input
                    type="text"
                    value={endpoint}
                    onChange={e => setEndpoint(e.target.value)}
                    placeholder="/rest/default/V1/carts/mine/payment-information o https://api.com/..."
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Ruta relativa (ej. <code className="text-blue-500">/rest/V1/...</code>) o URL completa. Soporta variables dinámicas <code className="text-orange-500">&#123;&#123;cartId&#125;&#125;</code>.
                  </p>
                </div>
              </div>

              {method !== 'GET' && (
                <CodeEditor
                  label="Cuerpo de la Petición (Payload JSON)"
                  language="json"
                  value={body}
                  onChange={setBody}
                  compactHeight="130px"
                  expandedHeight="400px"
                  defaultExpanded={false}
                  placeholder={'{\n  "paymentMethod": {\n    "method": "checkmo"\n  }\n}'}
                />
              )}
            </div>
          )}
        </div>

        {/* 3. Capturar Variables de la Respuesta */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Variable className="w-3.5 h-3.5 text-blue-500" />
              <span>3. Capturar Variables de la Respuesta</span>
            </h2>

            <button
              type="button"
              onClick={() => handleAddMappingRow('', '')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-sm"
            >
              <Plus className="w-3 h-3" />
              <span>Añadir Variable</span>
            </button>
          </div>

          {mappingRows.length === 0 ? (
            <div className="py-3 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-400">
              Sin variables capturadas de la respuesta.
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 text-[11px] font-semibold text-slate-400 px-1">
                <span className="col-span-5">Variable de Environment Destino</span>
                <span className="col-span-6">Ruta en Respuesta (JSONPath)</span>
                <span className="col-span-1 text-right">Quitar</span>
              </div>

              {mappingRows.map(row => (
                <div key={row.id} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5">
                    <input
                      type="text"
                      value={row.targetKey}
                      onChange={e => handleMappingChange(row.id, 'targetKey', e.target.value)}
                      placeholder="ej: CartId"
                      className="w-full px-3 py-1.5 text-xs font-mono font-bold rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="col-span-6">
                    <input
                      type="text"
                      value={row.jsonPath}
                      onChange={e => handleMappingChange(row.id, 'jsonPath', e.target.value)}
                      placeholder="ej: cart.id o createEmptyCart"
                      className="w-full px-3 py-1.5 text-xs font-mono rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="col-span-1 text-right">
                    <button
                      type="button"
                      onClick={() => handleRemoveMappingRow(row.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/20"
                      title="Eliminar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 4. Headers de la Variante (Sobreescribir o usar variables) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-orange-500" />
              <span>4. Headers de la Variante (Sobreescribir / Variables)</span>
            </h2>

            <button
              type="button"
              onClick={() => handleAddHeaderRow('', '')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition-all shadow-sm"
            >
              <Plus className="w-3 h-3" />
              <span>Añadir Header</span>
            </button>
          </div>

          {headerRows.length === 0 ? (
            <div className="py-3 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-400">
              Usa los headers del environment por defecto. Pulsa "+ Añadir Header" para sobreescribir alguno o usar &#123;&#123;variables&#125;&#125;.
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 text-[11px] font-semibold text-slate-400 px-1">
                <span className="col-span-5">Header Key (ej: Authorization, Store)</span>
                <span className="col-span-6">Header Value (soporta &#123;&#123;token&#125;&#125;)</span>
                <span className="col-span-1 text-right">Quitar</span>
              </div>

              {headerRows.map(row => (
                <div key={row.id} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5">
                    <input
                      type="text"
                      value={row.key}
                      onChange={e => handleHeaderChange(row.id, 'key', e.target.value)}
                      placeholder="ej: Authorization"
                      className="w-full px-3 py-1.5 text-xs font-mono font-bold rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>

                  <div className="col-span-6">
                    <input
                      type="text"
                      value={row.value}
                      onChange={e => handleHeaderChange(row.id, 'value', e.target.value)}
                      placeholder="ej: Bearer {{customerToken}}"
                      className="w-full px-3 py-1.5 text-xs font-mono rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>

                  <div className="col-span-1 text-right">
                    <button
                      type="button"
                      onClick={() => handleRemoveHeaderRow(row.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/20"
                      title="Eliminar header"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 5. Validaciones Personalizadas */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>5. Validaciones Personalizadas</span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Define criterios de éxito como "Existe un valor en ruta", "X es igual a Y" o aserciones de status
              </p>
            </div>

            {/* Solo un botón de agregar nueva validación */}
            <button
              type="button"
              onClick={() => handleAddValidation('JSON_PATH_EXISTS', 'Nueva Validación', 'cart.id', '')}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/50 text-xs font-semibold transition-all border border-orange-200 dark:border-orange-800 shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Agregar Validación</span>
            </button>
          </div>

          {validations.length === 0 ? (
            <div className="py-6 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-400">
              Sin validaciones personalizadas. Haz clic en "Agregar Validación" para añadir una y seleccionar el tipo en el menú desplegable.
            </div>
          ) : (
            <div className="space-y-3">
              {validations.map(val => (
                <div
                  key={val.id}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/50 space-y-3 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={val.enabled}
                        onChange={e => handleUpdateValidation(val.id, { enabled: e.target.checked })}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        title={val.enabled ? 'Validación activa' : 'Validación desactivada'}
                      />
                      <input
                        type="text"
                        value={val.name}
                        onChange={e => handleUpdateValidation(val.id, { name: e.target.value })}
                        placeholder="Nombre descriptivo (ej: Existe Cart ID)"
                        className="flex-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-orange-500"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={val.type}
                        onChange={e => handleUpdateValidation(val.id, { type: e.target.value as ValidationType })}
                        className="px-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-medium focus:outline-none focus:border-orange-500"
                      >
                        <option value="JSON_PATH_EXISTS">Existe valor en ruta (JSONPath)</option>
                        <option value="JSON_PATH_EQUALS">Valor en ruta es igual a... (JSONPath = Valor)</option>
                        <option value="JSON_PATH_NOT_EMPTY">Valor en ruta no está vacío</option>
                        <option value="STATUS_CODE">Código Status HTTP</option>
                        <option value="NO_GRAPHQL_ERRORS">Sin Errores en Respuesta</option>
                        <option value="CONTAINS_STRING">Respuesta contiene texto</option>
                        <option value="RESPONSE_TIME_UNDER">Tiempo de respuesta menor a (ms)</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => handleRemoveValidation(val.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors"
                        title="Eliminar validación"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Route & Value configuration inputs */}
                  {(val.type === 'JSON_PATH_EXISTS' || val.type === 'JSON_PATH_EQUALS' || val.type === 'JSON_PATH_NOT_EMPTY') && (
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pt-1 border-t border-slate-200/60 dark:border-slate-800/60">
                      <div className={val.type === 'JSON_PATH_EQUALS' ? 'sm:col-span-7' : 'sm:col-span-12'}>
                        <label className="block text-[10px] font-mono text-slate-500 dark:text-slate-400 mb-1">
                          Ruta en el JSON (JSONPath):
                        </label>
                        <input
                          type="text"
                          value={val.targetPath || ''}
                          onChange={e => handleUpdateValidation(val.id, { targetPath: e.target.value })}
                          placeholder="ej: cart.id, order_number o items[0].id"
                          className="w-full px-2.5 py-1 text-xs font-mono rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-orange-500"
                        />
                      </div>

                      {val.type === 'JSON_PATH_EQUALS' && (
                        <div className="sm:col-span-5">
                          <label className="block text-[10px] font-mono text-slate-500 dark:text-slate-400 mb-1">
                            Valor esperado (soporta &#123;&#123;variable&#125;&#125;):
                          </label>
                          <input
                            type="text"
                            value={val.expectedValue || ''}
                            onChange={e => handleUpdateValidation(val.id, { expectedValue: e.target.value })}
                            placeholder="ej: active, 200 o {{cartId}}"
                            className="w-full px-2.5 py-1 text-xs font-mono rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-orange-500"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {(val.type === 'STATUS_CODE' ||
                    val.type === 'RESPONSE_TIME_UNDER' ||
                    val.type === 'CONTAINS_STRING') && (
                    <div className="pt-1 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center gap-2">
                      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        {val.type === 'STATUS_CODE' ? 'Código HTTP:' : val.type === 'RESPONSE_TIME_UNDER' ? 'Máx ms:' : 'Texto a buscar:'}
                      </span>
                      <input
                        type="text"
                        value={val.expectedValue || ''}
                        onChange={e => handleUpdateValidation(val.id, { expectedValue: e.target.value })}
                        placeholder={
                          val.type === 'STATUS_CODE'
                            ? '200'
                            : val.type === 'RESPONSE_TIME_UNDER'
                            ? '1500'
                            : 'Texto esperado'
                        }
                        className="w-48 px-2.5 py-1 text-xs font-mono rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-orange-500"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onBack}
            className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-md transition-all"
          >
            <Save className="w-4 h-4" />
            <span>{initialVariant ? 'Guardar Cambios' : 'Crear Variante'}</span>
          </button>
        </div>
      </form>

      {/* Floating Action Dock */}
      <div className="fixed bottom-6 right-6 md:right-10 z-40 flex items-center gap-2 p-1.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl animate-in fade-in slide-in-from-bottom-2 duration-200">
        <button
          type="button"
          onClick={onBack}
          className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          Cancelar
        </button>

        <button
          type="button"
          onClick={() => setIsTesterOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-orange-200 dark:border-orange-800/60 bg-orange-50 dark:bg-orange-950/30 hover:bg-orange-100 dark:hover:bg-orange-900/40 text-orange-700 dark:text-orange-300 text-xs font-semibold transition-all shadow-xs"
          title="Probar petición en vivo en GraphiQL Sandbox"
        >
          <FlaskConical className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
          <span className="hidden sm:inline">Probar en</span> GraphiQL
        </button>

        <button
          type="button"
          onClick={handleSubmit}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-lg shadow-orange-500/25 transition-all active:scale-95"
          title="Guardar variante (Ctrl+S / Cmd+S)"
        >
          <Save className="w-4 h-4" />
          <span>{initialVariant ? 'Guardar Cambios' : 'Crear Variante'}</span>
          <span className="hidden sm:inline-block text-[10px] font-mono px-1.5 py-0.2 rounded bg-orange-700/60 text-orange-100 ml-1">
            ⌘S
          </span>
        </button>
      </div>

      {/* GraphiQL Tester Modal */}
      {isTesterOpen && (
        <VariantTesterModal
          variant={currentVariantDraft}
          onClose={() => {
            setIsTesterOpen(false);
            api.getEnvironments().then(setEnvironments).catch(console.error);
          }}
          onVariantUpdated={handleTesterUpdated}
        />
      )}
    </div>
  );
};
