import React, { createContext, useCallback, useContext, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { createToastVariants, useAdaptiveMotion } from '../config/animations';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

const TOAST_LIFETIME_MS = 4200;

interface ToastOptions {
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  type: ToastType;
  actionLabel?: string;
  onAction?: () => void;
  durationMs: number;
}

interface ToastContextValue {
  showToast: (
    title: string,
    type?: ToastType,
    description?: string,
    options?: ToastOptions
  ) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const motionProfile = useAdaptiveMotion();
  const toastVariants = createToastVariants(motionProfile);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const showToast = useCallback(
    (
      title: string,
      type: ToastType = 'success',
      description?: string,
      options?: ToastOptions
    ) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const durationMs = options?.durationMs ?? TOAST_LIFETIME_MS;
      setToasts((prev) => [
        ...prev.slice(-3),
        {
          id,
          title,
          description,
          type,
          actionLabel: options?.actionLabel,
          onAction: options?.onAction,
          durationMs,
        },
      ]);
      setTimeout(() => {
        dismiss(id);
      }, durationMs);
    },
    [dismiss]
  );

  const iconMap: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />,
    error: <XCircle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0" />,
    warning: <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />,
    info: <Info className="h-5 w-5 text-sky-600 dark:text-sky-400 shrink-0" />,
  };

  const progressColorMap: Record<ToastType, string> = {
    success: 'from-emerald-600 to-emerald-400',
    error: 'from-rose-600 to-rose-400',
    warning: 'from-amber-600 to-amber-400',
    info: 'from-sky-600 to-sky-400',
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        className="no-print fixed top-4 right-4 z-[115] flex flex-col gap-2.5 max-w-sm w-[calc(100%-2rem)] pointer-events-none"
      >
        <AnimatePresence mode="popLayout">
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              layout
              variants={toastVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className={`pointer-events-auto relative overflow-hidden flex items-start gap-3 rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 ${
                motionProfile.enableBlur ? 'backdrop-blur-md' : ''
              } p-4 pb-4.5 shadow-xl shadow-emerald-950/10`}
            >
              {iconMap[toast.type]}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                  {toast.title}
                </p>
                {toast.description && (
                  <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {toast.description}
                  </p>
                )}
                {toast.actionLabel && toast.onAction && (
                  <button
                    type="button"
                    data-no-lift
                    onClick={() => {
                      toast.onAction?.();
                      dismiss(toast.id);
                    }}
                    className="mt-2 inline-flex items-center text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 underline underline-offset-2 transition-colors"
                  >
                    {toast.actionLabel}
                  </button>
                )}
              </div>
              <button
                type="button"
                data-no-lift
                onClick={() => dismiss(toast.id)}
                aria-label="Tutup notifikasi"
                className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>

              {/* Countdown progress bar (GPU scaleX only) */}
              <motion.div
                aria-hidden="true"
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: toast.durationMs / 1000, ease: 'linear' }}
                style={{ transformOrigin: '0% 50%' }}
                className={`absolute bottom-0 left-0 right-0 h-[3px] bg-gradient-to-r ${progressColorMap[toast.type]}`}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast harus digunakan di dalam ToastProvider');
  }
  return ctx;
}
