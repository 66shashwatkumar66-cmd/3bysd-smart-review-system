import React, { useState, useEffect } from 'react';
import {
  QrCode,
  Plus,
  Printer,
  Smartphone,
  Layers,
  LogIn,
  LogOut,
  User as UserIcon,
  Radio,
  ShieldCheck,
  Lock,
  ChevronDown,
  Users,
  CheckCircle,
} from 'lucide-react';
import { auth, signOut, onAuthStateChanged, User } from '../firebase';
import { AdminUser, UserProfile } from '../types';
import { GoogleAuthModal } from './GoogleAuthModal';
import { saveUser } from '../utils/api';

interface AdminHeaderProps {
  currentTab: 'cards' | 'print' | 'nfc' | 'simulator' | 'admins' | 'users';
  onSelectTab: (tab: 'cards' | 'print' | 'nfc' | 'simulator' | 'admins' | 'users') => void;
  onOpenBatchModal: () => void;
  totalCards: number;
  assignedCount: number;
  availableCount: number;
  activeAdmin: AdminUser;
  admins: AdminUser[];
  onSelectActiveAdmin: (admin: AdminUser) => void;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  currentTab,
  onSelectTab,
  onOpenBatchModal,
  totalCards,
  assignedCount,
  availableCount,
  activeAdmin,
  admins,
  onSelectActiveAdmin,
}) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState<boolean>(false);
  const [verifiedGoogleProfile, setVerifiedGoogleProfile] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem('3dbysd_current_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user && user.email) {
        // Automatically save user to persistence
        try {
          const profile = await saveUser({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName || user.email.split('@')[0],
            photoURL: user.photoURL || undefined,
            provider: 'google.com',
            emailVerified: user.emailVerified,
            role: user.email.toLowerCase() === '66shashwatkumar66@gmail.com' ? 'master' : 'member',
          });
          setVerifiedGoogleProfile(profile);
          localStorage.setItem('3dbysd_current_user', JSON.stringify(profile));
        } catch {
          // ignore
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const handleSignInClick = () => {
    setIsGoogleModalOpen(true);
  };

  const handleGoogleSuccess = (user: UserProfile) => {
    setVerifiedGoogleProfile(user);
    localStorage.setItem('3dbysd_current_user', JSON.stringify(user));
    if (user.role === 'master' || user.email === '66shashwatkumar66@gmail.com') {
      const master = admins.find((a) => a.role === 'master') || admins[0];
      if (master) onSelectActiveAdmin(master);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setVerifiedGoogleProfile(null);
      localStorage.removeItem('3dbysd_current_user');
    } catch (err: any) {
      console.warn('Sign-out failed:', err?.message);
    }
  };

  const masterAdmin = admins.find((a) => a.role === 'master') || admins[0];
  const isMaster = activeAdmin.role === 'master';

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
      {/* Google 4-Color Gradient Stripe */}
      <div className="h-1 w-full bg-gradient-to-r from-[#4285F4] via-[#EA4335] via-[#FBBC05] to-[#34A853]" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 h-16">
          {/* Zone 1: Brand Wordmark with Google 4-Color Dots */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1A73E8] to-[#1557B0] flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-extrabold tracking-tight text-slate-900 whitespace-nowrap">
                  3DBYSD
                </span>
                <span className="text-base font-medium text-slate-700">Smart Reviews</span>
                {/* 4 Google Dots */}
                <div className="flex items-center gap-1 ml-1" title="Google-Integrated Review Engine">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#4285F4]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#EA4335]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FBBC05]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#34A853]" />
                </div>
              </div>
              <div className="text-[11px] font-medium text-slate-500 whitespace-nowrap">
                Google Business NFC & QR Dynamic Platform
              </div>
            </div>
          </div>

          {/* Zone 2: Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1 shrink-0">
            <button
              onClick={() => onSelectTab('cards')}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-full transition-all whitespace-nowrap ${
                currentTab === 'cards'
                  ? 'bg-blue-50 text-[#1A73E8] font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Layers className="w-4 h-4 text-[#4285F4]" />
              <span>Cards Inventory ({totalCards})</span>
            </button>

            <button
              onClick={() => onSelectTab('print')}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-full transition-all whitespace-nowrap ${
                currentTab === 'print'
                  ? 'bg-amber-50 text-amber-900 font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Printer className="w-4 h-4 text-[#FBBC05]" />
              <span>Print Sheets</span>
            </button>

            <button
              onClick={() => onSelectTab('nfc')}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-full transition-all whitespace-nowrap ${
                currentTab === 'nfc'
                  ? 'bg-purple-50 text-purple-900 font-bold shadow-2xs ring-1 ring-purple-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Radio className="w-4 h-4 text-[#1A73E8]" />
              <span>NFC Generator</span>
            </button>

            <button
              onClick={() => onSelectTab('simulator')}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-full transition-all whitespace-nowrap ${
                currentTab === 'simulator'
                  ? 'bg-emerald-50 text-emerald-900 font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Smartphone className="w-4 h-4 text-[#34A853]" />
              <span>Mobile Simulator</span>
            </button>

            {/* Google Verified Users & Logins Tab */}
            <button
              onClick={() => onSelectTab('users')}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-full transition-all whitespace-nowrap ${
                currentTab === 'users'
                  ? 'bg-blue-50 text-[#1A73E8] font-bold shadow-2xs ring-1 ring-blue-300'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Users className="w-4 h-4 text-[#4285F4]" />
              <span>Users & Logins</span>
            </button>

            {/* Master Admin Panel Tab (Only accessible if active admin is Master Admin) */}
            {isMaster && (
              <button
                onClick={() => onSelectTab('admins')}
                className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-full transition-all whitespace-nowrap ${
                  currentTab === 'admins'
                    ? 'bg-purple-50 text-purple-900 font-bold shadow-2xs ring-1 ring-purple-300'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <ShieldCheck className="w-4 h-4 text-purple-600" />
                <span>Master Admin ({admins.length})</span>
              </button>
            )}
          </nav>

          {/* Zone 3: Primary Action, Role Switcher, Google Auth & Counts */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Active Admin Role Pill & Quick Switcher */}
            <div className="hidden sm:flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2 py-1 rounded-full text-xs">
              {isMaster ? (
                <div className="flex items-center gap-1 text-purple-700 font-bold text-[11px]">
                  <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
                  <span>👑 Master</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-amber-800 font-bold text-[11px]">
                  <Lock className="w-3.5 h-3.5 text-amber-600" />
                  <span className="truncate max-w-[90px]">{activeAdmin.name}</span>
                </div>
              )}

              {/* Quick switch button if restricted */}
              {!isMaster && masterAdmin && (
                <button
                  onClick={() => onSelectActiveAdmin(masterAdmin)}
                  title="Switch back to Master Admin mode"
                  className="px-2 py-0.5 rounded-full bg-blue-50 hover:bg-blue-100 text-[#1A73E8] text-[10px] font-extrabold transition-colors border border-blue-200"
                >
                  Exit Sub-Admin
                </button>
              )}
            </div>

            {/* Google Authentication Control */}
            {currentUser || verifiedGoogleProfile ? (
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 pl-1.5 pr-2 py-1 rounded-full text-xs">
                <div className="relative">
                  <img
                    src={
                      currentUser?.photoURL ||
                      verifiedGoogleProfile?.photoURL ||
                      `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                        currentUser?.email || verifiedGoogleProfile?.email || 'User'
                      )}&backgroundColor=1a73e8&textColor=ffffff`
                    }
                    alt={currentUser?.displayName || verifiedGoogleProfile?.displayName || 'User'}
                    className="w-5 h-5 rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#34A853] ring-1 ring-white" />
                </div>
                <div className="hidden xl:flex flex-col text-left">
                  <span className="text-[11px] font-bold text-slate-800 max-w-[100px] truncate leading-tight">
                    {currentUser?.displayName || verifiedGoogleProfile?.displayName || 'Google User'}
                  </span>
                  <span className="text-[9px] text-[#34A853] font-semibold flex items-center gap-0.5">
                    <CheckCircle className="w-2.5 h-2.5" /> Verified
                  </span>
                </div>
                <button
                  onClick={handleSignOut}
                  title="Sign out of Google"
                  className="p-1 rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors ml-0.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={handleSignInClick}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 shadow-2xs transition-all hover:border-blue-400"
                title="Sign in with Google Account"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                  />
                </svg>
                <span className="hidden sm:inline">Google Login</span>
              </button>
            )}

            {/* Generate Batch QRs button (visible only if admin has creation power) */}
            {(isMaster || activeAdmin.permissions?.canCreateCards) && (
              <button
                onClick={onOpenBatchModal}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-[#1A73E8] hover:bg-[#1557B0] rounded-full shadow-sm shadow-blue-500/20 transition-all whitespace-nowrap shrink-0 active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Generate Batch</span>
                <span className="sm:hidden">Batch</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Navigation bar for small screens */}
        <div className="flex lg:hidden items-center border-t border-slate-100 py-2 overflow-x-auto gap-2">
          <button
            onClick={() => onSelectTab('cards')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap ${
              currentTab === 'cards' ? 'bg-[#1A73E8] text-white' : 'text-slate-600'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Cards ({totalCards})</span>
          </button>
          <button
            onClick={() => onSelectTab('print')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap ${
              currentTab === 'print' ? 'bg-[#1A73E8] text-white' : 'text-slate-600'
            }`}
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Sheets</span>
          </button>
          <button
            onClick={() => onSelectTab('nfc')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap ${
              currentTab === 'nfc' ? 'bg-[#1A73E8] text-white' : 'text-slate-600'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>NFC URL</span>
          </button>
          <button
            onClick={() => onSelectTab('simulator')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap ${
              currentTab === 'simulator' ? 'bg-[#1A73E8] text-white' : 'text-slate-600'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Simulator</span>
          </button>
          <button
            onClick={() => onSelectTab('users')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap ${
              currentTab === 'users' ? 'bg-blue-600 text-white' : 'text-blue-700 bg-blue-50'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Users</span>
          </button>
          {isMaster && (
            <button
              onClick={() => onSelectTab('admins')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap ${
                currentTab === 'admins' ? 'bg-purple-600 text-white' : 'text-purple-700 bg-purple-50'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Master Admin</span>
            </button>
          )}
        </div>
      </div>

      {/* Google Authentication Modal */}
      <GoogleAuthModal
        isOpen={isGoogleModalOpen}
        onClose={() => setIsGoogleModalOpen(false)}
        onSuccess={handleGoogleSuccess}
        defaultEmail={activeAdmin.email || '66shashwatkumar66@gmail.com'}
      />
    </header>
  );
};
