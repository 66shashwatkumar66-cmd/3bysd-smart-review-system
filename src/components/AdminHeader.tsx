import React from 'react';
import {
  Menu,
  QrCode,
  Plus,
  Printer,
  Smartphone,
  Layers,
  LogOut,
  Radio,
  ShieldCheck,
  Users,
  CheckCircle,
} from 'lucide-react';
import { AdminUser, UserProfile } from '../types';

interface AdminHeaderProps {
  currentTab: 'cards' | 'print' | 'nfc' | 'simulator' | 'admins' | 'users';
  onSelectTab: (tab: 'cards' | 'print' | 'nfc' | 'simulator' | 'admins' | 'users') => void;
  onOpenBatchModal: () => void;
  onOpenSidebar: () => void;
  totalCards: number;
  assignedCount: number;
  availableCount: number;
  activeAdmin: AdminUser;
  admins: AdminUser[];
  onSelectActiveAdmin: (admin: AdminUser) => void;
  currentUser: UserProfile;
  onSignOut: () => void;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  currentTab,
  onSelectTab,
  onOpenBatchModal,
  onOpenSidebar,
  totalCards,
  assignedCount,
  availableCount,
  currentUser,
  onSignOut,
}) => {
  const isMaster = Boolean(
    currentUser.email.toLowerCase() === '66shashwatkumar66@gmail.com' ||
    currentUser.role === 'master'
  );

  // Get active view label & badge styling
  const getTabMeta = () => {
    switch (currentTab) {
      case 'cards':
        return { label: `Cards Inventory (${totalCards})`, icon: Layers, color: 'text-blue-700 bg-blue-50 border-blue-200' };
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

          {/* Right Zone: Primary Actions & Google Auth */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Quick Add Batch Button: Master Admin Only */}
            {isMaster && (
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

            {/* Authenticated User Account Control */}
            <div className="flex items-center gap-1.5 sm:gap-2 bg-slate-50 border border-slate-200 pl-1.5 pr-2 py-1 rounded-full text-xs">
              <div className="relative">
                <img
                  src={
                    currentUser.photoURL ||
                    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                      currentUser.email
                    )}&backgroundColor=1a73e8&textColor=ffffff`
                  }
                  alt={currentUser.displayName}
                  className="w-5 h-5 rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#34A853] ring-1 ring-white" />
              </div>
              <div className="hidden lg:flex flex-col text-left">
                <span className="text-[11px] font-bold text-slate-800 max-w-[110px] truncate leading-tight">
                  {isMaster ? 'Master Admin' : currentUser.displayName}
                </span>
                <span className="text-[9px] text-[#34A853] font-semibold flex items-center gap-0.5">
                  <CheckCircle className="w-2.5 h-2.5" />
                  {isMaster ? 'Master Admin' : 'Merchant'}
                </span>
              </div>
              <button
                onClick={onSignOut}
                title="Sign out of your account"
                className="p-1 rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors ml-0.5 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
