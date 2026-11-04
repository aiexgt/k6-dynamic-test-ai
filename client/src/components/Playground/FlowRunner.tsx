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
  Save,
  Edit2,
  GripVertical,
  Lock,
  History,
  FileSpreadsheet,
  Square,
  Globe,
  Braces
} from 'lucide-react';
import {
  Variant,
  SavedFlow,
  FlowStepConfig,
  FlowExecutionResponse,
  StepExecutionResult,
  ExecutionContext,
  CsvDataset,
  Environment
} from '../../types';
import { api } from '../../api';
import { parseUrlToPathAndParams, buildUrlFromPathAndParams } from '../../utils/urlParams';
import { areObjectsEqual } from '../../utils/objectUtils';
import { SearchableSelect } from '../common/SearchableSelect';
import { StepDetailModal } from './StepDetailModal';
import { SaveFlowModal } from './SaveFlowModal';
import { FlowExecutionModal } from './FlowExecutionModal';
import { CsvDatasetModal } from './CsvDatasetModal';
import { VersionHistoryModal } from '../common/VersionHistoryModal';
import { CodeEditor } from '../common/CodeEditor';
import { VariantEditorView } from '../Variants/VariantEditorView';
import { EnvironmentSecurityModal } from '../common/EnvironmentSecurityModal';
import { useFeedback } from '../../context/FeedbackContext';

interface FlowRunnerProps {
  initialFlow?: SavedFlow | null;
  onFlowChange?: (flowId: string) => void;
  environments?: Environment[];
  activeEnvironmentId?: string;
}

