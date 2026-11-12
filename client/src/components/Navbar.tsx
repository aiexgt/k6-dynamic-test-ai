import React from 'react';
import {
  PlayCircle,
  BookmarkCheck,
  Layers,
  FolderTree,
  BarChart3,
  Sun,
  Moon,
  Server,
  ShieldCheck,
  ShieldAlert,
  Settings,
  Trash2,
  ListOrdered,
  RefreshCw,
  Bug
} from 'lucide-react';
import { Environment, UserProfile } from '../types';
import { SearchableSelect } from './common/SearchableSelect';

export type NavigationTab = 'playground' | 'flows' | 'flow-sets' | 'variants' | 'categories' | 'environments' | 'global-tests' | 'analytics';

interface NavbarProps {
  activeTab: NavigationTab;
  setActiveTab: (tab: NavigationTab) => void;
  environments: Environment[];
  activeEnvironmentId?: string;
  onSelectEnvironment: (id: string) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  isDebugMode?: boolean;
  onToggleXdebug?: () => void;
  onOpenSettings?: () => void;
  currentUser?: UserProfile;
  onOpenProfile?: () => void;
  onOpenTrash?: () => void;
  trashCount?: number;
  onForceSync?: () => void;
  isSyncing?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  environments,
  activeEnvironmentId,
  onSelectEnvironment,
  isDark,
  onToggleTheme,
  isDebugMode = false,
  onToggleXdebug,
  onOpenSettings,
  currentUser,
  onOpenProfile,
  onOpenTrash,
  trashCount = 0,
  onForceSync,
  isSyncing = false
}) => {
  const activeEnv = environments.find(e => e.id === activeEnvironmentId);
  const envOptions = environments.map(e => ({
    value: e.id,
    label: `${e.isProtected ? '🛡️ ' : ''}${e.name}`,
    sublabel: `${e.isProtected ? '[Protegido] ' : ''}${e.magentoUrl}`
  }));

  const userInitials = currentUser?.name
    ? currentUser.name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map(p => p[0].toUpperCase())
        .join('')
    : 'DV';

  return (
    <header className="border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur sticky top-0 z-40 transition-colors">
      <div className="max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 min-h-14 py-2 flex flex-wrap items-center justify-between gap-3">
        {/* Brand & Tabs */}
        <div className="flex items-center gap-3 sm:gap-4 overflow-x-auto py-1 max-w-full">
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-7 h-7 rounded-lg bg-orange-600 flex items-center justify-center text-white font-black text-xs">
              M2
            </div>
            <span className="font-bold text-xs tracking-tight text-slate-900 dark:text-slate-100 hidden md:inline">
              Flow Runner
            </span>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 flex-shrink-0">
            <button
              onClick={() => setActiveTab('playground')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'playground'
                  ? 'bg-orange-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <PlayCircle className="w-3.5 h-3.5" />
              <span>Playground</span>
            </button>

            <button
              onClick={() => setActiveTab('flows')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'flows'
                  ? 'bg-orange-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <BookmarkCheck className="w-3.5 h-3.5" />
              <span>Flujos</span>
            </button>

            <button
              onClick={() => setActiveTab('flow-sets')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'flow-sets'
                  ? 'bg-orange-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <ListOrdered className="w-3.5 h-3.5" />
              <span>Sets</span>
            </button>

            <button
              onClick={() => setActiveTab('variants')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'variants'
                  ? 'bg-orange-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Variantes</span>
            </button>

            <button
              onClick={() => setActiveTab('categories')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'categories'
                  ? 'bg-orange-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <FolderTree className="w-3.5 h-3.5" />
              <span>Categorías</span>
            </button>

            <button
              onClick={() => setActiveTab('environments')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'environments'
                  ? 'bg-orange-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              <span>Entornos</span>
            </button>

            <button
              onClick={() => setActiveTab('global-tests')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'global-tests'
                  ? 'bg-orange-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Pruebas</span>
            </button>

            <button
              onClick={() => setActiveTab('analytics')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'analytics'
                  ? 'bg-orange-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Métricas</span>
            </button>
          </nav>
        </div>

        {/* Right Actions: Environment Selector with Search, Trash, User Profile & Theme */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Environment Searchable Select */}
          <div className="w-44 sm:w-52 relative">
            <SearchableSelect
              options={envOptions}
              value={activeEnvironmentId || null}
              onChange={onSelectEnvironment}
              placeholder="Seleccionar Entorno"
            />
            {activeEnv?.isProtected && (
              <span
                className="absolute -top-1 -left-1 p-0.5 rounded-full bg-amber-500 text-white shadow-xs"
                title={`Entorno "${activeEnv.name}" protegido`}
              >
                <ShieldAlert className="w-2.5 h-2.5" />
              </span>
            )}
          </div>

          {/* Central DB Sync Button */}
          {onForceSync && (
            <button
              onClick={onForceSync}
              disabled={isSyncing}
              className={`p-1.5 rounded-lg border transition-all ${
                isSyncing
                  ? 'bg-blue-500/15 border-blue-500/40 text-blue-600 dark:text-blue-400'
                  : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title="Forzar sincronización con base de datos central (útil si un compañero creó o modificó un flujo/variante y no te aparece)"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-blue-500' : ''}`} />
            </button>
          )}

          {/* Trash Bin Button */}
          <button
            onClick={onOpenTrash}
            className="relative p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Papelera de reciclaje (Soft Delete)"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {trashCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center shadow-xs">
                {trashCount > 9 ? '9+' : trashCount}
              </span>
            )}
          </button>

          {/* User Profile Pill */}
          <button
            onClick={onOpenProfile}
            className="flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-xs"
            title={`Perfil: ${currentUser?.name || 'Desarrollador'} (${currentUser?.email || 'dev@kosmos.test'}) — Clic para editar`}
          >
            <div
              className="w-5 h-5 rounded-md flex items-center justify-center text-white text-[10px] font-bold shadow-2xs"
              style={{ backgroundColor: currentUser?.avatarColor || '#3b82f6' }}
            >
              {userInitials}
            </div>
            <span className="font-semibold text-slate-700 dark:text-slate-300 hidden sm:inline max-w-[100px] truncate">
              {currentUser?.name ? currentUser.name.split(' ')[0] : 'Dev'}
            </span>
          </button>

          {/* Theme Toggle Button */}
          <button
            onClick={onToggleTheme}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={isDark ? 'Modo claro' : 'Modo oscuro'}
          >
            {isDark ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-700" />}
          </button>

          {/* Xdebug Debugger Mode Toggle (Icon only) */}
          {onToggleXdebug && (
            <button
              onClick={onToggleXdebug}
              className={`p-1.5 rounded-lg border transition-all ${
                isDebugMode
                  ? 'bg-purple-500/15 border-purple-500/40 text-purple-600 dark:text-purple-400 shadow-xs'
                  : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title={`Modo Xdebug PHP: ${isDebugMode ? 'ACTIVADO (PHPSTORM)' : 'DESACTIVADO'} — Agrega ?XDEBUG_SESSION_START=PHPSTORM`}
            >
              <Bug className="w-3.5 h-3.5" />
            </button>
          )}

          {/* General Settings / Tuerca */}
          <button
            onClick={onOpenSettings}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Configuraciones Generales, Base de Datos Híbrida & Exportar"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
};
