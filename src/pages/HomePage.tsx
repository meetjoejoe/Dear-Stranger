import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PublicLetterDTO } from '../shared/types.ts';
import { apiFetch } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { LetterCard } from '../components/LetterCard.tsx';

export function HomePage() {
  const { config, token, refreshConfig } = useAuth();
  const { showToast } = useToast();
  const [recentLetters, setRecentLetters] = useState<PublicLetterDTO[]>([]);
  const [letterOfTheDay, setLetterOfTheDay] = useState<PublicLetterDTO | null>(null);
  const [editorNote, setEditorNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingSamples, setLoadingSamples] = useState(false);

  const loadHomeData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [feedRes, lotdRes] = await Promise.all([
        apiFetch<{ letters: PublicLetterDTO[] }>('/api/letters?limit=4', { token }),
        apiFetch<{ letter: PublicLetterDTO | null; editorNote: string | null }>(
          '/api/letters/letter-of-the-day',
          { token }
        ),
      ]);
      setRecentLetters(Array.isArray(feedRes?.letters) ? feedRes.letters : []);
      setLetterOfTheDay(lotdRes?.letter ?? null);
      setEditorNote(lotdRes?.editorNote ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load recent letters.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadHomeData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleLoadSandboxSamples = async () => {
    setLoadingSamples(true);
    try {
      await apiFetch('/api/sandbox/samples', { method: 'POST' });
      await refreshConfig();
      await loadHomeData();
      showToast('Loaded explicitly labelled sandbox sample letters for preview.', 'info');
    } catch {
      showToast('Could not load sandbox samples.', 'error');
    } finally {
      setLoadingSamples(false);
    }
  };

  return (
    <div>
      {/* Editorial Hero */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-12 sm:pt-20 pb-12 sm:pb-16 border-b border-[#E8E5DF] dark:border-[#332F2A]">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-8 space-y-6">
            <h1 className="font-editorial text-4xl sm:text-5xl lg:text-[56px] font-semibold leading-[1.08] tracking-tight text-balance">
              Some things are easier to tell a stranger.
            </h1>
            <p className="text-base sm:text-lg text-[#77736D] dark:text-[#A19B92] max-w-2xl leading-relaxed">
              A place to share what is on your mind, discover perspectives, and connect through
              words — without followers, popularity rankings, or public profiles.
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Link
                to="/write"
                className="inline-flex items-center justify-center rounded-md bg-[#80545A] hover:bg-[#6C454A] text-white px-6 py-3 text-sm font-medium transition-colors"
              >
                Write a Letter
              </Link>
              <Link
                to="/explore"
                className="inline-flex items-center justify-center rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] hover:border-[#80545A]/60 px-6 py-3 text-sm font-medium transition-colors"
              >
                Explore Letters
              </Link>
            </div>
          </div>

          <div className="lg:col-span-4 flex justify-start lg:justify-end">
            <div className="rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] p-6 max-w-[280px] w-full">
              <img
                src="/assets/aistudio/Dear_Stranger_Minimal_Logo_9f428c59.png"
                alt="Dear Stranger mark — Some things are easier to tell a stranger."
                className="w-full h-auto object-contain"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Letter of the Day (Shown only when an editor/moderator has selected one) */}
      {letterOfTheDay && (
        <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12 border-b border-[#E8E5DF] dark:border-[#332F2A]">
          <div className="flex items-baseline justify-between gap-4 mb-5">
            <div>
              <p className="text-xs uppercase tracking-widest text-[#80545A] dark:text-[#B8838A] font-medium">
                Editorially Selected
              </p>
              <h2 className="font-editorial text-2xl sm:text-3xl font-semibold mt-1">
                Letter of the Day
              </h2>
            </div>
          </div>
          {editorNote && (
            <p className="text-sm italic text-[#77736D] dark:text-[#A19B92] mb-4 max-w-2xl">
              {editorNote}
            </p>
          )}
          <LetterCard letter={letterOfTheDay} />
        </section>
      )}

      {/* Recent Public Letters */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16 border-b border-[#E8E5DF] dark:border-[#332F2A]">
        <div className="flex flex-wrap items-baseline justify-between gap-4 mb-8">
          <div>
            <h2 className="font-editorial text-3xl font-semibold">Recent Public Letters</h2>
            <p className="text-sm text-[#77736D] dark:text-[#A19B92] mt-1">
              Read openly without an account, or respond thoughtfully when something resonates.
            </p>
          </div>
          <Link
            to="/explore"
            className="text-sm font-medium text-[#80545A] dark:text-[#B8838A] hover:underline whitespace-nowrap shrink-0"
          >
            Browse all letters &rarr;
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2].map((n) => (
              <div
                key={n}
                className="h-52 rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-6 animate-pulse"
              />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-6 text-sm space-y-3">
            <p className="text-[#80545A] dark:text-[#B8838A]">{error}</p>
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => void loadHomeData()}
                className="text-sm underline"
              >
                Try again
              </button>
              {config?.supabaseSchemaReady === false && (
                <Link to="/setup" className="text-sm underline text-[#80545A] dark:text-[#B8838A]">
                  Open Setup &amp; Status
                </Link>
              )}
            </div>
          </div>
        ) : recentLetters.length === 0 ? (
          <div className="rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-8 text-center space-y-4">
            <h3 className="font-editorial text-2xl font-semibold">The letterbox is quiet right now</h3>
            <p className="text-sm text-[#77736D] dark:text-[#A19B92] max-w-md mx-auto leading-relaxed">
              No public letters have been published yet. Dear Stranger never displays fabricated
              community activity.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Link
                to="/write"
                className="rounded-md bg-[#80545A] hover:bg-[#6C454A] text-white px-5 py-2.5 text-sm font-medium transition-colors"
              >
                Write the First Letter
              </Link>
              {config && !config.supabaseConfigured && !config.sandboxHasSamples && (
                <button
                  type="button"
                  onClick={handleLoadSandboxSamples}
                  disabled={loadingSamples}
                  className="rounded-md border border-[#E8E5DF] dark:border-[#332F2A] px-4 py-2.5 text-sm hover:bg-[#F1EFE9] dark:hover:bg-[#282521] transition-colors"
                >
                  {loadingSamples ? 'Loading…' : 'Load Labelled Sandbox Samples'}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {recentLetters.map((letter) => (
              <LetterCard key={letter.id} letter={letter} />
            ))}
          </div>
        )}
      </section>

      {/* How It Works */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16 border-b border-[#E8E5DF] dark:border-[#332F2A]">
        <h2 className="font-editorial text-3xl font-semibold mb-8">How Dear Stranger works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="space-y-2">
            <p className="text-xs font-medium text-[#80545A] dark:text-[#B8838A] tabular-nums">
              01. Write freely
            </p>
            <h3 className="font-editorial text-xl font-semibold">Anonymous by default</h3>
            <p className="text-sm text-[#77736D] dark:text-[#A19B92] leading-relaxed">
              Receive a random display nickname without revealing your name, social profile, or
              identity. Publish publicly or share privately via an unlisted link.
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-[#80545A] dark:text-[#B8838A] tabular-nums">
              02. Respond thoughtfully
            </p>
            <h3 className="font-editorial text-xl font-semibold">Calm conversations</h3>
            <p className="text-sm text-[#77736D] dark:text-[#A19B92] leading-relaxed">
              Readers can react gently or leave a considered reply. Authors can respond once back,
              keeping threads clear without endless argument trees.
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-[#80545A] dark:text-[#B8838A] tabular-nums">
              03. Stay safe
            </p>
            <h3 className="font-editorial text-xl font-semibold">No unsolicited DMs</h3>
            <p className="text-sm text-[#77736D] dark:text-[#A19B92] leading-relaxed">
              There is no private direct messaging, no follower count, and no algorithm pushing
              outrage. Every letter and reply can be reported or blocked.
            </p>
          </div>
        </div>
      </section>

      {/* Community & Safety Statement */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
        <div className="rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <h2 className="font-editorial text-2xl font-semibold">
              Built for adults 18+ with care and boundaries
            </h2>
            <p className="text-sm text-[#77736D] dark:text-[#A19B92] leading-relaxed">
              We ask everyone to write respectfully, protect personal privacy, and avoid sharing
              identifying details. Dear Stranger is a reflective reading and writing space, not a
              substitute for professional medical or crisis care.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
            <Link
              to="/guidelines"
              className="rounded-md border border-[#E8E5DF] dark:border-[#332F2A] px-4 py-2 text-sm font-medium hover:bg-[#F1EFE9] dark:hover:bg-[#282521] transition-colors"
            >
              Community Guidelines
            </Link>
            <Link
              to="/privacy"
              className="rounded-md border border-[#E8E5DF] dark:border-[#332F2A] px-4 py-2 text-sm font-medium hover:bg-[#F1EFE9] dark:hover:bg-[#282521] transition-colors"
            >
              Privacy Policy
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
