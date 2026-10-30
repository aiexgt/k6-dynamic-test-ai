import { Router, Request, Response } from 'express';
import { Database } from '../storage/db';
import { FlowExecutionService } from '../services/executor';
import { SchemaService } from '../services/schemaService';
import { Variant, SavedFlow, FlowStepConfig, EnvironmentSettings, Environment, GlobalTestConfig } from '../types';

export const apiRouter = Router();

// Helper to extract user identity from headers / request
function extractUser(req: Request) {
  const name = (req.headers['x-user-name'] as string) || (req.body?.authorName as string) || 'Desarrollador';
  const email = (req.headers['x-user-email'] as string) || (req.body?.authorEmail as string) || 'dev@local.test';
  return { name: name.trim(), email: email.trim().toLowerCase() };
}

// Helper to check if requester has Master Admin privileges
function isUserAdmin(req: Request): boolean {
  const adminKey = (req.headers['x-admin-key'] as string) || (req.body?.adminKey as string);
  const expectedKey = process.env.ADMIN_SECRET_KEY || 'admin_flowrunner_2026';
  return !!adminKey && adminKey === expectedKey;
}

// --- ADMIN AUTH VERIFICATION ---
apiRouter.post('/auth/verify-admin', (req: Request, res: Response) => {
  const { key } = req.body;
  const expectedKey = process.env.ADMIN_SECRET_KEY || 'admin_flowrunner_2026';
  if (!key || key !== expectedKey) {
    return res.status(401).json({ valid: false, error: 'Clave maestra de administrador incorrecta' });
  }
  return res.json({ valid: true, message: 'Autenticación de Administrador exitosa' });
});

// --- DATABASE ARCHITECTURE STATUS ---
apiRouter.get('/database/status', (_req: Request, res: Response) => {
  return res.json(Database.getDatabaseStatus());
});

// --- CATEGORIES ---
apiRouter.get('/categories', (_req: Request, res: Response) => {
  return res.json(Database.getCategories());
});

apiRouter.post('/categories', (req: Request, res: Response) => {
  const user = extractUser(req);
  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  const updated = Database.addCategory(name.trim(), user);
  return res.status(201).json({ success: true, name: name.trim(), categories: updated });
});

apiRouter.put('/categories/:name', (req: Request, res: Response) => {
  const user = extractUser(req);
  const oldName = decodeURIComponent(req.params.name);
  const { newName } = req.body;
  if (!newName || typeof newName !== 'string' || !newName.trim()) {
    return res.status(400).json({ error: 'newName is required' });
  }
  const ok = Database.renameCategory(oldName, newName.trim(), user);
  if (!ok) {
    return res.status(404).json({ error: 'Category not found' });
  }
  return res.json({ success: true, oldName, newName: newName.trim() });
});

apiRouter.delete('/categories/:name', (req: Request, res: Response) => {
  const user = extractUser(req);
  const name = decodeURIComponent(req.params.name);
  Database.deleteCategory(name, user);
  return res.json({ success: true, deleted: name });
});

// --- VARIANTS CRUD ---
apiRouter.get('/variants', (req: Request, res: Response) => {
  const { category, stage } = req.query;
  let variants = Database.getVariants();
  if (category && typeof category === 'string') {
    variants = variants.filter(v => v.category === category);
  } else if (stage && typeof stage === 'string') {
    variants = variants.filter(v => v.stage === stage || v.category === stage);
  }
  return res.json(variants);
});

apiRouter.get('/variants/:id', (req: Request, res: Response) => {
  const variant = Database.getVariantById(req.params.id);
  if (!variant) {
    return res.status(404).json({ error: 'Variant not found' });
  }
  return res.json(variant);
});

