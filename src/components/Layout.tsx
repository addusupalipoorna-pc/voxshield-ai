import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Shield, Bell, CheckCircle2, ChevronLeft, ChevronRight, LogOut, User as UserIcon } from 'lucide-react';
import { getIncidents } from '../services/api';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  role?: string[];
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: '📊' },
  { path: '/voice-analyzer', label: 'Voice Analyzer', icon: '🎙️' },
  { path: '/identity-enrollment', label: 'Identity Verification', icon: '🪪' },
  { path: '/voice-enrollment', label: 'Voice Enrollment', icon: '🔊' },
  { path: '/command-center', label: 'Command Center', icon: '🛡️' },
  { path: '/attack-simulator', label: 'Attack Simulator', icon: '⚡' },
  { path: '/incidents', label: 'Incidents', icon: '🚨' },
  { path: '/analytics', label: 'Analytics', icon: '📈' },
  { path: '/forensics', label: 'Forensics', icon: '🔬' },
  { path: '/privacy', label: 'Privacy & Data', icon: '🔒' },
  { path: '/settings', label: 'Settings', icon: '⚙️' },
  { path: '/admin', label: 'Admin Panel', icon: '👑', role: ['ADMIN'] },
];

interface User {
  name: string;
  email: string;
  role: string;
}

interface LayoutProps {
  children: React.ReactNode;
  user: User | null;
  onLogout: () => void;
  onOpenAuth: () => void;
}

