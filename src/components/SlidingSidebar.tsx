import React, { useState, useEffect } from 'react';
import {
  X,
  Layers,
  Printer,
  Radio,
  Smartphone,
  Users,
  ShieldCheck,
  Plus,
  FileSpreadsheet,
  QrCode,
  RotateCcw,
  LogIn,
  LogOut,
  CheckCircle,
  Database,
  Cpu,
  Sliders,
  Megaphone,
  History,
} from 'lucide-react';
import { AdminUser, UserProfile } from '../types';
import { GoogleAuthModal } from './GoogleAuthModal';
import { AdminTabId } from './AdminHeader';
import { MASTER_ADMIN_EMAIL } from '../utils/api';

interface SlidingSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  currentTab: AdminTabId;
  onSelectTab: (tab: AdminTabId) => void;
  totalCards: number;
  assignedCount: number;
  availableCount: number;
  activeAdmin: AdminUser;
  admins: AdminUser[];
  onSelectActiveAdmin: (admin: AdminUser) => void;
  onExitSubAdminMode?: () => void;
  onOpenBatchModal: () => void;
  onExportCsv?: () => void;
  currentUser?: UserProfile | null;
  onSignOut?: () => void;
}

export const SlidingSidebar: React.FC<SlidingSidebarProps> = ({
  isOpen,
  onClose,
  currentTab,
  onSelectTab,
  totalCards,
  availableCount,
  activeAdmin,
  admins,
  onSelectActiveAdmin,
  onExitSubAdminMode,
  onOpenBatchModal,
  onExportCsv,
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

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const masterAdmin =
    admins.find((a) => a.role === 'master' || a.email.toLowerCase() === MASTER_ADMIN_EMAIL) || {
      id: 'master-admin-01',
      email: MASTER_ADMIN_EMAIL,
      name: 'Master Administrator',
      role: 'master' as const,
      assignedCardIds: [],
      permissions: {
        canEditCards: true,
        canToggleAi: true,
        canExportCsv: true,
        canCreateCards: true,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

  const isMaster = activeAdmin.role === 'master';
  const effectiveEmail = (currentUser?.email || '').toLowerCase();
  const isMasterUser = effectiveEmail === MASTER_ADMIN_EMAIL;
  const isInSubAdminMode = isMasterUser && activeAdmin.role === 'restricted';

  const navItems: Array<{
    id: AdminTabId;
    label: string;
    description: string;
    icon: React.FC<{ className?: string }>;
    badge?: string;
    badgeColor?: string;
  }> = [
    {
      id: 'cards',
      label: 'Cards Inventory',
      description: 'Manage dynamic QR stands & assignments',
      icon: Layers,
      badge: totalCards.toString(),
      badgeColor: 'bg-blue-100 text-blue-700',
    },
    {
      id: 'logs',
      label: 'QR Scan Logs',
      description: 'Historical scan totals & live scan events',
      icon: History,
      badge: 'History',
      badgeColor: 'bg-emerald-100 text-emerald-700',
    },
    {
      id: 'customizer',
      label: 'Review Page Customizer',
      description: 'Customize keywords & review tags',
      icon: Sliders,
    },
    {
      id: 'print',
      label: 'Print Sheets',
      description: 'High-res printable sheets & cards',
      icon: Printer,
      badge: `${availableCount} Ready`,
      badgeColor: 'bg-amber-100 text-amber-800',
    },
    {
      id: 'nfc',
      label: 'NFC URL Generator',
      description: 'NDEF chip URLs & encoding links',
      icon: Radio,
    },
    {
      id: 'simulator',
      label: 'Mobile Simulator',
      description: 'Test live customer scan experience',
      icon: Smartphone,
    },
    ...(isMaster
      ? [
          {
            id: 'ads' as const,
            label: 'Advertisements',
            description: 'Manage sponsor ads on review stands',
            icon: Megaphone,
          },
          {
            id: 'users' as const,
            label: 'Users & Logins',
            description: 'Google verified logins & registry',
            icon: Users,
          },
          {
            id: 'admins' as const,
            label: 'Master Admin Control',
            description: 'Sub-admins, permissions & Firestore',
            icon: ShieldCheck,
            badge: `${admins.length} Admins`,
            badgeColor: 'bg-purple-100 text-purple-700',
          },
        ]
      : []),
  ];

  return (
    <>
      {/* Backdrop overlay */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden="true"
      />

      {/* Sliding Sidebar Panel */}
      <aside
        className={`fixed top-0 left-0 bottom-0 z-50 w-80 max-w-[85vw] bg-white shadow-2xl flex flex-col border-r border-slate-200 transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Navigation Sidebar"
      >
        <div className="h-1 w-full bg-gradient-to-r from-[#4285F4] via-[#EA4335] via-[#FBBC05] to-[#34A853]" />

        {/* Sidebar Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1A73E8] to-[#1557B0] flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-extrabold text-slate-900 tracking-tight">3DBYSD</span>
                <span className="text-sm font-semibold text-slate-700">Reviews</span>
              </div>
              <div className="text-[10px] font-medium text-slate-500">Navigation & Control Center</div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
            title="Close menu (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Navigation Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-4">
          {/* Active Admin Profile Card */}
          <div className="p-3 rounded-xl bg-gradient-to-br from-slate-50 to-blue-50/40 border border-slate-200/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div className="relative shrink-0">
                  <img
                    src={
                      currentUser?.photoURL ||
                      `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                        currentUser?.email || activeAdmin.email
                      )}&backgroundColor=1a73e8&textColor=ffffff`
                    }
                    alt={activeAdmin.name}
                    className="w-8 h-8 rounded-full object-cover border border-slate-200"
                    referrerPolicy="no-referrer"
                  />
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#34A853] ring-1 ring-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">
                    {currentUser?.displayName || activeAdmin.name}
                  </div>
                  <div className="text-[10px] text-slate-500 truncate font-mono">
                    {currentUser?.email || activeAdmin.email}
                  </div>
                </div>
              </div>

              <span
                className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full whitespace-nowrap ${
                  isMaster
                    ? 'bg-purple-100 text-purple-800 border border-purple-200'
                    : 'bg-amber-100 text-amber-800 border border-amber-200'
                }`}
              >
                {isMaster ? 'Master' : 'Sub-Admin'}
              </span>
            </div>

            {isInSubAdminMode && (
              <button
                type="button"
                onClick={() => {
                  if (onExitSubAdminMode) {
                    onExitSubAdminMode();
                  } else {
                    onSelectActiveAdmin(masterAdmin);
                  }
                  onClose();
                }}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#1A73E8] text-xs font-bold transition-all border border-blue-200 cursor-pointer shadow-2xs active:scale-95"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Exit Sub-Admin Mode</span>
              </button>
            )}

            <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
              {currentUser ? (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onSignOut) onSignOut();
                  }}
                  className="flex items-center gap-1.5 text-slate-500 hover:text-red-600 transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign out</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsGoogleModalOpen(true)}
                  className="flex items-center gap-1.5 text-[#1A73E8] font-semibold hover:underline cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Connect Google Account</span>
                </button>
              )}

              <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Verified
              </span>
            </div>
          </div>

          {/* Primary Navigation Links */}
          <div className="space-y-1">
            <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider px-2 py-1">
              Modules & Features
            </div>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelectTab(item.id);
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl transition-all text-left cursor-pointer ${
                    isActive
                      ? 'bg-blue-50/80 text-[#1A73E8] font-bold border border-blue-200/80 shadow-2xs'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        isActive ? 'bg-[#1A73E8] text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate leading-tight">{item.label}</div>
                      <div className="text-[10px] text-slate-400 truncate">{item.description}</div>
                    </div>
                  </div>

                  {item.badge && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${
                        item.badgeColor || 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Quick Platform Actions */}
          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider px-2 py-1">
              Quick Actions
            </div>

            {isMaster && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenBatchModal();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-2xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-[#FBBC05]" />
                <span>Generate Batch QRs</span>
              </button>
            )}

            {onExportCsv && (isMaster || activeAdmin.permissions?.canExportCsv) && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onExportCsv();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-all shadow-2xs cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Export Inventory CSV</span>
              </button>
            )}
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-slate-600 font-medium">
              <Cpu className="w-3 h-3 text-[#1A73E8]" />
              <span>Google Gemini AI</span>
            </div>
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">
              Active
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-slate-600 font-medium">
              <Database className="w-3 h-3 text-[#34A853]" />
              <span>Cloud Firestore</span>
            </div>
            <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.2 rounded">
              Live
            </span>
          </div>
        </div>
      </aside>

      <GoogleAuthModal
        isOpen={isGoogleModalOpen}
        onClose={() => setIsGoogleModalOpen(false)}
        onSuccess={handleGoogleSuccess}
        defaultEmail={activeAdmin.email || MASTER_ADMIN_EMAIL}
      />
    </>
  );
};