apiRouter.post('/variants', (req: Request, res: Response) => {
  const user = extractUser(req);
  const {
    name,
    category,
    stage,
    query,
    defaultVariables,
    contextOutputs,
    contextMapping,
    customHeaders,
    environmentOverrides,
    customValidations,
    isVirtualOnly,
    description
  } = req.body;

  if (!name || (!category && !stage) || !query) {
    return res.status(400).json({ error: 'name, category and query are required' });
  }

  const assignedCategory = category || stage || 'General';
  const newVariant: Variant = {
    id: 'var-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6),
    name,
    category: assignedCategory,
    stage: stage || undefined,
    description: description || '',
    query,
    defaultVariables: defaultVariables || {},
    contextOutputs: Array.isArray(contextOutputs) ? contextOutputs : [],
    contextMapping: contextMapping || {},
    customHeaders: customHeaders || {},
    environmentOverrides: environmentOverrides || {},
    customValidations: Array.isArray(customValidations) ? customValidations : [],
    isVirtualOnly: !!isVirtualOnly,
    createdBy: user.email,
    createdByName: user.name,
    updatedBy: user.email,
    updatedByName: user.name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  Database.upsertVariant(newVariant, user);
  return res.status(201).json(newVariant);
});

apiRouter.put('/variants/:id', (req: Request, res: Response) => {
  const user = extractUser(req);
  const existing = Database.getVariantById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Variant not found' });
  }
  const updated: Variant = {
    ...existing,
    ...req.body,
    category: req.body.category || existing.category || existing.stage || 'General',
    customHeaders: req.body.customHeaders !== undefined ? req.body.customHeaders : existing.customHeaders,
    environmentOverrides: req.body.environmentOverrides !== undefined ? req.body.environmentOverrides : existing.environmentOverrides,
    customValidations: Array.isArray(req.body.customValidations) ? req.body.customValidations : existing.customValidations,
    id: existing.id,
    updatedBy: user.email,
    updatedByName: user.name,
    updatedAt: new Date().toISOString()
  };
  Database.upsertVariant(updated, user);
  return res.json(updated);
});

apiRouter.delete('/variants/:id', (req: Request, res: Response) => {
  const user = extractUser(req);
  const ok = Database.softDeleteVariant(req.params.id, user);
  if (!ok) {
    return res.status(404).json({ error: 'Variant not found' });
  }
  return res.json({ success: true, deletedId: req.params.id, softDeleted: true });
});

apiRouter.post('/variants/:id/clone', (req: Request, res: Response) => {
  const user = extractUser(req);
  const original = Database.getVariantById(req.params.id);
  if (!original) {
    return res.status(404).json({ error: 'Variant not found' });
  }
  const clone: Variant = {
    ...original,
    id: 'var-clone-' + Date.now().toString(36),
    name: `${original.name} (Copia)`,
    isDeleted: false,
    deletedAt: undefined,
    deletedBy: undefined,
    deletedByName: undefined,
    createdBy: user.email,
    createdByName: user.name,
    updatedBy: user.email,
    updatedByName: user.name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  Database.upsertVariant(clone, user);
  return res.status(201).json(clone);
});

// --- FLOWS CRUD, LOCKING & SOFT DELETE ---
apiRouter.get('/flows', (_req: Request, res: Response) => {
  return res.json(Database.getFlows());
});

apiRouter.get('/flows/:id', (req: Request, res: Response) => {
  const flow = Database.getFlowById(req.params.id);
  if (!flow) {
    return res.status(404).json({ error: 'Flow not found' });
  }
  return res.json(flow);
});

apiRouter.post('/flows', (req: Request, res: Response) => {
  const user = extractUser(req);
  const { name, description, steps } = req.body;
  if (!name || !steps || !Array.isArray(steps)) {
    return res.status(400).json({ error: 'name and steps array are required' });
  }
  const newFlow: SavedFlow = {
    id: 'flow-' + Date.now().toString(36),
    name,
    description: description || '',
    steps,
    dataset: req.body.dataset,
    isLocked: false,
    createdBy: user.email,
    createdByName: user.name,
    updatedBy: user.email,
    updatedByName: user.name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  Database.upsertFlow(newFlow, user);
  return res.status(201).json(newFlow);
});

apiRouter.put('/flows/:id', (req: Request, res: Response) => {
  const user = extractUser(req);
  const existing = Database.getFlowById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Flow not found' });
  }

  const updated: SavedFlow = {
    ...existing,
    ...req.body,
    id: existing.id,
    updatedBy: user.email,
    updatedByName: user.name,
    updatedAt: new Date().toISOString()
  };
  Database.upsertFlow(updated, user);
  return res.json(updated);
});

apiRouter.delete('/flows/:id', (req: Request, res: Response) => {
  const user = extractUser(req);
  const existing = Database.getFlowById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Flow not found' });
  }
  Database.softDeleteFlow(req.params.id, user);
  return res.json({ success: true, deletedId: req.params.id, softDeleted: true });
});

