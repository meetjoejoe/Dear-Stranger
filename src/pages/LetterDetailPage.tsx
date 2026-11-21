import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Bookmark, Flag, Lock, MessageCircle, Share2 } from 'lucide-react';
import {
  MAX_REPLY_LENGTH,
  REACTION_EMOJIS,
  REACTION_LABELS,
  REACTION_TYPES,
  type PublicLetterDTO,
  type ReactionSummary,
  type ReactionType,
  type ReplyDTO,
} from '../shared/types.ts';
import { apiFetch } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { AuthorAvatar } from '../components/AuthorAvatar.tsx';
import { formatEditorialDate, formatSocialTime } from '../components/LetterCard.tsx';
import { ShareStudioModal } from '../components/ShareStudioModal.tsx';
import { ReportModal } from '../components/ReportModal.tsx';
import { SafetySupportBanner } from '../components/SafetySupportBanner.tsx';

export function LetterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token, profile, openAuthPrompt } = useAuth();
  const { showToast } = useToast();

  const [letter, setLetter] = useState<PublicLetterDTO | null>(null);
  const [replies, setReplies] = useState<ReplyDTO[]>([]);
  const [relatedLetters, setRelatedLetters] = useState<PublicLetterDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [replyText, setReplyText] = useState('');
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [replyTargetParentId, setReplyTargetParentId] = useState<string | null>(null);
  const [nestedReplyText, setNestedReplyText] = useState('');
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editingReplyText, setEditingReplyText] = useState('');

  const [shareOpen, setShareOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<{
    type: 'letter' | 'reply';
    id: string;
    label: string;
    blockInput?: { letterId?: string; replyId?: string };
  } | null>(null);
  const [showSafetySupport, setShowSafetySupport] = useState(false);

  const loadDetail = useCallback(
    async (trackOpen = true) => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch<{ letter: PublicLetterDTO; replies: ReplyDTO[] }>(
          `/api/letters/${id}?track=${trackOpen ? 'true' : 'false'}`,
          { token }
        );
        const loadedLetter = res?.letter ?? null;
        setLetter(loadedLetter);
        setReplies(Array.isArray(res?.replies) ? res.replies : []);

        if (loadedLetter?.category?.slug) {
          apiFetch<{ letters: PublicLetterDTO[] }>(
            `/api/letters?category=${encodeURIComponent(loadedLetter.category.slug)}&limit=4`,
            { token }
          )
            .then((rel) => {
              const others = Array.isArray(rel?.letters)
                ? rel.letters.filter((item) => item.id !== loadedLetter.id).slice(0, 3)
                : [];
              setRelatedLetters(others);
            })
            .catch(() => {
              setRelatedLetters([]);
            });
        } else {
          setRelatedLetters([]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load this letter.');
      } finally {
        setLoading(false);
      }
    },
    [id, token]
  );

  useEffect(() => {
    setShareOpen(false);
    setReportTarget(null);
    setReplyText('');
    setReplyTargetParentId(null);
    setNestedReplyText('');
    setEditingReplyId(null);
    setEditingReplyText('');
    setShowSafetySupport(false);
    setRelatedLetters([]);
  }, [id]);

  useEffect(() => {
    void loadDetail(true);
  }, [loadDetail]);

  const handleReaction = async (reactionType: ReactionType) => {
    if (!letter) return;
    if (!token || !profile?.ageConfirmedAt) {
      openAuthPrompt(
        token
          ? 'Please confirm that you are 18 or older before responding.'
          : 'Continue anonymously or with Google to respond with a gentle reaction.'
      );
      return;
    }
    const nextReaction =
      letter.reactions.userReaction === reactionType ? null : reactionType;
    try {
      const res = await apiFetch<{ reactions: ReactionSummary }>(
        `/api/letters/${letter.id}/reaction`,
        {
          method: 'PUT',
          token,
          body: JSON.stringify({ reactionType: nextReaction }),
        }
      );
      setLetter({ ...letter, reactions: res.reactions });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update reaction.', 'error');
    }
  };

  const handleSaveToggle = async () => {
    if (!letter) return;
    if (!token || !profile?.ageConfirmedAt) {
      openAuthPrompt(
        token
          ? 'Please confirm that you are 18 or older before saving letters.'
          : 'Continue anonymously or with Google to save letters privately to your profile.'
      );
      return;
    }
    const nextSave = !letter.isSaved;
    try {
      const res = await apiFetch<{ isSaved: boolean }>(`/api/letters/${letter.id}/save`, {
        method: 'PUT',
        token,
        body: JSON.stringify({ save: nextSave }),
      });
      setLetter({ ...letter, isSaved: res.isSaved });
      showToast(
        res.isSaved ? 'Saved to your private bookmarks.' : 'Removed from saved letters.',
        'success'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update saved state.', 'error');
    }
  };

  const handlePostReply = async (e: React.FormEvent, parentReplyId: string | null = null) => {
    e.preventDefault();
    if (!letter) return;
    if (!token || !profile?.ageConfirmedAt) {
      openAuthPrompt(
        token
          ? 'Please confirm that you are 18 or older before replying.'
          : 'Continue anonymously or with Google to join the conversation.'
      );
      return;
    }
    const body = (parentReplyId ? nestedReplyText : replyText).trim();
    if (body.length < 2) {
      showToast('Please write a slightly longer reply.', 'error');
      return;
    }

    setReplySubmitting(true);
    try {
      const res = await apiFetch<{ reply: ReplyDTO; imminentHarmDetected: boolean }>(
        `/api/letters/${letter.id}/replies`,
        {
          method: 'POST',
          token,
          body: JSON.stringify({ body, parentReplyId }),
        }
      );
      if (res.imminentHarmDetected) {
        setShowSafetySupport(true);
      }
      if (parentReplyId) {
        setNestedReplyText('');
        setReplyTargetParentId(null);
      } else {
        setReplyText('');
      }
      showToast('Reply published.', 'success');
      await loadDetail(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not publish reply.', 'error');
    } finally {
      setReplySubmitting(false);
    }
  };

  const handleEditReply = async (replyId: string) => {
    if (!token) return;
    try {
      await apiFetch(`/api/replies/${replyId}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ body: editingReplyText }),
      });
      setEditingReplyId(null);
      setEditingReplyText('');
      showToast('Reply updated.', 'success');
      await loadDetail(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update reply.', 'error');
    }
  };

  const handleDeleteReply = async (replyId: string) => {
    if (!token) return;
    try {
      await apiFetch(`/api/replies/${replyId}`, {
        method: 'DELETE',
        token,
      });
      showToast('Reply deleted.', 'info');
      await loadDetail(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not delete reply.', 'error');
    }
  };

  if (loading) {
    return (
      <div className="px-4 sm:px-6 py-8 space-y-5 animate-pulse">
        <div className="h-4 w-28 bg-[#F1EFE9] dark:bg-[#282521] rounded" />
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#F1EFE9] dark:bg-[#282521]" />
          <div className="h-4 w-44 bg-[#F1EFE9] dark:bg-[#282521] rounded" />
        </div>
        <div className="h-8 w-3/4 bg-[#F1EFE9] dark:bg-[#282521] rounded" />
        <div className="h-48 bg-[#F1EFE9]/70 dark:bg-[#201E1B] rounded-lg" />
      </div>
    );
  }

  if (error || !letter) {
    return (
      <div className="px-4 sm:px-6 py-16 text-center space-y-4">
        <h1 className="font-editorial text-3xl font-semibold">Letter unavailable</h1>
        <p className="text-sm text-[#77736D] dark:text-[#A19B92] max-w-md mx-auto">
          {error || 'This letter may have been removed or is no longer accessible.'}
        </p>
        <Link
          to="/"
          className="inline-block rounded-md bg-[#80545A] hover:bg-[#6C454A] text-white px-5 py-2.5 text-sm font-medium"
        >
          Back to Home
        </Link>
      </div>
    );
  }

  const canShare =
    letter.allowExternalSharing && letter.status !== 'removed' && letter.status !== 'draft';
  const repliesLocked =
    letter.status === 'locked' || letter.status === 'removed' || letter.status === 'draft';
  const timestampIso = letter.publishedAt || letter.createdAt;

  return (
    <div>
      {/* Sticky Social Thread Bar */}
      <div className="sticky top-[52px] md:top-0 z-20 px-4 sm:px-6 py-3 border-b border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3]/95 dark:bg-[#181715]/95 backdrop-blur-sm flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Go back"
            className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-md hover:bg-[#F1EFE9] dark:hover:bg-[#201E1B] text-[#252525] dark:text-[#EAE6DF] transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate text-[#252525] dark:text-[#EAE6DF]">
              Conversation
            </p>
            <p className="text-[11px] text-[#77736D] dark:text-[#A19B92] truncate">
              {letter.category.name}
              {letter.visibility === 'unlisted' ? ' · Unlisted link only' : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleSaveToggle}
            aria-pressed={letter.isSaved}
            aria-label={letter.isSaved ? 'Remove bookmark' : 'Save letter'}
            className={`min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-md transition-colors ${
              letter.isSaved
                ? 'text-[#80545A] dark:text-[#B8838A] bg-[#80545A]/10 dark:bg-[#B8838A]/15'
                : 'text-[#77736D] dark:text-[#A19B92] hover:bg-[#F1EFE9] dark:hover:bg-[#201E1B]'
            }`}
          >
            <Bookmark className={`w-4 h-4 ${letter.isSaved ? 'fill-current' : ''}`} />
          </button>
          {canShare && (
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              aria-label="Share letter"
              className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-md text-[#77736D] dark:text-[#A19B92] hover:bg-[#F1EFE9] dark:hover:bg-[#201E1B] hover:text-[#252525] dark:hover:text-[#EAE6DF] transition-colors"
            >
              <Share2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {showSafetySupport && (
        <div className="px-4 sm:px-6 pt-4">
          <SafetySupportBanner onDismiss={() => setShowSafetySupport(false)} />
        </div>
      )}

      {/* Original Letter Post */}
      <article className="px-4 sm:px-6 py-6 border-b border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B]">
        {/* Author Identity Row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <AuthorAvatar name={letter.authorDisplayName} size="md" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#252525] dark:text-[#EAE6DF] truncate">
                {letter.authorDisplayName}
              </p>
              <p className="text-xs text-[#77736D] dark:text-[#A19B92] flex flex-wrap items-center gap-x-1.5">
                <Link
                  to={`/explore?category=${letter.category.slug}`}
                  className="font-medium text-[#80545A] dark:text-[#B8838A] hover:underline"
                >
                  {letter.category.name}
                </Link>
                <span aria-hidden="true">·</span>
                <time dateTime={timestampIso}>{formatEditorialDate(timestampIso)}</time>
                {letter.isSandboxSample && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Sample</span>
                  </>
                )}
              </p>
            </div>
          </div>

          {!letter.isOwner && (
            <button
              type="button"
              onClick={() =>
                setReportTarget({
                  type: 'letter',
                  id: letter.id,
                  label: 'Letter',
                  blockInput: { letterId: letter.id },
                })
              }
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 min-h-[34px] text-xs text-[#77736D] dark:text-[#A19B92] hover:bg-[#F1EFE9] dark:hover:bg-[#282521] hover:text-[#80545A] transition-colors shrink-0"
            >
              <Flag className="w-3.5 h-3.5" />
              <span>Report</span>
            </button>
          )}
        </div>

        {letter.openLetterboxLabel && (
          <p className="mt-3 text-xs italic text-[#80545A] dark:text-[#B8838A]">
            {letter.openLetterboxLabel}
          </p>
        )}

        {/* Letter Content */}
        <div className="mt-4 max-w-[65ch]">
          {letter.title && (
            <h1 className="font-editorial text-2xl sm:text-[32px] font-semibold leading-[1.2] tracking-tight text-balance text-[#252525] dark:text-[#EAE6DF]">
              {letter.title}
            </h1>
          )}

          <div
            className={`${
              letter.title ? 'mt-3.5' : 'mt-1'
            } text-[16px] leading-[1.72] text-[#252525] dark:text-[#EAE6DF] whitespace-pre-line break-words`}
          >
            {letter.body}
          </div>
        </div>

        {/* Social Thread Interaction Strip */}
        <div className="mt-6 pt-4 border-t border-[#E8E5DF] dark:border-[#332F2A] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {REACTION_TYPES.map((rt) => {
              const active = letter.reactions.userReaction === rt;
              const count = letter.reactions.counts[rt];
              return (
                <button
                  key={rt}
                  type="button"
                  onClick={() => void handleReaction(rt)}
                  aria-pressed={active}
                  aria-label={`${REACTION_LABELS[rt]}${count > 0 ? ` (${count})` : ''}`}
                  title={REACTION_LABELS[rt]}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs transition-colors min-h-[38px] ${
                    active
                      ? 'border-[#80545A] dark:border-[#B8838A] bg-[#80545A]/10 dark:bg-[#B8838A]/15 text-[#80545A] dark:text-[#B8838A] font-medium'
                      : 'border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3] dark:bg-[#181715] text-[#77736D] dark:text-[#A19B92] hover:text-[#252525] dark:hover:text-[#EAE6DF] hover:border-[#80545A]/50'
                  }`}
                >
                  <span aria-hidden="true" className="text-base leading-none">
                    {REACTION_EMOJIS[rt]}
                  </span>
                  {count > 0 && <span className="tabular-nums opacity-90">{count}</span>}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-[#77736D] dark:text-[#A19B92]">
            <a
              href="#new-reply"
              className="inline-flex items-center gap-1.5 rounded-md border border-[#E8E5DF] dark:border-[#332F2A] px-3 py-1.5 min-h-[38px] hover:border-[#80545A] text-[#252525] dark:text-[#EAE6DF] font-medium tabular-nums transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>
                {letter.replyCount} {letter.replyCount === 1 ? 'Reply' : 'Replies'}
              </span>
            </a>

            {canShare && (
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#E8E5DF] dark:border-[#332F2A] px-3 py-1.5 min-h-[38px] font-medium text-[#252525] dark:text-[#EAE6DF] hover:border-[#80545A] transition-colors whitespace-nowrap shrink-0"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share</span>
              </button>
            )}
          </div>
        </div>
      </article>

      {/* Inline Reply Composer */}
      <section aria-label="Post a reply" className="px-4 sm:px-6 py-4 border-b border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3] dark:bg-[#181715]">
        {repliesLocked ? (
          <div className="rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#F1EFE9] dark:bg-[#282521] p-4 flex items-center gap-3 text-sm text-[#77736D] dark:text-[#A19B92]">
            <Lock className="w-4 h-4 shrink-0" />
            <span>Replies on this conversation have been closed by moderation.</span>
          </div>
        ) : (
          <form onSubmit={(e) => void handlePostReply(e, null)} className="flex items-start gap-3">
            <div className="pt-0.5 shrink-0">
              <AuthorAvatar name={profile?.displayName || 'Stranger'} size="md" />
            </div>
            <div className="min-w-0 flex-1 space-y-2.5">
              <textarea
                id="new-reply"
                rows={3}
                maxLength={MAX_REPLY_LENGTH}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={
                  profile
                    ? `Reply thoughtfully as ${profile.displayName}…`
                    : 'Write a thoughtful response to this letter…'
                }
                aria-label="Write a reply"
                className="w-full rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] px-3.5 py-2.5 text-sm leading-relaxed focus:border-[#80545A] dark:focus:border-[#B8838A] focus:outline-none"
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-[#77736D] dark:text-[#A19B92] tabular-nums">
                  {replyText.length}/{MAX_REPLY_LENGTH}
                </span>
                <button
                  type="submit"
                  disabled={replySubmitting}
                  className="rounded-md bg-[#80545A] hover:bg-[#6C454A] text-white px-4 py-2 min-h-[38px] text-xs sm:text-sm font-medium disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                >
                  {replySubmitting
                    ? 'Posting…'
                    : token
                    ? 'Reply'
                    : 'Sign In to Reply'}
                </button>
              </div>
            </div>
          </form>
        )}
      </section>

      {/* Threaded Conversation Replies */}
      <section aria-labelledby="replies-heading" className="border-b border-[#E8E5DF] dark:border-[#332F2A]">
        <div className="px-4 sm:px-6 py-3 border-b border-[#E8E5DF] dark:border-[#332F2A] flex items-center justify-between bg-[#F1EFE9]/35 dark:bg-[#201E1B]/40">
          <h2 id="replies-heading" className="text-xs font-semibold uppercase tracking-wider text-[#77736D] dark:text-[#A19B92]">
            Conversation
          </h2>
          <span className="text-xs text-[#77736D] dark:text-[#A19B92] tabular-nums">
            {letter.replyCount} {letter.replyCount === 1 ? 'reply' : 'replies'}
          </span>
        </div>

        {replies.length === 0 ? (
          <div className="px-4 sm:px-6 py-10 text-center text-sm text-[#77736D] dark:text-[#A19B92]">
            No replies yet. Be the first stranger to respond gently.
          </div>
        ) : (
          <div className="divide-y divide-[#E8E5DF] dark:divide-[#332F2A]">
            {replies.map((reply) => (
              <div key={reply.id} className="px-4 sm:px-6 py-5">
                <div className="flex items-start gap-3">
                  {/* Left avatar + subtle thread connector when children exist */}
                  <div className="flex flex-col items-center shrink-0">
                    <AuthorAvatar name={reply.authorDisplayName} size="md" />
                    {reply.children.length > 0 && (
                      <div
                        aria-hidden="true"
                        className="w-px flex-1 min-h-[20px] bg-[#E8E5DF] dark:bg-[#332F2A] mt-2"
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#77736D] dark:text-[#A19B92]">
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                        <span className="font-semibold text-[#252525] dark:text-[#EAE6DF]">
                          {reply.authorDisplayName}
                        </span>
                        {reply.isLetterAuthor && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-[#80545A] dark:text-[#B8838A] font-semibold">
                              Author
                            </span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <time
                          dateTime={reply.createdAt}
                          title={formatEditorialDate(reply.createdAt)}
                          className="tabular-nums"
                        >
                          {formatSocialTime(reply.createdAt)}
                        </time>
                      </div>

                      <div className="flex items-center gap-3">
                        {!repliesLocked && (
                          <button
                            type="button"
                            onClick={() => {
                              setReplyTargetParentId(
                                replyTargetParentId === reply.id ? null : reply.id
                              );
                              setNestedReplyText('');
                            }}
                            className="font-medium hover:text-[#252525] dark:hover:text-[#EAE6DF] hover:underline py-1"
                          >
                            Reply
                          </button>
                        )}
                        {reply.isOwner && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingReplyId(reply.id);
                                setEditingReplyText(reply.body);
                              }}
                              className="hover:text-[#252525] dark:hover:text-[#EAE6DF] py-1"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteReply(reply.id)}
                              className="hover:text-[#80545A] py-1"
                            >
                              Delete
                            </button>
                          </>
                        )}
                        {!reply.isOwner && (
                          <button
                            type="button"
                            onClick={() =>
                              setReportTarget({
                                type: 'reply',
                                id: reply.id,
                                label: 'Reply',
                                blockInput: { replyId: reply.id },
                              })
                            }
                            className="hover:text-[#80545A] py-1"
                          >
                            Report
                          </button>
                        )}
                      </div>
                    </div>

                    {editingReplyId === reply.id ? (
                      <div className="space-y-2 pt-1">
                        <textarea
                          rows={3}
                          value={editingReplyText}
                          onChange={(e) => setEditingReplyText(e.target.value)}
                          className="w-full rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] px-3 py-2 text-sm"
                        />
                        <div className="flex gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() => setEditingReplyId(null)}
                            className="text-xs px-3 py-1.5 text-[#77736D]"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleEditReply(reply.id)}
                            className="text-xs px-3 py-1.5 rounded-md bg-[#80545A] text-white font-medium"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[15px] leading-[1.65] text-[#252525] dark:text-[#EAE6DF] whitespace-pre-line break-words">
                        {reply.body}
                      </p>
                    )}

                    {/* 1-Level Nested Response Composer */}
                    {replyTargetParentId === reply.id && !repliesLocked && (
                      <form
                        onSubmit={(e) => void handlePostReply(e, reply.id)}
                        className="pt-3 mt-2 border-t border-[#E8E5DF] dark:border-[#332F2A] space-y-2.5"
                      >
                        <textarea
                          rows={2}
                          maxLength={MAX_REPLY_LENGTH}
                          value={nestedReplyText}
                          onChange={(e) => setNestedReplyText(e.target.value)}
                          placeholder={`Reply to ${reply.authorDisplayName}…`}
                          className="w-full rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] px-3 py-2 text-sm"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setReplyTargetParentId(null)}
                            className="text-xs px-3 py-1.5 text-[#77736D]"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={replySubmitting}
                            className="text-xs px-4 py-1.5 rounded-md bg-[#80545A] text-white font-medium"
                          >
                            {replySubmitting ? 'Posting…' : 'Post Reply'}
                          </button>
                        </div>
                      </form>
                    )}

                    {/* Nested Responses (1-level depth preserved) */}
                    {reply.children.length > 0 && (
                      <div className="pt-3 space-y-4">
                        {reply.children.map((child) => (
                          <div key={child.id} className="flex items-start gap-2.5">
                            <AuthorAvatar name={child.authorDisplayName} size="sm" />
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#77736D] dark:text-[#A19B92]">
                                <div className="flex flex-wrap items-center gap-x-1.5">
                                  <span className="font-semibold text-[#252525] dark:text-[#EAE6DF]">
                                    {child.authorDisplayName}
                                  </span>
                                  {child.isLetterAuthor && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span className="text-[#80545A] dark:text-[#B8838A] font-semibold">
                                        Author
                                      </span>
                                    </>
                                  )}
                                  <span aria-hidden="true">·</span>
                                  <time
                                    dateTime={child.createdAt}
                                    title={formatEditorialDate(child.createdAt)}
                                    className="tabular-nums"
                                  >
                                    {formatSocialTime(child.createdAt)}
                                  </time>
                                </div>
                                <div className="flex items-center gap-3">
                                  {child.isOwner && (
                                    <button
                                      type="button"
                                      onClick={() => void handleDeleteReply(child.id)}
                                      className="hover:text-[#80545A]"
                                    >
                                      Delete
                                    </button>
                                  )}
                                  {!child.isOwner && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setReportTarget({
                                          type: 'reply',
                                          id: child.id,
                                          label: 'Reply',
                                          blockInput: { replyId: child.id },
                                        })
                                      }
                                      className="hover:text-[#80545A]"
                                    >
                                      Report
                                    </button>
                                  )}
                                </div>
                              </div>
                              <p className="text-sm leading-relaxed text-[#252525] dark:text-[#EAE6DF] whitespace-pre-line break-words">
                                {child.body}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Related Conversations in Topic */}
      {relatedLetters.length > 0 && (
        <section
          aria-labelledby="related-heading"
          className="px-4 sm:px-6 py-6 bg-[#F1EFE9]/35 dark:bg-[#201E1B]/35 space-y-3"
        >
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="related-heading" className="text-sm font-semibold text-[#252525] dark:text-[#EAE6DF]">
              More in {letter.category.name}
            </h2>
            <Link
              to={`/explore?category=${letter.category.slug}`}
              className="text-xs font-medium text-[#80545A] dark:text-[#B8838A] hover:underline whitespace-nowrap shrink-0"
            >
              See topic &rarr;
            </Link>
          </div>
          <div className="divide-y divide-[#E8E5DF] dark:divide-[#332F2A] border-t border-[#E8E5DF] dark:border-[#332F2A]">
            {relatedLetters.map((rel) => (
              <Link
                key={rel.id}
                to={`/letters/${rel.id}`}
                className="flex items-start gap-3 py-3.5 group"
              >
                <AuthorAvatar name={rel.authorDisplayName} size="sm" />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="text-xs text-[#77736D] dark:text-[#A19B92]">
                    <span className="font-medium text-[#252525] dark:text-[#EAE6DF]">
                      {rel.authorDisplayName}
                    </span>{' '}
                    · {formatSocialTime(rel.publishedAt || rel.createdAt)}
                  </p>
                  {rel.title && (
                    <h3 className="font-editorial text-lg font-semibold text-[#252525] dark:text-[#EAE6DF] group-hover:text-[#80545A] dark:group-hover:text-[#B8838A] transition-colors line-clamp-1">
                      {rel.title}
                    </h3>
                  )}
                  <p className="text-xs sm:text-sm text-[#77736D] dark:text-[#A19B92] line-clamp-2">
                    {rel.body}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <ShareStudioModal open={shareOpen} onClose={() => setShareOpen(false)} letter={letter} />

      <ReportModal
        open={Boolean(reportTarget)}
        onClose={() => setReportTarget(null)}
        targetType={reportTarget?.type || 'letter'}
        targetId={reportTarget?.id || ''}
        targetLabel={reportTarget?.label || 'Content'}
        canBlock={Boolean(reportTarget?.blockInput)}
        blockInput={reportTarget?.blockInput}
        onBlocked={() => {
          showToast('Author blocked. Their letters and replies are now hidden for you.', 'info');
          navigate('/explore');
        }}
      />
    </div>
  );
}
