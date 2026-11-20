import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { apiFetch } from '../lib/api.ts';

export function SetupPage() {
  const { config, refreshConfig } = useAuth();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  const handleLoadSamples = async () => {
    setBusy(true);
    try {
      await apiFetch('/api/sandbox/samples', { method: 'POST' });
      await refreshConfig();
      showToast('Sandbox sample letters loaded.', 'success');
    } catch {
      showToast('Failed to load sandbox samples.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleResetSandbox = async () => {
    setBusy(true);
    try {
      await apiFetch('/api/sandbox/reset', { method: 'POST' });
      await refreshConfig();
      showToast('Sandbox data cleared.', 'info');
    } catch {
      showToast('Failed to reset sandbox.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16 space-y-8">
      <div className="pb-6 border-b border-[#E8E5DF] dark:border-[#332F2A]">
        <p className="text-xs uppercase tracking-widest text-[#80545A] dark:text-[#B8838A] font-medium">
          Environment &amp; Integration Status
        </p>
        <h1 className="font-editorial text-4xl font-semibold mt-1">Platform Setup</h1>
      </div>

      {/* Live Status Summary */}
      <div className="rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-6 space-y-4">
        <h2 className="font-editorial text-2xl font-semibold">Live Configuration Check</h2>
        <dl className="divide-y divide-[#E8E5DF] dark:divide-[#332F2A] text-sm">
          <div className="py-2.5 flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4">
            <dt className="text-[#77736D] dark:text-[#A19B92] shrink-0">Supabase PostgreSQL &amp; Auth</dt>
            <dd className="font-medium sm:text-right break-words min-w-0">
              {config?.supabaseConfigured ? 'Connected' : 'Not configured (Sandbox Preview active)'}
            </dd>
          </div>
          {config?.supabaseConfigured && (
            <div className="py-2.5 flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4">
              <dt className="text-[#77736D] dark:text-[#A19B92] shrink-0">Database Schema (001 &amp; 002)</dt>
              <dd className="font-medium sm:text-right break-words min-w-0">
                {config.supabaseSchemaReady ? 'Initialized' : 'Migrations pending'}
              </dd>
            </div>
          )}
          <div className="py-2.5 flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4">
            <dt className="text-[#77736D] dark:text-[#A19B92] shrink-0">Resend Email Notifications</dt>
            <dd className="font-medium sm:text-right break-words min-w-0">
              {config?.emailConfigured ? 'Configured' : 'Not configured (in-app notifications active)'}
            </dd>
          </div>
          <div className="py-2.5 flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4">
            <dt className="text-[#77736D] dark:text-[#A19B92] shrink-0">Cloudflare Turnstile CAPTCHA</dt>
            <dd className="font-medium sm:text-right break-words min-w-0">
              {config?.turnstileSiteKey ? 'Enabled' : 'Optional (not configured)'}
            </dd>
          </div>
        </dl>
      </div>

      {/* Sandbox Controls when unconfigured */}
      {config && !config.supabaseConfigured && (
        <div className="rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#F1EFE9] dark:bg-[#282521] p-6 space-y-4">
          <h2 className="font-editorial text-2xl font-semibold">Sandbox Preview Controls</h2>
          <p className="text-sm text-[#77736D] dark:text-[#A19B92] leading-relaxed">
            Until Supabase credentials are supplied, Dear Stranger runs in an ephemeral in-memory
            Sandbox Preview Mode so every workflow can be tested honestly without faking persistent
            production data.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy || config.sandboxHasSamples}
              onClick={() => void handleLoadSamples()}
              className="rounded-md bg-[#80545A] text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {config.sandboxHasSamples ? 'Sandbox Samples Loaded' : 'Load Labelled Sandbox Samples'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleResetSandbox()}
              className="rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] px-4 py-2 text-sm"
            >
              Reset Sandbox Data
            </button>
            <Link
              to="/explore"
              className="rounded-md border border-[#E8E5DF] dark:border-[#332F2A] px-4 py-2 text-sm"
            >
              Go to Explore
            </Link>
          </div>
        </div>
      )}

      {/* Connection Steps */}
      <div className="rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-6 space-y-4 text-sm leading-relaxed overflow-hidden">
        <h2 className="font-editorial text-2xl font-semibold">Connecting Live Supabase</h2>
        <ol className="list-decimal pl-5 space-y-2 text-[#77736D] dark:text-[#A19B92] break-words">
          <li>Create a Supabase project and enable <strong>Anonymous Sign-Ins</strong> under Authentication &rarr; Providers.</li>
          <li>Apply both SQL migrations in <code className="break-all">supabase/migrations/001_initial_schema.sql</code> and <code className="break-all">002_rls_and_functions.sql</code>.</li>
          <li>Set <code className="break-all">SUPABASE_URL</code>, <code className="break-all">SUPABASE_PUBLISHABLE_KEY</code>, and <code className="break-all">SUPABASE_SECRET_KEY</code> in your server environment (Vercel / Cloud Run).</li>
          <li>Optionally set <code className="break-all">ADMIN_BOOTSTRAP_EMAILS</code> or insert your user UUID into <code className="break-all">public.admin_users</code> to grant Moderation Console access.</li>
          <li>Optionally set <code className="break-all">RESEND_API_KEY</code> and <code className="break-all">TURNSTILE_SITE_KEY</code> / <code className="break-all">TURNSTILE_SECRET_KEY</code> for email notifications and CAPTCHA protection.</li>
        </ol>
      </div>
    </div>
  );
}
