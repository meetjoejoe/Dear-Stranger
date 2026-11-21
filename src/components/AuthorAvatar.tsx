import React from 'react';

const AVATAR_TONES = [
  'bg-[#80545A]/12 text-[#80545A] dark:bg-[#B8838A]/18 dark:text-[#D5A3AA]',
  'bg-[#5B685E]/12 text-[#47534A] dark:bg-[#8EA193]/18 dark:text-[#B5C6B9]',
  'bg-[#6D5F4E]/12 text-[#574B3C] dark:bg-[#B4A38D]/18 dark:text-[#CEC0AE]',
  'bg-[#4E5E6D]/12 text-[#3D4B59] dark:bg-[#8CA2B6]/18 dark:text-[#B8CAE0]',
];

function getInitials(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9 _-]/g, '').trim();
  if (!cleaned) return 'S';
  const parts = cleaned.split(/[\s_-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

function getToneClass(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
}

export function AuthorAvatar({
  name,
  size = 'md',
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClass =
    size === 'sm'
      ? 'w-7 h-7 text-[11px]'
      : size === 'lg'
      ? 'w-12 h-12 text-base'
      : 'w-9 h-9 text-xs';

  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center rounded-full font-semibold tracking-tight shrink-0 select-none border border-[#E8E5DF] dark:border-[#332F2A] ${sizeClass} ${getToneClass(
        name
      )}`}
    >
      {getInitials(name)}
    </span>
  );
}
