import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { TurnstileWidget } from './TurnstileWidget.tsx';

export function AuthPromptModal() {
  const {
    config,
    authPromptOpen,
    authPromptReason,
    closeAuthPrompt,
    signInAnonymously,
    signInWithRecoveryEmail,
  } = useAuth();
  const { showToast } = useToast();

  const [mode, setMode] = useState<'anonymous' | 'recover'>('anonymous');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [email, setEmail] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string>('');
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  if (!authPromptOpen) return null;

  const handleAnonymousStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!ageConfirmed) {
      setError('You must confirm that you are 18 or older to participate.');
      return;
    }
    if (config?.turnstileSiteKey && !turnstileToken) {
      setError('Please complete the verification check.');
      return;
    }
    setBusy(true);
    try {
      await signInAnonymously(true, turnstileToken || undefined);
      setTurnstileToken('');
      showToast('Anonymous identity created. You can customise your nickname anytime.', 'success');
    } catch (err) {
      setTurnstileToken('');
      setTurnstileResetKey((k) => k + 1);
      setError(err instanceof Error ? err.message : 'Could not start anonymous session.');
    } finally {
      setBusy(false);
    }
  };

  const handleRecoverySignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError('Please enter your linked recovery email.');
      return;
    }
    if (config?.turnstileSiteKey && !turnstileToken) {
      setError('Please complete the verification check.');
      return;
    }
    setBusy(true);
    try {
      await signInWithRecoveryEmail(email, turnstileToken || undefined);
      setTurnstileToken('');
      setEmailSent(true);
      showToast('Check your email for your sign-in link.', 'success');
    } catch (err) {
      setTurnstileToken('');
      setTurnstileResetKey((k) => k + 1);
      setError(err instanceof Error ? err.message : 'Could not send sign-in link.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="w-full max-w-lg rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-6 sm:p-8 shadow-sm">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#E8E5DF] dark:border-[#332F2A]">
          <div>
            <h2 id="auth-modal-title" className="font-editorial text-2xl sm:text-3xl font-semibold">
              Anonymous Identity
            </h2>
            <p className="text-sm text-[#77736D] dark:text-[#A19B92] mt-1">
              {authPromptReason || 'No real name or personal profile is required.'}
            </p>
          </div>
          <button
            type="button"
            onClick={closeAuthPrompt}
            aria-label="Close sign-in dialog"
            className="p-1 text-[#77736D] hover:text-[#252525] dark:text-[#A19B92] dark:hover:text-[#EAE6DF]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 flex gap-2 p-1 rounded-md bg-[#F1EFE9] dark:bg-[#282521]">
          <button
            type="button"
            onClick={() => {
              setMode('anonymous');
              setError(null);
            }}
            className={`flex-1 py-2 px-3 text-xs sm:text-sm font-medium rounded transition-colors ${
              mode === 'anonymous'
                ? 'bg-[#FFFFFF] dark:bg-[#201E1B] text-[#252525] dark:text-[#EAE6DF]'
                : 'text-[#77736D] dark:text-[#A19B92]'
            }`}
          >
            New Anonymous Identity
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('recover');
              setError(null);
            }}
            className={`flex-1 py-2 px-3 text-xs sm:text-sm font-medium rounded transition-colors ${
              mode === 'recover'
                ? 'bg-[#FFFFFF] dark:bg-[#201E1B] text-[#252525] dark:text-[#EAE6DF]'
                : 'text-[#77736D] dark:text-[#A19B92]'
            }`}
          >
            Sign In with Linked Email
          </button>
        </div>

        {mode === 'anonymous' ? (
          <form onSubmit={handleAnonymousStart} className="mt-5 space-y-4">
            <div className="rounded-md bg-[#F8F7F3] dark:bg-[#181715] border border-[#E8E5DF] dark:border-[#332F2A] p-4 text-xs sm:text-sm text-[#77736D] dark:text-[#A19B92] space-y-2 leading-relaxed">
              <p className="text-[#252525] dark:text-[#EAE6DF] font-medium">
                Important note about anonymous sessions:
              </p>
              <p>
                You will receive a randomly generated display nickname (for example,
                PaperMoon_14) that you can change anytime.
              </p>
              <p>
                If you clear browser storage or lose this device before linking an optional
                recovery email in Account Settings, an unlinked anonymous identity cannot be
                recovered.
              </p>
            </div>

            <label className="flex items-start gap-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={ageConfirmed}
                onChange={(e) => setAgeConfirmed(e.target.checked)}
                className="mt-1 accent-[#80545A]"
              />
              <span className="leading-relaxed">
                I confirm that I am <strong>18 years of age or older</strong> and agree to the{' '}
                <Link
                  to="/guidelines"
                  onClick={closeAuthPrompt}
                  className="underline text-[#80545A] dark:text-[#B8838A]"
                >
                  Community Guidelines
                </Link>
                . <span className="text-xs text-[#77736D] dark:text-[#A19B92]">(Self-confirmed age notice; not a formal identity verification.)</span>
              </span>
            </label>

            {config?.turnstileSiteKey && (
              <TurnstileWidget
                siteKey={config.turnstileSiteKey}
                resetKey={turnstileResetKey}
                onTokenChange={setTurnstileToken}
              />
            )}

            {error && <p className="text-sm text-[#80545A] dark:text-[#B8838A]">{error}</p>}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={closeAuthPrompt}
                className="px-4 py-2 text-sm text-[#77736D] hover:text-[#252525] dark:text-[#A19B92] dark:hover:text-[#EAE6DF]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-5 py-2.5 text-sm font-medium rounded-md bg-[#80545A] hover:bg-[#6C454A] text-white disabled:opacity-50 transition-colors"
              >
                {busy ? 'Creating Identity…' : 'Continue Anonymously'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleRecoverySignIn} className="mt-5 space-y-4">
            <p className="text-sm text-[#77736D] dark:text-[#A19B92] leading-relaxed">
              If you previously linked a recovery email to your anonymous account, enter it below
              to receive a one-time sign-in link. Your email is never shown publicly.
            </p>
            <div>
              <label htmlFor="recovery-email-input" className="block text-sm font-medium mb-1.5">
                Recovery Email Address
              </label>
              <input
                id="recovery-email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3] dark:bg-[#181715] px-3 py-2 text-sm"
              />
            </div>

            {!config?.supabaseConfigured && (
              <p className="text-xs text-[#77736D] dark:text-[#A19B92] bg-[#F1EFE9] dark:bg-[#282521] p-3 rounded-md">
                Email recovery sign-in requires Supabase Auth credentials. Use &ldquo;New Anonymous
                Identity&rdquo; to test in Sandbox Preview Mode.
              </p>
            )}

            {config?.turnstileSiteKey && (
              <TurnstileWidget
                siteKey={config.turnstileSiteKey}
                resetKey={turnstileResetKey}
                onTokenChange={setTurnstileToken}
              />
            )}

            {emailSent && (
              <p className="text-sm text-[#252525] dark:text-[#EAE6DF] bg-[#F1EFE9] dark:bg-[#282521] p-3 rounded-md">
                Sign-in link sent. Check your inbox and open the link on this device.
              </p>
            )}

            {error && <p className="text-sm text-[#80545A] dark:text-[#B8838A]">{error}</p>}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={closeAuthPrompt}
                className="px-4 py-2 text-sm text-[#77736D] hover:text-[#252525] dark:text-[#A19B92] dark:hover:text-[#EAE6DF]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !config?.supabaseConfigured}
                className="px-5 py-2.5 text-sm font-medium rounded-md bg-[#80545A] hover:bg-[#6C454A] text-white disabled:opacity-50 transition-colors"
              >
                {busy ? 'Sending…' : 'Send Sign-In Link'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
