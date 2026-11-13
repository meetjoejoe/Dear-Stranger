import React from 'react';
import { Link } from 'react-router-dom';
import type { PublicLetterDTO } from '../shared/types.ts';

export function formatEditorialDate(iso: string | null): string {
  if (!iso) return 'Draft';
  const date = new Date(iso);
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function LetterCard({
  letter,
  showVisibility = false,
}: {
  letter: PublicLetterDTO;
  showVisibility?: boolean;
}) {
  const excerpt =
    letter.body.length > 260 ? `${letter.body.slice(0, 260).trimEnd()}…` : letter.body;

  return (
    <article className="group rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-6 sm:p-7 transition-colors hover:border-[#80545A]/50 dark:hover:border-[#B8838A]/50">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#77736D] dark:text-[#A19B92]">
        <span className="font-medium text-[#80545A] dark:text-[#B8838A]">
          {letter.category.name}
        </span>
        <span aria-hidden="true">·</span>
        <span>{formatEditorialDate(letter.publishedAt || letter.createdAt)}</span>
        <span aria-hidden="true">·</span>
        <span>by {letter.authorDisplayName}</span>
        {showVisibility && (
          <>
            <span aria-hidden="true">·</span>
            <span className="capitalize">{letter.visibility}</span>
            <span aria-hidden="true">·</span>
            <span className="capitalize">{letter.status.replace(/_/g, ' ')}</span>
          </>
        )}
        {letter.isSandboxSample && (
          <>
            <span aria-hidden="true">·</span>
            <span>Sandbox Sample</span>
          </>
        )}
      </div>

      {letter.openLetterboxLabel && (
        <p className="mt-2 text-xs italic text-[#77736D] dark:text-[#A19B92]">
          {letter.openLetterboxLabel}
        </p>
      )}

      <Link to={`/letters/${letter.id}`} className="block mt-3 focus:outline-none">
        {letter.title ? (
          <h3 className="font-editorial text-2xl sm:text-[26px] font-semibold leading-snug text-[#252525] dark:text-[#EAE6DF] group-hover:text-[#80545A] dark:group-hover:text-[#B8838A] transition-colors text-balance">
            {letter.title}
          </h3>
        ) : (
          <h3 className="font-editorial text-xl italic font-medium text-[#77736D] dark:text-[#A19B92] group-hover:text-[#80545A] dark:group-hover:text-[#B8838A] transition-colors">
            Untitled letter
          </h3>
        )}

        <p className="mt-3 text-[15px] leading-[1.7] text-[#252525]/90 dark:text-[#EAE6DF]/90 whitespace-pre-line">
          {excerpt}
        </p>
      </Link>

      <div className="mt-5 pt-4 border-t border-[#E8E5DF] dark:border-[#332F2A] flex items-center justify-between gap-4 text-xs text-[#77736D] dark:text-[#A19B92]">
        <div className="flex items-center gap-3 tabular-nums">
          <span>
            {letter.replyCount} {letter.replyCount === 1 ? 'reply' : 'replies'}
          </span>
          {letter.reactions.total > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span>
                {letter.reactions.total}{' '}
                {letter.reactions.total === 1 ? 'response' : 'responses'} felt
              </span>
            </>
          )}
        </div>
        <Link
          to={`/letters/${letter.id}`}
          className="font-medium text-[#252525] dark:text-[#EAE6DF] hover:text-[#80545A] dark:hover:text-[#B8838A] transition-colors whitespace-nowrap shrink-0"
        >
          Read letter &rarr;
        </Link>
      </div>
    </article>
  );
}
