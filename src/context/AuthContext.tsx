import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { CategoryDTO, PlatformConfigDTO, ProfileDTO } from '../shared/types.ts';
import { apiFetch } from '../lib/api.ts';
import { getBrowserSupabaseClient } from '../lib/supabase.ts';

const SANDBOX_TOKEN_KEY = 'ds_sandbox_token';
const THEME_KEY = 'ds_theme';

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
  setTheme: (theme: 'light' | 'dark') => Promise<void>;
  toggleTheme: () => Promise<void>;
  openAuthPrompt: (reason?: string) => void;
  closeAuthPrompt: () => void;
  signInAnonymously: (confirmAge18Plus: boolean, turnstileToken?: string) => Promise<void>;
  signInWithRecoveryEmail: (email: string) => Promise<void>;
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
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [authPromptOpen, setAuthPromptOpen] = useState(false);
  const [authPromptReason, setAuthPromptReason] = useState<string | null>(null);
  const [theme, setThemeState] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'dark' ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const fetchUnread = useCallback(async (activeToken: string | null) => {
    if (!activeToken) {
      setUnreadCount(0);
      return;
    }
    try {
      const dash = await apiFetch<{ notifications: Array<{ isRead: boolean }> }>('/api/dashboard', {
        token: activeToken,
      });
      setUnreadCount(dash.notifications.filter((n) => !n.isRead).length);
    } catch {
      setUnreadCount(0);
    }
  }, []);

  const refreshCategories = useCallback(async () => {
    try {
      const res = await apiFetch<{ categories: CategoryDTO[] }>('/api/categories');
      setCategories(res.categories);
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
    async (activeToken: string | null) => {
      if (!activeToken) {
        setToken(null);
        setProfile(null);
        setUnreadCount(0);
        return;
      }
      try {
        const res = await apiFetch<{ profile: ProfileDTO | null }>('/api/me', {
          token: activeToken,
        });
        if (!res.profile) {
          setToken(null);
          setProfile(null);
          setUnreadCount(0);
          return;
        }
        setToken(activeToken);
        setProfile(res.profile);
        if (res.profile.preferredTheme) {
          setThemeState(res.profile.preferredTheme);
        }
        await fetchUnread(activeToken);
      } catch {
        setToken(null);
        setProfile(null);
        setUnreadCount(0);
      }
    },
    [fetchUnread]
  );

  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        const [cfg, catRes] = await Promise.all([
          apiFetch<PlatformConfigDTO>('/api/config'),
          apiFetch<{ categories: CategoryDTO[] }>('/api/categories'),
        ]);
        if (!mounted) return;
        setConfig(cfg);
        setCategories(catRes.categories);

        if (cfg.supabaseConfigured && cfg.supabaseUrl && cfg.supabasePublishableKey) {
          const sb = getBrowserSupabaseClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
          if (sb) {
            const { data } = await sb.auth.getSession();
            await loadSessionFromToken(data.session?.access_token ?? null);

            sb.auth.onAuthStateChange((_event, session) => {
              void loadSessionFromToken(session?.access_token ?? null);
            });
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
    async (confirmAge18Plus: boolean, turnstileToken?: string) => {
      if (!confirmAge18Plus) {
        throw new Error('Please confirm that you are 18 years or older.');
      }

      if (config?.supabaseConfigured) {
        const sb = getBrowserSupabaseClient(config.supabaseUrl, config.supabasePublishableKey);
        if (!sb) throw new Error('Supabase client is unavailable.');
        const { data, error } = await sb.auth.signInAnonymously({
          options: turnstileToken ? { captchaToken: turnstileToken } : undefined,
        });
        if (error || !data.session) {
          throw new Error(error?.message || 'Could not start an anonymous session.');
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
    [config, fetchUnread, theme]
  );

  const signInWithRecoveryEmail = useCallback(
    async (email: string) => {
      if (!config?.supabaseConfigured) {
        throw new Error('Email magic-link sign-in requires Supabase Auth to be configured.');
      }
      const sb = getBrowserSupabaseClient(config.supabaseUrl, config.supabasePublishableKey);
      if (!sb) throw new Error('Supabase client unavailable.');
      const { error } = await sb.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/dashboard` },
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
        setTheme,
        toggleTheme,
        openAuthPrompt,
        closeAuthPrompt,
        signInAnonymously,
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
