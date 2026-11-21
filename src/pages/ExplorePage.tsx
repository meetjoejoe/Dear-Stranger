import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BookOpen, Search, Shuffle } from 'lucide-react';
import type { PublicLetterDTO } from '../shared/types.ts';
import { apiFetch } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { LetterCard } from '../components/LetterCard.tsx';

type ExploreMode = 'latest' | 'unanswered' | 'curated';

export function ExplorePage() {
  const { config, categories, token } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeCategory = searchParams.get('category') || 'all';
  const urlQuery = searchParams.get('q') || '';
  const initialMode = (searchParams.get('view') as ExploreMode) || 'latest';

  const [viewMode, setViewMode] = useState<ExploreMode>(
    ['latest', 'unanswered', 'curated'].includes(initialMode) ? initialMode : 'latest'
  );
  const [searchInput, setSearchInput] = useState(urlQuery);
  const [letters, setLetters] = useState<PublicLetterDTO[]>([]);
  const [unansweredLetters, setUnansweredLetters] = useState<PublicLetterDTO[]>([]);
  const [lotd, setLotd] = useState<PublicLetterDTO | null>(null);
  const [lotdNote, setLotdNote] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentSurpriseIds, setRecentSurpriseIds] = useState<string[]>([]);
  const [surprising, setSurprising] = useState(false);

  const fetchFeed = useCallback(
    async (pageNum: number, append: boolean, mode: ExploreMode) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        if (mode === 'unanswered') {
          const res = await apiFetch<{ letters: PublicLetterDTO[] }>(
            '/api/letters/open-letterbox',
            { token }
          );
          const list = Array.isArray(res?.letters) ? res.letters : [];
          setUnansweredLetters(list);
          setHasMore(false);
          setPage(1);
          setTotal(list.length);
          return;
        }

        const qs = new URLSearchParams();
        if (activeCategory && activeCategory !== 'all') qs.set('category', activeCategory);
        if (urlQuery) qs.set('q', urlQuery);
        qs.set('page', String(pageNum));
        qs.set('limit', '10');

        if (!append && pageNum === 1) {
          const [res, lotdRes] = await Promise.all([
            apiFetch<{
              letters: PublicLetterDTO[];
              total: number;
              page: number;
              hasMore: boolean;
            }>(`/api/letters?${qs.toString()}`, { token }),
            apiFetch<{ letter: PublicLetterDTO | null; editorNote: string | null }>(
              '/api/letters/letter-of-the-day',
              { token }
            ).catch(() => ({ letter: null, editorNote: null })),
          ]);
          const nextLetters = Array.isArray(res?.letters) ? res.letters : [];
          setLetters(nextLetters);
          setTotal(typeof res?.total === 'number' ? res.total : nextLetters.length);
          setPage(typeof res?.page === 'number' ? res.page : pageNum);
          setHasMore(Boolean(res?.hasMore));
          setLotd(lotdRes?.letter ?? null);
          setLotdNote(lotdRes?.editorNote ?? null);
        } else {
          const res = await apiFetch<{
            letters: PublicLetterDTO[];
            total: number;
            page: number;
            hasMore: boolean;
          }>(`/api/letters?${qs.toString()}`, { token });
          const nextLetters = Array.isArray(res?.letters) ? res.letters : [];
          setLetters((prev) => [...prev, ...nextLetters]);
          setTotal(typeof res?.total === 'number' ? res.total : nextLetters.length);
          setPage(typeof res?.page === 'number' ? res.page : pageNum);
          setHasMore(Boolean(res?.hasMore));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load public letters.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [activeCategory, token, urlQuery]
  );

  useEffect(() => {
    setSearchInput(urlQuery);
    void fetchFeed(1, false, viewMode);
  }, [activeCategory, urlQuery, viewMode, fetchFeed]);

  const handleCategoryChange = (slug: string) => {
    const next = new URLSearchParams(searchParams);
    if (slug === 'all') next.delete('category');
    else next.set('category', slug);
    setSearchParams(next);
  };

  const handleModeChange = (mode: ExploreMode) => {
    setViewMode(mode);
    const next = new URLSearchParams(searchParams);
    if (mode === 'latest') next.delete('view');
    else next.set('view', mode);
    setSearchParams(next, { replace: true });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = new URLSearchParams(searchParams);
    const trimmed = searchInput.trim();
    if (trimmed) next.set('q', trimmed);
    else next.delete('q');
    setSearchParams(next);
  };

  const handleSurpriseMe = async () => {
    if (surprising) return;
    setSurprising(true);
    try {
      const res = await apiFetch<{ letter: PublicLetterDTO | null }>(
        `/api/letters/surprise?exclude=${encodeURIComponent(recentSurpriseIds.join(','))}`,
        { token }
      );
      if (!res.letter) {
        showToast('No public letters available right now.', 'info');
        return;
      }
      setRecentSurpriseIds((prev) => [...prev.slice(-15), res.letter!.id]);
      navigate(`/letters/${res.letter.id}`);
    } catch {
      showToast('Could not fetch a random letter.', 'error');
    } finally {
      setSurprising(false);
    }
  };

  const filteredUnanswered = unansweredLetters.filter((l) => {
    const matchesCat = activeCategory === 'all' || l.category.slug === activeCategory;
    const q = urlQuery.trim().toLowerCase();
    const matchesQuery =
      !q ||
      (l.title || '').toLowerCase().includes(q) ||
      l.body.toLowerCase().includes(q) ||
      l.category.name.toLowerCase().includes(q);
    return matchesCat && matchesQuery;
  });

  const displayedLetters = viewMode === 'unanswered' ? filteredUnanswered : letters;
  const displayedTotal = viewMode === 'unanswered' ? filteredUnanswered.length : total;

  return (
    <div>
      {/* Sticky Discovery Header + Search */}
      <div className="sticky top-[52px] md:top-0 z-20 border-b border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3]/95 dark:bg-[#181715]/95 backdrop-blur-sm">
        <div className="px-4 sm:px-6 pt-3.5 pb-3 flex items-center justify-between gap-3">
          <h1 className="font-editorial text-2xl font-semibold leading-none">Explore</h1>
          <button
            type="button"
            onClick={handleSurpriseMe}
            disabled={surprising}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] hover:border-[#80545A] px-3 py-1.5 min-h-[34px] text-xs font-medium transition-colors whitespace-nowrap shrink-0"
          >
            <Shuffle className="w-3.5 h-3.5 text-[#80545A] dark:text-[#B8838A]" />
            <span>{surprising ? 'Choosing…' : 'Random Letter'}</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="px-4 sm:px-6 pb-3">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#77736D] dark:text-[#A19B92] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search letters by topic, feeling, or keyword…"
                aria-label="Search public letters"
                className="w-full rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] pl-10 pr-4 py-2 text-sm focus:border-[#80545A] dark:focus:border-[#B8838A] focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="rounded-md bg-[#80545A] hover:bg-[#6C454A] text-white px-4 py-2 min-h-[38px] text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0"
            >
              Search
            </button>
          </form>
        </div>

        {/* Discovery View Switcher: Latest · Unanswered · Curated */}
        <div className="grid grid-cols-3 border-t border-[#E8E5DF]/70 dark:border-[#332F2A]/70 px-2 sm:px-4" role="tablist" aria-label="Discovery views">
          {(
            [
              ['latest', 'Latest'],
              ['unanswered', 'Unanswered'],
              ['curated', 'Curated'],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={viewMode === mode}
              onClick={() => handleModeChange(mode)}
              className={`py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                viewMode === mode
                  ? 'border-[#80545A] dark:border-[#B8838A] text-[#252525] dark:text-[#EAE6DF]'
                  : 'border-transparent text-[#77736D] dark:text-[#A19B92] hover:text-[#252525] dark:hover:text-[#EAE6DF]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Category Browse Strip */}
      <div
        className="border-b border-[#E8E5DF] dark:border-[#332F2A] px-4 sm:px-6 overflow-x-auto scrollbar-none flex items-center gap-5 bg-[#FFFFFF]/50 dark:bg-[#201E1B]/40"
        role="tablist"
        aria-label="Filter letters by category"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeCategory === 'all'}
          onClick={() => handleCategoryChange('all')}
          className={`py-2.5 text-xs font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors ${
            activeCategory === 'all'
              ? 'border-[#80545A] dark:border-[#B8838A] text-[#252525] dark:text-[#EAE6DF]'
              : 'border-transparent text-[#77736D] dark:text-[#A19B92] hover:text-[#252525] dark:hover:text-[#EAE6DF]'
          }`}
        >
          All Topics
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            role="tab"
            aria-selected={activeCategory === cat.slug}
            onClick={() => handleCategoryChange(cat.slug)}
            className={`py-2.5 text-xs font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors ${
              activeCategory === cat.slug
                ? 'border-[#80545A] dark:border-[#B8838A] text-[#252525] dark:text-[#EAE6DF]'
                : 'border-transparent text-[#77736D] dark:text-[#A19B92] hover:text-[#252525] dark:hover:text-[#EAE6DF]'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Curated Discovery Highlights (when viewMode === 'curated') */}
      {viewMode === 'curated' && !loading && (
        <section className="border-b border-[#E8E5DF] dark:border-[#332F2A] bg-[#F1EFE9]/40 dark:bg-[#201E1B]/45 px-4 sm:px-6 py-5 space-y-5">
          {lotd && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1.5 font-semibold text-[#80545A] dark:text-[#B8838A]">
                  <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Letter of the Day</span>
                </span>
                <Link
                  to={`/letters/${lotd.id}`}
                  className="text-[#80545A] dark:text-[#B8838A] hover:underline font-medium"
                >
                  Open thread &rarr;
                </Link>
              </div>
              {lotdNote && (
                <p className="text-xs italic text-[#77736D] dark:text-[#A19B92]">{lotdNote}</p>
              )}
              <LetterCard
                letter={lotd}
                variant="bordered"
                onUpdated={(updated) => setLotd(updated)}
                onBlockedAuthor={() => setLotd(null)}
              />
            </div>
          )}

          {categories.length > 0 && (
            <div className="space-y-2.5">
              <h2 className="text-xs font-semibold text-[#77736D] dark:text-[#A19B92]">
                Curated Reading Rooms
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {categories.slice(0, 4).map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      handleCategoryChange(cat.slug);
                      handleModeChange('latest');
                    }}
                    className="text-left rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] hover:border-[#80545A]/60 p-3.5 transition-colors space-y-1"
                  >
                    <p className="text-sm font-semibold text-[#252525] dark:text-[#EAE6DF]">
                      {cat.name}
                    </p>
                    {cat.description && (
                      <p className="text-xs text-[#77736D] dark:text-[#A19B92] line-clamp-2 leading-snug">
                        {cat.description}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Results Summary Strip */}
      {!loading && !error && (
        <div className="px-4 sm:px-6 py-2.5 border-b border-[#E8E5DF] dark:border-[#332F2A] flex items-center justify-between text-xs text-[#77736D] dark:text-[#A19B92] tabular-nums">
          <span>
            {displayedTotal} {displayedTotal === 1 ? 'public letter' : 'public letters'}
            {urlQuery ? ` matching “${urlQuery}”` : ''}
          </span>
          {(urlQuery || activeCategory !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                setSearchParams({});
              }}
              className="underline hover:text-[#252525] dark:hover:text-[#EAE6DF]"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Feed */}
      <div>
        {loading ? (
          <div className="divide-y divide-[#E8E5DF] dark:divide-[#332F2A]">
            {[1, 2, 3].map((n) => (
              <div key={n} className="px-4 sm:px-6 py-5 flex gap-3 animate-pulse">
                <div className="w-9 h-9 rounded-full bg-[#F1EFE9] dark:bg-[#282521] shrink-0" />
                <div className="flex-1 space-y-2.5">
                  <div className="h-3 w-36 bg-[#F1EFE9] dark:bg-[#282521] rounded" />
                  <div className="h-5 w-2/3 bg-[#F1EFE9] dark:bg-[#282521] rounded" />
                  <div className="h-14 w-full bg-[#F1EFE9] dark:bg-[#282521] rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="px-4 sm:px-6 py-10 text-sm space-y-3">
            <p className="text-[#80545A] dark:text-[#B8838A]">{error}</p>
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => void fetchFeed(1, false, viewMode)}
                className="underline font-medium"
              >
                Retry
              </button>
              {config?.supabaseSchemaReady === false && (
                <Link to="/setup" className="underline text-[#80545A] dark:text-[#B8838A]">
                  Open Setup &amp; Status
                </Link>
              )}
            </div>
          </div>
        ) : displayedLetters.length === 0 ? (
          <div className="px-4 sm:px-6 py-14 text-center space-y-3">
            <h2 className="font-editorial text-2xl font-semibold">No letters found</h2>
            <p className="text-sm text-[#77736D] dark:text-[#A19B92] max-w-md mx-auto">
              {urlQuery || activeCategory !== 'all'
                ? 'Try clearing your search terms or switching back to All Topics.'
                : 'No public letters match this view yet.'}
            </p>
            <div className="pt-2">
              <Link
                to="/write"
                className="inline-block rounded-md bg-[#80545A] hover:bg-[#6C454A] text-white px-5 py-2.5 text-sm font-medium"
              >
                Write a Letter
              </Link>
            </div>
          </div>
        ) : (
          <div>
            {displayedLetters.map((letter) => (
              <LetterCard
                key={letter.id}
                letter={letter}
                onUpdated={(updated) => {
                  setLetters((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
                  setUnansweredLetters((prev) =>
                    prev.map((item) => (item.id === updated.id ? updated : item))
                  );
                }}
                onBlockedAuthor={(id) => {
                  setLetters((prev) => prev.filter((item) => item.id !== id));
                  setUnansweredLetters((prev) => prev.filter((item) => item.id !== id));
                }}
              />
            ))}
            {hasMore && viewMode !== 'unanswered' && (
              <div className="px-4 sm:px-6 py-6 text-center">
                <button
                  type="button"
                  onClick={() => void fetchFeed(page + 1, true, viewMode)}
                  disabled={loadingMore}
                  className="rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] hover:border-[#80545A] px-6 py-2.5 text-sm font-medium disabled:opacity-50"
                >
                  {loadingMore ? 'Loading more…' : 'Load More Letters'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
