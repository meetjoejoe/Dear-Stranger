import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Maximize2, PenLine, Shuffle, Sparkles } from 'lucide-react';
import {
  MAX_LETTER_LENGTH,
  MAX_TITLE_LENGTH,
  MIN_LETTER_LENGTH,
  type PublicLetterDTO,
} from '../shared/types.ts';
import { screenContentForSafety } from '../shared/validation.ts';
import { apiFetch } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { AuthorAvatar } from '../components/AuthorAvatar.tsx';
import { LetterCard } from '../components/LetterCard.tsx';
import { SafetySupportBanner } from '../components/SafetySupportBanner.tsx';

type HomeFeedTab = 'latest' | 'unanswered' | 'discover';

const LOCAL_DRAFT_KEY = 'ds_local_letter_draft';

export function HomePage() {
  const { config, categories, profile, token, openAuthPrompt, refreshConfig } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [feedTab, setFeedTab] = useState<HomeFeedTab>('latest');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [letters, setLetters] = useState<PublicLetterDTO[]>([]);
  const [unansweredLetters, setUnansweredLetters] = useState<PublicLetterDTO[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [letterOfTheDay, setLetterOfTheDay] = useState<PublicLetterDTO | null>(null);
  const [editorNote, setEditorNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingSamples, setLoadingSamples] = useState(false);
  const [surprising, setSurprising] = useState(false);

  // Compact Social Composer State
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [draftCategoryId, setDraftCategoryId] = useState('');
  const [draftVisibility, setDraftVisibility] = useState<'public' | 'unlisted'>('public');
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (!draftCategoryId && categories.length > 0) {
      setDraftCategoryId(categories[0].id);
    }
  }, [categories, draftCategoryId]);

  const loadFeed = useCallback(
    async (tab: HomeFeedTab, pageNum: number, append: boolean, categorySlug: string) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        if (tab === 'unanswered') {
          const [openRes, lotdRes] = await Promise.all([
            apiFetch<{ letters: PublicLetterDTO[] }>('/api/letters/open-letterbox', { token }),
            apiFetch<{ letter: PublicLetterDTO | null; editorNote: string | null }>(
              '/api/letters/letter-of-the-day',
              { token }
            ).catch(() => ({ letter: null, editorNote: null })),
          ]);
          const list = Array.isArray(openRes?.letters) ? openRes.letters : [];
          setUnansweredLetters(list);
          setHasMore(false);
          setPage(1);
          setLetterOfTheDay(lotdRes?.letter ?? null);
          setEditorNote(lotdRes?.editorNote ?? null);
          return;
        }

        const qs = new URLSearchParams();
        if (categorySlug && categorySlug !== 'all') qs.set('category', categorySlug);
        qs.set('page', String(pageNum));
        qs.set('limit', tab === 'discover' ? '12' : '8');

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
          setLetters(
            tab === 'discover'
              ? [...next].sort((a, b) => a.replyCount - b.replyCount)
              : next
          );
          setPage(typeof feedRes?.page === 'number' ? feedRes.page : 1);
          setHasMore(Boolean(feedRes?.hasMore));
          setLetterOfTheDay(lotdRes?.letter ?? null);
          setEditorNote(lotdRes?.editorNote ?? null);
        } else {
          const feedRes = await feedPromise;
          const next = Array.isArray(feedRes?.letters) ? feedRes.letters : [];
          setLetters((prev) => [...prev, ...next]);
          setPage(typeof feedRes?.page === 'number' ? feedRes.page : pageNum);
          setHasMore(Boolean(feedRes?.hasMore));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load letters.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [token]
  );

  useEffect(() => {
    void loadFeed(feedTab, 1, false, selectedCategory);
  }, [feedTab, loadFeed, selectedCategory]);

  const handleLoadSandboxSamples = async () => {
    setLoadingSamples(true);
    try {
      await apiFetch('/api/sandbox/samples', { method: 'POST' });
      await refreshConfig();
      await loadFeed(feedTab, 1, false, selectedCategory);
      showToast('Loaded labelled sandbox sample letters for preview.', 'info');
    } catch {
      showToast('Could not load sandbox samples.', 'error');
    } finally {
      setLoadingSamples(false);
    }
  };

  const handleSurpriseMe = async () => {
    if (surprising) return;
    setSurprising(true);
    try {
      const res = await apiFetch<{ letter: PublicLetterDTO | null }>('/api/letters/surprise', {
        token,
      });
      if (!res.letter) {
        showToast('No public letters available yet.', 'info');
        return;
      }
      navigate(`/letters/${res.letter.id}`);
    } catch {
      showToast('Could not select a random letter right now.', 'error');
    } finally {
      setSurprising(false);
    }
  };

  const handleExpandFullEditor = () => {
    try {
      if (draftTitle.trim() || draftBody.trim()) {
        localStorage.setItem(
          LOCAL_DRAFT_KEY,
          JSON.stringify({
            title: draftTitle,
            body: draftBody,
            categoryId: draftCategoryId,
            visibility: draftVisibility,
          })
        );
      }
    } catch {
      // ignore quota issues
    }
    navigate('/write');
  };

  const handleComposerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !profile?.ageConfirmedAt) {
      openAuthPrompt(
        token
          ? 'Please confirm that you are 18 or older before publishing.'
          : 'Continue anonymously or with Google to publish your letter.'
      );
      return;
    }

    const trimmed = draftBody.trim();
    if (trimmed.length < MIN_LETTER_LENGTH) {
      showToast(`Please write at least ${MIN_LETTER_LENGTH} characters before posting.`, 'error');
      return;
    }
    if (!draftCategoryId) {
      showToast('Please choose a topic category.', 'error');
      return;
    }

    setPosting(true);
    try {
      const res = await apiFetch<{
        letter: PublicLetterDTO;
        safetyNotice: { imminentHarmDetected: boolean; flaggedForReview: boolean };
      }>('/api/letters', {
        method: 'POST',
        token,
        body: JSON.stringify({
          title: draftTitle.trim() || null,
          body: draftBody,
          categoryId: draftCategoryId,
          visibility: draftVisibility,
          status: 'published',
          allowExternalSharing: true,
        }),
      });

      setDraftTitle('');
      setDraftBody('');
      setComposerExpanded(false);
      localStorage.removeItem(LOCAL_DRAFT_KEY);

      if (res.safetyNotice.flaggedForReview) {
        showToast(
          'Your letter was saved and queued for a quick safety review before appearing publicly.',
          'info'
        );
        navigate('/dashboard?tab=letters');
      } else if (draftVisibility === 'unlisted') {
        showToast('Unlisted letter published. Opening direct link…', 'success');
        navigate(`/letters/${res.letter.id}`);
      } else {
        showToast('Your letter is now live in the timeline.', 'success');
        if (feedTab === 'unanswered') {
          setUnansweredLetters((prev) => [res.letter, ...prev]);
        } else {
          setLetters((prev) => [res.letter, ...prev]);
        }
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not post letter.', 'error');
    } finally {
      setPosting(false);
    }
  };

  const handleLetterUpdated = (updated: PublicLetterDTO) => {
    setLetters((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    setUnansweredLetters((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    if (letterOfTheDay?.id === updated.id) setLetterOfTheDay(updated);
  };

  const handleBlockedAuthor = (letterId: string) => {
    setLetters((prev) => prev.filter((item) => item.id !== letterId));
    setUnansweredLetters((prev) => prev.filter((item) => item.id !== letterId));
    if (letterOfTheDay?.id === letterId) setLetterOfTheDay(null);
  };

  const visibleUnanswered =
    selectedCategory === 'all'
      ? unansweredLetters
      : unansweredLetters.filter((l) => l.category.slug === selectedCategory);

  const displayedLetters = feedTab === 'unanswered' ? visibleUnanswered : letters;
  const safetyPreview = screenContentForSafety(`${draftTitle}\n${draftBody}`);
  const draftLength = draftBody.trim().length;

  return (
    <div>
      {/* Sticky Social Timeline Header */}
      <div className="sticky top-[52px] md:top-0 z-20 border-b border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3]/95 dark:bg-[#181715]/95 backdrop-blur-sm">
        <div className="px-4 sm:px-6 pt-3.5 pb-2 flex items-center justify-between gap-4">
          <h1 className="font-editorial text-2xl font-semibold leading-none">Home</h1>
          <div className="flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={handleSurpriseMe}
              disabled={surprising}
              className="xl:hidden inline-flex items-center gap-1 text-[#77736D] dark:text-[#A19B92] hover:text-[#80545A] dark:hover:text-[#B8838A] whitespace-nowrap"
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>{surprising ? 'Picking…' : 'Random'}</span>
            </button>
            <Link
              to="/explore"
              className="font-medium text-[#80545A] dark:text-[#B8838A] hover:underline whitespace-nowrap shrink-0"
            >
              Explore &rarr;
            </Link>
          </div>
        </div>

        {/* Social Feed Mode Tabs: Latest · Unanswered · Discover */}
        <div className="grid grid-cols-3 px-2 sm:px-4" role="tablist" aria-label="Timeline views">
          {(
            [
              ['latest', 'Latest'],
              ['unanswered', 'Unanswered'],
              ['discover', 'Discover'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={feedTab === id}
              onClick={() => setFeedTab(id)}
              className={`py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                feedTab === id
                  ? 'border-[#80545A] dark:border-[#B8838A] text-[#252525] dark:text-[#EAE6DF]'
                  : 'border-transparent text-[#77736D] dark:text-[#A19B92] hover:text-[#252525] dark:hover:text-[#EAE6DF]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Compact Inline Letter Composer */}
      <section
        aria-label="Quick letter composer"
        className="px-4 sm:px-6 py-4 border-b border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF]/80 dark:bg-[#201E1B]/70"
      >
        <form onSubmit={handleComposerSubmit} className="flex items-start gap-3">
          <div className="pt-0.5 shrink-0">
            <AuthorAvatar name={profile?.displayName || 'Stranger'} size="md" />
          </div>

          <div className="min-w-0 flex-1 space-y-2.5">
            {composerExpanded && (
              <input
                type="text"
                maxLength={MAX_TITLE_LENGTH}
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder="Optional letter title…"
                aria-label="Optional letter title"
                className="w-full bg-transparent font-editorial text-xl font-semibold text-[#252525] dark:text-[#EAE6DF] placeholder:text-[#77736D]/70 dark:placeholder:text-[#A19B92]/70 focus:outline-none border-b border-[#E8E5DF] dark:border-[#332F2A] pb-1.5"
              />
            )}

            <textarea
              rows={composerExpanded ? 4 : 2}
              maxLength={MAX_LETTER_LENGTH}
              value={draftBody}
              onFocus={() => setComposerExpanded(true)}
              onChange={(e) => {
                setDraftBody(e.target.value);
                if (!composerExpanded) setComposerExpanded(true);
              }}
              placeholder={
                profile
                  ? `Share an honest letter as ${profile.displayName}…`
                  : 'Write something easier to tell a stranger…'
              }
              aria-label="Write a quick letter"
              className="w-full resize-none bg-transparent text-[15px] leading-relaxed text-[#252525] dark:text-[#EAE6DF] placeholder:text-[#77736D] dark:placeholder:text-[#A19B92] focus:outline-none"
            />

            {safetyPreview.imminentHarmDetected && (
              <div className="pt-1">
                <SafetySupportBanner />
              </div>
            )}

            {composerExpanded && (
              <div className="pt-2 border-t border-[#E8E5DF] dark:border-[#332F2A] flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={draftCategoryId}
                    onChange={(e) => setDraftCategoryId(e.target.value)}
                    aria-label="Select topic category"
                    className="rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3] dark:bg-[#181715] px-2.5 py-1.5 text-xs text-[#252525] dark:text-[#EAE6DF]"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={draftVisibility}
                    onChange={(e) => setDraftVisibility(e.target.value as 'public' | 'unlisted')}
                    aria-label="Select letter visibility"
                    className="rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3] dark:bg-[#181715] px-2.5 py-1.5 text-xs text-[#252525] dark:text-[#EAE6DF]"
                  >
                    <option value="public">Public feed</option>
                    <option value="unlisted">Unlisted link</option>
                  </select>

                  <button
                    type="button"
                    onClick={handleExpandFullEditor}
                    className="inline-flex items-center gap-1 text-xs text-[#77736D] dark:text-[#A19B92] hover:text-[#252525] dark:hover:text-[#EAE6DF] px-1.5 py-1"
                    title="Open distraction-free full desk"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Full desk</span>
                  </button>
                </div>

                <div className="flex items-center gap-2.5 ml-auto">
                  <span
                    className={`text-[11px] tabular-nums ${
                      draftLength > 0 && draftLength < MIN_LETTER_LENGTH
                        ? 'text-[#80545A] dark:text-[#B8838A]'
                        : 'text-[#77736D] dark:text-[#A19B92]'
                    }`}
                  >
                    {draftLength < MIN_LETTER_LENGTH
                      ? `${draftLength}/${MIN_LETTER_LENGTH} min`
                      : `${draftLength.toLocaleString()} chars`}
                  </span>
                  <button
                    type="submit"
                    disabled={posting}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[#80545A] hover:bg-[#6C454A] text-white px-4 py-2 min-h-[36px] text-xs font-medium disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                  >
                    <PenLine className="w-3.5 h-3.5" />
                    <span>{posting ? 'Posting…' : 'Post Letter'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </form>
      </section>

      {/* Topic Filter Strip */}
      <div
        className="border-b border-[#E8E5DF] dark:border-[#332F2A] px-4 sm:px-6 overflow-x-auto scrollbar-none flex items-center gap-5 bg-[#F8F7F3] dark:bg-[#181715]"
        role="tablist"
        aria-label="Filter timeline by topic"
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

      {/* Discover Tab Intro / Letter of the Day Spotlight */}
      {(feedTab === 'discover' || (letterOfTheDay && selectedCategory === 'all')) &&
        letterOfTheDay && (
          <section
            className={`${
              feedTab === 'discover' ? '' : 'xl:hidden'
            } border-b border-[#E8E5DF] dark:border-[#332F2A] bg-[#F1EFE9]/50 dark:bg-[#201E1B]/50 px-4 sm:px-6 py-4 space-y-2.5`}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1.5 font-semibold text-[#80545A] dark:text-[#B8838A]">
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Letter of the Day</span>
              </span>
              <Link
                to={`/letters/${letterOfTheDay.id}`}
                className="text-[#80545A] dark:text-[#B8838A] hover:underline font-medium"
              >
                Open thread &rarr;
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

      {/* Main Social Feed Stream */}
      <section aria-label="Public letter timeline">
        {loading ? (
          <div className="divide-y divide-[#E8E5DF] dark:divide-[#332F2A]">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="px-4 sm:px-6 py-5 flex gap-3 animate-pulse">
                <div className="w-9 h-9 rounded-full bg-[#F1EFE9] dark:bg-[#282521] shrink-0" />
                <div className="flex-1 space-y-2.5">
                  <div className="h-3 w-44 bg-[#F1EFE9] dark:bg-[#282521] rounded" />
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
                onClick={() => void loadFeed(feedTab, 1, false, selectedCategory)}
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
        ) : displayedLetters.length === 0 ? (
          <div className="px-4 sm:px-6 py-12 text-center space-y-3.5">
            <h2 className="font-editorial text-2xl font-semibold">
              {feedTab === 'unanswered'
                ? 'Every open letter has received a reply'
                : 'The letterbox is quiet right now'}
            </h2>
            <p className="text-sm text-[#77736D] dark:text-[#A19B92] max-w-md mx-auto leading-relaxed">
              {selectedCategory !== 'all'
                ? 'No public letters match this topic right now.'
                : feedTab === 'unanswered'
                ? 'Switch to Latest to browse active conversations or share a new letter.'
                : 'No public letters have been published yet. Dear Stranger never displays fabricated activity.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
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
            {displayedLetters.map((letter) => (
              <LetterCard
                key={letter.id}
                letter={letter}
                onUpdated={handleLetterUpdated}
                onBlockedAuthor={handleBlockedAuthor}
              />
            ))}

            {hasMore && feedTab !== 'unanswered' && (
              <div className="px-4 sm:px-6 py-5 text-center border-b border-[#E8E5DF] dark:border-[#332F2A]">
                <button
                  type="button"
                  onClick={() => void loadFeed(feedTab, page + 1, true, selectedCategory)}
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
    </div>
  );
}
