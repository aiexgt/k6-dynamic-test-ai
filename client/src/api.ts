import {
  Variant,
  SavedFlow,
  FlowStepConfig,
  FlowExecutionResponse,
  ExecutionStatus,
  EnvironmentSettings,
  Environment,
  ExecutionContext,
  StepExecutionResult,
  GlobalTestConfig,
  UserProfile,
  ItemVersion
} from './types';

const API_BASE = '/api';

const USER_STORAGE_KEY = 'flowrunner_user_profile';

const AVATAR_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#10b981', '#06b6d4', '#6366f1'
];

export function getUserProfile(): UserProfile {
  if (typeof window === 'undefined') {
    return { id: 'dev-1', name: 'Desarrollador', email: 'dev@kosmos.com', avatarColor: '#3b82f6' };
  }
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.name) return parsed;
    }
  } catch {}

  const defaultUser: UserProfile = {
    id: 'user-' + Math.random().toString(36).substring(2, 8),
    name: 'Dev Tester',
    email: 'dev@kosmos.test',
    avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
  };
  try {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(defaultUser));
  } catch {}
  return defaultUser;
}

export function saveUserProfile(profile: UserProfile): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(profile));
  }
}

function getAuthHeaders(existing: Record<string, string> = {}): Record<string, string> {
  const user = getUserProfile();
  const headers: Record<string, string> = {
    ...existing,
    'X-User-Name': user.name || 'Desarrollador',
    'X-User-Email': user.email || 'dev@kosmos.test'
  };
  if (user.role === 'ADMIN' && user.adminKey) {
    headers['X-Admin-Key'] = user.adminKey;
  }
  return headers;
}

