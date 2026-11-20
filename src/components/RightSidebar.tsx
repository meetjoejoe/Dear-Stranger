import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, MailOpen, Shuffle } from 'lucide-react';
import type { PublicLetterDTO } from '../shared/types.ts';
import { apiFetch } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { formatEditorialDate } from './LetterCard.tsx';

export function RightSidebar() {
  const { config, categories, token } = useAuth();
  const { showToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  const [lotd, setLotd] = useState<PublicLetterDTO | null>(null);
  const [lotdNote, setLotdNote] = useState<string | null>(null);
  const [openSuggestions, setOpenSuggestions] = useState<PublicLetterDTO[]>([]);
  const [surprising, setSurprising] = useState(false);

  const isWriteRoute = location.pathname === '/write';
  const dbReady = !config?.supabaseConfigured || config?.supabaseSchemaReady !== false;

  useEffect(() => {
    if (!config || !dbReady || isWriteRoute) return;
    let mounted = true;

    async function loadEditorialRail() {
      const [lotdResult, openResult] = await Promise.allSettled([
        apiFetch<{ letter: PublicLetterDTO | null; editorNote: string | null }>(
          '/api/letters/letter-of-the-day',
          { token }
        ),
        apiFetch<{ letters: PublicLetterDTO[] }>('/api/letters/open-letterbox', { token }),
      ]);

      if (!mounted) return;
      if (lotdResult.status === 'fulfilled') {
        setLotd(lotdResult.value?.letter ?? null);
        setLotdNote(lotdResult.value?.editorNote ?? null);
      }
      if (openResult.status === 'fulfilled') {
        const list = Array.isArray(openResult.value?.letters) ? openResult.value.letters : [];
        setOpenSuggestions(list.slice(0, 3));
      }
    }

    void loadEditorialRail();
    return () => {
      mounted = false;
    };
  }, [config, dbReady, isWriteRoute, token]);

  const handleSurpriseMe = async () => {
    if (surprising) return;
    setSurprising(true);
    try {
      const res = await apiFetch<{ letter: PublicLetterDTO | null }>('/api/letters/surprise', {
        token,
      });
      if (!res.letter) {
        showToast('No public letters are available yet.', 'info');
        return;
      }
      navigate(`/letters/${res.letter.id}`);
    } catch {
      showToast('Could not select a random letter right now.', 'error');
    } finally {
      setSurprising(false);
    }
  };

  if (isWriteRoute) {
    return (
      <aside
        aria-label="Writing guidance"
        className="hidden xl:flex flex-col w-80 shrink-0 sticky top-0 h-screen overflow-y-auto px-6 py-8 space-y-6"
      >
        <div className="rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-5 space-y-3">
          <p className="text-[11px] uppercase tracking-widest text-[#80545A] dark:text-[#B8838A] font-medium">
            Before You Send
          </p>
          <p className="font-editorial text-xl font-semibold leading-snug">
            Write for one thoughtful reader.
          </p>
          <ul className="space-y-2 text-xs text-[#77736D] dark:text-[#A19B92] leading-relaxed">
            <li>• Leave out real names, phone numbers, addresses, and workplaces.</li>
            <li>• Choose Public to appear in the community timeline, or Unlisted for link-only sharing.</li>
            <li>• Unfinished drafts stay private in your local browser or account dashboard.</li>
          </ul>
          <div className="pt-2 border-t border-[#E8E5DF] dark:border-[#332F2A] flex items-center gap-4 text-xs">
            <Link
              to="/guidelines"
              className="text-[#80545A] dark:text-[#B8838A] hover:underline font-medium"
            >
              Community Guidelines
            </Link>
            <Link
              to="/privacy"
              className="text-[#77736D] dark:text-[#A19B92] hover:text-[#252525] dark:hover:text-[#EAE6DF]"
            >
              Privacy
            </Link>
          </div>
        </div>
      </aside>
    );
  }

  const curatedCollections = categories.slice(0, 4);

  return (
    <aside
      aria-label="Editorial discovery"
      className="hidden xl:flex flex-col w-80 shrink-0 sticky top-0 h-screen overflow-y-auto px-5 py-6 space-y-5"
    >
      {/* Letter of the Day */}
      {lotd && (
        <section className="rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] uppercase tracking-widest text-[#80545A] dark:text-[#B8838A] font-medium">
              Letter of the Day
            </span>
            <BookOpen className="w-3.5 h-3.5 text-[#80545A] dark:text-[#B8838A]" aria-hidden="true" />
          </div>
          {lotdNote && (
            <p className="text-xs italic text-[#77736D] dark:text-[#A19B92] leading-relaxed">
              {lotdNote}
            </p>
          )}
          <Link to={`/letters/${lotd.id}`} className="block group space-y-1.5">
            <h2 className="font-editorial text-xl font-semibold leading-snug text-[#252525] dark:text-[#EAE6DF] group-hover:text-[#80545A] dark:group-hover:text-[#B8838A] transition-colors">
              {lotd.title || 'Untitled letter'}
            </h2>
            <p className="text-xs text-[#77736D] dark:text-[#A19B92] leading-relaxed line-clamp-3">
              {lotd.body}
            </p>
          </Link>
          <div className="pt-2 border-t border-[#E8E5DF] dark:border-[#332F2A] flex items-center justify-between text-xs text-[#77736D] dark:text-[#A19B92]">
            <span>{lotd.authorDisplayName}</span>
            <Link
              to={`/letters/${lotd.id}`}
              className="font-medium text-[#80545A] dark:text-[#B8838A] hover:underline whitespace-nowrap shrink-0"
            >
              Read letter &rarr;
            </Link>
          </div>
        </section>
      )}

      {/* Explore Topics */}
      <section className="rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-editorial text-xl font-semibold">Explore Topics</h2>
          <button
            type="button"
            onClick={handleSurpriseMe}
            disabled={surprising}
            className="inline-flex items-center gap-1 text-xs text-[#80545A] dark:text-[#B8838A] hover:underline whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            <Shuffle className="w-3 h-3" />
            {surprising ? 'Choosing…' : 'Surprise Me'}
          </button>
        </div>
        <ul className="divide-y divide-[#E8E5DF] dark:divide-[#332F2A]">
          {categories.map((cat) => (
            <li key={cat.id}>
              <Link
                to={`/explore?category=${cat.slug}`}
                className="py-2 flex items-center justify-between gap-2 text-sm text-[#252525] dark:text-[#EAE6DF] hover:text-[#80545A] dark:hover:text-[#B8838A] transition-colors group"
              >
                <span className="truncate">{cat.name}</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#77736D] dark:text-[#A19B92] opacity-60 group-hover:opacity-100 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Open Letterbox Suggestions */}
      {openSuggestions.length > 0 && (
        <section className="rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] uppercase tracking-widest text-[#80545A] dark:text-[#B8838A] font-medium">
                Awaiting a Reply
              </p>
              <h2 className="font-editorial text-xl font-semibold">Open Letterbox</h2>
            </div>
            <MailOpen className="w-4 h-4 text-[#77736D] dark:text-[#A19B92]" aria-hidden="true" />
          </div>
          <div className="divide-y divide-[#E8E5DF] dark:divide-[#332F2A]">
            {openSuggestions.map((letter) => (
              <Link
                key={letter.id}
                to={`/letters/${letter.id}`}
                className="block py-2.5 group space-y-1"
              >
                <p className="font-editorial text-base font-semibold leading-snug text-[#252525] dark:text-[#EAE6DF] group-hover:text-[#80545A] dark:group-hover:text-[#B8838A] transition-colors line-clamp-1">
                  {letter.title || letter.body.slice(0, 60)}
                </p>
                <p className="text-xs text-[#77736D] dark:text-[#A19B92] line-clamp-2">
                  {letter.body}
                </p>
                <p className="text-[11px] text-[#77736D] dark:text-[#A19B92]">
                  {letter.authorDisplayName} · {formatEditorialDate(letter.publishedAt || letter.createdAt)}
                </p>
              </Link>
            ))}
          </div>
          <Link
            to="/open-letterbox"
            className="inline-block text-xs font-medium text-[#80545A] dark:text-[#B8838A] hover:underline pt-1"
          >
            Browse Open Letterbox &rarr;
          </Link>
        </section>
      )}

      {/* Curated Collections */}
      {curatedCollections.length > 0 && (
        <section className="rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#F1EFE9]/60 dark:bg-[#201E1B] p-5 space-y-3">
          <p className="text-[11px] uppercase tracking-widest text-[#77736D] dark:text-[#A19B92] font-medium">
            Curated Reading Rooms
          </p>
          <div className="space-y-2.5">
            {curatedCollections.map((cat) => (
              <Link
                key={cat.id}
                to={`/explore?category=${cat.slug}`}
                className="block group"
              >
                <p className="text-sm font-medium text-[#252525] dark:text-[#EAE6DF] group-hover:text-[#80545A] dark:group-hover:text-[#B8838A] transition-colors">
                  {cat.name}
                </p>
                {cat.description && (
                  <p className="text-xs text-[#77736D] dark:text-[#A19B92] leading-snug line-clamp-2">
                    {cat.description}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Community Guidelines & Copyright */}
      <section className="px-1 space-y-2.5 text-xs text-[#77736D] dark:text-[#A19B92] leading-relaxed">
        <p className="font-medium text-[#252525] dark:text-[#EAE6DF]">
          Quiet correspondence for adults 18+
        </p>
        <p>
          Speak gently, guard anonymity, and never share identifying private details. No follower
          counts or trending algorithms.
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
          <Link to="/guidelines" className="hover:text-[#252525] dark:hover:text-[#EAE6DF] underline">
            Guidelines
          </Link>
          <Link to="/privacy" className="hover:text-[#252525] dark:hover:text-[#EAE6DF] underline">
            Privacy
          </Link>
          <Link to="/setup" className="hover:text-[#252525] dark:hover:text-[#EAE6DF] underline">
            Setup
          </Link>
        </div>
        <p className="pt-1">&copy; {new Date().getFullYear()} Awesome Studios. All rights reserved.</p>
      </section>
    </aside>
  );
}
