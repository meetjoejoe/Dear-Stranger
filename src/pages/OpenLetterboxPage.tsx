import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PublicLetterDTO } from '../shared/types.ts';
import { apiFetch } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { LetterCard } from '../components/LetterCard.tsx';

export function OpenLetterboxPage() {
  const { config, token } = useAuth();
  const [letters, setLetters] = useState<PublicLetterDTO[]>([]);
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

  return (
    <div>
      <div className="px-4 sm:px-6 py-6 border-b border-[#E8E5DF] dark:border-[#332F2A] space-y-1.5">
        <p className="text-[11px] uppercase tracking-widest text-[#80545A] dark:text-[#B8838A] font-medium">
          Thoughtful Discovery
        </p>
        <h1 className="font-editorial text-2xl sm:text-3xl font-semibold">Open Letterbox</h1>
        <p className="text-xs sm:text-sm text-[#77736D] dark:text-[#A19B92] max-w-xl leading-relaxed">
          Public letters that have received few or no replies yet and could welcome a kind,
          considered response. Never ranked by popularity.
        </p>
      </div>

      <div>
        {loading ? (
          <div className="divide-y divide-[#E8E5DF] dark:divide-[#332F2A]">
            {[1, 2].map((n) => (
              <div key={n} className="px-4 sm:px-6 py-6 space-y-3 animate-pulse">
                <div className="h-3 w-36 bg-[#F1EFE9] dark:bg-[#282521] rounded" />
                <div className="h-6 w-2/3 bg-[#F1EFE9] dark:bg-[#282521] rounded" />
                <div className="h-16 w-full bg-[#F1EFE9] dark:bg-[#282521] rounded" />
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
        ) : letters.length === 0 ? (
          <div className="px-4 sm:px-6 py-14 text-center space-y-3">
            <h2 className="font-editorial text-2xl font-semibold">
              Every open letter has been answered
            </h2>
            <p className="text-sm text-[#77736D] dark:text-[#A19B92] max-w-md mx-auto">
              Check back soon or browse all public letters in Explore.
            </p>
            <Link
              to="/explore"
              className="inline-block rounded-md bg-[#80545A] hover:bg-[#6C454A] text-white px-5 py-2.5 text-sm font-medium mt-2"
            >
              Explore All Letters
            </Link>
          </div>
        ) : (
          <div>
            {letters.map((letter) => (
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
