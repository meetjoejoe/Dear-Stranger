import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type {
  BlockedAccountDTO,
  NotificationDTO,
  NotificationPreferencesDTO,
  PublicLetterDTO,
  ReportDTO,
} from '../shared/types.ts';
import { apiFetch } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { LetterCard, formatEditorialDate } from '../components/LetterCard.tsx';

type DashboardTab =
  | 'letters'
  | 'replies'
  | 'conversations'
  | 'saved'
  | 'notifications'
  | 'account'
  | 'privacy';

const VALID_TABS: DashboardTab[] = [
  'letters',
  'replies',
  'conversations',
  'saved',
  'notifications',
  'account',
  'privacy',
];

function parseTab(raw: string | null): DashboardTab {
  if (raw === 'settings') return 'account';
  return VALID_TABS.includes(raw as DashboardTab) ? (raw as DashboardTab) : 'letters';
}

interface DashboardPayload {
  myLetters: PublicLetterDTO[];
  myReplies: Array<{
    id: string;
    letterId: string;
    letterTitle: string | null;
    body: string;
    status: string;
    createdAt: string;
  }>;
  conversations: PublicLetterDTO[];
  savedLetters: PublicLetterDTO[];
  notifications: NotificationDTO[];
  preferences: NotificationPreferencesDTO;
  blockedAccounts: BlockedAccountDTO[];
  myAppeals?: ReportDTO[];
}

