import React, { useState, useEffect } from 'react';
import {
  Menu,
  QrCode,
  Plus,
  Printer,
  Smartphone,
  Layers,
  LogIn,
  LogOut,
  Radio,
  ShieldCheck,
  Lock,
  ChevronDown,
  Users,
  CheckCircle,
  Sliders,
} from 'lucide-react';
import { auth, signOut, onAuthStateChanged, User } from '../firebase';
import { AdminUser, UserProfile } from '../types';
import { GoogleAuthModal } from './GoogleAuthModal';
import { saveUser } from '../utils/api';

interface AdminHeaderProps {
  currentTab: 'cards' | 'customizer' | 'print' | 'nfc' | 'simulator' | 'admins' | 'users';
  onSelectTab: (tab: 'cards' | 'customizer' | 'print' | 'nfc' | 'simulator' | 'admins' | 'users') => void;
  onOpenBatchModal: () => void;
  onOpenSidebar: () => void;
  totalCards: number;
  assignedCount: number;
  availableCount: number;
  activeAdmin: AdminUser;
  admins: AdminUser[];
  onSelectActiveAdmin: (admin: AdminUser) => void;
  currentUser?: UserProfile | null;
  onSignOut?: () => void;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  currentTab,
  onSelectTab,
  onOpenBatchModal,
  onOpenSidebar,
  totalCards,
  assignedCount,
  availableCount,
  activeAdmin,
  admins,
  onSelectActiveAdmin,
  currentUser: propCurrentUser,
  onSignOut,
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
      if (onSignOut) onSignOut();
    } catch (err: any) {
      console.warn('Sign-out failed:', err?.message);
    }
  };

  const isMaster = activeAdmin.role === 'master';

  // Get active view label & badge styling
  const getTabMeta = () => {
    switch (currentTab) {
      case 'cards':
        return { label: `Cards Inventory (${totalCards})`, icon: Layers, color: 'text-blue-700 bg-blue-50 border-blue-200' };
      case 'customizer':
        return { label: 'Review Page Customizer', icon: Sliders, color: 'text-purple-700 bg-purple-50 border-purple-200' };
      case 'print':
        return { label: 'Print Sheets', icon: Printer, color: 'text-amber-800 bg-amber-50 border-amber-200' };
      case 'nfc':
        return { label: 'NFC Generator', icon: Radio, color: 'text-purple-700 bg-purple-50 border-purple-200' };
      case 'simulator':
        return { label: 'Mobile Simulator', icon: Smartphone, color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
      case 'users':
        return { label: 'Users & Logins', icon: Users, color: 'text-blue-700 bg-blue-50 border-blue-200' };
      case 'admins':
        return { label: 'Master Admin', icon: ShieldCheck, color: 'text-purple-700 bg-purple-50 border-purple-200' };
      default:
        return { label: 'Dashboard', icon: Layers, color: 'text-slate-700 bg-slate-50 border-slate-200' };
    }
  };

  const tabMeta = getTabMeta();
  const TabIcon = tabMeta.icon;

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 w-full">
      {/* Google 4-Color Gradient Stripe */}
      <div className="h-1 w-full bg-gradient-to-r from-[#4285F4] via-[#EA4335] via-[#FBBC05] to-[#34A853]" />

      <div className="max-w-5xl lg:max-w-6xl mx-auto px-3 sm:px-6">
        <div className="flex items-center justify-between gap-3 h-14 sm:h-16">
          {/* Left Zone: Hamburger Menu Icon + Brand Logo & Title */}
          <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
            {/* Hamburger Icon to open Sliding Sidebar */}
            <button
              onClick={onOpenSidebar}
              className="flex items-center gap-2 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 border border-slate-200/80 shadow-2xs transition-all active:scale-95 group shrink-0"
              title="Open Navigation Menu"
              aria-label="Open Navigation Menu"
            >
              <Menu className="w-5 h-5 text-slate-700 group-hover:text-[#1A73E8] transition-colors" />
              <span className="text-xs font-bold text-slate-700 hidden sm:inline">Menu</span>
            </button>

            {/* Brand Logo & Title */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#1A73E8] to-[#1557B0] flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
                <QrCode className="w-4 h-4" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm sm:text-base font-extrabold tracking-tight text-slate-900 whitespace-nowrap">
                  3DBYSD
                </span>
                <span className="text-xs sm:text-sm font-semibold text-slate-700 hidden xs:inline whitespace-nowrap">
                  Smart Reviews
                </span>
                <div className="hidden sm:flex items-center gap-0.5 ml-0.5" title="Google Review Engine">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#4285F4]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#EA4335]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FBBC05]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#34A853]" />
                </div>
              </div>
            </div>
          </div>

          {/* Middle Zone: Desktop Navigation Bar with direct 1-click access */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200/80">
            <button
              type="button"
              onClick={() => onSelectTab('cards')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                currentTab === 'cards'
                  ? 'bg-white text-blue-700 shadow-2xs font-extrabold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Cards</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 font-mono">
                {totalCards}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onSelectTab('customizer')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                currentTab === 'customizer'
                  ? 'bg-white text-purple-700 shadow-2xs font-extrabold'
                  : 'text-slate-600 hover:text-purple-700 hover:bg-slate-200/60'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 text-purple-600" />
              <span>Customizer</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectTab('nfc')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                currentTab === 'nfc'
                  ? 'bg-white text-purple-700 shadow-2xs font-extrabold ring-1 ring-purple-200'
                  : 'text-slate-600 hover:text-purple-700 hover:bg-purple-50'
              }`}
              title="NFC Chip Generator & Web NFC Programmer"
            >
              <Radio className="w-3.5 h-3.5 text-purple-600 animate-pulse" />
              <span>NFC Tools</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectTab('print')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                currentTab === 'print'
                  ? 'bg-white text-amber-800 shadow-2xs font-extrabold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Printer className="w-3.5 h-3.5 text-amber-600" />
              <span>Print</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectTab('simulator')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                currentTab === 'simulator'
                  ? 'bg-white text-emerald-700 shadow-2xs font-extrabold'
                  : 'text-slate-600 hover:text-emerald-700 hover:bg-slate-200/60'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
              <span>Simulator</span>
            </button>
          </nav>

          {/* Right Zone: Primary Actions & Google Auth */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Quick Add Batch Button */}
            {(isMaster || activeAdmin.permissions?.canCreateCards) && (
              <button
                onClick={onOpenBatchModal}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-[#1A73E8] hover:bg-[#1557B0] rounded-xl shadow-xs transition-all whitespace-nowrap active:scale-95"
                title="Generate new batch of dynamic QR codes"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Add Cards</span>
                <span className="sm:hidden">Add</span>
              </button>
            )}

            {/* Google Authentication Control */}
            {currentUser || verifiedGoogleProfile ? (
              <div className="flex items-center gap-1.5 sm:gap-2 bg-slate-50 border border-slate-200 pl-1.5 pr-2 py-1 rounded-full text-xs">
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
                <div className="hidden lg:flex flex-col text-left">
                  <span className="text-[11px] font-bold text-slate-800 max-w-[85px] truncate leading-tight">
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
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 shadow-2xs transition-all hover:border-blue-400"
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
          </div>
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
