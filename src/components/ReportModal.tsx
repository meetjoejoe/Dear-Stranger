import React, { useState } from 'react';
import { X } from 'lucide-react';
import { REPORT_REASONS, REPORT_REASON_LABELS, type ReportReason } from '../shared/types.ts';
import { apiFetch } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';

interface ReportModalProps {
  open: boolean;
  onClose: () => void;
  targetType: 'letter' | 'reply' | 'account';
  targetId: string;
  targetLabel: string;
  canBlock?: boolean;
  blockInput?: { letterId?: string; replyId?: string };
  onBlocked?: () => void;
}

export function ReportModal({
  open,
  onClose,
  targetType,
  targetId,
  targetLabel,
  canBlock = false,
  blockInput,
  onBlocked,
}: ReportModalProps) {
  const { token, openAuthPrompt } = useAuth();
  const { showToast } = useToast();
  const [reason, setReason] = useState<ReportReason>('harassment');
  const [description, setDescription] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      openAuthPrompt('Continue anonymously to submit a safety report.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/api/reports', {
        method: 'POST',
        token,
        body: JSON.stringify({
          targetType,
          targetId,
          reason,
          description: description.trim() || null,
        }),
      });
      if (alsoBlock && blockInput) {
        await apiFetch('/api/blocks', {
          method: 'POST',
          token,
          body: JSON.stringify(blockInput),
        });
        onBlocked?.();
      }
      showToast('Thank you. Your report has been received for moderation review.', 'success');
      setDescription('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit report.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
    >
      <div className="w-full max-w-md rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#E8E5DF] dark:border-[#332F2A]">
          <div>
            <h2 id="report-modal-title" className="font-editorial text-2xl font-semibold">
              Report {targetLabel}
            </h2>
            <p className="text-xs text-[#77736D] dark:text-[#A19B92] mt-1">
              Reports are reviewed privately by moderators.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close report dialog"
            className="p-1 text-[#77736D] hover:text-[#252525] dark:text-[#A19B92] dark:hover:text-[#EAE6DF]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="report-reason" className="block text-sm font-medium mb-1.5">
              Reason
            </label>
            <select
              id="report-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value as ReportReason)}
              className="w-full rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3] dark:bg-[#181715] px-3 py-2 text-sm"
            >
              {REPORT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {REPORT_REASON_LABELS[r]}
                </option>
              ))}
            </select>
          </div>

          {reason === 'self_harm' && (
            <p className="text-xs text-[#77736D] dark:text-[#A19B92] bg-[#F1EFE9] dark:bg-[#282521] p-3 rounded-md leading-relaxed">
              Thank you for flagging a safety concern. Moderators prioritize imminent safety
              reports. Note that Dear Stranger is not an emergency service.
            </p>
          )}

          <div>
            <label htmlFor="report-details" className="block text-sm font-medium mb-1.5">
              Additional context (optional)
            </label>
            <textarea
              id="report-details"
              rows={3}
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Share anything that would help a moderator understand the issue."
              className="w-full rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3] dark:bg-[#181715] px-3 py-2 text-sm"
            />
          </div>

          {canBlock && blockInput && (
            <label className="flex items-start gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={alsoBlock}
                onChange={(e) => setAlsoBlock(e.target.checked)}
                className="mt-1 accent-[#80545A]"
              />
              <span>
                Also block this anonymous author so their letters and replies no longer appear for me.
              </span>
            </label>
          )}

          {error && <p className="text-sm text-[#80545A] dark:text-[#B8838A]">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-[#77736D] hover:text-[#252525] dark:text-[#A19B92] dark:hover:text-[#EAE6DF]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium rounded-md bg-[#80545A] hover:bg-[#6C454A] text-white disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Submitting…' : 'Submit Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