apiRouter.post('/flows/:id/lock', (req: Request, res: Response) => {
  const user = extractUser(req);
  const locked = Database.lockFlow(req.params.id, user);
  if (!locked) {
    return res.status(404).json({ error: 'Flow not found' });
  }
  return res.json({ success: true, flow: locked });
});

apiRouter.post('/flows/:id/unlock', (req: Request, res: Response) => {
  const user = extractUser(req);
  const existing = Database.getFlowById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Flow not found' });
  }

  const unlocked = Database.unlockFlow(req.params.id, user);
  return res.json({ success: true, flow: unlocked });
});

apiRouter.post('/flows/:id/clone', (req: Request, res: Response) => {
  const user = extractUser(req);
  const original = Database.getFlowById(req.params.id);
  if (!original) {
    return res.status(404).json({ error: 'Flow not found' });
  }
  const customName = typeof req.body?.name === 'string' && req.body.name.trim() ? req.body.name.trim() : `${original.name} (Copia)`;
  const clone: SavedFlow = {
    ...original,
    id: 'flow-clone-' + Date.now().toString(36),
    name: customName,
    isLocked: false,
    lockedBy: undefined,
    lockedByName: undefined,
    lockedAt: undefined,
    isDeleted: false,
    deletedAt: undefined,
    deletedBy: undefined,
    deletedByName: undefined,
    createdBy: user.email,
    createdByName: user.name,
    updatedBy: user.email,
    updatedByName: user.name,
    steps: (original.steps || []).map((step, idx) => ({
      ...step,
      id: `step-clone-${Date.now().toString(36)}-${idx}`
    })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  Database.upsertFlow(clone, user);
  return res.status(201).json(clone);
});

// --- TRASH BIN (SOFT DELETE RESTORATION & PURGE) ---
apiRouter.get('/trash', (_req: Request, res: Response) => {
  return res.json(Database.getTrash());
});

apiRouter.post('/trash/restore', (req: Request, res: Response) => {
  const { type, id } = req.body;
  if (!type || !id) {
    return res.status(400).json({ error: 'type and id are required' });
  }
  if (type === 'FLOW') {
    const item = Database.restoreFlow(id);
    if (!item) return res.status(404).json({ error: 'Flow not found in trash' });
    return res.json({ success: true, item });
  } else if (type === 'VARIANT') {
    const item = Database.restoreVariant(id);
    if (!item) return res.status(404).json({ error: 'Variant not found in trash' });
    return res.json({ success: true, item });
  }
  return res.status(400).json({ error: 'Invalid item type (must be FLOW or VARIANT)' });
});

apiRouter.delete('/trash/purge', (req: Request, res: Response) => {
  const { type, id } = req.body;
  if (!type || !id) {
    return res.status(400).json({ error: 'type and id are required' });
  }
  let ok = false;
  if (type === 'FLOW') {
    ok = Database.purgeFlow(id);
  } else if (type === 'VARIANT') {
    ok = Database.purgeVariant(id);
  } else {
    return res.status(400).json({ error: 'Invalid item type (must be FLOW or VARIANT)' });
  }
  return res.json({ success: ok, purgedId: id });
});

// --- VERSIONING & ROLLBACK (HISTORIAL DE VERSIONES) ---
apiRouter.get('/versions/:type/:id', async (req: Request, res: Response) => {
  const { type, id } = req.params;
  const entityType = type.toUpperCase() as 'FLOW' | 'VARIANT' | 'CATEGORIES';
  const versions = await Database.getEntityVersions(entityType, id);
  return res.json(versions);
});

apiRouter.post('/versions/:type/:id/rollback/:versionId', async (req: Request, res: Response) => {
  const { type, id, versionId } = req.params;
  const user = extractUser(req);
  const entityType = type.toUpperCase() as 'FLOW' | 'VARIANT' | 'CATEGORIES';
  try {
    const restored = await Database.rollbackEntityVersion(entityType, id, versionId, user);
    return res.json({ success: true, restored });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

apiRouter.get('/categories-versions', async (_req: Request, res: Response) => {
  const versions = await Database.getEntityVersions('CATEGORIES', 'all_categories');
  return res.json(versions);
});

apiRouter.post('/categories-versions/rollback/:versionId', async (req: Request, res: Response) => {
  const user = extractUser(req);
  try {
    const restored = await Database.rollbackEntityVersion('CATEGORIES', 'all_categories', req.params.versionId, user);
    return res.json({ success: true, categories: restored });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// --- ENVIRONMENTS CRUD ---
apiRouter.get('/environments', (_req: Request, res: Response) => {
  return res.json(Database.getEnvironments());
});

apiRouter.post('/environments', (req: Request, res: Response) => {
  const { name, magentoUrl, magentoRestUrl, storeCode, customHeaders, variables, useMockSimulator } = req.body;
  if (!name || !magentoUrl) {
    return res.status(400).json({ error: 'name and magentoUrl are required' });
  }
  const newEnv: Environment = {
    id: 'env-' + Date.now().toString(36),
    name,
    magentoUrl,
    magentoRestUrl: magentoRestUrl || '',
    storeCode: storeCode || '',
    customHeaders: customHeaders || { 'Content-Type': 'application/json' },
    variables: variables || {},
    useMockSimulator: !!useMockSimulator,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  Database.upsertEnvironment(newEnv);
  return res.status(201).json(newEnv);
});

apiRouter.put('/environments/:id', (req: Request, res: Response) => {
  const existing = Database.getEnvironmentById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Environment not found' });
  }
  const updated: Environment = {
    ...existing,
    ...req.body,
    id: existing.id,
    variables: req.body.variables !== undefined ? req.body.variables : existing.variables,
    updatedAt: new Date().toISOString()
  };
  Database.upsertEnvironment(updated);

  // If updated is active environment, update settings
  const currentSettings = Database.getSettings();
  if (currentSettings.activeEnvironmentId === existing.id) {
    Database.saveSettings({
      ...currentSettings,
      magentoUrl: updated.magentoUrl,
      magentoRestUrl: updated.magentoRestUrl || '',
      storeCode: updated.storeCode || '',
      customHeaders: updated.customHeaders,
      variables: updated.variables || {},
      useMockSimulator: updated.useMockSimulator
    });
  }

  return res.json(updated);
});

apiRouter.delete('/environments/:id', (req: Request, res: Response) => {
  const ok = Database.deleteEnvironment(req.params.id);
  if (!ok) {
    return res.status(404).json({ error: 'Environment not found' });
  }
  return res.json({ success: true, deletedId: req.params.id });
});

apiRouter.post('/environments/:id/clone', (req: Request, res: Response) => {
  const original = Database.getEnvironmentById(req.params.id);
  if (!original) {
    return res.status(404).json({ error: 'Environment not found' });
  }
  const customName = typeof req.body?.name === 'string' && req.body.name.trim() ? req.body.name.trim() : `${original.name} (Copia)`;
  const clone: Environment = {
    ...original,
    id: 'env-clone-' + Date.now().toString(36),
    name: customName,
    customHeaders: original.customHeaders ? { ...original.customHeaders } : { 'Content-Type': 'application/json' },
    variables: original.variables ? { ...original.variables } : {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  Database.upsertEnvironment(clone);
  return res.status(201).json(clone);
});

apiRouter.post('/environments/select', (req: Request, res: Response) => {
  const { environmentId } = req.body;
  const env = Database.getEnvironmentById(environmentId);
  if (!env) {
    return res.status(404).json({ error: 'Environment not found' });
  }
  const newSettings: EnvironmentSettings = {
    activeEnvironmentId: env.id,
    magentoUrl: env.magentoUrl,
    magentoRestUrl: env.magentoRestUrl || '',
    storeCode: env.storeCode || '',
    customHeaders: env.customHeaders,
    variables: env.variables || {},
    useMockSimulator: env.useMockSimulator
  };
  Database.saveSettings(newSettings);
  return res.json({
    ...newSettings,
    success: true,
    activeEnvironment: env,
    settings: newSettings
  });
});

// --- GLOBAL QUALITY GATES / TESTS CRUD (Requirement 4) ---
apiRouter.get('/global-tests', (_req: Request, res: Response) => {
  return res.json(Database.getGlobalTests());
});

apiRouter.post('/global-tests', (req: Request, res: Response) => {
  const tests = Array.isArray(req.body) ? req.body : req.body?.tests;
  if (!Array.isArray(tests)) {
    return res.status(400).json({ error: 'Array of global tests is required' });
  }
  Database.saveGlobalTests(tests as GlobalTestConfig[]);
  return res.json(Database.getGlobalTests());
});

// --- FLOW EXECUTION ENGINE ---
apiRouter.post('/flows/execute', async (req: Request, res: Response) => {
  try {
    const { steps, flowName, settings } = req.body;
    if (!steps || !Array.isArray(steps)) {
      return res.status(400).json({ error: 'steps array is required' });
    }

    const result = await FlowExecutionService.executeFlow(
      steps as FlowStepConfig[],
      flowName || 'Dynamic Flow',
      settings
    );

    return res.json(result);
  } catch (error: any) {
    console.error('Execution error:', error);
    return res.status(500).json({
      status: 'FAILED',
      errorMessage: error.message || 'Error inesperado durante la ejecución'
    });
  }
});

// --- SINGLE STEP EXECUTION (STEP BY STEP) ---
apiRouter.post('/flows/execute-step', async (req: Request, res: Response) => {
  try {
    const { step, context, settings, recordHistory = true } = req.body;
    if (!step) {
      return res.status(400).json({ error: 'step object is required' });
    }

    const result = await FlowExecutionService.executeSingleStep(
      step,
      context,
      settings,
      recordHistory !== false
    );
    return res.json(result);
  } catch (error: any) {
    console.error('Step execution error:', error);
    return res.status(500).json({
      status: 'FAILED',
      errorMessage: error.message || 'Error ejecutando paso'
    });
  }
});

// --- RECORD CONSOLIDATED FLOW HISTORY ---
apiRouter.post('/flows/record-history', (req: Request, res: Response) => {
  try {
    const {
      flowName,
      status,
      orderNumber,
      totalTimeMs,
      failedAtCategory,
      errorMessage,
      steps,
      settings
    } = req.body;

    const record = FlowExecutionService.recordCompletedFlow({
      flowName,
      status,
      orderNumber,
      totalTimeMs: totalTimeMs || 0,
      failedAtCategory,
      errorMessage,
      steps: steps || [],
      customSettings: settings
    });

    return res.status(201).json(record);
  } catch (error: any) {
    console.error('Error recording flow history:', error);
    return res.status(500).json({ error: error.message || 'Error guardando historial de flujo' });
  }
});

// --- BENCHMARK HISTORY ---
apiRouter.get('/history', (_req: Request, res: Response) => {
  return res.json(Database.getHistory());
});

apiRouter.delete('/history', (_req: Request, res: Response) => {
  Database.clearHistory();
  return res.json({ success: true, message: 'Historial de benchmarks vaciado' });
});

// --- SETTINGS ---
apiRouter.get('/settings', (_req: Request, res: Response) => {
  return res.json(Database.getSettings());
});

apiRouter.post('/settings', (req: Request, res: Response) => {
  const current = Database.getSettings();
  const updated: EnvironmentSettings = {
    ...current,
    ...req.body
  };
  Database.saveSettings(updated);
  return res.json(updated);
});

// --- EXPORT & IMPORT (BUNDLE & SHARING) ---
apiRouter.get('/export', (_req: Request, res: Response) => {
  const bundle = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    categories: Database.getCategories(),
    variants: Database.getVariants(),
    flows: Database.getFlows(),
    environments: Database.getEnvironments()
  };
  res.setHeader('Content-Type', 'application/json');
  return res.json(bundle);
});

apiRouter.post('/import', (req: Request, res: Response) => {
  try {
    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'Payload JSON inválido' });
    }

    let importedCategories = 0;
    let importedVariants = 0;
    let importedFlows = 0;
    let importedEnvironments = 0;

    // 1. Categories
    if (Array.isArray(payload.categories)) {
      for (const cat of payload.categories) {
        if (typeof cat === 'string' && cat.trim()) {
          Database.addCategory(cat.trim());
          importedCategories++;
        }
      }
    }

    // 2. Variants
    const variantsList: Variant[] = Array.isArray(payload.variants)
      ? payload.variants
      : Array.isArray(payload) && payload[0]?.query
      ? payload
      : payload.query
      ? [payload]
      : [];

    for (const v of variantsList) {
      if (v && v.name && v.query) {
        const variantId = v.id || ('var-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6));
        Database.upsertVariant({
          ...v,
          id: variantId,
          category: v.category || v.stage || 'Sin Categoría'
        });
        importedVariants++;
      }
    }

    // 3. Flows
    const flowsList: SavedFlow[] = Array.isArray(payload.flows)
      ? payload.flows
      : Array.isArray(payload) && payload[0]?.steps
      ? payload
      : payload.steps
      ? [payload]
      : [];

    for (const f of flowsList) {
      if (f && f.name && Array.isArray(f.steps)) {
        const flowId = f.id || ('flow-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6));
        Database.upsertFlow({
          ...f,
          id: flowId
        });
        importedFlows++;
      }
    }

    // 4. Environments
    const envsList: Environment[] = Array.isArray(payload.environments)
      ? payload.environments
      : Array.isArray(payload) && payload[0]?.magentoUrl
      ? payload
      : payload.magentoUrl
      ? [payload]
      : [];

    for (const env of envsList) {
      if (env && env.name && env.magentoUrl) {
        const envId = env.id || ('env-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6));
        Database.upsertEnvironment({
          ...env,
          id: envId
        });
        importedEnvironments++;
      }
    }

    return res.json({
      success: true,
      importedCategories,
      importedVariants,
      importedFlows,
      importedEnvironments
    });
  } catch (err: any) {
    console.error('Error importing:', err);
    return res.status(500).json({ error: err.message || 'Error importando datos' });
  }
});

// --- GRAPHQL SCHEMA INTROSPECTION & VALIDATION ---
apiRouter.post('/schema/introspect', async (req: Request, res: Response) => {
  try {
    const { environmentId, endpointUrl, headers, forceRefresh } = req.body || {};
    const result = await SchemaService.introspect({
      environmentId,
      endpointUrl,
      headers,
      forceRefresh: Boolean(forceRefresh)
    });

    if (!result.success) {
      return res.status(502).json(result);
    }

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Error interno en introspección'
    });
  }
});

apiRouter.get('/schema/active', async (req: Request, res: Response) => {
  try {
    const envId = typeof req.query.environmentId === 'string' ? req.query.environmentId : undefined;
    const force = req.query.force === 'true';
    const result = await SchemaService.introspect({
      environmentId: envId,
      forceRefresh: force
    });
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Error obteniendo esquema del entorno activo'
    });
  }
});
