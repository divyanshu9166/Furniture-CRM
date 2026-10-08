'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

const AlertToastContext = createContext(null);

const DEFAULT_DURATION = 4500;
const MAX_TOASTS = 4;

const VARIANT_STYLES = {
  info: {
    container: 'border-info/30 bg-info-light/80 text-info',
    icon: Info,
  },
  success: {
    container: 'border-success/30 bg-success-light/80 text-success',
    icon: CheckCircle2,
  },
  warning: {
    container: 'border-warning/30 bg-warning-light/80 text-warning',
    icon: AlertTriangle,
  },
  danger: {
    container: 'border-danger/30 bg-danger-light/80 text-danger',
    icon: AlertCircle,
  },
};

function normalizeMessage(message) {
  if (typeof message === 'string') return message.trim();
  if (message instanceof Error) return (message.message || '').trim();
  if (message === null || message === undefined) return '';
  try {
    return JSON.stringify(message);
  } catch {
    return String(message).trim();
  }
}

function inferVariantFromMessage(rawMessage) {
  const message = (rawMessage || '').toLowerCase();

  if (message.includes('error') || message.includes('failed') || message.includes('unable') || message.includes('cannot')) {
    return 'danger';
  }

  if (message.includes('success') || message.includes('saved') || message.includes('sent') || message.includes('created')) {
    return 'success';
  }

  if (message.includes('warning') || message.includes('please') || message.includes('maximum') || message.includes('required')) {
    return 'warning';
  }

  return 'info';
}

export default function AlertToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const dismissToast = useCallback((id) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }

    setToasts((previous) => previous.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback((message, options = {}) => {
    const text = normalizeMessage(message);
    if (!text) return;

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const variant = options.variant || inferVariantFromMessage(text);
    const duration = typeof options.duration === 'number' ? options.duration : DEFAULT_DURATION;

    setToasts((previous) => {
      const next = [...previous, { id, text, variant }];
      return next.slice(-MAX_TOASTS);
    });

    if (duration > 0) {
      const timeout = window.setTimeout(() => dismissToast(id), duration);
      timersRef.current.set(id, timeout);
    }
  }, [dismissToast]);

  useEffect(() => {
    const timers = timersRef.current;

    return () => {
      timers.forEach((timeout) => window.clearTimeout(timeout));
      timers.clear();
    };
  }, []);

  useEffect(() => {
    const originalAlert = window.alert;

    window.alert = (message) => {
      notify(message, { variant: inferVariantFromMessage(normalizeMessage(message)) });
    };

    return () => {
      window.alert = originalAlert;
    };
  }, [notify]);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <AlertToastContext.Provider value={value}>
      {children}

      <div className="ui-toast-stack pointer-events-none fixed inset-x-0 bottom-3 z-[120] px-3 md:bottom-5 md:px-6">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-2 md:mr-0 md:max-w-md">
          {toasts.map((toast) => {
            const style = VARIANT_STYLES[toast.variant] || VARIANT_STYLES.info;
            const Icon = style.icon;

            return (
              <div
                key={toast.id}
                className={`pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-lg backdrop-blur-sm animate-[slide-up_0.24s_ease-out] ${style.container}`}
                role="status"
                aria-live="polite"
              >
                <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" />

                <p className="flex-1 min-w-0 break-words text-xs md:text-sm font-medium whitespace-pre-line leading-relaxed text-foreground">
                  {toast.text}
                </p>

                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  className="touch-target -mr-2 -mt-1 inline-flex h-8 w-8 items-center justify-center rounded-xl text-muted hover:bg-black/5 hover:text-foreground"
                  aria-label="Dismiss notification"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </AlertToastContext.Provider>
  );
}

export function useAlertToast() {
  const context = useContext(AlertToastContext);

  if (!context) {
    return {
      notify: (message) => {
        window.alert(message);
      },
    };
  }

  return context;
}
