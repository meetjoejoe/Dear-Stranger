import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  Bookmark,
  Compass,
  FileText,
  Home,
  Inbox,
  Menu,
  Moon,
  PenLine,
  Settings,
  ShieldCheck,
  Shuffle,
  Sun,
  UserCheck,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';
import type { PublicLetterDTO } from '../shared/types.ts';
import { useToast } from '../context/ToastContext.tsx';
import { BrandWordmark } from './Logo.tsx';
import { AuthPromptModal } from './AuthPromptModal.tsx';
import { PWAInstallButton } from './PWAInstallButton.tsx';
import { OfflineIndicator } from './OfflineIndicator.tsx';
import { RightSidebar } from './RightSidebar.tsx';

export function Layout({ children }: { children: React.ReactNode }) {
  const { config, profile, theme, toggleTheme, unreadCount, token, openAuthPrompt } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [recentSurpriseIds, setRecentSurpriseIds] = useState<string[]>([]);
  const [surprising, setSurprising] = useState(false);

  const searchParams = new URLSearchParams(location.search);
  const activeDashboardTab = searchParams.get('tab') || 'letters';
  const isWriteRoute = location.pathname === '/write';

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

  const isNavItemActive = (path: string, tabMatch?: string): boolean => {
    if (path === '/dashboard' && tabMatch) {
      return location.pathname === '/dashboard' && activeDashboardTab === tabMatch;
    }
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const sidebarItemClass = (active: boolean) =>
    `flex items-center justify-between gap-3 px-3 py-2.5 rounded-md text-sm transition-colors whitespace-nowrap ${
      active
        ? 'bg-[#FFFFFF] dark:bg-[#201E1B] text-[#80545A] dark:text-[#B8838A] font-medium border border-[#E8E5DF] dark:border-[#332F2A]'
        : 'text-[#252525]/85 dark:text-[#EAE6DF]/85 hover:bg-[#F1EFE9] dark:hover:bg-[#201E1B] hover:text-[#252525] dark:hover:text-[#EAE6DF]'
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
          <div className="max-w-[1260px] mx-auto flex flex-wrap items-center justify-between gap-2">
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
          <div className="max-w-[1260px] mx-auto flex flex-wrap items-center justify-between gap-2">
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

      {/* Mobile Compact Top Header (< lg) */}
      <header className="lg:hidden sticky top-0 z-40 h-[52px] border-b border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3]/95 dark:bg-[#181715]/95 backdrop-blur-sm">
        <div className="h-full px-4 flex items-center justify-between gap-3">
          <Link to="/" className="focus:outline-none">
            <BrandWordmark />
          </Link>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-md text-[#77736D] dark:text-[#A19B92] hover:text-[#252525] dark:hover:text-[#EAE6DF]"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-md text-[#252525] dark:text-[#EAE6DF]"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Overflow Drawer */}
        {mobileMenuOpen && (
          <nav
            aria-label="Mobile secondary navigation"
            className="border-b border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] px-4 py-4 space-y-2 shadow-sm"
          >
            {profile ? (
              <p className="text-xs text-[#77736D] dark:text-[#A19B92] pb-2 border-b border-[#E8E5DF] dark:border-[#332F2A]">
                Signed in anonymously as{' '}
                <strong className="font-medium text-[#252525] dark:text-[#EAE6DF]">
                  {profile.displayName}
                </strong>
              </p>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  openAuthPrompt('Start or continue your anonymous identity.');
                }}
                className="w-full text-left py-2 text-sm font-medium text-[#80545A] dark:text-[#B8838A]"
              >
                Continue Anonymously &rarr;
              </button>
            )}

            <div className="grid grid-cols-2 gap-2 text-sm pt-1">
              <Link
                to="/open-letterbox"
                onClick={() => setMobileMenuOpen(false)}
                className="py-2 px-2 rounded hover:bg-[#F1EFE9] dark:hover:bg-[#282521]"
              >
                Open Letterbox
              </Link>
              <Link
                to="/dashboard?tab=saved"
                onClick={() => setMobileMenuOpen(false)}
                className="py-2 px-2 rounded hover:bg-[#F1EFE9] dark:hover:bg-[#282521]"
              >
                Saved Letters
              </Link>
              <Link
                to="/dashboard?tab=account"
                onClick={() => setMobileMenuOpen(false)}
                className="py-2 px-2 rounded hover:bg-[#F1EFE9] dark:hover:bg-[#282521]"
              >
                Settings
              </Link>
              <button
                type="button"
                onClick={handleSurpriseMe}
                className="text-left py-2 px-2 rounded hover:bg-[#F1EFE9] dark:hover:bg-[#282521]"
              >
                Surprise Me
              </button>
              <Link
                to="/guidelines"
                onClick={() => setMobileMenuOpen(false)}
                className="py-2 px-2 rounded hover:bg-[#F1EFE9] dark:hover:bg-[#282521]"
              >
                Guidelines
              </Link>
              <Link
                to="/privacy"
                onClick={() => setMobileMenuOpen(false)}
                className="py-2 px-2 rounded hover:bg-[#F1EFE9] dark:hover:bg-[#282521]"
              >
                Privacy Policy
              </Link>
              <Link
                to="/setup"
                onClick={() => setMobileMenuOpen(false)}
                className="py-2 px-2 rounded hover:bg-[#F1EFE9] dark:hover:bg-[#282521]"
              >
                Setup &amp; Status
              </Link>
              {profile?.isAdmin && (
                <Link
                  to="/moderation"
                  onClick={() => setMobileMenuOpen(false)}
                  className="py-2 px-2 rounded text-[#80545A] dark:text-[#B8838A] font-medium hover:bg-[#F1EFE9] dark:hover:bg-[#282521]"
                >
                  Moderation Console
                </Link>
              )}
            </div>

            <PWAInstallButton
              className="w-full justify-center mt-2"
              onAction={() => setMobileMenuOpen(false)}
            />
          </nav>
        )}
      </header>

      {/* Three-Column Desktop Social Editorial Shell */}
      <div className="flex-1 w-full max-w-[1260px] mx-auto flex justify-center">
        {/* LEFT SIDEBAR (Desktop >= lg) */}
        <aside
          aria-label="Primary navigation"
          className="hidden lg:flex flex-col w-60 xl:w-64 shrink-0 sticky top-0 h-screen justify-between px-4 py-6 overflow-y-auto"
        >
          <div className="space-y-6">
            <Link to="/" className="block px-2 focus:outline-none">
              <BrandWordmark />
            </Link>

            <nav className="space-y-1" aria-label="Main navigation">
              <Link to="/" className={sidebarItemClass(isNavItemActive('/'))}>
                <span className="inline-flex items-center gap-3">
                  <Home className="w-4 h-4 shrink-0" />
                  <span>Home</span>
                </span>
              </Link>
              <Link to="/explore" className={sidebarItemClass(isNavItemActive('/explore'))}>
                <span className="inline-flex items-center gap-3">
                  <Compass className="w-4 h-4 shrink-0" />
                  <span>Explore</span>
                </span>
              </Link>
              <Link
                to="/open-letterbox"
                className={sidebarItemClass(isNavItemActive('/open-letterbox'))}
              >
                <span className="inline-flex items-center gap-3">
                  <Inbox className="w-4 h-4 shrink-0" />
                  <span>Open Letterbox</span>
                </span>
              </Link>
              <Link
                to="/dashboard?tab=notifications"
                className={sidebarItemClass(isNavItemActive('/dashboard', 'notifications'))}
              >
                <span className="inline-flex items-center gap-3">
                  <Bell className="w-4 h-4 shrink-0" />
                  <span>Notifications</span>
                </span>
                {unreadCount > 0 && (
                  <span className="text-xs font-semibold tabular-nums text-[#80545A] dark:text-[#B8838A]">
                    {unreadCount}
                  </span>
                )}
              </Link>
              <Link
                to="/dashboard?tab=saved"
                className={sidebarItemClass(isNavItemActive('/dashboard', 'saved'))}
              >
                <span className="inline-flex items-center gap-3">
                  <Bookmark className="w-4 h-4 shrink-0" />
                  <span>Saved Letters</span>
                </span>
              </Link>
              <Link
                to="/dashboard?tab=letters"
                className={sidebarItemClass(isNavItemActive('/dashboard', 'letters'))}
              >
                <span className="inline-flex items-center gap-3">
                  <FileText className="w-4 h-4 shrink-0" />
                  <span>My Letters</span>
                </span>
              </Link>
              <Link
                to="/dashboard?tab=account"
                className={sidebarItemClass(isNavItemActive('/dashboard', 'account'))}
              >
                <span className="inline-flex items-center gap-3">
                  <Settings className="w-4 h-4 shrink-0" />
                  <span>Settings</span>
                </span>
              </Link>
              {profile?.isAdmin && (
                <Link
                  to="/moderation"
                  className={sidebarItemClass(isNavItemActive('/moderation'))}
                >
                  <span className="inline-flex items-center gap-3">
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    <span>Moderation</span>
                  </span>
                </Link>
              )}
            </nav>

            <Link
              to="/write"
              className={`w-full inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                isWriteRoute
                  ? 'bg-[#6C454A] text-white'
                  : 'bg-[#80545A] hover:bg-[#6C454A] text-white'
              }`}
            >
              <PenLine className="w-4 h-4 shrink-0" />
              <span>Write a Letter</span>
            </Link>

            <button
              type="button"
              onClick={handleSurpriseMe}
              disabled={surprising}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] hover:border-[#80545A]/60 px-3 py-2 text-xs font-medium text-[#77736D] dark:text-[#A19B92] hover:text-[#252525] dark:hover:text-[#EAE6DF] transition-colors disabled:opacity-50"
            >
              <Shuffle className="w-3.5 h-3.5 text-[#80545A] dark:text-[#B8838A]" />
              <span>{surprising ? 'Finding a letter…' : 'Surprise Me'}</span>
            </button>
          </div>

          <div className="pt-4 border-t border-[#E8E5DF] dark:border-[#332F2A] space-y-3">
            <PWAInstallButton className="w-full justify-center" />

            {profile ? (
              <Link
                to="/dashboard?tab=letters"
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-[#F1EFE9] dark:hover:bg-[#201E1B] transition-colors"
              >
                <UserCheck className="w-4 h-4 text-[#80545A] dark:text-[#B8838A] shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate text-[#252525] dark:text-[#EAE6DF]">
                    {profile.displayName}
                  </p>
                  <p className="text-[11px] text-[#77736D] dark:text-[#A19B92]">
                    Anonymous identity
                  </p>
                </div>
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => openAuthPrompt('Create or continue your anonymous identity.')}
                className="w-full text-left px-3 py-2 rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] hover:border-[#80545A] text-xs font-medium transition-colors"
              >
                Continue Anonymously &rarr;
              </button>
            )}

            <div className="flex items-center justify-between px-2 text-xs text-[#77736D] dark:text-[#A19B92]">
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
                className="inline-flex items-center gap-1.5 hover:text-[#252525] dark:hover:text-[#EAE6DF] transition-colors"
              >
                {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                <span>{theme === 'dark' ? 'Light theme' : 'Dark theme'}</span>
              </button>
              <Link
                to="/setup"
                className="hover:text-[#252525] dark:hover:text-[#EAE6DF] underline"
              >
                Setup
              </Link>
            </div>
          </div>
        </aside>

        {/* CENTRE COLUMN */}
        <div className="flex-1 min-w-0 max-w-[680px] lg:border-x border-[#E8E5DF] dark:border-[#332F2A] min-h-screen flex flex-col">
          <main className="flex-1">{children}</main>

          {/* Quiet Editorial Footer inside Centre Column */}
          <footer className="border-t border-[#E8E5DF] dark:border-[#332F2A] bg-[#F1EFE9]/40 dark:bg-[#201E1B]/40 px-4 sm:px-6 pt-7 pb-24 lg:pb-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="font-editorial text-base font-semibold text-[#252525] dark:text-[#EAE6DF]">
                  Dear Stranger
                </p>
                <p className="text-xs text-[#77736D] dark:text-[#A19B92]">
                  Some things are easier to tell a stranger. Intended for adults 18+.
                </p>
                <p className="text-xs text-[#77736D] dark:text-[#A19B92]">
                  &copy; {new Date().getFullYear()} Awesome Studios. All rights reserved.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[#77736D] dark:text-[#A19B92]">
                <Link to="/guidelines" className="hover:text-[#252525] dark:hover:text-[#EAE6DF]">
                  Guidelines
                </Link>
                <Link to="/privacy" className="hover:text-[#252525] dark:hover:text-[#EAE6DF]">
                  Privacy
                </Link>
                {profile?.isAdmin && (
                  <Link
                    to="/moderation"
                    className="hover:text-[#252525] dark:hover:text-[#EAE6DF]"
                  >
                    Moderation
                  </Link>
                )}
                <Link to="/setup" className="hover:text-[#252525] dark:hover:text-[#EAE6DF]">
                  Setup &amp; Status
                </Link>
              </div>
            </div>
          </footer>
        </div>

        {/* RIGHT SIDEBAR (Desktop >= xl) */}
        <RightSidebar />
      </div>

      {/* Mobile Floating Write Action (hidden on /write) */}
      {!isWriteRoute && (
        <Link
          to="/write"
          aria-label="Write a Letter"
          className="lg:hidden fixed bottom-[70px] right-4 z-30 inline-flex items-center gap-2 rounded-md bg-[#80545A] hover:bg-[#6C454A] text-white px-4 py-2.5 min-h-[44px] text-sm font-medium shadow-sm transition-colors"
        >
          <PenLine className="w-4 h-4 shrink-0" />
          <span>Write</span>
        </Link>
      )}

      {/* Mobile Fixed Bottom Navigation (< lg) */}
      <nav
        aria-label="Mobile bottom navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 h-[56px] border-t border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3]/95 dark:bg-[#181715]/95 backdrop-blur-sm grid grid-cols-5 items-center pb-safe"
      >
        <Link
          to="/"
          className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
            isNavItemActive('/')
              ? 'text-[#80545A] dark:text-[#B8838A]'
              : 'text-[#77736D] dark:text-[#A19B92]'
          }`}
        >
          <Home className="w-4 h-4" />
          <span>Home</span>
        </Link>
        <Link
          to="/explore"
          className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
            isNavItemActive('/explore')
              ? 'text-[#80545A] dark:text-[#B8838A]'
              : 'text-[#77736D] dark:text-[#A19B92]'
          }`}
        >
          <Compass className="w-4 h-4" />
          <span>Explore</span>
        </Link>
        <Link
          to="/open-letterbox"
          className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
            isNavItemActive('/open-letterbox')
              ? 'text-[#80545A] dark:text-[#B8838A]'
              : 'text-[#77736D] dark:text-[#A19B92]'
          }`}
        >
          <Inbox className="w-4 h-4" />
          <span>Open</span>
        </Link>
        <Link
          to="/dashboard?tab=notifications"
          className={`relative min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
            isNavItemActive('/dashboard', 'notifications')
              ? 'text-[#80545A] dark:text-[#B8838A]'
              : 'text-[#77736D] dark:text-[#A19B92]'
          }`}
        >
          <span className="relative inline-flex">
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className=" -top-1 -right-1.5 absolute min-w-[14px] h-[14px] px-0.5 rounded-full bg-[#80545A] text-white text-[9px] flex items-center justify-center tabular-nums">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </span>
          <span>Alerts</span>
        </Link>
        <Link
          to="/dashboard?tab=letters"
          className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
            location.pathname === '/dashboard' && activeDashboardTab !== 'notifications'
              ? 'text-[#80545A] dark:text-[#B8838A]'
              : 'text-[#77736D] dark:text-[#A19B92]'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Profile</span>
        </Link>
      </nav>

      <AuthPromptModal />
      <OfflineIndicator />
    </div>
  );
}
