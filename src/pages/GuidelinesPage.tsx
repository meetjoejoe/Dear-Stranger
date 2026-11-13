import React from 'react';
import { SafetySupportBanner } from '../components/SafetySupportBanner.tsx';

export function GuidelinesPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16 space-y-8">
      <div className="pb-6 border-b border-[#E8E5DF] dark:border-[#332F2A]">
        <p className="text-xs uppercase tracking-widest text-[#80545A] dark:text-[#B8838A] font-medium">
          Community Standards
        </p>
        <h1 className="font-editorial text-4xl font-semibold mt-1">Community Guidelines</h1>
        <p className="text-sm text-[#77736D] dark:text-[#A19B92] mt-2">
          Dear Stranger exists for honest, respectful human conversation among adults aged 18+.
        </p>
      </div>

      <SafetySupportBanner />

      <div className="space-y-6 text-[15px] leading-[1.75] text-[#252525] dark:text-[#EAE6DF]">
        <section className="space-y-2">
          <h2 className="font-editorial text-2xl font-semibold">1. Speak honestly, listen gently</h2>
          <p className="text-[#77736D] dark:text-[#A19B92]">
            People come here to put difficult, ordinary, or unspoken experiences into words.
            Sadness, grief, doubt, and vulnerability belong here. Respond with care, even when
            offering a different perspective.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-editorial text-2xl font-semibold">2. Protect anonymity and privacy</h2>
          <p className="text-[#77736D] dark:text-[#A19B92]">
            Never post your own or another person&apos;s real full name, phone number, email address,
            home address, workplace, or identifying private details. Attempting to uncover or expose
            another user&apos;s real identity is grounds for removal.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-editorial text-2xl font-semibold">3. Zero tolerance for abuse and exploitation</h2>
          <p className="text-[#77736D] dark:text-[#A19B92]">
            Harassment, bullying, threats of violence, hate speech, sexual exploitation, scams, and
            spam are not allowed. Content that encourages self-harm or harms others will be
            removed and reviewed by moderators.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-editorial text-2xl font-semibold">4. Adults 18+ only</h2>
          <p className="text-[#77736D] dark:text-[#A19B92]">
            Participants confirm they are 18 years of age or older before posting or replying.
            Self-confirmation is an eligibility commitment and is not a formal government identity
            or age verification process.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-editorial text-2xl font-semibold">5. Reporting, blocking, and appeals</h2>
          <p className="text-[#77736D] dark:text-[#A19B92]">
            You can report any letter, reply, or account, and block any anonymous author so their
            posts no longer appear for you. If your content or account is moderated, you may submit
            an appeal from your Personal Dashboard for human review.
          </p>
        </section>
      </div>
    </div>
  );
}
