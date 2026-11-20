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

interface LetterCardProps {
  letter: PublicLetterDTO;
  showVisibility?: boolean;
  variant?: 'timeline' | 'bordered';
  onUpdated?: (updated: PublicLetterDTO) => void;
  onBlockedAuthor?: (letterId: string) => void;
}

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
  const [reacting, setReacting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    setLocalLetter(letter);
  }, [letter]);

  const excerpt =
    localLetter.body.length > 260
      ? `${localLetter.body.slice(0, 260).trimEnd()}…`
      : localLetter.body;

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
      ? 'group rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] px-5 py-5 sm:px-6 sm:py-6 transition-colors hover:border-[#80545A]/50 dark:hover:border-[#B8838A]/50'
      : 'group border-b border-[#E8E5DF] dark:border-[#332F2A] px-4 py-5 sm:px-6 sm:py-6 transition-colors hover:bg-[#FFFFFF]/70 dark:hover:bg-[#201E1B]/60';

  return (
    <>
      <article className={containerClass}>
        {/* Editorial Metadata Line */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#77736D] dark:text-[#A19B92]">
          <span className="font-medium text-[#252525] dark:text-[#EAE6DF]">
            {localLetter.authorDisplayName}
          </span>
          <span aria-hidden="true">·</span>
          <Link
            to={`/explore?category=${localLetter.category.slug}`}
            className="font-medium text-[#80545A] dark:text-[#B8838A] hover:underline"
          >
            {localLetter.category.name}
          </Link>
          <span aria-hidden="true">·</span>
          <span>{formatEditorialDate(localLetter.publishedAt || localLetter.createdAt)}</span>
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
              <span>Sandbox Sample</span>
            </>
          )}
        </div>

        {localLetter.openLetterboxLabel && (
          <p className="mt-1.5 text-xs italic text-[#77736D] dark:text-[#A19B92]">
            {localLetter.openLetterboxLabel}
          </p>
        )}

        {/* Title & Excerpt */}
        <Link to={`/letters/${localLetter.id}`} className="block mt-2.5 focus:outline-none">
          {localLetter.title ? (
            <h3 className="font-editorial text-2xl sm:text-[26px] font-semibold leading-snug text-[#252525] dark:text-[#EAE6DF] group-hover:text-[#80545A] dark:group-hover:text-[#B8838A] transition-colors text-balance">
              {localLetter.title}
            </h3>
          ) : (
            <h3 className="font-editorial text-xl italic font-medium text-[#77736D] dark:text-[#A19B92] group-hover:text-[#80545A] dark:group-hover:text-[#B8838A] transition-colors">
              Untitled letter
            </h3>
          )}

          <p className="mt-2.5 text-[15px] leading-[1.7] text-[#252525]/90 dark:text-[#EAE6DF]/90 whitespace-pre-line">
            {excerpt}
          </p>
        </Link>

        {/* Quiet Social Action Row */}
        <div className="mt-4 pt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[#77736D] dark:text-[#A19B92]">
          {/* Sentimental Emoji Reactions */}
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
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors min-h-[32px] ${
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

          {/* Replies · Bookmark · Share · Report */}
          <div className="flex items-center gap-1 sm:gap-2">
            <Link
              to={`/letters/${localLetter.id}#replies-heading`}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded hover:bg-[#F1EFE9] dark:hover:bg-[#282521] hover:text-[#252525] dark:hover:text-[#EAE6DF] transition-colors tabular-nums min-h-[32px] whitespace-nowrap shrink-0"
              aria-label={`${localLetter.replyCount} replies`}
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>{localLetter.replyCount}</span>
            </Link>

            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSaveToggle()}
              aria-pressed={localLetter.isSaved}
              aria-label={localLetter.isSaved ? 'Remove bookmark' : 'Bookmark letter'}
              title={localLetter.isSaved ? 'Saved' : 'Save letter'}
              className={`inline-flex items-center justify-center p-1.5 rounded transition-colors min-h-[32px] min-w-[32px] ${
                localLetter.isSaved
                  ? 'text-[#80545A] dark:text-[#B8838A] bg-[#80545A]/10 dark:bg-[#B8838A]/15'
                  : 'hover:bg-[#F1EFE9] dark:hover:bg-[#282521] hover:text-[#252525] dark:hover:text-[#EAE6DF]'
              }`}
            >
              <Bookmark className={`w-3.5 h-3.5 ${localLetter.isSaved ? 'fill-current' : ''}`} />
            </button>

            {canShare && (
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                aria-label="Share letter card"
                title="Share card"
                className="inline-flex items-center justify-center p-1.5 rounded hover:bg-[#F1EFE9] dark:hover:bg-[#282521] hover:text-[#252525] dark:hover:text-[#EAE6DF] transition-colors min-h-[32px] min-w-[32px]"
              >
                <Share2 className="w-3.5 h-3.5" />
              </button>
            )}

            {!localLetter.isOwner && (
              <button
                type="button"
                onClick={() => setReportOpen(true)}
                aria-label="Report letter"
                title="Report"
                className="inline-flex items-center justify-center p-1.5 rounded hover:bg-[#F1EFE9] dark:hover:bg-[#282521] hover:text-[#80545A] dark:hover:text-[#B8838A] transition-colors min-h-[32px] min-w-[32px]"
              >
                <Flag className="w-3.5 h-3.5" />
              </button>
            )}
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
