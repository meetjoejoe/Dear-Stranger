import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  AggregateMetricsDTO,
  CategoryDTO,
  ModerationActionDTO,
  PublicLetterDTO,
  ReportDTO,
} from '../shared/types.ts';
import { REPORT_REASON_LABELS } from '../shared/types.ts';
import { apiFetch } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { formatEditorialDate } from '../components/LetterCard.tsx';

interface ModerationConsolePayload {
  reports: ReportDTO[];
  flaggedLetters: PublicLetterDTO[];
  auditTrail: ModerationActionDTO[];
  metrics: AggregateMetricsDTO;
  letterOfTheDayId: string | null;
  letterOfTheDayNote?: string | null;
  announcement: { active: boolean; message: string };
}

export function ModerationPage() {
  const { token, profile, refreshCategories, refreshConfig } = useAuth();
  const { showToast } = useToast();

  const [data, setData] = useState<ModerationConsolePayload | null>(null);
  const [allCategories, setAllCategories] = useState<CategoryDTO[]>([]);
  const [publicLetters, setPublicLetters] = useState<PublicLetterDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reasonInput, setReasonInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [newCatSlug, setNewCatSlug] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');

  const [announcementActive, setAnnouncementActive] = useState(false);
  const [announcementMessage, setAnnouncementMessage] = useState('');
  const [selectedLotdId, setSelectedLotdId] = useState<string>('');
  const [lotdNote, setLotdNote] = useState('');

  const loadConsole = useCallback(async () => {
    if (!token || !profile?.isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [modRes, catRes, feedRes] = await Promise.all([
        apiFetch<ModerationConsolePayload>('/api/admin/moderation', { token }),
        apiFetch<{ categories: CategoryDTO[] }>('/api/categories?all=true', { token }),
        apiFetch<{ letters: PublicLetterDTO[] }>('/api/letters?limit=25', { token }),
      ]);
      setData(modRes);
      setAllCategories(Array.isArray(catRes?.categories) ? catRes.categories : []);
      setPublicLetters(Array.isArray(feedRes?.letters) ? feedRes.letters : []);
      setAnnouncementActive(Boolean(modRes?.announcement?.active));
      setAnnouncementMessage(modRes?.announcement?.message || '');
      setSelectedLotdId(modRes?.letterOfTheDayId || '');
      setLotdNote(modRes?.letterOfTheDayNote || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load moderation console.');
    } finally {
      setLoading(false);
    }
  }, [profile?.isAdmin, token]);

  useEffect(() => {
    void loadConsole();
  }, [loadConsole]);

  if (!token || !profile?.isAdmin) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <div className="rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-8 text-center space-y-3">
          <h1 className="font-editorial text-3xl font-semibold">Restricted Access</h1>
          <p className="text-sm text-[#77736D] dark:text-[#A19B92]">
            This moderation console requires server-verified administrator or moderator authorization.
          </p>
          <Link to="/" className="inline-block text-sm underline text-[#80545A] dark:text-[#B8838A]">
            Return to Homepage
          </Link>
        </div>
      </div>
    );
  }

  const runDecision = async (params: {
    reportId?: string;
    targetType: 'letter' | 'reply' | 'account' | 'report';
    targetId: string;
    actionType:
      | 'remove_content'
      | 'restore_content'
      | 'lock_conversation'
      | 'unlock_conversation'
      | 'restrict_account'
      | 'suspend_account'
      | 'restore_account'
      | 'dismiss_report';
  }) => {
    const reason = reasonInput.trim() || 'Reviewed under Community Guidelines';
    try {
      await apiFetch('/api/admin/moderation/decision', {
        method: 'POST',
        token,
        body: JSON.stringify({
          ...params,
          reason,
          internalNotes: notesInput.trim() || null,
        }),
      });
      setReasonInput('');
      setNotesInput('');
      showToast('Moderation decision recorded.', 'success');
      await loadConsole();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Moderation action failed.', 'error');
    }
  };

  const handleSaveLotd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/letter-of-the-day', {
        method: 'PUT',
        token,
        body: JSON.stringify({
          letterId: selectedLotdId || null,
          editorNote: lotdNote.trim() || null,
        }),
      });
      showToast('Letter of the Day updated.', 'success');
      await loadConsole();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update Letter of the Day.', 'error');
    }
  };

  const handleSaveAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/announcement', {
        method: 'PUT',
        token,
        body: JSON.stringify({ active: announcementActive, message: announcementMessage }),
      });
      await refreshConfig();
      showToast('Platform announcement saved.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save announcement.', 'error');
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/categories', {
        method: 'POST',
        token,
        body: JSON.stringify({
          name: newCatName,
          slug: newCatSlug || newCatName.toLowerCase().replace(/\s+/g, '-'),
          description: newCatDesc,
          is_active: true,
          sort_order: allCategories.length + 1,
        }),
      });
      setNewCatName('');
      setNewCatSlug('');
      setNewCatDesc('');
      await refreshCategories();
      await loadConsole();
      showToast('Category added.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not add category.', 'error');
    }
  };

  const handleToggleCategory = async (cat: CategoryDTO) => {
    try {
      await apiFetch('/api/admin/categories', {
        method: 'POST',
        token,
        body: JSON.stringify({ ...cat, is_active: !cat.is_active }),
      });
      await refreshCategories();
      await loadConsole();
      showToast('Category updated.', 'success');
    } catch {
      showToast('Could not toggle category.', 'error');
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-10">
      <div className="pb-6 border-b border-[#E8E5DF] dark:border-[#332F2A]">
        <p className="text-xs uppercase tracking-widest text-[#80545A] dark:text-[#B8838A] font-medium">
          Server-Verified Moderator Access ({profile.adminRole})
        </p>
        <h1 className="font-editorial text-3xl sm:text-4xl font-semibold mt-1">
          Moderation &amp; Editorial Console
        </h1>
      </div>

      {loading ? (
        <div className="h-64 rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] animate-pulse" />
      ) : error || !data ? (
        <p className="text-sm text-[#80545A]">{error}</p>
      ) : (
        <>
          {/* Aggregate Non-PII Metrics */}
          <section className="space-y-3">
            <h2 className="font-editorial text-2xl font-semibold">Aggregate Platform Activity</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              {(
                [
                  ['Letters', data.metrics.letterSubmitted],
                  ['Replies', data.metrics.replySubmitted],
                  ['First Replies', data.metrics.firstReplyReceived],
                  ['Opens', data.metrics.letterOpened],
                  ['Reactions', data.metrics.reactionSubmitted],
                  ['Shares', data.metrics.letterShared],
                  ['Returning', data.metrics.returnParticipation],
                ] as const
              ).map(([label, val]) => (
                <div
                  key={label}
                  className="rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-4"
                >
                  <p className="text-xs text-[#77736D] dark:text-[#A19B92]">{label}</p>
                  <p className="text-2xl font-editorial font-semibold mt-1 tabular-nums">{val}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Moderation Reason / Internal Notes Inputs */}
          <section className="rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="mod-reason" className="block text-xs font-medium mb-1">
                Action Reason (shared in user notice)
              </label>
              <input
                id="mod-reason"
                type="text"
                value={reasonInput}
                onChange={(e) => setReasonInput(e.target.value)}
                placeholder="e.g. Personal information exposure or harassment"
                className="w-full rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3] dark:bg-[#181715] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="mod-notes" className="block text-xs font-medium mb-1">
                Internal Moderator Notes (private audit trail only)
              </label>
              <input
                id="mod-notes"
                type="text"
                value={notesInput}
                onChange={(e) => setNotesInput(e.target.value)}
                placeholder="Optional context for fellow moderators"
                className="w-full rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3] dark:bg-[#181715] px-3 py-2 text-sm"
              />
            </div>
          </section>

          {/* Flagged Letters Queue */}
          <section className="space-y-4">
            <h2 className="font-editorial text-2xl font-semibold">
              Flagged Submissions Queue ({data.flaggedLetters.length})
            </h2>
            {data.flaggedLetters.length === 0 ? (
              <p className="text-sm text-[#77736D] dark:text-[#A19B92]">
                No submissions currently flagged for review.
              </p>
            ) : (
              <div className="space-y-3">
                {data.flaggedLetters.map((l) => (
                  <div
                    key={l.id}
                    className="rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-5 space-y-3"
                  >
                    <div className="text-xs text-[#77736D] dark:text-[#A19B92]">
                      {l.authorDisplayName} · {l.status} · {formatEditorialDate(l.createdAt)}
                    </div>
                    <p className="font-medium text-sm">{l.title || 'Untitled letter'}</p>
                    <p className="text-sm text-[#77736D] dark:text-[#A19B92] whitespace-pre-line">
                      {l.body}
                    </p>
                    <div className="flex flex-wrap gap-2 pt-2 text-xs">
                      <button
                        type="button"
                        onClick={() =>
                          void runDecision({
                            targetType: 'letter',
                            targetId: l.id,
                            actionType: 'restore_content',
                          })
                        }
                        className="rounded border border-[#E8E5DF] dark:border-[#332F2A] px-3 py-1.5 hover:bg-[#F1EFE9] dark:hover:bg-[#282521]"
                      >
                        Approve / Restore
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void runDecision({
                            targetType: 'letter',
                            targetId: l.id,
                            actionType: 'remove_content',
                          })
                        }
                        className="rounded border border-[#80545A] text-[#80545A] dark:text-[#B8838A] px-3 py-1.5"
                      >
                        Remove Letter
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Reports & Appeals Queue */}
          <section className="space-y-4">
            <h2 className="font-editorial text-2xl font-semibold">
              Reports &amp; Appeals ({data.reports.length})
            </h2>
            {data.reports.length === 0 ? (
              <p className="text-sm text-[#77736D] dark:text-[#A19B92]">No reports submitted.</p>
            ) : (
              <div className="space-y-3">
                {data.reports.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-5 space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#77736D] dark:text-[#A19B92]">
                      <span>
                        Target: <strong>{r.targetType}</strong> · Reason:{' '}
                        <strong>{REPORT_REASON_LABELS[r.reason] || r.reason}</strong> · Status:{' '}
                        <strong>{r.status}</strong>
                      </span>
                      <span>{formatEditorialDate(r.createdAt)}</span>
                    </div>
                    {r.targetPreview && (
                      <p className="text-sm bg-[#F8F7F3] dark:bg-[#181715] p-3 rounded border border-[#E8E5DF] dark:border-[#332F2A]">
                        {r.targetPreview}
                      </p>
                    )}
                    {r.description && <p className="text-xs text-[#77736D]">{r.description}</p>}
                    {r.appealNote && (
                      <p className="text-xs bg-[#F1EFE9] dark:bg-[#282521] p-2.5 rounded">
                        Appeal note: {r.appealNote}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1 text-xs">
                      {(r.targetType === 'letter' || r.targetType === 'reply') && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              void runDecision({
                                reportId: r.id,
                                targetType: r.targetType,
                                targetId: r.targetId,
                                actionType: 'remove_content',
                              })
                            }
                            className="rounded border border-[#80545A] text-[#80545A] dark:text-[#B8838A] px-3 py-1.5"
                          >
                            Remove {r.targetType}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void runDecision({
                                reportId: r.id,
                                targetType: r.targetType,
                                targetId: r.targetId,
                                actionType: 'restore_content',
                              })
                            }
                            className="rounded border border-[#E8E5DF] dark:border-[#332F2A] px-3 py-1.5"
                          >
                            Restore
                          </button>
                        </>
                      )}
                      {r.targetType === 'letter' && (
                        <button
                          type="button"
                          onClick={() =>
                            void runDecision({
                              reportId: r.id,
                              targetType: 'letter',
                              targetId: r.targetId,
                              actionType: 'lock_conversation',
                            })
                          }
                          className="rounded border border-[#E8E5DF] dark:border-[#332F2A] px-3 py-1.5"
                        >
                          Lock Replies
                        </button>
                      )}
                      {r.targetType === 'account' && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              void runDecision({
                                reportId: r.id,
                                targetType: 'account',
                                targetId: r.targetId,
                                actionType: 'restrict_account',
                              })
                            }
                            className="rounded border border-[#80545A] text-[#80545A] px-3 py-1.5"
                          >
                            Restrict Account
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void runDecision({
                                reportId: r.id,
                                targetType: 'account',
                                targetId: r.targetId,
                                actionType: 'suspend_account',
                              })
                            }
                            className="rounded bg-[#80545A] text-white px-3 py-1.5"
                          >
                            Suspend Account
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void runDecision({
                                reportId: r.id,
                                targetType: 'account',
                                targetId: r.targetId,
                                actionType: 'restore_account',
                              })
                            }
                            className="rounded border border-[#E8E5DF] dark:border-[#332F2A] px-3 py-1.5"
                          >
                            Restore Account
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          void runDecision({
                            reportId: r.id,
                            targetType: r.targetType,
                            targetId: r.targetId,
                            actionType: 'dismiss_report',
                          })
                        }
                        className="rounded border border-[#E8E5DF] dark:border-[#332F2A] px-3 py-1.5 text-[#77736D]"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Editorial Controls: Letter of the Day & Platform Announcement */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <form
              onSubmit={handleSaveLotd}
              className="rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-6 space-y-4"
            >
              <h2 className="font-editorial text-2xl font-semibold">Letter of the Day</h2>
              <p className="text-xs text-[#77736D] dark:text-[#A19B92]">
                Editorially selected from eligible public letters (never determined by popularity).
              </p>
              <select
                value={selectedLotdId}
                onChange={(e) => setSelectedLotdId(e.target.value)}
                className="w-full rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3] dark:bg-[#181715] px-3 py-2 text-sm"
              >
                <option value="">None selected (hide section)</option>
                {publicLetters.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.title || l.body.slice(0, 60)} — by {l.authorDisplayName}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={lotdNote}
                onChange={(e) => setLotdNote(e.target.value)}
                placeholder="Optional short editorial note"
                className="w-full rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3] dark:bg-[#181715] px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="rounded-md bg-[#80545A] text-white px-4 py-2 text-sm font-medium"
              >
                Save Selection
              </button>
            </form>

            <form
              onSubmit={handleSaveAnnouncement}
              className="rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-6 space-y-4"
            >
              <h2 className="font-editorial text-2xl font-semibold">Platform Announcement</h2>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={announcementActive}
                  onChange={(e) => setAnnouncementActive(e.target.checked)}
                  className="accent-[#80545A]"
                />
                <span>Display announcement banner across the site</span>
              </label>
              <input
                type="text"
                maxLength={280}
                value={announcementMessage}
                onChange={(e) => setAnnouncementMessage(e.target.value)}
                placeholder="Write a calm, brief platform announcement…"
                className="w-full rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3] dark:bg-[#181715] px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="rounded-md bg-[#80545A] text-white px-4 py-2 text-sm font-medium"
              >
                Save Announcement
              </button>
            </form>
          </section>

          {/* Category Manager */}
          <section className="rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-6 space-y-5">
            <h2 className="font-editorial text-2xl font-semibold">Categories</h2>
            <div className="divide-y divide-[#E8E5DF] dark:divide-[#332F2A]">
              {allCategories.map((c) => (
                <div key={c.id} className="py-2.5 flex items-center justify-between gap-4 text-sm">
                  <div>
                    <span className="font-medium">{c.name}</span>{' '}
                    <span className="text-xs text-[#77736D]">({c.slug})</span>
                    <p className="text-xs text-[#77736D] dark:text-[#A19B92]">{c.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleToggleCategory(c)}
                    className="text-xs underline shrink-0"
                  >
                    {c.is_active ? 'Disable' : 'Enable'}
                  </button>
                </div>
              ))}
            </div>

            <form onSubmit={handleAddCategory} className="pt-4 border-t border-[#E8E5DF] dark:border-[#332F2A] grid grid-cols-1 sm:grid-cols-4 gap-3">
              <input
                type="text"
                required
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="New category name"
                className="rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3] dark:bg-[#181715] px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={newCatSlug}
                onChange={(e) => setNewCatSlug(e.target.value)}
                placeholder="slug (optional)"
                className="rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3] dark:bg-[#181715] px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={newCatDesc}
                onChange={(e) => setNewCatDesc(e.target.value)}
                placeholder="Short description"
                className="rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3] dark:bg-[#181715] px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="rounded-md bg-[#80545A] text-white px-4 py-2 text-sm font-medium"
              >
                Add Category
              </button>
            </form>
          </section>

          {/* Audit Trail */}
          <section className="space-y-3">
            <h2 className="font-editorial text-2xl font-semibold">Moderation Audit Trail</h2>
            {data.auditTrail.length === 0 ? (
              <p className="text-sm text-[#77736D] dark:text-[#A19B92]">No actions logged yet.</p>
            ) : (
              <div className="rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] divide-y divide-[#E8E5DF] dark:divide-[#332F2A]">
                {data.auditTrail.map((a) => (
                  <div key={a.id} className="p-4 text-xs sm:text-sm space-y-1">
                    <div className="flex justify-between text-[#77736D] dark:text-[#A19B92]">
                      <span>
                        <strong>{a.moderatorDisplayName}</strong> · {a.actionType} ({a.targetType})
                      </span>
                      <span>{formatEditorialDate(a.createdAt)}</span>
                    </div>
                    <p>{a.reason}</p>
                    {a.internalNotes && (
                      <p className="text-xs italic text-[#77736D]">Internal note: {a.internalNotes}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
