import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Bookmark, Flag, Lock, Share2 } from 'lucide-react';
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
import { formatEditorialDate } from '../components/LetterCard.tsx';
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
        setLetter(res?.letter ?? null);
        setReplies(Array.isArray(res?.replies) ? res.replies : []);
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
  }, [id]);

  useEffect(() => {
    void loadDetail(true);
  }, [loadDetail]);

  const handleReaction = async (reactionType: ReactionType) => {
    if (!letter) return;
    if (!token) {
      openAuthPrompt('Continue anonymously to respond with a reaction.');
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
    if (!token) {
      openAuthPrompt('Continue anonymously to save letters privately to your dashboard.');
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
      showToast(res.isSaved ? 'Letter saved to your dashboard.' : 'Removed from saved letters.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update saved state.', 'error');
    }
  };

  const handlePostReply = async (e: React.FormEvent, parentReplyId: string | null = null) => {
    e.preventDefault();
    if (!letter) return;
    if (!token) {
      openAuthPrompt('Continue anonymously to write a thoughtful reply.');
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
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-14 space-y-6">
        <div className="h-8 w-48 bg-[#F1EFE9] dark:bg-[#282521] rounded animate-pulse" />
        <div className="h-64 bg-[#FFFFFF] dark:bg-[#201E1B] border border-[#E8E5DF] dark:border-[#332F2A] rounded-lg animate-pulse" />
      </div>
    );
  }

  if (error || !letter) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <div className="rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-8 text-center space-y-4">
          <h1 className="font-editorial text-3xl font-semibold">Letter unavailable</h1>
          <p className="text-sm text-[#77736D] dark:text-[#A19B92]">
            {error || 'This letter may have been removed or is no longer accessible.'}
          </p>
          <Link
            to="/explore"
            className="inline-block rounded-md bg-[#80545A] hover:bg-[#6C454A] text-white px-5 py-2.5 text-sm font-medium"
          >
            Back to Explore
          </Link>
        </div>
      </div>
    );
  }

  const canShare = letter.allowExternalSharing && letter.status !== 'removed' && letter.status !== 'draft';
  const repliesLocked = letter.status === 'locked' || letter.status === 'removed' || letter.status === 'draft';

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-10">
      <div className="flex items-center justify-between text-xs sm:text-sm text-[#77736D] dark:text-[#A19B92]">
        <Link to="/explore" className="hover:text-[#252525] dark:hover:text-[#EAE6DF]">
          &larr; Back to Explore
        </Link>
        {letter.visibility === 'unlisted' && (
          <span>Unlisted letter (accessible only via direct link)</span>
        )}
      </div>

      {showSafetySupport && <SafetySupportBanner onDismiss={() => setShowSafetySupport(false)} />}

      {/* Letter Reading Canvas */}
      <article className="rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-6 sm:p-10">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#77736D] dark:text-[#A19B92]">
          <Link
            to={`/explore?category=${letter.category.slug}`}
            className="font-medium text-[#80545A] dark:text-[#B8838A] hover:underline"
          >
            {letter.category.name}
          </Link>
          <span aria-hidden="true">·</span>
          <span>{formatEditorialDate(letter.publishedAt || letter.createdAt)}</span>
          <span aria-hidden="true">·</span>
          <span>Written by {letter.authorDisplayName}</span>
          {letter.isSandboxSample && (
            <>
              <span aria-hidden="true">·</span>
              <span>Sandbox Sample</span>
            </>
          )}
        </div>

        {letter.title && (
          <h1 className="font-editorial text-3xl sm:text-4xl font-semibold leading-tight mt-4 text-balance">
            {letter.title}
          </h1>
        )}

        <div className="mt-6 text-[16px] leading-[1.8] text-[#252525] dark:text-[#EAE6DF] whitespace-pre-line max-w-prose">
          {letter.body}
        </div>

        {/* Actions Bar */}
        <div className="mt-8 pt-6 border-t border-[#E8E5DF] dark:border-[#332F2A] flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
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
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs transition-colors ${
                    active
                      ? 'border-[#80545A] dark:border-[#B8838A] bg-[#80545A]/10 dark:bg-[#B8838A]/15 text-[#80545A] dark:text-[#B8838A] font-medium'
                      : 'border-[#E8E5DF] dark:border-[#332F2A] text-[#77736D] dark:text-[#A19B92] hover:text-[#252525] dark:hover:text-[#EAE6DF] hover:border-[#80545A]/50'
                  }`}
                >
                  <span aria-hidden="true" className="text-base leading-none">
                    {REACTION_EMOJIS[rt]}
                  </span>
                  {count > 0 && <span className="tabular-nums opacity-85">{count}</span>}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSaveToggle}
              aria-pressed={letter.isSaved}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                letter.isSaved
                  ? 'border-[#80545A] text-[#80545A] dark:border-[#B8838A] dark:text-[#B8838A]'
                  : 'border-[#E8E5DF] dark:border-[#332F2A] text-[#77736D] dark:text-[#A19B92] hover:text-[#252525] dark:hover:text-[#EAE6DF]'
              }`}
            >
              <Bookmark className="w-3.5 h-3.5" />
              {letter.isSaved ? 'Saved' : 'Save'}
            </button>

            {canShare && (
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#E8E5DF] dark:border-[#332F2A] px-3 py-1.5 text-xs font-medium text-[#252525] dark:text-[#EAE6DF] hover:border-[#80545A] transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" />
                Share Card
              </button>
            )}

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
                className="inline-flex items-center gap-1.5 rounded-md border border-[#E8E5DF] dark:border-[#332F2A] px-3 py-1.5 text-xs text-[#77736D] dark:text-[#A19B92] hover:text-[#80545A] transition-colors"
              >
                <Flag className="w-3.5 h-3.5" />
                Report
              </button>
            )}
          </div>
        </div>
      </article>

      {/* Replies Section */}
      <section aria-labelledby="replies-heading" className="space-y-6">
        <div className="flex items-baseline justify-between">
          <h2 id="replies-heading" className="font-editorial text-2xl sm:text-3xl font-semibold">
            Responses
          </h2>
          <span className="text-xs text-[#77736D] dark:text-[#A19B92] tabular-nums">
            {letter.replyCount} {letter.replyCount === 1 ? 'response' : 'responses'}
          </span>
        </div>

        {/* Top-level Reply Composer */}
        {repliesLocked ? (
          <div className="rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#F1EFE9] dark:bg-[#282521] p-4 flex items-center gap-3 text-sm text-[#77736D] dark:text-[#A19B92]">
            <Lock className="w-4 h-4 shrink-0" />
            <span>Replies on this letter have been closed by moderation.</span>
          </div>
        ) : (
          <form
            onSubmit={(e) => void handlePostReply(e, null)}
            className="rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-5 space-y-3"
          >
            <label htmlFor="new-reply" className="block text-sm font-medium">
              {profile ? `Reply thoughtfully as ${profile.displayName}` : 'Write a thoughtful response'}
            </label>
            <textarea
              id="new-reply"
              rows={3}
              maxLength={MAX_REPLY_LENGTH}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Offer perspective, encouragement, or a gentle reflection…"
              className="w-full rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3] dark:bg-[#181715] px-3.5 py-2.5 text-sm leading-relaxed"
            />
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-[#77736D] dark:text-[#A19B92] tabular-nums">
                {replyText.length}/{MAX_REPLY_LENGTH}
              </span>
              <button
                type="submit"
                disabled={replySubmitting}
                className="rounded-md bg-[#80545A] hover:bg-[#6C454A] text-white px-4 py-2 text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {replySubmitting ? 'Posting…' : token ? 'Post Reply' : 'Continue Anonymously to Reply'}
              </button>
            </div>
          </form>
        )}

        {/* Chronological Replies + 1-Level Nested Responses */}
        {replies.length === 0 ? (
          <div className="rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-8 text-center text-sm text-[#77736D] dark:text-[#A19B92]">
            No responses yet. If this letter spoke to you, consider leaving the first thoughtful note.
          </div>
        ) : (
          <div className="space-y-4">
            {replies.map((reply) => (
              <div
                key={reply.id}
                className="rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-5 sm:p-6 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#77736D] dark:text-[#A19B92]">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[#252525] dark:text-[#EAE6DF]">
                      {reply.authorDisplayName}
                    </span>
                    {reply.isLetterAuthor && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#80545A] dark:text-[#B8838A] font-medium">
                          Letter author
                        </span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span>{formatEditorialDate(reply.createdAt)}</span>
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
                        className="hover:text-[#252525] dark:hover:text-[#EAE6DF] underline"
                      >
                        Respond
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
                          className="hover:text-[#252525] dark:hover:text-[#EAE6DF]"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteReply(reply.id)}
                          className="hover:text-[#80545A]"
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
                        className="hover:text-[#80545A]"
                      >
                        Report
                      </button>
                    )}
                  </div>
                </div>

                {editingReplyId === reply.id ? (
                  <div className="space-y-2">
                    <textarea
                      rows={3}
                      value={editingReplyText}
                      onChange={(e) => setEditingReplyText(e.target.value)}
                      className="w-full rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3] dark:bg-[#181715] px-3 py-2 text-sm"
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
                        className="text-xs px-3 py-1.5 rounded bg-[#80545A] text-white"
                      >
                        Save Changes
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-[15px] leading-relaxed whitespace-pre-line">{reply.body}</p>
                )}

                {/* 1-Level Nested Response Composer */}
                {replyTargetParentId === reply.id && !repliesLocked && (
                  <form
                    onSubmit={(e) => void handlePostReply(e, reply.id)}
                    className="pt-3 border-t border-[#E8E5DF] dark:border-[#332F2A] space-y-2.5"
                  >
                    <textarea
                      rows={2}
                      maxLength={MAX_REPLY_LENGTH}
                      value={nestedReplyText}
                      onChange={(e) => setNestedReplyText(e.target.value)}
                      placeholder={`Respond to ${reply.authorDisplayName}…`}
                      className="w-full rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3] dark:bg-[#181715] px-3 py-2 text-sm"
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
                        className="text-xs px-4 py-1.5 rounded bg-[#80545A] text-white font-medium"
                      >
                        {replySubmitting ? 'Posting…' : 'Post Response'}
                      </button>
                    </div>
                  </form>
                )}

                {/* Nested Children (1 level only) */}
                {reply.children.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-[#E8E5DF] dark:border-[#332F2A] pl-4 sm:pl-6 space-y-4">
                    {reply.children.map((child) => (
                      <div key={child.id} className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#77736D] dark:text-[#A19B92]">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-[#252525] dark:text-[#EAE6DF]">
                              {child.authorDisplayName}
                            </span>
                            {child.isLetterAuthor && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-[#80545A] dark:text-[#B8838A] font-medium">
                                  Letter author
                                </span>
                              </>
                            )}
                            <span aria-hidden="true">·</span>
                            <span>{formatEditorialDate(child.createdAt)}</span>
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
                        <p className="text-sm leading-relaxed whitespace-pre-line">{child.body}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

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
