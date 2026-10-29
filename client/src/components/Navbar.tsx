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
  Settings,
  Trash2
} from 'lucide-react';
import { Environment, UserProfile } from '../types';
import { SearchableSelect } from './common/SearchableSelect';

export type NavigationTab = 'playground' | 'flows' | 'variants' | 'categories' | 'environments' | 'global-tests' | 'analytics';

interface NavbarProps {
  activeTab: NavigationTab;
  setActiveTab: (tab: NavigationTab) => void;
  environments: Environment[];
  activeEnvironmentId?: string;
  onSelectEnvironment: (id: string) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  onOpenSettings?: () => void;
  currentUser?: UserProfile;
  onOpenProfile?: () => void;
  onOpenTrash?: () => void;
  trashCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  environments,
  activeEnvironmentId,
  onSelectEnvironment,
  isDark,
  onToggleTheme,
  onOpenSettings,
  currentUser,
  onOpenProfile,
  onOpenTrash,
  trashCount = 0
}) => {
  const envOptions = environments.map(e => ({
    value: e.id,
    label: e.name,
    sublabel: e.magentoUrl
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
      <div className="max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
        {/* Brand & Tabs */}
        <div className="flex items-center gap-3 sm:gap-4 overflow-x-auto py-1">
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
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Environment Searchable Select */}
          <div className="w-44 sm:w-52">
            <SearchableSelect
              options={envOptions}
              value={activeEnvironmentId || null}
              onChange={onSelectEnvironment}
              placeholder="Seleccionar Entorno"
            />
          </div>

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
