import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Info, CheckCircle, XCircle, X } from 'lucide-react';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
}

export interface PromptOptions {
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
}

interface AlertOptions {
  title: string;
  message: string;
}

interface ToastMessage {
  id: string;
  text: string;
  type: 'success' | 'error' | 'info';
}

interface FeedbackContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
  alert: (options: AlertOptions | string) => Promise<void>;
  toast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const FeedbackContext = createContext<FeedbackContextType | null>(null);

export const FeedbackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Confirm state
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    options: ConfirmOptions;
    resolve: (val: boolean) => void;
  } | null>(null);

  // Alert state
  const [alertState, setAlertState] = useState<{
    isOpen: boolean;
    options: AlertOptions;
    resolve: () => void;
  } | null>(null);

  // Prompt state
  const [promptState, setPromptState] = useState<{
    isOpen: boolean;
    options: PromptOptions;
    resolve: (val: string | null) => void;
  } | null>(null);
  const [promptValue, setPromptValue] = useState('');

  // Toast state
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Lock body scroll when confirm, alert, or prompt modal is open
  useEffect(() => {
    if (confirmState || alertState || promptState) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [confirmState, alertState, promptState]);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise(resolve => {
      setConfirmState({
        isOpen: true,
        options,
        resolve
      });
    });
  }, []);

  const alert = useCallback((options: AlertOptions | string): Promise<void> => {
    const normalized: AlertOptions =
      typeof options === 'string' ? { title: 'Notificación', message: options } : options;
    return new Promise(resolve => {
      setAlertState({
        isOpen: true,
        options: normalized,
        resolve
      });
    });
  }, []);

  const prompt = useCallback((options: PromptOptions): Promise<string | null> => {
    return new Promise(resolve => {
      setPromptValue(options.defaultValue || '');
      setPromptState({
        isOpen: true,
        options,
        resolve
      });
    });
  }, []);

  const toast = useCallback((text: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
    setToasts(prev => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3800);
  }, []);

  const handleConfirmClose = (result: boolean) => {
    if (confirmState) {
      confirmState.resolve(result);
      setConfirmState(null);
    }
  };

  const handleAlertClose = () => {
    if (alertState) {
      alertState.resolve();
      setAlertState(null);
    }
  };

  const handlePromptClose = (result: string | null) => {
    if (promptState) {
      promptState.resolve(result);
      setPromptState(null);
      setPromptValue('');
    }
  };

  return (
    <FeedbackContext.Provider value={{ confirm, alert, prompt, toast }}>
      {children}

      {/* Floating Toasts */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`pointer-events-auto p-3.5 rounded-2xl shadow-xl border flex items-center justify-between gap-3 text-xs font-semibold backdrop-blur-md transition-all animate-in fade-in slide-in-from-bottom-2 ${
              t.type === 'success'
                ? 'bg-emerald-950/90 dark:bg-emerald-950/90 text-emerald-100 border-emerald-500/30'
                : t.type === 'error'
                ? 'bg-rose-950/90 dark:bg-rose-950/90 text-rose-100 border-rose-500/30'
                : 'bg-slate-900/90 dark:bg-slate-900/90 text-slate-100 border-slate-700/40'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {t.type === 'success' && <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />}
              {t.type === 'error' && <XCircle className="w-4 h-4 text-rose-400 shrink-0" />}
              {t.type === 'info' && <Info className="w-4 h-4 text-orange-400 shrink-0" />}
              <span>{t.text}</span>
            </div>
            <button
              onClick={() => setToasts(prev => prev.filter(item => item.id !== t.id))}
              className="text-slate-400 hover:text-white p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Custom Confirm Modal */}
      {confirmState && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 scale-in-95 duration-150 transition-colors">
            <div className="flex items-start gap-3.5">
              <div
                className={`p-2.5 rounded-xl shrink-0 ${
                  confirmState.options.isDestructive
                    ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                    : 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20'
                }`}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {confirmState.options.title}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 whitespace-pre-line leading-relaxed">
                  {confirmState.options.message}
                </p>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => handleConfirmClose(false)}
                className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                {confirmState.options.cancelText || 'Cancelar'}
              </button>
              <button
                type="button"
                onClick={() => handleConfirmClose(true)}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold text-white shadow-sm transition-all ${
                  confirmState.options.isDestructive
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-orange-600 hover:bg-orange-700'
                }`}
              >
                {confirmState.options.confirmText || 'Confirmar'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Custom Alert Modal */}
      {alertState && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 scale-in-95 duration-150 transition-colors">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl shrink-0 bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
                <Info className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {alertState.options.title}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 whitespace-pre-line leading-relaxed">
                  {alertState.options.message}
                </p>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={handleAlertClose}
                className="px-4 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-sm transition-all"
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Custom Prompt Modal */}
      {promptState && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 scale-in-95 duration-150 transition-colors">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl shrink-0 bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
                <Info className="w-5 h-5" />
              </div>
              <div className="space-y-1 flex-1">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {promptState.options.title}
                </h3>
                {promptState.options.message && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 whitespace-pre-line leading-relaxed">
                    {promptState.options.message}
                  </p>
                )}
              </div>
            </div>

            <form
              onSubmit={e => {
                e.preventDefault();
                handlePromptClose(promptValue);
              }}
              className="space-y-4"
            >
              <input
                type="text"
                autoFocus
                value={promptValue}
                onChange={e => setPromptValue(e.target.value)}
                placeholder={promptState.options.placeholder || 'Escribe aquí...'}
                className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 focus:border-orange-500 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 outline-none shadow-xs font-medium"
              />

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handlePromptClose(null)}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  {promptState.options.cancelText || 'Cancelar'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-sm transition-all"
                >
                  {promptState.options.confirmText || 'Aceptar'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </FeedbackContext.Provider>
  );
};

export const useFeedback = () => {
  const context = useContext(FeedbackContext);
  if (!context) {
    throw new Error('useFeedback must be used within a FeedbackProvider');
  }
  return context;
};
