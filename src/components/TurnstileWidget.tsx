import React, { useEffect, useRef, useState } from 'react';

interface TurnstileWidgetProps {
  siteKey: string;
  resetKey?: number;
  onTokenChange: (token: string) => void;
}

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove?: (widgetId: string) => void;
      reset?: (widgetId: string) => void;
    };
  }
}

export function TurnstileWidget({ siteKey, resetKey = 0, onTokenChange }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenChangeRef = useRef(onTokenChange);
  onTokenChangeRef.current = onTokenChange;
  const [widgetError, setWidgetError] = useState<string | null>(null);

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    setWidgetError(null);
    const scriptId = 'cf-turnstile-script';

    const mountWidget = () => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      if (widgetIdRef.current && window.turnstile.remove) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore cleanup errors
        }
        widgetIdRef.current = null;
      }
      containerRef.current.innerHTML = '';
      onTokenChangeRef.current('');
      setWidgetError(null);
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (tok: string) => {
          if (!cancelled) {
            setWidgetError(null);
            onTokenChangeRef.current(tok);
          }
        },
        'expired-callback': () => {
          if (!cancelled) onTokenChangeRef.current('');
        },
        'error-callback': (errCode?: string) => {
          if (!cancelled) {
            onTokenChangeRef.current('');
            setWidgetError(
              `Security verification could not load on this host${
                errCode ? ` (Turnstile ${errCode})` : ''
              }. Ensure this domain is added to your Cloudflare Turnstile widget allowlist.`
            );
          }
        },
      });
    };

    const handleLoadError = () => {
      if (!cancelled) {
        onTokenChangeRef.current('');
        setWidgetError('Security verification script could not be loaded.');
      }
    };

    let targetScript = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (window.turnstile) {
      mountWidget();
    } else if (targetScript) {
      targetScript.addEventListener('load', mountWidget);
      targetScript.addEventListener('error', handleLoadError);
    } else {
      const s = document.createElement('script');
      s.id = scriptId;
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.addEventListener('load', mountWidget);
      s.addEventListener('error', handleLoadError);
      document.head.appendChild(s);
      targetScript = s;
    }

    return () => {
      cancelled = true;
      if (targetScript) {
        targetScript.removeEventListener('load', mountWidget);
        targetScript.removeEventListener('error', handleLoadError);
      }
      if (widgetIdRef.current && window.turnstile?.remove) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore cleanup errors
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, resetKey]);

  return (
    <div className="pt-1 space-y-1.5">
      <div ref={containerRef} />
      {widgetError && (
        <p className="text-xs text-[#80545A] dark:text-[#B8838A]">{widgetError}</p>
      )}
    </div>
  );
}
