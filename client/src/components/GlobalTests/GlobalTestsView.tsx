import React, { useState, useEffect } from 'react';
import { ShieldCheck, Save, RotateCcw, Clock, CheckCircle2, AlertTriangle, FileCode } from 'lucide-react';
import { GlobalTestConfig } from '../../types';
import { api } from '../../api';
import { useFeedback } from '../../context/FeedbackContext';

export const GlobalTestsView: React.FC = () => {
  const { toast } = useFeedback();
  const [tests, setTests] = useState<GlobalTestConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadGlobalTests();
  }, []);

  const loadGlobalTests = async () => {
    try {
      setIsLoading(true);
      const data = await api.getGlobalTests();
      setTests(data);
    } catch (err: any) {
      toast(`Error cargando pruebas globales: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = (id: string) => {
    setTests(prev => prev.map(t => (t.id === id ? { ...t, enabled: !t.enabled } : t)));
  };

  const handleThresholdChange = (id: string, threshold: number) => {
    setTests(prev => prev.map(t => (t.id === id ? { ...t, threshold } : t)));
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const updated = await api.saveGlobalTests(tests);
      setTests(updated);
      toast('Pruebas globales actualizadas con éxito', 'success');
    } catch (err: any) {
      toast(`Error guardando pruebas globales: ${err.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const getTestIcon = (type: string) => {
    switch (type) {
      case 'STATUS_CODE_200':
        return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
      case 'NO_GRAPHQL_ERRORS':
        return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      case 'MAX_RESPONSE_TIME':
        return <Clock className="w-5 h-5 text-blue-500" />;
      case 'HAS_DATA':
        return <FileCode className="w-5 h-5 text-purple-500" />;
      default:
        return <ShieldCheck className="w-5 h-5 text-orange-500" />;
    }
  };

  return (
    <div className="max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Pruebas Globales (Quality Gates)
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadGlobalTests}
            className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Recargar configuración"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-sm transition-all disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Guardando...' : 'Guardar Reglas'}</span>
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-xs text-slate-400">Cargando pruebas globales...</div>
      ) : (
        <div className="space-y-3">
          {tests.map(test => (
            <div
              key={test.id}
              className={`p-4 rounded-2xl border transition-all ${
                test.enabled
                  ? 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm'
                  : 'border-slate-200 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-950/40 opacity-70'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 p-2 rounded-xl bg-slate-100 dark:bg-slate-800">
                    {getTestIcon(test.type)}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {test.name}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
                        {test.type}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {test.description}
                    </p>

                    {test.type === 'MAX_RESPONSE_TIME' && test.enabled && (
                      <div className="pt-2 flex items-center gap-2">
                        <span className="text-xs text-slate-600 dark:text-slate-300 font-semibold">
                          Umbral máximo de latencia:
                        </span>
                        <input
                          type="number"
                          value={test.threshold || 2000}
                          onChange={e => handleThresholdChange(test.id, parseInt(e.target.value) || 1000)}
                          step="100"
                          min="100"
                          max="15000"
                          className="w-24 px-2.5 py-1 text-xs font-mono font-bold rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100"
                        />
                        <span className="text-xs font-mono text-slate-400">ms</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={test.enabled}
                      onChange={() => handleToggle(test.id)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
