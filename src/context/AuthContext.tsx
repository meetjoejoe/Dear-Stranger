import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { CategoryDTO, PlatformConfigDTO, ProfileDTO } from '../shared/types.ts';
import { apiFetch } from '../lib/api.ts';
import { DEFAULT_CATEGORIES } from '../lib/clientSandboxFallback.ts';
import { getBrowserSupabaseClient } from '../lib/supabase.ts';
import {
  classifyOAuthError,
  extractOAuthParamsFromUrl,
  isEmbeddedIframe,
  OAUTH_MODE_KEY,
  OAUTH_PENDING_AGE18_KEY,
  OAUTH_RETURN_TO_KEY,
  sanitizeReturnPath,
} from '../lib/oauthUtils.ts';

const SANDBOX_TOKEN_KEY = 'ds_sandbox_token';
const THEME_KEY = 'ds_theme';

export interface GoogleOAuthLaunchResult {
  externalRedirectUrl?: string;
}

interface AuthContextValue {
  config: PlatformConfigDTO | null;
  categories: CategoryDTO[];
  token: string | null;
  profile: ProfileDTO | null;
  loading: boolean;
  theme: 'light' | 'dark';
  unreadCount: number;
  authPromptOpen: boolean;
  authPromptReason: string | null;
  oauthError: string | null;
  clearOAuthError: () => void;
  setTheme: (theme: 'light' | 'dark') => Promise<void>;
  toggleTheme: () => Promise<void>;
  openAuthPrompt: (reason?: string) => void;
  closeAuthPrompt: () => void;
  signInAnonymously: (confirmAge18Plus: boolean, turnstileToken?: string) => Promise<void>;
  signInWithGoogle: (options?: {
    confirmAge18Plus?: boolean;
    returnTo?: string;
  }) => Promise<GoogleOAuthLaunchResult | void>;
  linkGoogleAccount: (returnTo?: string) => Promise<GoogleOAuthLaunchResult | void>;
  confirmAge18Plus: () => Promise<ProfileDTO>;
  signInWithRecoveryEmail: (email: string, turnstileToken?: string) => Promise<void>;
  linkRecoveryEmail: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshConfig: () => Promise<void>;
  refreshCategories: () => Promise<void>;
  refreshUnreadCount: () => Promise<void>;
  toggleSandboxAdmin: (enabled: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<PlatformConfigDTO | null>(null);
  const [categories, setCategories] = useState<CategoryDTO[]>(DEFAULT_CATEGORIES);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [authPromptOpen, setAuthPromptOpen] = useState(false);
  const [authPromptReason, setAuthPromptReason] = useState<string | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [theme, setThemeState] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'dark' ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const clearOAuthError = useCallback(() => {
    setOauthError(null);
  }, []);

  const fetchUnread = useCallback(async (activeToken: string | null) => {
    if (!activeToken) {
      setUnreadCount(0);
      return;
    }
    try {
      const dash = await apiFetch<{ notifications: Array<{ isRead: boolean }> }>('/api/dashboard', {
        token: activeToken,
      });
      setUnreadCount(
        Array.isArray(dash?.notifications)
          ? dash.notifications.filter((n) => !n.isRead).length
          : 0
      );
    } catch {
      setUnreadCount(0);
    }
  }, []);

  const refreshCategories = useCallback(async () => {
    try {
      const res = await apiFetch<{ categories: CategoryDTO[] }>('/api/categories');
      if (Array.isArray(res?.categories) && res.categories.length > 0) {
        setCategories(res.categories);
      }
    } catch {
      // keep existing categories
    }
  }, []);

  const refreshConfig = useCallback(async () => {
    const cfg = await apiFetch<PlatformConfigDTO>('/api/config');
    setConfig(cfg);
    return cfg;
  }, []);

  const loadSessionFromToken = useCallback(
    async (activeToken: string | null): Promise<ProfileDTO | null> => {
      if (!activeToken) {
        setToken(null);
        setProfile(null);
        setUnreadCount(0);
        return null;
      }
      try {
        const res = await apiFetch<{ profile: ProfileDTO | null }>('/api/me', {
          token: activeToken,
        });
        if (!res.profile) {
          setToken(null);
          setProfile(null);
          setUnreadCount(0);
          return null;
        }
        let nextProfile = res.profile;
        const pendingAge = sessionStorage.getItem(OAUTH_PENDING_AGE18_KEY) === '1';
        if (pendingAge && !nextProfile.ageConfirmedAt) {
          try {
            const patched = await apiFetch<{ profile: ProfileDTO }>('/api/me', {
              method: 'PATCH',
              token: activeToken,
              body: JSON.stringify({ confirmAge18Plus: true }),
            });
            nextProfile = patched.profile;
          } catch {
            // user can confirm on next step if needed
          } finally {
            sessionStorage.removeItem(OAUTH_PENDING_AGE18_KEY);
          }
        } else if (pendingAge) {
          sessionStorage.removeItem(OAUTH_PENDING_AGE18_KEY);
        }

        setToken(activeToken);
        setProfile(nextProfile);
        if (nextProfile.preferredTheme) {
          setThemeState(nextProfile.preferredTheme);
        }
        await fetchUnread(activeToken);
        return nextProfile;
      } catch {
        setToken(null);
        setProfile(null);
        setUnreadCount(0);
        return null;
      }
    },
    [fetchUnread]
  );

  useEffect(() => {
    let mounted = true;
    let subscription: { unsubscribe: () => void } | null = null;

    async function init() {
      try {
        // Capture any fallback OAuth errors landing on non-callback routes
        if (
          typeof window !== 'undefined' &&
          !window.location.pathname.startsWith('/auth/callback')
        ) {
          const urlMeta = extractOAuthParamsFromUrl(
            window.location.search,
            window.location.hash
          );
          if (urlMeta.error) {
            const parsed = classifyOAuthError(
              urlMeta.error,
              urlMeta.errorCode,
              urlMeta.errorDescription,
              sessionStorage.getItem(OAUTH_MODE_KEY) === 'link' ? 'link' : 'signin'
            );
            if (mounted) {
              setOauthError(parsed.message);
            }
            sessionStorage.removeItem(OAUTH_MODE_KEY);
            sessionStorage.removeItem(OAUTH_PENDING_AGE18_KEY);
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        }

        const cfg = await apiFetch<PlatformConfigDTO>('/api/config');
        if (!mounted) return;
        setConfig(cfg);

        // Fetch categories independently when DB is ready (or sandbox mode) so pending migrations never spam 503s or block auth/config
        if (!cfg.supabaseConfigured || cfg.supabaseSchemaReady !== false) {
          apiFetch<{ categories: CategoryDTO[] }>('/api/categories')
            .then((catRes) => {
              if (mounted && Array.isArray(catRes?.categories) && catRes.categories.length > 0) {
                setCategories(catRes.categories);
              }
            })
            .catch(() => {
              // keep default fallback labels in selector until schema is ready
            });
        }

        if (cfg.supabaseConfigured && cfg.supabaseUrl && cfg.supabasePublishableKey) {
          const sb = getBrowserSupabaseClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
          if (sb) {
            const { data } = await sb.auth.getSession();
            await loadSessionFromToken(data.session?.access_token ?? null);

            const listener = sb.auth.onAuthStateChange((_event, session) => {
              void loadSessionFromToken(session?.access_token ?? null);
            });
            subscription = listener.data.subscription;
          }
        } else {
          const savedSandboxToken = sessionStorage.getItem(SANDBOX_TOKEN_KEY);
          if (savedSandboxToken) {
            await loadSessionFromToken(savedSandboxToken);
          }
        }
      } catch {
        // handled cleanly
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void init();
    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [loadSessionFromToken]);

  const setTheme = useCallback(
    async (next: 'light' | 'dark') => {
      setThemeState(next);
      if (token) {
        try {
          const res = await apiFetch<{ profile: ProfileDTO }>('/api/me', {
            method: 'PATCH',
            token,
            body: JSON.stringify({ preferredTheme: next }),
          });
          setProfile(res.profile);
        } catch {
          // theme already persisted locally
        }
      }
    },
    [token]
  );

  const toggleTheme = useCallback(async () => {
    await setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [setTheme, theme]);

  const openAuthPrompt = useCallback((reason?: string) => {
    setAuthPromptReason(reason || null);
    setAuthPromptOpen(true);
  }, []);

  const closeAuthPrompt = useCallback(() => {
    setAuthPromptOpen(false);
    setAuthPromptReason(null);
  }, []);

  const signInAnonymously = useCallback(
    async (confirmAge18PlusFlag: boolean, turnstileToken?: string) => {
      if (!confirmAge18PlusFlag) {
        throw new Error('Please confirm that you are 18 years or older.');
      }

      const activeConfig = config || (await refreshConfig().catch(() => null));

      if (activeConfig?.supabaseConfigured) {
        const sb = getBrowserSupabaseClient(
          activeConfig.supabaseUrl,
          activeConfig.supabasePublishableKey
        );
        if (!sb) throw new Error('Supabase client is unavailable.');
        const { data, error } = await sb.auth.signInAnonymously({
          options: turnstileToken ? { captchaToken: turnstileToken } : undefined,
        });
        if (error || !data.session) {
          const msg = error?.message || '';
          if (
            msg.toLowerCase().includes('anonymous sign-ins are disabled') ||
            (error as { code?: string } | null)?.code === 'anonymous_provider_disabled'
          ) {
            throw new Error(
              'Anonymous sign-ins are currently disabled in the connected Supabase project. Enable Anonymous Sign-Ins under Supabase Authentication -> Providers (see /setup).'
            );
          }
          throw new Error(msg || 'Could not start an anonymous session.');
        }
        const accessToken = data.session.access_token;
        const updated = await apiFetch<{ profile: ProfileDTO }>('/api/me', {
          method: 'PATCH',
          token: accessToken,
          body: JSON.stringify({ confirmAge18Plus: true, preferredTheme: theme }),
        });
        setToken(accessToken);
        setProfile(updated.profile);
        await fetchUnread(accessToken);
        setAuthPromptOpen(false);
        return;
      }

      const created = await apiFetch<{ token: string; profile: ProfileDTO }>('/api/sandbox/session', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      sessionStorage.setItem(SANDBOX_TOKEN_KEY, created.token);
      const updated = await apiFetch<{ profile: ProfileDTO }>('/api/me', {
        method: 'PATCH',
        token: created.token,
        body: JSON.stringify({ confirmAge18Plus: true, preferredTheme: theme }),
      });
      setToken(created.token);
      setProfile(updated.profile);
      await fetchUnread(created.token);
      setAuthPromptOpen(false);
    },
    [config, fetchUnread, refreshConfig, theme]
  );

  const waitForPopupOAuthCallback = useCallback(
    async (
      popup: Window,
      sb: NonNullable<ReturnType<typeof getBrowserSupabaseClient>>,
      mode: 'signin' | 'link',
      flowId?: string
    ): Promise<ProfileDTO | null> => {
      return new Promise<ProfileDTO | null>((resolve, reject) => {
        let settled = false;
        const cleanup = () => {
          window.removeEventListener('message', onMessage);
          window.clearInterval(closeCheck);
          window.clearTimeout(timeoutId);
        };

        const finishError = (message: string) => {
          if (settled) return;
          settled = true;
          cleanup();
          sessionStorage.removeItem(OAUTH_MODE_KEY);
          sessionStorage.removeItem(OAUTH_PENDING_AGE18_KEY);
          reject(new Error(message));
        };

        const finishSuccess = async (accessToken: string | null): Promise<ProfileDTO | null> => {
          if (settled) return null;
          settled = true;
          cleanup();
          sessionStorage.removeItem(OAUTH_MODE_KEY);
          const loaded = accessToken ? await loadSessionFromToken(accessToken) : null;
          resolve(loaded);
          return loaded;
        };

        const onMessage = (event: MessageEvent) => {
          if (event.origin !== window.location.origin) return;
          const payload = event.data as
            | { type?: string; search?: string; hash?: string }
            | undefined;
          if (!payload || payload.type !== 'DS_OAUTH_CALLBACK') return;

          const search = typeof payload.search === 'string' ? payload.search : '';
          const hash = typeof payload.hash === 'string' ? payload.hash : '';
          const urlMeta = extractOAuthParamsFromUrl(search, hash);

          if (urlMeta.error) {
            const classified = classifyOAuthError(
              urlMeta.error,
              urlMeta.errorCode,
              urlMeta.errorDescription,
              mode
            );
            finishError(classified.message);
            return;
          }

          const sp = new URLSearchParams(search);
          const code = sp.get('code');
          const returnedFlowId = sp.get('flow_id') || flowId;

          if (code) {
            void sb.auth
              .exchangeCodeForSession(code, returnedFlowId ? { flowId: returnedFlowId } : undefined)
              .then(async ({ data, error }) => {
                if (error || !data?.session) {
                  const classified = classifyOAuthError(
                    error?.message || 'oauth_exchange_failed',
                    (error as { code?: string } | null)?.code,
                    error?.message,
                    mode
                  );
                  finishError(classified.message);
                  return;
                }
                await finishSuccess(data.session.access_token);
              })
              .catch((err) => {
                finishError(
                  err instanceof Error ? err.message : 'Could not complete Google authentication.'
                );
              });
            return;
          }

          const hp = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
          const accessToken = hp.get('access_token');
          const refreshToken = hp.get('refresh_token');
          if (accessToken && refreshToken) {
            void sb.auth
              .setSession({ access_token: accessToken, refresh_token: refreshToken })
              .then(async ({ data, error }) => {
                if (error || !data?.session) {
                  finishError(error?.message || 'Could not establish session.');
                  return;
                }
                await finishSuccess(data.session.access_token);
              });
            return;
          }

          finishError('No authentication code was returned from Google.');
        };

        window.addEventListener('message', onMessage);

        const closeCheck = window.setInterval(() => {
          if (popup.closed) {
            // Allow 350ms grace in case postMessage arrived right before window.close()
            window.setTimeout(() => {
              if (!settled) {
                finishError(
                  mode === 'link'
                    ? 'Google connection window was closed before completing.'
                    : 'Google sign-in window was closed before completing.'
                );
              }
            }, 350);
          }
        }, 400);

        const timeoutId = window.setTimeout(() => {
          if (!settled) {
            try {
              if (!popup.closed) popup.close();
            } catch {
              // ignore
            }
            finishError('Google sign-in timed out. Please try again.');
          }
        }, 180_000);
      });
    },
    [loadSessionFromToken]
  );

  const signInWithGoogle = useCallback(
    async (options?: {
      confirmAge18Plus?: boolean;
      returnTo?: string;
    }): Promise<GoogleOAuthLaunchResult | void> => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new Error('You appear to be offline. Reconnect to the internet to sign in with Google.');
      }

      const inIframe = isEmbeddedIframe();
      // Synchronously reserve popup inside user click handler before async work when embedded
      const popup = inIframe
        ? window.open(
            'about:blank',
            'dear_stranger_google_oauth',
            'popup=yes,width=520,height=680,resizable=yes,scrollbars=yes'
          )
        : null;

      const activeConfig = config || (await refreshConfig().catch(() => null));
      if (!activeConfig?.supabaseConfigured) {
        try {
          popup?.close();
        } catch {
          // ignore
        }
        throw new Error(
          'Google sign-in requires Supabase Auth to be configured. Use "Continue Anonymously" in Sandbox Preview Mode.'
        );
      }

      const sb = getBrowserSupabaseClient(
        activeConfig.supabaseUrl,
        activeConfig.supabasePublishableKey
      );
      if (!sb) {
        try {
          popup?.close();
        } catch {
          // ignore
        }
        throw new Error('Supabase client is unavailable.');
      }

      const safeReturnTo = sanitizeReturnPath(
        options?.returnTo ||
          (typeof window !== 'undefined'
            ? `${window.location.pathname}${window.location.search}`
            : '/dashboard'),
        '/dashboard'
      );

      sessionStorage.setItem(OAUTH_RETURN_TO_KEY, safeReturnTo);
      sessionStorage.setItem(OAUTH_MODE_KEY, 'signin');
      if (options?.confirmAge18Plus) {
        sessionStorage.setItem(OAUTH_PENDING_AGE18_KEY, '1');
      } else {
        sessionStorage.removeItem(OAUTH_PENDING_AGE18_KEY);
      }

      const redirectTo = `${window.location.origin}/auth/callback`;

      const { data, error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          scopes: 'openid email profile',
          ...(inIframe ? { skipBrowserRedirect: true } : {}),
        },
      });

      if (error) {
        try {
          popup?.close();
        } catch {
          // ignore
        }
        sessionStorage.removeItem(OAUTH_MODE_KEY);
        sessionStorage.removeItem(OAUTH_PENDING_AGE18_KEY);
        const classified = classifyOAuthError(
          error.message,
          (error as { code?: string }).code,
          error.message,
          'signin'
        );
        throw new Error(classified.message);
      }

      if (inIframe && data?.url) {
        if (popup && !popup.closed) {
          popup.location.href = data.url;
          const loaded = await waitForPopupOAuthCallback(
            popup,
            sb,
            'signin',
            (data as { flowId?: string } | null)?.flowId
          );
          if (loaded?.ageConfirmedAt) {
            setAuthPromptOpen(false);
          }
          return;
        }
        return { externalRedirectUrl: data.url };
      }
    },
    [config, refreshConfig, waitForPopupOAuthCallback]
  );

  const linkGoogleAccount = useCallback(
    async (returnTo = '/dashboard?tab=account'): Promise<GoogleOAuthLaunchResult | void> => {
      if (!token || !profile) {
        throw new Error('Please start or sign in to an account before connecting Google.');
      }
      if (profile.googleLinked) {
        throw new Error('A Google account is already connected to this identity.');
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new Error('You appear to be offline. Reconnect to the internet to connect Google.');
      }

      const inIframe = isEmbeddedIframe();
      const popup = inIframe
        ? window.open(
            'about:blank',
            'dear_stranger_google_oauth',
            'popup=yes,width=520,height=680,resizable=yes,scrollbars=yes'
          )
        : null;

      const activeConfig = config || (await refreshConfig().catch(() => null));
      if (!activeConfig?.supabaseConfigured) {
        try {
          popup?.close();
        } catch {
          // ignore
        }
        throw new Error(
          'Connecting a Google account requires Supabase Auth credentials to be configured.'
        );
      }

      const sb = getBrowserSupabaseClient(
        activeConfig.supabaseUrl,
        activeConfig.supabasePublishableKey
      );
      if (!sb) {
        try {
          popup?.close();
        } catch {
          // ignore
        }
        throw new Error('Supabase client is unavailable.');
      }

      const safeReturnTo = sanitizeReturnPath(returnTo, '/dashboard?tab=account');
      sessionStorage.setItem(OAUTH_RETURN_TO_KEY, safeReturnTo);
      sessionStorage.setItem(OAUTH_MODE_KEY, 'link');

      const redirectTo = `${window.location.origin}/auth/callback`;

      const { data, error } = await sb.auth.linkIdentity({
        provider: 'google',
        options: {
          redirectTo,
          scopes: 'openid email profile',
          ...(inIframe ? { skipBrowserRedirect: true } : {}),
        },
      });

      if (error) {
        try {
          popup?.close();
        } catch {
          // ignore
        }
        sessionStorage.removeItem(OAUTH_MODE_KEY);
        const classified = classifyOAuthError(
          error.message,
          (error as { code?: string }).code,
          error.message,
          'link'
        );
        throw new Error(classified.message);
      }

      if (inIframe && data?.url) {
        if (popup && !popup.closed) {
          popup.location.href = data.url;
          await waitForPopupOAuthCallback(
            popup,
            sb,
            'link',
            (data as { flowId?: string } | null)?.flowId
          );
          return;
        }
        return { externalRedirectUrl: data.url };
      }
    },
    [config, profile, refreshConfig, token, waitForPopupOAuthCallback]
  );

  const confirmAge18Plus = useCallback(async (): Promise<ProfileDTO> => {
    if (!token) throw new Error('Please sign in first.');
    const res = await apiFetch<{ profile: ProfileDTO }>('/api/me', {
      method: 'PATCH',
      token,
      body: JSON.stringify({ confirmAge18Plus: true, preferredTheme: theme }),
    });
    setProfile(res.profile);
    sessionStorage.removeItem(OAUTH_PENDING_AGE18_KEY);
    return res.profile;
  }, [theme, token]);

  const signInWithRecoveryEmail = useCallback(
    async (email: string, turnstileToken?: string) => {
      if (!config?.supabaseConfigured) {
        throw new Error('Email magic-link sign-in requires Supabase Auth to be configured.');
      }
      const sb = getBrowserSupabaseClient(config.supabaseUrl, config.supabasePublishableKey);
      if (!sb) throw new Error('Supabase client unavailable.');
      const { error } = await sb.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
          ...(turnstileToken ? { captchaToken: turnstileToken } : {}),
        },
      });
      if (error) throw new Error(error.message);
    },
    [config]
  );

