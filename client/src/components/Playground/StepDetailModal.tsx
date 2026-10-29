import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, Check, Terminal, ArrowUpRight, ArrowDownLeft, ShieldCheck, CheckCircle2, XCircle } from 'lucide-react';
import { StepExecutionResult } from '../../types';

interface StepDetailModalProps {
  step: StepExecutionResult | null;
  onClose: () => void;
}

export const StepDetailModal: React.FC<StepDetailModalProps> = ({ step, onClose }) => {
  const [copiedTab, setCopiedTab] = useState<'request' | 'response' | null>(null);
  const [activeTab, setActiveTab] = useState<'response' | 'tests' | 'request' | 'headers'>(() => {
    return (step?.testResults || []).some(t => !t.passed) ? 'tests' : 'response';
  });

  // Lock body scroll and handle Escape key
  useEffect(() => {
    if (step) {
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
  }, [step, onClose]);

  useEffect(() => {
    if (step && (step.testResults || []).some(t => !t.passed)) {
      setActiveTab('tests');
    } else {
      setActiveTab('response');
    }
  }, [step]);

  if (!step) return null;

  const handleCopy = (text: string, tab: 'request' | 'response') => {
    navigator.clipboard.writeText(text);
    setCopiedTab(tab);
    setTimeout(() => setCopiedTab(null), 2000);
  };

  const responseJson = JSON.stringify(
    step.errors && step.errors.length > 0 ? { errors: step.errors } : { data: step.responsePreview },
    null,
    2
  );

  const headersJson = JSON.stringify(step.requestPayload?.headers || {}, null, 2);
  const testResults = step.testResults || [];

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden transition-colors">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {step.category}: {step.variantName}
            </span>
            <span
              className={`text-[11px] px-2 py-0.5 rounded font-mono font-semibold ${
                step.status >= 200 && step.status < 300 && (!step.errors || step.errors.length === 0)
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
              }`}
            >
              HTTP {step.status} • {step.durationMs}ms
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="px-5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-4 bg-slate-50 dark:bg-slate-950/40">
          <button
            onClick={() => setActiveTab('response')}
            className={`flex items-center gap-1.5 py-2.5 border-b-2 text-xs font-semibold transition-all ${
              activeTab === 'response'
                ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <ArrowDownLeft className="w-3.5 h-3.5" />
            Response
          </button>
          <button
            onClick={() => setActiveTab('tests')}
            className={`flex items-center gap-1.5 py-2.5 border-b-2 text-xs font-semibold transition-all ${
              activeTab === 'tests'
                ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Pruebas ({testResults.length})</span>
            {testResults.some(t => !t.passed) && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-rose-500 text-white font-mono">
                {testResults.filter(t => !t.passed).length} fallidas
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('request')}
            className={`flex items-center gap-1.5 py-2.5 border-b-2 text-xs font-semibold transition-all ${
              activeTab === 'request'
                ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            Request (Query & Vars)
          </button>
          <button
            onClick={() => setActiveTab('headers')}
            className={`flex items-center gap-1.5 py-2.5 border-b-2 text-xs font-semibold transition-all ${
              activeTab === 'headers'
                ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            Headers
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-auto p-4 bg-slate-50 dark:bg-slate-950 font-mono text-xs">
          {activeTab === 'response' && (
            <div className="relative">
              <button
                onClick={() => handleCopy(responseJson, 'response')}
                className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-sans"
              >
                {copiedTab === 'response' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                <span>Copiar</span>
              </button>
              <pre className="p-3 rounded-lg overflow-x-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                {responseJson}
              </pre>
            </div>
          )}

          {activeTab === 'tests' && (
            <div className="space-y-2 font-sans">
              {testResults.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No se ejecutaron pruebas para esta petición.
                </div>
              ) : (
                testResults.map(test => (
                  <div
                    key={test.id}
                    className={`p-3 rounded-xl border flex items-start gap-3 ${
                      test.passed
                        ? 'bg-emerald-50/20 dark:bg-emerald-950/10 border-emerald-500/20'
                        : 'bg-rose-50/30 dark:bg-rose-950/20 border-rose-500/30'
                    }`}
                  >
                    <div className="mt-0.5">
                      {test.passed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-500" />
                      )}
                    </div>
                    <div className="flex-1 space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{test.name}</span>
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                            test.passed ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600'
                          }`}
                        >
                          {test.passed ? 'PASÓ' : 'FALLÓ'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400">{test.message}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'request' && (
            <div className="space-y-3">
              <pre className="p-3 rounded-lg bg-white dark:bg-slate-900 text-orange-700 dark:text-orange-300 border border-slate-200 dark:border-slate-800 overflow-x-auto whitespace-pre-wrap">
                {step.requestPayload?.query}
              </pre>

              <div>
                <span className="text-[11px] font-sans text-slate-400 block mb-1">Variables inyectadas:</span>
                <pre className="p-3 rounded-lg bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 border border-slate-200 dark:border-slate-800 overflow-x-auto">
                  {JSON.stringify(step.requestPayload?.variables || {}, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {activeTab === 'headers' && (
            <pre className="p-3 rounded-lg bg-white dark:bg-slate-900 text-sky-700 dark:text-sky-300 border border-slate-200 dark:border-slate-800 overflow-x-auto">
              {headersJson}
            </pre>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
