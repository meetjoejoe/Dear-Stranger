import React from 'react';
import { PhoneCall } from 'lucide-react';

export function SafetySupportBanner({ onDismiss }: { onDismiss?: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-[#80545A]/50 bg-[#FFFFFF] dark:bg-[#201E1B] p-5 text-sm text-[#252525] dark:text-[#EAE6DF]"
    >
      <div className="flex items-start gap-3">
        <PhoneCall className="w-4 h-4 text-[#80545A] dark:text-[#B8838A] mt-0.5 shrink-0" />
        <div className="space-y-2 flex-1">
          <p className="font-medium">
            If you are in immediate danger or feeling unable to stay safe right now
          </p>
          <p className="text-[#77736D] dark:text-[#A19B92] leading-relaxed">
            Dear Stranger is a community letter platform, not an emergency or crisis-response
            service. Please reach out right now to local emergency services, a healthcare
            professional, a crisis helpline in your country, or someone you trust.
          </p>
          <p className="text-xs text-[#77736D] dark:text-[#A19B92]">
            International directory:{' '}
            <a
              href="https://findahelpline.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-[#252525] dark:hover:text-[#EAE6DF]"
            >
              findahelpline.com
            </a>{' '}
            · Emergency services (e.g. 112, 911, 999 depending on location).
          </p>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs text-[#77736D] hover:text-[#252525] dark:text-[#A19B92] dark:hover:text-[#EAE6DF] underline shrink-0"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
