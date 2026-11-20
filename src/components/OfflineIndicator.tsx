import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus.ts';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 z-50 inline-flex items-center gap-2 rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] px-3.5 py-2 text-xs font-medium text-[#80545A] dark:text-[#B8838A] shadow-sm"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>Offline mode — cached shell active</span>
    </div>
  );
}
