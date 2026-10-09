import React, { useState, useEffect } from 'react';
import { QrCode, Plus, Printer, Smartphone, Layers, LogIn, LogOut, User as UserIcon, Radio } from 'lucide-react';
import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged, User } from '../firebase';

interface AdminHeaderProps {
  currentTab: 'cards' | 'print' | 'nfc' | 'simulator';
  onSelectTab: (tab: 'cards' | 'print' | 'nfc' | 'simulator') => void;
  onOpenBatchModal: () => void;
  totalCards: number;
  assignedCount: number;
  availableCount: number;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  currentTab,
  onSelectTab,
  onOpenBatchModal,
  totalCards,
  assignedCount,
  availableCount,
}) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    setIsSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.warn('Google Sign-in failed or cancelled:', err?.message);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err: any) {
      console.warn('Sign-out failed:', err?.message);
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
      {/* Google 4-Color Gradient Stripe */}
      <div className="h-1 w-full bg-gradient-to-r from-[#4285F4] via-[#EA4335] via-[#FBBC05] to-[#34A853]" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-6 h-16">
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
          <nav className="hidden md:flex items-center gap-1 shrink-0">
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
          </nav>

          {/* Zone 3: Primary Action, Google Auth & Counts */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Google Authentication Control */}
            {currentUser ? (
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 pl-1.5 pr-2 py-1 rounded-full text-xs">
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.displayName || 'User'}
                    className="w-5 h-5 rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-[#4285F4] text-white flex items-center justify-center text-[10px] font-bold">
                    {currentUser.displayName?.charAt(0) || 'U'}
                  </div>
                )}
                <span className="hidden xl:inline text-[11px] font-semibold text-slate-700 max-w-[100px] truncate">
                  {currentUser.displayName || currentUser.email}
                </span>
                <button
                  onClick={handleSignOut}
                  title="Sign out of Firebase"
                  className="p-1 rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={handleSignIn}
                disabled={isSigningIn}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors"
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
                <span className="hidden sm:inline">{isSigningIn ? 'Connecting...' : 'Sign in'}</span>
              </button>
            )}

            <button
              onClick={onOpenBatchModal}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#1A73E8] hover:bg-[#1557B0] rounded-full shadow-sm shadow-blue-500/20 transition-all whitespace-nowrap shrink-0 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Generate Batch QRs</span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation bar for small screens */}
        <div className="flex md:hidden items-center justify-between border-t border-slate-100 py-2 overflow-x-auto gap-2">
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
            <span>Mobile Review</span>
          </button>
        </div>
      </div>
    </header>
  );
};
