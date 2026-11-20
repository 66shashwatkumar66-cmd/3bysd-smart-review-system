import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CardRecord, AdminUser, UserProfile } from './types';
import {
  fetchCards,
  createBatchCards,
  assignCard,
  bulkUpdateCardsStatus,
  deleteCard,
  fetchAdmins,
  createAdmin,
  updateAdmin,
  deleteAdmin,
  fetchUsers,
  saveUser,
  MASTER_ADMIN_EMAIL,
} from './utils/api';
import {
  extractCardId,
  isValidCardId,
  lookupCard,
  CustomerLoadState,
  getCachedCard,
} from './utils/cardLookup';
import { auth, onAuthStateChanged, signOut, getRedirectResult } from './firebase';
import { AdminHeader, AdminTabId } from './components/AdminHeader';
import { CardsTable } from './components/CardsTable';
import { BatchGeneratorModal } from './components/BatchGeneratorModal';
import { AssignCardModal } from './components/AssignCardModal';
import { PrintSheetView } from './components/PrintSheetView';
import { CustomerReviewView } from './components/CustomerReviewView';
import { MobileSimulatorModal } from './components/MobileSimulatorModal';
import { AdminStatsWidget } from './components/AdminStatsWidget';
import { NfcGeneratorView } from './components/NfcGeneratorView';
import { ReviewCustomizerView } from './components/ReviewCustomizerView';
import { MasterAdminView } from './components/MasterAdminView';
import { UsersManagementView } from './components/UsersManagementView';
import { AdvertisementManagementView } from './components/AdvertisementManagementView';
import { ScanLogsView } from './components/ScanLogsView';
import { SlidingSidebar } from './components/SlidingSidebar';
import { AuthGateway } from './components/AuthGateway';
import { exportCardsToCsv } from './utils/csv';
import {
  QrCode,
  Plus,
  Smartphone,
  ExternalLink,
  FileSpreadsheet,
  Lock,
  ShieldCheck,
  RotateCcw,
  Radio,
  AlertCircle,
  Building2,
  Sliders,
  LogOut,
  History,
  X,
  CheckCircle2,
} from 'lucide-react';

