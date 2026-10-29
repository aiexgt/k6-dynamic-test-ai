import { useState, useEffect } from 'react';
import { Navbar, NavigationTab } from './components/Navbar';
import { FlowRunner } from './components/Playground/FlowRunner';
import { SavedFlowsList } from './components/Flows/SavedFlowsList';
import { VariantCatalog } from './components/Variants/VariantCatalog';
import { CategoriesView } from './components/Categories/CategoriesView';
import { EnvironmentsView } from './components/Environments/EnvironmentsView';
import { GlobalTestsView } from './components/GlobalTests/GlobalTestsView';
import { BenchmarkDashboard } from './components/Analytics/BenchmarkDashboard';
import { SettingsModal } from './components/Settings/SettingsModal';
import { UserProfileModal } from './components/common/UserProfileModal';
import { TrashModal } from './components/common/TrashModal';
import { Environment, EnvironmentSettings, SavedFlow, Variant, UserProfile } from './types';
import { api, getUserProfile } from './api';
import { useFeedback } from './context/FeedbackContext';

export function App() {
  const { toast } = useFeedback();

  // Route parser for initial URL path
  const getInitialTab = (): NavigationTab => {
    const p = typeof window !== 'undefined' ? window.location.pathname.replace(/^\//, '').toLowerCase() : '';
    const validTabs: NavigationTab[] = [
      'playground', 'flows', 'variants', 'categories', 'environments', 'global-tests', 'analytics'
    ];
    for (const t of validTabs) {
      if (p.startsWith(t)) return t;
    }
    return 'playground';
  };

  const [activeTab, setActiveTabState] = useState<NavigationTab>(getInitialTab);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [settings, setSettings] = useState<EnvironmentSettings | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [flows, setFlows] = useState<SavedFlow[]>([]);
  const [loadedFlow, setLoadedFlow] = useState<SavedFlow | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserProfile>(getUserProfile);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [trashCount, setTrashCount] = useState(0);

  // Navigate helper with HTML5 History API URL paths
  const navigateToTab = (tab: NavigationTab, flowId?: string) => {
    setActiveTabState(tab);
    let targetPath = tab === 'playground' ? '/playground' : `/${tab}`;
    if (tab === 'playground') {
      const currentParams = new URLSearchParams(window.location.search);
      const targetFlowId = flowId !== undefined ? flowId : currentParams.get('flow');
      if (targetFlowId) {
        targetPath += `?flow=${encodeURIComponent(targetFlowId)}`;
      }
    }
    if (window.location.pathname + window.location.search !== targetPath) {
      window.history.pushState(null, '', targetPath);
    }
  };

  const handleFlowUrlUpdate = (flowId: string) => {
    let targetPath = '/playground';
    if (flowId) {
      targetPath += `?flow=${encodeURIComponent(flowId)}`;
    }
    if (window.location.pathname + window.location.search !== targetPath) {
      window.history.replaceState(null, '', targetPath);
    }
  };

  // Popstate listener (Browser Back/Forward buttons)
  useEffect(() => {
    const handlePopState = () => {
      const p = window.location.pathname.replace(/^\//, '').toLowerCase();
      const validTabs: NavigationTab[] = [
        'playground', 'flows', 'variants', 'categories', 'environments', 'global-tests', 'analytics'
      ];
      const matched = validTabs.find(t => p.startsWith(t)) || 'playground';
      setActiveTabState(matched);

      const params = new URLSearchParams(window.location.search);
      const flowParam = params.get('flow');
      if (flowParam && flows.length > 0) {
        const found = flows.find(f => f.id === flowParam);
        if (found) setLoadedFlow(found);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [flows]);

  // Theme state: dark / light
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      const [envs, stg, cats, vars, fList] = await Promise.all([
        api.getEnvironments(),
        api.getSettings(),
        api.getCategories(),
        api.getVariants(),
        api.getFlows()
      ]);
      setEnvironments(envs);
      setSettings(stg);
      setCategories(cats);
      setVariants(vars);
      setFlows(fList);

      // Check URL for flow query parameter on initial load
      const params = new URLSearchParams(window.location.search);
      const flowIdParam = params.get('flow');
      if (flowIdParam) {
        const found = fList.find(f => f.id === flowIdParam);
        if (found) {
          setLoadedFlow(found);
        }
      }

      // If at root '/' or empty, synchronize URL to /playground
      if (window.location.pathname === '/' || window.location.pathname === '') {
        const search = flowIdParam ? `?flow=${encodeURIComponent(flowIdParam)}` : '';
        window.history.replaceState(null, '', `/playground${search}`);
      }
      updateTrashCount();
    } catch (err) {
      console.error('Error fetching initial data:', err);
    }
  };

  const updateTrashCount = async () => {
    try {
      const trash = await api.getTrash();
      setTrashCount((trash.flows?.length || 0) + (trash.variants?.length || 0));
    } catch {}
  };

  const loadCategoriesAndVariants = async () => {
    try {
      const [cats, vars] = await Promise.all([api.getCategories(), api.getVariants()]);
      setCategories(cats);
      setVariants(vars);
      updateTrashCount();
    } catch (err) {
      console.error(err);
    }
  };

  const loadEnvironmentsData = async () => {
    try {
      const [envs, stg] = await Promise.all([api.getEnvironments(), api.getSettings()]);
      setEnvironments(envs);
      setSettings(stg);
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleTheme = () => {
    setIsDark(prev => !prev);
  };

  const handleSelectEnvironment = async (envId: string) => {
    try {
      const result = await api.selectEnvironment(envId);
      setSettings(result);
      toast('Entorno cambiado con éxito', 'success');
    } catch (err: any) {
      toast(`Error al cambiar entorno: ${err.message}`, 'error');
    }
  };

  const handleSaveEnvironment = async (env: Partial<Environment>) => {
    try {
      if (env.id) {
        const updated = await api.updateEnvironment(env.id, env);
        setEnvironments(prev => prev.map(e => (e.id === updated.id ? updated : e)));
        toast('Entorno actualizado con éxito', 'success');
      } else {
        const created = await api.createEnvironment(env);
        setEnvironments(prev => [...prev, created]);
        toast('Entorno creado con éxito', 'success');
      }
      await loadEnvironmentsData();
    } catch (err: any) {
      toast(`Error al guardar entorno: ${err.message}`, 'error');
    }
  };

  const handleDeleteEnvironment = async (envId: string) => {
    try {
      await api.deleteEnvironment(envId);
      setEnvironments(prev => prev.filter(e => e.id !== envId));
      await loadEnvironmentsData();
      toast('Entorno eliminado', 'success');
    } catch (err: any) {
      toast(`Error al eliminar entorno: ${err.message}`, 'error');
    }
  };

  const handleCloneEnvironment = async (envId: string, name?: string) => {
    try {
      const cloned = await api.cloneEnvironment(envId, name);
      setEnvironments(prev => [...prev, cloned]);
      await loadEnvironmentsData();
      toast(`Entorno "${cloned.name}" duplicado con éxito`, 'success');
    } catch (err: any) {
      toast(`Error al duplicar entorno: ${err.message}`, 'error');
    }
  };

  const handleSaveSettings = async (newSettings: Partial<EnvironmentSettings>) => {
    try {
      const updated = await api.saveSettings(newSettings);
      setSettings(updated);
      await loadEnvironmentsData();
    } catch (err: any) {
      toast(`Error al guardar configuración: ${err.message}`, 'error');
    }
  };

  const handleCreateCategory = async (name: string) => {
    try {
      const updated = await api.createCategory(name);
      setCategories(updated);
      toast(`Categoría "${name}" creada con éxito`, 'success');
    } catch (err: any) {
      toast(`Error creando categoría: ${err.message}`, 'error');
    }
  };

  const handleRenameCategory = async (oldName: string, newName: string) => {
    try {
      await api.renameCategory(oldName, newName);
      await loadCategoriesAndVariants();
      toast(`Categoría renombrada a "${newName}"`, 'success');
    } catch (err: any) {
      toast(`Error renombrando: ${err.message}`, 'error');
    }
  };

  const handleDeleteCategory = async (name: string) => {
    try {
      await api.deleteCategory(name);
      await loadCategoriesAndVariants();
      toast(`Categoría "${name}" eliminada`, 'success');
    } catch (err: any) {
      toast(`Error eliminando: ${err.message}`, 'error');
    }
  };

  const handleLoadFlowInPlayground = (flow: SavedFlow) => {
    setLoadedFlow(flow);
    navigateToTab('playground', flow.id);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors selection:bg-orange-500 selection:text-white">
      <Navbar
        activeTab={activeTab}
        setActiveTab={navigateToTab}
        environments={environments}
        activeEnvironmentId={settings?.activeEnvironmentId}
        onSelectEnvironment={handleSelectEnvironment}
        isDark={isDark}
        onToggleTheme={handleToggleTheme}
        onOpenSettings={() => setIsSettingsOpen(true)}
        currentUser={currentUser}
        onOpenProfile={() => setIsProfileOpen(true)}
        onOpenTrash={() => setIsTrashOpen(true)}
        trashCount={trashCount}
      />

      <main className="flex-1 pb-10">
        {activeTab === 'playground' && (
          <FlowRunner
            initialFlow={loadedFlow}
            onFlowChange={handleFlowUrlUpdate}
          />
        )}
        {activeTab === 'flows' && (
          <SavedFlowsList onLoadFlowInPlayground={handleLoadFlowInPlayground} />
        )}
        {activeTab === 'variants' && (
          <VariantCatalog
            onNavigateToCategories={() => {
              loadCategoriesAndVariants();
              navigateToTab('categories');
            }}
            onReloadEnvironments={loadEnvironmentsData}
          />
        )}
        {activeTab === 'categories' && (
          <CategoriesView
            categories={categories}
            variants={variants}
            onCreateCategory={handleCreateCategory}
            onRenameCategory={handleRenameCategory}
            onDeleteCategory={handleDeleteCategory}
            onBack={() => navigateToTab('variants')}
            onReloadCategories={loadCategoriesAndVariants}
          />
        )}
        {activeTab === 'environments' && (
          <EnvironmentsView
            environments={environments}
            activeEnvironmentId={settings?.activeEnvironmentId}
            onSelectEnvironment={handleSelectEnvironment}
            onSaveEnvironment={handleSaveEnvironment}
            onDeleteEnvironment={handleDeleteEnvironment}
            onCloneEnvironment={handleCloneEnvironment}
          />
        )}
        {activeTab === 'global-tests' && <GlobalTestsView />}
        {activeTab === 'analytics' && <BenchmarkDashboard />}
      </main>

      {/* General Settings & Import/Export Modal */}
      {isSettingsOpen && (
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          settings={settings}
          onSave={handleSaveSettings}
          onDataReloaded={async () => {
            await Promise.all([
              loadEnvironmentsData(),
              loadCategoriesAndVariants()
            ]);
          }}
        />
      )}

      {/* Developer Profile Modal */}
      {isProfileOpen && (
        <UserProfileModal
          isOpen={isProfileOpen}
          onClose={() => setIsProfileOpen(false)}
          currentUser={currentUser}
          onUserUpdated={u => {
            setCurrentUser(u);
            toast(`Perfil actualizado: ${u.name}`, 'success');
          }}
        />
      )}

      {/* Trash Bin Modal (Soft Delete) */}
      {isTrashOpen && (
        <TrashModal
          isOpen={isTrashOpen}
          onClose={() => {
            setIsTrashOpen(false);
            updateTrashCount();
          }}
          onItemRestored={async () => {
            await Promise.all([
              loadCategoriesAndVariants(),
              api.getFlows().then(setFlows)
            ]);
            updateTrashCount();
          }}
        />
      )}

      <footer className="border-t border-slate-200 dark:border-slate-900 bg-white dark:bg-slate-950 py-3 text-center text-xs text-slate-400 transition-colors">
        <div className="max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <span className="font-semibold text-slate-600 dark:text-slate-400">Magento Flow Runner</span>
          <span className="font-mono text-slate-400">Dynamic Environment &amp; Assertion Pipeline</span>
        </div>
      </footer>
    </div>
  );
}
export default App;
