import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Settings,
  Download,
  Upload,
  Package,
  BookmarkCheck,
  Layers,
  FolderTree,
  Server,
  Save,
  Database,
  CheckCircle2,
  ShieldCheck,
  Globe
} from 'lucide-react';
import { EnvironmentSettings } from '../../types';
import { api } from '../../api';
import { useFeedback } from '../../context/FeedbackContext';
import { downloadJson, readJsonFile } from '../../utils/fileTransfer';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: EnvironmentSettings | null;
  onSave: (newSettings: Partial<EnvironmentSettings>) => void;
  onDataReloaded?: () => void | Promise<void>;
}

type SettingsTab = 'data' | 'database' | 'system';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
  onDataReloaded
}) => {
  const { toast } = useFeedback();
  const [activeTab, setActiveTab] = useState<SettingsTab>('data');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [dbStatus, setDbStatus] = useState<any>(null);

  // System settings state
  const [useMockSimulator, setUseMockSimulator] = useState(true);
  const [customHeadersStr, setCustomHeadersStr] = useState('{\n  "Content-Type": "application/json"\n}');
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Lock body scroll and handle Escape key
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      api.getDatabaseStatus().then(setDbStatus).catch(console.error);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen, onClose]);

  useEffect(() => {
    if (settings) {
      setUseMockSimulator(settings.useMockSimulator ?? true);
      setCustomHeadersStr(
        JSON.stringify(settings.customHeaders || { 'Content-Type': 'application/json' }, null, 2)
      );
    }
  }, [settings, isOpen]);

  if (!isOpen) return null;

  // --- EXPORT HANDLERS ---
  const handleExportBundle = async () => {
    try {
      const bundle = await api.exportBundle();
      downloadJson('workspace-bundle-completo.json', bundle);
      toast('Bundle completo exportado (flujos, variantes, categorías y entornos)', 'success');
    } catch (err: any) {
      toast(`Error al exportar bundle: ${err.message}`, 'error');
    }
  };

  const handleExportFlows = async () => {
    try {
      const flows = await api.getFlows();
      downloadJson('flujos.json', { flows });
      toast(`${flows.length} flujos exportados`, 'success');
    } catch (err: any) {
      toast(`Error al exportar flujos: ${err.message}`, 'error');
    }
  };

  const handleExportVariants = async () => {
    try {
      const variants = await api.getVariants();
      downloadJson('variantes.json', { variants });
      toast(`${variants.length} variantes exportadas`, 'success');
    } catch (err: any) {
      toast(`Error al exportar variantes: ${err.message}`, 'error');
    }
  };

  const handleExportCategories = async () => {
    try {
      const categories = await api.getCategories();
      downloadJson('categorias.json', { categories });
      toast(`${categories.length} categorías exportadas`, 'success');
    } catch (err: any) {
      toast(`Error al exportar categorías: ${err.message}`, 'error');
    }
  };

  const handleExportEnvironments = async () => {
    try {
      const environments = await api.getEnvironments();
      downloadJson('entornos.json', { environments });
      toast(`${environments.length} entornos exportados`, 'success');
    } catch (err: any) {
      toast(`Error al exportar entornos: ${err.message}`, 'error');
    }
  };

  // --- IMPORT HANDLER ---
  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const parsed = await readJsonFile(file);
      const res = await api.importData(parsed);

      const parts: string[] = [];
      if (res.importedFlows > 0) parts.push(`${res.importedFlows} flujo(s)`);
      if (res.importedVariants > 0) parts.push(`${res.importedVariants} variante(s)`);
      if (res.importedCategories > 0) parts.push(`${res.importedCategories} categoría(s)`);
      if (res.importedEnvironments > 0) parts.push(`${res.importedEnvironments} entorno(s)`);

      if (parts.length === 0) {
        toast('El archivo no contenía entidades válidas para importar', 'info');
      } else {
        toast(`¡Importación exitosa! (${parts.join(', ')})`, 'success');
        await onDataReloaded?.();
      }
    } catch (err: any) {
      toast(`Error al importar: ${err.message}`, 'error');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // --- SAVE SYSTEM SETTINGS ---
  const handleSaveSystem = (e: React.FormEvent) => {
    e.preventDefault();
    let parsedHeaders = {};
    try {
      parsedHeaders = JSON.parse(customHeadersStr || '{}');
    } catch (err: any) {
      setJsonError(`JSON de cabeceras inválido: ${err.message}`);
      return;
    }

    onSave({
      useMockSimulator,
      customHeaders: parsedHeaders
    });
    toast('Ajustes del sistema guardados', 'success');
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden transition-colors flex flex-col max-h-[90vh]">
        {/* Hidden file input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileImport}
          accept=".json"
          className="hidden"
        />

        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-orange-500/10 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 flex items-center justify-center">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Configuraciones Generales
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 pt-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 bg-slate-50/50 dark:bg-slate-950/40">
          <button
            onClick={() => setActiveTab('data')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'data'
                ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Importar &amp; Exportar</span>
          </button>
          <button
            onClick={() => setActiveTab('database')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'database'
                ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Base de Datos Híbrida</span>
          </button>
          <button
            onClick={() => setActiveTab('system')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'system'
                ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>Ajustes del Sistema</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {activeTab === 'data' && (
            <div className="space-y-6">
              {/* Import Section Card */}
              <div className="p-4 rounded-2xl border-2 border-dashed border-orange-300 dark:border-orange-900/50 bg-orange-50/30 dark:bg-orange-950/10 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      Importar Información desde JSON
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Carga un bundle completo, flujos, variantes, categorías o entornos.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isImporting}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-sm transition-all shrink-0 disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{isImporting ? 'Importando...' : 'Seleccionar Archivo JSON'}</span>
                </button>
              </div>

              {/* Export Section */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Exportar Datos del Workspace
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Export Bundle Completo */}
                  <div className="sm:col-span-2 p-3.5 rounded-xl border border-orange-200 dark:border-orange-900/40 bg-orange-50/40 dark:bg-orange-950/20 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-orange-600 text-white">
                        <Package className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                          Exportar Todo (Bundle Completo)
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          Variantes, flujos, categorías y entornos en un solo archivo
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={handleExportBundle}
                      className="px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-xs transition-all flex items-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Descargar</span>
                    </button>
                  </div>

                  {/* Export Flujos */}
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-3 shadow-xs">
                    <div className="flex items-center gap-2.5">
                      <BookmarkCheck className="w-4 h-4 text-orange-500" />
                      <div>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                          Flujos Guardados
                        </span>
                        <span className="text-[10px] text-slate-400">Pasos y recetas</span>
                      </div>
                    </div>
                    <button
                      onClick={handleExportFlows}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold"
                      title="Descargar flujos"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Export Variantes */}
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-3 shadow-xs">
                    <div className="flex items-center gap-2.5">
                      <Layers className="w-4 h-4 text-orange-500" />
                      <div>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                          Variantes de Petición
                        </span>
                        <span className="text-[10px] text-slate-400">GraphQL y REST</span>
                      </div>
                    </div>
                    <button
                      onClick={handleExportVariants}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold"
                      title="Descargar variantes"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Export Categorías */}
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-3 shadow-xs">
                    <div className="flex items-center gap-2.5">
                      <FolderTree className="w-4 h-4 text-orange-500" />
                      <div>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                          Categorías
                        </span>
                        <span className="text-[10px] text-slate-400">Etapas del checkout</span>
                      </div>
                    </div>
                    <button
                      onClick={handleExportCategories}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold"
                      title="Descargar categorías"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Export Entornos */}
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-3 shadow-xs">
                    <div className="flex items-center gap-2.5">
                      <Server className="w-4 h-4 text-orange-500" />
                      <div>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                          Entornos
                        </span>
                        <span className="text-[10px] text-slate-400">URLs y variables</span>
                      </div>
                    </div>
                    <button
                      onClick={handleExportEnvironments}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold"
                      title="Descargar entornos"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'database' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                      <Globe className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        {dbStatus?.shared?.name || 'Base de Datos Central / Compartida'}
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        {dbStatus?.shared?.scope || 'Flujos, Variantes y Categorías'}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 ${
                      dbStatus?.shared?.connected
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60'
                        : 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 border border-amber-200'
                    }`}
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    <span>{dbStatus?.shared?.connected ? 'Conectada y Sincronizada' : 'Modo Archivos / Offline'}</span>
                  </span>
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-400 space-y-1 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-850">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Origen:</span>
                    <span className="font-mono text-slate-700 dark:text-slate-300">
                      {dbStatus?.shared?.urlMasked || 'PostgreSQL'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
                    💡 Todo el equipo comparte los mismos flujos y variantes. Cuenta con protección contra borrado accidental (Soft Delete) y candados de flujos maestros.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        {dbStatus?.local?.name || 'Base de Datos Local (Docker)'}
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        {dbStatus?.local?.scope || 'Entornos, Credenciales, Tokens e Historial'}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 ${
                      dbStatus?.local?.connected
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60'
                        : 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 border border-amber-200'
                    }`}
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    <span>{dbStatus?.local?.connected ? 'Local Protegida' : 'Offline'}</span>
                  </span>
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-400 space-y-1 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-850">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Origen Local:</span>
                    <span className="font-mono text-slate-700 dark:text-slate-300">
                      {dbStatus?.local?.urlMasked || 'PostgreSQL Docker Local'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
                    🔒 <strong>100% Privado</strong>: Las URLs locales de Magento, tokens de acceso y CartIds de prueba quedan exclusivamente en tu máquina Docker y nunca se suben ni exponen a otros.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-800 dark:text-orange-200 text-xs">
                <span className="font-bold">¿Cómo conectar una base de datos central en la nube?</span>
                <p className="text-[11px] text-orange-700 dark:text-orange-300 mt-0.5">
                  Solo debes configurar en el archivo <code className="font-mono bg-orange-500/20 px-1 py-0.5 rounded">.env</code> de tu servidor:
                  <br />
                  <code className="font-mono font-semibold block mt-1">SHARED_DATABASE_URL=postgresql://usuario:pass@host:5432/dbname</code>
                </p>
              </div>
            </div>
          )}

          {activeTab === 'system' && (
            <form onSubmit={handleSaveSystem} className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                    Modo Simulador Mock
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Responde con datos simulados de Magento en caso de que no haya conexión
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setUseMockSimulator(prev => !prev)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                    useMockSimulator
                      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'
                  }`}
                >
                  {useMockSimulator ? 'Activo' : 'Desactivado'}
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Cabeceras HTTP Globales por Defecto (JSON)
                </label>
                <textarea
                  rows={4}
                  value={customHeadersStr}
                  onChange={e => {
                    setCustomHeadersStr(e.target.value);
                    setJsonError(null);
                  }}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 font-mono text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500"
                />
                {jsonError && <p className="text-rose-500 text-[11px] mt-1 font-mono">{jsonError}</p>}
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-sm transition-all"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Guardar Ajustes</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