export const api = {
  // Admin Verification
  async verifyAdminKey(key: string): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/auth/verify-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key })
      });
      if (!res.ok) return false;
      const data = await res.json();
      return !!data.valid;
    } catch {
      return false;
    }
  },

  // Categories
  async getCategories(): Promise<string[]> {
    const res = await fetch(`${API_BASE}/categories`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Error fetching categories');
    return res.json();
  },

  async createCategory(name: string): Promise<string[]> {
    const res = await fetch(`${API_BASE}/categories`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ name })
    });
    if (!res.ok) throw new Error('Error creating category');
    const data = await res.json();
    return data.categories || [];
  },

  async renameCategory(oldName: string, newName: string): Promise<void> {
    const res = await fetch(`${API_BASE}/categories/${encodeURIComponent(oldName)}`, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ newName })
    });
    if (!res.ok) throw new Error('Error renaming category');
  },

  async deleteCategory(name: string): Promise<void> {
    const res = await fetch(`${API_BASE}/categories/${encodeURIComponent(name)}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Error deleting category');
  },

  // Variants
  async getVariants(category?: string): Promise<Variant[]> {
    const url = category ? `${API_BASE}/variants?category=${encodeURIComponent(category)}` : `${API_BASE}/variants`;
    const res = await fetch(url, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Error fetching variants');
    return res.json();
  },

  async createVariant(variant: Partial<Variant>): Promise<Variant> {
    const res = await fetch(`${API_BASE}/variants`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(variant)
    });
    if (!res.ok) throw new Error('Error creating variant');
    return res.json();
  },

  async updateVariant(id: string, variant: Partial<Variant>): Promise<Variant> {
    const res = await fetch(`${API_BASE}/variants/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(variant)
    });
    if (!res.ok) throw new Error('Error updating variant');
    return res.json();
  },

  async deleteVariant(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/variants/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Error deleting variant');
  },

  async cloneVariant(id: string): Promise<Variant> {
    const res = await fetch(`${API_BASE}/variants/${id}/clone`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Error cloning variant');
    return res.json();
  },

  // Flows
  async getFlows(): Promise<SavedFlow[]> {
    const res = await fetch(`${API_BASE}/flows`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Error fetching flows');
    return res.json();
  },

  async createFlow(flow: Partial<SavedFlow>): Promise<SavedFlow> {
    const res = await fetch(`${API_BASE}/flows`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(flow)
    });
    if (!res.ok) throw new Error('Error saving flow');
    return res.json();
  },

  async updateFlow(id: string, flow: Partial<SavedFlow>, bypassLock = false): Promise<SavedFlow> {
    const res = await fetch(`${API_BASE}/flows/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ ...flow, bypassLock })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error updating flow');
    }
    return res.json();
  },

  async deleteFlow(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/flows/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error deleting flow');
    }
  },

  async lockFlow(id: string): Promise<SavedFlow> {
    const res = await fetch(`${API_BASE}/flows/${id}/lock`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error locking flow');
    }
    const data = await res.json();
    return data.flow;
  },

  async unlockFlow(id: string): Promise<SavedFlow> {
    const res = await fetch(`${API_BASE}/flows/${id}/unlock`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error unlocking flow');
    }
    const data = await res.json();
    return data.flow;
  },

  async cloneFlow(id: string, name?: string): Promise<SavedFlow> {
    const res = await fetch(`${API_BASE}/flows/${id}/clone`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ name })
    });
    if (!res.ok) throw new Error('Error cloning flow');
    return res.json();
  },

  // Trash Bin (Soft Delete)
  async getTrash(): Promise<{ flows: SavedFlow[]; variants: Variant[] }> {
    const res = await fetch(`${API_BASE}/trash`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Error fetching trash');
    return res.json();
  },

  async restoreFromTrash(type: 'FLOW' | 'VARIANT', id: string): Promise<any> {
    const res = await fetch(`${API_BASE}/trash/restore`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ type, id })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error restoring item');
    }
    return res.json();
  },

  async purgeFromTrash(type: 'FLOW' | 'VARIANT', id: string): Promise<any> {
    const res = await fetch(`${API_BASE}/trash/purge`, {
      method: 'DELETE',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ type, id })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error permanently deleting item');
    }
    return res.json();
  },

  // Database Connection Status
  async getDatabaseStatus(): Promise<{
    shared: { name: string; scope: string; connected: boolean; isRemote: boolean; urlMasked: string };
    local: { name: string; scope: string; connected: boolean; urlMasked: string };
  }> {
    const res = await fetch(`${API_BASE}/database/status`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Error fetching database status');
    return res.json();
  },

  // Environments
  async getEnvironments(): Promise<Environment[]> {
    const res = await fetch(`${API_BASE}/environments`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Error fetching environments');
    return res.json();
  },

  async createEnvironment(env: Partial<Environment>): Promise<Environment> {
    const res = await fetch(`${API_BASE}/environments`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(env)
    });
    if (!res.ok) throw new Error('Error creating environment');
    return res.json();
  },

  async updateEnvironment(id: string, env: Partial<Environment>): Promise<Environment> {
    const res = await fetch(`${API_BASE}/environments/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(env)
    });
    if (!res.ok) throw new Error('Error updating environment');
    return res.json();
  },

  async deleteEnvironment(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/environments/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Error deleting environment');
  },

  async cloneEnvironment(id: string, name?: string): Promise<Environment> {
    const res = await fetch(`${API_BASE}/environments/${id}/clone`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ name })
    });
    if (!res.ok) throw new Error('Error cloning environment');
    return res.json();
  },

  async selectEnvironment(id: string): Promise<EnvironmentSettings> {
    const res = await fetch(`${API_BASE}/environments/select`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ environmentId: id })
    });
    if (!res.ok) throw new Error('Error selecting environment');
    return res.json();
  },

  // Global Tests
  async getGlobalTests(): Promise<GlobalTestConfig[]> {
    const res = await fetch(`${API_BASE}/global-tests`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Error fetching global tests');
    return res.json();
  },

  async saveGlobalTests(tests: GlobalTestConfig[]): Promise<GlobalTestConfig[]> {
    const res = await fetch(`${API_BASE}/global-tests`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ tests })
    });
    if (!res.ok) throw new Error('Error saving global tests');
    return res.json();
  },

  // Flow Execution
  async executeFlow(payload: {
    steps: FlowStepConfig[];
    environmentId?: string;
    flowName?: string;
  }): Promise<FlowExecutionResponse> {
    const res = await fetch(`${API_BASE}/flows/execute`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Error executing flow');
    return res.json();
  },

  async executeStep(
    step: FlowStepConfig,
    context?: Partial<ExecutionContext>,
    settings?: Partial<EnvironmentSettings>,
    recordHistory: boolean = true
  ): Promise<{
    stepResult: StepExecutionResult;
    updatedContext: ExecutionContext;
    status: ExecutionStatus;
  }> {
    const res = await fetch(`${API_BASE}/flows/execute-step`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ step, context, settings, recordHistory })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.errorMessage || err.error || 'Error ejecutando paso');
    }
    return res.json();
  },

  async recordFlowHistory(data: {
    flowName: string;
    status: ExecutionStatus;
    orderNumber?: string | null;
    totalTimeMs: number;
    failedAtCategory?: string | null;
    errorMessage?: string;
    steps: StepExecutionResult[];
    settings?: Partial<EnvironmentSettings>;
  }): Promise<FlowExecutionResponse> {
    const res = await fetch(`${API_BASE}/flows/record-history`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.errorMessage || err.error || 'Error registrando historial');
    }
    return res.json();
  },

  // Analytics & History
  async getHistory(): Promise<FlowExecutionResponse[]> {
    const res = await fetch(`${API_BASE}/history`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Error fetching history');
    return res.json();
  },

  async clearHistory(): Promise<void> {
    const res = await fetch(`${API_BASE}/history`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Error clearing history');
  },

  // Settings
  async getSettings(): Promise<EnvironmentSettings> {
    const res = await fetch(`${API_BASE}/settings`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Error fetching settings');
    return res.json();
  },

  async saveSettings(settings: Partial<EnvironmentSettings>): Promise<EnvironmentSettings> {
    const res = await fetch(`${API_BASE}/settings`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(settings)
    });
    if (!res.ok) throw new Error('Error saving settings');
    return res.json();
  },

  // Export & Import
  async exportBundle(): Promise<any> {
    const res = await fetch(`${API_BASE}/export`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Error exporting bundle');
    return res.json();
  },

  async importData(data: any): Promise<{ success: boolean; importedCategories: number; importedVariants: number; importedFlows: number; importedEnvironments: number }> {
    const res = await fetch(`${API_BASE}/import`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error importing data');
    }
    return res.json();
  },

  // Schema Introspection
  async introspectSchema(options?: {
    environmentId?: string;
    endpointUrl?: string;
    headers?: Record<string, string>;
    forceRefresh?: boolean;
  }): Promise<{
    success: boolean;
    schema?: any;
    typesCount: number;
    fetchedAt: string;
    sourceUrl: string;
    error?: string;
  }> {
    const res = await fetch(`${API_BASE}/schema/introspect`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(options || {})
    });
    return res.json();
  },

  async getActiveSchema(environmentId?: string, force?: boolean): Promise<{
    success: boolean;
    schema?: any;
    typesCount: number;
    fetchedAt: string;
    sourceUrl: string;
    error?: string;
  }> {
    const query = new URLSearchParams();
    if (environmentId) query.set('environmentId', environmentId);
    if (force) query.set('force', 'true');
    const res = await fetch(`${API_BASE}/schema/active?${query.toString()}`, {
      headers: getAuthHeaders()
    });
    return res.json();
  },

  // Versioning & Rollback
  async getEntityVersions(type: 'FLOW' | 'VARIANT' | 'CATEGORIES', id: string): Promise<ItemVersion[]> {
    const res = await fetch(`${API_BASE}/versions/${type.toLowerCase()}/${encodeURIComponent(id)}`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Error al obtener versiones');
    return res.json();
  },

  async rollbackEntityVersion(type: 'FLOW' | 'VARIANT' | 'CATEGORIES', id: string, versionId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/versions/${type.toLowerCase()}/${encodeURIComponent(id)}/rollback/${encodeURIComponent(versionId)}`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error al restaurar versión');
    }
    return res.json();
  },

  async getCategoriesVersions(): Promise<ItemVersion[]> {
    const res = await fetch(`${API_BASE}/categories-versions`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Error al obtener versiones de categorías');
    return res.json();
  },

  async rollbackCategoriesVersion(versionId: string): Promise<string[]> {
    const res = await fetch(`${API_BASE}/categories-versions/rollback/${encodeURIComponent(versionId)}`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error al restaurar categorías');
    }
    const data = await res.json();
    return data.categories;
  }
};
