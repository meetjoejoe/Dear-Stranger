import React from 'react';

export function EnvelopeMark({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 36 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <g transform="rotate(-11 14 16)">
        <rect x="3" y="7" width="22" height="15" rx="2" fill="currentColor" />
        <path
          d="M4.5 8.5L14 15.5L23.5 8.5"
          stroke="var(--ds-bg)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <path
        d="M3 28C9.5 22.8 18.5 21 26.5 22"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M26 5L27.5 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M29.5 8L32 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M30 12L33 12.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function BrandWordmark({ showTagline = false }: { showTagline?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0">
      <EnvelopeMark className="w-7 h-6 text-[#80545A] dark:text-[#B8838A] shrink-0" />
      <span className="flex flex-col leading-none">
        <span className="font-editorial text-xl sm:text-2xl font-semibold tracking-tight text-[#252525] dark:text-[#EAE6DF]">
          Dear Stranger
        </span>
        {showTagline && (
          <span className="text-[11px] italic text-[#77736D] dark:text-[#A19B92] mt-0.5">
            Some things are easier to tell a stranger.
          </span>
        )}
      </span>
    </span>
  );
}
