import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Plus,
  Trash2,
  Sliders,
  ShieldAlert,
  Check,
  Ban,
  Sparkles,
  Info
} from 'lucide-react';
import { Environment } from '../../types';

interface HeaderRow {
  id: string;
  key: string;
  value: string;
}

interface FlowHeadersModalProps {
  isOpen: boolean;
  onClose: () => void;
  flowName: string;
  customHeaders?: Record<string, string>;
  disabledHeaders?: string[];
  environment?: Environment | null;
  onApply: (customHeaders: Record<string, string>, disabledHeaders: string[]) => void;
}

export const FlowHeadersModal: React.FC<FlowHeadersModalProps> = ({
  isOpen,
  onClose,
  flowName,
  customHeaders: initialCustomHeaders = {},
  disabledHeaders: initialDisabledHeaders = [],
  environment,
  onApply
}) => {
  const [activeTab, setActiveTab] = useState<'custom' | 'disabled'>('custom');

  // Custom Headers Rows
  const [headerRows, setHeaderRows] = useState<HeaderRow[]>([]);

  // Disabled / Cancelled Headers Set
  const [disabledHeaders, setDisabledHeaders] = useState<string[]>([]);
  const [newCancelledInput, setNewCancelledInput] = useState<string>('');

  // Lock body scroll and handle Escape key
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen, onClose]);

  // Sync initial props
  useEffect(() => {
    if (isOpen) {
      const rows = Object.entries(initialCustomHeaders || {}).map(([k, v], idx) => ({
        id: `fhdr-${idx}-${Date.now().toString(36)}`,
        key: k,
        value: String(v)
      }));
      setHeaderRows(rows.length > 0 ? rows : [{ id: 'fhdr-0', key: '', value: '' }]);
      setDisabledHeaders([...(initialDisabledHeaders || [])]);
      setNewCancelledInput('');
    }
  }, [isOpen, initialCustomHeaders, initialDisabledHeaders]);

  // Inherited headers from active environment
  const envHeadersList = useMemo(() => {
    if (!environment) return [];
    const list: Array<{ key: string; value: string; type: 'GRAPHQL' | 'REST' | 'CUSTOM' }> = [];
    const seen = new Set<string>();

    if (environment.graphqlHeaders) {
      for (const [k, v] of Object.entries(environment.graphqlHeaders)) {
        list.push({ key: k, value: String(v), type: 'GRAPHQL' });
        seen.add(k.toLowerCase());
      }
    }
    if (environment.restHeaders) {
      for (const [k, v] of Object.entries(environment.restHeaders)) {
        if (!seen.has(k.toLowerCase())) {
          list.push({ key: k, value: String(v), type: 'REST' });
          seen.add(k.toLowerCase());
        }
      }
    }
    if (environment.customHeaders) {
      for (const [k, v] of Object.entries(environment.customHeaders)) {
        if (!seen.has(k.toLowerCase())) {
          const val = typeof v === 'object' && v !== null && 'value' in v ? String((v as any).value) : String(v);
          list.push({ key: k, value: val, type: 'CUSTOM' });
          seen.add(k.toLowerCase());
        }
      }
    }

    // Default common headers
    const common = ['Authorization', 'Store', 'Content-Type', 'Accept', 'x-request-id'];
    for (const c of common) {
      if (!seen.has(c.toLowerCase())) {
        list.push({ key: c, value: '(Cabecera estándar)', type: 'CUSTOM' });
      }
    }

    return list;
  }, [environment]);

  const handleAddHeaderRow = () => {
    setHeaderRows(prev => [
      ...prev,
      { id: `fhdr-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 5)}`, key: '', value: '' }
    ]);
  };

  const handleRemoveHeaderRow = (id: string) => {
    setHeaderRows(prev => prev.filter(r => r.id !== id));
  };

  const handleHeaderRowChange = (id: string, field: 'key' | 'value', val: string) => {
    setHeaderRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: val } : r)));
  };

  const handleToggleCancelHeader = (keyToToggle: string) => {
    const clean = keyToToggle.trim();
    if (!clean) return;
    setDisabledHeaders(prev => {
      const lower = clean.toLowerCase();
      const exists = prev.some(h => h.toLowerCase() === lower);
      if (exists) {
        return prev.filter(h => h.toLowerCase() !== lower);
      } else {
        return [...prev, clean];
      }
    });
  };

  const handleAddCustomCancelled = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newCancelledInput.trim();
    if (!clean) return;
    handleToggleCancelHeader(clean);
    setNewCancelledInput('');
  };

  const handleSave = () => {
    const finalCustom: Record<string, string> = {};
    for (const row of headerRows) {
      const k = row.key.trim();
      if (k) {
        finalCustom[k] = row.value.trim();
      }
    }
    const finalDisabled = disabledHeaders.map(h => h.trim()).filter(Boolean);
    onApply(finalCustom, finalDisabled);
    onClose();
  };

  if (!isOpen) return null;

  const totalCustomCount = headerRows.filter(r => r.key.trim().length > 0).length;
  const totalDisabledCount = disabledHeaders.length;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-[95vw] h-[95vh] max-w-[95vw] max-h-[95vh] flex flex-col shadow-2xl overflow-hidden transition-colors">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-orange-600 flex items-center justify-center text-white shadow-md shadow-orange-600/30">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>Cabeceras del Flujo Completo</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 font-mono font-bold">
                  {flowName || 'Flujo Actual'}
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Agrega cabeceras personalizadas o cancela cabeceras heredadas para todos los pasos de este flujo.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs Bar */}
        <div className="px-6 pt-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3 bg-slate-50/40 dark:bg-slate-950/20">
          <button
            onClick={() => setActiveTab('custom')}
            className={`pb-2.5 px-1 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'custom'
                ? 'border-orange-600 text-orange-600 dark:text-orange-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Agregar Cabeceras</span>
            {totalCustomCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-orange-500/15 text-orange-600 font-mono font-bold">
                {totalCustomCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('disabled')}
            className={`pb-2.5 px-1 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'disabled'
                ? 'border-rose-600 text-rose-600 dark:text-rose-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Ban className="w-3.5 h-3.5" />
            <span>Quitar / Cancelar Cabeceras</span>
            {totalDisabledCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-500/15 text-rose-600 font-mono font-bold">
                {totalDisabledCount}
              </span>
            )}
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === 'custom' ? (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800/40 text-xs text-orange-800 dark:text-orange-300 flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Cabeceras aplicadas a todo el flujo</p>
                  <p className="text-[11px] text-orange-700/80 dark:text-orange-300/80 mt-0.5">
                    Estas cabeceras se inyectarán en cada paso (tanto REST como GraphQL). Puedes usar variables interpolables como <code className="font-mono bg-orange-200/50 dark:bg-orange-900/50 px-1 rounded">{'{{token}}'}</code> o <code className="font-mono bg-orange-200/50 dark:bg-orange-900/50 px-1 rounded">{'{{CartId}}'}</code>.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {headerRows.map((row, idx) => (
                  <div key={row.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Nombre (ej. Store, X-Client-Version)"
                      value={row.key}
                      onChange={e => handleHeaderRowChange(row.id, 'key', e.target.value)}
                      className="flex-1 px-3 py-1.5 text-xs font-mono rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-orange-500"
                    />
                    <input
                      type="text"
                      placeholder='Valor (ej. default, {{token}})'
                      value={row.value}
                      onChange={e => handleHeaderRowChange(row.id, 'value', e.target.value)}
                      className="flex-1 px-3 py-1.5 text-xs font-mono rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-orange-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveHeaderRow(row.id)}
                      disabled={headerRows.length <= 1 && idx === 0 && !row.key && !row.value}
                      className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors disabled:opacity-20"
                      title="Eliminar cabecera"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={handleAddHeaderRow}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-orange-300 dark:border-orange-800/80 hover:bg-orange-50 dark:hover:bg-orange-950/20 text-orange-600 dark:text-orange-400 text-xs font-bold transition-colors w-full justify-center"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar otra cabecera de flujo</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/40 text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Cancelar / omitir cabeceras para todo el flujo</p>
                  <p className="text-[11px] text-rose-700/80 dark:text-rose-300/80 mt-0.5">
                    Las cabeceras marcadas en rojo <span className="font-bold">NUNCA</span> se enviarán en ninguna petición de este flujo, incluso si están definidas en el entorno o en las variantes.
                  </p>
                </div>
              </div>

              {/* Add custom cancelled header */}
              <form onSubmit={handleAddCustomCancelled} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Nombre de cabecera a cancelar (ej. Authorization, Store, Cookie)..."
                  value={newCancelledInput}
                  onChange={e => setNewCancelledInput(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-xs font-mono rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-rose-500"
                />
                <button
                  type="submit"
                  disabled={!newCancelledInput.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors disabled:opacity-40"
                >
                  <Ban className="w-3.5 h-3.5" />
                  <span>Cancelar</span>
                </button>
              </form>

              {/* Active Cancelled Chips */}
              {disabledHeaders.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Cabeceras Canceladas ({disabledHeaders.length}):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {disabledHeaders.map(hdr => (
                      <span
                        key={hdr}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400"
                      >
                        <Ban className="w-3 h-3 text-rose-500" />
                        <span>{hdr}</span>
                        <button
                          type="button"
                          onClick={() => handleToggleCancelHeader(hdr)}
                          className="hover:text-rose-800 dark:hover:text-rose-200 ml-0.5 p-0.5"
                          title="Restablecer / Dejar de cancelar"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggestions from Environment */}
              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <Info className="w-3.5 h-3.5" />
                  <span>Cabeceras del Entorno / Sugerencias para cancelar:</span>
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {envHeadersList.map(item => {
                    const isCancelled = disabledHeaders.some(h => h.toLowerCase() === item.key.toLowerCase());
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => handleToggleCancelHeader(item.key)}
                        className={`flex items-center justify-between p-2 rounded-xl border text-xs text-left transition-all ${
                          isCancelled
                            ? 'bg-rose-500/10 border-rose-500/40 text-rose-700 dark:text-rose-300 font-bold'
                            : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                        }`}
                      >
                        <div className="truncate mr-2">
                          <span className="font-mono block truncate">{item.key}</span>
                          <span className="text-[10px] text-slate-400 block truncate">{item.value}</span>
                        </div>
                        {isCancelled ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-600 text-white shrink-0">
                            Cancelado
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 hover:text-rose-500 shrink-0 font-semibold">
                            Cancelar
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-950/40">
          <div className="text-xs text-slate-500">
            {totalCustomCount} agregadas &bull; {totalDisabledCount} canceladas
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-sm transition-all"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Aplicar al Flujo</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
