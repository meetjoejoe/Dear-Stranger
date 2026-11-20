import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Shuffle } from 'lucide-react';
import type { PublicLetterDTO } from '../shared/types.ts';
import { apiFetch } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { LetterCard } from '../components/LetterCard.tsx';

export function ExplorePage() {
  const { config, categories, token } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeCategory = searchParams.get('category') || 'all';
  const urlQuery = searchParams.get('q') || '';

  const [searchInput, setSearchInput] = useState(urlQuery);
  const [letters, setLetters] = useState<PublicLetterDTO[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentSurpriseIds, setRecentSurpriseIds] = useState<string[]>([]);
  const [surprising, setSurprising] = useState(false);

  const fetchFeed = useCallback(
    async (pageNum: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        if (activeCategory && activeCategory !== 'all') qs.set('category', activeCategory);
        if (urlQuery) qs.set('q', urlQuery);
        qs.set('page', String(pageNum));
        qs.set('limit', '10');

        const res = await apiFetch<{
          letters: PublicLetterDTO[];
          total: number;
          page: number;
          hasMore: boolean;
        }>(`/api/letters?${qs.toString()}`, { token });

        const nextLetters = Array.isArray(res?.letters) ? res.letters : [];
        setLetters((prev) => (append ? [...prev, ...nextLetters] : nextLetters));
        setTotal(typeof res?.total === 'number' ? res.total : nextLetters.length);
        setPage(typeof res?.page === 'number' ? res.page : pageNum);
        setHasMore(Boolean(res?.hasMore));
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
    void fetchFeed(1, false);
  }, [activeCategory, urlQuery, fetchFeed]);

  const handleCategoryChange = (slug: string) => {
    const next = new URLSearchParams(searchParams);
    if (slug === 'all') next.delete('category');
    else next.set('category', slug);
    setSearchParams(next);
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

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-8 border-b border-[#E8E5DF] dark:border-[#332F2A]">
        <div>
          <h1 className="font-editorial text-3xl sm:text-4xl font-semibold">Explore Letters</h1>
          <p className="text-sm text-[#77736D] dark:text-[#A19B92] mt-1.5">
            Discover public letters shared anonymously by strangers.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSurpriseMe}
          disabled={surprising}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] hover:border-[#80545A] px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0"
        >
          <Shuffle className="w-4 h-4 text-[#80545A] dark:text-[#B8838A]" />
          {surprising ? 'Choosing…' : 'Surprise Me'}
        </button>
      </div>

      {/* Search & Category Filters */}
      <div className="mt-6 space-y-4">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#77736D] dark:text-[#A19B92] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search public letters by topic, feeling, or keyword…"
              aria-label="Search public letters"
              className="w-full rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] pl-10 pr-4 py-2.5 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-[#80545A] hover:bg-[#6C454A] text-white px-5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0"
          >
            Search
          </button>
        </form>

        <div
          className="flex flex-wrap items-center gap-1.5 p-1 rounded-lg bg-[#F1EFE9] dark:bg-[#282521]"
          role="tablist"
          aria-label="Filter letters by category"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeCategory === 'all'}
            onClick={() => handleCategoryChange('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeCategory === 'all'
                ? 'bg-[#FFFFFF] dark:bg-[#201E1B] text-[#252525] dark:text-[#EAE6DF] shadow-xs'
                : 'text-[#77736D] dark:text-[#A19B92] hover:text-[#252525] dark:hover:text-[#EAE6DF]'
            }`}
          >
            All Categories
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={activeCategory === cat.slug}
              onClick={() => handleCategoryChange(cat.slug)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeCategory === cat.slug
                  ? 'bg-[#FFFFFF] dark:bg-[#201E1B] text-[#252525] dark:text-[#EAE6DF] shadow-xs'
                  : 'text-[#77736D] dark:text-[#A19B92] hover:text-[#252525] dark:hover:text-[#EAE6DF]'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Results Count */}
      {!loading && !error && (
        <div className="mt-6 flex items-center justify-between text-xs text-[#77736D] dark:text-[#A19B92] tabular-nums">
          <span>
            {total} {total === 1 ? 'public letter' : 'public letters'}
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

      {/* Feed States */}
      <div className="mt-6">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-44 rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] animate-pulse"
              />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-6 text-sm space-y-3">
            <p className="text-[#80545A] dark:text-[#B8838A]">{error}</p>
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => void fetchFeed(1, false)}
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
        ) : letters.length === 0 ? (
          <div className="rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-10 text-center space-y-3">
            <h2 className="font-editorial text-2xl font-semibold">No letters found</h2>
            <p className="text-sm text-[#77736D] dark:text-[#A19B92] max-w-md mx-auto">
              {urlQuery || activeCategory !== 'all'
                ? 'Try clearing your search terms or switching to All Categories.'
                : 'No public letters have been published yet.'}
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
          <div className="space-y-5">
            {letters.map((letter) => (
              <LetterCard key={letter.id} letter={letter} />
            ))}
            {hasMore && (
              <div className="pt-4 text-center">
                <button
                  type="button"
                  onClick={() => void fetchFeed(page + 1, true)}
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
