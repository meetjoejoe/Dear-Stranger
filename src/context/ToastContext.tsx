import React, { createContext, useCallback, useContext, useState } from 'react';
import { X } from 'lucide-react';

interface ToastItem {
  id: string;
  type: 'info' | 'success' | 'error';
  message: string;
}

interface ToastContextValue {
  showToast: (message: string, type?: 'info' | 'success' | 'error') => void;
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-3), { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm shadow-sm transition-all ${
              t.type === 'error'
                ? 'bg-[#FFFFFF] dark:bg-[#201E1B] border-[#80545A] text-[#252525] dark:text-[#EAE6DF]'
                : 'bg-[#FFFFFF] dark:bg-[#201E1B] border-[#E8E5DF] dark:border-[#332F2A] text-[#252525] dark:text-[#EAE6DF]'
            }`}
          >
            <div className="leading-snug">
              <span className="font-medium mr-1.5">
                {t.type === 'error' ? 'Notice:' : t.type === 'success' ? 'Done:' : 'Note:'}
              </span>
              {t.message}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="text-[#77736D] hover:text-[#252525] dark:text-[#A19B92] dark:hover:text-[#EAE6DF] p-0.5 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