export function DashboardPage() {
  const {
    config,
    token,
    profile,
    theme,
    setTheme,
    openAuthPrompt,
    refreshProfile,
    refreshUnreadCount,
    linkRecoveryEmail,
    signOut,
    toggleSandboxAdmin,
  } = useAuth();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const tab = parseTab(searchParams.get('tab'));
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(false);

  const [nicknameInput, setNicknameInput] = useState('');
  const [recoveryEmailInput, setRecoveryEmailInput] = useState('');
  const [appealNote, setAppealNote] = useState('');
  const [confirmDeleteText, setConfirmDeleteText] = useState('');
  const [busyAction, setBusyAction] = useState(false);

  const selectTab = (next: DashboardTab) => {
    const updated = new URLSearchParams(searchParams);
    updated.set('tab', next);
    setSearchParams(updated, { replace: true });
  };

  const loadDashboard = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await apiFetch<DashboardPayload>('/api/dashboard', { token });
      setData(res);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to load dashboard.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast, token]);

  useEffect(() => {
    if (profile) setNicknameInput(profile.displayName);
    void loadDashboard();
  }, [profile, loadDashboard]);

  if (!token || !profile) {
    return (
      <div className="px-4 sm:px-8 py-14">
        <div className="rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-8 text-center space-y-4">
          <h1 className="font-editorial text-3xl font-semibold">Your Personal Desk</h1>
          <p className="text-sm text-[#77736D] dark:text-[#A19B92] max-w-md mx-auto leading-relaxed">
            Sign in with an anonymous identity or a linked recovery email to view your letters,
            replies, saved bookmarks, notifications, and privacy settings.
          </p>
          <button
            type="button"
            onClick={() => openAuthPrompt('Create or continue your anonymous identity.')}
            className="rounded-md bg-[#80545A] hover:bg-[#6C454A] text-white px-6 py-2.5 text-sm font-medium"
          >
            Continue Anonymously
          </button>
        </div>
      </div>
    );
  }

  const handleToggleVisibility = async (letter: PublicLetterDTO) => {
    const nextVis = letter.visibility === 'public' ? 'unlisted' : 'public';
    try {
      await apiFetch(`/api/letters/${letter.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({
          title: letter.title,
          body: letter.body,
          categoryId: letter.category.id,
          visibility: nextVis,
          status: letter.status === 'draft' ? 'draft' : 'published',
          allowExternalSharing: letter.allowExternalSharing,
        }),
      });
      showToast(`Visibility changed to ${nextVis}.`, 'success');
      await loadDashboard();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not change visibility.', 'error');
    }
  };

  const handleDeleteLetter = async (letterId: string) => {
    try {
      await apiFetch(`/api/letters/${letterId}`, { method: 'DELETE', token });
      showToast('Letter deleted.', 'info');
      await loadDashboard();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not delete letter.', 'error');
    }
  };

  const handleDeleteReply = async (replyId: string) => {
    try {
      await apiFetch(`/api/replies/${replyId}`, { method: 'DELETE', token });
      showToast('Reply deleted.', 'info');
      await loadDashboard();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not delete reply.', 'error');
    }
  };

  const handleUnsave = async (letterId: string) => {
    try {
      await apiFetch(`/api/letters/${letterId}/save`, {
        method: 'PUT',
        token,
        body: JSON.stringify({ save: false }),
      });
      showToast('Removed from saved letters.', 'info');
      await loadDashboard();
    } catch {
      showToast('Could not unsave letter.', 'error');
    }
  };

  const handleMarkNotificationsRead = async (notificationId?: string) => {
    try {
      await apiFetch('/api/notifications/read', {
        method: 'POST',
        token,
        body: JSON.stringify({ notificationId }),
      });
      await loadDashboard();
      await refreshUnreadCount();
    } catch {
      showToast('Could not mark notifications read.', 'error');
    }
  };

  const handleSaveNickname = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyAction(true);
    try {
      await apiFetch('/api/me', {
        method: 'PATCH',
        token,
        body: JSON.stringify({ displayName: nicknameInput }),
      });
      await refreshProfile();
      showToast('Display nickname updated.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update nickname.', 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const handleLinkEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryEmailInput.trim()) return;
    setBusyAction(true);
    try {
      await linkRecoveryEmail(recoveryEmailInput);
      showToast(
        config?.supabaseConfigured
          ? 'Verification email sent. Confirm via the link in your inbox to finish protecting your account.'
          : 'Recovery email linked in Sandbox Preview Mode.',
        'success'
      );
      setRecoveryEmailInput('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not link recovery email.', 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const handlePrefToggle = async (key: keyof NotificationPreferencesDTO, value: boolean) => {
    if (!data) return;
    const next = { ...data.preferences, [key]: value };
    try {
      const res = await apiFetch<{ preferences: NotificationPreferencesDTO }>(
        '/api/preferences/notifications',
        {
          method: 'PUT',
          token,
          body: JSON.stringify(next),
        }
      );
      setData({ ...data, preferences: res.preferences });
      showToast('Notification preferences updated.', 'success');
    } catch {
      showToast('Could not save preferences.', 'error');
    }
  };

  const handleUnblock = async (blockId: string) => {
    try {
      await apiFetch(`/api/blocks/${blockId}`, { method: 'DELETE', token });
      showToast('Account unblocked.', 'info');
      await loadDashboard();
    } catch {
      showToast('Could not unblock account.', 'error');
    }
  };

  const handleAppeal = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyAction(true);
    try {
      await apiFetch('/api/appeals', {
        method: 'POST',
        token,
        body: JSON.stringify({ note: appealNote }),
      });
      setAppealNote('');
      showToast('Your moderation appeal has been submitted.', 'success');
      await loadDashboard();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not submit appeal.', 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (confirmDeleteText !== 'DELETE') return;
    setBusyAction(true);
    try {
      await apiFetch('/api/me', { method: 'DELETE', token });
      await signOut();
      showToast('Your account and letters have been deleted.', 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not delete account.', 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const unreadCount = data?.notifications.filter((n) => !n.isRead).length || 0;

  const tabs: Array<[DashboardTab, string]> = [
    ['letters', `My Letters (${data?.myLetters.length ?? 0})`],
    ['replies', `Replies (${data?.myReplies.length ?? 0})`],
    ['conversations', `Threads (${data?.conversations.length ?? 0})`],
    ['saved', `Saved (${data?.savedLetters.length ?? 0})`],
    ['notifications', `Notifications${unreadCount > 0 ? ` (${unreadCount})` : ''}`],
    ['account', 'Settings'],
    ['privacy', 'Privacy & Safety'],
  ];

  return (
    <div>
      {/* Header */}
      <div className="px-4 sm:px-6 py-6 border-b border-[#E8E5DF] dark:border-[#332F2A] flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-[#80545A] dark:text-[#B8838A] font-medium">
            Anonymous Identity
          </p>
          <h1 className="font-editorial text-2xl sm:text-3xl font-semibold mt-0.5">
            {profile.displayName}
          </h1>
          <p className="text-xs text-[#77736D] dark:text-[#A19B92] mt-1">
            Status: {profile.accountStatus} ·{' '}
            {profile.recoveryEmailLinked
              ? 'Recovery email linked'
              : 'Unlinked session (link an email under Settings to prevent loss)'}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {profile.isAdmin && (
            <Link
              to="/moderation"
              className="rounded-md border border-[#80545A] text-[#80545A] dark:border-[#B8838A] dark:text-[#B8838A] px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0"
            >
              Moderation Console
            </Link>
          )}
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded-md border border-[#E8E5DF] dark:border-[#332F2A] px-3 py-1.5 text-xs text-[#77736D] hover:text-[#252525] dark:text-[#A19B92] dark:hover:text-[#EAE6DF] whitespace-nowrap shrink-0"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Moderation Warning if restricted/suspended */}
      {profile.accountStatus !== 'active' && (
        <div className="px-4 sm:px-6 py-4 border-b border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] text-sm space-y-1.5">
          <p className="font-medium text-[#80545A] dark:text-[#B8838A]">
            Your account status is currently: {profile.accountStatus}
          </p>
          {profile.restrictionReason && (
            <p className="text-[#77736D] dark:text-[#A19B92]">Reason: {profile.restrictionReason}</p>
          )}
          <p className="text-xs text-[#77736D] dark:text-[#A19B92]">
            You can submit an appeal under Privacy &amp; Safety.
          </p>
        </div>
      )}

      {/* Editorial Underline Tabs */}
      <div
        className="border-b border-[#E8E5DF] dark:border-[#332F2A] px-4 sm:px-6 overflow-x-auto scrollbar-none flex items-center gap-5"
        role="tablist"
      >
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => selectTab(id)}
            className={`py-3 text-xs font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors tabular-nums ${
              tab === id
                ? 'border-[#80545A] dark:border-[#B8838A] text-[#252525] dark:text-[#EAE6DF]'
                : 'border-transparent text-[#77736D] dark:text-[#A19B92] hover:text-[#252525] dark:hover:text-[#EAE6DF]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <div className="p-6">
          <div className="h-44 rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] animate-pulse" />
        </div>
      ) : (
        <div>
          {tab === 'letters' && (
            <div>
              {!data || data.myLetters.length === 0 ? (
                <div className="px-4 sm:px-6 py-12 text-center space-y-3">
                  <p className="text-sm text-[#77736D] dark:text-[#A19B92]">
                    You haven&apos;t written any letters yet.
                  </p>
                  <Link
                    to="/write"
                    className="inline-block rounded-md bg-[#80545A] text-white px-5 py-2 text-sm font-medium"
                  >
                    Write a Letter
                  </Link>
                </div>
              ) : (
                data.myLetters.map((l) => (
                  <div key={l.id} className="border-b border-[#E8E5DF] dark:border-[#332F2A]">
                    <LetterCard
                      letter={l}
                      showVisibility
                      variant="timeline"
                      onUpdated={() => void loadDashboard()}
                    />
                    <div className="flex flex-wrap items-center gap-4 px-4 sm:px-6 pb-4 text-xs text-[#77736D] dark:text-[#A19B92]">
                      <Link
                        to={`/write?edit=${l.id}`}
                        className="underline hover:text-[#252525] dark:hover:text-[#EAE6DF]"
                      >
                        Edit
                      </Link>
                      {l.status === 'published' && (
                        <button
                          type="button"
                          onClick={() => void handleToggleVisibility(l)}
                          className="underline hover:text-[#252525] dark:hover:text-[#EAE6DF]"
                        >
                          Switch to {l.visibility === 'public' ? 'Unlisted' : 'Public'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleDeleteLetter(l.id)}
                        className="underline hover:text-[#80545A]"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'replies' && (
            <div className="divide-y divide-[#E8E5DF] dark:divide-[#332F2A]">
              {!data || data.myReplies.length === 0 ? (
                <div className="px-4 sm:px-6 py-12 text-center text-sm text-[#77736D] dark:text-[#A19B92]">
                  You haven&apos;t written any replies yet.
                </div>
              ) : (
                data.myReplies.map((r) => (
                  <div key={r.id} className="px-4 sm:px-6 py-5 space-y-2">
                    <div className="flex items-center justify-between text-xs text-[#77736D] dark:text-[#A19B92]">
                      <span>
                        On{' '}
                        <Link
                          to={`/letters/${r.letterId}`}
                          className="underline text-[#252525] dark:text-[#EAE6DF]"
                        >
                          {r.letterTitle || 'Untitled letter'}
                        </Link>{' '}
                        · {formatEditorialDate(r.createdAt)}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleDeleteReply(r.id)}
                        className="hover:text-[#80545A] underline"
                      >
                        Delete
                      </button>
                    </div>
                    <p className="text-sm leading-relaxed whitespace-pre-line">{r.body}</p>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'conversations' && (
            <div>
              {!data || data.conversations.length === 0 ? (
                <div className="px-4 sm:px-6 py-12 text-center text-sm text-[#77736D] dark:text-[#A19B92]">
                  Letters and reply threads you participate in will appear here.
                </div>
              ) : (
                data.conversations.map((l) => (
                  <LetterCard
                    key={l.id}
                    letter={l}
                    showVisibility
                    onUpdated={() => void loadDashboard()}
                  />
                ))
              )}
            </div>
          )}

          {tab === 'saved' && (
            <div>
              {!data || data.savedLetters.length === 0 ? (
                <div className="px-4 sm:px-6 py-12 text-center text-sm text-[#77736D] dark:text-[#A19B92]">
                  Saved letters are strictly private to you. Bookmark any letter while reading or
                  browsing to keep it here.
                </div>
              ) : (
                data.savedLetters.map((l) => (
                  <div key={l.id} className="border-b border-[#E8E5DF] dark:border-[#332F2A]">
                    <LetterCard letter={l} onUpdated={() => void loadDashboard()} />
                    <div className="px-4 sm:px-6 pb-4">
                      <button
                        type="button"
                        onClick={() => void handleUnsave(l.id)}
                        className="text-xs text-[#77736D] hover:text-[#80545A] underline"
                      >
                        Remove from saved
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'notifications' && (
            <div className="divide-y divide-[#E8E5DF] dark:divide-[#332F2A]">
              {data && data.notifications.length > 0 && unreadCount > 0 && (
                <div className="px-4 sm:px-6 py-3 flex justify-end bg-[#F1EFE9]/40 dark:bg-[#201E1B]/40">
                  <button
                    type="button"
                    onClick={() => void handleMarkNotificationsRead()}
                    className="text-xs underline text-[#80545A] dark:text-[#B8838A]"
                  >
                    Mark all as read
                  </button>
                </div>
              )}

              {!data || data.notifications.length === 0 ? (
                <div className="px-4 sm:px-6 py-12 text-center text-sm text-[#77736D] dark:text-[#A19B92]">
                  No notifications yet.
                </div>
              ) : (
                data.notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`px-4 sm:px-6 py-5 flex items-start justify-between gap-4 ${
                      n.isRead ? '' : 'bg-[#FFFFFF]/80 dark:bg-[#201E1B]/80'
                    }`}
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{n.title}</p>
                      <p className="text-sm text-[#77736D] dark:text-[#A19B92]">{n.body}</p>
                      <div className="flex items-center gap-3 text-xs text-[#77736D] dark:text-[#A19B92] pt-1">
                        <span>{formatEditorialDate(n.createdAt)}</span>
                        {n.relatedLetterId && (
                          <Link
                            to={`/letters/${n.relatedLetterId}`}
                            className="underline text-[#80545A] dark:text-[#B8838A]"
                          >
                            Open letter
                          </Link>
                        )}
                      </div>
                    </div>
                    {!n.isRead && (
                      <button
                        type="button"
                        onClick={() => void handleMarkNotificationsRead(n.id)}
                        className="text-xs underline shrink-0 text-[#80545A] dark:text-[#B8838A]"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'account' && (
            <div className="p-4 sm:p-6 space-y-6">
              {/* Display Nickname */}
              <form
                onSubmit={handleSaveNickname}
                className="rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-5 sm:p-6 space-y-4"
              >
                <h2 className="font-editorial text-2xl font-semibold">
                  Anonymous Display Nickname
                </h2>
                <p className="text-xs text-[#77736D] dark:text-[#A19B92]">
                  Choose a nickname that does not reveal your real identity (letters, numbers,
                  underscores).
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={nicknameInput}
                    onChange={(e) => setNicknameInput(e.target.value)}
                    className="flex-1 rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3] dark:bg-[#181715] px-3.5 py-2 text-sm"
                  />
                  <button
                    type="submit"
                    disabled={busyAction}
                    className="rounded-md bg-[#80545A] hover:bg-[#6C454A] text-white px-4 py-2 text-sm font-medium disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    Update
                  </button>
                </div>
              </form>

              {/* Recovery Email Linking */}
              <form
                onSubmit={handleLinkEmail}
                className="rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-5 sm:p-6 space-y-4"
              >
                <h2 className="font-editorial text-2xl font-semibold">
                  Account Recovery Protection
                </h2>
                <p className="text-xs text-[#77736D] dark:text-[#A19B92] leading-relaxed">
                  {profile.recoveryEmailLinked
                    ? 'A verified recovery email is linked to this identity. Your email is never shown publicly.'
                    : 'Unlinked anonymous sessions are lost if browser storage is cleared. Link an email address to keep your letters and replies recoverable without changing your anonymous display name.'}
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="email"
                    value={recoveryEmailInput}
                    onChange={(e) => setRecoveryEmailInput(e.target.value)}
                    placeholder="you@example.com"
                    className="flex-1 rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3] dark:bg-[#181715] px-3.5 py-2 text-sm"
                  />
                  <button
                    type="submit"
                    disabled={busyAction}
                    className="rounded-md border border-[#80545A] text-[#80545A] dark:border-[#B8838A] dark:text-[#B8838A] px-4 py-2 text-sm font-medium whitespace-nowrap shrink-0"
                  >
                    Link Email
                  </button>
                </div>
              </form>

              {/* Appearance & Notification Preferences */}
              <div className="rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-5 sm:p-6 space-y-4">
                <h2 className="font-editorial text-2xl font-semibold">Theme &amp; Notifications</h2>
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <span>Color theme</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void setTheme('light')}
                      className={`px-3 py-1.5 rounded text-xs border ${
                        theme === 'light'
                          ? 'border-[#80545A] font-medium'
                          : 'border-[#E8E5DF] dark:border-[#332F2A]'
                      }`}
                    >
                      Warm Ivory (Light)
                    </button>
                    <button
                      type="button"
                      onClick={() => void setTheme('dark')}
                      className={`px-3 py-1.5 rounded text-xs border ${
                        theme === 'dark'
                          ? 'border-[#B8838A] font-medium'
                          : 'border-[#E8E5DF] dark:border-[#332F2A]'
                      }`}
                    >
                      Charcoal (Dark)
                    </button>
                  </div>
                </div>

                {data && (
                  <div className="pt-3 border-t border-[#E8E5DF] dark:border-[#332F2A] space-y-3 text-sm">
                    <label className="flex items-center justify-between gap-4 cursor-pointer">
                      <span>In-app notifications for replies to my letters</span>
                      <input
                        type="checkbox"
                        checked={data.preferences.replyNotificationsEnabled}
                        onChange={(e) =>
                          void handlePrefToggle('replyNotificationsEnabled', e.target.checked)
                        }
                        className="accent-[#80545A]"
                      />
                    </label>
                    <label className="flex items-center justify-between gap-4 cursor-pointer">
                      <span>In-app notifications for conversation responses</span>
                      <input
                        type="checkbox"
                        checked={data.preferences.conversationNotificationsEnabled}
                        onChange={(e) =>
                          void handlePrefToggle(
                            'conversationNotificationsEnabled',
                            e.target.checked
                          )
                        }
                        className="accent-[#80545A]"
                      />
                    </label>
                    <label className="flex items-center justify-between gap-4 cursor-pointer">
                      <span>
                        Email notifications via Resend{' '}
                        <span className="text-xs text-[#77736D] dark:text-[#A19B92]">
                          (
                          {config?.emailConfigured
                            ? 'configured'
                            : 'requires RESEND_API_KEY & linked email'}
                          )
                        </span>
                      </span>
                      <input
                        type="checkbox"
                        checked={data.preferences.emailNotificationsEnabled}
                        onChange={(e) =>
                          void handlePrefToggle('emailNotificationsEnabled', e.target.checked)
                        }
                        className="accent-[#80545A]"
                      />
                    </label>
                  </div>
                )}
              </div>

              {/* Account Deletion */}
              <div className="rounded-md border border-[#80545A]/50 bg-[#FFFFFF] dark:bg-[#201E1B] p-5 sm:p-6 space-y-3">
                <h2 className="font-editorial text-2xl font-semibold text-[#80545A] dark:text-[#B8838A]">
                  Delete Account
                </h2>
                <p className="text-xs text-[#77736D] dark:text-[#A19B92] leading-relaxed">
                  Permanently deletes your anonymous identity, letters, replies, saved letters, and
                  notifications. Type <strong>DELETE</strong> to confirm.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={confirmDeleteText}
                    onChange={(e) => setConfirmDeleteText(e.target.value)}
                    placeholder="Type DELETE"
                    className="rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3] dark:bg-[#181715] px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    disabled={confirmDeleteText !== 'DELETE' || busyAction}
                    onClick={() => void handleDeleteAccount()}
                    className="rounded-md bg-[#80545A] text-white px-4 py-2 text-sm font-medium disabled:opacity-40 whitespace-nowrap shrink-0"
                  >
                    Delete Account
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === 'privacy' && (
            <div className="p-4 sm:p-6 space-y-6">
              <div className="rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-5 sm:p-6 space-y-3">
                <h2 className="font-editorial text-2xl font-semibold">
                  Blocked Anonymous Accounts
                </h2>
                {!data || data.blockedAccounts.length === 0 ? (
                  <p className="text-sm text-[#77736D] dark:text-[#A19B92]">
                    You haven&apos;t blocked any accounts.
                  </p>
                ) : (
                  <ul className="divide-y divide-[#E8E5DF] dark:divide-[#332F2A]">
                    {data.blockedAccounts.map((b) => (
                      <li key={b.id} className="py-3 flex items-center justify-between text-sm">
                        <span>{b.blockedDisplayName}</span>
                        <button
                          type="button"
                          onClick={() => void handleUnblock(b.id)}
                          className="text-xs underline text-[#80545A] dark:text-[#B8838A]"
                        >
                          Unblock
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <form
                onSubmit={handleAppeal}
                className="rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-5 sm:p-6 space-y-3"
              >
                <h2 className="font-editorial text-2xl font-semibold">Moderation Appeals</h2>
                <p className="text-xs text-[#77736D] dark:text-[#A19B92]">
                  If your letter or account received a moderation decision you believe was in
                  error, submit an appeal for human review.
                </p>
                <textarea
                  rows={3}
                  value={appealNote}
                  onChange={(e) => setAppealNote(e.target.value)}
                  placeholder="Explain why you are requesting a review…"
                  className="w-full rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3] dark:bg-[#181715] px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={busyAction || appealNote.trim().length < 10}
                  className="rounded-md bg-[#80545A] text-white px-4 py-2 text-sm font-medium disabled:opacity-40"
                >
                  Submit Appeal
                </button>
                {data?.myAppeals && data.myAppeals.length > 0 && (
                  <div className="pt-4 border-t border-[#E8E5DF] dark:border-[#332F2A] space-y-2">
                    <p className="text-xs font-medium text-[#252525] dark:text-[#EAE6DF]">
                      Your Submitted Appeals
                    </p>
                    <ul className="space-y-2">
                      {data.myAppeals.map((appeal) => (
                        <li
                          key={appeal.id}
                          className="rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3] dark:bg-[#181715] p-3 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2 text-[#77736D] dark:text-[#A19B92]">
                            <span>
                              Status:{' '}
                              <strong className="text-[#252525] dark:text-[#EAE6DF]">
                                {appeal.status}
                              </strong>
                            </span>
                            <span>
                              {formatEditorialDate(appeal.appealedAt || appeal.createdAt)}
                            </span>
                          </div>
                          {appeal.appealNote && <p className="text-sm">{appeal.appealNote}</p>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </form>

              {config && !config.supabaseConfigured && (
                <div className="rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#F1EFE9] dark:bg-[#282521] p-5 space-y-2 text-xs">
                  <p className="font-medium text-[#252525] dark:text-[#EAE6DF]">
                    Sandbox Preview Testing Only
                  </p>
                  <p className="text-[#77736D] dark:text-[#A19B92]">
                    Because Supabase is not connected, you can temporarily toggle Sandbox Moderator
                    permissions here to evaluate the Moderation Console. When connected to Supabase,
                    admin permissions are strictly verified against the server-side{' '}
                    <code>admin_users</code> table.
                  </p>
                  <button
                    type="button"
                    onClick={() => void toggleSandboxAdmin(!profile.isAdmin)}
                    className="rounded-md border border-[#80545A] text-[#80545A] dark:border-[#B8838A] dark:text-[#B8838A] px-3 py-1.5 font-medium"
                  >
                    {profile.isAdmin
                      ? 'Disable Sandbox Moderator Role'
                      : 'Enable Sandbox Moderator Role'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
