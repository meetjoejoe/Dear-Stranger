import React from 'react';

export function PrivacyPage() {
  return (
    <div className="px-4 sm:px-6 py-8 sm:py-10 space-y-8">
      <div className="pb-6 border-b border-[#E8E5DF] dark:border-[#332F2A]">
        <p className="text-[11px] uppercase tracking-widest text-[#80545A] dark:text-[#B8838A] font-medium">
          Data Stewardship
        </p>
        <h1 className="font-editorial text-3xl sm:text-4xl font-semibold mt-1">Privacy Policy</h1>
        <p className="text-sm text-[#77736D] dark:text-[#A19B92] mt-2 leading-relaxed">
          Designed with data minimisation and the Nigeria Data Protection Act (NDPA) principles in
          mind. This policy is provided transparently and does not claim independent legal
          certification.
        </p>
      </div>

      <div className="space-y-6 text-[15px] leading-[1.78] max-w-prose">
        <section className="space-y-2">
          <h2 className="font-editorial text-2xl font-semibold">1. Information we collect</h2>
          <p className="text-[#77736D] dark:text-[#A19B92]">
            You can read public letters without creating an account. When you choose to write,
            reply, or react, we create an anonymous session with a generated display nickname. If
            you optionally link a recovery email address, it is stored privately for account
            recovery and opt-in notifications and is never displayed to other users.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-editorial text-2xl font-semibold">
            2. Security and abuse-prevention minimisation
          </h2>
          <p className="text-[#77736D] dark:text-[#A19B92]">
            To prevent spam and automated abuse, the server uses short-lived salted request hashes
            for rate limiting in memory (retained at most 15 minutes) and does not expose or publish
            IP addresses. Aggregate product counts (such as total letters submitted) contain no
            personal identifiers.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-editorial text-2xl font-semibold">
            3. Unlisted letters and saved bookmarks
          </h2>
          <p className="text-[#77736D] dark:text-[#A19B92]">
            Unlisted letters are excluded from public feeds, search, and Open Graph previews, and
            are accessible only via their direct link. Saved letters are strictly private to your
            account.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-editorial text-2xl font-semibold">
            4. Your rights and account deletion
          </h2>
          <p className="text-[#77736D] dark:text-[#A19B92]">
            You may edit or delete your letters and replies at any time, export or review your
            content from your Personal Dashboard, and permanently delete your anonymous account and
            associated posts under Account Settings.
          </p>
        </section>
      </div>
    </div>
  );
}
