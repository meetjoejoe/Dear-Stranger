import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import type { PublicLetterDTO } from '../shared/types.ts';
import { apiFetch } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { LetterCard } from '../components/LetterCard.tsx';

export function OpenLetterboxPage() {
  const { config, categories, token } = useAuth();
  const [letters, setLetters] = useState<PublicLetterDTO[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch<{ letters: PublicLetterDTO[] }>(
          '/api/letters/open-letterbox',
          { token }
        );
        if (mounted) setLetters(Array.isArray(res?.letters) ? res.letters : []);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Unable to load Open Letterbox.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [token]);

  const visibleLetters =
    selectedCategory === 'all'
      ? letters
      : letters.filter((l) => l.category.slug === selectedCategory);

  return (
    <div>
      {/* Sticky Header */}
      <div className="sticky top-[52px] md:top-0 z-20 px-4 sm:px-6 py-4 border-b border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3]/95 dark:bg-[#181715]/95 backdrop-blur-sm space-y-1">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-editorial text-2xl font-semibold leading-none">
            Unanswered Letters
          </h1>
          <span className="inline-flex items-center gap-1.5 text-xs text-[#80545A] dark:text-[#B8838A] font-medium">
            <Inbox className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Open Letterbox</span>
          </span>
        </div>
        <p className="text-xs text-[#77736D] dark:text-[#A19B92] leading-relaxed">
          Public letters with few or no replies yet that would welcome a thoughtful first response.
        </p>
      </div>

      {/* Category Filter Strip */}
      <div
        className="border-b border-[#E8E5DF] dark:border-[#332F2A] px-4 sm:px-6 overflow-x-auto scrollbar-none flex items-center gap-5 bg-[#FFFFFF]/50 dark:bg-[#201E1B]/40"
        role="tablist"
        aria-label="Filter unanswered letters by topic"
      >
        <button
          type="button"
          role="tab"
          aria-selected={selectedCategory === 'all'}
          onClick={() => setSelectedCategory('all')}
          className={`py-2.5 text-xs font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors ${
            selectedCategory === 'all'
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
            aria-selected={selectedCategory === cat.slug}
            onClick={() => setSelectedCategory(cat.slug)}
            className={`py-2.5 text-xs font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors ${
              selectedCategory === cat.slug
                ? 'border-[#80545A] dark:border-[#B8838A] text-[#252525] dark:text-[#EAE6DF]'
                : 'border-transparent text-[#77736D] dark:text-[#A19B92] hover:text-[#252525] dark:hover:text-[#EAE6DF]'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

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
          <div className="px-4 sm:px-6 py-10 space-y-3 text-sm">
            <p className="text-[#80545A] dark:text-[#B8838A]">{error}</p>
            {config?.supabaseSchemaReady === false && (
              <Link to="/setup" className="underline text-[#80545A] dark:text-[#B8838A]">
                Open Setup &amp; Status
              </Link>
            )}
          </div>
        ) : visibleLetters.length === 0 ? (
          <div className="px-4 sm:px-6 py-14 text-center space-y-3">
            <h2 className="font-editorial text-2xl font-semibold">
              {selectedCategory !== 'all'
                ? 'No unanswered letters in this topic right now'
                : 'Every open letter has been answered'}
            </h2>
            <p className="text-sm text-[#77736D] dark:text-[#A19B92] max-w-md mx-auto">
              Check back soon or browse all public conversations in Explore.
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              {selectedCategory !== 'all' && (
                <button
                  type="button"
                  onClick={() => setSelectedCategory('all')}
                  className="rounded-md border border-[#E8E5DF] dark:border-[#332F2A] px-4 py-2 text-sm hover:bg-[#F1EFE9] dark:hover:bg-[#282521]"
                >
                  View all topics
                </button>
              )}
              <Link
                to="/explore"
                className="rounded-md bg-[#80545A] hover:bg-[#6C454A] text-white px-5 py-2 text-sm font-medium"
              >
                Explore All Letters
              </Link>
            </div>
          </div>
        ) : (
          <div>
            {visibleLetters.map((letter) => (
              <LetterCard
                key={letter.id}
                letter={letter}
                onUpdated={(updated) =>
                  setLetters((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
                }
                onBlockedAuthor={(id) =>
                  setLetters((prev) => prev.filter((item) => item.id !== id))
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
