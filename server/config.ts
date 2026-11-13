import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

export interface ServerConfig {
  port: number;
  nodeEnv: string;
  appUrl: string;
  supabaseUrl: string | null;
  supabasePublishableKey: string | null;
  supabaseSecretKey: string | null;
  resendApiKey: string | null;
  resendFromEmail: string;
  turnstileSiteKey: string | null;
  turnstileSecretKey: string | null;
  adminBootstrapEmails: string[];
  adminBootstrapUserIds: string[];
  rateLimitSalt: string;
}

function cleanEnv(val: string | undefined): string | null {
  if (!val) return null;
  const trimmed = val.trim();
  if (!trimmed || trimmed.startsWith('MY_') || trimmed.includes('your-project-ref') || trimmed.includes('your_key_here')) {
    return null;
  }
  return trimmed;
}

export function getServerConfig(): ServerConfig {
  const supabaseUrl = cleanEnv(process.env.SUPABASE_URL) || cleanEnv(process.env.VITE_SUPABASE_URL);
  const supabasePublishableKey =
    cleanEnv(process.env.SUPABASE_PUBLISHABLE_KEY) ||
    cleanEnv(process.env.SUPABASE_ANON_KEY) ||
    cleanEnv(process.env.VITE_SUPABASE_PUBLISHABLE_KEY) ||
    cleanEnv(process.env.VITE_SUPABASE_ANON_KEY);
  const supabaseSecretKey =
    cleanEnv(process.env.SUPABASE_SECRET_KEY) || cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

  return {
    port: Number(process.env.PORT || 3000),
    nodeEnv: process.env.NODE_ENV || 'development',
    appUrl: cleanEnv(process.env.APP_URL) || '',
    supabaseUrl,
    supabasePublishableKey,
    supabaseSecretKey,
    resendApiKey: cleanEnv(process.env.RESEND_API_KEY),
    resendFromEmail: cleanEnv(process.env.RESEND_FROM_EMAIL) || 'Dear Stranger <notifications@dearstranger.app>',
    turnstileSiteKey: cleanEnv(process.env.TURNSTILE_SITE_KEY),
    turnstileSecretKey: cleanEnv(process.env.TURNSTILE_SECRET_KEY),
    adminBootstrapEmails: (process.env.ADMIN_BOOTSTRAP_EMAILS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    adminBootstrapUserIds: (process.env.ADMIN_BOOTSTRAP_USER_IDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    rateLimitSalt: process.env.RATE_LIMIT_SALT || 'dear-stranger-ephemeral-salt',
  };
}

export function isSupabaseConfigured(): boolean {
  const cfg = getServerConfig();
  return Boolean(cfg.supabaseUrl && cfg.supabasePublishableKey && cfg.supabaseSecretKey);
}

let cachedAdminClient: SupabaseClient | null = null;
let cachedAdminKeySig = '';

export function getSupabaseAdminClient(): SupabaseClient | null {
  const cfg = getServerConfig();
  if (!cfg.supabaseUrl || !cfg.supabaseSecretKey) return null;
  const sig = `${cfg.supabaseUrl}:${cfg.supabaseSecretKey}`;
  if (!cachedAdminClient || cachedAdminKeySig !== sig) {
    cachedAdminClient = createClient(cfg.supabaseUrl, cfg.supabaseSecretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    cachedAdminKeySig = sig;
  }
  return cachedAdminClient;
}

export function getSupabaseUserClient(accessToken?: string | null): SupabaseClient | null {
  const cfg = getServerConfig();
  if (!cfg.supabaseUrl || !cfg.supabasePublishableKey) return null;
  return createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      : undefined,
  });
}

export async function verifyTurnstileToken(token: string | undefined | null, remoteIpHash?: string): Promise<boolean> {
  const cfg = getServerConfig();
  if (!cfg.turnstileSecretKey) {
    return true;
  }
  if (!token) return false;
  try {
    const form = new URLSearchParams();
    form.append('secret', cfg.turnstileSecretKey);
    form.append('response', token);
    if (remoteIpHash) {
      form.append('idempotency_key', remoteIpHash.slice(0, 32));
    }
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return Boolean(data.success);
  } catch {
    return false;
  }
}
