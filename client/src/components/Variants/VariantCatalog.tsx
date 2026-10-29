import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Search,
  Copy,
  CopyPlus,
  Trash2,
  Edit2,
  Code2,
  Check,
  Folder,
  List,
  LayoutGrid,
  Layers,
  ChevronDown,
  ChevronRight,
  X,
  ShieldCheck,
  Variable,
  Download,
  Play,
  RefreshCw,
  FlaskConical,
  Globe,
  History
} from 'lucide-react';
import { Variant, FlowStepConfig, StepExecutionResult, Environment } from '../../types';
import { api } from '../../api';
import { VariantEditorView } from './VariantEditorView';
import { StepDetailModal } from '../Playground/StepDetailModal';
import { VariantTesterModal } from './VariantTesterModal';
import { VersionHistoryModal } from '../common/VersionHistoryModal';
import { useFeedback } from '../../context/FeedbackContext';
import { downloadJson, sanitizeFilename } from '../../utils/fileTransfer';

interface VariantCatalogProps {
  onNavigateToCategories?: () => void;
  onReloadEnvironments?: () => void;
}

// Helper to extract GraphQL operation type and field name
function extractOperationDetails(query: string): { type: string; operation: string } {
  if (!query) return { type: 'Mutation', operation: 'graphql' };
  const trimmed = query.trim();
  const isQuery = /^\s*query\b/i.test(trimmed);
  const isMutation = /^\s*mutation\b/i.test(trimmed);
  const type = isQuery ? 'Query' : isMutation ? 'Mutation' : 'GraphQL';

  const clean = trimmed.replace(/#[^\n\r]*/g, '');
  const firstBrace = clean.indexOf('{');
  if (firstBrace !== -1) {
    const afterBrace = clean.slice(firstBrace + 1).trim();
    const fieldMatch = afterBrace.match(/^([a-zA-Z0-9_]+)/);
    if (fieldMatch && fieldMatch[1]) {
      return { type, operation: fieldMatch[1] };
    }
  }
  return { type, operation: 'GraphQL' };
}

export const VariantCatalog: React.FC<VariantCatalogProps> = ({
  onNavigateToCategories: _onNavigateToCategories,
  onReloadEnvironments
}) => {
  const { confirm, toast } = useFeedback();
  const [variants, setVariants] = useState<Variant[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingVariant, setEditingVariant] = useState<Variant | null>(null);
  const [editingInitialCategory, setEditingInitialCategory] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // View preferences
  const [viewMode, setViewMode] = useState<'list' | 'cards'>(() => {
    return (localStorage.getItem('variant_view_mode') as 'list' | 'cards') || 'list';
  });
  const [groupByCategory, setGroupByCategory] = useState<boolean>(() => {
    const saved = localStorage.getItem('variant_group_by_cat');
    return saved !== null ? saved === 'true' : true;
  });
  const [expandedPreviewIds, setExpandedPreviewIds] = useState<Record<string, boolean>>({});
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [runningVariantId, setRunningVariantId] = useState<string | null>(null);
  const [executionResult, setExecutionResult] = useState<StepExecutionResult | null>(null);
  const [testingVariant, setTestingVariant] = useState<Variant | null>(null);
  const [versionHistoryTarget, setVersionHistoryTarget] = useState<Variant | null>(null);

  const handleVariantUpdated = (updated: Variant) => {
    setVariants(prev => prev.map(v => v.id === updated.id ? updated : v));
    setTestingVariant(updated);
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [vList, catList, envList] = await Promise.all([
        api.getVariants(),
        api.getCategories(),
        api.getEnvironments()
      ]);
      setVariants(vList);
      setCategories(catList);
      setEnvironments(envList);
    } catch (err) {
      console.error('Error fetching variants:', err);
    }
  };

  const handleExecuteVariant = async (variant: Variant) => {
    try {
      setRunningVariantId(variant.id);
      const stepConfig: FlowStepConfig = {
        id: `step-single-${Date.now().toString(36)}`,
        category: variant.category,
        variantId: variant.id,
        environmentId: variant.environmentId || undefined,
        skipped: false,
        overrideVariables: variant.defaultVariables || {},
        contextMapping: variant.contextMapping
      };
      const response = await api.executeStep(stepConfig, undefined, undefined, true);
      setExecutionResult(response.stepResult);

      // Refrescar environments para reflejar las variables recién guardadas
      api.getEnvironments().then(envs => {
        setEnvironments(envs);
        onReloadEnvironments?.();
      }).catch(console.error);

      const targetEnv = environments.find(e => e.id === variant.environmentId);
      const envLabel = targetEnv ? ` en ${targetEnv.name}` : '';
      const extractedKeys = Object.keys(response.stepResult.extractedVariables || {});
      const varsMsg = extractedKeys.length > 0 ? ` · Variables guardadas: ${extractedKeys.join(', ')}` : '';

      const failedTests = (response.stepResult.testResults || []).filter(t => !t.passed);
      if (
        response.status === 'SUCCESS' &&
        failedTests.length === 0 &&
        (!response.stepResult.errors || response.stepResult.errors.length === 0)
      ) {
        toast(`¡Variante "${variant.name}" ejecutada con éxito${envLabel} (${response.stepResult.durationMs}ms)${varsMsg}!`, 'success');
      } else if (failedTests.length > 0) {
        toast(`Variante finalizada${envLabel} pero no superó ${failedTests.length} prueba(s)${varsMsg}`, 'error');
      } else {
        toast(`Error al ejecutar variante: HTTP ${response.stepResult.status}${varsMsg}`, 'error');
      }
    } catch (err: any) {
      toast(`Error al ejecutar variante: ${err.message}`, 'error');
    } finally {
      setRunningVariantId(null);
    }
  };

  const handleExportSingle = (variant: Variant) => {
    const filename = `variante-${sanitizeFilename(variant.name)}.json`;
    downloadJson(filename, variant);
    toast(`Variante "${variant.name}" exportada`, 'success');
  };

  const handleToggleViewMode = (mode: 'list' | 'cards') => {
    setViewMode(mode);
    localStorage.setItem('variant_view_mode', mode);
  };

  const handleToggleGroupBy = () => {
    setGroupByCategory(prev => {
      const next = !prev;
      localStorage.setItem('variant_group_by_cat', String(next));
      return next;
    });
  };

  const toggleCategoryCollapse = (catName: string) => {
    setCollapsedCategories(prev => ({ ...prev, [catName]: !prev[catName] }));
  };

  const toggleExpandPreview = (id: string) => {
    setExpandedPreviewIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCreate = (category?: string) => {
    setEditingVariant(null);
    setEditingInitialCategory(category || null);
    setIsEditorOpen(true);
  };

  const handleEdit = (variant: Variant) => {
    setEditingVariant(variant);
    setIsEditorOpen(true);
  };

  const handleClone = async (id: string) => {
    try {
      const cloned = await api.cloneVariant(id);
      setVariants(prev => [...prev, cloned]);
      toast('Variante clonada con éxito', 'success');
    } catch (err: any) {
      toast(`Error al clonar variante: ${err.message}`, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: '¿Mover variante a la Papelera?',
      message: 'La variante se moverá a la Papelera de Reciclaje. Podrás restaurarla en cualquier momento.',
      confirmText: 'Mover a Papelera',
      isDestructive: true
    });
    if (!ok) return;

    try {
      await api.deleteVariant(id);
      setVariants(prev => prev.filter(v => v.id !== id));
      toast('Variante movida a la Papelera de Reciclaje', 'success');
    } catch (err: any) {
      toast(`Error al eliminar: ${err.message}`, 'error');
    }
  };

  const handleCreateCategory = async (name: string) => {
    try {
      const updated = await api.createCategory(name);
      setCategories(updated);
      toast(`Categoría "${name}" creada`, 'success');
    } catch (err: any) {
      toast(`Error creando categoría: ${err.message}`, 'error');
    }
  };

  const handleSaveEditor = async (variantData: Partial<Variant>) => {
    try {
      if (editingVariant) {
        const updated = await api.updateVariant(editingVariant.id, variantData);
        setVariants(prev => prev.map(v => (v.id === updated.id ? updated : v)));
        toast('Variante actualizada con éxito', 'success');
      } else {
        const created = await api.createVariant(variantData);
        setVariants(prev => [...prev, created]);
        toast('Variante creada con éxito', 'success');
      }
      setIsEditorOpen(false);
      setEditingVariant(null);
      loadData();
    } catch (err: any) {
      toast(`Error guardando: ${err.message}`, 'error');
    }
  };

  const handleCopyQuery = (e: React.MouseEvent, id: string, query: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(query);
    setCopiedId(id);
    toast('GraphQL copiado al portapapeles', 'info');
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filtered variants
  const filteredVariants = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return variants.filter(v => {
      const matchesCategory =
        selectedCategoryFilter === 'ALL' || v.category === selectedCategoryFilter;
      if (!matchesCategory) return false;
      if (!q) return true;
      return (
        v.name.toLowerCase().includes(q) ||
        (v.description && v.description.toLowerCase().includes(q)) ||
        v.query.toLowerCase().includes(q) ||
        (v.category && v.category.toLowerCase().includes(q))
      );
    });
  }, [variants, selectedCategoryFilter, searchTerm]);

  // Grouped by Category map
  const groupedVariants = useMemo(() => {
    const map = new Map<string, Variant[]>();
    // Pre-populate with all defined categories in order
    categories.forEach(cat => map.set(cat, []));
    map.set('Sin Categoría', []);

    filteredVariants.forEach(v => {
      const cat = v.category && categories.includes(v.category) ? v.category : 'Sin Categoría';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(v);
    });

    // Remove empty categories if searching or if filtered
    const result: { category: string; items: Variant[] }[] = [];
    map.forEach((items, cat) => {
      if (items.length > 0 || (selectedCategoryFilter === cat && searchTerm === '')) {
        result.push({ category: cat, items });
      }
    });
    return result;
  }, [filteredVariants, categories, selectedCategoryFilter, searchTerm]);

  // Full-screen Variant Editor View
  if (isEditorOpen) {
    return (
      <VariantEditorView
        initialVariant={editingVariant}
        categories={categories}
        defaultCategory={
          editingInitialCategory || (selectedCategoryFilter !== 'ALL' ? selectedCategoryFilter : categories[0] || 'Crear Carrito')
        }
        onSave={handleSaveEditor}
        onBack={() => {
          setIsEditorOpen(false);
          setEditingVariant(null);
          setEditingInitialCategory(null);
        }}
        onCreateCategory={handleCreateCategory}
      />
    );
  }

  return (
    <div className="max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <span>Catálogo de Variantes</span>
          <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
            {variants.length} total
          </span>
        </h1>

        <button
          onClick={() => handleCreate()}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition-all shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Nueva Variante</span>
        </button>
      </div>

      {/* Search Bar, Category Filter Select & View Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar por nombre, query, categoría o variables..."
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-orange-500 transition-colors shadow-sm"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              title="Limpiar búsqueda"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Category Select Filter */}
        <div className="w-full sm:w-64">
          <select
            value={selectedCategoryFilter}
            onChange={e => setSelectedCategoryFilter(e.target.value)}
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500 shadow-sm cursor-pointer"
          >
            <option value="ALL">Todas las Categorías ({variants.length})</option>
            {categories.map(cat => {
              const count = variants.filter(v => v.category === cat).length;
              return (
                <option key={cat} value={cat}>
                  {cat} ({count})
                </option>
              );
            })}
          </select>
        </div>

        <div className="flex items-center gap-1.5 self-end sm:self-auto">
          {/* Group by category toggle (only when all categories selected) */}
          {selectedCategoryFilter === 'ALL' && (
            <button
              onClick={handleToggleGroupBy}
              className={`flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-medium border transition-colors ${
                groupByCategory
                  ? 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900 text-orange-600 dark:text-orange-400'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
              title="Agrupar por etapa / categoría"
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Agrupar</span>
            </button>
          )}

          {/* View Mode Toggle: List vs Cards */}
          <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-0.5 shadow-sm">
            <button
              onClick={() => handleToggleViewMode('list')}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'list'
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
              title="Vista de Lista Compacta"
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Lista</span>
            </button>
            <button
              onClick={() => handleToggleViewMode('cards')}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'cards'
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
              title="Vista de Tarjetas"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Tarjetas</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter Info bar */}
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
        <span>
          Mostrando <strong className="text-slate-700 dark:text-slate-200">{filteredVariants.length}</strong> de {variants.length} variantes
          {selectedCategoryFilter !== 'ALL' && (
            <span> en <strong className="text-orange-600 dark:text-orange-400">{selectedCategoryFilter}</strong></span>
          )}
          {searchTerm && <span> para "{searchTerm}"</span>}
        </span>
        {(searchTerm || selectedCategoryFilter !== 'ALL') && (
          <button
            onClick={() => {
              setSearchTerm('');
              setSelectedCategoryFilter('ALL');
            }}
            className="text-orange-600 dark:text-orange-400 hover:underline font-medium text-xs"
          >
            Restablecer filtros
          </button>
        )}
      </div>

      {/* CONTENT: Either Grouped by Category or Flat List */}
      {filteredVariants.length === 0 ? (
        <div className="py-16 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 space-y-2">
          <p className="font-semibold text-slate-600 dark:text-slate-300">No se encontraron variantes</p>
          <p>Prueba con otros términos de búsqueda o pulsa "Nueva Variante".</p>
          <button
            onClick={() => handleCreate()}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-orange-600 text-white text-xs font-semibold hover:bg-orange-700 transition-colors mt-2"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Crear Variante</span>
          </button>
        </div>
      ) : selectedCategoryFilter === 'ALL' && groupByCategory ? (
        // Grouped Display
        <div className="space-y-4">
          {groupedVariants.map(group => {
            const isCollapsed = !!collapsedCategories[group.category];
            return (
              <div
                key={group.category}
                className="bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs"
              >
                {/* Category Group Header */}
                <div className="w-full flex items-center justify-between px-4 py-3 bg-slate-50/80 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800/80">
                  <div
                    onClick={() => toggleCategoryCollapse(group.category)}
                    className="flex items-center gap-2 cursor-pointer select-none flex-1"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                    <Folder className="w-4 h-4 text-orange-500" />
                    <span className="font-bold text-xs text-slate-800 dark:text-slate-200">
                      {group.category}
                    </span>
                    <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-md bg-slate-200/60 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                      {group.items.length}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCreate(group.category)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800/60 text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/50 text-[11px] font-semibold transition-all shadow-xs"
                      title={`Agregar variante a ${group.category}`}
                    >
                      <Plus className="w-3 h-3 text-orange-600 dark:text-orange-400" />
                      <span>Agregar Variante</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleCategoryCollapse(group.category)}
                      className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 px-1"
                    >
                      {isCollapsed ? 'Desplegar' : 'Plegar'}
                    </button>
                  </div>
                </div>

                {/* Group Items */}
                {!isCollapsed && (
                  <div className="p-3">
                    {viewMode === 'list' ? (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                        {group.items.map(variant => renderVariantRow(variant))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {group.items.map(variant => renderVariantCard(variant))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        // Flat Display (either filtered by single category or ungrouped)
        <div className="space-y-3">
          {selectedCategoryFilter !== 'ALL' && (
            <div className="flex items-center justify-between px-4 py-2.5 bg-orange-50/40 dark:bg-orange-950/20 border border-orange-200/60 dark:border-orange-800/40 rounded-xl">
              <div className="flex items-center gap-2">
                <Folder className="w-4 h-4 text-orange-500" />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Categoría: {selectedCategoryFilter}
                </span>
                <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-md bg-orange-200/50 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300">
                  {filteredVariants.length} variantes
                </span>
              </div>

              <button
                type="button"
                onClick={() => handleCreate(selectedCategoryFilter)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-xs transition-all"
                title={`Crear nueva variante en ${selectedCategoryFilter}`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar Variante</span>
              </button>
            </div>
          )}

          {viewMode === 'list' ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800/80 shadow-xs overflow-hidden">
              {filteredVariants.map(variant => renderVariantRow(variant))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredVariants.map(variant => renderVariantCard(variant))}
            </div>
          )}
        </div>
      )}

      {/* Modal de Detalle / Inspección de Ejecución de Variante */}
      {executionResult && (
        <StepDetailModal
          step={executionResult}
          onClose={() => setExecutionResult(null)}
        />
      )}

      {/* Modal / Sandbox de Pruebas GraphiQL en Tiempo Real */}
      {testingVariant && (
        <VariantTesterModal
          variant={testingVariant}
          onClose={() => {
            setTestingVariant(null);
            api.getEnvironments().then(envs => {
              setEnvironments(envs);
              onReloadEnvironments?.();
            }).catch(console.error);
          }}
          onVariantUpdated={handleVariantUpdated}
        />
      )}

      {/* Modal de Historial de Versiones */}
      {versionHistoryTarget && (
        <VersionHistoryModal
          isOpen={!!versionHistoryTarget}
          onClose={() => setVersionHistoryTarget(null)}
          entityType="VARIANT"
          entityId={versionHistoryTarget.id}
          entityTitle={versionHistoryTarget.name}
          onRollbackSuccess={(restoredVar: Variant) => {
            setVariants(prev => prev.map(v => (v.id === restoredVar.id ? restoredVar : v)));
          }}
        />
      )}
    </div>
  );

  // RENDER: Clean Compact List Row
  function renderVariantRow(variant: Variant) {
    const isExpanded = !!expandedPreviewIds[variant.id];
    const op = extractOperationDetails(variant.query);
    const varCount = Object.keys(variant.defaultVariables || {}).length;
    const testCount = variant.customValidations?.length || 0;
    const targetEnv = environments.find(e => e.id === variant.environmentId);
    const hasEnvOverride =
      variant.environmentOverrides && Object.keys(variant.environmentOverrides).length > 0;
    const hasHeaders = variant.customHeaders && Object.keys(variant.customHeaders).length > 0;

    return (
      <div key={variant.id} className="transition-colors group hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
        <div
          onClick={() => toggleExpandPreview(variant.id)}
          className="px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-2.5 cursor-pointer"
        >
          {/* Main Info */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              onClick={e => {
                e.stopPropagation();
                toggleExpandPreview(variant.id);
              }}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded transition-colors"
              title={isExpanded ? 'Ocultar GraphQL' : 'Ver GraphQL'}
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-orange-500" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-xs text-slate-900 dark:text-slate-100 hover:text-orange-600 dark:hover:text-orange-400 transition-colors">
                  {variant.name}
                </span>

                {/* Operation Pill */}
                {variant.apiType === 'REST' ? (
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 font-semibold">
                    REST · {variant.method || 'POST'}
                  </span>
                ) : (
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    {op.operation}
                  </span>
                )}

                {/* Category Pill (shown if not grouped or in search) */}
                {selectedCategoryFilter === 'ALL' && !groupByCategory && (
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-800/60">
                    {variant.category}
                  </span>
                )}

                {variant.isVirtualOnly && (
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800">
                    Virtual
                  </span>
                )}
              </div>

              {variant.description && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {variant.description}
                </p>
              )}

              {(variant.updatedByName || variant.createdByName) && (
                <p className="text-[10px] text-slate-400 truncate mt-0.5 flex items-center gap-1">
                  <span>{variant.updatedByName ? `Modif: ${variant.updatedByName}` : `Por: ${variant.createdByName}`}</span>
                  {variant.updatedAt && (
                    <span className="text-slate-400">· {new Date(variant.updatedAt).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' })}</span>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* Metadata Badges & Actions */}
          <div className="flex items-center gap-2 flex-wrap self-end md:self-auto shrink-0">
            {/* Meta chips */}
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500 dark:text-slate-400">
              <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 flex items-center gap-1">
                <Variable className="w-3 h-3 text-slate-400" />
                <span>{varCount} vars</span>
              </span>

              {targetEnv && (
                <span
                  className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60 font-semibold flex items-center gap-1"
                  title={`Asignada al Entorno: ${targetEnv.name} (${targetEnv.magentoUrl})`}
                >
                  <Globe className="w-3 h-3 text-blue-500" />
                  <span>Env: {targetEnv.name}</span>
                </span>
              )}

              {hasEnvOverride && (
                <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
                  Env
                </span>
              )}

              {hasHeaders && (
                <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60">
                  Headers
                </span>
              )}

              {testCount > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800/60 flex items-center gap-0.5">
                  <ShieldCheck className="w-3 h-3" />
                  <span>{testCount}</span>
                </span>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1 border-l border-slate-200 dark:border-slate-800 pl-2">
              <button
                onClick={e => {
                  e.stopPropagation();
                  setTestingVariant(variant);
                }}
                className="flex items-center gap-1 px-2 py-1 rounded-lg border border-orange-200 dark:border-orange-800/60 bg-orange-50 dark:bg-orange-950/30 hover:bg-orange-100 dark:hover:bg-orange-900/40 text-orange-700 dark:text-orange-300 text-xs font-semibold transition-all shadow-xs"
                title="Abrir en GraphiQL Sandbox para probar peticiones en tiempo real"
              >
                <FlaskConical className="w-3 h-3 text-orange-600 dark:text-orange-400" />
                <span>Playground</span>
              </button>

              <button
                onClick={e => {
                  e.stopPropagation();
                  handleExecuteVariant(variant);
                }}
                disabled={runningVariantId === variant.id}
                className="flex items-center gap-1 px-2 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold transition-all shadow-xs disabled:opacity-50"
                title="Ejecutar esta variante inmediatamente en el entorno activo"
              >
                {runningVariantId === variant.id ? (
                  <RefreshCw className="w-3 h-3 text-emerald-600 animate-spin" />
                ) : (
                  <Play className="w-3 h-3 text-emerald-600 fill-emerald-600" />
                )}
                <span>Ejecutar</span>
              </button>

              <button
                onClick={e => handleCopyQuery(e, variant.id, variant.query)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Copiar GraphQL"
              >
                {copiedId === variant.id ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>

              <button
                onClick={e => {
                  e.stopPropagation();
                  handleExportSingle(variant);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950/30 transition-colors"
                title="Exportar variante a JSON"
              >
                <Download className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={e => {
                  e.stopPropagation();
                  handleClone(variant.id);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Clonar variante"
              >
                <CopyPlus className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={e => {
                  e.stopPropagation();
                  setVersionHistoryTarget(variant);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950/30 transition-colors"
                title="Historial de versiones y rollback"
              >
                <History className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={e => {
                  e.stopPropagation();
                  handleEdit(variant);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/30 transition-colors"
                title="Editar variante (Pantalla completa)"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={e => {
                  e.stopPropagation();
                  handleDelete(variant.id);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                title="Eliminar variante"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Collapsible Query & Details Drawer */}
        {isExpanded && (
          <div className="px-4 pb-4 pt-1 bg-slate-50/50 dark:bg-slate-950/40 border-t border-slate-100 dark:border-slate-800/60">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {/* Query Block */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="font-semibold flex items-center gap-1">
                    <Code2 className="w-3 h-3 text-orange-500" />
                    <span>Query GraphQL</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setTestingVariant(variant)}
                      className="text-orange-600 dark:text-orange-400 hover:underline flex items-center gap-1 font-semibold"
                    >
                      <FlaskConical className="w-3 h-3" />
                      <span>Probar en Sandbox</span>
                    </button>
                    <button
                      onClick={e => handleCopyQuery(e, variant.id, variant.query)}
                      className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copiar</span>
                    </button>
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-xl p-3 border border-slate-200 dark:border-slate-800 overflow-x-auto max-h-48 font-mono text-[11px] text-slate-800 dark:text-orange-300">
                  <pre>{variant.query}</pre>
                </div>
              </div>

              {/* Variables & Info Block */}
              <div className="space-y-1">
                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1">
                  <Variable className="w-3 h-3 text-orange-500" />
                  <span>Variables por Defecto &amp; Configuración</span>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-xl p-3 border border-slate-200 dark:border-slate-800 space-y-2 max-h-48 overflow-y-auto">
                  {varCount > 0 ? (
                    <pre className="font-mono text-[10px] text-slate-700 dark:text-slate-300 overflow-x-auto">
                      {JSON.stringify(variant.defaultVariables, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-[11px] text-slate-400 italic">Sin variables por defecto</p>
                  )}

                  {hasEnvOverride && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                      <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                        Captura variables en el Entorno:
                      </span>
                      <pre className="font-mono text-[10px] text-slate-600 dark:text-slate-300 mt-0.5">
                        {JSON.stringify(variant.environmentOverrides, null, 2)}
                      </pre>
                    </div>
                  )}

                  {hasHeaders && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                      <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                        Headers Personalizados:
                      </span>
                      <pre className="font-mono text-[10px] text-slate-600 dark:text-slate-300 mt-0.5">
                        {JSON.stringify(variant.customHeaders, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // RENDER: Clean Card View
  function renderVariantCard(variant: Variant) {
    const isExpanded = !!expandedPreviewIds[variant.id];
    const op = extractOperationDetails(variant.query);
    const varCount = Object.keys(variant.defaultVariables || {}).length;
    const testCount = variant.customValidations?.length || 0;
    const targetEnv = environments.find(e => e.id === variant.environmentId);
    const hasEnvOverride =
      variant.environmentOverrides && Object.keys(variant.environmentOverrides).length > 0;
    const hasHeaders = variant.customHeaders && Object.keys(variant.customHeaders).length > 0;

    return (
      <div
        key={variant.id}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 transition-all shadow-xs"
      >
        <div className="space-y-2.5">
          {/* Header Badges */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 truncate">
              {variant.category}
            </span>
            {variant.apiType === 'REST' ? (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 font-semibold">
                REST · {variant.method || 'POST'}
              </span>
            ) : (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                {op.operation}
              </span>
            )}
          </div>

          {/* Title & Description */}
          <div>
            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 line-clamp-1">
              {variant.name}
            </h3>
            {variant.description && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">
                {variant.description}
              </p>
            )}
          </div>

          {/* Metadata chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              {varCount} vars
            </span>
            {targetEnv && (
              <span
                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60 font-semibold flex items-center gap-1"
                title={`Entorno asignado: ${targetEnv.name} (${targetEnv.magentoUrl})`}
              >
                <Globe className="w-3 h-3 text-blue-500" />
                <span>Env: {targetEnv.name}</span>
              </span>
            )}
            {hasEnvOverride && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
                Env
              </span>
            )}
            {hasHeaders && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60">
                Headers
              </span>
            )}
            {testCount > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800/60">
                {testCount} tests
              </span>
            )}
            {variant.isVirtualOnly && (
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400">
                Virtual
              </span>
            )}
          </div>

          {/* Collapsible Query Section */}
          <div className="pt-1">
            <button
              onClick={() => toggleExpandPreview(variant.id)}
              className="text-[11px] font-semibold text-orange-600 dark:text-orange-400 hover:underline flex items-center gap-1"
            >
              <Code2 className="w-3 h-3" />
              <span>{isExpanded ? 'Ocultar GraphQL' : 'Ver GraphQL'}</span>
            </button>

            {isExpanded && (
              <div className="mt-2 bg-slate-50 dark:bg-slate-950 rounded-xl p-2.5 border border-slate-200 dark:border-slate-800 overflow-x-auto max-h-36">
                <pre className="font-mono text-[10px] text-slate-800 dark:text-orange-300">
                  {variant.query}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <button
            onClick={e => handleCopyQuery(e, variant.id, variant.query)}
            className="text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1 transition-colors"
          >
            {copiedId === variant.id ? (
              <>
                <Check className="w-3 h-3 text-emerald-500" />
                <span className="text-emerald-500 font-semibold">Copiado</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>Copiar</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setTestingVariant(variant)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg border border-orange-200 dark:border-orange-800/60 bg-orange-50 dark:bg-orange-950/30 hover:bg-orange-100 dark:hover:bg-orange-900/40 text-orange-700 dark:text-orange-300 text-xs font-semibold transition-all shadow-xs"
              title="Abrir en GraphiQL Sandbox para probar peticiones en tiempo real"
            >
              <FlaskConical className="w-3 h-3 text-orange-600 dark:text-orange-400" />
              <span>Playground</span>
            </button>

            <button
              onClick={() => handleExecuteVariant(variant)}
              disabled={runningVariantId === variant.id}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold transition-all shadow-xs disabled:opacity-50"
              title="Ejecutar esta variante inmediatamente en el entorno activo"
            >
              {runningVariantId === variant.id ? (
                <RefreshCw className="w-3 h-3 text-emerald-600 animate-spin" />
              ) : (
                <Play className="w-3 h-3 text-emerald-600 fill-emerald-600" />
              )}
              <span>Ejecutar</span>
            </button>
            <button
              onClick={() => handleExportSingle(variant)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950/30 transition-colors"
              title="Exportar variante a JSON"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleClone(variant.id)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Clonar variante"
            >
              <CopyPlus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setVersionHistoryTarget(variant)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950/30 transition-colors"
              title="Historial de versiones y rollback"
            >
              <History className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleEdit(variant)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/30 transition-colors"
              title="Editar variante (Pantalla completa)"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleDelete(variant.id)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
              title="Eliminar variante"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }
};
