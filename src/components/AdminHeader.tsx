import React, { useState } from 'react';
import {
  Menu,
  QrCode,
  Plus,
  Printer,
  Smartphone,
  Layers,
  LogOut,
  Radio,
  CheckCircle,
  Sliders,
  RotateCcw,
  Megaphone,
  History,
} from 'lucide-react';
import { AdminUser, UserProfile } from '../types';
import { GoogleAuthModal } from './GoogleAuthModal';
import { MASTER_ADMIN_EMAIL } from '../utils/api';

export type AdminTabId =
  | 'cards'
  | 'logs'
  | 'customizer'
  | 'print'
  | 'nfc'
  | 'simulator'
  | 'admins'
  | 'users'
  | 'ads';

interface AdminHeaderProps {
  currentTab: AdminTabId;
  onSelectTab: (tab: AdminTabId) => void;
  onOpenBatchModal: () => void;
  onOpenSidebar: () => void;
  totalCards: number;
  assignedCount: number;
  availableCount: number;
  activeAdmin: AdminUser;
  admins: AdminUser[];
  onSelectActiveAdmin: (admin: AdminUser) => void;
  onExitSubAdminMode?: () => void;
  currentUser?: UserProfile | null;
  onSignOut?: () => void;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  currentTab,
  onSelectTab,
  onOpenBatchModal,
  onOpenSidebar,
  totalCards,
  activeAdmin,
  admins,
  onSelectActiveAdmin,
  onExitSubAdminMode,
  currentUser,
  onSignOut,
}) => {
  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState<boolean>(false);

  const handleGoogleSuccess = (user: UserProfile) => {
    if (user.role === 'master' || user.email.toLowerCase() === MASTER_ADMIN_EMAIL) {
      const master = admins.find((a) => a.role === 'master') || admins[0];
      if (master) onSelectActiveAdmin(master);
    }
  };

  const isMaster = activeAdmin.role === 'master';
  const effectiveEmail = (currentUser?.email || '').toLowerCase();
  const isMasterUser = effectiveEmail === MASTER_ADMIN_EMAIL;
  const isInSubAdminMode = isMasterUser && activeAdmin.role === 'restricted';

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 w-full max-w-full overflow-x-hidden">
      {/* Google 4-Color Gradient Stripe */}
      <div className="h-1 w-full bg-gradient-to-r from-[#4285F4] via-[#EA4335] via-[#FBBC05] to-[#34A853]" />

      <div className="max-w-5xl lg:max-w-6xl w-full mx-auto px-3 sm:px-6 min-w-0">
        <div className="flex items-center justify-between gap-2 sm:gap-3 h-14 sm:h-16 min-w-0">
          {/* Left Zone: Hamburger Menu Icon + Brand Logo & Title */}
          <div className="flex items-center gap-2 sm:gap-3.5 min-w-0">
            <button
              type="button"
              onClick={onOpenSidebar}
              className="flex items-center gap-2 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 border border-slate-200/80 shadow-2xs transition-all active:scale-95 group shrink-0 cursor-pointer"
              title="Open Navigation Menu"
              aria-label="Open Navigation Menu"
            >
              <Menu className="w-5 h-5 text-slate-700 group-hover:text-[#1A73E8] transition-colors" />
              <span className="text-xs font-bold text-slate-700 hidden sm:inline">Menu</span>
            </button>

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

          {/* Middle Zone: Desktop Navigation Bar */}
          <nav className="hidden xl:flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200/80 shrink-0">
            <button
              type="button"
              onClick={() => onSelectTab('cards')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
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
              onClick={() => onSelectTab('logs')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                currentTab === 'logs'
                  ? 'bg-white text-blue-700 shadow-2xs font-extrabold'
                  : 'text-slate-600 hover:text-blue-700 hover:bg-slate-200/60'
              }`}
              title="QR Scan Logs & Historical Activity"
            >
              <History className="w-3.5 h-3.5 text-[#1A73E8]" />
              <span>Scan Logs</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectTab('customizer')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
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
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                currentTab === 'nfc'
                  ? 'bg-white text-purple-700 shadow-2xs font-extrabold ring-1 ring-purple-200'
                  : 'text-slate-600 hover:text-purple-700 hover:bg-purple-50'
              }`}
              title="NFC Chip Generator & Web NFC Programmer"
            >
              <Radio className="w-3.5 h-3.5 text-purple-600" />
              <span>NFC</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectTab('print')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
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
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                currentTab === 'simulator'
                  ? 'bg-white text-emerald-700 shadow-2xs font-extrabold'
                  : 'text-slate-600 hover:text-emerald-700 hover:bg-slate-200/60'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
              <span>Simulator</span>
            </button>

            {isMaster && (
              <button
                type="button"
                onClick={() => onSelectTab('ads')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  currentTab === 'ads'
                    ? 'bg-white text-red-700 shadow-2xs font-extrabold ring-1 ring-red-200'
                    : 'text-slate-600 hover:text-red-700 hover:bg-slate-200/60'
                }`}
                title="Advertisement & Sponsor Management"
              >
                <Megaphone className="w-3.5 h-3.5 text-red-600" />
                <span>Ads</span>
              </button>
            )}
          </nav>

          {/* Right Zone: Primary Actions & Google Auth */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {isInSubAdminMode && (
              <button
                type="button"
                onClick={onExitSubAdminMode}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-950 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-xl shadow-2xs transition-all whitespace-nowrap active:scale-95 cursor-pointer"
                title="Exit Sub-Admin mode and restore Master Admin"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Exit Sub-Admin</span>
                <span className="sm:hidden">Exit</span>
              </button>
            )}

            {(isMaster || activeAdmin.permissions?.canCreateCards) && (
              <button
                type="button"
                onClick={onOpenBatchModal}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-[#1A73E8] hover:bg-[#1557B0] rounded-xl shadow-xs transition-all whitespace-nowrap active:scale-95 cursor-pointer"
                title="Generate new batch of dynamic QR codes"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Add Cards</span>
                <span className="sm:hidden">Add</span>
              </button>
            )}

            {currentUser ? (
              <div className="flex items-center gap-1.5 sm:gap-2 bg-slate-50 border border-slate-200 pl-1.5 pr-2 py-1 rounded-full text-xs">
                <div className="relative">
                  <img
                    src={
                      currentUser.photoURL ||
                      `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                        currentUser.email || 'User'
                      )}&backgroundColor=1a73e8&textColor=ffffff`
                    }
                    alt={currentUser.displayName || 'User'}
                    className="w-5 h-5 rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#34A853] ring-1 ring-white" />
                </div>
                <div className="hidden lg:flex flex-col text-left">
                  <span className="text-[11px] font-bold text-slate-800 max-w-[85px] truncate leading-tight">
                    {currentUser.displayName || 'Google User'}
                  </span>
                  <span className="text-[9px] text-[#34A853] font-semibold flex items-center gap-0.5">
                    <CheckCircle className="w-2.5 h-2.5" /> Verified
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onSignOut}
                  title="Sign out of Google"
                  className="p-1 rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors ml-0.5 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsGoogleModalOpen(true)}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 shadow-2xs transition-all hover:border-blue-400 cursor-pointer"
                title="Sign in with Google Account"
              >
                <span className="hidden sm:inline">Google Login</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <GoogleAuthModal
        isOpen={isGoogleModalOpen}
        onClose={() => setIsGoogleModalOpen(false)}
        onSuccess={handleGoogleSuccess}
        defaultEmail={activeAdmin.email || MASTER_ADMIN_EMAIL}
      />
    </header>
  );
};