  const linkRecoveryEmail = useCallback(
    async (email: string) => {
      if (!token) throw new Error('Please start a session first.');
      if (config?.supabaseConfigured) {
        const sb = getBrowserSupabaseClient(config.supabaseUrl, config.supabasePublishableKey);
        if (!sb) throw new Error('Supabase client unavailable.');
        const { error } = await sb.auth.updateUser({ email: email.trim() });
        if (error) throw new Error(error.message);
        await loadSessionFromToken(token);
        return;
      }
      const res = await apiFetch<{ profile: ProfileDTO }>('/api/me', {
        method: 'PATCH',
        token,
        body: JSON.stringify({ recoveryEmail: email.trim() }),
      });
      setProfile(res.profile);
    },
    [config, loadSessionFromToken, token]
  );

  const signOut = useCallback(async () => {
    if (config?.supabaseConfigured) {
      const sb = getBrowserSupabaseClient(config.supabaseUrl, config.supabasePublishableKey);
      if (sb) await sb.auth.signOut();
    } else {
      sessionStorage.removeItem(SANDBOX_TOKEN_KEY);
    }
    sessionStorage.removeItem(OAUTH_MODE_KEY);
    sessionStorage.removeItem(OAUTH_PENDING_AGE18_KEY);
    sessionStorage.removeItem(OAUTH_RETURN_TO_KEY);
    setToken(null);
    setProfile(null);
    setUnreadCount(0);
  }, [config]);

