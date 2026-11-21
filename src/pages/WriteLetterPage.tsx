import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
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
import { SafetySupportBanner } from '../components/SafetySupportBanner.tsx';

const LOCAL_DRAFT_KEY = 'ds_local_letter_draft';

export function WriteLetterPage() {
  const { categories, token, profile, openAuthPrompt } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'unlisted'>('public');
  const [allowExternalSharing, setAllowExternalSharing] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(Boolean(editId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!categoryId && categories.length > 0) {
      setCategoryId(categories[0].id);
    }
  }, [categories, categoryId]);

  useEffect(() => {
    if (editId) return;
    try {
      const raw = localStorage.getItem(LOCAL_DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          title?: string;
          body?: string;
          categoryId?: string;
          visibility?: 'public' | 'unlisted';
        };
        if (parsed.title) setTitle(parsed.title);
        if (parsed.body) setBody(parsed.body);
        if (parsed.categoryId) setCategoryId(parsed.categoryId);
        if (parsed.visibility) setVisibility(parsed.visibility);
      }
    } catch {
      // ignore corrupted draft
    }
  }, [editId]);

  useEffect(() => {
    if (!editId || !token) {
      setLoadingEdit(false);
      return;
    }
    let mounted = true;
    async function loadExisting() {
      try {
        const res = await apiFetch<{ letter: PublicLetterDTO }>(
          `/api/letters/${editId}?track=false`,
          { token }
        );
        if (!mounted) return;
        setTitle(res.letter.title || '');
        setBody(res.letter.body);
        setCategoryId(res.letter.category.id);
        setVisibility(res.letter.visibility);
        setAllowExternalSharing(res.letter.allowExternalSharing);
      } catch (err) {
        if (mounted)
          setError(err instanceof Error ? err.message : 'Unable to load letter for editing.');
      } finally {
        if (mounted) setLoadingEdit(false);
      }
    }
    void loadExisting();
    return () => {
      mounted = false;
    };
  }, [editId, token]);

  useEffect(() => {
    if (editId) return;
    try {
      localStorage.setItem(
        LOCAL_DRAFT_KEY,
        JSON.stringify({ title, body, categoryId, visibility })
      );
    } catch {
      // ignore storage quota errors
    }
  }, [title, body, categoryId, visibility, editId]);

  const trimmedLength = body.trim().length;
  const safetyPreview = screenContentForSafety(`${title}\n${body}`);

  const validateForPublish = (): boolean => {
    setError(null);
    if (!categoryId) {
      setError('Please select a category.');
      return false;
    }
    if (trimmedLength < MIN_LETTER_LENGTH) {
      setError(`Your letter needs at least ${MIN_LETTER_LENGTH} characters before publishing.`);
      return false;
    }
    if (trimmedLength > MAX_LETTER_LENGTH) {
      setError(`Your letter cannot exceed ${MAX_LETTER_LENGTH} characters.`);
      return false;
    }
    return true;
  };

  const submitLetter = async (targetStatus: 'draft' | 'published') => {
    if (!token || !profile?.ageConfirmedAt) {
      openAuthPrompt(
        token
          ? 'Please confirm that you are 18 or older before saving or publishing.'
          : 'Continue anonymously or with Google to save or publish your letter.'
      );
      return;
    }
    if (targetStatus === 'published' && !validateForPublish()) {
      setConfirmOpen(false);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        title: title.trim() || null,
        body,
        categoryId,
        visibility,
        status: targetStatus,
        allowExternalSharing,
      };

      if (editId) {
        const res = await apiFetch<{ letter: PublicLetterDTO }>(`/api/letters/${editId}`, {
          method: 'PATCH',
          token,
          body: JSON.stringify(payload),
        });
        showToast(
          targetStatus === 'draft' ? 'Draft updated in your profile.' : 'Letter updated.',
          'success'
        );
        navigate(`/letters/${res.letter.id}`);
      } else {
        const res = await apiFetch<{
          letter: PublicLetterDTO;
          safetyNotice: { imminentHarmDetected: boolean; flaggedForReview: boolean };
        }>('/api/letters', {
          method: 'POST',
          token,
          body: JSON.stringify(payload),
        });
        localStorage.removeItem(LOCAL_DRAFT_KEY);
        if (targetStatus === 'draft') {
          showToast('Draft saved privately to your profile.', 'success');
          navigate('/dashboard?tab=letters');
        } else if (res.safetyNotice.flaggedForReview) {
          showToast(
            'Your letter was saved and queued for a quick safety review before appearing publicly.',
            'info'
          );
          navigate('/dashboard?tab=letters');
        } else {
          showToast('Your letter has been published.', 'success');
          navigate(`/letters/${res.letter.id}`);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit letter.');
      setConfirmOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingEdit) {
    return (
      <div className="px-4 sm:px-6 py-10">
        <div className="h-96 rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] animate-pulse" />
      </div>
    );
  }

  return (
    <div>
      {/* Sticky Compose Top Bar */}
      <div className="sticky top-[52px] md:top-0 z-20 px-4 sm:px-6 py-3 border-b border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3]/95 dark:bg-[#181715]/95 backdrop-blur-sm flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Go back"
            className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-md hover:bg-[#F1EFE9] dark:hover:bg-[#201E1B] text-[#252525] dark:text-[#EAE6DF] transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="font-editorial text-2xl font-semibold truncate">
            {editId ? 'Edit Letter' : 'Write a Letter'}
          </h1>
        </div>

        <div className="flex items-center gap-2 text-xs text-[#77736D] dark:text-[#A19B92] shrink-0">
          <AuthorAvatar name={profile?.displayName || 'Stranger'} size="sm" />
          <span className="hidden sm:inline font-medium text-[#252525] dark:text-[#EAE6DF]">
            {profile?.displayName || 'Anonymous'}
          </span>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-5 sm:py-6 space-y-5">
        {safetyPreview.imminentHarmDetected && <SafetySupportBanner />}

        {/* Calm Writing Canvas */}
        <div className="rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-4 sm:p-6 space-y-5">
          <div className="border-b border-[#E8E5DF] dark:border-[#332F2A] pb-3.5">
            <label htmlFor="letter-title" className="sr-only">
              Letter title (optional)
            </label>
            <input
              id="letter-title"
              type="text"
              maxLength={MAX_TITLE_LENGTH}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="An optional title…"
              className="w-full bg-transparent font-editorial text-2xl sm:text-3xl font-semibold text-[#252525] dark:text-[#EAE6DF] placeholder:text-[#77736D]/60 dark:placeholder:text-[#A19B92]/60 focus:outline-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label
                htmlFor="letter-body"
                className="text-xs font-medium text-[#77736D] dark:text-[#A19B92]"
              >
                Your letter
              </label>
              <span
                className={`text-xs tabular-nums ${
                  trimmedLength > 0 && trimmedLength < MIN_LETTER_LENGTH
                    ? 'text-[#80545A] dark:text-[#B8838A]'
                    : 'text-[#77736D] dark:text-[#A19B92]'
                }`}
              >
                {trimmedLength.toLocaleString()} / {MAX_LETTER_LENGTH.toLocaleString()}
                {trimmedLength < MIN_LETTER_LENGTH ? ` (min ${MIN_LETTER_LENGTH})` : ''}
              </span>
            </div>
            <textarea
              id="letter-body"
              rows={11}
              maxLength={MAX_LETTER_LENGTH}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write what is easier to tell a stranger…"
              className="w-full rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3]/75 dark:bg-[#181715]/75 px-4 py-3.5 text-[16px] leading-[1.7] text-[#252525] dark:text-[#EAE6DF] focus:border-[#80545A] dark:focus:border-[#B8838A] focus:outline-none"
            />
            <p className="text-xs text-[#77736D] dark:text-[#A19B92] mt-2">
              Leave out real full names, phone numbers, addresses, or identifying personal details.
            </p>
          </div>

          {/* Topic & Visibility */}
          <div className="pt-4 border-t border-[#E8E5DF] dark:border-[#332F2A] grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="letter-category" className="block text-xs font-medium mb-1.5">
                Topic
              </label>
              <select
                id="letter-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3] dark:bg-[#181715] px-3.5 py-2.5 text-sm"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="letter-visibility" className="block text-xs font-medium mb-1.5">
                Visibility
              </label>
              <select
                id="letter-visibility"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as 'public' | 'unlisted')}
                className="w-full rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3] dark:bg-[#181715] px-3.5 py-2.5 text-sm"
              >
                <option value="public">Public — Listed in Timeline &amp; Explore</option>
                <option value="unlisted">Unlisted — Direct link only, hidden from feeds</option>
              </select>
            </div>
          </div>

          <label className="flex items-start gap-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={allowExternalSharing}
              onChange={(e) => setAllowExternalSharing(e.target.checked)}
              className="mt-1 accent-[#80545A]"
            />
            <span className="text-xs sm:text-sm text-[#77736D] dark:text-[#A19B92]">
              Allow Share Studio cards and external sharing for this letter.
            </span>
          </label>

          {error && (
            <p role="alert" className="text-sm text-[#80545A] dark:text-[#B8838A]">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="pt-4 border-t border-[#E8E5DF] dark:border-[#332F2A] flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={submitting}
                onClick={() => void submitLetter('draft')}
                className="rounded-md border border-[#E8E5DF] dark:border-[#332F2A] px-4 py-2 min-h-[40px] text-xs sm:text-sm hover:bg-[#F1EFE9] dark:hover:bg-[#282521] disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                Save Draft
              </button>
              {!editId && (title.length > 0 || body.length > 0) && (
                <button
                  type="button"
                  onClick={() => {
                    setTitle('');
                    setBody('');
                    localStorage.removeItem(LOCAL_DRAFT_KEY);
                  }}
                  className="text-xs text-[#77736D] hover:text-[#252525] dark:text-[#A19B92] dark:hover:text-[#EAE6DF] underline"
                >
                  Clear local draft
                </button>
              )}
            </div>

            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                if (!token) {
                  openAuthPrompt('Continue anonymously or with Google to publish your letter.');
                  return;
                }
                if (validateForPublish()) setConfirmOpen(true);
              }}
              className="rounded-md bg-[#80545A] hover:bg-[#6C454A] text-white px-6 py-2.5 min-h-[42px] text-sm font-medium disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              {editId ? 'Review & Save Changes' : 'Review & Publish'}
            </button>
          </div>
        </div>
      </div>

      {/* Publishing Confirmation Modal */}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="publish-confirm-title"
        >
          <div className="w-full max-w-md rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-6 space-y-4">
            <h2 id="publish-confirm-title" className="font-editorial text-2xl font-semibold">
              Ready to publish?
            </h2>
            <p className="text-sm text-[#77736D] dark:text-[#A19B92] leading-relaxed">
              Your letter will be posted under your anonymous nickname{' '}
              <strong className="text-[#252525] dark:text-[#EAE6DF]">{profile?.displayName}</strong>{' '}
              with visibility set to{' '}
              <strong className="text-[#252525] dark:text-[#EAE6DF]">{visibility}</strong>.
            </p>
            <p className="text-xs text-[#77736D] dark:text-[#A19B92]">
              By publishing, you confirm this letter follows our{' '}
              <Link to="/guidelines" className="underline">
                Community Guidelines
              </Link>
              .
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 text-sm text-[#77736D]"
              >
                Keep Editing
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void submitLetter('published')}
                className="rounded-md bg-[#80545A] hover:bg-[#6C454A] text-white px-5 py-2 text-sm font-medium disabled:opacity-50"
              >
                {submitting ? 'Publishing…' : 'Confirm & Publish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
