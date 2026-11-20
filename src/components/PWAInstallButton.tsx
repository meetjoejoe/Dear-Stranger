import React, { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';

interface PWAInstallButtonProps {
  className?: string;
  onAction?: () => void;
}

export function PWAInstallButton({ className = '', onAction }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => {
          void install();
          onAction?.();
        }}
        className={`inline-flex items-center justify-center gap-1.5 rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] hover:border-[#80545A] px-3 py-2 text-xs sm:text-sm font-medium text-[#252525] dark:text-[#EAE6DF] transition-colors whitespace-nowrap shrink-0 ${className}`}
      >
        <Download className="w-4 h-4 text-[#80545A] dark:text-[#B8838A]" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => {
            setShowIOSGuide(true);
            onAction?.();
          }}
          className={`inline-flex items-center justify-center gap-1.5 rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] hover:border-[#80545A] px-3 py-2 text-xs sm:text-sm font-medium text-[#252525] dark:text-[#EAE6DF] transition-colors whitespace-nowrap shrink-0 ${className}`}
        >
          <Download className="w-4 h-4 text-[#80545A] dark:text-[#B8838A]" />
          <span>Install App</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
          >
            <div className="w-full max-w-sm rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-6 shadow-sm space-y-4">
              <div className="flex items-start justify-between gap-3">
                <h2 id="ios-install-title" className="font-editorial text-2xl font-semibold">
                  Install Dear Stranger
                </h2>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close install instructions"
                  className="p-1 text-[#77736D] hover:text-[#252525] dark:text-[#A19B92] dark:hover:text-[#EAE6DF]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="space-y-2 text-sm text-[#77736D] dark:text-[#A19B92] leading-relaxed list-decimal pl-5">
                <li>
                  Tap the <strong className="text-[#252525] dark:text-[#EAE6DF] inline-flex items-center gap-1">Share <Share className="w-3.5 h-3.5 inline" /></strong> button in Safari&apos;s toolbar.
                </li>
                <li>
                  Scroll down and tap <strong className="text-[#252525] dark:text-[#EAE6DF]">Add to Home Screen</strong>.
                </li>
                <li>
                  Tap <strong className="text-[#252525] dark:text-[#EAE6DF]">Add</strong> to save Dear Stranger as an app.
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full rounded-md bg-[#80545A] hover:bg-[#6C454A] text-white py-2 text-sm font-medium transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}