export default function Layout({ children, user, onLogout, onOpenAuth }: LayoutProps) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    getIncidents(5)
      .then((data) => setNotifications(data.incidents || []))
      .catch(() => {});
  }, [user, location.pathname]);

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!item.role) return true;
    if (!user) return false;
    return item.role.includes(user.role);
  });

  const isLanding = location.pathname === '/';

  // ── Public Landing Page Layout (White Theme) ──────────────────────────────
  if (isLanding) {
    return (
      <div className="min-h-screen bg-white text-slate-900 font-sans">
        {/* Clean White Enterprise Navbar */}
        <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-6 sm:px-8 py-3.5 flex items-center justify-between">
            {/* Left: Brand Logo */}
            <Link to="/" className="flex items-center gap-2.5 text-decoration-none group">
              <div className="w-8 h-8 rounded-lg bg-[#0B3B82] flex items-center justify-center text-white shadow-sm">
                <Shield className="w-4 h-4" />
              </div>
              <span className="text-lg font-extrabold text-[#0B3B82] tracking-tight">
                VoxShield <span className="text-[#155EAD]">AI</span>
              </span>
            </Link>

            {/* Center: Navigation Links */}
            <nav className="hidden md:flex items-center gap-8">
              <a href="#" className="text-sm font-semibold text-[#0B3B82] border-b-2 border-[#0B3B82] pb-0.5">
                Home
              </a>
              <a href="#features" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
                Features
              </a>
              <a href="#how-it-works" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
                How It Works
              </a>
              <a href="#security" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
                Security
              </a>
              <Link to="/dashboard" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
                Dashboard
              </Link>
              <a href="#about" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
                About
              </a>
            </nav>

            {/* Right: Status, Notifications & Sign In */}
            <div className="flex items-center gap-3.5">
              {/* System Active Status Pill */}
              <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-green-50 border border-green-200 rounded-full">
                <span className="w-2 h-2 rounded-full bg-[#15803D] inline-block" />
                <span className="text-xs font-bold text-[#15803D] tracking-wider uppercase">
                  SYSTEM ACTIVE
                </span>
              </div>

              {/* Notification Button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNotifOpen(!notifOpen)}
                  className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors relative"
                  title="Notifications"
                >
                  <Bell className="w-4 h-4" />
                  {notifications.length > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-600" />
                  )}
                </button>

                {notifOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-[0_10px_25px_rgba(15,23,42,0.1)] p-4 z-50">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-900">
                        Security Alerts
                      </span>
                      <Link
                        to="/incidents"
                        onClick={() => setNotifOpen(false)}
                        className="text-xs text-[#0B3B82] hover:underline font-semibold"
                      >
                        View all →
                      </Link>
                    </div>
                    <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <p className="text-xs text-slate-500 py-3 text-center">No alerts. Endpoint secure.</p>
                      ) : (
                        notifications.map((n: any, idx: number) => (
                          <div key={idx} className="p-2.5 bg-slate-50 rounded-lg text-xs border border-slate-100">
                            <div className="flex justify-between font-semibold text-slate-800 mb-0.5">
                              <span>{n.attack_type || 'Security Event'}</span>
                              <span className="text-[10px] text-slate-400">
                                {n.created_at ? new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Now'}
                              </span>
                            </div>
                            <p className="text-slate-600 text-[11px] leading-relaxed">
                              {n.description || 'Voice command verified.'}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Sign In CTA */}
              {user ? (
                <Link
                  to="/dashboard"
                  className="px-4 py-2 rounded-lg bg-[#0B3B82] hover:bg-[#082F6B] text-white text-xs font-semibold shadow-sm transition-all"
                >
                  Go to Dashboard →
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={onOpenAuth}
                  className="px-4 py-1.5 rounded-lg border border-[#0B3B82] text-[#0B3B82] bg-white hover:bg-[#0B3B82] hover:text-white text-xs font-semibold transition-all duration-150"
                >
                  Sign In
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Public Content */}
        <main>{children}</main>
      </div>
    );
  }

  // ── Authenticated Application Workspace (White Theme) ─────────────────────
  return (
    <div className="flex min-h-screen bg-[#F8FAFC] text-slate-900 font-sans">
      {/* Sidebar */}
      <aside
        className={`${
          collapsed ? 'w-16' : 'w-60'
        } bg-white border-r border-slate-200 flex flex-col transition-all duration-200 shrink-0 sticky top-0 h-screen z-20`}
      >
        {/* Sidebar Logo Header */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-slate-100">
          <Link to="/" className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-[#0B3B82] flex items-center justify-center text-white shrink-0 shadow-sm">
              <Shield className="w-4 h-4" />
            </div>
            {!collapsed && (
              <div className="leading-tight">
                <span className="text-sm font-extrabold text-[#0B3B82] block tracking-tight">VoxShield AI</span>
                <span className="text-[10px] font-semibold text-slate-400 tracking-wider uppercase block">Identity Security</span>
              </div>
            )}
          </Link>
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation Item Links */}
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {visibleItems.map((item) => {
            const active = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
            return (
              <Link
                key={item.path}
                to={item.path}
                title={collapsed ? item.label : undefined}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  active
                    ? 'bg-blue-50 text-[#0B3B82] font-semibold border-l-2 border-[#0B3B82]'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className="text-base shrink-0 w-5 text-center">{item.icon}</span>
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User Account / Sign Out Section */}
        <div className="p-3 border-t border-slate-100 bg-slate-50/50">
          {user ? (
            <div className="space-y-2">
              {!collapsed && (
                <div className="px-2 py-1">
                  <p className="text-xs font-bold text-slate-900 truncate">{user.name}</p>
                  <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
                  <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-blue-100 text-[#0B3B82]">
                    {user.role}
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={onLogout}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-red-600 bg-white border border-red-200 hover:bg-red-50 transition-colors shadow-sm"
                title="Log Out"
              >
                <LogOut className="w-3.5 h-3.5" />
                {!collapsed && <span>Log Out</span>}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-white bg-[#0B3B82] hover:bg-[#082F6B] transition-colors shadow-sm"
            >
              <UserIcon className="w-3.5 h-3.5" />
              {!collapsed && <span>Sign In</span>}
            </button>
          )}
        </div>
      </aside>

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Workspace Top Bar */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 sm:px-8 flex items-center justify-between sticky top-0 z-10">
          {/* Breadcrumb Path */}
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <span className="text-[#0B3B82] font-semibold">VoxShield AI</span>
            <span>/</span>
            <span className="text-slate-800">
              {visibleItems.find((i) => location.pathname.startsWith(i.path))?.label || 'Overview'}
            </span>
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-3.5">
            {/* System Active Pill */}
            <div className="flex items-center gap-2 px-3 py-1 bg-green-50 border border-green-200 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-[#15803D]" />
              <span className="text-[11px] font-bold text-[#15803D] uppercase tracking-wider">
                SYSTEM ACTIVE
              </span>
            </div>

            {/* Notification Bell */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen(!notifOpen)}
                className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors relative"
                title="Security Notifications"
              >
                <Bell className="w-4 h-4" />
                {notifications.length > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-600" />
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-[0_10px_25px_rgba(15,23,42,0.1)] p-4 z-50">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-900">
                      Security Notifications
                    </span>
                    <Link
                      to="/incidents"
                      onClick={() => setNotifOpen(false)}
                      className="text-xs text-[#0B3B82] hover:underline font-semibold"
                    >
                      View all →
                    </Link>
                  </div>
                  <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="text-xs text-slate-500 py-3 text-center">No alerts. Endpoint secure.</p>
                    ) : (
                      notifications.map((n: any, idx: number) => (
                        <div key={idx} className="p-2.5 bg-slate-50 rounded-lg text-xs border border-slate-100">
                          <div className="flex justify-between font-semibold text-slate-800 mb-0.5">
                            <span>{n.attack_type || 'Security Event'}</span>
                            <span className="text-[10px] text-slate-400">
                              {n.created_at ? new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Now'}
                            </span>
                          </div>
                          <p className="text-slate-600 text-[11px] leading-relaxed">
                            {n.description || 'Voice command verified.'}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-6 sm:p-8 flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
