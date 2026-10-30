import React, { useState, useEffect } from 'react';
import {
  Play,
  StepForward,
  RotateCcw,
  Sliders,
  Trash2,
  Plus,
  FilePlus,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Save,
  Edit2,
  GripVertical,
  Lock,
  History,
  FileSpreadsheet
} from 'lucide-react';
import {
  Variant,
  SavedFlow,
  FlowStepConfig,
  FlowExecutionResponse,
  StepExecutionResult,
  ExecutionContext,
  CsvDataset
} from '../../types';
import { api } from '../../api';
import { SearchableSelect } from '../common/SearchableSelect';
import { StepDetailModal } from './StepDetailModal';
import { SaveFlowModal } from './SaveFlowModal';
import { FlowExecutionModal } from './FlowExecutionModal';
import { CsvDatasetModal } from './CsvDatasetModal';
import { VersionHistoryModal } from '../common/VersionHistoryModal';
import { CodeEditor } from '../common/CodeEditor';
import { VariantEditorView } from '../Variants/VariantEditorView';
import { useFeedback } from '../../context/FeedbackContext';

interface FlowRunnerProps {
  initialFlow?: SavedFlow | null;
  onFlowChange?: (flowId: string) => void;
}

export const FlowRunner: React.FC<FlowRunnerProps> = ({ initialFlow, onFlowChange }) => {
  const { toast } = useFeedback();
  const [variants, setVariants] = useState<Variant[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [savedFlows, setSavedFlows] = useState<SavedFlow[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState<string>('');
  const [steps, setSteps] = useState<FlowStepConfig[]>([]);
  const [dataset, setDataset] = useState<CsvDataset | undefined>(undefined);
  const [savedSnapshot, setSavedSnapshot] = useState<string>('');
  const [expandedVars, setExpandedVars] = useState<Record<string, boolean>>({});
  const [rawJsonOverrides, setRawJsonOverrides] = useState<Record<string, string>>({});

  // Execution states
  const [runningStepId, setRunningStepId] = useState<string | null>(null);
  const [stepResults, setStepResults] = useState<Record<string, StepExecutionResult>>({});
  const [executionContext, setExecutionContext] = useState<ExecutionContext>({
    cartId: null,
    token: null,
    orderNumber: null,
    variables: {},
    logs: []
  });
  const [executionResult, setExecutionResult] = useState<FlowExecutionResponse | null>(null);

  // Modals & UI helpers
  const [selectedStepDetail, setSelectedStepDetail] = useState<StepExecutionResult | null>(null);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isVersionModalOpen, setIsVersionModalOpen] = useState(false);
  const [isExecutionModalOpen, setIsExecutionModalOpen] = useState(false);
  const [isDatasetModalOpen, setIsDatasetModalOpen] = useState(false);
  const isExecutingAll = isExecutionModalOpen;
  const [copiedOrder, setCopiedOrder] = useState(false);
  const [editingVariant, setEditingVariant] = useState<Variant | null>(null);

  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragEnabledIndex, setDragEnabledIndex] = useState<number | null>(null);

  // Unsaved changes calculation
  const serializeFlowState = (stepsList: FlowStepConfig[], currentDataset?: CsvDataset) => {
    return JSON.stringify({
      steps: stepsList.map(s => ({
        category: s.category,
        variantId: s.variantId,
        skipped: !!s.skipped,
        overrideVariables: s.overrideVariables || {}
      })),
      dataset: currentDataset
        ? {
            name: currentDataset.name,
            headers: currentDataset.headers,
            rows: currentDataset.rows
          }
        : null
    });
  };

  const hasUnsavedChanges =
    steps.length > 0 && serializeFlowState(steps, dataset) !== savedSnapshot;

  // Browser reload / tab close warning if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    setDragEnabledIndex(null);
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }
    const newSteps = [...steps];
    const [movedStep] = newSteps.splice(draggedIndex, 1);
    newSteps.splice(targetIndex, 0, movedStep);
    setSteps(newSteps);
    setDraggedIndex(null);
    setDragOverIndex(null);
    toast('Paso reordenado', 'info');
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
    setDragEnabledIndex(null);
  };

  useEffect(() => {
    loadData(true);
  }, []);

  useEffect(() => {
    if (initialFlow) {
      applySavedFlow(initialFlow);
      setSelectedFlowId(initialFlow.id);
    }
  }, [initialFlow]);

  const loadData = async (isInitial = false) => {
    try {
      const [vList, catList, fList] = await Promise.all([
        api.getVariants(),
        api.getCategories(),
        api.getFlows()
      ]);
      setVariants(vList);
      setCategories(catList);
      setSavedFlows(fList);

      if (isInitial) {
        if (initialFlow) {
          applySavedFlow(initialFlow, vList);
        } else if (fList.length > 0) {
          applySavedFlow(fList[0], vList);
          setSelectedFlowId(fList[0].id);
        } else {
          initInitialSteps(vList, catList);
        }
      }
    } catch (err) {
      console.error('Error loading data:', err);
    }
  };

  const initInitialSteps = (vList: Variant[], catList: string[]) => {
    const defaultCats = [
      'Crear Carrito',
      'Agregar Dirección Envio',
      'Agregar Productos',
      'Agregar Dirección Facturación',
      'Agregar Tipo Envio',
      'Agregar Método de Pago',
      'Finalizar Carrito'
    ];
    const activeCats = defaultCats.filter(c => catList.includes(c));

    const initial: FlowStepConfig[] = (activeCats.length > 0 ? activeCats : catList.slice(0, 4)).map(
      (cat, idx) => {
        const catVariants = vList.filter(v => v.category === cat);
        const selVariant = catVariants.length > 0 ? catVariants[0] : null;
        const defaultVars = selVariant?.variables || selVariant?.defaultVariables || {};
        return {
          id: 'step-' + idx + '-' + Date.now().toString(36),
          category: cat,
          variantId: selVariant ? selVariant.id : null,
          skipped: false,
          overrideVariables: defaultVars
        };
      }
    );

    setSteps(initial);
    setDataset(undefined);
    const overridesMap: Record<string, string> = {};
    initial.forEach(s => {
      if (s.overrideVariables && Object.keys(s.overrideVariables).length > 0) {
        overridesMap[s.id] = JSON.stringify(s.overrideVariables, null, 2);
      }
    });
    setRawJsonOverrides(overridesMap);
    setSavedSnapshot(serializeFlowState(initial, undefined));
    resetRunState();
  };

  const applySavedFlow = (flow: SavedFlow, currentVariants: Variant[] = variants) => {
    const normalized: FlowStepConfig[] = (flow.steps || []).map((s, idx) => {
      const v = currentVariants.find(varItem => varItem.id === s.variantId);
      const defaultVars = v?.variables || v?.defaultVariables || {};
      const overrideVars =
        s.overrideVariables && Object.keys(s.overrideVariables).length > 0
          ? s.overrideVariables
          : defaultVars;
      return {
        id: s.id || 'step-' + idx + '-' + Date.now().toString(36),
        category: s.category || 'General',
        variantId: s.variantId || null,
        skipped: s.skipped || false,
        overrideVariables: overrideVars
      };
    });

    setSteps(normalized);
    setDataset(flow.dataset);
    const overridesMap: Record<string, string> = {};
    normalized.forEach(s => {
      if (s.overrideVariables && Object.keys(s.overrideVariables).length > 0) {
        overridesMap[s.id] = JSON.stringify(s.overrideVariables, null, 2);
      }
    });
    setRawJsonOverrides(overridesMap);
    setSavedSnapshot(serializeFlowState(normalized, flow.dataset));
    onFlowChange?.(flow.id);
    resetRunState();
  };

  const resetRunState = () => {
    setExecutionResult(null);
    setStepResults({});
    setExecutionContext({
      cartId: null,
      token: null,
      orderNumber: null,
      variables: {},
      logs: []
    });
  };

  const handleStartNewFlow = () => {
    setSelectedFlowId('');
    setSteps([]);
    setDataset(undefined);
    resetRunState();
    setRawJsonOverrides({});
    setExpandedVars({});
    setSavedSnapshot(serializeFlowState([], undefined));
    onFlowChange?.('');
  };

  const handleSelectFlow = (flowId: string) => {
    setSelectedFlowId(flowId);
    onFlowChange?.(flowId);
    if (!flowId) return;
    const found = savedFlows.find(f => f.id === flowId);
    if (found) {
      applySavedFlow(found);
    }
  };

  // Add Step
  const handleAddStep = (categoryToAdd?: string) => {
    const chosenCat = categoryToAdd || (categories.length > 0 ? categories[0] : 'General');
    const catVariants = variants.filter(v => v.category === chosenCat);
    const selVariant = catVariants.length > 0 ? catVariants[0] : null;
    const defaultVars = selVariant?.variables || selVariant?.defaultVariables || {};
    const newStep: FlowStepConfig = {
      id: 'step-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 5),
      category: chosenCat,
      variantId: selVariant ? selVariant.id : null,
      skipped: false,
      overrideVariables: defaultVars
    };
    setSteps(prev => [...prev, newStep]);
    if (selVariant) {
      setRawJsonOverrides(r => ({ ...r, [newStep.id]: JSON.stringify(defaultVars, null, 2) }));
    }
  };

  // Remove Step
  const handleRemoveStep = (stepId: string) => {
    setSteps(prev => prev.filter(s => s.id !== stepId));
    setStepResults(prev => {
      const next = { ...prev };
      delete next[stepId];
      return next;
    });
  };

  // Move Step
  const handleMoveStep = (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === steps.length - 1)) {
      return;
    }
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const nextSteps = [...steps];
    const temp = nextSteps[index];
    nextSteps[index] = nextSteps[targetIndex];
    nextSteps[targetIndex] = temp;
    setSteps(nextSteps);
  };

  // Category Change -> Auto-filter variants and select first of that category
  const handleCategoryChange = (stepId: string, newCategory: string) => {
    const matchingVariants = variants.filter(v => v.category === newCategory);
    const selVariant = matchingVariants.length > 0 ? matchingVariants[0] : null;
    const defaultVars = selVariant?.variables || selVariant?.defaultVariables || {};
    setSteps(prev =>
      prev.map(s => {
        if (s.id === stepId) {
          return {
            ...s,
            category: newCategory,
            variantId: selVariant ? selVariant.id : null,
            overrideVariables: defaultVars
          };
        }
        return s;
      })
    );
    if (selVariant) {
      setRawJsonOverrides(r => ({ ...r, [stepId]: JSON.stringify(defaultVars, null, 2) }));
    }
  };

  // Variant Change -> Loads that variant's default variables into the step's overrideVariables
  const handleVariantChange = (stepId: string, variantId: string) => {
    const newVariant = variants.find(v => v.id === variantId);
    const defaultVars = newVariant?.variables || newVariant?.defaultVariables || {};
    setSteps(prev =>
      prev.map(s => (s.id === stepId ? { ...s, variantId, overrideVariables: defaultVars } : s))
    );
    if (newVariant) {
      setRawJsonOverrides(prev => ({
        ...prev,
        [stepId]: JSON.stringify(defaultVars, null, 2)
      }));
    }
  };

  // Skip Toggle
  const handleToggleSkip = (stepId: string) => {
    setSteps(prev => prev.map(s => (s.id === stepId ? { ...s, skipped: !s.skipped } : s)));
  };

  // Override variables toggle - ensures variant's variables are pre-populated if empty
  const handleToggleExpandVars = (stepId: string) => {
    setExpandedVars(prev => {
      const willBeOpen = !prev[stepId];
      if (willBeOpen) {
        const step = steps.find(s => s.id === stepId);
        const variant = variants.find(v => v.id === step?.variantId);
        if (step && variant) {
          if (!rawJsonOverrides[stepId]) {
            const varsToUse =
              step.overrideVariables && Object.keys(step.overrideVariables).length > 0
                ? step.overrideVariables
                : variant.variables || variant.defaultVariables || {};
            const pretty = JSON.stringify(varsToUse, null, 2);
            setRawJsonOverrides(r => ({ ...r, [stepId]: pretty }));
            setSteps(curr =>
              curr.map(s => (s.id === stepId ? { ...s, overrideVariables: varsToUse } : s))
            );
          }
        }
      }
      return { ...prev, [stepId]: willBeOpen };
    });
  };

  // Reset step variables to the variant's original default
  const handleResetStepVariablesToDefault = (stepId: string) => {
    const step = steps.find(s => s.id === stepId);
    const variant = variants.find(v => v.id === step?.variantId);
    if (!variant) return;
    const defaultVars = variant.variables || variant.defaultVariables || {};
    const pretty = JSON.stringify(defaultVars, null, 2);
    setRawJsonOverrides(r => ({ ...r, [stepId]: pretty }));
    setSteps(curr => curr.map(s => (s.id === stepId ? { ...s, overrideVariables: defaultVars } : s)));
    toast(`Variables restablecidas al valor por defecto de "${variant.name}"`, 'info');
  };

  const handleOverrideJsonChange = (stepId: string, text: string) => {
    setRawJsonOverrides(prev => ({ ...prev, [stepId]: text }));
    try {
      const parsed = JSON.parse(text || '{}');
      setSteps(prev => prev.map(s => (s.id === stepId ? { ...s, overrideVariables: parsed } : s)));
    } catch {
      // JSON syntax being written
    }
  };

  // Active loaded flow
  const activeFlow = savedFlows.find(f => f.id === selectedFlowId) || null;

  // Overwrite existing flow
  const handleOverwriteFlow = async (flowId: string, name?: string, description?: string) => {
    if (steps.length === 0) {
      toast('Agrega al menos un paso antes de guardar el flujo', 'info');
      return;
    }
    try {
      const existing = savedFlows.find(f => f.id === flowId);
      const updated = await api.updateFlow(flowId, {
        name: name || existing?.name || 'Flujo de Checkout',
        description: description !== undefined ? description : existing?.description,
        steps,
        dataset
      });
      setSavedFlows(prev => prev.map(f => (f.id === updated.id ? updated : f)));
      setSelectedFlowId(updated.id);
      setSavedSnapshot(serializeFlowState(steps, dataset));
      onFlowChange?.(updated.id);
      toast(`¡Flujo "${updated.name}" guardado con éxito!`, 'success');
    } catch (err: any) {
      toast(`Error al actualizar flujo: ${err.message}`, 'error');
    }
  };

  // Save as new Flow
  const handleSaveNewFlow = async (name: string, description: string) => {
    if (steps.length === 0) {
      toast('Agrega al menos un paso antes de guardar el flujo', 'info');
      return;
    }
    try {
      const created = await api.createFlow({ name, description, steps, dataset });
      setSavedFlows(prev => [...prev, created]);
      setSelectedFlowId(created.id);
      setSavedSnapshot(serializeFlowState(steps, dataset));
      onFlowChange?.(created.id);
      toast(`¡Flujo "${created.name}" guardado como nuevo!`, 'success');
    } catch (err: any) {
      toast(`Error al guardar: ${err.message}`, 'error');
    }
  };

  const handleSaveClick = () => {
    if (steps.length === 0) {
      toast('Agrega al menos un paso antes de guardar el flujo', 'info');
      return;
    }
    setIsSaveModalOpen(true);
  };

  // Direct Variant Editing from step
  const handleEditVariantFromStep = (variantId: string) => {
    const found = variants.find(v => v.id === variantId);
    if (found) {
      setEditingVariant(found);
    } else {
      toast('No se encontró la variante seleccionada', 'error');
    }
  };

  const handleSaveVariantFromEditor = async (variantData: Partial<Variant>) => {
    if (!editingVariant) return;
    try {
      const updated = await api.updateVariant(editingVariant.id, variantData);
      setVariants(prev => prev.map(v => (v.id === updated.id ? updated : v)));
      toast(`Variante "${updated.name}" actualizada con éxito`, 'success');
      setEditingVariant(null);
    } catch (err: any) {
      toast(`Error al actualizar variante: ${err.message}`, 'error');
    }
  };

  const handleCreateCategoryFromEditor = async (catName: string) => {
    try {
      const updated = await api.createCategory(catName);
      setCategories(updated);
      toast(`Categoría "${catName}" creada`, 'success');
    } catch (err: any) {
      toast(`Error al crear categoría: ${err.message}`, 'error');
    }
  };

  // Full Flow Execution Modal trigger
  const handleExecuteAll = () => {
    const active = steps.filter(s => !s.skipped && s.variantId);
    if (active.length === 0) {
      toast('Configura al menos un paso activo con variante antes de ejecutar', 'info');
      return;
    }
    setIsExecutionModalOpen(true);
  };

  // Single Step Execution
  const handleExecuteSingleStep = async (step: FlowStepConfig) => {
    if (step.skipped || !step.variantId) return;
    setRunningStepId(step.id);

    try {
      const response = await api.executeStep(step, executionContext);
      setStepResults(prev => ({ ...prev, [step.id]: response.stepResult }));
      setExecutionContext(response.updatedContext);

      if (response.updatedContext.orderNumber) {
        setExecutionResult({
          status: 'SUCCESS',
          orderNumber: response.updatedContext.orderNumber,
          totalTimeMs: Object.values({ ...stepResults, [step.id]: response.stepResult }).reduce(
            (acc, s) => acc + (s?.durationMs || 0),
            0
          ),
          failedAtCategory: null,
          steps: Object.values({ ...stepResults, [step.id]: response.stepResult })
        });
      }
    } catch (err: any) {
      toast(`Error en paso: ${err.message}`, 'error');
    } finally {
      setRunningStepId(null);
    }
  };

  // Step-by-step Next execution
  const handleExecuteNextStep = async () => {
    const nextStep = steps.find(s => !s.skipped && !stepResults[s.id]);
    if (nextStep) {
      await handleExecuteSingleStep(nextStep);
    } else {
      toast('Todos los pasos activos ya han sido ejecutados. Pulsa Reset para reiniciar.', 'info');
    }
  };

  const handleCopyOrder = (orderNum: string) => {
    navigator.clipboard.writeText(orderNum);
    setCopiedOrder(true);
    setTimeout(() => setCopiedOrder(false), 2000);
  };

  const totalTimeCalculated =
    executionResult?.totalTimeMs ??
    Object.values(stepResults).reduce((acc, s) => acc + (s?.durationMs || 0), 0);

  const categoryOptions = categories.map(c => ({ value: c, label: c }));
  const flowOptions = [
    { value: '', label: 'Flujo Personalizado (Sin guardar)' },
    ...savedFlows.map(f => ({ value: f.id, label: f.name, sublabel: f.description }))
  ];

  if (editingVariant) {
    return (
      <VariantEditorView
        initialVariant={editingVariant}
        categories={categories}
        defaultCategory={editingVariant.category || categories[0] || 'Crear Carrito'}
        onSave={handleSaveVariantFromEditor}
        onBack={() => setEditingVariant(null)}
        onCreateCategory={handleCreateCategoryFromEditor}
      />
    );
  }

  return (
    <div className="max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      {/* Control Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors">
        {/* Left: Load Saved Flow & Add Step */}
        <div className="flex flex-wrap items-center gap-2">
          {savedFlows.length > 0 && (
            <div className="w-52">
              <SearchableSelect
                options={flowOptions}
                value={selectedFlowId}
                onChange={handleSelectFlow}
                placeholder="Cargar flujo guardado..."
              />
            </div>
          )}

          <button
            onClick={handleStartNewFlow}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors"
            title="Limpiar playground e iniciar un nuevo flujo"
          >
            <FilePlus className="w-3.5 h-3.5 text-orange-500" />
            <span>Iniciar nuevo flujo</span>
          </button>

          <button
            onClick={() => handleAddStep()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition-all shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Agregar Paso</span>
          </button>

          {/* Unificado: Un solo botón de Guardar con indicador de cambios sin guardar */}
          <button
            onClick={handleSaveClick}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm ${
              hasUnsavedChanges
                ? 'bg-orange-600 hover:bg-orange-700 text-white ring-2 ring-orange-500/30'
                : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}
            title={
              hasUnsavedChanges
                ? 'Hay cambios sin guardar. Haz clic para guardar.'
                : 'Todos los cambios están guardados'
            }
          >
            {hasUnsavedChanges ? (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-300 animate-pulse" />
                <Save className="w-3.5 h-3.5" />
                <span>Guardar</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span>Guardado</span>
              </>
            )}
          </button>

          {/* Badge de estado de cambios */}
          {activeFlow && (
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all ${
                hasUnsavedChanges
                  ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30'
                  : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
              }`}
            >
              {hasUnsavedChanges ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                  <span>Sin guardar</span>
                </>
              ) : (
                <>
                  <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  <span>Guardado</span>
                </>
              )}
            </span>
          )}

          {activeFlow && (
            <button
              onClick={() => setIsVersionModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors shadow-xs"
              title="Historial de versiones y rollback"
            >
              <History className="w-3.5 h-3.5 text-orange-500" />
              <span>Versiones</span>
            </button>
          )}

          {/* Botón Matriz CSV / Dataset */}
          <button
            onClick={() => setIsDatasetModalOpen(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all shadow-xs ${
              dataset && dataset.rows && dataset.rows.length > 0
                ? 'bg-orange-500/10 border-orange-500/40 text-orange-600 dark:text-orange-400 font-bold'
                : 'border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
            title="Configurar matriz de datos o subir archivo CSV"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-orange-500" />
            <span>
              {dataset && dataset.rows && dataset.rows.length > 0
                ? `CSV (${dataset.rows.length} Filas)`
                : 'Matriz CSV'}
            </span>
          </button>

          <button
            onClick={resetRunState}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Reiniciar ejecución"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <button
            disabled={isExecutingAll || !!runningStepId || steps.length === 0}
            onClick={handleExecuteNextStep}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition-all disabled:opacity-50"
          >
            <StepForward className="w-3.5 h-3.5 text-orange-500" />
            <span>Paso a Paso</span>
          </button>

          <button
            disabled={isExecutingAll || !!runningStepId || steps.length === 0}
            onClick={handleExecuteAll}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-black shadow-sm transition-all disabled:opacity-50"
          >
            <Play className={`w-3.5 h-3.5 fill-current ${isExecutingAll ? 'animate-spin' : ''}`} />
            <span>{isExecutingAll ? 'Ejecutando...' : 'Ejecutar Todo'}</span>
          </button>
        </div>
      </div>

      {/* Execution Context Mini-bar */}
      {(executionContext.cartId || executionContext.token || executionContext.orderNumber) && (
        <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex flex-wrap items-center gap-4">
            {executionContext.cartId && (
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">cartId:</span>
                <span className="font-semibold text-slate-800 dark:text-orange-300 bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded">
                  {executionContext.cartId}
                </span>
              </div>
            )}
            {executionContext.token && (
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">token:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                  Bearer Auth
                </span>
              </div>
            )}
            {executionContext.orderNumber && (
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">order:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  #{executionContext.orderNumber}
                </span>
              </div>
            )}
          </div>

          <button
            onClick={resetRunState}
            className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline font-sans"
          >
            Limpiar contexto
          </button>
        </div>
      )}

      {/* Results Header Banner */}
      {(executionResult || Object.keys(stepResults).length > 0) && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors">
          <div className="flex items-center gap-3">
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-bold font-mono ${
                executionResult?.status === 'FAILED'
                  ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
              }`}
            >
              {executionResult?.status || 'RUNNING'}
            </span>
            <div className="text-xs font-mono">
              <span className="text-slate-400">Total:</span>{' '}
              <strong className="text-orange-600 dark:text-orange-400">{totalTimeCalculated} ms</strong>
            </div>
            {executionContext.orderNumber && (
              <div className="flex items-center gap-1 text-xs font-mono">
                <span className="text-slate-400">Orden:</span>
                <strong className="text-emerald-600 dark:text-emerald-400">#{executionContext.orderNumber}</strong>
                <button
                  onClick={() => handleCopyOrder(executionContext.orderNumber!)}
                  className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {copiedOrder ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 h-2 w-40 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            {Object.values(stepResults)
              .filter(s => s && !s.skipped && s.durationMs > 0)
              .map((step, idx) => {
                const pct = Math.max(8, Math.round((step.durationMs / (totalTimeCalculated || 1)) * 100));
                const colors = ['bg-orange-500', 'bg-amber-500', 'bg-emerald-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-rose-500'];
                return (
                  <div
                    key={idx}
                    title={`${step.category}: ${step.durationMs}ms`}
                    style={{ width: `${pct}%` }}
                    className={`h-full ${colors[idx % colors.length]}`}
                  />
                );
              })}
          </div>
        </div>
      )}

      {/* Banner for locked flow */}
      {activeFlow?.isLocked && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 text-xs shadow-xs">
          <div className="flex items-center gap-2.5 text-amber-800 dark:text-amber-200">
            <Lock className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span>
              Flujo marcado como bloqueado por <strong>{activeFlow.lockedByName || activeFlow.lockedBy || 'un compañero'}</strong>. Puedes editarlo libremente o desbloquearlo si lo requieres.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={async () => {
                try {
                  const unlocked = await api.unlockFlow(activeFlow.id);
                  setSavedFlows(prev => prev.map(f => (f.id === unlocked.id ? unlocked : f)));
                  toast('Flujo desbloqueado exitosamente', 'success');
                } catch (err: any) {
                  toast(err.message || 'Error al desbloquear', 'error');
                }
              }}
              className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold transition-colors"
            >
              Desbloquear Flujo
            </button>
          </div>
        </div>
      )}

      {/* Dynamic Steps List */}
      <div className="space-y-2.5">
        {steps.length === 0 ? (
          <div className="py-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 p-6">
            <p className="text-xs text-slate-500 mb-3">No hay pasos agregados al flujo.</p>
            <button
              onClick={() => handleAddStep()}
              className="px-3.5 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold"
            >
              + Agregar Primer Paso
            </button>
          </div>
        ) : (
          steps.map((step, idx) => {
            const isSkipped = step.skipped;
            const stepResult = stepResults[step.id];
            const isCurrentRunning = runningStepId === step.id;

            // Variantes filtradas estrictamente por la categoría de este paso
            const availableVariants = variants.filter(v => v.category === step.category);
            const variantOptions = availableVariants.map(v => ({
              value: v.id,
              label: `${v.apiType === 'REST' ? '🌐 [REST] ' : ''}${v.name}`,
              sublabel: v.apiType === 'REST' ? `${v.method || 'POST'} ${v.endpoint || ''}` : v.description
            }));
            const selectedVar = variants.find(v => v.id === step.variantId);

            return (
              <div
                key={step.id}
                draggable={dragEnabledIndex === idx && !isExecutingAll && !runningStepId}
                onDragStart={e => handleDragStart(e, idx)}
                onDragOver={e => handleDragOver(e, idx)}
                onDrop={e => {
                  setDragEnabledIndex(null);
                  handleDrop(e, idx);
                }}
                onDragEnd={() => {
                  setDragEnabledIndex(null);
                  handleDragEnd();
                }}
                className={`border rounded-xl transition-all shadow-xs ${
                  draggedIndex === idx
                    ? 'opacity-40 border-dashed border-orange-500 scale-[0.99]'
                    : dragOverIndex === idx && draggedIndex !== idx
                    ? 'border-orange-500 ring-2 ring-orange-500/20'
                    : ''
                } ${
                  isSkipped
                    ? 'bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-800/50 opacity-50'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="p-3 flex flex-col md:flex-row md:items-center justify-between gap-2.5">
                  {/* Step Index & Order Reorder */}
                  <div className="flex items-center gap-1.5 min-w-[75px]">
                    {/* Drag Handle - solo este elemento activa el drag & drop */}
                    <div
                      onMouseDown={() => setDragEnabledIndex(idx)}
                      onMouseUp={() => setDragEnabledIndex(null)}
                      className="cursor-grab active:cursor-grabbing p-1 text-slate-400 hover:text-orange-500 transition-colors select-none"
                      title="Arrastrar para reordenar paso"
                    >
                      <GripVertical className="w-4 h-4" />
                    </div>

                    <div className="flex flex-col">
                      <button
                        disabled={idx === 0}
                        onClick={() => handleMoveStep(idx, 'up')}
                        className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-20"
                        title="Subir paso"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        disabled={idx === steps.length - 1}
                        onClick={() => handleMoveStep(idx, 'down')}
                        className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-20"
                        title="Bajar paso"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>

                    <span className="text-xs font-mono font-bold text-slate-400 w-5 text-center">
                      #{idx + 1}
                    </span>
                  </div>

                  {/* 1. Categoría Selector con Buscador */}
                  <div className="w-full sm:w-44 md:w-48">
                    <SearchableSelect
                      disabled={isSkipped}
                      options={categoryOptions}
                      value={step.category}
                      onChange={newCat => handleCategoryChange(step.id, newCat)}
                      placeholder="Categoría"
                    />
                  </div>

                  {/* 2. Variante Selector con Buscador (FILTRADA POR CATEGORÍA) y Botón de Edición Directa */}
                  <div className="flex-1 w-full flex items-center gap-1.5">
                    <div className="flex-1">
                      <SearchableSelect
                        disabled={isSkipped}
                        options={variantOptions}
                        value={step.variantId}
                        onChange={newVarId => handleVariantChange(step.id, newVarId)}
                        placeholder={
                          availableVariants.length === 0
                            ? 'Sin variantes en categoría'
                            : 'Seleccionar Variante'
                        }
                      />
                    </div>

                    {selectedVar?.apiType === 'REST' && (
                      <span className="text-[10px] font-mono px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 font-bold shrink-0">
                        {selectedVar.method || 'POST'}
                      </span>
                    )}

                    {step.variantId && !isSkipped && (
                      <button
                        type="button"
                        onClick={() => handleEditVariantFromStep(step.variantId!)}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 hover:text-orange-600 dark:hover:text-orange-400 hover:border-orange-300 dark:hover:border-orange-800 hover:bg-orange-50/50 dark:hover:bg-orange-950/20 transition-all shrink-0 shadow-2xs"
                        title="Editar variante directamente"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Action Buttons: Skip, Variables, Run Step, Delete */}
                  <div className="flex items-center justify-end gap-1.5 min-w-[160px]">
                    {stepResult && (
                      <div className="flex items-center gap-1 font-mono text-xs">
                        <span className="font-bold px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {stepResult.skipped ? 'SKIP' : `${stepResult.durationMs}ms`}
                        </span>
                        <button
                          onClick={() => setSelectedStepDetail(stepResult)}
                          className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                          title="Inspeccionar payload"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => handleToggleSkip(step.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                        isSkipped
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700'
                          : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                      }`}
                    >
                      {isSkipped ? 'Skip' : 'Activo'}
                    </button>

                    {!isSkipped && (
                      <button
                        type="button"
                        onClick={() => handleToggleExpandVars(step.id)}
                        className={`p-1.5 rounded-lg border text-xs transition-colors ${
                          expandedVars[step.id]
                            ? 'border-orange-500 text-orange-500 bg-orange-50 dark:bg-orange-950/20'
                            : 'border-slate-200 dark:border-slate-800 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                        title="Sobrescribir variables"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {!isSkipped && (
                      <button
                        disabled={isCurrentRunning || isExecutingAll}
                        onClick={() => handleExecuteSingleStep(step)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-orange-600 hover:text-white dark:hover:bg-orange-600 text-slate-700 dark:text-slate-300 text-xs font-bold border border-slate-200 dark:border-slate-700 transition-all disabled:opacity-50"
                        title="Ejecutar solo este paso"
                      >
                        {isCurrentRunning ? (
                          <RefreshCw className="w-3 h-3 animate-spin text-orange-500" />
                        ) : (
                          <Play className="w-3 h-3 fill-current text-orange-500" />
                        )}
                        <span>Paso</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleRemoveStep(step.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors"
                      title="Eliminar este paso"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Drawer de Variables */}
                {!isSkipped && expandedVars[step.id] && (
                  <div className="px-3 pb-3 pt-2 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-950/60 rounded-b-xl space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-orange-500" />
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          Variables del Paso
                        </span>
                        <span className="text-[11px] text-slate-400">
                          (Asociadas a este paso en el flujo)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleResetStepVariablesToDefault(step.id)}
                        className="text-[11px] font-semibold text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 hover:underline flex items-center gap-1 transition-colors"
                        title="Restablecer al JSON original de la variante"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Restablecer defecto de variante</span>
                      </button>
                    </div>

                    <CodeEditor
                      language="json"
                      compactHeight="110px"
                      expandedHeight="300px"
                      defaultExpanded={false}
                      value={
                        rawJsonOverrides[step.id] ??
                        JSON.stringify(
                          step.overrideVariables && Object.keys(step.overrideVariables).length > 0
                            ? step.overrideVariables
                            : selectedVar?.variables || selectedVar?.defaultVariables || {},
                          null,
                          2
                        )
                      }
                      onChange={val => handleOverrideJsonChange(step.id, val)}
                      placeholder='{"sku": "24-MB01", "quantity": 1}'
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <StepDetailModal step={selectedStepDetail} onClose={() => setSelectedStepDetail(null)} />
      <SaveFlowModal
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        onSaveNew={handleSaveNewFlow}
        onOverwrite={handleOverwriteFlow}
        activeFlow={activeFlow}
      />
      <FlowExecutionModal
        isOpen={isExecutionModalOpen}
        onClose={() => setIsExecutionModalOpen(false)}
        flowName={activeFlow?.name || 'Pipeline de Checkout'}
        steps={steps}
        variants={variants}
        dataset={dataset}
        initialContext={executionContext}
        onExecutionComplete={(result, resultMap, finalContext) => {
          setExecutionResult(result);
          setStepResults(resultMap);
          setExecutionContext(finalContext);
          if (result.status === 'SUCCESS') {
            toast(`¡Flujo completado en ${result.totalTimeMs}ms! 🎉`, 'success');
          } else {
            toast(`Flujo detenido en ${result.failedAtCategory || 'paso'}`, 'error');
          }
        }}
        onInspectStep={(stepResult) => setSelectedStepDetail(stepResult)}
      />

      {activeFlow && (
        <VersionHistoryModal
          isOpen={isVersionModalOpen}
          onClose={() => setIsVersionModalOpen(false)}
          entityType="FLOW"
          entityId={activeFlow.id}
          entityTitle={activeFlow.name}
          onRollbackSuccess={(restoredFlow: SavedFlow) => {
            setSavedFlows(prev => prev.map(f => (f.id === restoredFlow.id ? restoredFlow : f)));
            setSteps(restoredFlow.steps || []);
            setDataset(restoredFlow.dataset);
            setSavedSnapshot(serializeFlowState(restoredFlow.steps || [], restoredFlow.dataset));
          }}
        />
      )}

      <CsvDatasetModal
        isOpen={isDatasetModalOpen}
        onClose={() => setIsDatasetModalOpen(false)}
        dataset={dataset}
        onApplyDataset={newDataset => {
          setDataset(newDataset);
          if (newDataset && newDataset.rows.length > 0) {
            toast(`Dataset "${newDataset.name}" aplicado (${newDataset.rows.length} filas)`, 'success');
          } else {
            toast('Dataset removido del flujo', 'info');
          }
        }}
      />
    </div>
  );
};
