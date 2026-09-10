import { Routes, Route, Navigate } from 'react-router-dom';
import { useState } from 'react';
import Layout from './components/Layout';
import AuthModal from './components/AuthModal';
import { AuthProvider, useAuth } from './context/AuthContext';

// Pages
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import VoiceAnalyzer from './pages/VoiceAnalyzer';
import VoiceEnrollment from './pages/VoiceEnrollment';
import CommandCenter from './pages/CommandCenter';
import AttackSimulator from './pages/AttackSimulator';
import Incidents from './pages/Incidents';
import Analytics from './pages/Analytics';
import Forensics from './pages/Forensics';
import Privacy from './pages/Privacy';
import Settings from './pages/Settings';
import AdminDashboard from './pages/AdminDashboard';
// Phase 3: Approval + OTP pages (no auth required — token-based access)
import ApprovalPage from './pages/ApprovalPage';
import OTPVerifyPage from './pages/OTPVerifyPage';
// Phase 4: Complete Identity Enrollment & Authentication
import IdentityEnrollment from './pages/IdentityEnrollment';
import AuthPage from './pages/AuthPage';

function AppRoutes() {
  const { user, isAdmin, logout } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <>
      <Layout user={user} onLogout={logout} onOpenAuth={() => setAuthOpen(true)}>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/attack-simulator" element={<AttackSimulator />} />
          <Route path="/voice-analyzer" element={<VoiceAnalyzer />} />
          <Route path="/voice-comparison" element={<VoiceAnalyzer />} />
          <Route path="/login" element={<AuthPage defaultMode="LOGIN" />} />
          <Route path="/register" element={<AuthPage defaultMode="REGISTER" />} />
          <Route path="/identity-enrollment" element={<IdentityEnrollment />} />

          {/* Phase 3: Token-based approval pages — accessible without session login */}
          <Route path="/approve/:token" element={<ApprovalPage />} />
          <Route path="/verify-command/:commandId" element={<OTPVerifyPage />} />

          {/* Protected / Authenticated Routes */}
          <Route path="/dashboard" element={user ? <Dashboard /> : <Navigate to="/login" />} />
          <Route path="/voice-enrollment" element={user ? <VoiceEnrollment /> : <Navigate to="/login" />} />
          <Route path="/command-center" element={user ? <CommandCenter /> : <Navigate to="/login" />} />
          <Route path="/commands/:id" element={user ? <CommandCenter /> : <Navigate to="/login" />} />
          <Route path="/devices" element={user ? <CommandCenter /> : <Navigate to="/login" />} />
          <Route path="/incidents" element={user ? <Incidents /> : <Navigate to="/login" />} />
          <Route path="/incidents/:id" element={user ? <Incidents /> : <Navigate to="/login" />} />
          <Route path="/analytics" element={user ? <Analytics /> : <Navigate to="/login" />} />
          <Route path="/forensics" element={user ? <Forensics /> : <Navigate to="/login" />} />
          <Route path="/privacy" element={user ? <Privacy /> : <Navigate to="/login" />} />
          <Route path="/settings" element={user ? <Settings /> : <Navigate to="/login" />} />

          {/* Admin only */}
          <Route path="/admin" element={isAdmin ? <AdminDashboard /> : <Navigate to="/dashboard" />} />

          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Layout>

      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
      />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
