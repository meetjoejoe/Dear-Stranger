import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { getBrowserSupabaseClient } from '../lib/supabase.ts';
import {
  classifyOAuthError,
  extractOAuthParamsFromUrl,
  OAUTH_MODE_KEY,
  OAUTH_PENDING_AGE18_KEY,
  OAUTH_RETURN_TO_KEY,
  sanitizeReturnPath,
  type ParsedOAuthError,
} from '../lib/oauthUtils.ts';
import { GoogleMark } from '../components/GoogleMark.tsx';

type CallbackStage =
  | 'processing'
  | 'needs_age_confirmation'
  | 'error'
  | 'success';

export function AuthCallbackPage() {
  const {
    config,
    loading: authLoading,
    token,
    profile,
    refreshProfile,
    confirmAge18Plus,
    signInWithGoogle,
    openAuthPrompt,
    signOut,
  } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [stage, setStage] = useState<CallbackStage>('processing');
  const [parsedError, setParsedError] = useState<ParsedOAuthError | null>(null);
  const [intentMode, setIntentMode] = useState<'signin' | 'link'>('signin');
  const [returnTo, setReturnTo] = useState<string>('/dashboard?tab=account');
  const [ageChecked, setAgeChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [externalRedirectUrl, setExternalRedirectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.opener && window.opener !== window) {
      try {
        window.opener.postMessage(
          {
            type: 'DS_OAUTH_CALLBACK',
            search: window.location.search || '',
            hash: window.location.hash || '',
          },
          window.location.origin
        );
      } catch {
        // ignore cross-origin failure
      }
      window.close();
      return;
    }

    if (authLoading || !config) return;
    const activeConfig = config;

    let cancelled = false;

    async function resolveCallback() {
      const urlMeta = extractOAuthParamsFromUrl(window.location.search, window.location.hash);
      const storedMode = sessionStorage.getItem(OAUTH_MODE_KEY);
      const mode: 'signin' | 'link' =
        urlMeta.mode === 'link' || storedMode === 'link' ? 'link' : 'signin';
      const target = sanitizeReturnPath(
        sessionStorage.getItem(OAUTH_RETURN_TO_KEY),
        mode === 'link' ? '/dashboard?tab=account' : '/explore'
      );

      if (!cancelled) {
        setIntentMode(mode);
        setReturnTo(target);
      }

      if (urlMeta.error) {
        const classified = classifyOAuthError(
          urlMeta.error,
          urlMeta.errorCode,
          urlMeta.errorDescription,
          mode
        );
        window.history.replaceState({}, document.title, '/auth/callback');
        sessionStorage.removeItem(OAUTH_MODE_KEY);
        sessionStorage.removeItem(OAUTH_PENDING_AGE18_KEY);
        if (!cancelled) {
          setParsedError(classified);
          setStage('error');
        }
        return;
      }

      if (
        !activeConfig.supabaseConfigured ||
        !activeConfig.supabaseUrl ||
        !activeConfig.supabasePublishableKey
      ) {
        if (!cancelled) {
          setParsedError({
            code: 'supabase_unconfigured',
            isCancelled: false,
            isIdentityConflict: false,
            message:
              'Google OAuth callback requires Supabase Auth credentials to be configured.',
          });
          setStage('error');
        }
        return;
      }

      const sb = getBrowserSupabaseClient(
        activeConfig.supabaseUrl,
        activeConfig.supabasePublishableKey
      );
      if (!sb) {
        if (!cancelled) {
          setParsedError({
            code: 'client_unavailable',
            isCancelled: false,
            isIdentityConflict: false,
            message: 'Supabase authentication client is unavailable.',
          });
          setStage('error');
        }
        return;
      }

      // Allow detectSessionInUrl to finish PKCE code / hash exchange cleanly
      let activeSession = (await sb.auth.getSession()).data.session;
      if (!activeSession && (urlMeta.hasCode || urlMeta.hasAccessToken)) {
        for (let attempt = 0; attempt < 12; attempt++) {
          await new Promise((r) => setTimeout(r, 250));
          if (cancelled) return;
          const res = await sb.auth.getSession();
          if (res.data.session) {
            activeSession = res.data.session;
            break;
          }
        }
      }

      if (!activeSession) {
        window.history.replaceState({}, document.title, '/auth/callback');
        sessionStorage.removeItem(OAUTH_MODE_KEY);
        sessionStorage.removeItem(OAUTH_PENDING_AGE18_KEY);
        if (!cancelled) {
          setParsedError({
            code: 'missing_session',
            isCancelled: false,
            isIdentityConflict: false,
            message:
              'No verified Google session was returned. The sign-in link may have expired or been cancelled.',
          });
          setStage('error');
        }
        return;
      }

      await refreshProfile();
    }

    void resolveCallback();
    return () => {
      cancelled = true;
    };
  }, [authLoading, config, refreshProfile]);

  // Once profile finishes syncing from AuthContext, finalize redirect or 18+ confirmation
  useEffect(() => {
    if (stage !== 'processing' || authLoading || !profile || !token) return;

    const pendingAge = sessionStorage.getItem(OAUTH_PENDING_AGE18_KEY) === '1';
    if (!profile.ageConfirmedAt && pendingAge) {
      return; // AuthContext.loadSessionFromToken handles applying pendingAge
    }

    if (!profile.ageConfirmedAt) {
      window.history.replaceState({}, document.title, '/auth/callback');
      setStage('needs_age_confirmation');
      return;
    }

    sessionStorage.removeItem(OAUTH_MODE_KEY);
    sessionStorage.removeItem(OAUTH_PENDING_AGE18_KEY);
    sessionStorage.removeItem(OAUTH_RETURN_TO_KEY);
    setStage('success');
    showToast(
      intentMode === 'link'
        ? 'Google account connected. Your anonymous nickname and letters remain preserved.'
        : `Signed in as ${profile.displayName}.`,
      'success'
    );
    navigate(returnTo, { replace: true });
  }, [authLoading, intentMode, navigate, profile, returnTo, showToast, stage, token]);

  const handleConfirmAge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ageChecked) return;
    setBusy(true);
    try {
      await confirmAge18Plus();
      sessionStorage.removeItem(OAUTH_MODE_KEY);
      sessionStorage.removeItem(OAUTH_PENDING_AGE18_KEY);
      sessionStorage.removeItem(OAUTH_RETURN_TO_KEY);
      showToast('Welcome to Dear Stranger. Your anonymous pen name is ready.', 'success');
      navigate(returnTo, { replace: true });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save confirmation.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRetryGoogle = async (options?: { switchAccount?: boolean }) => {
    setBusy(true);
    setExternalRedirectUrl(null);
    try {
      if (options?.switchAccount) {
        await signOut();
      }
      const res = await signInWithGoogle({ returnTo: '/dashboard?tab=account' });
      if (res?.externalRedirectUrl) {
        setExternalRedirectUrl(res.externalRedirectUrl);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not launch Google sign-in.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-4 sm:px-6 py-12 sm:py-16">
      <div className="max-w-lg mx-auto rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-6 sm:p-8 space-y-5 shadow-sm">
        {stage === 'processing' && (
          <div className="space-y-3 text-center py-4">
            <div className="w-8 h-8 mx-auto rounded-full border-2 border-[#80545A] border-t-transparent animate-spin" />
            <h1 className="font-editorial text-2xl font-semibold">
              {intentMode === 'link'
                ? 'Connecting your Google account…'
                : 'Completing Google sign-in…'}
            </h1>
            <p className="text-sm text-[#77736D] dark:text-[#A19B92]">
              Verifying your session securely. Your real name and email remain private.
            </p>
          </div>
        )}

        {stage === 'success' && (
          <div className="space-y-3 text-center py-4">
            <CheckCircle2 className="w-8 h-8 mx-auto text-[#80545A] dark:text-[#B8838A]" />
            <h1 className="font-editorial text-2xl font-semibold">Session Ready</h1>
            <p className="text-sm text-[#77736D] dark:text-[#A19B92]">
              Redirecting you back to Dear Stranger…
            </p>
          </div>
        )}

        {stage === 'needs_age_confirmation' && profile && (
          <form onSubmit={handleConfirmAge} className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-widest text-[#80545A] dark:text-[#B8838A] font-medium">
                First-Time Participation Notice
              </p>
              <h1 className="font-editorial text-2xl sm:text-3xl font-semibold">
                Welcome, {profile.displayName}
              </h1>
              <p className="text-sm text-[#77736D] dark:text-[#A19B92] leading-relaxed">
                Your account uses an anonymous pen name by default—your Google name and email are
                never shown publicly. Before posting or replying, please confirm our adult space
                guidelines.
              </p>
            </div>

            <label className="flex items-start gap-3 text-sm cursor-pointer rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3] dark:bg-[#181715] p-4">
              <input
                type="checkbox"
                checked={ageChecked}
                onChange={(e) => setAgeChecked(e.target.checked)}
                className="mt-1 accent-[#80545A]"
              />
              <span className="leading-relaxed">
                I confirm that I am <strong>18 years of age or older</strong> and agree to the{' '}
                <Link to="/guidelines" className="underline text-[#80545A] dark:text-[#B8838A]">
                  Community Guidelines
                </Link>
                .
              </span>
            </label>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  void signOut().then(() => navigate('/', { replace: true }));
                }}
                className="text-xs text-[#77736D] hover:text-[#252525] dark:text-[#A19B92] dark:hover:text-[#EAE6DF] underline"
              >
                Sign out and leave
              </button>
              <button
                type="submit"
                disabled={!ageChecked || busy}
                className="rounded-md bg-[#80545A] hover:bg-[#6C454A] text-white px-5 py-2.5 text-sm font-medium disabled:opacity-45 transition-colors"
              >
                {busy ? 'Saving…' : 'Confirm & Continue'}
              </button>
            </div>
          </form>
        )}

        {stage === 'error' && parsedError && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              {parsedError.isIdentityConflict ? (
                <ShieldAlert className="w-6 h-6 text-[#80545A] dark:text-[#B8838A] shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-6 h-6 text-[#80545A] dark:text-[#B8838A] shrink-0 mt-0.5" />
              )}
              <div className="space-y-1.5">
                <h1 className="font-editorial text-2xl font-semibold">
                  {parsedError.isIdentityConflict
                    ? 'Google Account Already In Use'
                    : parsedError.isCancelled
                    ? 'Google Sign-In Cancelled'
                    : 'Authentication Incomplete'}
                </h1>
                <p className="text-sm text-[#77736D] dark:text-[#A19B92] leading-relaxed">
                  {parsedError.message}
                </p>
              </div>
            </div>

            {externalRedirectUrl && (
              <div className="rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3] dark:bg-[#181715] p-3.5 text-xs space-y-2">
                <p className="text-[#77736D] dark:text-[#A19B92]">
                  Your browser blocked the automatic sign-in window. Open verification in a new
                  tab:
                </p>
                <a
                  href={externalRedirectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] px-3.5 py-2 font-medium text-[#252525] dark:text-[#EAE6DF]"
                >
                  <GoogleMark />
                  <span>Open Google Sign-In Window</span>
                </a>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              {parsedError.isIdentityConflict && profile ? (
                <>
                  <Link
                    to="/dashboard?tab=account"
                    className="rounded-md bg-[#80545A] hover:bg-[#6C454A] text-white px-4 py-2 text-sm font-medium"
                  >
                    Keep Current Anonymous Session
                  </Link>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleRetryGoogle({ switchAccount: true })}
                    className="inline-flex items-center gap-2 rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#282521] px-4 py-2 text-sm font-medium"
                  >
                    <GoogleMark />
                    <span>Sign In to Google Account Instead</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={busy || !config?.supabaseConfigured}
                    onClick={() => void handleRetryGoogle()}
                    className="inline-flex items-center gap-2 rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#282521] px-4 py-2 text-sm font-medium disabled:opacity-50"
                  >
                    <GoogleMark />
                    <span>{busy ? 'Redirecting…' : 'Try Google Again'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigate('/', { replace: true });
                      openAuthPrompt('Continue anonymously without linking a Google account.');
                    }}
                    className="rounded-md bg-[#80545A] hover:bg-[#6C454A] text-white px-4 py-2 text-sm font-medium"
                  >
                    Continue Anonymously
                  </button>
                  <Link
                    to="/"
                    className="px-3 py-2 text-sm text-[#77736D] hover:text-[#252525] dark:text-[#A19B92] dark:hover:text-[#EAE6DF]"
                  >
                    Return Home
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
