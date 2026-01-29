import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import App from './App'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import InvitePage from './pages/InvitePage'
import AdminPage from './pages/AdminPage'
import OnboardingPage from './pages/OnboardingPage'
import SettingsPage from './pages/SettingsPage'
import ChangePasswordPage from './pages/ChangePasswordPage'
import LandingPage from './pages/LandingPage'
import './i18n/i18n'
import './index.css'

function ProtectedRoute({ children, adminOnly, allowPasswordChange }: { children: React.ReactNode; adminOnly?: boolean; allowPasswordChange?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="auth-page"><p>Loading...</p></div>;
  if (!user) return <Navigate to="/welcome" />;
  if (user.must_change_password && !allowPasswordChange) return <Navigate to="/change-password" />;
  if (adminOnly && user.role !== 'superadmin') return <Navigate to="/" />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="auth-page"><p>Loading...</p></div>;
  if (user) return <Navigate to="/" />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/welcome" element={<PublicRoute><LandingPage /></PublicRoute>} />
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
      <Route path="/invite/:code" element={<InvitePage />} />
      <Route path="/change-password" element={<ProtectedRoute allowPasswordChange><ChangePasswordPage /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute adminOnly><AdminPage /></ProtectedRoute>} />
      <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      <Route path="/" element={<ProtectedRoute><App /></ProtectedRoute>} />
    </Routes>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
