import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PenLine } from 'lucide-react';
import type { PublicLetterDTO } from '../shared/types.ts';
import { apiFetch } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { LetterCard } from '../components/LetterCard.tsx';

export function HomePage() {
  const { config, categories, profile, token, refreshConfig } = useAuth();
  const { showToast } = useToast();

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [recentLetters, setRecentLetters] = useState<PublicLetterDTO[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [letterOfTheDay, setLetterOfTheDay] = useState<PublicLetterDTO | null>(null);
  const [editorNote, setEditorNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingSamples, setLoadingSamples] = useState(false);

  const loadFeed = useCallback(
    async (pageNum: number, append: boolean, categorySlug: string) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        if (categorySlug && categorySlug !== 'all') qs.set('category', categorySlug);
        qs.set('page', String(pageNum));
        qs.set('limit', '8');

        const feedPromise = apiFetch<{
          letters: PublicLetterDTO[];
          page: number;
          hasMore: boolean;
        }>(`/api/letters?${qs.toString()}`, { token });

        if (!append && pageNum === 1) {
          const [feedRes, lotdRes] = await Promise.all([
            feedPromise,
            apiFetch<{ letter: PublicLetterDTO | null; editorNote: string | null }>(
              '/api/letters/letter-of-the-day',
              { token }
            ).catch(() => ({ letter: null, editorNote: null })),
          ]);
          const next = Array.isArray(feedRes?.letters) ? feedRes.letters : [];
          setRecentLetters(next);
          setPage(typeof feedRes?.page === 'number' ? feedRes.page : 1);
          setHasMore(Boolean(feedRes?.hasMore));
          setLetterOfTheDay(lotdRes?.letter ?? null);
          setEditorNote(lotdRes?.editorNote ?? null);
        } else {
          const feedRes = await feedPromise;
          const next = Array.isArray(feedRes?.letters) ? feedRes.letters : [];
          setRecentLetters((prev) => [...prev, ...next]);
          setPage(typeof feedRes?.page === 'number' ? feedRes.page : pageNum);
          setHasMore(Boolean(feedRes?.hasMore));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load recent letters.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [token]
  );

  useEffect(() => {
    void loadFeed(1, false, selectedCategory);
  }, [loadFeed, selectedCategory]);

  const handleLoadSandboxSamples = async () => {
    setLoadingSamples(true);
    try {
      await apiFetch('/api/sandbox/samples', { method: 'POST' });
      await refreshConfig();
      await loadFeed(1, false, selectedCategory);
      showToast('Loaded explicitly labelled sandbox sample letters for preview.', 'info');
    } catch {
      showToast('Could not load sandbox samples.', 'error');
    } finally {
      setLoadingSamples(false);
    }
  };

  const handleLetterUpdated = (updated: PublicLetterDTO) => {
    setRecentLetters((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    if (letterOfTheDay?.id === updated.id) setLetterOfTheDay(updated);
  };

  const handleBlockedAuthor = (letterId: string) => {
    setRecentLetters((prev) => prev.filter((item) => item.id !== letterId));
    if (letterOfTheDay?.id === letterId) setLetterOfTheDay(null);
  };

  return (
    <div>
      {/* Timeline Top Bar */}
      <div className="px-4 sm:px-6 py-4 border-b border-[#E8E5DF] dark:border-[#332F2A] flex items-baseline justify-between gap-4">
        <div>
          <h1 className="font-editorial text-2xl sm:text-3xl font-semibold leading-tight">
            Home
          </h1>
          <p className="text-xs text-[#77736D] dark:text-[#A19B92] mt-0.5">
            Some things are easier to tell a stranger.
          </p>
        </div>
        <Link
          to="/explore"
          className="text-xs font-medium text-[#80545A] dark:text-[#B8838A] hover:underline whitespace-nowrap shrink-0"
        >
          Search archive &rarr;
        </Link>
      </div>

      {/* Letter Composer Entry Point */}
      <section
        aria-label="Write a new letter"
        className="px-4 sm:px-6 py-5 border-b border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF]/75 dark:bg-[#201E1B]/75"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <p className="text-xs text-[#77736D] dark:text-[#A19B92]">
              {profile ? (
                <>
                  Writing anonymously as{' '}
                  <strong className="font-medium text-[#252525] dark:text-[#EAE6DF]">
                    {profile.displayName}
                  </strong>
                </>
              ) : (
                'Anonymous correspondence · No followers or public profiles'
              )}
            </p>
            <Link
              to="/write"
              className="block font-editorial text-xl sm:text-2xl italic text-[#77736D] dark:text-[#A19B92] hover:text-[#252525] dark:hover:text-[#EAE6DF] transition-colors"
            >
              &ldquo;You don&apos;t have to know who will read this. Just write.&rdquo;
            </Link>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs text-[#77736D] dark:text-[#A19B92]">
            <Link
              to="/open-letterbox"
              className="hover:text-[#252525] dark:hover:text-[#EAE6DF] underline underline-offset-4"
            >
              Answer an unanswered letter
            </Link>
          </div>
          <Link
            to="/write"
            className="inline-flex items-center gap-2 rounded-md bg-[#80545A] hover:bg-[#6C454A] text-white px-4 py-2 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0"
          >
            <PenLine className="w-3.5 h-3.5" />
            <span>Write a Letter</span>
          </Link>
        </div>
      </section>

      {/* Category Filter Strip */}
      <div
        className="border-b border-[#E8E5DF] dark:border-[#332F2A] px-4 sm:px-6 overflow-x-auto scrollbar-none flex items-center gap-5"
        role="tablist"
        aria-label="Filter timeline by category"
      >
        <button
          type="button"
          role="tab"
          aria-selected={selectedCategory === 'all'}
          onClick={() => setSelectedCategory('all')}
          className={`py-3 text-xs font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors ${
            selectedCategory === 'all'
              ? 'border-[#80545A] dark:border-[#B8838A] text-[#252525] dark:text-[#EAE6DF]'
              : 'border-transparent text-[#77736D] dark:text-[#A19B92] hover:text-[#252525] dark:hover:text-[#EAE6DF]'
          }`}
        >
          Latest Letters
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            role="tab"
            aria-selected={selectedCategory === cat.slug}
            onClick={() => setSelectedCategory(cat.slug)}
            className={`py-3 text-xs font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors ${
              selectedCategory === cat.slug
                ? 'border-[#80545A] dark:border-[#B8838A] text-[#252525] dark:text-[#EAE6DF]'
                : 'border-transparent text-[#77736D] dark:text-[#A19B92] hover:text-[#252525] dark:hover:text-[#EAE6DF]'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Letter of the Day (inline on < xl screens where Right Sidebar hides) */}
      {letterOfTheDay && selectedCategory === 'all' && (
        <section className="xl:hidden border-b border-[#E8E5DF] dark:border-[#332F2A] bg-[#F1EFE9]/55 dark:bg-[#201E1B]/55 px-4 sm:px-6 py-5 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="uppercase tracking-widest text-[#80545A] dark:text-[#B8838A] font-medium">
              Letter of the Day
            </span>
            <Link
              to={`/letters/${letterOfTheDay.id}`}
              className="text-[#80545A] dark:text-[#B8838A] hover:underline font-medium"
            >
              Read letter &rarr;
            </Link>
          </div>
          {editorNote && (
            <p className="text-xs italic text-[#77736D] dark:text-[#A19B92]">{editorNote}</p>
          )}
          <LetterCard
            letter={letterOfTheDay}
            variant="bordered"
            onUpdated={handleLetterUpdated}
            onBlockedAuthor={handleBlockedAuthor}
          />
        </section>
      )}

      {/* Main Letter Timeline */}
      <section aria-label="Public letter feed">
        {loading ? (
          <div className="divide-y divide-[#E8E5DF] dark:divide-[#332F2A]">
            {[1, 2, 3].map((n) => (
              <div key={n} className="px-4 sm:px-6 py-6 space-y-3 animate-pulse">
                <div className="h-3 w-40 bg-[#F1EFE9] dark:bg-[#282521] rounded" />
                <div className="h-6 w-3/4 bg-[#F1EFE9] dark:bg-[#282521] rounded" />
                <div className="h-16 w-full bg-[#F1EFE9] dark:bg-[#282521] rounded" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="px-4 sm:px-6 py-10 text-sm space-y-3">
            <p className="text-[#80545A] dark:text-[#B8838A]">{error}</p>
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => void loadFeed(1, false, selectedCategory)}
                className="text-sm underline font-medium"
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
          <div className="px-4 sm:px-6 py-14 text-center space-y-4">
            <h2 className="font-editorial text-2xl sm:text-3xl font-semibold">
              The letterbox is quiet right now
            </h2>
            <p className="text-sm text-[#77736D] dark:text-[#A19B92] max-w-md mx-auto leading-relaxed">
              {selectedCategory !== 'all'
                ? 'No public letters have been published in this topic yet.'
                : 'No public letters have been published yet. Dear Stranger never displays fabricated community activity.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Link
                to="/write"
                className="rounded-md bg-[#80545A] hover:bg-[#6C454A] text-white px-5 py-2.5 text-sm font-medium transition-colors"
              >
                Write a Letter
              </Link>
              {selectedCategory !== 'all' && (
                <button
                  type="button"
                  onClick={() => setSelectedCategory('all')}
                  className="rounded-md border border-[#E8E5DF] dark:border-[#332F2A] px-4 py-2.5 text-sm hover:bg-[#F1EFE9] dark:hover:bg-[#282521] transition-colors"
                >
                  View all topics
                </button>
              )}
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
          <div>
            {recentLetters.map((letter) => (
              <LetterCard
                key={letter.id}
                letter={letter}
                onUpdated={handleLetterUpdated}
                onBlockedAuthor={handleBlockedAuthor}
              />
            ))}

            {hasMore && (
              <div className="px-4 sm:px-6 py-6 text-center border-b border-[#E8E5DF] dark:border-[#332F2A]">
                <button
                  type="button"
                  onClick={() => void loadFeed(page + 1, true, selectedCategory)}
                  disabled={loadingMore}
                  className="rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] hover:border-[#80545A] px-6 py-2.5 text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  {loadingMore ? 'Loading more…' : 'Load More Letters'}
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Quiet Editorial Primer */}
      <section className="px-4 sm:px-6 py-8 bg-[#F1EFE9]/35 dark:bg-[#201E1B]/35 space-y-4">
        <p className="text-[11px] uppercase tracking-widest text-[#80545A] dark:text-[#B8838A] font-medium">
          How Dear Stranger Works
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 text-xs text-[#77736D] dark:text-[#A19B92] leading-relaxed">
          <div className="space-y-1">
            <p className="font-medium text-[#252525] dark:text-[#EAE6DF]">01. Anonymous by default</p>
            <p>
              Write with a generated nickname or unlisted link without public profiles or follower
              counts.
            </p>
          </div>
          <div className="space-y-1">
            <p className="font-medium text-[#252525] dark:text-[#EAE6DF]">02. Calm responses</p>
            <p>
              React gently or leave a thoughtful reply. Authors can respond once back without noisy
              argument trees.
            </p>
          </div>
          <div className="space-y-1">
            <p className="font-medium text-[#252525] dark:text-[#EAE6DF]">03. Safe boundaries</p>
            <p>
              Adults 18+ only. No unsolicited DMs. Every letter and reply can be reported or blocked.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
