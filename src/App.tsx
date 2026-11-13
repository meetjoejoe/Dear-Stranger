import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.tsx';
import { ToastProvider } from './context/ToastContext.tsx';
import { Layout } from './components/Layout.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { ExplorePage } from './pages/ExplorePage.tsx';
import { OpenLetterboxPage } from './pages/OpenLetterboxPage.tsx';
import { LetterDetailPage } from './pages/LetterDetailPage.tsx';
import { WriteLetterPage } from './pages/WriteLetterPage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { ModerationPage } from './pages/ModerationPage.tsx';
import { GuidelinesPage } from './pages/GuidelinesPage.tsx';
import { PrivacyPage } from './pages/PrivacyPage.tsx';
import { SetupPage } from './pages/SetupPage.tsx';

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Layout>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/explore" element={<ExplorePage />} />
              <Route path="/open-letterbox" element={<OpenLetterboxPage />} />
              <Route path="/letters/:id" element={<LetterDetailPage />} />
              <Route path="/write" element={<WriteLetterPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/moderation" element={<ModerationPage />} />
              <Route path="/guidelines" element={<GuidelinesPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/setup" element={<SetupPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