  const refreshProfile = useCallback(async () => {
    await loadSessionFromToken(token);
  }, [loadSessionFromToken, token]);

  const refreshUnreadCount = useCallback(async () => {
    await fetchUnread(token);
  }, [fetchUnread, token]);

  const toggleSandboxAdmin = useCallback(
    async (enabled: boolean) => {
      if (!token) return;
      const res = await apiFetch<{ profile: ProfileDTO }>('/api/sandbox/toggle-admin', {
        method: 'POST',
        token,
        body: JSON.stringify({ enabled }),
      });
      setProfile(res.profile);
    },
    [token]
  );

  return (
    <AuthContext.Provider
      value={{
        config,
        categories,
        token,
        profile,
        loading,
        theme,
        unreadCount,
        authPromptOpen,
        authPromptReason,
        oauthError,
        clearOAuthError,
        setTheme,
        toggleTheme,
        openAuthPrompt,
        closeAuthPrompt,
        signInAnonymously,
        signInWithGoogle,
        linkGoogleAccount,
        confirmAge18Plus,
        signInWithRecoveryEmail,
        linkRecoveryEmail,
        signOut,
        refreshProfile,
        refreshConfig: async () => {
          await refreshConfig();
        },
        refreshCategories,
        refreshUnreadCount,
        toggleSandboxAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
