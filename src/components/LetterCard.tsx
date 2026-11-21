import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Flag, MessageCircle, Share2 } from 'lucide-react';
import {
  REACTION_EMOJIS,
  REACTION_LABELS,
  REACTION_TYPES,
  type PublicLetterDTO,
  type ReactionSummary,
  type ReactionType,
} from '../shared/types.ts';
import { apiFetch } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { AuthorAvatar } from './AuthorAvatar.tsx';
import { ShareStudioModal } from './ShareStudioModal.tsx';
import { ReportModal } from './ReportModal.tsx';

export function formatEditorialDate(iso: string | null): string {
  if (!iso) return 'Draft';
  const date = new Date(iso);
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatSocialTime(iso: string | null): string {
  if (!iso) return 'Draft';
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return formatEditorialDate(iso);
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  const date = new Date(ts);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

interface LetterCardProps {
  letter: PublicLetterDTO;
  showVisibility?: boolean;
  variant?: 'timeline' | 'bordered';
  onUpdated?: (updated: PublicLetterDTO) => void;
  onBlockedAuthor?: (letterId: string) => void;
}

const PREVIEW_CHAR_LIMIT = 240;

export function LetterCard({
  letter,
  showVisibility = false,
  variant = 'timeline',
  onUpdated,
  onBlockedAuthor,
}: LetterCardProps) {
  const { token, openAuthPrompt } = useAuth();
  const { showToast } = useToast();

  const [localLetter, setLocalLetter] = useState<PublicLetterDTO>(letter);
  const [expanded, setExpanded] = useState(false);
  const [reacting, setReacting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    setLocalLetter(letter);
  }, [letter]);

  const trimmedBody = localLetter.body.trim();
  const lineCount = trimmedBody.split('\n').length;
  const isLongBody = trimmedBody.length > PREVIEW_CHAR_LIMIT || lineCount > 5;

  const displayBody = (() => {
    if (expanded || !isLongBody) return trimmedBody;
    const lines = trimmedBody.split('\n');
    let preview = trimmedBody;
    if (lines.length > 5) {
      preview = lines.slice(0, 5).join('\n');
    }
    if (preview.length > PREVIEW_CHAR_LIMIT) {
      preview = preview.slice(0, PREVIEW_CHAR_LIMIT).trimEnd();
    }
    return `${preview}…`;
  })();

  const canShare =
    localLetter.allowExternalSharing &&
    localLetter.status !== 'removed' &&
    localLetter.status !== 'draft';

  const handleReaction = async (reactionType: ReactionType) => {
    if (reacting) return;
    if (!token) {
      openAuthPrompt('Continue anonymously to respond with a gentle reaction.');
      return;
    }
    const nextReaction =
      localLetter.reactions.userReaction === reactionType ? null : reactionType;
    setReacting(true);
    try {
      const res = await apiFetch<{ reactions: ReactionSummary }>(
        `/api/letters/${localLetter.id}/reaction`,
        {
          method: 'PUT',
          token,
          body: JSON.stringify({ reactionType: nextReaction }),
        }
      );
      const updated = { ...localLetter, reactions: res.reactions };
      setLocalLetter(updated);
      onUpdated?.(updated);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update reaction.', 'error');
    } finally {
      setReacting(false);
    }
  };

  const handleSaveToggle = async () => {
    if (saving) return;
    if (!token) {
      openAuthPrompt('Continue anonymously to bookmark letters privately.');
      return;
    }
    const nextSave = !localLetter.isSaved;
    setSaving(true);
    try {
      const res = await apiFetch<{ isSaved: boolean }>(`/api/letters/${localLetter.id}/save`, {
        method: 'PUT',
        token,
        body: JSON.stringify({ save: nextSave }),
      });
      const updated = { ...localLetter, isSaved: res.isSaved };
      setLocalLetter(updated);
      onUpdated?.(updated);
      showToast(
        res.isSaved ? 'Saved to your private bookmarks.' : 'Removed from saved letters.',
        'success'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update bookmark.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const containerClass =
    variant === 'bordered'
      ? 'group rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] px-4 py-4 sm:px-5 sm:py-5 transition-colors hover:border-[#80545A]/50 dark:hover:border-[#B8838A]/50'
      : 'group border-b border-[#E8E5DF] dark:border-[#332F2A] px-4 py-4 sm:px-6 sm:py-5 transition-colors hover:bg-[#FFFFFF]/75 dark:hover:bg-[#201E1B]/55';

  const timestampIso = localLetter.publishedAt || localLetter.createdAt;

  return (
    <>
      <article className={containerClass}>
        <div className="flex items-start gap-3">
          {/* Pseudonymous Monogram Avatar */}
          <Link to={`/letters/${localLetter.id}`} tabIndex={-1} className="pt-0.5 shrink-0">
            <AuthorAvatar name={localLetter.authorDisplayName} size="md" />
          </Link>

          <div className="min-w-0 flex-1">
            {/* Social Author & Metadata Header */}
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-[#77736D] dark:text-[#A19B92]">
              <Link
                to={`/letters/${localLetter.id}`}
                className="font-semibold text-[#252525] dark:text-[#EAE6DF] hover:underline truncate max-w-[180px] sm:max-w-none"
              >
                {localLetter.authorDisplayName}
              </Link>
              <span aria-hidden="true">·</span>
              <Link
                to={`/explore?category=${localLetter.category.slug}`}
                className="font-medium text-[#80545A] dark:text-[#B8838A] hover:underline whitespace-nowrap"
              >
                {localLetter.category.name}
              </Link>
              <span aria-hidden="true">·</span>
              <time
                dateTime={timestampIso}
                title={formatEditorialDate(timestampIso)}
                className="tabular-nums whitespace-nowrap"
              >
                {formatSocialTime(timestampIso)}
              </time>
              {showVisibility && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="capitalize">{localLetter.visibility}</span>
                  <span aria-hidden="true">·</span>
                  <span className="capitalize">{localLetter.status.replace(/_/g, ' ')}</span>
                </>
              )}
              {localLetter.isSandboxSample && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Sample</span>
                </>
              )}
            </div>

            {localLetter.openLetterboxLabel && (
              <p className="mt-1 text-[11px] italic text-[#80545A] dark:text-[#B8838A]">
                {localLetter.openLetterboxLabel}
              </p>
            )}

            {/* Post Content -> Opens Conversation Thread */}
            <Link to={`/letters/${localLetter.id}`} className="block mt-1.5 focus:outline-none">
              {localLetter.title && (
                <h3 className="font-editorial text-[21px] sm:text-[23px] font-semibold leading-snug text-[#252525] dark:text-[#EAE6DF] group-hover:text-[#80545A] dark:group-hover:text-[#B8838A] transition-colors text-balance">
                  {localLetter.title}
                </h3>
              )}

              <p
                className={`${
                  localLetter.title ? 'mt-1.5' : 'mt-0.5'
                } text-[15px] leading-[1.62] text-[#252525]/92 dark:text-[#EAE6DF]/92 whitespace-pre-line break-words`}
              >
                {displayBody}
              </p>
            </Link>

            {/* Intelligent Read More / Open Thread Action */}
            {isLongBody && (
              <div className="mt-1.5 flex items-center gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="font-medium text-[#80545A] dark:text-[#B8838A] hover:underline py-0.5"
                >
                  {expanded ? 'Show less' : 'Read more'}
                </button>
                <span aria-hidden="true" className="text-[#77736D] dark:text-[#A19B92]">
                  ·
                </span>
                <Link
                  to={`/letters/${localLetter.id}`}
                  className="text-[#77736D] dark:text-[#A19B92] hover:text-[#252525] dark:hover:text-[#EAE6DF] hover:underline py-0.5"
                >
                  Open conversation
                </Link>
              </div>
            )}

            {/* Social Interaction Bar */}
            <div className="mt-3 pt-2 border-t border-[#E8E5DF]/70 dark:border-[#332F2A]/70 flex flex-wrap items-center justify-between gap-2 text-xs text-[#77736D] dark:text-[#A19B92]">
              {/* Reactions */}
              <div className="flex flex-wrap items-center gap-1">
                {REACTION_TYPES.map((rt) => {
                  const active = localLetter.reactions.userReaction === rt;
                  const count = localLetter.reactions.counts[rt];
                  return (
                    <button
                      key={rt}
                      type="button"
                      disabled={reacting}
                      onClick={() => void handleReaction(rt)}
                      aria-pressed={active}
                      aria-label={`${REACTION_LABELS[rt]}${count > 0 ? ` (${count})` : ''}`}
                      title={REACTION_LABELS[rt]}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors min-h-[34px] ${
                        active
                          ? 'bg-[#80545A]/12 dark:bg-[#B8838A]/18 text-[#80545A] dark:text-[#B8838A] font-medium'
                          : 'text-[#77736D] dark:text-[#A19B92] hover:bg-[#F1EFE9] dark:hover:bg-[#282521] hover:text-[#252525] dark:hover:text-[#EAE6DF]'
                      }`}
                    >
                      <span aria-hidden="true" className="text-sm leading-none">
                        {REACTION_EMOJIS[rt]}
                      </span>
                      {count > 0 && <span className="tabular-nums text-[11px]">{count}</span>}
                    </button>
                  );
                })}
              </div>

              {/* Reply Count · Bookmark · Share · Report */}
              <div className="flex items-center gap-0.5 sm:gap-1.5">
                <Link
                  to={`/letters/${localLetter.id}#replies-heading`}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md hover:bg-[#F1EFE9] dark:hover:bg-[#282521] hover:text-[#252525] dark:hover:text-[#EAE6DF] transition-colors tabular-nums min-h-[34px] whitespace-nowrap shrink-0"
                  aria-label={`${localLetter.replyCount} replies`}
                  title="Join conversation"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>{localLetter.replyCount}</span>
                </Link>

                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSaveToggle()}
                  aria-pressed={localLetter.isSaved}
                  aria-label={localLetter.isSaved ? 'Remove bookmark' : 'Bookmark letter'}
                  title={localLetter.isSaved ? 'Saved' : 'Save letter'}
                  className={`inline-flex items-center justify-center p-1.5 rounded-md transition-colors min-h-[34px] min-w-[34px] ${
                    localLetter.isSaved
                      ? 'text-[#80545A] dark:text-[#B8838A] bg-[#80545A]/10 dark:bg-[#B8838A]/15'
                      : 'hover:bg-[#F1EFE9] dark:hover:bg-[#282521] hover:text-[#252525] dark:hover:text-[#EAE6DF]'
                  }`}
                >
                  <Bookmark className={`w-4 h-4 ${localLetter.isSaved ? 'fill-current' : ''}`} />
                </button>

                {canShare && (
                  <button
                    type="button"
                    onClick={() => setShareOpen(true)}
                    aria-label="Share letter card"
                    title="Share letter"
                    className="inline-flex items-center justify-center p-1.5 rounded-md hover:bg-[#F1EFE9] dark:hover:bg-[#282521] hover:text-[#252525] dark:hover:text-[#EAE6DF] transition-colors min-h-[34px] min-w-[34px]"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                )}

                {!localLetter.isOwner && (
                  <button
                    type="button"
                    onClick={() => setReportOpen(true)}
                    aria-label="Report letter"
                    title="Report"
                    className="inline-flex items-center justify-center p-1.5 rounded-md hover:bg-[#F1EFE9] dark:hover:bg-[#282521] hover:text-[#80545A] dark:hover:text-[#B8838A] transition-colors min-h-[34px] min-w-[34px]"
                  >
                    <Flag className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </article>

      {shareOpen && (
        <ShareStudioModal
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          letter={localLetter}
        />
      )}

      {reportOpen && (
        <ReportModal
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          targetType="letter"
          targetId={localLetter.id}
          targetLabel="Letter"
          canBlock
          blockInput={{ letterId: localLetter.id }}
          onBlocked={() => {
            showToast('Author blocked. Their letters are now hidden for you.', 'info');
            onBlockedAuthor?.(localLetter.id);
          }}
        />
      )}
    </>
  );
}