const DEFAULT_MASTER_ADMIN: AdminUser = {
  id: 'master-admin-01',
  email: MASTER_ADMIN_EMAIL,
  name: 'Master Administrator',
  role: 'master',
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

export default function App() {
  const [cards, setCards] = useState<CardRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [currentTab, setCurrentTab] = useState<AdminTabId>('cards');
  const [scanLogsCardFilter, setScanLogsCardFilter] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

  // Inline notification & error banner (replaces window.alert)
  const [appNotice, setAppNotice] = useState<{ type: 'error' | 'success' | 'info'; message: string } | null>(null);

  // Authoritative Firebase Authentication state (single listener for the whole app)
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);

  // Admin Management State
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [activeAdmin, setActiveAdmin] = useState<AdminUser | null>(null);

  // Customer route state (e.g. /r/0001)
  const initialTargetId = typeof window !== 'undefined' ? extractCardId() : null;
  const [customerCardId, setCustomerCardId] = useState<string | null>(initialTargetId);
  const [customerCard, setCustomerCard] = useState<CardRecord | null>(() => {
    if (!initialTargetId) return null;
    return getCachedCard(initialTargetId);
  });
  const [customerLoadState, setCustomerLoadState] = useState<CustomerLoadState>(() => {
    if (!initialTargetId) return 'loading';
    if (!isValidCardId(initialTargetId)) return 'invalid_id';
    const cached = getCachedCard(initialTargetId);
    if (cached) return 'success';
    return 'loading';
  });
  const [customerErrorMessage, setCustomerErrorMessage] = useState<string | null>(null);

  const activeLookupReqIdRef = useRef(0);
  const savedLoginUidRef = useRef<string | null>(null);

  // Modals state
  const [isBatchModalOpen, setIsBatchModalOpen] = useState<boolean>(false);
  const [cardToAssign, setCardToAssign] = useState<CardRecord | null>(null);
  const [simulatorCardId, setSimulatorCardId] = useState<string | null>(null);

  const showNotice = useCallback((type: 'error' | 'success' | 'info', message: string) => {
    setAppNotice({ type, message });
    if (type !== 'error') {
      setTimeout(() => {
        setAppNotice((prev) => (prev?.message === message ? null : prev));
      }, 4500);
    }
  }, []);

  const fetchCustomerCard = useCallback(async (targetId: string, recordScan: boolean = true) => {
    const reqId = ++activeLookupReqIdRef.current;

    if (!isValidCardId(targetId)) {
      setCustomerLoadState('invalid_id');
      setCustomerCard(null);
      setCustomerErrorMessage(`"${targetId}" is not a valid stand identifier.`);
      return;
    }

    const cached = getCachedCard(targetId);
    if (cached) {
      setCustomerCard(cached);
      setCustomerLoadState('success');
    } else {
      setCustomerLoadState('loading');
      setCustomerErrorMessage(null);
    }

    try {
      const result = await lookupCard(targetId, { recordScan });

      if (activeLookupReqIdRef.current !== reqId) return;

      if (result.status === 'success' && result.card) {
        setCustomerCard(result.card);
        setCustomerLoadState('success');
        setCustomerErrorMessage(null);
      } else if (result.status === 'not_found') {
        setCustomerCard(null);
        setCustomerLoadState('not_found');
        setCustomerErrorMessage(result.errorMessage || null);
      } else if (result.status === 'invalid_id') {
        setCustomerCard(null);
        setCustomerLoadState('invalid_id');
        setCustomerErrorMessage(result.errorMessage || null);
      } else {
        if (!cached) {
          setCustomerCard(null);
          setCustomerLoadState('error');
          setCustomerErrorMessage(result.errorMessage || 'Unable to connect to the stand service.');
        }
      }
    } catch (err: any) {
      if (activeLookupReqIdRef.current !== reqId) return;
      if (!cached) {
        setCustomerCard(null);
        setCustomerLoadState('error');
        setCustomerErrorMessage(err.message || 'Connection failed.');
      }
    }
  }, []);

  // Load admin data scoped strictly to the authenticated Firebase user
  const loadAdminWorkspaceData = useCallback(
    async (user: UserProfile) => {
      setLoading(true);
      setAppNotice(null);
      const cleanEmail = user.email.toLowerCase().trim();
      const isMasterEmail = cleanEmail === MASTER_ADMIN_EMAIL && Boolean(user.emailVerified);

      try {
        // 1. Load admins list (all admins for master, self doc for sub-admin)
        const adminList = await fetchAdmins();
        setAdmins(adminList);

        const matchedAdmin = adminList.find((a) => a.email.toLowerCase() === cleanEmail);
        const masterAdminObj =
          adminList.find((a) => a.role === 'master' || a.email.toLowerCase() === MASTER_ADMIN_EMAIL) ||
          DEFAULT_MASTER_ADMIN;

        let resolvedActiveAdmin: AdminUser = matchedAdmin || masterAdminObj;
        if (isMasterEmail) {
          const impersonatedId = localStorage.getItem('3dbysd_impersonated_admin_id');
          const imp = impersonatedId
            ? adminList.find((a) => a.id === impersonatedId && a.role === 'restricted')
            : null;
          resolvedActiveAdmin = imp || masterAdminObj;
        }
        setActiveAdmin(resolvedActiveAdmin);

        // 2. Load authoritative cards from Cloud Firestore using verified RBAC scope
        const cardsList = await fetchCards({
          isMaster: isMasterEmail,
          email: cleanEmail,
          uid: user.uid,
          assignedCardIds: matchedAdmin?.assignedCardIds || user.assignedCardIds,
        });
        setCards(cardsList);

        // 3. Load users list (Master Admin only; avoids unnecessary permission-denied for sub-admins)
        if (isMasterEmail) {
          const usersList = await fetchUsers().catch(() => []);
          setUsers(usersList);
        } else {
          setUsers([]);
        }
      } catch (err: any) {
        console.error('[3DBYSD] Workspace load failed:', err);
        showNotice(
          'error',
          err?.message || 'Unable to load records from Cloud Firestore. Please verify your connection and sign-in status.'
        );
      } finally {
        setLoading(false);
      }
    },
    [showNotice]
  );

  // Single authoritative Firebase Auth listener (handles popup, redirect, refresh, and sign-out)
  useEffect(() => {
    // Handle return from Google signInWithRedirect on mobile Safari
    getRedirectResult(auth).catch((err) => {
      console.warn('[3DBYSD] Redirect sign-in notice:', err?.code || err?.message);
    });

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser || !firebaseUser.email) {
        savedLoginUidRef.current = null;
        setCurrentUser(null);
        setCards([]);
        setAdmins([]);
        setUsers([]);
        setActiveAdmin(null);
        setLoading(false);
        localStorage.removeItem('3dbysd_current_user');
        localStorage.removeItem('3dbysd_impersonated_admin_id');
        setAuthReady(true);
        return;
      }

      const cleanEmail = firebaseUser.email.toLowerCase().trim();
      const isMasterEmail = cleanEmail === MASTER_ADMIN_EMAIL && Boolean(firebaseUser.emailVerified);

      let profile: UserProfile = {
        uid: firebaseUser.uid,
        email: cleanEmail,
        displayName:
          firebaseUser.displayName || (isMasterEmail ? 'Master Administrator' : cleanEmail.split('@')[0]),
        photoURL: firebaseUser.photoURL || undefined,
        provider: 'google.com',
        role: isMasterEmail ? 'master' : 'member',
        emailVerified: Boolean(firebaseUser.emailVerified),
        lastLoginAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        loginCount: 1,
      };

      // Persist login profile once per authenticated session
      if (savedLoginUidRef.current !== firebaseUser.uid) {
        savedLoginUidRef.current = firebaseUser.uid;
        try {
          const saved = await saveUser(profile);
          if (saved) profile = saved;
        } catch (err) {
          console.warn('[3DBYSD] User profile sync notice:', err);
        }
      }

      setCurrentUser(profile);
      localStorage.setItem('3dbysd_current_user', JSON.stringify(profile));
      setAuthReady(true);

      // Only load admin workspace data if we are NOT on a public customer QR route
      if (!extractCardId()) {
        await loadAdminWorkspaceData(profile);
      }
    });

    return () => unsubscribe();
  }, [loadAdminWorkspaceData]);

  // Parse public customer QR/NFC routes and listen to popstate
  useEffect(() => {
    const checkPath = () => {
      const targetCardId = extractCardId();
      if (targetCardId) {
        setCustomerCardId(targetCardId);
        // Real customer scan route -> record immutable scan log & increment scansCount
        fetchCustomerCard(targetCardId, true);
      } else {
        setCustomerCardId(null);
        setCustomerCard(null);
      }
    };

    checkPath();
    window.addEventListener('popstate', checkPath);
    return () => {
      window.removeEventListener('popstate', checkPath);
    };
  }, [fetchCustomerCard]);

  const loadCards = async () => {
    if (!currentUser) return;
    await loadAdminWorkspaceData(currentUser);
  };

  const loadAdminsData = async () => {
    try {
      const list = await fetchAdmins();
      setAdmins(list);
      const master =
        list.find((a) => a.role === 'master' || a.email.toLowerCase() === MASTER_ADMIN_EMAIL) ||
        DEFAULT_MASTER_ADMIN;

      const impersonatedId = localStorage.getItem('3dbysd_impersonated_admin_id');
      if (impersonatedId && currentUser?.email?.toLowerCase() === MASTER_ADMIN_EMAIL) {
        const imp = list.find((a) => a.id === impersonatedId && a.role === 'restricted');
        if (imp) {
          setActiveAdmin(imp);
          return;
        }
      }
      setActiveAdmin(master);
    } catch (err: any) {
      showNotice('error', err?.message || 'Failed to refresh administrators.');
    }
  };

  const handleSelectActiveAdmin = (adm: AdminUser) => {
    setActiveAdmin(adm);
    if (adm.role === 'restricted') {
      localStorage.setItem('3dbysd_impersonated_admin_id', adm.id);
      if (['admins', 'users', 'ads'].includes(currentTab)) {
        setCurrentTab('cards');
      }
    } else {
      localStorage.removeItem('3dbysd_impersonated_admin_id');
    }
  };

  const handleExitSubAdminMode = () => {
    const master =
      admins.find((a) => a.role === 'master' || a.email.toLowerCase() === MASTER_ADMIN_EMAIL) ||
      DEFAULT_MASTER_ADMIN;
    setActiveAdmin(master);
    localStorage.removeItem('3dbysd_impersonated_admin_id');
    setCurrentTab('admins');
  };

  const handleGenerateBatch = async (params: {
    count: number;
    startNumber: number;
    paddingDigits: number;
    prefix?: string;
  }) => {
    try {
      const updated = await createBatchCards(params);
      setCards(updated);
      showNotice('success', `Generated ${params.count} new QR stand(s) in Cloud Firestore.`);
    } catch (err: any) {
      showNotice('error', err?.message || 'Batch card creation failed.');
      throw err;
    }
  };

  const handleAssignCard = async (id: string, updates: Partial<CardRecord>) => {
    try {
      const updated = await assignCard(id, updates, effectiveActiveAdmin.id);
      if (updated) {
        setCards((prev) => prev.map((c) => (c.id.toLowerCase() === id.toLowerCase() ? updated : c)));
        if (customerCardId && customerCardId.toLowerCase() === id.toLowerCase()) {
          setCustomerCard(updated);
        }
        showNotice('success', `Saved changes to Stand #${id}.`);
      }
    } catch (err: any) {
      showNotice('error', err?.message || `Failed to save changes for Stand #${id}.`);
      throw err;
    }
  };

  const handleDeleteCard = async (id: string) => {
    try {
      await deleteCard(id);
      setCards((prev) => prev.filter((c) => c.id.toLowerCase() !== id.toLowerCase()));
      showNotice('success', `Deleted Stand #${id}.`);
    } catch (err: any) {
      showNotice('error', err?.message || `Failed to delete Stand #${id}.`);
    }
  };

  const handleToggleAiReview = async (id: string, enabled: boolean) => {
    await handleAssignCard(id, { aiReviewEnabled: enabled });
  };

  const handleBulkUpdateStatus = async (ids: string[], newStatus: 'available' | 'assigned') => {
    try {
      await bulkUpdateCardsStatus(ids, newStatus, effectiveActiveAdmin.id);
      setCards((prev) =>
        prev.map((c) =>
          ids.some((id) => id.toLowerCase() === c.id.toLowerCase())
            ? { ...c, status: newStatus, updatedAt: new Date().toISOString() }
            : c
        )
      );
      showNotice('success', `Updated status to "${newStatus}" for ${ids.length} stand(s).`);
    } catch (err: any) {
      showNotice('error', err?.message || 'Bulk status update failed.');
    }
  };

  const handleOpenCustomerPreview = (card: CardRecord) => {
    setSimulatorCardId(card.id);
  };

  const handleOpenCardLogs = (cardId: string) => {
    setScanLogsCardFilter(cardId);
    setCurrentTab('logs');
  };

  const handleSaveAdmin = async (adminData: Partial<AdminUser>) => {
    try {
      if (adminData.id) {
        const updated = await updateAdmin(adminData.id, adminData);
        if (updated) {
          setAdmins((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
          if (activeAdmin && activeAdmin.id === updated.id) {
            setActiveAdmin(updated);
          }
          showNotice('success', `Updated administrator "${updated.name}".`);
        }
      } else {
        const created = await createAdmin(adminData);
        if (created) {
          setAdmins((prev) => [...prev, created]);
          showNotice('success', `Registered sub-admin "${created.name}".`);
        }
      }
    } catch (err: any) {
      showNotice('error', err?.message || 'Failed to save administrator.');
      throw err;
    }
  };

  const handleDeleteAdmin = async (adminId: string) => {
    try {
      await deleteAdmin(adminId);
      setAdmins((prev) => prev.filter((a) => a.id !== adminId));
      showNotice('success', 'Administrator removed.');
    } catch (err: any) {
      showNotice('error', err?.message || 'Failed to remove administrator.');
    }
  };

  const handleRetryCustomerLookup = () => {
    if (customerCardId) {
      setCustomerLoadState('loading');
      setCustomerErrorMessage(null);
      fetchCustomerCard(customerCardId, false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      savedLoginUidRef.current = null;
      setCurrentUser(null);
      setCards([]);
      setAdmins([]);
      setUsers([]);
      setActiveAdmin(null);
      localStorage.removeItem('3dbysd_current_user');
      localStorage.removeItem('3dbysd_impersonated_admin_id');
    } catch (e: any) {
      showNotice('error', e?.message || 'Sign out failed.');
    }
  };

  // Public customer QR/NFC route (e.g. /r/0001) — never waits on admin auth
  if (customerCardId) {
    return (
      <CustomerReviewView
        card={customerCard}
        cardId={customerCardId}
        loadState={customerLoadState}
        isLoading={customerLoadState === 'loading'}
        errorMessage={customerErrorMessage}
        onRetry={handleRetryCustomerLookup}
        onBackToAdmin={() => {
          window.history.pushState({}, '', '/');
          setCustomerCardId(null);
          setCustomerCard(null);
          if (currentUser) {
            loadAdminWorkspaceData(currentUser);
          }
        }}
      />
    );
  }

  // Wait for Firebase Auth session hydration before querying Firestore or showing AuthGateway
  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6 text-slate-900">
        <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm text-center space-y-3 max-w-xs w-full">
          <div className="w-8 h-8 border-2 border-[#1A73E8] border-t-transparent rounded-full animate-spin mx-auto" />
          <div className="text-sm font-bold text-slate-900">Verifying Session</div>
          <p className="text-xs text-slate-500">Connecting to Firebase Authentication & Cloud Firestore...</p>
        </div>
      </div>
    );
  }

  // Google Authentication Gateway: Protected access
  if (!currentUser) {
    return (
      <AuthGateway
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          loadAdminWorkspaceData(user);
        }}
        onPreviewCard={(id) => {
          setCustomerCardId(id);
          fetchCustomerCard(id, false);
        }}
      />
    );
  }

  // Master Admin check: STRICTLY verified email matching MASTER_ADMIN_EMAIL
  const isMasterUser = Boolean(
    currentUser.emailVerified && currentUser.email.toLowerCase() === MASTER_ADMIN_EMAIL
  );

  // Check if authorized as a sub-admin by Master Admin
  const authorizedAdmin = admins.find(
    (a) => a.email.toLowerCase() === currentUser.email.toLowerCase()
  );

  // Check if user has allocated cards as a client merchant
  const userAllocatedCards = cards.filter((c) => {
    const userEmail = currentUser.email.toLowerCase();
    const userUid = currentUser.uid;
    const userAssigned = currentUser.assignedCardIds || [];
    return (
      (c.assignedToEmail && c.assignedToEmail.toLowerCase() === userEmail) ||
      (c.assignedToUid && c.assignedToUid === userUid) ||
      userAssigned.includes(c.id)
    );
  });

  // Strict Role-Based Access Control (UBRA) — wait until initial load finishes before locking out
  if (!loading && !isMasterUser && !authorizedAdmin && userAllocatedCards.length === 0) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col justify-between antialiased">
        <header className="border-b border-slate-200 bg-white/90 backdrop-blur-md px-4 py-3.5">
          <div className="max-w-md mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold">
                <QrCode className="w-4 h-4 text-[#FBBC05]" />
              </div>
              <span className="font-extrabold text-sm text-slate-900">3DBYSD Smart Reviews</span>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="text-xs font-semibold text-slate-600 hover:text-red-600 flex items-center gap-1 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </header>

        <main className="max-w-md w-full mx-auto px-4 py-12 flex flex-col justify-center space-y-5 flex-1">
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xl text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
              <Lock className="w-7 h-7 text-amber-600" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-lg font-extrabold text-slate-900">Access Pending Authorization</h2>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-mono font-medium">
                <span>{currentUser.email}</span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              This management portal is protected by <strong>Strict Role-Based Access Control</strong>.
              Your Google account is not yet authorized as an administrator, and no QR/NFC stands have been allocated to your email.
            </p>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-left text-xs text-slate-600 space-y-1.5">
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#1A73E8]" />
                <span>How to gain access:</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                Please contact the <strong>Master Administrator</strong> to authorize your email as an administrator or allocate 3D stand QR codes to your account.
              </p>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Switch Google Account</span>
              </button>
            </div>
          </div>
        </main>

        <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
          3DBYSD Smart Reviews · Protected by Strict Role-Based Access Control
        </footer>
      </div>
    );
  }

  const effectiveActiveAdmin: AdminUser =
    activeAdmin ||
    authorizedAdmin ||
    (isMasterUser
      ? DEFAULT_MASTER_ADMIN
      : {
          id: currentUser.uid,
          email: currentUser.email,
          name: currentUser.displayName,
          role: 'restricted',
          assignedCardIds: userAllocatedCards.map((c) => c.id),
          permissions: {
            canEditCards: true,
            canToggleAi: true,
            canExportCsv: false,
            canCreateCards: false,
          },
          createdAt: currentUser.createdAt,
          updatedAt: currentUser.lastLoginAt,
        });

  const isInSubAdminMode = Boolean(isMasterUser && effectiveActiveAdmin.role === 'restricted');
  const isMaster = isMasterUser && !isInSubAdminMode;

  const displayedCards = isMaster
    ? cards
    : cards.filter((c) => {
        const targetEmail = (
          isInSubAdminMode ? effectiveActiveAdmin.email : currentUser.email
        ).toLowerCase();
        const userUid = currentUser.uid;
        const userAssigned = currentUser.assignedCardIds || [];
        const adminAssigned = effectiveActiveAdmin?.assignedCardIds || [];
        return (
          (c.assignedToEmail && c.assignedToEmail.toLowerCase() === targetEmail) ||
          (!isInSubAdminMode && c.assignedToUid && c.assignedToUid === userUid) ||
          (!isInSubAdminMode && userAssigned.includes(c.id)) ||
          (effectiveActiveAdmin?.role === 'restricted' && adminAssigned.includes(c.id))
        );
      });

  const assignedCount = displayedCards.filter((c) => c.status === 'assigned').length;
  const availableCount = displayedCards.filter((c) => c.status === 'available').length;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col w-full max-w-full overflow-x-hidden min-w-0">
      {/* Top Admin Navigation */}
      <AdminHeader
        currentTab={currentTab}
        onSelectTab={(tab) => {
          if (tab === 'simulator') {
            setSimulatorCardId(displayedCards[0]?.id || cards[0]?.id || '0001');
          } else {
            if (tab !== 'logs') setScanLogsCardFilter(null);
            setCurrentTab(tab);
          }
        }}
        onOpenBatchModal={() => setIsBatchModalOpen(true)}
        onOpenSidebar={() => setIsSidebarOpen(true)}
        totalCards={displayedCards.length}
        assignedCount={assignedCount}
        availableCount={availableCount}
        activeAdmin={effectiveActiveAdmin}
        admins={admins}
        onSelectActiveAdmin={handleSelectActiveAdmin}
        onExitSubAdminMode={handleExitSubAdminMode}
        currentUser={currentUser}
        onSignOut={handleSignOut}
      />

      {/* Main Admin Workspace Viewport */}
      <main className="flex-1 max-w-5xl lg:max-w-6xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-5 overflow-x-hidden min-w-0">
        {/* Inline Error / Success Notification Banner */}
        {appNotice && (
          <div
            className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between gap-3 shadow-2xs ${
              appNotice.type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : appNotice.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-blue-50 border-blue-200 text-blue-900'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {appNotice.type === 'error' ? (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              )}
              <span className="font-semibold">{appNotice.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setAppNotice(null)}
              className="p-1 rounded-lg hover:bg-black/5 cursor-pointer shrink-0"
              aria-label="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Restricted Admin Notice Banner if Master Admin is testing Sub-Admin mode */}
        {isInSubAdminMode && (
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-amber-200/80 text-amber-900 flex items-center justify-center font-bold shrink-0">
                <Lock className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-amber-950 flex items-center gap-2 flex-wrap">
                  <span>Sub-Admin Mode: {effectiveActiveAdmin.name}</span>
                  <span className="font-mono text-[10px] bg-amber-200 text-amber-900 px-2 py-0.2 rounded-full font-bold">
                    {displayedCards.length} Cards
                  </span>
                </div>
                <p className="text-amber-800 text-[11px] mt-0.5 truncate">
                  Viewing restricted sub-admin scope for {effectiveActiveAdmin.email}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleExitSubAdminMode}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-200 hover:bg-amber-300 text-amber-950 rounded-xl font-bold transition-colors shrink-0 self-start sm:self-auto text-xs cursor-pointer shadow-2xs active:scale-95"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Exit Sub-Admin Mode</span>
            </button>
          </div>
        )}

        {/* Quick Testing & Direct Customer Link Bar */}
        <div className="relative bg-gradient-to-r from-slate-900 via-slate-900 to-blue-950 text-white rounded-2xl p-4 sm:p-5 shadow-xs border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 overflow-hidden">
          <div className="absolute -top-12 -right-12 w-36 h-36 bg-[#4285F4]/10 rounded-full blur-2xl pointer-events-none" />

          <div className="space-y-1 relative z-10 min-w-0">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full bg-[#FBBC05] text-slate-950 text-[10px] font-black uppercase tracking-wider">
                Google Review Engine
              </span>
            </div>
            <h2 className="text-sm sm:text-base font-bold text-white truncate">
              Test customer scan experience on mobile
            </h2>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap relative z-10 shrink-0">
            {displayedCards.slice(0, 2).map((card) => (
              <a
                key={card.id}
                href={`/r/${card.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-slate-800/90 hover:bg-[#1A73E8] text-xs font-mono text-slate-200 hover:text-white transition-all border border-slate-700/80 shadow-2xs group"
              >
                <span>/r/{card.id}</span>
                <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-white" />
              </a>
            ))}

            <button
              type="button"
              onClick={() => setSimulatorCardId(displayedCards[0]?.id || '0001')}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-bold transition-all shadow-sm shadow-blue-500/25 active:scale-95 shrink-0 cursor-pointer"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Phone Preview</span>
            </button>
          </div>
        </div>

        {/* Summary Stats Overview Widget */}
        <AdminStatsWidget cards={displayedCards} onPreviewCard={handleOpenCustomerPreview} />

        {/* Tab 1: Cards Inventory */}
        {currentTab === 'cards' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-lg font-bold text-slate-900">
                  {isMaster ? `Card Inventory & Assignments (${displayedCards.length})` : `My Assigned Cards (${displayedCards.length})`}
                </h1>
                <p className="text-xs text-slate-500">
                  {isMaster
                    ? 'Manage physical card IDs, connect Google Review profiles, and configure AI settings'
                    : `Managing ${displayedCards.length} authorized QR stand(s) for ${effectiveActiveAdmin.email}`}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setScanLogsCardFilter(null);
                    setCurrentTab('logs');
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl shadow-2xs transition-colors cursor-pointer"
                  title="View QR Scan Logs & Historical Activity"
                >
                  <History className="w-3.5 h-3.5 text-[#1A73E8]" />
                  <span>QR Scan Logs</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentTab('customizer')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl shadow-2xs transition-colors cursor-pointer"
                  title="Customize Review Page Keywords & Tags"
                >
                  <Sliders className="w-3.5 h-3.5 text-purple-600" />
                  <span>Review Customizer</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentTab('nfc')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl shadow-2xs transition-colors cursor-pointer"
                  title="Open NFC Chip URL Generator & Hardware Flasher"
                >
                  <Radio className="w-3.5 h-3.5 text-purple-600" />
                  <span>NFC Flasher</span>
                </button>

                {(isMaster || effectiveActiveAdmin.permissions?.canExportCsv) && (
                  <button
                    type="button"
                    onClick={() => exportCardsToCsv(displayedCards)}
                    disabled={displayedCards.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-900 rounded-xl shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
                    title="Export current card inventory as CSV spreadsheet"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Export CSV</span>
                  </button>
                )}

                {isMaster && (
                  <button
                    type="button"
                    onClick={() => setIsBatchModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl shadow-2xs transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#1A73E8]" />
                    <span>Add Cards</span>
                  </button>
                )}
              </div>
            </div>

            {!loading && displayedCards.length === 0 && !isMaster && (
              <div className="p-8 bg-white rounded-2xl border border-slate-200 text-center space-y-3 shadow-xs">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
                  <Building2 className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-900">No QR Review Stands Assigned Yet</h3>
                <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
                  Welcome, <strong>{currentUser.displayName}</strong>! Only the Master Administrator can create new QR batches and allocate them to businesses. Ask the administrator to allocate cards to <strong>{currentUser.email}</strong>.
                </p>
              </div>
            )}

            {loading ? (
              <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
                <div className="inline-block w-6 h-6 border-2 border-slate-900 border-t-transparent rounded-full animate-spin mb-2" />
                <p className="text-xs text-slate-500">Loading live cards from Cloud Firestore...</p>
              </div>
            ) : (
              <CardsTable
                cards={displayedCards}
                onAssignCard={(card) => setCardToAssign(card)}
                onDeleteCard={
                  isMaster
                    ? handleDeleteCard
                    : () => showNotice('error', 'Only Master Admin can delete QR cards.')
                }
                onPreviewCard={handleOpenCustomerPreview}
                onOpenBatchModal={() => setIsBatchModalOpen(true)}
                onToggleAiReview={
                  isMaster || effectiveActiveAdmin.permissions?.canToggleAi
                    ? handleToggleAiReview
                    : undefined
                }
                onBulkUpdateStatus={handleBulkUpdateStatus}
                onOpenNfcGenerator={() => setCurrentTab('nfc')}
                onOpenCustomizer={() => setCurrentTab('customizer')}
                onViewLogs={handleOpenCardLogs}
                activeAdmin={effectiveActiveAdmin}
              />
            )}
          </div>
        )}

        {/* Tab: QR Scan Logs & Historical Recovery View */}
        {currentTab === 'logs' && (
          <ScanLogsView
            cards={displayedCards}
            activeAdmin={effectiveActiveAdmin}
            isMaster={isMaster}
            initialCardFilter={scanLogsCardFilter}
            onClearInitialCardFilter={() => setScanLogsCardFilter(null)}
            onPreviewCard={handleOpenCustomerPreview}
          />
        )}

        {/* Tab: Review Page Customizer */}
        {currentTab === 'customizer' && (
          <ReviewCustomizerView
            cards={displayedCards}
            activeAdmin={effectiveActiveAdmin}
            onSaveCardKeywords={handleAssignCard}
            onPreviewCard={handleOpenCustomerPreview}
          />
        )}

        {/* Tab: Print Sheets */}
        {currentTab === 'print' && <PrintSheetView cards={displayedCards} />}

        {/* Tab: NFC URL Generator */}
        {currentTab === 'nfc' && (
          <NfcGeneratorView
            cards={displayedCards}
            onCardUpdated={(updated) => {
              setCards((prev) => {
                const idx = prev.findIndex((c) => c.id === updated.id);
                if (idx !== -1) {
                  const copy = [...prev];
                  copy[idx] = updated;
                  return copy;
                }
                return [...prev, updated];
              });
            }}
            onPreviewCard={handleOpenCustomerPreview}
          />
        )}

        {/* Tab: Master Admin Management */}
        {currentTab === 'admins' && isMaster && (
          <MasterAdminView
            cards={cards}
            admins={admins}
            activeAdmin={effectiveActiveAdmin}
            onSelectActiveAdmin={handleSelectActiveAdmin}
            onSaveAdmin={handleSaveAdmin}
            onDeleteAdmin={handleDeleteAdmin}
            onRefreshCards={loadCards}
          />
        )}

        {/* Tab: Google Verified Users & Logins (Master Admin Only) */}
        {currentTab === 'users' && isMaster && (
          <UsersManagementView
            activeAdmin={effectiveActiveAdmin}
            onRefreshAdmins={loadAdminsData}
          />
        )}

        {/* Tab: Master Admin Advertisement Management */}
        {currentTab === 'ads' && isMaster && (
          <AdvertisementManagementView activeAdmin={effectiveActiveAdmin} />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-5 mt-10 text-center text-xs text-slate-500 w-full max-w-full overflow-hidden">
        <div className="max-w-5xl lg:max-w-6xl w-full mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900">3DBYSD Smart Reviews</span>
            <span aria-hidden="true">·</span>
            <span>NFC & 3D Stand Dynamic Review Engine</span>
          </div>
          <div>Built with Google Gemini AI for authentic customer reviews</div>
        </div>
      </footer>

      {/* Batch Generator Modal */}
      <BatchGeneratorModal
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
        existingCards={cards}
        onGenerateBatch={handleGenerateBatch}
      />

      {/* Assign Card Modal */}
      <AssignCardModal
        card={cardToAssign}
        isOpen={Boolean(cardToAssign)}
        onClose={() => setCardToAssign(null)}
        onSave={handleAssignCard}
        activeAdmin={effectiveActiveAdmin}
        users={users}
        isMaster={isMaster}
      />

      {/* Mobile Simulator Modal */}
      {simulatorCardId && (
        <MobileSimulatorModal
          cards={displayedCards.length > 0 ? displayedCards : cards}
          initialCardId={simulatorCardId}
          onClose={() => setSimulatorCardId(null)}
        />
      )}

      {/* Left Sliding Navigation Drawer */}
      <SlidingSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        currentTab={currentTab}
        onSelectTab={(tab) => {
          if (tab === 'simulator') {
            setSimulatorCardId(displayedCards[0]?.id || cards[0]?.id || '0001');
          } else {
            if (tab !== 'logs') setScanLogsCardFilter(null);
            setCurrentTab(tab);
          }
        }}
        totalCards={displayedCards.length}
        assignedCount={assignedCount}
        availableCount={availableCount}
        activeAdmin={effectiveActiveAdmin}
        admins={admins}
        onSelectActiveAdmin={handleSelectActiveAdmin}
        onExitSubAdminMode={handleExitSubAdminMode}
        currentUser={currentUser}
        onSignOut={handleSignOut}
        onOpenBatchModal={() => setIsBatchModalOpen(true)}
        onExportCsv={() => exportCardsToCsv(displayedCards)}
      />
    </div>
  );
}
