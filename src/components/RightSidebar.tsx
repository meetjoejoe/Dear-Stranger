import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, MailOpen, Search, Shuffle } from 'lucide-react';
import type { PublicLetterDTO } from '../shared/types.ts';
import { apiFetch } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { AuthorAvatar } from './AuthorAvatar.tsx';
import { formatSocialTime } from './LetterCard.tsx';

export function RightSidebar() {
  const { config, categories, token } = useAuth();
  const { showToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  const [quickQuery, setQuickQuery] = useState('');
  const [lotd, setLotd] = useState<PublicLetterDTO | null>(null);
  const [lotdNote, setLotdNote] = useState<string | null>(null);
  const [openSuggestions, setOpenSuggestions] = useState<PublicLetterDTO[]>([]);
  const [surprising, setSurprising] = useState(false);

  const isWriteRoute = location.pathname === '/write';
  const dbReady = !config?.supabaseConfigured || config?.supabaseSchemaReady !== false;

  useEffect(() => {
    if (!config || !dbReady || isWriteRoute) return;
    let mounted = true;

    async function loadDiscoveryRail() {
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

    void loadDiscoveryRail();
    return () => {
      mounted = false;
    };
  }, [config, dbReady, isWriteRoute, token]);

  const handleQuickSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = quickQuery.trim();
    if (!trimmed) {
      navigate('/explore');
      return;
    }
    navigate(`/explore?q=${encodeURIComponent(trimmed)}`);
  };

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
        className="hidden xl:flex flex-col w-80 shrink-0 sticky top-0 h-screen overflow-y-auto px-5 py-6 space-y-5"
      >
        <div className="rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-5 space-y-3">
          <p className="text-xs font-semibold text-[#80545A] dark:text-[#B8838A]">
            Before you post
          </p>
          <p className="font-editorial text-xl font-semibold leading-snug">
            Write for one thoughtful stranger.
          </p>
          <ul className="space-y-2 text-xs text-[#77736D] dark:text-[#A19B92] leading-relaxed">
            <li>• Leave out real names, phone numbers, addresses, and workplaces.</li>
            <li>• Public letters appear in the timeline; Unlisted letters open only by direct link.</li>
            <li>• Unfinished drafts stay private in your browser or profile desk.</li>
          </ul>
          <div className="pt-3 border-t border-[#E8E5DF] dark:border-[#332F2A] flex items-center gap-4 text-xs">
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

  const curatedTopics = categories.slice(0, 4);

  return (
    <aside
      aria-label="Social discovery"
      className="hidden xl:flex flex-col w-[328px] shrink-0 sticky top-0 h-screen overflow-y-auto px-5 py-5 space-y-4"
    >
      {/* Social Quick Search */}
      <form onSubmit={handleQuickSearch} className="relative">
        <Search className="w-4 h-4 text-[#77736D] dark:text-[#A19B92] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="search"
          value={quickQuery}
          onChange={(e) => setQuickQuery(e.target.value)}
          placeholder="Search letters & topics…"
          aria-label="Quick search public letters"
          className="w-full rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] pl-10 pr-4 py-2.5 text-sm placeholder:text-[#77736D] dark:placeholder:text-[#A19B92] focus:border-[#80545A] dark:focus:border-[#B8838A] focus:outline-none"
        />
      </form>

      {/* Letter of the Day Spotlight */}
      {lotd && (
        <section className="rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[#80545A] dark:text-[#B8838A]">
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
          <div className="pt-2 border-t border-[#E8E5DF] dark:border-[#332F2A] flex items-center justify-between gap-2 text-xs text-[#77736D] dark:text-[#A19B92]">
            <span className="inline-flex items-center gap-2 min-w-0">
              <AuthorAvatar name={lotd.authorDisplayName} size="sm" />
              <span className="truncate">{lotd.authorDisplayName}</span>
            </span>
            <Link
              to={`/letters/${lotd.id}`}
              className="font-medium text-[#80545A] dark:text-[#B8838A] hover:underline whitespace-nowrap shrink-0"
            >
              Read thread &rarr;
            </Link>
          </div>
        </section>
      )}

      {/* Unanswered / Open Letterbox Suggestions */}
      {openSuggestions.length > 0 && (
        <section className="rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-[#252525] dark:text-[#EAE6DF]">
                Needs a First Reply
              </h2>
              <p className="text-[11px] text-[#77736D] dark:text-[#A19B92]">
                Open Letterbox · waiting to be heard
              </p>
            </div>
            <MailOpen className="w-4 h-4 text-[#80545A] dark:text-[#B8838A] shrink-0" aria-hidden="true" />
          </div>
          <div className="divide-y divide-[#E8E5DF] dark:divide-[#332F2A]">
            {openSuggestions.map((letter) => (
              <Link
                key={letter.id}
                to={`/letters/${letter.id}`}
                className="block py-2.5 group space-y-1"
              >
                <div className="flex items-center justify-between gap-2 text-[11px] text-[#77736D] dark:text-[#A19B92]">
                  <span className="font-medium text-[#252525] dark:text-[#EAE6DF] truncate">
                    {letter.authorDisplayName}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {formatSocialTime(letter.publishedAt || letter.createdAt)}
                  </span>
                </div>
                <p className="font-editorial text-base font-semibold leading-snug text-[#252525] dark:text-[#EAE6DF] group-hover:text-[#80545A] dark:group-hover:text-[#B8838A] transition-colors line-clamp-1">
                  {letter.title || letter.body.slice(0, 60)}
                </p>
                <p className="text-xs text-[#77736D] dark:text-[#A19B92] line-clamp-2 leading-relaxed">
                  {letter.body}
                </p>
              </Link>
            ))}
          </div>
          <Link
            to="/open-letterbox"
            className="inline-flex items-center gap-1 text-xs font-medium text-[#80545A] dark:text-[#B8838A] hover:underline pt-1"
          >
            <span>See all unanswered</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </section>
      )}

      {/* Topics & Random Discovery */}
      <section className="rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[#252525] dark:text-[#EAE6DF]">
            Explore Topics
          </h2>
          <button
            type="button"
            onClick={handleSurpriseMe}
            disabled={surprising}
            className="inline-flex items-center gap-1 text-xs font-medium text-[#80545A] dark:text-[#B8838A] hover:underline whitespace-nowrap shrink-0 disabled:opacity-50"
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
                className="py-2 flex items-center justify-between gap-2 text-xs sm:text-sm text-[#252525] dark:text-[#EAE6DF] hover:text-[#80545A] dark:hover:text-[#B8838A] transition-colors group"
              >
                <span className="truncate">{cat.name}</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#77736D] dark:text-[#A19B92] opacity-55 group-hover:opacity-100 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Curated Collections */}
      {curatedTopics.length > 0 && (
        <section className="rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#F1EFE9]/55 dark:bg-[#201E1B] p-4 space-y-2.5">
          <h2 className="text-xs font-semibold text-[#77736D] dark:text-[#A19B92]">
            Curated Reading Rooms
          </h2>
          <div className="space-y-2.5">
            {curatedTopics.map((cat) => (
              <Link
                key={cat.id}
                to={`/explore?category=${cat.slug}`}
                className="block group"
              >
                <p className="text-xs font-semibold text-[#252525] dark:text-[#EAE6DF] group-hover:text-[#80545A] dark:group-hover:text-[#B8838A] transition-colors">
                  {cat.name}
                </p>
                {cat.description && (
                  <p className="text-[11px] text-[#77736D] dark:text-[#A19B92] leading-snug line-clamp-2">
                    {cat.description}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Quiet Community Guidelines Reminder */}
      <section className="px-1 space-y-2 text-[11px] text-[#77736D] dark:text-[#A19B92] leading-relaxed">
        <p className="font-medium text-[#252525] dark:text-[#EAE6DF]">
          Safe anonymous conversation · 18+
        </p>
        <p>
          Letters are shared without follower counts or ranking scores. Keep personal identifiers
          private and reply with care.
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
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
      </section>
    </aside>
  );
}
