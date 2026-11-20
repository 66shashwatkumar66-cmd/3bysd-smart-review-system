import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CardRecord, AdminUser, UserProfile } from './types';
import {
  fetchCards,
  createBatchCards,
  assignCard,
  bulkUpdateCardsStatus,
  deleteCard,
  fetchAdmins,
  syncAdminLookupDocs,
  createAdmin,
  updateAdmin,
  deleteAdmin,
  fetchUsers,
  checkSessionAuthorization,
  clearSessionCaches,
  submitAdminAccessRequest,
  fetchAdminRequests,
  approveAdminRequest,
  rejectAdminRequest,
  formatApiError,
  SessionAuthResult,
} from './utils/api';
import {
  extractCardId,
  isValidCardId,
  lookupCard,
  CustomerLoadState,
  getCachedCard,
  areCardIdsEqual,
} from './utils/cardLookup';
import { auth, db, onAuthStateChanged, signOut } from './firebase';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { AdminHeader } from './components/AdminHeader';
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
import { QrScanLogsView } from './components/QrScanLogsView';
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
  RefreshCw,
  Radio,
  Crown,
  AlertCircle,
  Building2,
  Sliders,
  LogOut,
  History,
} from 'lucide-react';

const DEFAULT_MASTER_ADMIN: AdminUser = {
  id: 'master-admin-01',
  email: '66shashwatkumar66@gmail.com',
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
  const [currentTab, setCurrentTab] = useState<'cards' | 'logs' | 'customizer' | 'print' | 'nfc' | 'simulator' | 'admins' | 'users' | 'ads'>('cards');
  const [logStandFilter, setLogStandFilter] = useState<string | undefined>(undefined);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

  // Authenticated User State (Real Google Auth)
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem('3dbysd_current_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [users, setUsers] = useState<UserProfile[]>([]);

  // Admin Management State
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [activeAdmin, setActiveAdmin] = useState<AdminUser | null>(null);
  const [authRevokedNotice, setAuthRevokedNotice] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [firebaseAuthActive, setFirebaseAuthActive] = useState<boolean>(false);
  const [adminsSynced, setAdminsSynced] = useState<boolean>(false);
  const [checkingAuthStatus, setCheckingAuthStatus] = useState<boolean>(false);
  const [authStatusFeedback, setAuthStatusFeedback] = useState<string | null>(null);
  const [adminRequests, setAdminRequests] = useState<UserProfile[]>([]);
  const [requestNoteInput, setRequestNoteInput] = useState<string>('');
  const [submittingRequest, setSubmittingRequest] = useState<boolean>(false);
  const [requestSubmitFeedback, setRequestSubmitFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const inFlightRefreshRef = useRef<Promise<void> | null>(null);
  const lastRefreshAtRef = useRef<number>(0);
  const [sessionAuth, setSessionAuth] = useState<SessionAuthResult | null>(null);

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

  const fetchCustomerCard = useCallback(async (targetId: string, recordScan: boolean = false) => {
    const reqId = ++activeLookupReqIdRef.current;

    // Validate ID format immediately without unnecessary requests
    if (!isValidCardId(targetId)) {
      setCustomerLoadState('invalid_id');
      setCustomerCard(null);
      setCustomerErrorMessage(`"${targetId}" is not a valid stand identifier.`);
      return;
    }

    // Warm cache check for instant rendering
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

      // Stale response guard: ignore if a newer request began
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
        // Recoverable error: keep cached version if available
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

  // Modals state
  const [isBatchModalOpen, setIsBatchModalOpen] = useState<boolean>(false);
  const [cardToAssign, setCardToAssign] = useState<CardRecord | null>(null);
  const [simulatorCardId, setSimulatorCardId] = useState<string | null>(null);

  // Listen for Google Auth changes without resetting sub-admin roles or allowing revoked admins
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser && firebaseUser.email) {
          setFirebaseAuthActive(true);
          const cleanEmail = firebaseUser.email.toLowerCase().trim();
          const isMasterEmail = cleanEmail === '66shashwatkumar66@gmail.com';
          try {
            const authStatus = await checkSessionAuthorization(cleanEmail, firebaseUser.uid, { fresh: true });
            setSessionAuth(authStatus);
            if (!isMasterEmail && authStatus.revoked) {
              await signOut(auth).catch(() => {});
              localStorage.removeItem('3dbysd_current_user');
              setCurrentUser(null);
              setAuthRevokedNotice(
                authStatus.message || 'Access Denied: Your administrator access has been revoked by the Master Admin.'
              );
              return;
            }

            let preservedRole: 'master' | 'restricted' | 'member' = isMasterEmail ? 'master' : authStatus.role;
            let preservedCards: string[] = authStatus.admin?.assignedCardIds || [];

            const userProfile: UserProfile = {
              uid: firebaseUser.uid,
              email: cleanEmail,
              displayName:
                firebaseUser.displayName || (isMasterEmail ? 'Master Administrator' : cleanEmail.split('@')[0]),
              photoURL: firebaseUser.photoURL || undefined,
              provider: 'google.com',
              role: preservedRole,
              emailVerified: firebaseUser.emailVerified || true,
              lastLoginAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              loginCount: 1,
              assignedCardIds: preservedCards,
              ...(authStatus.requestStatus ? { requestStatus: authStatus.requestStatus } : {}),
              ...(authStatus.requestedAt ? { requestedAt: authStatus.requestedAt } : {}),
              ...(authStatus.requestUpdatedAt ? { requestUpdatedAt: authStatus.requestUpdatedAt } : {}),
              ...(authStatus.requestNote ? { requestNote: authStatus.requestNote } : {}),
            };
            setCurrentUser(userProfile);
            localStorage.setItem('3dbysd_current_user', JSON.stringify(userProfile));
          } catch {
            // Fallback preserving any cached role cleanly
            let fallbackRole: 'master' | 'restricted' | 'member' = isMasterEmail ? 'master' : 'member';
            try {
              const raw = localStorage.getItem('3dbysd_current_user');
              if (raw) {
                const parsed = JSON.parse(raw) as UserProfile;
                if (parsed.email?.trim().toLowerCase() === cleanEmail && parsed.role) {
                  fallbackRole = parsed.role;
                }
              }
            } catch {
              // ignore
            }
            const userProfile: UserProfile = {
              uid: firebaseUser.uid,
              email: cleanEmail,
              displayName:
                firebaseUser.displayName || (isMasterEmail ? 'Master Administrator' : cleanEmail.split('@')[0]),
              photoURL: firebaseUser.photoURL || undefined,
              provider: 'google.com',
              role: fallbackRole,
              emailVerified: firebaseUser.emailVerified || true,
              lastLoginAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              loginCount: 1,
            };
            setCurrentUser(userProfile);
            localStorage.setItem('3dbysd_current_user', JSON.stringify(userProfile));
          }
        } else {
          setFirebaseAuthActive(false);
        }
      } finally {
        setAuthReady(true);
      }
    });
    return () => unsubscribe();
  }, []);

  const loadCards = async (
    userOverride?: UserProfile | null,
    adminOverride?: AdminUser | null
  ) => {
    const targetUser = userOverride !== undefined ? userOverride : currentUser;
    const targetEmail = targetUser?.email?.trim().toLowerCase() || '';
    if (!targetEmail && !targetUser?.uid) {
      setCards([]);
      setLoading(false);
      return;
    }
    const targetIsMaster = targetEmail === '66shashwatkumar66@gmail.com';
    const matchedAdmin =
      adminOverride !== undefined
        ? adminOverride
        : admins.find((a) => a.email.trim().toLowerCase() === targetEmail || a.id === targetUser?.uid) ||
          (targetIsMaster ? DEFAULT_MASTER_ADMIN : activeAdmin);

    setLoading(true);
    const data = await fetchCards({
      id: matchedAdmin?.id || targetUser?.uid,
      uid: targetUser?.uid,
      email: targetEmail,
      role: targetIsMaster ? 'master' : (matchedAdmin?.role || targetUser?.role || 'member'),
      assignedCardIds: targetIsMaster ? [] : (matchedAdmin?.assignedCardIds ?? targetUser?.assignedCardIds ?? []),
    });
    setCards(data);
    setLoading(false);
  };

  const loadUsersData = async () => {
    try {
      const list = await fetchUsers();
      setUsers(list);
    } catch (e) {
      console.warn('Failed to fetch users:', e);
    }
  };

  const loadAdminsData = async (userOverride?: UserProfile | null): Promise<{ list: AdminUser[]; resolvedAdmin: AdminUser | null }> => {
    const targetUser = userOverride !== undefined ? userOverride : currentUser;
    const targetEmail = targetUser?.email?.toLowerCase().trim() || '';
    const targetIsMaster = targetEmail === '66shashwatkumar66@gmail.com';

    const list = await fetchAdmins(targetEmail || undefined, targetUser?.uid);
    setAdmins(list);

    if (targetIsMaster) {
      // Quietly ensure existing Firestore admin records have normalized email lookup docs
      syncAdminLookupDocs(list).catch(() => {});

      const master =
        list.find((a) => a.role === 'master' || a.email.trim().toLowerCase() === '66shashwatkumar66@gmail.com') ||
        DEFAULT_MASTER_ADMIN;

      const impersonatedId = localStorage.getItem('3dbysd_impersonated_admin_id');
      if (impersonatedId) {
        const imp = list.find((a) => a.id === impersonatedId && a.role === 'restricted');
        if (imp) {
          setActiveAdmin(imp);
          return { list, resolvedAdmin: imp };
        }
      }
      setActiveAdmin(master);
      return { list, resolvedAdmin: master };
    } else if (targetEmail) {
      const matched =
        list.find((a) => a.email.trim().toLowerCase() === targetEmail || a.id === targetUser?.uid) || null;
      setActiveAdmin(matched);
      return { list, resolvedAdmin: matched };
    } else {
      setActiveAdmin(null);
      return { list, resolvedAdmin: null };
    }
  };

  const loadAdminRequestsData = async (caller?: { id?: string; email?: string }) => {
    try {
      const reqs = await fetchAdminRequests(caller);
      setAdminRequests(reqs);
    } catch (e) {
      console.warn('Failed to fetch admin requests:', e);
    }
  };

  const refreshAuthorization = useCallback(
    async (options?: {
      force?: boolean;
      userOverride?: UserProfile | null;
      quiet?: boolean;
      showFeedback?: boolean;
      fresh?: boolean;
    }) => {
      const force = options?.force ?? false;
      const quiet = options?.quiet ?? true;
      const showFeedback = options?.showFeedback ?? false;
      const fresh = options?.fresh ?? force;
      const targetUser = options?.userOverride !== undefined ? options.userOverride : currentUser;
      if (!targetUser?.email) return;

      const now = Date.now();
      if (!force && now - lastRefreshAtRef.current < 5000) {
        return;
      }
      if (inFlightRefreshRef.current) {
        return inFlightRefreshRef.current;
      }

      const task = (async () => {
        lastRefreshAtRef.current = Date.now();
        if (!quiet) {
          setAdminsSynced(false);
        }
        if (showFeedback) {
          setCheckingAuthStatus(true);
          setAuthStatusFeedback(null);
        }

        const cleanEmail = targetUser.email.toLowerCase().trim();
        const isMasterEmail = cleanEmail === '66shashwatkumar66@gmail.com';
        try {
          const status = await checkSessionAuthorization(cleanEmail, targetUser.uid, { fresh });
          setSessionAuth(status);
          if (!isMasterEmail && status.revoked) {
            await signOut(auth).catch(() => {});
            clearSessionCaches();
            setCards([]);
            setAdmins([]);
            setUsers([]);
            setAdminRequests([]);
            setActiveAdmin(null);
            setCurrentUser(null);
            setAuthRevokedNotice(
              status.message || 'Access Denied: Your administrator access has been revoked by the Master Admin.'
            );
            return;
          }

          const resolvedRole: 'master' | 'restricted' | 'member' = isMasterEmail ? 'master' : status.role;
          const resolvedCardIds: string[] = status.admin?.assignedCardIds ?? targetUser.assignedCardIds ?? [];
          const roleChanged = targetUser.role !== resolvedRole;
          const cardsChanged =
            JSON.stringify(targetUser.assignedCardIds || []) !== JSON.stringify(resolvedCardIds);
          const reqStatusChanged = targetUser.requestStatus !== status.requestStatus;

          let syncedUser = targetUser;
          if (roleChanged || cardsChanged || reqStatusChanged) {
            syncedUser = {
              ...targetUser,
              role: resolvedRole,
              assignedCardIds: resolvedCardIds,
              ...(status.requestStatus ? { requestStatus: status.requestStatus } : {}),
              ...(status.requestedAt ? { requestedAt: status.requestedAt } : {}),
              ...(status.requestUpdatedAt ? { requestUpdatedAt: status.requestUpdatedAt } : {}),
              ...(status.requestNote ? { requestNote: status.requestNote } : {}),
            };
            setCurrentUser(syncedUser);
            localStorage.setItem('3dbysd_current_user', JSON.stringify(syncedUser));
          }

          const [{ resolvedAdmin }] = await Promise.all([
            loadAdminsData(syncedUser),
            loadUsersData(),
            isMasterEmail ? loadAdminRequestsData({ id: syncedUser.uid, email: cleanEmail }) : Promise.resolve(),
          ]);
          const authoritativeAdmin = resolvedAdmin || status.admin || null;
          await loadCards(syncedUser, authoritativeAdmin);

          if (showFeedback && !isMasterEmail && !status.authorized && !authoritativeAdmin) {
            setAuthStatusFeedback(
              status.requestStatus === 'rejected'
                ? 'Your previous Sub-Admin access request was rejected by the Master Admin. You can submit a new request or contact the Master Admin.'
                : 'Still pending Master Admin approval. If you were just approved, updates sync automatically or try again in a few seconds.'
            );
          } else if (showFeedback) {
            setAuthStatusFeedback(null);
          }
        } finally {
          setAdminsSynced(true);
          if (showFeedback) {
            setCheckingAuthStatus(false);
          }
          inFlightRefreshRef.current = null;
        }
      })();

      inFlightRefreshRef.current = task;
      return task;
    },
    [currentUser?.email, currentUser?.uid]
  );

  // Parse route from window.location and listen to popstate
  useEffect(() => {
    const checkPath = () => {
      const targetCardId = extractCardId();

      if (targetCardId) {
        setCustomerCardId(targetCardId);
        fetchCustomerCard(targetCardId, false);
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

  // Re-sync admin identity and verify revocation whenever authenticated user, route, or auth readiness changes
  useEffect(() => {
    if (customerCardId || !currentUser?.email || !authReady) return;
    refreshAuthorization({ force: true, quiet: false });
  }, [currentUser?.email, currentUser?.uid, customerCardId, authReady, refreshAuthorization]);

  // Quietly re-check authorization when tab regains focus or visibility
  useEffect(() => {
    if (customerCardId || !currentUser?.email || !authReady) return;
    const handleFocusRefresh = () => {
      refreshAuthorization({ force: false, quiet: true });
    };
    const handleVisibilityRefresh = () => {
      if (document.visibilityState === 'visible') {
        refreshAuthorization({ force: false, quiet: true });
      }
    };
    window.addEventListener('focus', handleFocusRefresh);
    document.addEventListener('visibilitychange', handleVisibilityRefresh);
    return () => {
      window.removeEventListener('focus', handleFocusRefresh);
      document.removeEventListener('visibilitychange', handleVisibilityRefresh);
    };
  }, [customerCardId, currentUser?.email, currentUser?.uid, authReady, refreshAuthorization]);

  // Real-time Firestore synchronization:
  // - Non-master users listen to their own /admins/{email} and /users/{uid} docs for live approval, revocation, and card reassignment
  // - Master Admin listens to /users with requestStatus so incoming Sub-Admin requests appear immediately
  useEffect(() => {
    if (customerCardId || !authReady || !firebaseAuthActive || !auth.currentUser || !currentUser?.email) {
      return;
    }
    const cleanEmail = currentUser.email.toLowerCase().trim();
    const isPrimary = cleanEmail === '66shashwatkumar66@gmail.com';

    if (isPrimary) {
      const reqQuery = query(
        collection(db, 'users'),
        where('requestStatus', 'in', ['pending', 'approved', 'rejected'])
      );
      const unsubReqs = onSnapshot(
        reqQuery,
        (snap) => {
          const map = new Map<string, UserProfile>();
          snap.forEach((d) => {
            const u = d.data() as UserProfile;
            if (u && u.email && u.email.toLowerCase().trim() !== '66shashwatkumar66@gmail.com') {
              const emailKey = u.email.toLowerCase().trim();
              const prev = map.get(emailKey);
              const uTime = new Date(u.requestUpdatedAt || u.requestedAt || u.lastLoginAt || 0).getTime();
              const pTime = prev ? new Date(prev.requestUpdatedAt || prev.requestedAt || prev.lastLoginAt || 0).getTime() : -1;
              if (!prev || uTime >= pTime) {
                map.set(emailKey, { ...u, uid: d.id, email: emailKey });
              }
            }
          });
          setAdminRequests(
            Array.from(map.values()).sort((a, b) => {
              const ta = new Date(a.requestedAt || a.createdAt || 0).getTime();
              const tb = new Date(b.requestedAt || b.createdAt || 0).getTime();
              return tb - ta;
            })
          );
        },
        () => {
          // non-fatal listener notice
        }
      );
      return () => unsubReqs();
    }

    let firstAdminSnap = true;
    let firstUserSnap = true;
    let firstCardsSnap = true;
    const unsubAdmin = onSnapshot(
      doc(db, 'admins', cleanEmail),
      () => {
        if (firstAdminSnap) {
          firstAdminSnap = false;
          return;
        }
        refreshAuthorization({ force: true, quiet: true, fresh: true });
      },
      () => {}
    );
    const unsubUser = onSnapshot(
      doc(db, 'users', auth.currentUser.uid),
      () => {
        if (firstUserSnap) {
          firstUserSnap = false;
          return;
        }
        refreshAuthorization({ force: true, quiet: true, fresh: true });
      },
      () => {}
    );
    const unsubAssignedCards = onSnapshot(
      query(collection(db, 'cards'), where('assignedToEmail', '==', cleanEmail)),
      () => {
        if (firstCardsSnap) {
          firstCardsSnap = false;
          return;
        }
        refreshAuthorization({ force: true, quiet: true, fresh: true });
      },
      () => {}
    );
    return () => {
      unsubAdmin();
      unsubUser();
      unsubAssignedCards();
    };
  }, [customerCardId, authReady, firebaseAuthActive, currentUser?.email, currentUser?.uid, refreshAuthorization]);

  // Guard Master-only tabs against Sub-Admin or simulated Sub-Admin navigation
  useEffect(() => {
    if (!currentUser) return;
    const cleanEmail = currentUser.email.trim().toLowerCase();
    const isPrimary = cleanEmail === '66shashwatkumar66@gmail.com';
    const matchedAdm =
      admins.find((a) => a.email.trim().toLowerCase() === cleanEmail || a.id === currentUser.uid) ||
      (sessionAuth?.authorized && sessionAuth.admin ? sessionAuth.admin : undefined);
    const activeRole = isPrimary
      ? activeAdmin?.role || 'master'
      : matchedAdm?.role || (sessionAuth?.authorized ? sessionAuth.role : 'member');
    if (activeRole !== 'master' && ['admins', 'users', 'ads'].includes(currentTab)) {
      setCurrentTab('cards');
    }
  }, [currentUser, admins, activeAdmin, sessionAuth, currentTab]);

  const handleSelectActiveAdmin = (adm: AdminUser) => {
    setActiveAdmin(adm);
    if (adm.role === 'restricted') {
      localStorage.setItem('3dbysd_impersonated_admin_id', adm.id);
    } else {
      localStorage.removeItem('3dbysd_impersonated_admin_id');
    }
  };

  const handleExitSubAdminMode = () => {
    const master =
      admins.find((a) => a.role === 'master' || a.email.toLowerCase() === '66shashwatkumar66@gmail.com') ||
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
    if (!isMaster) {
      throw new Error('Only the Master Admin can generate new QR card batches.');
    }
    const updated = await createBatchCards(params, {
      id: effectiveActiveAdmin.id,
      email: currentUser?.email,
    });
    setCards(updated);
  };

  const handleAssignCard = async (id: string, updates: Partial<CardRecord>) => {
    const updated = await assignCard(
      id,
      updates,
      effectiveActiveAdmin.id,
      currentUser?.email,
      isMaster
    );
    if (updated) {
      setCards((prev) =>
        prev.map((c) => (areCardIdsEqual(c.id, id) ? updated : c))
      );
      if (customerCardId && areCardIdsEqual(customerCardId, id)) {
        setCustomerCard(updated);
      }
      if (isMaster && (updates.assignedToEmail !== undefined || updates.assignedToUid !== undefined)) {
        await Promise.all([loadAdminsData(), loadUsersData()]);
      }
    }
  };

  const handleDeleteCard = async (id: string) => {
    if (!isMaster) {
      throw new Error('Only the Master Admin can delete QR cards.');
    }
    await deleteCard(id, { id: effectiveActiveAdmin.id, email: currentUser?.email });
    setCards((prev) => prev.filter((c) => c.id.toLowerCase() !== id.toLowerCase()));
  };

  const handleToggleAiReview = async (id: string, enabled: boolean) => {
    await handleAssignCard(id, { aiReviewEnabled: enabled });
  };

  const handleBulkUpdateStatus = async (ids: string[], newStatus: 'available' | 'assigned') => {
    await bulkUpdateCardsStatus(ids, newStatus, effectiveActiveAdmin.id, currentUser?.email);
    setCards((prev) =>
      prev.map((c) =>
        ids.some((id) => id.toLowerCase() === c.id.toLowerCase())
          ? {
              ...c,
              status: newStatus,
              updatedAt: new Date().toISOString(),
            }
          : c
      )
    );
  };

  const handleOpenCustomerPreview = (card: CardRecord) => {
    setSimulatorCardId(card.id);
  };

  const handleSaveAdmin = async (adminData: Partial<AdminUser>) => {
    const caller = { id: effectiveActiveAdmin.id, email: currentUser?.email };
    if (adminData.id) {
      const existingHint = admins.find(
        (a) => a.id === adminData.id || a.email.toLowerCase().trim() === (adminData.email || '').toLowerCase().trim()
      );
      const updated = await updateAdmin(adminData.id, adminData, caller, existingHint);
      if (updated) {
        const nextEmailLower = updated.email.toLowerCase().trim();
        const prevEmailLower = (existingHint?.email || updated.email).toLowerCase().trim();
        const nextSet = new Set((updated.assignedCardIds || []).map((cid) => cid.toLowerCase()));
        setAdmins((prev) => {
          const exists = prev.some((a) => a.id === updated.id);
          const list = exists
            ? prev.map((a) => (a.id === updated.id ? updated : a))
            : [...prev.filter((a) => a.email.toLowerCase().trim() !== nextEmailLower), updated];
          // Reflect exclusive card reassignment immediately in local state
          if (updated.role === 'restricted' && nextSet.size > 0) {
            return list.map((a) =>
              a.id !== updated.id && a.role === 'restricted'
                ? { ...a, assignedCardIds: (a.assignedCardIds || []).filter((cid) => !nextSet.has(cid.toLowerCase())) }
                : a
            );
          }
          return list;
        });
        if (activeAdmin && activeAdmin.id === updated.id) {
          setActiveAdmin(updated);
        }
        setUsers((prev) =>
          prev.map((u) => {
            const uEmail = u.email.toLowerCase().trim();
            if (uEmail === nextEmailLower || u.uid === updated.id) {
              return {
                ...u,
                role: updated.role,
                assignedCardIds: updated.assignedCardIds,
                accessRevoked: false,
                revokedAt: undefined,
              };
            }
            if (prevEmailLower !== nextEmailLower && uEmail === prevEmailLower) {
              return {
                ...u,
                role: 'member',
                assignedCardIds: [],
              };
            }
            if (updated.role === 'restricted' && nextSet.size > 0 && Array.isArray(u.assignedCardIds)) {
              return {
                ...u,
                assignedCardIds: u.assignedCardIds.filter((cid) => !nextSet.has(cid.toLowerCase())),
              };
            }
            return u;
          })
        );
        setCards((prev) =>
          prev.map((c) => {
            if (updated.role === 'restricted' && nextSet.has(c.id.toLowerCase())) {
              return {
                ...c,
                assignedToEmail: nextEmailLower,
                assignedToUid: updated.id,
                assignedToName: updated.name,
                updatedAt: updated.updatedAt,
              };
            }
            if (!nextSet.has(c.id.toLowerCase())) {
              const cEmail = (c.assignedToEmail || '').trim().toLowerCase();
              const cUid = (c.assignedToUid || '').trim();
              if (cEmail === prevEmailLower || cEmail === nextEmailLower || cUid === updated.id) {
                return {
                  ...c,
                  assignedToEmail: undefined,
                  assignedToUid: undefined,
                  assignedToName: undefined,
                  updatedAt: updated.updatedAt,
                };
              }
            }
            return c;
          })
        );
      }
    } else {
      const created = await createAdmin(adminData, caller);
      if (created) {
        const createdEmailLower = created.email.toLowerCase().trim();
        const createdSet = new Set((created.assignedCardIds || []).map((cid) => cid.toLowerCase()));
        setAdmins((prev) => {
          const base = prev.filter((a) => a.email.toLowerCase().trim() !== createdEmailLower);
          const stripped =
            created.role === 'restricted' && createdSet.size > 0
              ? base.map((a) =>
                  a.role === 'restricted'
                    ? { ...a, assignedCardIds: (a.assignedCardIds || []).filter((cid) => !createdSet.has(cid.toLowerCase())) }
                    : a
                )
              : base;
          return [...stripped, created];
        });
        setUsers((prev) =>
          prev.map((u) =>
            u.email.toLowerCase().trim() === createdEmailLower
              ? {
                  ...u,
                  role: created.role,
                  assignedCardIds: created.assignedCardIds,
                  accessRevoked: false,
                  revokedAt: undefined,
                }
              : u
          )
        );
      }
    }
    lastRefreshAtRef.current = 0;
    await Promise.all([
      loadAdminsData(currentUser),
      loadUsersData(),
      loadAdminRequestsData({ id: effectiveActiveAdmin.id, email: currentUser?.email }),
    ]);
  };

  const handleDeleteAdmin = async (adminId: string) => {
    const caller = { id: effectiveActiveAdmin.id, email: currentUser?.email };
    await deleteAdmin(adminId, caller);
    const remaining = admins.filter((a) => a.id !== adminId);
    setAdmins(remaining);
    if (activeAdmin && activeAdmin.id === adminId) {
      const master =
        remaining.find((a) => a.role === 'master' || a.email.toLowerCase() === '66shashwatkumar66@gmail.com') ||
        DEFAULT_MASTER_ADMIN;
      setActiveAdmin(master);
      localStorage.removeItem('3dbysd_impersonated_admin_id');
    }
    lastRefreshAtRef.current = 0;
    await Promise.all([
      loadAdminsData(currentUser),
      loadUsersData(),
      loadAdminRequestsData({ id: effectiveActiveAdmin.id, email: currentUser?.email }),
    ]);
  };

  const handleApproveAdminRequest = async (reqUser: UserProfile) => {
    const caller = { id: effectiveActiveAdmin.id, email: currentUser?.email };
    await approveAdminRequest(reqUser, caller);
    lastRefreshAtRef.current = 0;
    await Promise.all([
      loadAdminsData(currentUser),
      loadUsersData(),
      loadAdminRequestsData(caller),
    ]);
  };

  const handleRejectAdminRequest = async (reqUser: UserProfile) => {
    const caller = { id: effectiveActiveAdmin.id, email: currentUser?.email };
    await rejectAdminRequest(reqUser, caller);
    lastRefreshAtRef.current = 0;
    await Promise.all([
      loadAdminsData(currentUser),
      loadUsersData(),
      loadAdminRequestsData(caller),
    ]);
  };

  const handleSubmitAccessRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || submittingRequest) return;
    setSubmittingRequest(true);
    setRequestSubmitFeedback(null);
    try {
      const saved = await submitAdminAccessRequest({
        uid: currentUser.uid,
        email: currentUser.email,
        displayName: currentUser.displayName,
        photoURL: currentUser.photoURL,
        note: requestNoteInput,
      });
      setCurrentUser((prev) => {
        const next = prev
          ? {
              ...prev,
              requestStatus: saved.requestStatus,
              requestedAt: saved.requestedAt,
              requestUpdatedAt: saved.requestUpdatedAt,
              requestNote: saved.requestNote,
            }
          : prev;
        if (next) localStorage.setItem('3dbysd_current_user', JSON.stringify(next));
        return next;
      });
      setSessionAuth((prev) =>
        prev
          ? {
              ...prev,
              requestStatus: saved.requestStatus,
              requestedAt: saved.requestedAt,
              requestUpdatedAt: saved.requestUpdatedAt,
              requestNote: saved.requestNote,
            }
          : {
              authorized: false,
              revoked: false,
              role: 'member',
              requestStatus: saved.requestStatus,
              requestedAt: saved.requestedAt,
              requestUpdatedAt: saved.requestUpdatedAt,
              requestNote: saved.requestNote,
            }
      );
      setRequestNoteInput('');
      setRequestSubmitFeedback({
        type: 'success',
        text: 'Your Sub-Admin access request has been saved and sent to the Master Administrator for approval.',
      });
    } catch (err: any) {
      setRequestSubmitFeedback({
        type: 'error',
        text: formatApiError(err, 'Failed to submit Sub-Admin access request.'),
      });
    } finally {
      setSubmittingRequest(false);
    }
  };

  const handleRetryCustomerLookup = () => {
    if (customerCardId) {
      setCustomerLoadState('loading');
      setCustomerErrorMessage(null);
      fetchCustomerCard(customerCardId, false);
    }
  };

  // If viewing customer URL directly (e.g. /r/0001)
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
          // Reset pathname and view admin
          window.history.pushState({}, '', '/');
          setCustomerCardId(null);
          setCustomerCard(null);
          if (currentUser?.email) {
            loadCards(currentUser);
          }
        }}
      />
    );
  }

  // Google Authentication Gateway: Protected access
  if (!currentUser) {
    return (
      <AuthGateway
        initialError={authRevokedNotice}
        onLoginSuccess={(user) => {
          setAuthRevokedNotice(null);
          setAuthStatusFeedback(null);
          setSessionAuth({
            authorized: user.role === 'master' || user.role === 'restricted',
            revoked: Boolean(user.accessRevoked),
            role: user.role,
          });
          setCurrentUser(user);
          localStorage.setItem('3dbysd_current_user', JSON.stringify(user));
          refreshAuthorization({ force: true, userOverride: user, quiet: false });
        }}
        onPreviewCard={(id) => {
          setCustomerCardId(id);
        }}
      />
    );
  }

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.warn('Sign out failed:', e);
    } finally {
      clearSessionCaches();
      setCurrentUser(null);
      setActiveAdmin(null);
      setSessionAuth(null);
      setCards([]);
      setAdmins([]);
      setUsers([]);
      setSimulatorCardId(null);
      setCardToAssign(null);
    }
  };

  const cleanUserEmail = currentUser.email.trim().toLowerCase();

  // Master Admin check: STRICTLY ONLY for the email 66shashwatkumar66@gmail.com
  const isMasterUser = cleanUserEmail === '66shashwatkumar66@gmail.com';

  // Check if authorized as an admin/sub-admin by Master Admin
  const authorizedAdmin =
    admins.find((a) => a.email.trim().toLowerCase() === cleanUserEmail || a.id === currentUser.uid) ||
    (sessionAuth?.authorized && sessionAuth.admin ? sessionAuth.admin : undefined);

  // Check if user's admin access was explicitly revoked
  const currentUserProfile = users.find(
    (u) => u.email.trim().toLowerCase() === cleanUserEmail || u.uid === currentUser.uid
  );
  const isRevokedUser =
    !isMasterUser &&
    Boolean(
      sessionAuth?.revoked ||
        (!sessionAuth?.authorized && !authorizedAdmin && currentUserProfile?.accessRevoked)
    );

  const isAuthorizedUserRole =
    !isRevokedUser &&
    ((currentUserProfile && (currentUserProfile.role === 'restricted' || currentUserProfile.role === 'master')) ||
      (sessionAuth?.authorized && (sessionAuth.role === 'restricted' || sessionAuth.role === 'master')));

  // Wait for Firebase Auth + admin synchronization before rendering Access Pending Authorization
  if (!isMasterUser && !isRevokedUser && !authorizedAdmin && !isAuthorizedUserRole && (!authReady || !adminsSynced)) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-lg text-center space-y-3 max-w-sm w-full">
          <div className="inline-block w-8 h-8 border-2 border-[#1A73E8] border-t-transparent rounded-full animate-spin mx-auto" />
          <div className="text-sm font-bold text-slate-900">Verifying Account Authorization...</div>
          <p className="text-xs text-slate-500 font-mono truncate">{currentUser.email}</p>
        </div>
      </div>
    );
  }

  // Check if user has allocated cards as a client merchant (only when access is not revoked)
  const userAllocatedCards = isRevokedUser
    ? []
    : cards.filter((c) => {
        const userUid = currentUser.uid;
        return (
          (c.assignedToEmail && c.assignedToEmail.trim().toLowerCase() === cleanUserEmail) ||
          (c.assignedToUid && c.assignedToUid === userUid)
        );
      });

  // Strict Role-Based Access Control (UBRA):
  // Block revoked accounts OR unauthorized Viewers with 0 allocated cards.
  // Verified Sub-Admins (0 or more assigned cards) enter the dashboard cleanly.
  if (!isMasterUser && (isRevokedUser || (!authorizedAdmin && !isAuthorizedUserRole && userAllocatedCards.length === 0))) {
    const effectiveRequestStatus =
      sessionAuth?.requestStatus || currentUserProfile?.requestStatus || currentUser.requestStatus;
    const effectiveRequestedAt =
      sessionAuth?.requestedAt || currentUserProfile?.requestedAt || currentUser.requestedAt;

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
              onClick={handleSignOut}
              className="text-xs font-semibold text-slate-600 hover:text-red-600 flex items-center gap-1 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </header>

        <main className="max-w-md w-full mx-auto px-4 py-10 flex flex-col justify-center space-y-5 flex-1">
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xl text-center space-y-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto border ${
              isRevokedUser || effectiveRequestStatus === 'rejected'
                ? 'bg-red-50 text-red-600 border-red-200'
                : 'bg-amber-50 text-amber-600 border-amber-200'
            }`}>
              <Lock className={`w-7 h-7 ${isRevokedUser || effectiveRequestStatus === 'rejected' ? 'text-red-600' : 'text-amber-600'}`} />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-lg font-extrabold text-slate-900">
                {isRevokedUser
                  ? 'Administrator Access Revoked'
                  : effectiveRequestStatus === 'rejected'
                  ? 'Access Request Rejected'
                  : 'Access Pending Authorization'}
              </h2>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-mono font-medium">
                  <span>{currentUser.email}</span>
                </div>
                {!isRevokedUser && effectiveRequestStatus === 'pending' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold">
                    Pending Approval
                  </span>
                )}
                {!isRevokedUser && effectiveRequestStatus === 'rejected' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-red-700 text-[11px] font-bold">
                    Rejected
                  </span>
                )}
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {isRevokedUser ? (
                <>
                  Your administrator access has been revoked by the <strong>Master Administrator</strong>. You no longer have access to the admin portal or protected management resources.
                </>
              ) : effectiveRequestStatus === 'pending' ? (
                <>
                  Your Google account has submitted a <strong>Sub-Admin access request</strong>
                  {effectiveRequestedAt ? ` on ${new Date(effectiveRequestedAt).toLocaleString()}` : ''}.
                  Once the <strong>Master Administrator</strong> approves your request, this page will unlock automatically.
                </>
              ) : effectiveRequestStatus === 'rejected' ? (
                <>
                  Your previous Sub-Admin access request was rejected by the <strong>Master Administrator</strong>. You can contact the Master Admin or submit a new request below.
                </>
              ) : (
                <>
                  This management portal is protected by <strong>Strict Role-Based Access Control (UBRA)</strong>.
                  Your Google account is not yet authorized as an administrator, and no QR/NFC stands have been allocated to your email.
                </>
              )}
            </p>

            {!isRevokedUser && (
              <form
                onSubmit={handleSubmitAccessRequest}
                className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-left text-xs text-slate-600 space-y-2.5"
              >
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#1A73E8]" />
                  <span>
                    {effectiveRequestStatus === 'pending'
                      ? 'Update Request Note (Optional)'
                      : effectiveRequestStatus === 'rejected'
                      ? 'Re-submit Sub-Admin Access Request'
                      : 'Request Sub-Admin Access'}
                  </span>
                </div>
                <input
                  type="text"
                  value={requestNoteInput}
                  onChange={(e) => setRequestNoteInput(e.target.value)}
                  maxLength={250}
                  placeholder="Optional note (e.g. your business or stand location)"
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
                />
                <button
                  type="submit"
                  disabled={submittingRequest}
                  className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {submittingRequest
                    ? 'Submitting Request...'
                    : effectiveRequestStatus === 'pending'
                    ? 'Update Access Request'
                    : effectiveRequestStatus === 'rejected'
                    ? 'Re-submit Admin Access Request'
                    : 'Request Admin Access'}
                </button>
              </form>
            )}

            {requestSubmitFeedback && (
              <div
                className={`p-2.5 rounded-xl text-[11px] font-medium border ${
                  requestSubmitFeedback.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}
              >
                {requestSubmitFeedback.text}
              </div>
            )}

            {authStatusFeedback && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 font-medium">
                {authStatusFeedback}
              </div>
            )}

            <div className="pt-1 flex flex-col gap-2">
              {!isRevokedUser && (
                <button
                  type="button"
                  disabled={checkingAuthStatus}
                  onClick={() => refreshAuthorization({ force: true, quiet: true, showFeedback: true, fresh: true })}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checkingAuthStatus ? 'animate-spin' : ''}`} />
                  <span>{checkingAuthStatus ? 'Checking Authorization...' : 'Check Authorization Status'}</span>
                </button>
              )}
              <button
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

  const masterAdmin =
    admins.find((a) => a.role === 'master' || a.email.trim().toLowerCase() === '66shashwatkumar66@gmail.com') ||
    DEFAULT_MASTER_ADMIN;

  const promotedAdminFallback: AdminUser | null = isAuthorizedUserRole
    ? {
        id: currentUserProfile?.uid || currentUser.uid,
        email: cleanUserEmail,
        name: currentUserProfile?.displayName || currentUser.displayName || cleanUserEmail,
        role:
          currentUserProfile?.role === 'master' || sessionAuth?.role === 'master'
            ? 'master'
            : 'restricted',
        assignedCardIds:
          currentUserProfile?.assignedCardIds ||
          sessionAuth?.admin?.assignedCardIds ||
          currentUser.assignedCardIds ||
          [],
        permissions: {
          canEditCards: true,
          canToggleAi: true,
          canExportCsv: false,
          canCreateCards: false,
        },
        createdAt: currentUserProfile?.createdAt || currentUser.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    : null;

  const syntheticMerchantAdmin: AdminUser = {
    id: currentUser.uid,
    email: cleanUserEmail,
    name: currentUser.displayName || currentUser.email,
    role: 'restricted',
    assignedCardIds: userAllocatedCards.map((c) => c.id),
    permissions: {
      canEditCards: true,
      canToggleAi: true,
      canExportCsv: false,
      canCreateCards: false,
    },
    createdAt: currentUser.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Strict non-master fallback: NEVER fall back to DEFAULT_MASTER_ADMIN for non-master users!
  const effectiveActiveAdmin: AdminUser = isMasterUser
    ? (activeAdmin || masterAdmin)
    : (authorizedAdmin || promotedAdminFallback || syntheticMerchantAdmin);

  // Check if Master Admin is currently testing or impersonating Sub-Admin mode
  const isInSubAdminMode = Boolean(isMasterUser && effectiveActiveAdmin.role === 'restricted');

  // Strict Role-Based Access Control (UBRA):
  // When in Sub-Admin mode, user experiences the restricted sub-admin view and limited card set
  const isMaster = (isMasterUser || effectiveActiveAdmin.role === 'master') && !isInSubAdminMode;

  const displayedCards = isMaster
    ? cards
    : cards.filter((c) => {
        const userUid = currentUser.uid;
        const adminEmail = effectiveActiveAdmin?.email?.trim().toLowerCase() || cleanUserEmail;
        const adminAssigned = effectiveActiveAdmin?.assignedCardIds || [];
        const isDirectOwner =
          (c.assignedToEmail &&
            (c.assignedToEmail.trim().toLowerCase() === cleanUserEmail ||
              c.assignedToEmail.trim().toLowerCase() === adminEmail)) ||
          (c.assignedToUid && (c.assignedToUid === userUid || c.assignedToUid === effectiveActiveAdmin?.id));
        const isInAdminAssigned =
          effectiveActiveAdmin?.role === 'restricted' &&
          adminAssigned.some((aid) => areCardIdsEqual(aid, c.id));
        return Boolean(isDirectOwner || isInAdminAssigned);
      });

  const assignedCount = displayedCards.filter((c) => c.status === 'assigned').length;
  const availableCount = displayedCards.filter((c) => c.status === 'available').length;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col w-full max-w-full overflow-x-hidden min-w-0">
      {/* Top Admin Navigation */}
      <AdminHeader
        currentTab={currentTab}
        onSelectTab={(tab) => {
          if (!isMaster && ['admins', 'users', 'ads'].includes(tab)) {
            return;
          }
          if (tab === 'simulator') {
            if (displayedCards.length > 0) {
              setSimulatorCardId(displayedCards[0].id);
            }
          } else {
            setCurrentTab(tab);
          }
        }}
        onOpenBatchModal={() => {
          if (isMaster) setIsBatchModalOpen(true);
        }}
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

      {/* Main Admin Workspace Viewport - Optimized container for PC and mobile */}
      <main className="flex-1 max-w-5xl lg:max-w-6xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-5 max-w-full overflow-x-hidden min-w-0">
        {/* Firebase Session Sync Notice (when Master Admin signed in via local fallback without live Google OAuth token) */}
        {authReady && isMaster && !firebaseAuthActive && (
          <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-2xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <AlertCircle className="w-4 h-4 text-[#1A73E8] shrink-0" />
              <span className="text-blue-950 font-medium">
                Firebase Google Auth session is not active on this browser. Sign out and use <strong>Sign in with Google</strong> to enable live Firestore cloud sync across devices.
              </span>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="px-3 py-1.5 rounded-xl bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-bold shrink-0 self-start sm:self-auto cursor-pointer"
            >
              Sign in with Google
            </button>
          </div>
        )}

        {/* Restricted Admin Notice Banner if logged in as sub-admin or in Sub-Admin Mode */}
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
                    {effectiveActiveAdmin.assignedCardIds.length} Cards
                  </span>
                </div>
                <p className="text-amber-800 text-[11px] mt-0.5 truncate">
                  Testing restricted sub-admin view. Authorized cards:{' '}
                  {effectiveActiveAdmin.assignedCardIds.length > 0
                    ? `[${effectiveActiveAdmin.assignedCardIds.map((id) => `#${id}`).join(', ')}]`
                    : 'None assigned yet'}
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
              onClick={() => {
                if (displayedCards[0]) setSimulatorCardId(displayedCards[0].id);
              }}
              disabled={displayedCards.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-bold transition-all shadow-sm shadow-blue-500/25 active:scale-95 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Phone Preview</span>
            </button>
          </div>
        </div>

        {/* Summary Stats Overview Widget */}
        <AdminStatsWidget
          cards={displayedCards}
          onPreviewCard={handleOpenCustomerPreview}
          onViewLogs={() => {
            setLogStandFilter('all');
            setCurrentTab('logs');
          }}
        />

        {/* Tab: QR Scan Logs & Telemetry */}
        {currentTab === 'logs' && (
          <QrScanLogsView
            activeAdmin={effectiveActiveAdmin}
            cards={displayedCards}
            onPreviewCard={handleOpenCustomerPreview}
            initialCardFilter={logStandFilter}
          />
        )}

        {/* Tab 1: Cards Inventory */}
        {currentTab === 'cards' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-lg font-bold text-slate-900">
                  {isMaster ? 'Card Inventory & Assignments' : `My Assigned Cards (${displayedCards.length})`}
                </h1>
                <p className="text-xs text-slate-500">
                  {isMaster
                    ? 'Manage physical card IDs, connect Google Review profiles, and configure AI settings'
                    : effectiveActiveAdmin.assignedCardIds.length > 0
                    ? `Managing authorized cards: ${effectiveActiveAdmin.assignedCardIds.map((id) => `#${id}`).join(', ')}`
                    : 'No QR cards assigned yet'}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Keywords Customizer quick access */}
                <button
                  type="button"
                  onClick={() => setCurrentTab('customizer')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl shadow-2xs transition-colors cursor-pointer"
                  title="Customize Review Page Keywords & Tags"
                >
                  <Sliders className="w-3.5 h-3.5 text-purple-600" />
                  <span>Review Customizer</span>
                </button>

                {/* NFC Generator & Flasher quick access */}
                <button
                  type="button"
                  onClick={() => setCurrentTab('nfc')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl shadow-2xs transition-colors cursor-pointer ring-1 ring-purple-300/60"
                  title="Open NFC Chip URL Generator & Hardware Flasher"
                >
                  <Radio className="w-3.5 h-3.5 text-purple-600 animate-pulse" />
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

            {loading ? (
              <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
                <div className="inline-block w-6 h-6 border-2 border-slate-900 border-t-transparent rounded-full animate-spin mb-2" />
                <p className="text-xs text-slate-500">Loading cards...</p>
              </div>
            ) : displayedCards.length === 0 && !isMaster ? (
              <div className="p-8 bg-white rounded-2xl border border-slate-200 text-center space-y-3 shadow-xs">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
                  <Building2 className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-900">No QR Cards Assigned</h3>
                <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
                  No QR cards have been assigned to your account yet. Contact the Master Admin.
                </p>
              </div>
            ) : (
              <CardsTable
                cards={displayedCards}
                onAssignCard={(card) => setCardToAssign(card)}
                onDeleteCard={isMaster ? handleDeleteCard : () => {}}
                onPreviewCard={handleOpenCustomerPreview}
                onOpenBatchModal={() => {
                  if (isMaster) setIsBatchModalOpen(true);
                }}
                onToggleAiReview={
                  isMaster || effectiveActiveAdmin.permissions?.canToggleAi
                    ? handleToggleAiReview
                    : undefined
                }
                onBulkUpdateStatus={handleBulkUpdateStatus}
                onOpenNfcGenerator={() => setCurrentTab('nfc')}
                onOpenCustomizer={() => setCurrentTab('customizer')}
                activeAdmin={effectiveActiveAdmin}
                onViewLogs={(cardId) => {
                  setLogStandFilter(cardId);
                  setCurrentTab('logs');
                }}
              />
            )}
          </div>
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

        {/* Tab 2: Print Sheets */}
        {currentTab === 'print' && <PrintSheetView cards={displayedCards} />}

        {/* Tab 3: NFC URL Generator */}
        {currentTab === 'nfc' && (
          <NfcGeneratorView
            cards={displayedCards}
            activeAdmin={effectiveActiveAdmin}
            isMaster={isMaster}
            callerEmail={currentUser.email}
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

        {/* Tab 4: Master Admin Management */}
        {currentTab === 'admins' && isMaster && (
          <MasterAdminView
            cards={cards}
            admins={admins}
            activeAdmin={effectiveActiveAdmin}
            onSelectActiveAdmin={handleSelectActiveAdmin}
            onSaveAdmin={handleSaveAdmin}
            onDeleteAdmin={handleDeleteAdmin}
            onRefreshCards={loadCards}
            adminRequests={adminRequests}
            onApproveRequest={handleApproveAdminRequest}
            onRejectRequest={handleRejectAdminRequest}
          />
        )}

        {/* Tab 5: Google Verified Users & Logins */}
        {currentTab === 'users' && isMaster && (
          <UsersManagementView
            activeAdmin={effectiveActiveAdmin}
            callerEmail={currentUser.email}
            onRefreshAdmins={() => refreshAuthorization({ force: true, quiet: true })}
          />
        )}

        {/* Tab 6: Master Admin Advertisement Management */}
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

      {/* Batch Generator Modal (Master Admin Only) */}
      {isMaster && (
        <BatchGeneratorModal
          isOpen={isBatchModalOpen}
          onClose={() => setIsBatchModalOpen(false)}
          existingCards={cards}
          onGenerateBatch={handleGenerateBatch}
        />
      )}

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
          cards={displayedCards}
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
          if (!isMaster && ['admins', 'users', 'ads'].includes(tab)) {
            return;
          }
          if (tab === 'simulator') {
            if (displayedCards.length > 0) {
              setSimulatorCardId(displayedCards[0].id);
            }
          } else {
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
        onOpenBatchModal={() => {
          if (isMaster) setIsBatchModalOpen(true);
        }}
        onExportCsv={() => exportCardsToCsv(displayedCards)}
      />
    </div>
  );
}
