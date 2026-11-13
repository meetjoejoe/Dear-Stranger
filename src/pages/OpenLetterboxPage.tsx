import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PublicLetterDTO } from '../shared/types.ts';
import { apiFetch } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { LetterCard } from '../components/LetterCard.tsx';

export function OpenLetterboxPage() {
  const { token } = useAuth();
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
        if (mounted) setLetters(res.letters);
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
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <div className="pb-8 border-b border-[#E8E5DF] dark:border-[#332F2A] space-y-2">
        <p className="text-xs uppercase tracking-widest text-[#80545A] dark:text-[#B8838A] font-medium">
          Thoughtful Discovery
        </p>
        <h1 className="font-editorial text-3xl sm:text-4xl font-semibold">Open Letterbox</h1>
        <p className="text-sm sm:text-base text-[#77736D] dark:text-[#A19B92] max-w-2xl leading-relaxed">
          Public letters that have received few or no replies yet and could welcome a kind,
          considered response. Letters are surfaced to encourage connection, never ranked by
          popularity.
        </p>
      </div>

      <div className="mt-8">
        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((n) => (
              <div
                key={n}
                className="h-44 rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] animate-pulse"
              />
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-[#80545A] dark:text-[#B8838A]">{error}</p>
        ) : letters.length === 0 ? (
          <div className="rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-10 text-center space-y-3">
            <h2 className="font-editorial text-2xl font-semibold">Every open letter has been answered</h2>
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
          <div className="space-y-5">
            {letters.map((letter) => (
              <LetterCard key={letter.id} letter={letter} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
