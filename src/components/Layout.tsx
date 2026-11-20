import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Menu, Moon, Sun, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';
import type { PublicLetterDTO } from '../shared/types.ts';
import { useToast } from '../context/ToastContext.tsx';
import { BrandWordmark } from './Logo.tsx';
import { AuthPromptModal } from './AuthPromptModal.tsx';

export function Layout({ children }: { children: React.ReactNode }) {
  const { config, profile, theme, toggleTheme, unreadCount, token } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [recentSurpriseIds, setRecentSurpriseIds] = useState<string[]>([]);
  const [surprising, setSurprising] = useState(false);

  const handleSurpriseMe = async () => {
    if (surprising) return;
    setSurprising(true);
    try {
      const exclude = recentSurpriseIds.join(',');
      const res = await apiFetch<{ letter: PublicLetterDTO | null }>(
        `/api/letters/surprise?exclude=${encodeURIComponent(exclude)}`,
        { token }
      );
      if (!res.letter) {
        showToast('No public letters are available yet for Surprise Me.', 'info');
        return;
      }
      setRecentSurpriseIds((prev) => [...prev.slice(-15), res.letter!.id]);
      setMobileMenuOpen(false);
      navigate(`/letters/${res.letter.id}`);
    } catch {
      showToast('Could not select a random letter right now.', 'error');
    } finally {
      setSurprising(false);
    }
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `whitespace-nowrap shrink-0 text-sm transition-colors ${
      isActive
        ? 'text-[#80545A] dark:text-[#B8838A] font-medium underline underline-offset-4'
        : 'text-[#77736D] dark:text-[#A19B92] hover:text-[#252525] dark:hover:text-[#EAE6DF]'
    }`;

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F7F3] dark:bg-[#181715] text-[#252525] dark:text-[#EAE6DF]">
      {/* Platform Announcement Ribbon (admin controlled) */}
      {config?.platformAnnouncement?.active && config.platformAnnouncement.message && (
        <div className="border-b border-[#E8E5DF] dark:border-[#332F2A] bg-[#F1EFE9] dark:bg-[#282521] px-4 py-2 text-center text-xs sm:text-sm text-[#252525] dark:text-[#EAE6DF]">
          {config.platformAnnouncement.message}
        </div>
      )}

      {/* Unconfigured Supabase / Static Preview Honest Notice */}
      {config && !config.supabaseConfigured && (
        <div className="border-b border-[#E8E5DF] dark:border-[#332F2A] bg-[#F1EFE9] dark:bg-[#282521] px-4 py-2 text-xs text-[#77736D] dark:text-[#A19B92]">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2">
            <span>
              {config.staticFallback ? (
                <>
                  <strong>Static Preview Mode:</strong> Backend API was not detected on this host; data is stored ephemerally in this browser tab.
                </>
              ) : (
                <>
                  <strong>Sandbox Preview Mode:</strong> Supabase credentials are not configured; data is stored ephemerally in server memory.
                </>
              )}
            </span>
            <Link
              to="/setup"
              className="font-medium text-[#80545A] dark:text-[#B8838A] underline whitespace-nowrap shrink-0"
            >
              View Supabase Setup Guide
            </Link>
          </div>
        </div>
      )}

      {config?.supabaseConfigured && config.supabaseSchemaReady === false && (
        <div className="border-b border-[#E8E5DF] dark:border-[#332F2A] bg-[#F1EFE9] dark:bg-[#282521] px-4 py-2 text-xs text-[#77736D] dark:text-[#A19B92]">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong>Database Migrations Pending:</strong> Supabase is connected, but schema tables have not been initialized yet.
            </span>
            <Link
              to="/setup"
              className="font-medium text-[#80545A] dark:text-[#B8838A] underline whitespace-nowrap shrink-0"
            >
              View Setup &amp; Status
            </Link>
          </div>
        </div>
      )}

      {/* 3-Zone Editorial Top Bar */}
      <header className="border-b border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3]/95 dark:bg-[#181715]/95 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark */}
          <Link to="/" className="focus:outline-none">
            <BrandWordmark />
          </Link>

          {/* Zone 2: Concise Single-Line Navigation Links */}
          <nav className="hidden md:flex items-center gap-6" aria-label="Main navigation">
            <NavLink to="/explore" className={navLinkClass}>
              Explore
            </NavLink>
            <NavLink to="/open-letterbox" className={navLinkClass}>
              Open Letterbox
            </NavLink>
            <button
              type="button"
              onClick={handleSurpriseMe}
              disabled={surprising}
              className="whitespace-nowrap shrink-0 text-sm text-[#77736D] dark:text-[#A19B92] hover:text-[#252525] dark:hover:text-[#EAE6DF] transition-colors disabled:opacity-50"
            >
              {surprising ? 'Finding…' : 'Surprise Me'}
            </button>
            <NavLink to="/dashboard" className={navLinkClass}>
              {profile ? `Dashboard${unreadCount > 0 ? ` (${unreadCount})` : ''}` : 'Dashboard'}
            </NavLink>
            <NavLink to="/guidelines" className={navLinkClass}>
              Guidelines
            </NavLink>
          </nav>

          {/* Zone 3: Single Primary Action (+ mobile menu trigger) */}
          <div className="flex items-center gap-3 shrink-0">
            <Link
              to="/write"
              className="hidden sm:inline-flex items-center justify-center rounded-md bg-[#80545A] hover:bg-[#6C454A] text-white px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0"
            >
              Write a Letter
            </Link>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              className="md:hidden p-2 rounded-md border border-[#E8E5DF] dark:border-[#332F2A] text-[#252525] dark:text-[#EAE6DF]"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu Drawer */}
        {mobileMenuOpen && (
          <nav
            aria-label="Mobile navigation"
            className="md:hidden border-t border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] px-4 py-4 space-y-3"
          >
            <Link
              to="/write"
              onClick={() => setMobileMenuOpen(false)}
              className="block w-full text-center rounded-md bg-[#80545A] hover:bg-[#6C454A] text-white px-4 py-2.5 text-sm font-medium"
            >
              Write a Letter
            </Link>
            <div className="flex flex-col gap-2.5 pt-1 text-sm">
              <Link to="/explore" onClick={() => setMobileMenuOpen(false)} className="py-1.5">
                Explore Letters
              </Link>
              <Link to="/open-letterbox" onClick={() => setMobileMenuOpen(false)} className="py-1.5">
                Open Letterbox
              </Link>
              <button
                type="button"
                onClick={handleSurpriseMe}
                className="text-left py-1.5"
              >
                Surprise Me
              </button>
              <Link to="/dashboard" onClick={() => setMobileMenuOpen(false)} className="py-1.5">
                Personal Dashboard {unreadCount > 0 ? `(${unreadCount})` : ''}
              </Link>
              <Link to="/guidelines" onClick={() => setMobileMenuOpen(false)} className="py-1.5">
                Community Guidelines
              </Link>
            </div>
          </nav>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1">{children}</main>

      {/* Editorial Footer */}
      <footer className="border-t border-[#E8E5DF] dark:border-[#332F2A] bg-[#F1EFE9]/60 dark:bg-[#201E1B]/50 mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <p className="font-editorial text-lg font-semibold">Dear Stranger</p>
            <p className="text-xs text-[#77736D] dark:text-[#A19B92]">
              Some things are easier to tell a stranger. Intended for adults 18+.
            </p>
            {profile && (
              <p className="text-xs text-[#77736D] dark:text-[#A19B92]">
                Signed in anonymously as <strong className="font-medium text-[#252525] dark:text-[#EAE6DF]">{profile.displayName}</strong>
              </p>
            )}
            <p className="text-xs text-[#77736D] dark:text-[#A19B92]">
              &copy; {new Date().getFullYear()} Awesome Studios. All rights reserved.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs sm:text-sm text-[#77736D] dark:text-[#A19B92]">
            <Link to="/guidelines" className="hover:text-[#252525] dark:hover:text-[#EAE6DF]">
              Community Guidelines
            </Link>
            <Link to="/privacy" className="hover:text-[#252525] dark:hover:text-[#EAE6DF]">
              Privacy Policy
            </Link>
            {profile?.isAdmin && (
              <Link to="/moderation" className="hover:text-[#252525] dark:hover:text-[#EAE6DF]">
                Moderation
              </Link>
            )}
            <Link to="/setup" className="hover:text-[#252525] dark:hover:text-[#EAE6DF]">
              Setup &amp; Status
            </Link>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              className="inline-flex items-center gap-1.5 text-[#252525] dark:text-[#EAE6DF] hover:text-[#80545A] dark:hover:text-[#B8838A] transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              <span>{theme === 'dark' ? 'Light theme' : 'Dark theme'}</span>
            </button>
          </div>
        </div>
      </footer>

      <AuthPromptModal />
    </div>
  );
}
