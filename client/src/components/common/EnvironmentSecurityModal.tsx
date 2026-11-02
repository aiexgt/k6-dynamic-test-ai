import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ShieldAlert, AlertTriangle, X, Lock, CheckCircle2, ArrowRight } from 'lucide-react';
import { Environment } from '../../types';

interface EnvironmentSecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  environment: Environment;
  mode: 'FLOW' | 'STEP';
  flowName?: string;
  stepName?: string;
}

export const EnvironmentSecurityModal: React.FC<EnvironmentSecurityModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  environment,
  mode,
  flowName,
  stepName
}) => {
  const [inputCode, setInputCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setInputCode('');
      setErrorMessage(null);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const expectedCode = environment.securityCode?.trim() || environment.name.trim();
  const isCustomCode = !!environment.securityCode?.trim();

  const handleVerifyAndConfirm = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (mode === 'STEP') {
      onConfirm();
      onClose();
      return;
    }

    // Mode FLOW: check code / name
    const normalizedInput = inputCode.trim().toLowerCase();
    const normalizedExpected = expectedCode.toLowerCase();

    if (normalizedInput !== normalizedExpected) {
      setErrorMessage(
        isCustomCode
          ? 'El código de seguridad ingresado es incorrecto.'
          : `Debes escribir exactamente el nombre del entorno: "${environment.name}".`
      );
      return;
    }

    setErrorMessage(null);
    onConfirm();
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl ${
              mode === 'FLOW'
                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                : 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30'
            }`}>
              {mode === 'FLOW' ? <ShieldAlert className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {mode === 'FLOW' ? 'Entorno Protegido: Autorización' : 'Confirmar Ejecución en Entorno'}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {mode === 'FLOW'
                  ? 'Se requiere validación para ejecutar el flujo completo'
                  : 'Petición individual en ambiente protegido'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Environment Details Card */}
        <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              {environment.name}
            </span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
              <Lock className="w-2.5 h-2.5" />
              Protegido
            </span>
          </div>

          <div className="space-y-1 font-mono text-[11px]">
            <p className="text-slate-600 dark:text-slate-400 truncate flex items-center gap-1.5">
              <span className="text-[9px] font-bold uppercase text-orange-500 bg-orange-500/10 px-1 rounded">GraphQL</span>
              <span className="truncate">{environment.magentoUrl}</span>
            </p>
            {environment.magentoRestUrl && (
              <p className="text-slate-600 dark:text-slate-400 truncate flex items-center gap-1.5">
                <span className="text-[9px] font-bold uppercase text-blue-500 bg-blue-500/10 px-1 rounded">REST</span>
                <span className="truncate">{environment.magentoRestUrl}</span>
              </p>
            )}
          </div>

          {(flowName || stepName) && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 text-[11px]">
              <span className="text-slate-400">{mode === 'FLOW' ? 'Flujo:' : 'Paso:'} </span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {flowName || stepName}
              </span>
            </div>
          )}
        </div>

        {/* Mode Specific Body */}
        {mode === 'FLOW' ? (
          <form onSubmit={handleVerifyAndConfirm} className="space-y-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                {isCustomCode ? (
                  <span>Ingresa el código de seguridad configurado:</span>
                ) : (
                  <span>
                    Escribe el nombre del entorno <code className="text-amber-600 dark:text-amber-400 font-bold font-mono">"{environment.name}"</code> para confirmar:
                  </span>
                )}
              </label>
              <input
                type={isCustomCode ? 'password' : 'text'}
                value={inputCode}
                onChange={e => {
                  setInputCode(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                autoFocus
                placeholder={isCustomCode ? 'Código de seguridad' : environment.name}
                className={`w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border ${
                  errorMessage
                    ? 'border-rose-500 focus:ring-rose-500'
                    : 'border-slate-200 dark:border-slate-800 focus:ring-amber-500'
                } text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 font-mono`}
              />
              {errorMessage && (
                <p className="text-[11px] text-rose-500 dark:text-rose-400 font-medium animate-in fade-in">
                  {errorMessage}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!inputCode.trim()}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white shadow-sm transition-all"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Autorizar y Ejecutar</span>
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Estás a punto de disparar una petición individual hacia este ambiente protegido. ¿Deseas continuar?
            </p>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-xl bg-orange-600 hover:bg-orange-700 text-white shadow-sm transition-all"
              >
                <span>Aceptar y Ejecutar</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