export const FlowRunner: React.FC<FlowRunnerProps> = ({
  initialFlow,
  onFlowChange,
  environments: propEnvironments,
  activeEnvironmentId: propActiveEnvId
}) => {
  const { toast } = useFeedback();
  const [internalEnvs, setInternalEnvs] = useState<Environment[]>([]);
  const [internalActiveEnvId, setInternalActiveEnvId] = useState<string>('');

  useEffect(() => {
    if (!propEnvironments || propEnvironments.length === 0) {
      api.getEnvironments().then(setInternalEnvs).catch(console.error);
    }
  }, [propEnvironments]);

  useEffect(() => {
    if (!propActiveEnvId) {
      api.getSettings().then(s => setInternalActiveEnvId(s.activeEnvironmentId || '')).catch(console.error);
    }
  }, [propActiveEnvId]);

  const environments = propEnvironments && propEnvironments.length > 0 ? propEnvironments : internalEnvs;
  const activeEnvId = propActiveEnvId || internalActiveEnvId;

  const [securityModalState, setSecurityModalState] = useState<{
    isOpen: boolean;
    mode: 'FLOW' | 'STEP';
    environment: Environment;
    flowName?: string;
    stepName?: string;
    onConfirm: () => void;
  } | null>(null);

  const [variants, setVariants] = useState<Variant[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [savedFlows, setSavedFlows] = useState<SavedFlow[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState<string>('');
  const [steps, setSteps] = useState<FlowStepConfig[]>([]);
  const [dataset, setDataset] = useState<CsvDataset | undefined>(undefined);
  const [savedSnapshot, setSavedSnapshot] = useState<string>('');
  const [expandedVars, setExpandedVars] = useState<Record<string, boolean>>({});
  const [rawJsonOverrides, setRawJsonOverrides] = useState<Record<string, string>>({});
  const [stepRestSubTabs, setStepRestSubTabs] = useState<Record<string, 'params' | 'body'>>({});
  const [stepParamsJson, setStepParamsJson] = useState<Record<string, string>>({});
  const [stepBodyOverrides, setStepBodyOverrides] = useState<Record<string, string>>({});

  // Execution states
  const [runningStepId, setRunningStepId] = useState<string | null>(null);
  const stepAbortControllerRef = React.useRef<AbortController | null>(null);
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

  // Limpieza estricta de pasos antes de guardar o serializar:
  // Si las variables, endpoint o body NO fueron modificados respecto a la variante,
  // NO se guardan en el paso del flujo para que continúen heredando dinámicamente de la variante.
  const cleanStepsForSaving = (stepsList: FlowStepConfig[]): FlowStepConfig[] => {
    return stepsList.map(s => {
      const v = variants.find(variant => variant.id === s.variantId);
      const vVars = v?.variables || v?.defaultVariables || {};

      const isCustomizedVars =
        s.overrideVariables !== undefined &&
        Object.keys(s.overrideVariables).length > 0 &&
        !areObjectsEqual(s.overrideVariables, vVars);

      const isCustomizedEndpoint =
        s.endpoint !== undefined &&
        s.endpoint.trim() !== '' &&
        s.endpoint.trim() !== (v?.endpoint || '').trim();

      const isCustomizedBody =
        s.body !== undefined &&
        s.body.trim() !== '' &&
        s.body.trim() !== (v?.body || '').trim();

      const cleaned: FlowStepConfig = {
        id: s.id,
        category: s.category,
        variantId: s.variantId,
        skipped: !!s.skipped
      };

      if (isCustomizedVars) {
        cleaned.overrideVariables = s.overrideVariables;
      }
      if (isCustomizedEndpoint) {
        cleaned.endpoint = s.endpoint;
      }
      if (isCustomizedBody) {
        cleaned.body = s.body;
      }
      if (s.method && s.method !== v?.method) {
        cleaned.method = s.method;
      }
      if (s.apiType && s.apiType !== v?.apiType) {
        cleaned.apiType = s.apiType;
      }

      return cleaned;
    });
  };

  // Unsaved changes calculation con sanitización dinámica
  const serializeFlowState = (stepsList: FlowStepConfig[], currentDataset?: CsvDataset) => {
    const cleaned = cleanStepsForSaving(stepsList);
    return JSON.stringify({
      steps: cleaned,
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
          const lastId = typeof window !== 'undefined' ? localStorage.getItem('flowrunner_last_flow_id') : null;
          const foundLast = lastId ? fList.find(f => f.id === lastId) : null;
          const flowToLoad = foundLast || fList[0];
          applySavedFlow(flowToLoad, vList);
          setSelectedFlowId(flowToLoad.id);
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
        return {
          id: 'step-' + idx + '-' + Date.now().toString(36),
          category: cat,
          variantId: selVariant ? selVariant.id : null,
          skipped: false
          // overrideVariables, endpoint y body quedan undefined para heredar de la variante
        };
      }
    );

    setSteps(initial);
    setDataset(undefined);
    setRawJsonOverrides({});
    setStepParamsJson({});
    setStepBodyOverrides({});
    setSavedSnapshot(serializeFlowState(initial, undefined));
    resetRunState();
  };

  const applySavedFlow = (flow: SavedFlow, currentVariants: Variant[] = variants) => {
    const paramsMap: Record<string, string> = {};
    const bodyMap: Record<string, string> = {};
    const overridesMap: Record<string, string> = {};

    const normalized: FlowStepConfig[] = (flow.steps || []).map((s, idx) => {
      const v = currentVariants.find(varItem => varItem.id === s.variantId);
      const vVars = v?.variables || v?.defaultVariables || {};

      // Si s.overrideVariables es idéntico a las variables de la variante, NO está personalizado:
      // debe quedar undefined para que cualquier cambio futuro en la variante del catálogo se refleje aquí.
      const isCustomizedVars =
        s.overrideVariables !== undefined &&
        Object.keys(s.overrideVariables).length > 0 &&
        !areObjectsEqual(s.overrideVariables, vVars);

      const isCustomizedEndpoint =
        s.endpoint !== undefined &&
        s.endpoint.trim() !== '' &&
        s.endpoint.trim() !== (v?.endpoint || '').trim();

      const isCustomizedBody =
        s.body !== undefined &&
        s.body.trim() !== '' &&
        s.body.trim() !== (v?.body || '').trim();

      const stepId = s.id || 'step-' + idx + '-' + Date.now().toString(36);
      const effectiveEndpoint = isCustomizedEndpoint ? s.endpoint : v?.endpoint;
      const effectiveBody = isCustomizedBody ? s.body : v?.body;

      if (effectiveEndpoint) {
        paramsMap[stepId] = parseUrlToPathAndParams(effectiveEndpoint).paramsJson;
      }
      if (effectiveBody !== undefined) {
        bodyMap[stepId] = effectiveBody;
      }
      if (isCustomizedVars) {
        overridesMap[stepId] = JSON.stringify(s.overrideVariables, null, 2);
      }

      return {
        id: stepId,
        category: s.category || 'General',
        variantId: s.variantId || null,
        skipped: s.skipped || false,
        overrideVariables: isCustomizedVars ? s.overrideVariables : undefined,
        endpoint: isCustomizedEndpoint ? s.endpoint : undefined,
        body: isCustomizedBody ? s.body : undefined,
        method: s.method || v?.method,
        apiType: s.apiType || v?.apiType
      };
    });

    setSteps(normalized);
    setDataset(flow.dataset);
    setStepParamsJson(paramsMap);
    setStepBodyOverrides(bodyMap);
    setRawJsonOverrides(overridesMap);
    setSavedSnapshot(serializeFlowState(normalized, flow.dataset));
    if (typeof window !== 'undefined' && flow.id) {
      localStorage.setItem('flowrunner_last_flow_id', flow.id);
    }
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
    if (typeof window !== 'undefined') {
      localStorage.removeItem('flowrunner_last_flow_id');
    }
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
    if (!flowId) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('flowrunner_last_flow_id');
      }
      return;
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('flowrunner_last_flow_id', flowId);
    }
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
    const newStep: FlowStepConfig = {
      id: 'step-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 5),
      category: chosenCat,
      variantId: selVariant ? selVariant.id : null,
      skipped: false
      // Sin overrideVariables, endpoint ni body: hereda dinámicamente de la variante
    };
    setSteps(prev => [...prev, newStep]);
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
    setSteps(prev =>
      prev.map(s => {
        if (s.id === stepId) {
          return {
            ...s,
            category: newCategory,
            variantId: selVariant ? selVariant.id : null,
            overrideVariables: undefined,
            endpoint: undefined,
            body: undefined
          };
        }
        return s;
      })
    );
    setRawJsonOverrides(r => {
      const next = { ...r };
      delete next[stepId];
      return next;
    });
    setStepParamsJson(p => {
      const next = { ...p };
      delete next[stepId];
      return next;
    });
    setStepBodyOverrides(b => {
      const next = { ...b };
      delete next[stepId];
      return next;
    });
  };

  // Variant Change -> Reset step overrides to inherit fresh from the new variant
  const handleVariantChange = (stepId: string, variantId: string) => {
    const newVariant = variants.find(v => v.id === variantId);

    setSteps(prev =>
      prev.map(s =>
        s.id === stepId
          ? {
              ...s,
              variantId,
              overrideVariables: undefined,
              endpoint: undefined,
              body: undefined,
              method: newVariant?.method,
              apiType: newVariant?.apiType
            }
          : s
      )
    );

    setRawJsonOverrides(r => {
      const next = { ...r };
      delete next[stepId];
      return next;
    });
    setStepParamsJson(p => {
      const next = { ...p };
      delete next[stepId];
      return next;
    });
    setStepBodyOverrides(b => {
      const next = { ...b };
      delete next[stepId];
      return next;
    });
  };

  // Step Endpoint Change (with bidirectional sync to query params JSON)
  const handleStepEndpointChange = (stepId: string, newUrl: string) => {
    const step = steps.find(s => s.id === stepId);
    const selectedVar = variants.find(v => v.id === step?.variantId);
    const isCustomized = (selectedVar?.endpoint || '').trim() !== newUrl.trim();

    setSteps(prev =>
      prev.map(s => (s.id === stepId ? { ...s, endpoint: isCustomized ? newUrl : undefined } : s))
    );
    const parsed = parseUrlToPathAndParams(newUrl);
    setStepParamsJson(prev => ({ ...prev, [stepId]: parsed.paramsJson }));
  };

  // Step Params JSON Change (with bidirectional sync to Endpoint URL)
  const handleStepParamsJsonChange = (stepId: string, newParamsJson: string) => {
    setStepParamsJson(prev => ({ ...prev, [stepId]: newParamsJson }));
    const step = steps.find(s => s.id === stepId);
    const selectedVar = variants.find(v => v.id === step?.variantId);
    const currentEndpoint =
      step?.endpoint !== undefined ? step.endpoint : selectedVar?.endpoint || '';
    const updatedUrl = buildUrlFromPathAndParams(currentEndpoint, newParamsJson);
    const isCustomized = (selectedVar?.endpoint || '').trim() !== updatedUrl.trim();

    setSteps(prev =>
      prev.map(s => (s.id === stepId ? { ...s, endpoint: isCustomized ? updatedUrl : undefined } : s))
    );
  };

  // Step Body Override Change
  const handleStepBodyChange = (stepId: string, newBody: string) => {
    const step = steps.find(s => s.id === stepId);
    const selectedVar = variants.find(v => v.id === step?.variantId);
    const isCustomized = (selectedVar?.body || '').trim() !== newBody.trim();

    setStepBodyOverrides(prev => ({ ...prev, [stepId]: newBody }));
    setSteps(prev =>
      prev.map(s => (s.id === stepId ? { ...s, body: isCustomized ? newBody : undefined } : s))
    );
  };

  // Reset Step REST config (endpoint and body) to variant defaults
  const handleResetStepRestToDefault = (stepId: string) => {
    const step = steps.find(s => s.id === stepId);
    const selectedVar = variants.find(v => v.id === step?.variantId);
    if (!selectedVar) return;
    setSteps(prev =>
      prev.map(s => (s.id === stepId ? { ...s, endpoint: undefined, body: undefined } : s))
    );
    setStepParamsJson(p => {
      const next = { ...p };
      delete next[stepId];
      return next;
    });
    setStepBodyOverrides(b => {
      const next = { ...b };
      delete next[stepId];
      return next;
    });
    toast(`Endpoint y body restablecidos. Ahora este paso hereda de "${selectedVar.name}"`, 'info');
  };

  // Skip Toggle
  const handleToggleSkip = (stepId: string) => {
    setSteps(prev => prev.map(s => (s.id === stepId ? { ...s, skipped: !s.skipped } : s)));
  };

  // Override variables toggle
  const handleToggleExpandVars = (stepId: string) => {
    setExpandedVars(prev => ({ ...prev, [stepId]: !prev[stepId] }));
  };

  // Reset step variables to the variant's original default (restores dynamic inheritance)
  const handleResetStepVariablesToDefault = (stepId: string) => {
    const step = steps.find(s => s.id === stepId);
    const variant = variants.find(v => v.id === step?.variantId);
    if (!variant) return;
    setRawJsonOverrides(r => {
      const next = { ...r };
      delete next[stepId];
      return next;
    });
    setSteps(curr =>
      curr.map(s => (s.id === stepId ? { ...s, overrideVariables: undefined } : s))
    );
    toast(`Variables restablecidas. Ahora este paso hereda dinámicamente de "${variant.name}"`, 'info');
  };

  const handleOverrideJsonChange = (stepId: string, text: string) => {
    setRawJsonOverrides(prev => ({ ...prev, [stepId]: text }));
    try {
      const parsed = JSON.parse(text || '{}');
      const step = steps.find(s => s.id === stepId);
      const variant = variants.find(v => v.id === step?.variantId);
      const vVars = variant?.variables || variant?.defaultVariables || {};
      const isCustomized = !areObjectsEqual(parsed, vVars);

      setSteps(prev =>
        prev.map(s =>
          s.id === stepId
            ? { ...s, overrideVariables: isCustomized ? parsed : undefined }
            : s
        )
      );
    } catch {
      // Mientras el usuario edita JSON incompleto, mantener flag de personalización
      setSteps(prev =>
        prev.map(s =>
          s.id === stepId
            ? { ...s, overrideVariables: s.overrideVariables || {} }
            : s
        )
      );
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
      const cleanedSteps = cleanStepsForSaving(steps);
      const updated = await api.updateFlow(flowId, {
        name: name || existing?.name || 'Flujo de Checkout',
        description: description !== undefined ? description : existing?.description,
        steps: cleanedSteps,
        dataset
      });
      setSavedFlows(prev => prev.map(f => (f.id === updated.id ? updated : f)));
      setSelectedFlowId(updated.id);
      if (typeof window !== 'undefined' && updated.id) {
        localStorage.setItem('flowrunner_last_flow_id', updated.id);
      }
      setSavedSnapshot(serializeFlowState(cleanedSteps, dataset));
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
      const cleanedSteps = cleanStepsForSaving(steps);
      const created = await api.createFlow({ name, description, steps: cleanedSteps, dataset });
      setSavedFlows(prev => [...prev, created]);
      setSelectedFlowId(created.id);
      if (typeof window !== 'undefined' && created.id) {
        localStorage.setItem('flowrunner_last_flow_id', created.id);
      }
      setSavedSnapshot(serializeFlowState(cleanedSteps, dataset));
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

  const updateUrlVariant = (variantId: string | null) => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (variantId) {
      url.searchParams.set('variant', variantId);
    } else {
      url.searchParams.delete('variant');
    }
    if (window.location.pathname + window.location.search !== url.pathname + url.search) {
      window.history.pushState(null, '', url.pathname + url.search);
    }
  };

  // Direct Variant Editing from step
  const handleEditVariantFromStep = (variantId: string, updateUrl = true) => {
    const found = variants.find(v => v.id === variantId);
    if (found) {
      setEditingVariant(found);
      if (updateUrl) updateUrlVariant(variantId);
    } else {
      toast('No se encontró la variante seleccionada', 'error');
    }
  };

  const handleCloseVariantEditor = () => {
    setEditingVariant(null);
    updateUrlVariant(null);
  };

  // Sync variant query param on mount/popstate
  useEffect(() => {
    const handlePopState = () => {
      if (typeof window === 'undefined') return;
      const vId = new URLSearchParams(window.location.search).get('variant');
      if (vId) {
        const found = variants.find(v => v.id === vId);
        if (found) setEditingVariant(found);
      } else if (editingVariant) {
        setEditingVariant(null);
      }
    };
    handlePopState();
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [variants, editingVariant?.id]);

  const handleSaveVariantFromEditor = async (variantData: Partial<Variant>) => {
    if (!editingVariant) return;
    try {
      const updated = await api.updateVariant(editingVariant.id, variantData);
      setVariants(prev => prev.map(v => (v.id === updated.id ? updated : v)));
      toast(`Variante "${updated.name}" actualizada con éxito`, 'success');
      handleCloseVariantEditor();
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

    const currentEnv = environments.find(e => e.id === activeEnvId) || environments[0];
    if (currentEnv?.isProtected) {
      setSecurityModalState({
        isOpen: true,
        mode: 'FLOW',
        environment: currentEnv,
        flowName: activeFlow?.name || 'Pipeline de Checkout',
        onConfirm: () => setIsExecutionModalOpen(true)
      });
      return;
    }

    setIsExecutionModalOpen(true);
  };

  // Abort running step execution
  const handleAbortRunningStep = () => {
    if (stepAbortControllerRef.current) {
      stepAbortControllerRef.current.abort();
      stepAbortControllerRef.current = null;
    }
    setRunningStepId(null);
    toast('Paso abortado por el usuario', 'info');
  };

  // Single Step Execution Worker
  const doExecuteSingleStep = async (step: FlowStepConfig) => {
    setRunningStepId(step.id);
    const controller = new AbortController();
    stepAbortControllerRef.current = controller;

    try {
      const response = await api.executeStep(
        step,
        executionContext,
        undefined,
        true,
        controller.signal
      );
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
      if (err.name === 'AbortError' || controller.signal.aborted) {
        toast('Paso abortado por el usuario', 'info');
      } else {
        toast(`Error en paso: ${err.message}`, 'error');
      }
    } finally {
      setRunningStepId(null);
      stepAbortControllerRef.current = null;
    }
  };

  // Single Step Execution Trigger with Protection Check
  const handleExecuteSingleStep = (step: FlowStepConfig) => {
    if (step.skipped || !step.variantId) return;

    const selectedVar = variants.find(v => v.id === step.variantId);
    const targetEnvId = step.environmentId || selectedVar?.environmentId || activeEnvId;
    const targetEnv = environments.find(e => e.id === targetEnvId) || environments[0];

    if (targetEnv?.isProtected) {
      setSecurityModalState({
        isOpen: true,
        mode: 'STEP',
        environment: targetEnv,
        stepName: selectedVar?.name || step.category,
        onConfirm: () => doExecuteSingleStep(step)
      });
      return;
    }

    doExecuteSingleStep(step);
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
    ...[...savedFlows]
      .sort((a, b) => {
        const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return dateB - dateA;
      })
      .map(f => ({ value: f.id, label: f.name, sublabel: f.description }))
  ];

  if (editingVariant) {
    return (
      <VariantEditorView
        initialVariant={editingVariant}
        categories={categories}
        defaultCategory={editingVariant.category || categories[0] || 'Crear Carrito'}
        onSave={handleSaveVariantFromEditor}
        onBack={handleCloseVariantEditor}
        onCreateCategory={handleCreateCategoryFromEditor}
      />
    );
  }

  return (
    <div className="max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      {/* Control Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3 transition-colors">
        {/* Row 1: Selector de Flujo a Ancho Completo */}
        {savedFlows.length > 0 && (
          <div className="w-full">
            <SearchableSelect
              options={flowOptions}
              value={selectedFlowId}
              onChange={handleSelectFlow}
              placeholder="Seleccionar o buscar un flujo guardado..."
              className="w-full"
            />
          </div>
        )}

        {/* Row 2: Action Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80">
          {/* Left Actions: Flow & Step Management */}
          <div className="flex flex-wrap items-center gap-2">
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

            {/* Botón de Cambios sin guardar: sólo visible cuando hay cambios sin guardar */}
            {hasUnsavedChanges && (
              <button
                onClick={handleSaveClick}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-all shadow-sm ring-2 ring-amber-400/30 animate-pulse"
                title="Hay cambios sin guardar. Haz clic para guardar el flujo."
              >
                <Save className="w-3.5 h-3.5" />
                <span>Cambios sin guardar</span>
              </button>
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
        <div className="flex flex-wrap items-center gap-2">
          {runningStepId && (
            <button
              onClick={handleAbortRunningStep}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-sm animate-pulse"
              title="Abortar paso en ejecución"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Abortar Paso</span>
            </button>
          )}

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
                        className={`relative p-1.5 rounded-lg border text-xs transition-colors ${
                          expandedVars[step.id]
                            ? 'border-orange-500 text-orange-500 bg-orange-50 dark:bg-orange-950/20'
                            : (step.overrideVariables !== undefined || step.endpoint !== undefined || step.body !== undefined)
                            ? 'border-amber-400 text-amber-600 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/20'
                            : 'border-slate-200 dark:border-slate-800 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                        title={
                          (step.overrideVariables !== undefined || step.endpoint !== undefined || step.body !== undefined)
                            ? 'Paso con variables o payload personalizados en este flujo'
                            : selectedVar?.apiType === 'REST'
                            ? 'Configurar Query Params y Body (hereda de variante)'
                            : 'Variables GraphQL (hereda de variante)'
                        }
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        {(step.overrideVariables !== undefined || step.endpoint !== undefined || step.body !== undefined) && (
                          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white dark:ring-slate-900" />
                        )}
                      </button>
                    )}

                    {!isSkipped && (
                      isCurrentRunning ? (
                        <button
                          onClick={handleAbortRunningStep}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs transition-all animate-pulse"
                          title="Abortar este paso inmediatamente"
                        >
                          <Square className="w-3 h-3 fill-current" />
                          <span>Abortar</span>
                        </button>
                      ) : (
                        <button
                          disabled={isCurrentRunning || isExecutingAll}
                          onClick={() => handleExecuteSingleStep(step)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-orange-600 hover:text-white dark:hover:bg-orange-600 text-slate-700 dark:text-slate-300 text-xs font-bold border border-slate-200 dark:border-slate-700 transition-all disabled:opacity-50"
                          title="Ejecutar solo este paso"
                        >
                          <Play className="w-3 h-3 fill-current text-orange-500" />
                          <span>Paso</span>
                        </button>
                      )
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

                {/* REST Endpoint Bar (visible en el card para ver y modificar directamente el link) */}
                {selectedVar?.apiType === 'REST' && !isSkipped && (
                  <div className="px-3 pb-3 pt-0">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-slate-50 dark:bg-slate-950/70 p-2 rounded-xl border border-slate-200 dark:border-slate-800/80">
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Globe className="w-3.5 h-3.5 text-blue-500" />
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded-md font-bold uppercase ${
                            (selectedVar.method || 'POST') === 'GET'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                              : (selectedVar.method || 'POST') === 'POST'
                              ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                              : (selectedVar.method || 'POST') === 'PUT'
                              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {selectedVar.method || 'POST'}
                        </span>
                      </div>

                      <div className="flex-1 flex items-center gap-1.5 min-w-0">
                        <input
                          type="text"
                          value={
                            step.endpoint !== undefined
                              ? step.endpoint
                              : selectedVar.endpoint || ''
                          }
                          onChange={e => handleStepEndpointChange(step.id, e.target.value)}
                          placeholder="/rest/default/V1/carts/mine/payment-information?param=val"
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          title="URL / Endpoint REST (los parámetros query se sincronizan automáticamente con el JSON)"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => handleToggleExpandVars(step.id)}
                        className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-semibold border flex items-center gap-1.5 transition-colors ${
                          expandedVars[step.id]
                            ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-800'
                            : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:text-blue-600 dark:hover:text-blue-400'
                        }`}
                        title="Ver y editar Params JSON o Body JSON"
                      >
                        <Sliders className="w-3 h-3 text-blue-500" />
                        <span>Params & Body</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Drawer de Variables y Parámetros */}
                {!isSkipped && expandedVars[step.id] && (
                  <div className="px-3 pb-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-950/60 rounded-b-xl space-y-2.5">
                    {selectedVar?.apiType === 'REST' ? (
                      /* Sección REST: Tabs para Query Params (JSON) y Body (JSON) */
                      <div className="space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 bg-slate-200/70 dark:bg-slate-800/80 p-0.5 rounded-lg text-xs">
                            <button
                              type="button"
                              onClick={() =>
                                setStepRestSubTabs(prev => ({ ...prev, [step.id]: 'params' }))
                              }
                              className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-bold text-xs transition-all ${
                                (stepRestSubTabs[step.id] || 'params') === 'params'
                                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                              }`}
                            >
                              <Sliders className="w-3 h-3" />
                              <span>Query Params (JSON)</span>
                              {(() => {
                                try {
                                  const currentP =
                                    stepParamsJson[step.id] ??
                                    parseUrlToPathAndParams(
                                      step.endpoint ?? selectedVar.endpoint ?? ''
                                    ).paramsJson;
                                  const count = Object.keys(JSON.parse(currentP || '{}')).length;
                                  return count > 0 ? (
                                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold">
                                      {count}
                                    </span>
                                  ) : null;
                                } catch {
                                  return null;
                                }
                              })()}
                            </button>

                            {selectedVar.method !== 'GET' && (
                              <button
                                type="button"
                                onClick={() =>
                                  setStepRestSubTabs(prev => ({ ...prev, [step.id]: 'body' }))
                                }
                                className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-bold text-xs transition-all ${
                                  stepRestSubTabs[step.id] === 'body'
                                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                                }`}
                              >
                                <Braces className="w-3 h-3" />
                                <span>Cuerpo / Body (JSON)</span>
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {step.endpoint !== undefined || step.body !== undefined ? (
                              <>
                                <span
                                  className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                                  title="Endpoint o Body personalizado solo para este flujo"
                                >
                                  ⚡ Customizado
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleResetStepRestToDefault(step.id)}
                                  className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline flex items-center gap-1 transition-colors"
                                  title="Restablecer endpoint y body para volver a heredar de la variante"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>Restablecer defecto de variante</span>
                                </button>
                              </>
                            ) : (
                              <span
                                className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                title="Heredando dinámicamente de la variante. Si la variante se modifica en el catálogo, este paso se actualizará automáticamente."
                              >
                                🔗 Dinámico (Hereda de variante)
                              </span>
                            )}
                          </div>
                        </div>

                        {(stepRestSubTabs[step.id] || 'params') === 'params' ? (
                          <div>
                            <p className="text-[11px] text-slate-400 mb-1.5">
                              {step.endpoint !== undefined
                                ? 'Parámetros personalizados para este paso. Se sincronizan en vivo con la URL.'
                                : 'Mostrando parámetros por defecto de la variante. Al editarlos se personalizarán para este flujo.'}
                            </p>
                            <CodeEditor
                              language="json"
                              compactHeight="110px"
                              expandedHeight="300px"
                              defaultExpanded={false}
                              value={
                                stepParamsJson[step.id] ??
                                parseUrlToPathAndParams(
                                  step.endpoint ?? selectedVar.endpoint ?? ''
                                ).paramsJson
                              }
                              onChange={val => handleStepParamsJsonChange(step.id, val)}
                              placeholder='{"searchCriteria[pageSize]": 10, "cartId": "{{cartId}}"}'
                            />
                          </div>
                        ) : (
                          <div>
                            <p className="text-[11px] text-slate-400 mb-1.5">
                              {step.body !== undefined
                                ? 'Payload personalizado para este paso. Puedes usar variables dinámicas como {{cartId}}.'
                                : 'Mostrando payload por defecto de la variante. Al editarlo se personalizará para este flujo.'}
                            </p>
                            <CodeEditor
                              language="json"
                              compactHeight="130px"
                              expandedHeight="320px"
                              defaultExpanded={false}
                              value={
                                stepBodyOverrides[step.id] ??
                                (step.body !== undefined
                                  ? step.body
                                  : selectedVar.body || '')
                              }
                              onChange={val => handleStepBodyChange(step.id, val)}
                              placeholder='{\n  "paymentMethod": {\n    "method": "checkmo"\n  }\n}'
                            />
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Sección GraphQL estándar */
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2">
                            <Sliders className="w-3.5 h-3.5 text-orange-500" />
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              Variables del Paso (GraphQL)
                            </span>
                            {step.overrideVariables !== undefined ? (
                              <span
                                className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                                title="Este paso tiene variables personalizadas específicas para este flujo"
                              >
                                ⚡ Personalizadas en este flujo
                              </span>
                            ) : (
                              <span
                                className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                title="Hereda dinámicamente de la variante. Si la variante se edita en el catálogo, este paso tomará los nuevos valores automáticamente."
                              >
                                🔗 Dinámico (Hereda de variante)
                              </span>
                            )}
                          </div>

                          {step.overrideVariables !== undefined && (
                            <button
                              type="button"
                              onClick={() => handleResetStepVariablesToDefault(step.id)}
                              className="text-[11px] font-semibold text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 hover:underline flex items-center gap-1 transition-colors"
                              title="Restablecer para volver a heredar dinámicamente de la variante del catálogo"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Restablecer defecto de variante</span>
                            </button>
                          )}
                        </div>

                        <p className="text-[11px] text-slate-400">
                          {step.overrideVariables !== undefined
                            ? 'Este paso guardará estas variables personalizadas exclusivamente para este flujo.'
                            : 'Mostrando variables actuales de la variante. Si la variante se edita en el catálogo, se actualizarán aquí automáticamente.'}
                        </p>

                        <CodeEditor
                          language="json"
                          compactHeight="110px"
                          expandedHeight="300px"
                          defaultExpanded={false}
                          value={
                            rawJsonOverrides[step.id] ??
                            JSON.stringify(
                              step.overrideVariables !== undefined
                                ? step.overrideVariables
                                : selectedVar?.variables ||
                                    selectedVar?.defaultVariables ||
                                    {},
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
                )}
              </div>
            );
          })
        )}
      </div>

      {securityModalState && (
        <EnvironmentSecurityModal
          isOpen={securityModalState.isOpen}
          mode={securityModalState.mode}
          environment={securityModalState.environment}
          flowName={securityModalState.flowName}
          stepName={securityModalState.stepName}
          onConfirm={securityModalState.onConfirm}
          onClose={() => setSecurityModalState(null)}
        />
      )}

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
