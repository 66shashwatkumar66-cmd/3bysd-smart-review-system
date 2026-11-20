import { CardRecord, AdminUser, UserProfile, QRScanLog, GenerateReviewRequest, GenerateReviewResponse } from '../types';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  getDocFromServer,
  setDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';

const STORAGE_KEY = '3dbysd_smart_reviews_cards';
const CARDS_COLLECTION = 'cards';

export function clearSessionCaches(): void {
  try {
    localStorage.removeItem('3dbysd_current_user');
    localStorage.removeItem('3dbysd_impersonated_admin_id');
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('3dbysd_smart_reviews_admins');
    localStorage.removeItem('3dbysd_smart_reviews_users');
  } catch {
    // ignore
  }
}

export function formatApiError(err: unknown, fallback: string = 'An unexpected error occurred.'): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  const trimmed = raw.trim();
  if (!trimmed) return fallback;

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed.error === 'string') {
        const op = parsed.operationType ? String(parsed.operationType) : 'write';
        const path = parsed.path ? ` on ${parsed.path}` : '';
        if (parsed.error.toLowerCase().includes('permission-denied') || parsed.error.toLowerCase().includes('insufficient permissions')) {
          return `Firestore permission denied during ${op}${path}. Verify you are signed in with Google as Master Admin.`;
        }
        return `Database ${op} error${path}: ${parsed.error}`;
      }
    } catch {
      // fall through
    }
  }

  return trimmed;
}

/**
 * Returns true ONLY when the Express REST backend is absent/unreachable (e.g. static or Firebase-only
 * deployment returning HTML 404/405/502/503 instead of our Express JSON API).
 * Real Express JSON errors (400 validation, 401/403 RBAC, 500 server error) always return false.
 */
function isStaticBackendUnavailable(res: Response): boolean {
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (res.status === 405 || res.status === 502 || res.status === 503 || res.status === 504) {
    return !ct.includes('application/json');
  }
  if (res.status === 404 && !ct.includes('application/json')) {
    return true;
  }
  return false;
}

/**
 * Deeply removes all keys with `undefined` or `null` values.
 * Firestore strictly rejects documents containing undefined values with:
 * "FirebaseError: Function setDoc() called with invalid data. Unsupported field value: undefined"
 * and strict security rules reject null values for string fields.
 */
export function cleanForFirestore<T extends Record<string, any>>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) =>
      typeof item === 'object' && item !== null ? cleanForFirestore(item) : item
    ) as any;
  }
  const clean: any = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined || val === null) {
      continue;
    }
    if (typeof val === 'object' && !Array.isArray(val)) {
      clean[key] = cleanForFirestore(val);
    } else {
      clean[key] = val;
    }
  }
  return clean;
}

const INITIAL_CARDS: CardRecord[] = [
  {
    id: '0001',
    status: 'assigned',
    businessName: 'The Artisan Roastery & Bakery',
    category: 'Specialty Coffee & Brunch',
    googleReviewUrl: 'https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4',
    notes: 'Table 4 Stand - NFC & QR display',
    aiReviewEnabled: true,
    scansCount: 42,
    createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: '0002',
    status: 'assigned',
    businessName: 'SD Wood-Fired Pizzeria',
    category: 'Italian Restaurant',
    googleReviewUrl: 'https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4',
    notes: 'Host stand entrance',
    aiReviewEnabled: true,
    scansCount: 19,
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: '0003',
    status: 'available',
    businessName: '',
    category: '',
    googleReviewUrl: '',
    notes: 'Batch #1 - Unassigned acrylic stand',
    scansCount: 0,
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: '0004',
    status: 'available',
    businessName: '',
    category: '',
    googleReviewUrl: '',
    notes: 'Batch #1 - Unassigned keychain badge',
    scansCount: 0,
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export interface CallerIdentity {
  id?: string;
  email?: string;
  uid?: string;
  role?: 'master' | 'restricted' | 'member';
  assignedCardIds?: string[];
}

function isCardExplicitlyAssignedToCaller(card: CardRecord, caller?: CallerIdentity): boolean {
  if (!caller) return false;
  const cleanEmail = caller.email?.trim().toLowerCase() || '';
  const cleanIds = [caller.id, caller.uid].filter((v): v is string => Boolean(v && v.trim()));
  const cardIdLower = card.id.toLowerCase();

  const inAssignedList =
    Array.isArray(caller.assignedCardIds) &&
    caller.assignedCardIds.some((cid) => cid.toLowerCase() === cardIdLower);
  const emailMatch = Boolean(cleanEmail) && card.assignedToEmail?.trim().toLowerCase() === cleanEmail;
  const uidMatch = Boolean(card.assignedToUid) && cleanIds.includes(card.assignedToUid!.trim());

  return inAssignedList || emailMatch || uidMatch;
}

export async function fetchCards(caller?: CallerIdentity): Promise<CardRecord[]> {
  const cleanEmail = caller?.email?.trim().toLowerCase() || '';
  const isMasterCaller =
    cleanEmail === PRIMARY_MASTER_EMAIL || caller?.role === 'master';

  if (!caller || (!isMasterCaller && !cleanEmail && !caller.id && !caller.uid && !caller.assignedCardIds?.length)) {
    return [];
  }

  let firestoreCards: CardRecord[] = [];
  let firestoreQueriedSuccessfully = false;
  if (isMasterCaller) {
    try {
      const colRef = collection(db, CARDS_COLLECTION);
      const snapshot = await getDocs(colRef);
      firestoreQueriedSuccessfully = true;

      if (!snapshot.empty) {
        snapshot.forEach((docSnap) => {
          firestoreCards.push(docSnap.data() as CardRecord);
        });
        firestoreCards.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
      } else {
        // Seed initial cards to Firestore only when initialized by Master Admin
        for (const card of INITIAL_CARDS) {
          await setDoc(doc(db, CARDS_COLLECTION, card.id), cleanForFirestore(card));
        }
        firestoreCards = [...INITIAL_CARDS];
      }
    } catch (error) {
      console.warn('Firestore fetch failed, attempting server API fallback:', error);
    }
  } else if (auth.currentUser) {
    // Restricted Sub-Admin or member: ONLY fetch explicitly assigned card IDs or owner-matched docs
    const fetchedMap = new Map<string, CardRecord>();
    const explicitIds = Array.from(new Set((caller.assignedCardIds || []).map((id) => id.trim()).filter(Boolean)));
    const colRef = collection(db, CARDS_COLLECTION);
    const scopedQueries: Promise<any>[] = explicitIds.map((cid) =>
      getDoc(doc(db, CARDS_COLLECTION, cid)).then((snap) => ({ kind: 'doc' as const, snap }))
    );
    const authEmail = auth.currentUser.email?.trim() || '';
    if (cleanEmail) {
      scopedQueries.push(
        getDocs(query(colRef, where('assignedToEmail', '==', cleanEmail))).then((snap) => ({ kind: 'query' as const, snap }))
      );
    }
    if (authEmail && authEmail !== cleanEmail) {
      scopedQueries.push(
        getDocs(query(colRef, where('assignedToEmail', '==', authEmail))).then((snap) => ({ kind: 'query' as const, snap }))
      );
    }
    scopedQueries.push(
      getDocs(query(colRef, where('assignedToUid', '==', auth.currentUser.uid))).then((snap) => ({ kind: 'query' as const, snap }))
    );

    const queryResults = await Promise.allSettled(scopedQueries);
    for (const res of queryResults) {
      if (res.status === 'fulfilled') {
        firestoreQueriedSuccessfully = true;
        if (res.value.kind === 'doc') {
          if (res.value.snap.exists()) {
            const cardData = res.value.snap.data() as CardRecord;
            fetchedMap.set(cardData.id.toLowerCase(), cardData);
          }
        } else {
          res.value.snap.forEach((docSnap: any) => {
            const cardData = docSnap.data() as CardRecord;
            fetchedMap.set(cardData.id.toLowerCase(), cardData);
          });
        }
      }
    }
    firestoreCards = Array.from(fetchedMap.values());
  }

  // Also query local server REST API with caller headers
  let serverCards: CardRecord[] = [];
  let serverSucceeded = false;
  try {
    const headers: Record<string, string> = {};
    const callerId = caller.id || caller.uid;
    if (callerId) headers['x-admin-id'] = callerId;
    if (cleanEmail) headers['x-admin-email'] = cleanEmail;

    const res = await fetch('/api/cards', { headers });
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (res.ok && ct.includes('application/json')) {
      const data = await res.json();
      if (data.cards && Array.isArray(data.cards)) {
        serverSucceeded = true;
        serverCards = data.cards;
      }
    }
  } catch (err) {
    console.warn('Network fetch failed, using Firestore/local state:', err);
  }

  if (firestoreQueriedSuccessfully || firestoreCards.length > 0 || serverCards.length > 0 || serverSucceeded) {
    const mergedMap = new Map<string, CardRecord>();

    for (const c of serverCards) {
      // Strictly re-filter serverCards for non-master callers so stale server cache never leaks unassigned/reassigned cards
      if (!isMasterCaller && !isCardExplicitlyAssignedToCaller(c, caller)) {
        continue;
      }
      mergedMap.set(c.id.toLowerCase(), c);
    }

    for (const fc of firestoreCards) {
      if (!isMasterCaller && !isCardExplicitlyAssignedToCaller(fc, caller)) {
        continue;
      }
      const existing = mergedMap.get(fc.id.toLowerCase());
      if (!existing) {
        if (isMasterCaller || !serverSucceeded || isCardExplicitlyAssignedToCaller(fc, caller)) {
          mergedMap.set(fc.id.toLowerCase(), fc);
        }
      } else {
        const fcTime = fc.updatedAt ? new Date(fc.updatedAt).getTime() : 0;
        const exTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
        if (fcTime >= exTime) {
          mergedMap.set(fc.id.toLowerCase(), fc);
        } else if (isMasterCaller) {
          setDoc(doc(db, CARDS_COLLECTION, existing.id), cleanForFirestore(existing)).catch(() => {});
        }
      }
    }

    const mergedList = Array.from(mergedMap.values());
    mergedList.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mergedList));
    return mergedList;
  }

  // Fallback to localStorage ONLY when both Firestore and Express were completely unreachable (never leak INITIAL_CARDS)
  const cached = localStorage.getItem(STORAGE_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as CardRecord[];
      if (isMasterCaller) return parsed;
      return parsed.filter((c) => isCardExplicitlyAssignedToCaller(c, caller));
    } catch {
      // ignore
    }
  }
  return isMasterCaller ? INITIAL_CARDS : [];
}

import { lookupCard } from './cardLookup';

export async function fetchCardById(id: string, recordScan: boolean = false): Promise<CardRecord | null> {
  const result = await lookupCard(id, { recordScan });
  return result.card;
}

export async function createBatchCards(
  payload: {
    count: number;
    startNumber: number;
    paddingDigits: number;
    prefix?: string;
  },
  caller?: CallerIdentity
): Promise<CardRecord[]> {
  const currentCards = await fetchCards(caller);
  const existingIds = new Set(currentCards.map((c) => c.id));
  const newCards: CardRecord[] = [];

  let current = payload.startNumber;
  while (newCards.length < payload.count) {
    const padded = String(current).padStart(payload.paddingDigits, '0');
    const id = payload.prefix ? `${payload.prefix}-${padded}` : padded;

    if (!existingIds.has(id)) {
      const card: CardRecord = {
        id,
        status: 'available',
        businessName: '',
        category: '',
        googleReviewUrl: '',
        notes: `Batch created ${new Date().toLocaleDateString()}`,
        scansCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      newCards.push(card);
      existingIds.add(id);
    }
    current++;
  }

  // Write to Firestore with sanitization (confirmed when signed in)
  let firestoreConfirmed = false;
  if (auth.currentUser) {
    try {
      const batch = writeBatch(db);
      for (const card of newCards) {
        batch.set(doc(db, CARDS_COLLECTION, card.id), cleanForFirestore(card));
      }
      await batch.commit();
      firestoreConfirmed = true;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, CARDS_COLLECTION);
    }
  }

  // Also sync to Express backend if available
  try {
    const res = await fetch('/api/cards/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(caller?.id ? { 'x-admin-id': caller.id } : {}),
        ...(caller?.email ? { 'x-admin-email': caller.email } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      if (isStaticBackendUnavailable(res) && firestoreConfirmed) {
        // Static/Firestore-only host: Firestore write already confirmed
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || errData.error || `Failed to create batch cards (HTTP ${res.status}).`);
      }
    }
  } catch (netErr: any) {
    if (!firestoreConfirmed || (netErr instanceof Error && !netErr.message.includes('Failed to fetch'))) {
      throw netErr;
    }
  }

  const updatedList = [...currentCards, ...newCards];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));
  return updatedList;
}

const SUBADMIN_EDITABLE_CARD_KEYS = [
  'status',
  'businessName',
  'category',
  'googleReviewUrl',
  'notes',
  'aiReviewEnabled',
  'customKeywords',
  'reviewTone',
  'promptStarter',
  'customHeadline',
  'logoUrl',
  'businessDescription',
  'whatsapp',
  'instagram',
  'subscriptionStartDate',
  'subscriptionEndDate',
  'subscriptionStatus',
  'reviewPageSettings',
] as const;

const OPTIONAL_STRING_CARD_KEYS = new Set([
  'category',
  'notes',
  'promptStarter',
  'customHeadline',
  'logoUrl',
  'businessDescription',
  'whatsapp',
  'instagram',
  'subscriptionStartDate',
  'subscriptionEndDate',
  'subscriptionStatus',
]);

export async function assignCard(
  id: string,
  updates: Partial<CardRecord>,
  adminId?: string,
  adminEmail?: string,
  isMaster: boolean = false
): Promise<CardRecord | null> {
  const docRef = doc(db, CARDS_COLLECTION, id);
  const now = new Date().toISOString();

  // Read existing data from cache first as baseline
  let existingData: Partial<CardRecord> = { id, status: 'available', scansCount: 0 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const list = JSON.parse(raw) as CardRecord[];
      const hit = list.find((c) => c.id.toLowerCase() === id.toLowerCase());
      if (hit) existingData = { ...hit };
    }
  } catch {
    // ignore
  }

  // Read existing doc if available in Firestore
  let existsInFirestore = false;
  try {
    const existingSnap = await getDoc(docRef);
    if (existingSnap.exists()) {
      existsInFirestore = true;
      existingData = { ...existingData, ...(existingSnap.data() as CardRecord) };
    }
  } catch (readErr) {
    console.warn(`Firestore read card ${id} notice:`, readErr);
  }

  const prevAssignedEmail = (existingData.assignedToEmail || '').trim().toLowerCase();
  const prevAssignedUid = (existingData.assignedToUid || '').trim();

  // Build sanitized updates (strip immutable/ownership fields for non-master callers)
  const effectiveUpdates: Record<string, any> = {};
  for (const [key, val] of Object.entries(updates)) {
    if (!isMaster) {
      if (!(SUBADMIN_EDITABLE_CARD_KEYS as readonly string[]).includes(key)) {
        continue;
      }
      if (key === 'status' && val === 'available' && existingData.status !== 'available') {
        continue;
      }
    }
    if (key === 'id' || key === 'scansCount' || key === 'createdAt') {
      continue;
    }
    if (val === undefined) {
      if (OPTIONAL_STRING_CARD_KEYS.has(key) || (isMaster && (key === 'assignedToEmail' || key === 'assignedToUid' || key === 'assignedToName'))) {
        effectiveUpdates[key] = '';
      }
    } else {
      effectiveUpdates[key] = val;
    }
  }

  // Prevent stale previous-owner UID from remaining attached when Master reassigns card by email
  if (isMaster && effectiveUpdates.assignedToEmail !== undefined && effectiveUpdates.assignedToUid === undefined) {
    const nextEmailLower = String(effectiveUpdates.assignedToEmail || '').trim().toLowerCase();
    if (nextEmailLower !== prevAssignedEmail) {
      effectiveUpdates.assignedToUid = '';
      if (!nextEmailLower && effectiveUpdates.assignedToName === undefined) {
        effectiveUpdates.assignedToName = '';
      }
    }
  }

  const mergedCard: CardRecord = {
    ...existingData,
    ...effectiveUpdates,
    id,
    updatedAt: now,
  } as CardRecord;

  const sanitizedFullCard = cleanForFirestore(mergedCard);
  const firestoreMergePayload = cleanForFirestore({
    ...effectiveUpdates,
    updatedAt: now,
  });

  // 1. Write to Firestore
  let firestorePermissionDenied = false;
  let firestoreWriteConfirmed = false;
  let firestoreWriteError: Error | null = null;
  if (auth.currentUser) {
    try {
      if (existsInFirestore) {
        // Use merge: true with ONLY modified permitted fields so untouched ownership/immutable fields stay intact in rules diff()
        await setDoc(docRef, firestoreMergePayload, { merge: true });
      } else {
        await setDoc(docRef, sanitizedFullCard, { merge: true });
      }
      firestoreWriteConfirmed = true;
    } catch (error: any) {
      console.error(`Firestore assign card ${id} error:`, error);
      if (error?.code === 'permission-denied') {
        firestorePermissionDenied = true;
        firestoreWriteError = new Error(`Permission denied: You do not have permission to edit Card #${id}`);
      } else {
        firestoreWriteError = new Error(error?.message || `Failed to save Card #${id} to Firestore`);
      }
    }
  }

  // 2. Sync with Server API (data/cards.json & authoritative RBAC check)
  let serverCard: CardRecord | null = null;
  try {
    const serverPayload = isMaster
      ? { ...sanitizedFullCard, ...effectiveUpdates, adminId, adminEmail }
      : { ...effectiveUpdates, adminId, adminEmail };

    const res = await fetch(`/api/cards/${encodeURIComponent(id)}/assign`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(adminId ? { 'x-admin-id': adminId } : {}),
        ...(adminEmail ? { 'x-admin-email': adminEmail } : {}),
      },
      body: JSON.stringify(serverPayload),
    });
    if (!res.ok) {
      if (isStaticBackendUnavailable(res) && firestoreWriteConfirmed) {
        // Static/Firestore-only deployment: Firestore write & security rules already verified and saved
      } else if (isStaticBackendUnavailable(res) && firestoreWriteError) {
        throw firestoreWriteError;
      } else {
        const errData = await res.json().catch(() => ({}));
        const msg = errData.message || errData.error || `Access denied: You are not authorized to edit Card #${id}`;
        throw new Error(msg);
      }
    } else {
      const data = await res.json().catch(() => ({}));
      if (data.card) {
        serverCard = data.card as CardRecord;
        Object.assign(sanitizedFullCard, data.card);
      }
    }
  } catch (serverErr: any) {
    if (
      serverErr?.message?.toLowerCase().includes('denied') ||
      serverErr?.message?.toLowerCase().includes('authorized') ||
      serverErr?.message?.toLowerCase().includes('permission') ||
      serverErr?.message?.toLowerCase().includes('restricted') ||
      serverErr?.message?.toLowerCase().includes('revoked') ||
      serverErr?.message?.toLowerCase().includes('subscription') ||
      serverErr?.message?.toLowerCase().includes('date')
    ) {
      throw serverErr;
    }
    if (firestorePermissionDenied && firestoreWriteError) {
      throw firestoreWriteError;
    }
    console.warn(`Server API assign card ${id} sync notice:`, serverErr);
  }

  if (firestoreWriteError && (!serverCard || (isMaster && auth.currentUser?.email?.toLowerCase().trim() === PRIMARY_MASTER_EMAIL))) {
    handleFirestoreError(firestoreWriteError, OperationType.WRITE, `${CARDS_COLLECTION}/${id}`);
  }

  // 2b. When Master Admin changes/clears ownership, sync Firestore /admins & /users assignedCardIds via targeted queries + writeBatch
  if (
    isMaster &&
    auth.currentUser &&
    (effectiveUpdates.assignedToEmail !== undefined || effectiveUpdates.assignedToUid !== undefined)
  ) {
    const nextEmail = String(sanitizedFullCard.assignedToEmail || '').trim().toLowerCase();
    const nextUid = String(sanitizedFullCard.assignedToUid || '').trim();
    const ownerChanged = prevAssignedEmail !== nextEmail || prevAssignedUid !== nextUid;
    const ownerCleared = ownerChanged && !nextEmail && !nextUid;
    const cardIdLower = id.toLowerCase();

    try {
      const adminQueries: Promise<any>[] = [
        getDocs(query(collection(db, ADMINS_COLLECTION), where('assignedCardIds', 'array-contains', id))),
      ];
      const userQueries: Promise<any>[] = [
        getDocs(query(collection(db, USERS_COLLECTION), where('assignedCardIds', 'array-contains', id))),
      ];
      if (nextEmail) {
        adminQueries.push(getDocs(query(collection(db, ADMINS_COLLECTION), where('email', '==', nextEmail))));
        userQueries.push(getDocs(query(collection(db, USERS_COLLECTION), where('email', '==', nextEmail))));
      }
      if (prevAssignedEmail && prevAssignedEmail !== nextEmail) {
        adminQueries.push(getDocs(query(collection(db, ADMINS_COLLECTION), where('email', '==', prevAssignedEmail))));
        userQueries.push(getDocs(query(collection(db, USERS_COLLECTION), where('email', '==', prevAssignedEmail))));
      }

      const [adminRes, userRes] = await Promise.all([
        Promise.allSettled(adminQueries),
        Promise.allSettled(userQueries),
      ]);

      const adminDocsMap = new Map<string, AdminUser>();
      for (const r of adminRes) {
        if (r.status === 'fulfilled') {
          r.value.forEach((d: any) => adminDocsMap.set(d.id, d.data() as AdminUser));
        }
      }
      const userDocsMap = new Map<string, UserProfile>();
      for (const r of userRes) {
        if (r.status === 'fulfilled') {
          r.value.forEach((d: any) => userDocsMap.set(d.id, d.data() as UserProfile));
        }
      }

      const nextOwnerIsRestrictedAdmin = Array.from(adminDocsMap.values()).some((aData) => {
        const aEmail = (aData.email || '').trim().toLowerCase();
        return (
          aData.role === 'restricted' &&
          ((nextEmail && aEmail === nextEmail) || (nextUid && aData.id === nextUid))
        );
      });

      const batch = writeBatch(db);
      let hasBatchOps = false;

      adminDocsMap.forEach((aData, docId) => {
        if (aData.role !== 'restricted') return;
        const aEmail = (aData.email || '').trim().toLowerCase();
        const isPrev = (prevAssignedEmail && aEmail === prevAssignedEmail) || (prevAssignedUid && aData.id === prevAssignedUid);
        const isNext = (nextEmail && aEmail === nextEmail) || (nextUid && aData.id === nextUid);
        const curIds = Array.isArray(aData.assignedCardIds) ? aData.assignedCardIds : [];

        if (
          ownerChanged &&
          !isNext &&
          (isPrev || ownerCleared || nextOwnerIsRestrictedAdmin) &&
          curIds.some((cid) => cid.toLowerCase() === cardIdLower)
        ) {
          batch.set(
            doc(db, ADMINS_COLLECTION, docId),
            cleanForFirestore({
              assignedCardIds: curIds.filter((cid) => cid.toLowerCase() !== cardIdLower),
              updatedAt: now,
            }),
            { merge: true }
          );
          hasBatchOps = true;
        } else if (isNext && !curIds.some((cid) => cid.toLowerCase() === cardIdLower)) {
          batch.set(
            doc(db, ADMINS_COLLECTION, docId),
            cleanForFirestore({
              assignedCardIds: [...curIds, id],
              updatedAt: now,
            }),
            { merge: true }
          );
          hasBatchOps = true;
        }
      });

      userDocsMap.forEach((uData, docId) => {
        const uEmail = (uData.email || '').trim().toLowerCase();
        const isPrev = (prevAssignedEmail && uEmail === prevAssignedEmail) || (prevAssignedUid && uData.uid === prevAssignedUid);
        const isNext = (nextEmail && uEmail === nextEmail) || (nextUid && uData.uid === nextUid);
        const curIds = Array.isArray(uData.assignedCardIds) ? uData.assignedCardIds : [];

        if (
          ownerChanged &&
          !isNext &&
          (isPrev || ownerCleared || (nextOwnerIsRestrictedAdmin && uData.role === 'restricted')) &&
          curIds.some((cid) => cid.toLowerCase() === cardIdLower)
        ) {
          batch.set(
            doc(db, USERS_COLLECTION, docId),
            cleanForFirestore({
              assignedCardIds: curIds.filter((cid) => cid.toLowerCase() !== cardIdLower),
            }),
            { merge: true }
          );
          hasBatchOps = true;
        } else if (isNext && !uData.accessRevoked && !curIds.some((cid) => cid.toLowerCase() === cardIdLower)) {
          batch.set(
            doc(db, USERS_COLLECTION, docId),
            cleanForFirestore({
              assignedCardIds: [...curIds, id],
            }),
            { merge: true }
          );
          hasBatchOps = true;
        }
      });

      if (hasBatchOps) {
        await batch.commit();
      }
    } catch (syncErr) {
      console.warn('Firestore card ownership sync notice:', syncErr);
    }
  }

  // 3. Update localStorage cache directly without redundant network reads
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list: CardRecord[] = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex((c) => c.id.toLowerCase() === id.toLowerCase());
    if (idx !== -1) {
      list[idx] = sanitizedFullCard;
    } else {
      list.push(sanitizedFullCard);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }

  return sanitizedFullCard;
}

export async function uploadBusinessLogo(
  file: File,
  cardId?: string
): Promise<{ success: boolean; url: string; message?: string }> {
  const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  if (!validTypes.includes(file.type.toLowerCase())) {
    throw new Error('Invalid file type. Supported image formats: PNG, JPG/JPEG, WebP.');
  }

  const MAX_SIZE = 2 * 1024 * 1024; // 2 MB
  if (file.size > MAX_SIZE) {
    throw new Error(
      `File size exceeds 2 MB limit (${(file.size / (1024 * 1024)).toFixed(2)} MB). Please select an image under 2 MB.`
    );
  }

  // Convert to Base64 Data URL
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });

  try {
    const res = await fetch('/api/upload-logo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: dataUrl,
        fileName: file.name,
        cardId,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.url) {
        return { success: true, url: data.url };
      }
    }
  } catch (netErr) {
    console.warn('Server logo upload endpoint notice, falling back to data URL:', netErr);
  }

  // Fallback to validated dataUrl if server unreachable
  return { success: true, url: dataUrl };
}

export async function bulkUpdateCardsStatus(
  ids: string[],
  status: 'available' | 'assigned',
  adminId?: string,
  adminEmail?: string
): Promise<CardRecord[]> {
  const normalizedIds = ids.map((id) => id.trim());
  const now = new Date().toISOString();

  // 1. Try batch updating in Firestore with sanitized payload
  let firestoreBulkConfirmed = false;
  if (auth.currentUser) {
    try {
      const batch = writeBatch(db);
      for (const id of normalizedIds) {
        const docRef = doc(db, CARDS_COLLECTION, id);
        batch.set(docRef, cleanForFirestore({ status, updatedAt: now }), { merge: true });
      }
      await batch.commit();
      firestoreBulkConfirmed = true;
    } catch (err) {
      console.warn('Firestore bulk update failed, falling back:', err);
    }
  }

  // 2. Server API sync & RBAC check
  try {
    const res = await fetch('/api/cards/bulk-status', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(adminId ? { 'x-admin-id': adminId } : {}),
        ...(adminEmail ? { 'x-admin-email': adminEmail } : {}),
      },
      body: JSON.stringify({ ids: normalizedIds, status, adminId, adminEmail }),
    });
    if (!res.ok) {
      if (isStaticBackendUnavailable(res) && firestoreBulkConfirmed) {
        // Static/Firestore-only host: Firestore batch update confirmed
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || errData.error || 'Bulk status update failed.');
      }
    }
  } catch (netErr: any) {
    if (!firestoreBulkConfirmed || (netErr instanceof Error && !netErr.message.includes('Failed to fetch'))) {
      throw netErr;
    }
  }

  // 3. Update local cache
  let updatedList: CardRecord[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const cached: CardRecord[] = raw ? JSON.parse(raw) : [];
    const idSet = new Set(normalizedIds.map((id) => id.toLowerCase()));
    updatedList = cached.map((c) => {
      if (idSet.has(c.id.toLowerCase())) {
        return {
          ...c,
          status,
          updatedAt: now,
        };
      }
      return c;
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));
  } catch {
    // ignore
  }
  return updatedList;
}

export async function deleteCard(id: string, caller?: CallerIdentity): Promise<boolean> {
  const cleanId = id.trim();
  let firestoreDeleted = false;
  if (auth.currentUser) {
    try {
      await deleteDoc(doc(db, CARDS_COLLECTION, cleanId));
      firestoreDeleted = true;
    } catch (err) {
      console.warn(`Firestore delete card ${cleanId} failed:`, err);
    }
  }

  try {
    const res = await fetch(`/api/cards/${encodeURIComponent(cleanId)}`, {
      method: 'DELETE',
      headers: {
        ...(caller?.id ? { 'x-admin-id': caller.id } : {}),
        ...(caller?.email ? { 'x-admin-email': caller.email } : {}),
      },
    });
    if (!res.ok && res.status !== 404) {
      if (isStaticBackendUnavailable(res) && firestoreDeleted) {
        // Static/Firestore-only host: Firestore delete confirmed
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || errData.error || 'Failed to delete card.');
      }
    }
  } catch (netErr: any) {
    if (!firestoreDeleted || (netErr instanceof Error && !netErr.message.includes('Failed to fetch'))) {
      throw netErr;
    }
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as CardRecord[];
      const filtered = cached.filter((c) => c.id.toLowerCase() !== cleanId.toLowerCase());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    }
  } catch {
    // ignore
  }
  return true;
}

export async function generateAiReview(payload: GenerateReviewRequest): Promise<GenerateReviewResponse> {
  try {
    const res = await fetch('/api/generate-review', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const rawText = await res.text();

    if (!res.ok) {
      let serverError = `HTTP ${res.status}: ${res.statusText || 'Request failed'}`;
      if (rawText && rawText.trim()) {
        try {
          const parsed = JSON.parse(rawText);
          serverError = parsed.error || parsed.message || serverError;
        } catch {
          // If HTML error page was returned by CDN or serverless proxy
          if (res.status === 405) {
            serverError = 'API endpoint method not allowed (405). Please verify Vercel serverless functions deployment.';
          }
        }
      }
      return {
        success: false,
        message: serverError,
      };
    }

    if (!rawText || !rawText.trim()) {
      return {
        success: false,
        message: 'Empty response received from review generation server',
      };
    }

    try {
      const data = JSON.parse(rawText);
      return data;
    } catch {
      return {
        success: false,
        message: 'Invalid JSON returned by server',
      };
    }
  } catch (err: any) {
    console.error('Error in generateAiReview network call:', err);
    return {
      success: false,
      message: err.message || 'Network request failed',
    };
  }
}

// ---------------- Admin Management Layer ----------------
const ADMINS_COLLECTION = 'admins';
const ADMINS_STORAGE_KEY = '3dbysd_smart_reviews_admins';
const PRIMARY_MASTER_EMAIL = '66shashwatkumar66@gmail.com';

const DEFAULT_ADMINS: AdminUser[] = [
  {
    id: 'master-admin-01',
    email: PRIMARY_MASTER_EMAIL,
    name: 'Master Admin',
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
  },
];

function deduplicateAdmins(list: AdminUser[]): AdminUser[] {
  const map = new Map<string, AdminUser>();
  for (const item of list) {
    if (!item || !item.email) continue;
    const key = item.email.toLowerCase().trim();
    const existing = map.get(key);
    if (!existing) {
      map.set(key, item);
    } else if (existing.aliasOf && !item.aliasOf) {
      // Prefer canonical non-alias doc
      map.set(key, item);
    }
  }
  return Array.from(map.values());
}

export async function fetchAdmins(callerEmail?: string, callerUid?: string): Promise<AdminUser[]> {
  let firestoreAdmins: AdminUser[] = [];
  let firestoreListSucceeded = false;
  let firestoreChecked = false;
  const cleanCallerEmail = (callerEmail || auth.currentUser?.email || '').toLowerCase().trim();
  const isMasterCaller = cleanCallerEmail === PRIMARY_MASTER_EMAIL;

  if (auth.currentUser) {
    try {
      const colRef = collection(db, ADMINS_COLLECTION);
      const snapshot = await getDocs(colRef);
      firestoreListSucceeded = true;
      firestoreChecked = true;
      snapshot.forEach((d) => {
        const data = d.data() as AdminUser;
        if (data && data.email) {
          firestoreAdmins.push({ ...data, email: data.email.toLowerCase().trim() });
        }
      });
    } catch {
      // Non-master users do not have collection list permission; query their own admin/user docs by ID and normalized email
      firestoreChecked = true;
      const authEmail = (auth.currentUser.email || callerEmail || '').toLowerCase().trim();
      const lookups = [
        callerEmail ? callerEmail.toLowerCase().trim() : '',
        callerUid ? callerUid.trim() : '',
        authEmail,
        auth.currentUser.uid,
      ].filter(Boolean);

      const [directAdminSnaps, emailAdminQuerySnap, uidUserSnap, emailUserQuerySnap] = await Promise.all([
        Promise.all(
          Array.from(new Set(lookups)).map((key) =>
            getDoc(doc(db, ADMINS_COLLECTION, key)).catch(() => null)
          )
        ),
        authEmail
          ? getDocs(query(collection(db, ADMINS_COLLECTION), where('email', '==', authEmail))).catch(() => null)
          : Promise.resolve(null),
        getDoc(doc(db, USERS_COLLECTION, auth.currentUser.uid)).catch(() => null),
        authEmail
          ? getDocs(query(collection(db, USERS_COLLECTION), where('email', '==', authEmail))).catch(() => null)
          : Promise.resolve(null),
      ]);

      for (const snap of directAdminSnaps) {
        if (snap?.exists()) {
          const data = snap.data() as AdminUser;
          if (data && data.email) {
            firestoreAdmins.push({ ...data, email: data.email.toLowerCase().trim() });
          }
        }
      }
      if (emailAdminQuerySnap) {
        emailAdminQuerySnap.forEach((d) => {
          const data = d.data() as AdminUser;
          if (data && data.email) {
            firestoreAdmins.push({ ...data, email: data.email.toLowerCase().trim() });
          }
        });
      }
      firestoreAdmins = deduplicateAdmins(firestoreAdmins);

      // Collect matched /users docs to check revocation or user-promoted Sub-Admin role
      const matchedUsers: UserProfile[] = [];
      if (uidUserSnap?.exists()) {
        matchedUsers.push(uidUserSnap.data() as UserProfile);
      }
      if (emailUserQuerySnap) {
        emailUserQuerySnap.forEach((d) => {
          matchedUsers.push(d.data() as UserProfile);
        });
      }
      const isRevoked = matchedUsers.some((u) => Boolean(u.accessRevoked));

      // Check user's own /users docs in case Master Admin promoted them there without an admin alias doc
      if (firestoreAdmins.length === 0 && !isRevoked) {
        const promotedUser = matchedUsers.find(
          (u) => !u.accessRevoked && (u.role === 'restricted' || u.role === 'master')
        );
        if (promotedUser) {
          firestoreAdmins.push({
            id: promotedUser.uid,
            email: promotedUser.email.toLowerCase().trim(),
            name: promotedUser.displayName || promotedUser.email.split('@')[0],
            role: promotedUser.role === 'master' ? 'master' : 'restricted',
            assignedCardIds: Array.isArray(promotedUser.assignedCardIds) ? promotedUser.assignedCardIds : [],
            permissions: {
              canEditCards: true,
              canToggleAi: true,
              canExportCsv: promotedUser.role === 'master',
              canCreateCards: promotedUser.role === 'master',
            },
            createdAt: promotedUser.createdAt || new Date().toISOString(),
            updatedAt: promotedUser.lastLoginAt || new Date().toISOString(),
          });
        }
      }
    }
  }

  let serverAdmins: AdminUser[] = [];
  let serverFetchSucceeded = false;
  try {
    const res = await fetch('/api/admins');
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (res.ok && ct.includes('application/json')) {
      const data = await res.json();
      if (data.admins && Array.isArray(data.admins)) {
        serverFetchSucceeded = true;
        serverAdmins = data.admins;
      }
    }
  } catch {
    // ignore
  }

  if (firestoreListSucceeded && serverFetchSucceeded) {
    const dedupedFs = deduplicateAdmins(firestoreAdmins);
    const dedupedSrv = deduplicateAdmins(serverAdmins);
    const mergedMap = new Map<string, AdminUser>();
    for (const s of dedupedSrv) {
      mergedMap.set(s.email.toLowerCase().trim(), s);
    }
    for (const f of dedupedFs) {
      const emailKey = f.email.toLowerCase().trim();
      const srvMatch = mergedMap.get(emailKey);
      if (srvMatch) {
        const fTime = f.updatedAt ? new Date(f.updatedAt).getTime() : 0;
        const sTime = srvMatch.updatedAt ? new Date(srvMatch.updatedAt).getTime() : 0;
        if (fTime > sTime) {
          mergedMap.set(emailKey, f);
        }
      } else {
        mergedMap.set(emailKey, f);
      }
    }
    const result = Array.from(mergedMap.values());
    localStorage.setItem(ADMINS_STORAGE_KEY, JSON.stringify(result));
    return result;
  }

  if (serverFetchSucceeded) {
    const mergedMap = new Map<string, AdminUser>();
    for (const s of deduplicateAdmins(serverAdmins)) {
      mergedMap.set(s.email.toLowerCase().trim(), s);
    }
    for (const f of deduplicateAdmins(firestoreAdmins)) {
      const emailKey = f.email.toLowerCase().trim();
      if (mergedMap.has(emailKey)) {
        const s = mergedMap.get(emailKey)!;
        const fTime = f.updatedAt ? new Date(f.updatedAt).getTime() : 0;
        const sTime = s.updatedAt ? new Date(s.updatedAt).getTime() : 0;
        if (fTime >= sTime) {
          mergedMap.set(emailKey, f);
        }
      } else {
        mergedMap.set(emailKey, f);
      }
    }
    const result = Array.from(mergedMap.values());
    localStorage.setItem(ADMINS_STORAGE_KEY, JSON.stringify(result));
    return result;
  }

  if (firestoreChecked) {
    const result = deduplicateAdmins(firestoreAdmins);
    if (isMasterCaller) {
      const hasPrimary = result.some((a) => a.email.toLowerCase().trim() === PRIMARY_MASTER_EMAIL);
      const finalMasterList = hasPrimary ? result : [...DEFAULT_ADMINS, ...result];
      localStorage.setItem(ADMINS_STORAGE_KEY, JSON.stringify(finalMasterList));
      return finalMasterList;
    }
    // Non-master caller queried Firestore cleanly: never fall back to stale localStorage or DEFAULT_ADMINS
    localStorage.setItem(ADMINS_STORAGE_KEY, JSON.stringify(result));
    return result;
  }

  if (!isMasterCaller) {
    return [];
  }

  const cached = localStorage.getItem(ADMINS_STORAGE_KEY);
  if (cached) {
    try {
      return deduplicateAdmins(JSON.parse(cached) as AdminUser[]);
    } catch {
      // ignore
    }
  }

  localStorage.setItem(ADMINS_STORAGE_KEY, JSON.stringify(DEFAULT_ADMINS));
  return DEFAULT_ADMINS;
}

/**
 * Quietly ensures every active admin in Firestore has a normalized lowercase email lookup document
 * (`admins/{email.lower()}`) so Firestore sub-admin rules (`exists(/admins/$(authEmailLower()))`)
 * resolve cleanly even for legacy sub-admin docs originally keyed only by `admin-...`.
 */
export async function syncAdminLookupDocs(adminsList: AdminUser[]): Promise<void> {
  if (!auth.currentUser || auth.currentUser.email?.toLowerCase().trim() !== PRIMARY_MASTER_EMAIL) {
    return;
  }
  const usersByEmail = new Map<string, UserProfile[]>();
  try {
    const usersSnap = await getDocs(collection(db, USERS_COLLECTION));
    usersSnap.forEach((uDoc) => {
      const uData = uDoc.data() as UserProfile;
      if (uData?.email) {
        const key = uData.email.toLowerCase().trim();
        const list = usersByEmail.get(key) || [];
        list.push({ ...uData, uid: uDoc.id, email: key });
        usersByEmail.set(key, list);
      }
    });
  } catch {
    // ignore
  }

  let batch = writeBatch(db);
  let opCount = 0;
  const syncedAdminEmails = new Set<string>();

  const commitBatchIfNeeded = async (force: boolean = false) => {
    if (opCount === 0) return;
    if (force || opCount >= 350) {
      await batch.commit();
      batch = writeBatch(db);
      opCount = 0;
    }
  };

  try {
    for (const adm of adminsList) {
      if (!adm?.id || !adm?.email || adm.aliasOf) continue;
      const cleanEmail = adm.email.toLowerCase().trim();
      syncedAdminEmails.add(cleanEmail);
      const normalizedAdmin: AdminUser = {
        ...adm,
        email: cleanEmail,
        assignedCardIds: Array.isArray(adm.assignedCardIds) ? adm.assignedCardIds : [],
        permissions: {
          canEditCards: adm.permissions?.canEditCards ?? true,
          canToggleAi: adm.permissions?.canToggleAi ?? true,
          canExportCsv: adm.role === 'master' ? true : (adm.permissions?.canExportCsv ?? false),
          canCreateCards: adm.role === 'master',
        },
      };
      batch.set(doc(db, ADMINS_COLLECTION, normalizedAdmin.id), cleanForFirestore(normalizedAdmin), { merge: true });
      opCount++;
      if (normalizedAdmin.id.toLowerCase() !== cleanEmail) {
        batch.set(
          doc(db, ADMINS_COLLECTION, cleanEmail),
          cleanForFirestore({ ...normalizedAdmin, aliasOf: normalizedAdmin.id }),
          { merge: true }
        );
        opCount++;
      }
      const matchedUsers = usersByEmail.get(cleanEmail) || [];
      for (const matchedUser of matchedUsers) {
        if (!matchedUser.uid) continue;
        if (matchedUser.uid !== normalizedAdmin.id && matchedUser.uid.toLowerCase() !== cleanEmail) {
          batch.set(
            doc(db, ADMINS_COLLECTION, matchedUser.uid),
            cleanForFirestore({ ...normalizedAdmin, aliasOf: normalizedAdmin.id }),
            { merge: true }
          );
          opCount++;
        }
        batch.set(
          doc(db, USERS_COLLECTION, matchedUser.uid),
          cleanForFirestore({
            uid: matchedUser.uid,
            email: cleanEmail,
            role: normalizedAdmin.role,
            assignedCardIds: normalizedAdmin.assignedCardIds,
            accessRevoked: false,
          }),
          { merge: true }
        );
        opCount++;
      }
      await commitBatchIfNeeded(false);
    }

    // Auto-heal any non-revoked Master/Sub-Admin users in /users that are missing their canonical /admins/{email} doc
    const now = new Date().toISOString();
    for (const [cleanEmail, userDocs] of usersByEmail.entries()) {
      if (syncedAdminEmails.has(cleanEmail) || cleanEmail === PRIMARY_MASTER_EMAIL) continue;
      const hasRevoked = userDocs.some((u) => Boolean(u.accessRevoked));
      if (hasRevoked) continue;
      const promoted = userDocs.find((u) => u.role === 'restricted' || u.role === 'master');
      if (!promoted) continue;

      const healedRole: 'master' | 'restricted' = promoted.role === 'master' ? 'master' : 'restricted';
      const healedCardIds =
        healedRole === 'master'
          ? []
          : Array.from(
              new Set(
                userDocs
                  .flatMap((u) => (Array.isArray(u.assignedCardIds) ? u.assignedCardIds : []))
                  .map((cid) => String(cid).trim())
                  .filter(Boolean)
              )
            );
      const healedAdmin: AdminUser = {
        id: promoted.uid,
        email: cleanEmail,
        name: promoted.displayName || cleanEmail.split('@')[0],
        role: healedRole,
        assignedCardIds: healedCardIds,
        permissions: {
          canEditCards: true,
          canToggleAi: true,
          canExportCsv: healedRole === 'master',
          canCreateCards: healedRole === 'master',
        },
        createdAt: promoted.createdAt || now,
        updatedAt: promoted.lastLoginAt || now,
      };
      batch.set(doc(db, ADMINS_COLLECTION, healedAdmin.id), cleanForFirestore(healedAdmin), { merge: true });
      opCount++;
      if (healedAdmin.id.toLowerCase() !== cleanEmail) {
        batch.set(
          doc(db, ADMINS_COLLECTION, cleanEmail),
          cleanForFirestore({ ...healedAdmin, aliasOf: healedAdmin.id }),
          { merge: true }
        );
        opCount++;
      }
      for (const u of userDocs) {
        if (u.uid && u.uid !== healedAdmin.id && u.uid.toLowerCase() !== cleanEmail) {
          batch.set(
            doc(db, ADMINS_COLLECTION, u.uid),
            cleanForFirestore({ ...healedAdmin, aliasOf: healedAdmin.id }),
            { merge: true }
          );
          opCount++;
        }
      }
      await commitBatchIfNeeded(false);
    }

    await commitBatchIfNeeded(true);
  } catch {
    // non-fatal background sync
  }
}

export async function createAdmin(
  payload: Partial<AdminUser>,
  caller?: CallerIdentity,
  options?: { upsertIfExists?: boolean }
): Promise<AdminUser | null> {
  const cleanEmail = payload.email?.toLowerCase().trim() || '';
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error('Please enter a valid admin email address.');
  }

  // Check Firestore for an existing admin record with this email to prevent duplicates or preserve canonical ID on upsert
  let existingFsAdmin: AdminUser | undefined;
  if (auth.currentUser) {
    try {
      const [emailSnap, querySnap] = await Promise.all([
        getDoc(doc(db, ADMINS_COLLECTION, cleanEmail)).catch(() => null),
        getDocs(query(collection(db, ADMINS_COLLECTION), where('email', '==', cleanEmail))).catch(() => null),
      ]);
      const found: AdminUser[] = [];
      if (emailSnap?.exists()) found.push(emailSnap.data() as AdminUser);
      if (querySnap) {
        querySnap.forEach((d) => found.push(d.data() as AdminUser));
      }
      const deduped = deduplicateAdmins(found);
      if (deduped.length > 0) {
        existingFsAdmin = deduped[0];
      }
    } catch {
      // ignore pre-check errors; actual write will enforce permissions
    }
  }

  if (existingFsAdmin && !options?.upsertIfExists) {
    throw new Error(`Admin with email ${cleanEmail} already exists.`);
  }

  const now = new Date().toISOString();
  const resolvedRole: 'master' | 'restricted' = payload.role === 'master' ? 'master' : 'restricted';
  const rawCardIds =
    payload.assignedCardIds !== undefined
      ? payload.assignedCardIds
      : existingFsAdmin?.assignedCardIds || [];
  const dedupedCardIds =
    resolvedRole === 'master'
      ? []
      : Array.from(
          new Set(
            (Array.isArray(rawCardIds) ? rawCardIds : [])
              .map((cid) => String(cid).trim())
              .filter(Boolean)
          )
        );

  const canonicalId = existingFsAdmin?.id || payload.id || `admin-${Date.now()}`;
  const newAdmin: AdminUser = {
    id: canonicalId,
    email: cleanEmail,
    name: payload.name?.trim() || existingFsAdmin?.name || cleanEmail.split('@')[0] || 'Sub-Admin',
    role: resolvedRole,
    assignedCardIds: dedupedCardIds,
    permissions: {
      canEditCards: payload.permissions?.canEditCards ?? existingFsAdmin?.permissions?.canEditCards ?? true,
      canToggleAi: payload.permissions?.canToggleAi ?? existingFsAdmin?.permissions?.canToggleAi ?? true,
      canExportCsv:
        resolvedRole === 'master'
          ? true
          : (payload.permissions?.canExportCsv ?? existingFsAdmin?.permissions?.canExportCsv ?? false),
      canCreateCards: resolvedRole === 'master',
    },
    createdAt: existingFsAdmin?.createdAt || now,
    updatedAt: now,
  };

  // 1. Persist via authoritative Express backend when available (tolerating static-host HTML 404/405)
  let savedAdmin: AdminUser = newAdmin;
  let backendUnavailable = false;
  try {
    const res = await fetch('/api/admins', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(caller?.id ? { 'x-admin-id': caller.id } : {}),
        ...(caller?.email ? { 'x-admin-email': caller.email } : {}),
      },
      body: JSON.stringify(newAdmin),
    });

    if (res.ok) {
      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      if (contentType.includes('application/json')) {
        const serverData = await res.json().catch(() => ({}));
        if (serverData.admin) {
          savedAdmin = serverData.admin as AdminUser;
        }
      } else {
        backendUnavailable = true;
      }
    } else if (isStaticBackendUnavailable(res)) {
      backendUnavailable = true;
    } else {
      const errData = await res.json().catch(() => ({}));
      const errMsg = errData.message || errData.error || `Failed to register administrator (HTTP ${res.status}).`;

      if (
        res.status === 400 &&
        options?.upsertIfExists &&
        errMsg.toLowerCase().includes('already exists')
      ) {
        // Server already has this email; update it instead of failing
        const putBody: Partial<AdminUser> = {
          name: newAdmin.name,
          email: cleanEmail,
          role: newAdmin.role,
          permissions: newAdmin.permissions,
          ...(payload.assignedCardIds !== undefined ? { assignedCardIds: newAdmin.assignedCardIds } : {}),
        };
        const putRes = await fetch(`/api/admins/${encodeURIComponent(cleanEmail)}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(caller?.id ? { 'x-admin-id': caller.id } : {}),
            ...(caller?.email ? { 'x-admin-email': caller.email } : {}),
          },
          body: JSON.stringify(putBody),
        });
        if (putRes.ok) {
          const putData = await putRes.json().catch(() => ({}));
          if (putData.admin) {
            savedAdmin = putData.admin as AdminUser;
          }
        } else if (isStaticBackendUnavailable(putRes)) {
          backendUnavailable = true;
        } else {
          const putErr = await putRes.json().catch(() => ({}));
          throw new Error(putErr.message || putErr.error || 'Failed to update existing administrator.');
        }
      } else {
        throw new Error(errMsg);
      }
    }
  } catch (err: any) {
    if (err instanceof TypeError || (err?.message || '').toLowerCase().includes('failed to fetch')) {
      backendUnavailable = true;
    } else {
      throw err;
    }
  }

  if (backendUnavailable && !auth.currentUser) {
    throw new Error(
      'Firebase Google Auth session required: please sign in with Google as Master Admin to register administrators.'
    );
  }

  // 2. Write canonical doc + lowercase email & UID lookup docs + /users sync + exclusive card reassignment atomically in Firestore
  if (auth.currentUser) {
    try {
      const normalizedRecord: AdminUser = {
        ...savedAdmin,
        email: cleanEmail,
        assignedCardIds: Array.isArray(savedAdmin.assignedCardIds) ? savedAdmin.assignedCardIds : dedupedCardIds,
      };
      const assignedIds = normalizedRecord.role === 'restricted' ? normalizedRecord.assignedCardIds : [];
      const assignedLowerSet = new Set(assignedIds.map((cid) => cid.toLowerCase()));

      const [usersSnap, ...reassignmentResults] = await Promise.all([
        getDocs(query(collection(db, USERS_COLLECTION), where('email', '==', cleanEmail))).catch(() => null),
        ...assignedIds.flatMap((cid) => [
          getDocs(query(collection(db, ADMINS_COLLECTION), where('assignedCardIds', 'array-contains', cid)))
            .then((snap) => ({ kind: 'admin' as const, snap }))
            .catch(() => null),
          getDocs(query(collection(db, USERS_COLLECTION), where('assignedCardIds', 'array-contains', cid)))
            .then((snap) => ({ kind: 'user' as const, snap }))
            .catch(() => null),
        ]),
      ]);

      const batch = writeBatch(db);
      batch.set(doc(db, ADMINS_COLLECTION, normalizedRecord.id), cleanForFirestore(normalizedRecord));
      if (normalizedRecord.id.toLowerCase() !== cleanEmail) {
        batch.set(
          doc(db, ADMINS_COLLECTION, cleanEmail),
          cleanForFirestore({ ...normalizedRecord, aliasOf: normalizedRecord.id })
        );
      }

      const targetUserUids = new Set<string>();
      if (usersSnap) {
        usersSnap.forEach((uDoc) => {
          targetUserUids.add(uDoc.id);
          const uData = uDoc.data() as UserProfile;
          if (uDoc.id !== normalizedRecord.id && uDoc.id.toLowerCase() !== cleanEmail) {
            batch.set(
              doc(db, ADMINS_COLLECTION, uDoc.id),
              cleanForFirestore({ ...normalizedRecord, aliasOf: normalizedRecord.id })
            );
          }
          batch.set(
            doc(db, USERS_COLLECTION, uDoc.id),
            cleanForFirestore({
              uid: uDoc.id,
              email: cleanEmail,
              role: normalizedRecord.role,
              assignedCardIds: normalizedRecord.assignedCardIds,
              accessRevoked: false,
              ...(uData.requestStatus ? { requestStatus: 'approved', requestUpdatedAt: now } : {}),
            }),
            { merge: true }
          );
        });
      }

      // Enforce exclusive card reassignment in Firestore
      if (assignedLowerSet.size > 0) {
        const strippedAdminDocs = new Set<string>();
        const strippedUserDocs = new Set<string>();
        for (const res of reassignmentResults) {
          if (!res) continue;
          if (res.kind === 'admin') {
            res.snap.forEach((aDoc) => {
              if (strippedAdminDocs.has(aDoc.id)) return;
              const aData = aDoc.data() as AdminUser;
              const aEmail = (aData.email || '').toLowerCase().trim();
              if (aEmail === cleanEmail || aDoc.id === normalizedRecord.id || aData.role !== 'restricted') return;
              const curIds = Array.isArray(aData.assignedCardIds) ? aData.assignedCardIds : [];
              const filtered = curIds.filter((cid) => !assignedLowerSet.has(cid.toLowerCase()));
              if (filtered.length !== curIds.length) {
                strippedAdminDocs.add(aDoc.id);
                batch.set(
                  doc(db, ADMINS_COLLECTION, aDoc.id),
                  cleanForFirestore({ assignedCardIds: filtered, updatedAt: now }),
                  { merge: true }
                );
              }
            });
          } else {
            res.snap.forEach((uDoc) => {
              if (strippedUserDocs.has(uDoc.id) || targetUserUids.has(uDoc.id)) return;
              const uData = uDoc.data() as UserProfile;
              const uEmail = (uData.email || '').toLowerCase().trim();
              if (uEmail === cleanEmail) return;
              const curIds = Array.isArray(uData.assignedCardIds) ? uData.assignedCardIds : [];
              const filtered = curIds.filter((cid) => !assignedLowerSet.has(cid.toLowerCase()));
              if (filtered.length !== curIds.length) {
                strippedUserDocs.add(uDoc.id);
                batch.set(
                  doc(db, USERS_COLLECTION, uDoc.id),
                  cleanForFirestore({ assignedCardIds: filtered }),
                  { merge: true }
                );
              }
            });
          }
        }
        for (const cid of assignedIds) {
          batch.set(
            doc(db, CARDS_COLLECTION, cid),
            cleanForFirestore({
              assignedToEmail: cleanEmail,
              assignedToUid: normalizedRecord.id,
              assignedToName: normalizedRecord.name,
              updatedAt: now,
            }),
            { merge: true }
          );
        }
      }

      await batch.commit();
      savedAdmin = normalizedRecord;
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, `${ADMINS_COLLECTION}/${savedAdmin.id}`);
    }
  }

  try {
    const cachedRaw = localStorage.getItem(ADMINS_STORAGE_KEY);
    const current: AdminUser[] = cachedRaw ? JSON.parse(cachedRaw) : [];
    const updated = deduplicateAdmins([
      ...current.filter((a) => a.id !== savedAdmin.id && a.email.toLowerCase().trim() !== cleanEmail),
      savedAdmin,
    ]);
    localStorage.setItem(ADMINS_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }

  return savedAdmin;
}

export async function updateAdmin(
  id: string,
  updates: Partial<AdminUser>,
  caller?: CallerIdentity,
  existingHint?: AdminUser
): Promise<AdminUser | null> {
  const cleanTargetKey = id.trim();
  const cleanTargetLower = cleanTargetKey.toLowerCase();

  if (updates.email !== undefined) {
    const candidateEmail = updates.email.trim().toLowerCase();
    if (!candidateEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidateEmail)) {
      throw new Error('Please enter a valid email address.');
    }
  }

  let cachedList: AdminUser[] = [];
  try {
    const raw = localStorage.getItem(ADMINS_STORAGE_KEY);
    if (raw) cachedList = deduplicateAdmins(JSON.parse(raw) as AdminUser[]);
  } catch {
    // ignore
  }

  let existing: AdminUser | undefined =
    existingHint ||
    cachedList.find(
      (a) => a.id === cleanTargetKey || a.email.toLowerCase().trim() === cleanTargetLower
    );

  if (!existing) {
    const fetched = await fetchAdmins(caller?.email, caller?.id);
    cachedList = fetched;
    existing = fetched.find(
      (a) => a.id === cleanTargetKey || a.email.toLowerCase().trim() === cleanTargetLower
    );
  }

  if (!existing) {
    throw new Error('Administrator record not found.');
  }

  const prevEmailLower = existing.email.toLowerCase().trim();
  const isPrimaryMasterTarget = prevEmailLower === PRIMARY_MASTER_EMAIL;
  const nextRole: 'master' | 'restricted' = isPrimaryMasterTarget
    ? 'master'
    : updates.role === 'master'
    ? 'master'
    : updates.role === 'restricted'
    ? 'restricted'
    : existing.role;

  const nextEmailLower = isPrimaryMasterTarget
    ? PRIMARY_MASTER_EMAIL
    : updates.email
    ? updates.email.toLowerCase().trim()
    : prevEmailLower;

  const dedupedCardIds =
    nextRole === 'master'
      ? []
      : updates.assignedCardIds !== undefined
      ? Array.from(
          new Set(
            (Array.isArray(updates.assignedCardIds) ? updates.assignedCardIds : [])
              .map((cid) => String(cid).trim())
              .filter(Boolean)
          )
        )
      : existing.assignedCardIds || [];

  const sanitizedUpdates: Partial<AdminUser> = {
    name: updates.name !== undefined ? updates.name.trim() : existing.name,
    email: nextEmailLower,
    role: nextRole,
    assignedCardIds: dedupedCardIds,
    permissions: {
      canEditCards: updates.permissions?.canEditCards ?? existing.permissions?.canEditCards ?? true,
      canToggleAi: updates.permissions?.canToggleAi ?? existing.permissions?.canToggleAi ?? true,
      canExportCsv: nextRole === 'master' ? true : (updates.permissions?.canExportCsv ?? existing.permissions?.canExportCsv ?? false),
      canCreateCards: nextRole === 'master',
    },
  };

  const now = new Date().toISOString();
  const merged: AdminUser = {
    ...existing,
    ...sanitizedUpdates,
    id: existing.id,
    email: nextEmailLower,
    updatedAt: now,
  };

  // 1. Update authoritative backend API when available (tolerating static-host non-JSON 404/405)
  let savedAdmin: AdminUser = merged;
  let backendUnavailable = false;
  try {
    const res = await fetch(`/api/admins/${encodeURIComponent(merged.id)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(caller?.id ? { 'x-admin-id': caller.id } : {}),
        ...(caller?.email ? { 'x-admin-email': caller.email } : {}),
      },
      body: JSON.stringify(sanitizedUpdates),
    });

    if (res.ok) {
      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      if (contentType.includes('application/json')) {
        const data = await res.json().catch(() => ({}));
        if (data.admin) {
          savedAdmin = data.admin as AdminUser;
        }
      } else {
        backendUnavailable = true;
      }
    } else if (isStaticBackendUnavailable(res)) {
      backendUnavailable = true;
    } else {
      const errData = await res.json().catch(() => ({}));
      const serverMsg =
        errData.message || errData.error || `Failed to update administrator permissions (HTTP ${res.status}).`;
      // If local Express JSON file doesn't yet have a Firestore-only admin, allow Firestore Master write if 404
      if (res.status === 404 && auth.currentUser) {
        backendUnavailable = true;
      } else {
        throw new Error(serverMsg);
      }
    }
  } catch (err: any) {
    if (err instanceof TypeError || (err?.message || '').toLowerCase().includes('failed to fetch')) {
      backendUnavailable = true;
    } else {
      throw err;
    }
  }

  if (backendUnavailable && !auth.currentUser) {
    throw new Error(
      'Firebase Google Auth session required: please sign in with Google as Master Admin to update permissions.'
    );
  }

  // 2. Atomically sync primary doc, email & UID alias docs, /users role, exclusive card reassignment, and cleared cards in a single Firestore batch
  if (auth.currentUser) {
    try {
      const cleanEmail = savedAdmin.email.toLowerCase().trim();
      const nextAssignedIds = savedAdmin.role === 'restricted' ? (savedAdmin.assignedCardIds || []) : [];
      const nextSet = new Set(nextAssignedIds.map((cid) => cid.toLowerCase()));
      const removedIds = (existing.assignedCardIds || []).filter((cid) => !nextSet.has(cid.toLowerCase()));
      const needCardOwnershipCheck = removedIds.length > 0 || savedAdmin.role === 'master';

      const [nextUsersRes, prevUsersRes, uidAdminsRes, prevCardsRes, nextCardsRes, uidCardsRes, ...reassignmentResults] = await Promise.all([
        getDocs(query(collection(db, USERS_COLLECTION), where('email', '==', cleanEmail))).catch(() => null),
        prevEmailLower !== cleanEmail
          ? getDocs(query(collection(db, USERS_COLLECTION), where('email', '==', prevEmailLower))).catch(() => null)
          : Promise.resolve(null),
        getDocs(query(collection(db, ADMINS_COLLECTION), where('aliasOf', '==', savedAdmin.id))).catch(() => null),
        needCardOwnershipCheck
          ? getDocs(query(collection(db, CARDS_COLLECTION), where('assignedToEmail', '==', prevEmailLower))).catch(() => null)
          : Promise.resolve(null),
        needCardOwnershipCheck && cleanEmail !== prevEmailLower
          ? getDocs(query(collection(db, CARDS_COLLECTION), where('assignedToEmail', '==', cleanEmail))).catch(() => null)
          : Promise.resolve(null),
        needCardOwnershipCheck
          ? getDocs(query(collection(db, CARDS_COLLECTION), where('assignedToUid', '==', savedAdmin.id))).catch(() => null)
          : Promise.resolve(null),
        ...nextAssignedIds.flatMap((cid) => [
          getDocs(query(collection(db, ADMINS_COLLECTION), where('assignedCardIds', 'array-contains', cid)))
            .then((snap) => ({ kind: 'admin' as const, snap }))
            .catch(() => null),
          getDocs(query(collection(db, USERS_COLLECTION), where('assignedCardIds', 'array-contains', cid)))
            .then((snap) => ({ kind: 'user' as const, snap }))
            .catch(() => null),
        ]),
      ]);

      const batch = writeBatch(db);
      const normalizedRecord = cleanForFirestore(savedAdmin);

      // Canonical admin doc
      batch.set(doc(db, ADMINS_COLLECTION, savedAdmin.id), normalizedRecord);

      // Lowercase email lookup doc
      if (savedAdmin.id.toLowerCase() !== cleanEmail) {
        batch.set(
          doc(db, ADMINS_COLLECTION, cleanEmail),
          cleanForFirestore({ ...savedAdmin, aliasOf: savedAdmin.id })
        );
      }

      // Clean up stale alias docs if email changed
      if (prevEmailLower !== cleanEmail) {
        if (existing.id.toLowerCase() !== prevEmailLower) {
          batch.delete(doc(db, ADMINS_COLLECTION, prevEmailLower));
        }
        if (uidAdminsRes) {
          uidAdminsRes.forEach((aDoc) => {
            if (aDoc.id !== savedAdmin.id && aDoc.id !== cleanEmail) {
              batch.set(
                doc(db, ADMINS_COLLECTION, aDoc.id),
                cleanForFirestore({ ...savedAdmin, aliasOf: savedAdmin.id })
              );
            }
          });
        }
      }

      // Sync matching /users docs + UID alias docs
      const targetUserUids = new Set<string>();
      if (nextUsersRes) {
        nextUsersRes.forEach((uDoc) => {
          targetUserUids.add(uDoc.id);
          const uData = uDoc.data() as UserProfile;
          if (uDoc.id !== savedAdmin.id && uDoc.id.toLowerCase() !== cleanEmail) {
            batch.set(
              doc(db, ADMINS_COLLECTION, uDoc.id),
              cleanForFirestore({ ...savedAdmin, aliasOf: savedAdmin.id })
            );
          }
          batch.set(
            doc(db, USERS_COLLECTION, uDoc.id),
            cleanForFirestore({
              uid: uDoc.id,
              email: cleanEmail,
              role: savedAdmin.role,
              assignedCardIds: savedAdmin.assignedCardIds,
              accessRevoked: false,
              ...(uData.requestStatus ? { requestStatus: 'approved', requestUpdatedAt: now } : {}),
            }),
            { merge: true }
          );
        });
      }

      // Demote previous email's /users doc if email was reassigned
      if (prevUsersRes) {
        prevUsersRes.forEach((uDoc) => {
          if (uDoc.id !== savedAdmin.id) {
            batch.set(
              doc(db, USERS_COLLECTION, uDoc.id),
              cleanForFirestore({
                uid: uDoc.id,
                email: prevEmailLower,
                role: 'member',
                assignedCardIds: [],
              }),
              { merge: true }
            );
          }
        });
      }

      // Enforce exclusive card reassignment: strip newly assigned cards from any other restricted sub-admin & stamp card ownership
      if (nextSet.size > 0) {
        const strippedAdminDocs = new Set<string>();
        const strippedUserDocs = new Set<string>();
        for (const res of reassignmentResults) {
          if (!res) continue;
          if (res.kind === 'admin') {
            res.snap.forEach((aDoc) => {
              if (strippedAdminDocs.has(aDoc.id)) return;
              const aData = aDoc.data() as AdminUser;
              const aEmail = (aData.email || '').toLowerCase().trim();
              if (aEmail === cleanEmail || aDoc.id === savedAdmin.id || aData.aliasOf === savedAdmin.id || aData.role !== 'restricted') {
                return;
              }
              const curIds = Array.isArray(aData.assignedCardIds) ? aData.assignedCardIds : [];
              const filtered = curIds.filter((cid) => !nextSet.has(cid.toLowerCase()));
              if (filtered.length !== curIds.length) {
                strippedAdminDocs.add(aDoc.id);
                batch.set(
                  doc(db, ADMINS_COLLECTION, aDoc.id),
                  cleanForFirestore({ assignedCardIds: filtered, updatedAt: now }),
                  { merge: true }
                );
              }
            });
          } else {
            res.snap.forEach((uDoc) => {
              if (strippedUserDocs.has(uDoc.id) || targetUserUids.has(uDoc.id)) return;
              const uData = uDoc.data() as UserProfile;
              const uEmail = (uData.email || '').toLowerCase().trim();
              if (uEmail === cleanEmail) return;
              const curIds = Array.isArray(uData.assignedCardIds) ? uData.assignedCardIds : [];
              const filtered = curIds.filter((cid) => !nextSet.has(cid.toLowerCase()));
              if (filtered.length !== curIds.length) {
                strippedUserDocs.add(uDoc.id);
                batch.set(
                  doc(db, USERS_COLLECTION, uDoc.id),
                  cleanForFirestore({ assignedCardIds: filtered }),
                  { merge: true }
                );
              }
            });
          }
        }
        for (const cid of nextAssignedIds) {
          batch.set(
            doc(db, CARDS_COLLECTION, cid),
            cleanForFirestore({
              assignedToEmail: cleanEmail,
              assignedToUid: savedAdmin.id,
              assignedToName: savedAdmin.name,
              updatedAt: now,
            }),
            { merge: true }
          );
        }
      }

      // Clear stale card ownership fields for removed cards
      if (needCardOwnershipCheck) {
        const clearedCardIds = new Set<string>();
        const inspectCardSnap = (snap: any) => {
          if (!snap) return;
          snap.forEach((cDoc: any) => {
            if (clearedCardIds.has(cDoc.id)) return;
            const cData = cDoc.data() as CardRecord;
            if (!nextSet.has(cData.id.toLowerCase())) {
              const cEmail = (cData.assignedToEmail || '').trim().toLowerCase();
              const cUid = (cData.assignedToUid || '').trim();
              if (cEmail === prevEmailLower || cEmail === cleanEmail || cUid === savedAdmin.id) {
                clearedCardIds.add(cDoc.id);
                batch.set(
                  doc(db, CARDS_COLLECTION, cDoc.id),
                  cleanForFirestore({
                    assignedToEmail: '',
                    assignedToUid: '',
                    assignedToName: '',
                    updatedAt: now,
                  }),
                  { merge: true }
                );
              }
            }
          });
        };
        inspectCardSnap(prevCardsRes);
        inspectCardSnap(nextCardsRes);
        inspectCardSnap(uidCardsRes);
      }

      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `${ADMINS_COLLECTION}/${savedAdmin.id}`);
    }
  }

  try {
    const cleanEmail = savedAdmin.email.toLowerCase().trim();
    const existsInCache = cachedList.some((a) => a.id === savedAdmin.id);
    const updated = existsInCache
      ? cachedList.map((a) => (a.id === savedAdmin.id ? savedAdmin : a))
      : [...cachedList.filter((a) => a.email.toLowerCase().trim() !== cleanEmail), savedAdmin];
    localStorage.setItem(ADMINS_STORAGE_KEY, JSON.stringify(deduplicateAdmins(updated)));
  } catch {
    // ignore
  }

  return savedAdmin;
}

export async function deleteAdmin(id: string, caller?: CallerIdentity): Promise<boolean> {
  const cleanTargetKey = id.trim();
  let cachedList: AdminUser[] = [];
  try {
    const raw = localStorage.getItem(ADMINS_STORAGE_KEY);
    if (raw) cachedList = deduplicateAdmins(JSON.parse(raw) as AdminUser[]);
  } catch {
    // ignore
  }
  let target = cachedList.find(
    (a) => a.id === cleanTargetKey || a.email.toLowerCase().trim() === cleanTargetKey.toLowerCase()
  );
  if (!target) {
    cachedList = await fetchAdmins(caller?.email, caller?.id);
    target = cachedList.find(
      (a) => a.id === cleanTargetKey || a.email.toLowerCase().trim() === cleanTargetKey.toLowerCase()
    );
  }
  const targetId = target?.id || cleanTargetKey;
  const targetEmail = target?.email?.toLowerCase().trim() || (cleanTargetKey.includes('@') ? cleanTargetKey.toLowerCase() : '');

  if (targetEmail === PRIMARY_MASTER_EMAIL) {
    throw new Error('The primary Master Administrator cannot be deleted.');
  }

  // 1. Delete via authoritative backend API when available (tolerating static-host non-JSON 404/405)
  let backendUnavailable = false;
  try {
    const res = await fetch(`/api/admins/${encodeURIComponent(targetId)}`, {
      method: 'DELETE',
      headers: {
        ...(caller?.id ? { 'x-admin-id': caller.id } : {}),
        ...(caller?.email ? { 'x-admin-email': caller.email } : {}),
      },
    });
    if (!res.ok) {
      if (isStaticBackendUnavailable(res)) {
        backendUnavailable = true;
      } else if (res.status === 404 && auth.currentUser) {
        // Admin may exist only in Firestore; proceed to Firestore delete
        backendUnavailable = true;
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || errData.error || `Failed to delete administrator (HTTP ${res.status}).`);
      }
    }
  } catch (err: any) {
    if (err instanceof TypeError || (err?.message || '').toLowerCase().includes('failed to fetch')) {
      backendUnavailable = true;
    } else {
      throw err;
    }
  }

  if (backendUnavailable && !auth.currentUser) {
    throw new Error(
      'Firebase Google Auth session required: please sign in with Google as Master Admin to delete administrators.'
    );
  }

  // 2. Atomically delete matching admin docs in Firestore + revoke in Firestore /users using targeted queries & single batch
  if (auth.currentUser) {
    try {
      const [emailAdminsRes, aliasAdminsRes, idFieldAdminsRes, emailUsersRes] = await Promise.all([
        targetEmail
          ? getDocs(query(collection(db, ADMINS_COLLECTION), where('email', '==', targetEmail))).catch(() => null)
          : Promise.resolve(null),
        getDocs(query(collection(db, ADMINS_COLLECTION), where('aliasOf', '==', targetId))).catch(() => null),
        getDocs(query(collection(db, ADMINS_COLLECTION), where('id', '==', targetId))).catch(() => null),
        targetEmail
          ? getDocs(query(collection(db, USERS_COLLECTION), where('email', '==', targetEmail))).catch(() => null)
          : Promise.resolve(null),
      ]);

      const batch = writeBatch(db);
      const deleteAdminIds = new Set<string>([targetId]);
      if (targetEmail) deleteAdminIds.add(targetEmail);
      const collectIds = (snap: any) => {
        if (!snap) return;
        snap.forEach((d: any) => deleteAdminIds.add(d.id));
      };
      collectIds(emailAdminsRes);
      collectIds(aliasAdminsRes);
      collectIds(idFieldAdminsRes);

      deleteAdminIds.forEach((docId) => {
        if (docId) batch.delete(doc(db, ADMINS_COLLECTION, docId));
      });

      const now = new Date().toISOString();
      const userDocMap = new Map<string, string>();
      if (emailUsersRes) {
        emailUsersRes.forEach((uDoc) => {
          const uData = uDoc.data() as UserProfile;
          userDocMap.set(uDoc.id, (uData?.email || targetEmail || '').toLowerCase().trim());
        });
      }
      userDocMap.forEach((uEmail, uid) => {
        batch.set(
          doc(db, USERS_COLLECTION, uid),
          cleanForFirestore({
            uid,
            ...(uEmail ? { email: uEmail } : {}),
            role: 'member',
            assignedCardIds: [],
            accessRevoked: true,
            revokedAt: now,
          }),
          { merge: true }
        );
      });

      await batch.commit();
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, `${ADMINS_COLLECTION}/${targetId}`);
    }
  }

  // 3. Update localStorage cache without calling fetchAdmins() back immediately
  try {
    const updated = cachedList.filter(
      (a) => a.id !== targetId && (!targetEmail || a.email.toLowerCase().trim() !== targetEmail)
    );
    localStorage.setItem(ADMINS_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }

  return true;
}

/**
 * Unified Master Admin authorization workflow used by BOTH "Add & Authorize User"
 * and the Users table role selector. Writes canonical Firestore `/admins/{email}`
 * and `/users/{uid}` records atomically with zero duplicate records and full error surfacing.
 */
export async function authorizeUserAsAdmin(
  input: {
    email: string;
    displayName?: string;
    role: 'master' | 'restricted' | 'member';
    assignedCardIds?: string[];
    existingUid?: string;
  },
  caller?: CallerIdentity
): Promise<{ user: UserProfile; admin: AdminUser | null }> {
  const cleanEmail = input.email.trim().toLowerCase();
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error('Please enter a valid Google email address.');
  }

  const displayName = input.displayName?.trim() || cleanEmail.split('@')[0];
  let resolvedUid = input.existingUid?.trim() || '';
  let preservedCardIds: string[] | undefined = input.assignedCardIds;

  // Inspect existing /users records for this email to reuse existing UID (avoid duplicates)
  if (auth.currentUser) {
    try {
      const uSnap = await getDocs(query(collection(db, USERS_COLLECTION), where('email', '==', cleanEmail)));
      if (!uSnap.empty) {
        const docs = uSnap.docs.map((d) => ({ ...(d.data() as UserProfile), uid: d.id }));
        // Prefer a real Firebase OAuth UID over a synthetic google-preauth-* UID
        const preferred =
          docs.find((d) => !d.uid.startsWith('google-preauth-')) || docs[0];
        if (!resolvedUid && preferred?.uid) {
          resolvedUid = preferred.uid;
        }
        if (preservedCardIds === undefined) {
          const existingIds = docs.flatMap((d) => (Array.isArray(d.assignedCardIds) ? d.assignedCardIds : []));
          if (existingIds.length > 0) {
            preservedCardIds = Array.from(new Set(existingIds.map((c) => String(c).trim()).filter(Boolean)));
          }
        }
      }
    } catch {
      // non-fatal lookup
    }
  }

  if (!resolvedUid) {
    resolvedUid = `google-preauth-${cleanEmail.replace(/[^a-z0-9]/g, '-')}`;
  }

  if (input.role === 'restricted' || input.role === 'master') {
    // 1. Canonical admin record first (creates/updates Express + Firestore /admins/{id} & /admins/{email} + existing /users)
    const savedAdmin = await createAdmin(
      {
        id: resolvedUid,
        email: cleanEmail,
        name: displayName,
        role: input.role,
        ...(preservedCardIds !== undefined ? { assignedCardIds: preservedCardIds } : {}),
        permissions: {
          canEditCards: true,
          canToggleAi: true,
          canExportCsv: input.role === 'master',
          canCreateCards: input.role === 'master',
        },
      },
      caller,
      { upsertIfExists: true }
    );

    if (!savedAdmin) {
      throw new Error('Failed to confirm administrator authorization record.');
    }

    // 2. Ensure matching /users profile exists and reflects canonical role & card assignments
    const savedUser = await saveUser(
      {
        uid: resolvedUid,
        email: cleanEmail,
        displayName,
        provider: 'google.com',
        role: savedAdmin.role,
        emailVerified: true,
        accessRevoked: false,
        assignedCardIds: savedAdmin.assignedCardIds || [],
      },
      caller
    );

    return { user: savedUser, admin: savedAdmin };
  }

  // Demoting or adding as Viewer ('member')
  const savedUser = await saveUser(
    {
      uid: resolvedUid,
      email: cleanEmail,
      displayName,
      provider: 'google.com',
      role: 'member',
      emailVerified: true,
      accessRevoked: false,
      assignedCardIds: [],
    },
    caller
  );

  try {
    await deleteAdmin(cleanEmail, caller);
  } catch (delErr: any) {
    const msg = (delErr?.message || '').toLowerCase();
    if (!msg.includes('not found') && !msg.includes('404')) {
      console.warn('Viewer role admin cleanup notice:', delErr);
    }
  }

  return { user: savedUser, admin: null };
}

// ---------------- Users & Google Verified Logins Layer ----------------
const USERS_COLLECTION = 'users';
const USERS_STORAGE_KEY = '3dbysd_smart_reviews_users';

export interface SessionAuthResult {
  authorized: boolean;
  revoked: boolean;
  role: 'master' | 'restricted' | 'member';
  admin?: AdminUser;
  message?: string;
  requestStatus?: 'pending' | 'approved' | 'rejected';
  requestedAt?: string;
  requestUpdatedAt?: string;
  requestNote?: string;
}

export async function checkSessionAuthorization(
  email: string,
  uid?: string,
  options?: { fresh?: boolean }
): Promise<SessionAuthResult> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanUid = uid ? uid.trim() : auth.currentUser?.uid || '';
  if (cleanEmail === PRIMARY_MASTER_EMAIL) {
    return { authorized: true, revoked: false, role: 'master', requestStatus: 'approved' };
  }

  const readDocSmart = async (ref: ReturnType<typeof doc>) => {
    if (options?.fresh) {
      try {
        return await getDocFromServer(ref);
      } catch {
        return await getDoc(ref).catch(() => null);
      }
    }
    return await getDoc(ref).catch(() => null);
  };

  let serverResult: SessionAuthResult | null = null;

  // 1. Check backend session-status endpoint (safely ignoring static-host non-JSON 404/405)
  try {
    const params = new URLSearchParams({ email: cleanEmail });
    if (cleanUid) params.set('uid', cleanUid);
    const res = await fetch(`/api/auth/session-status?${params.toString()}`, {
      cache: options?.fresh ? 'no-store' : 'default',
    });
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data.success) {
        serverResult = {
          authorized: Boolean(data.authorized),
          revoked: Boolean(data.revoked),
          role: data.role || 'member',
          admin: data.admin,
          message: data.message,
          requestStatus: data.requestStatus,
          requestedAt: data.requestedAt,
          requestUpdatedAt: data.requestUpdatedAt,
          requestNote: data.requestNote,
        };
      }
    }
  } catch {
    // fallback to Firestore check below
  }

  // 2. Check Firestore directly when Firebase Auth session is active (reconciles Firestore-only or multi-instance writes)
  let fsAdmin: AdminUser | undefined;
  let fsPromotedUser: UserProfile | undefined;
  let fsRequestUser: UserProfile | undefined;
  let fsRevoked = false;
  if (auth.currentUser) {
    try {
      const authEmail = (auth.currentUser.email || cleanEmail || '').toLowerCase().trim();
      const [
        emailAdminSnap,
        uidAdminSnap,
        emailAdminsQuerySnap,
        uidUserSnap,
        emailUsersQuerySnap,
      ] = await Promise.all([
        cleanEmail ? readDocSmart(doc(db, ADMINS_COLLECTION, cleanEmail)) : Promise.resolve(null),
        cleanUid ? readDocSmart(doc(db, ADMINS_COLLECTION, cleanUid)) : Promise.resolve(null),
        authEmail
          ? getDocs(query(collection(db, ADMINS_COLLECTION), where('email', '==', authEmail))).catch(() => null)
          : Promise.resolve(null),
        cleanUid ? readDocSmart(doc(db, USERS_COLLECTION, cleanUid)) : Promise.resolve(null),
        authEmail
          ? getDocs(query(collection(db, USERS_COLLECTION), where('email', '==', authEmail))).catch(() => null)
          : Promise.resolve(null),
      ]);

      const foundAdmins: AdminUser[] = [];
      if (uidAdminSnap?.exists()) foundAdmins.push(uidAdminSnap.data() as AdminUser);
      if (emailAdminSnap?.exists()) foundAdmins.push(emailAdminSnap.data() as AdminUser);
      if (emailAdminsQuerySnap) {
        emailAdminsQuerySnap.forEach((d) => foundAdmins.push(d.data() as AdminUser));
      }
      const dedupedAdmins = deduplicateAdmins(
        foundAdmins.map((a) => ({ ...a, email: (a.email || cleanEmail).toLowerCase().trim() }))
      );
      fsAdmin = dedupedAdmins[0];

      const foundUsers: UserProfile[] = [];
      if (uidUserSnap?.exists()) foundUsers.push(uidUserSnap.data() as UserProfile);
      if (emailUsersQuerySnap) {
        emailUsersQuerySnap.forEach((d) => foundUsers.push(d.data() as UserProfile));
      }

      const revokedDocs = foundUsers.filter((u) => Boolean(u.accessRevoked));
      const latestRevokedTime = revokedDocs.reduce((max, u) => {
        const t = u.revokedAt ? new Date(u.revokedAt).getTime() : 0;
        return t > max ? t : max;
      }, 0);
      const fsAdminTime = fsAdmin
        ? new Date(fsAdmin.updatedAt || fsAdmin.createdAt || 0).getTime()
        : 0;

      fsRevoked = revokedDocs.length > 0 && (!fsAdmin || latestRevokedTime > fsAdminTime);
      fsPromotedUser = foundUsers.find(
        (u) => !u.accessRevoked && (u.role === 'restricted' || u.role === 'master')
      );
      fsRequestUser = foundUsers
        .filter((u) => Boolean(u.requestStatus))
        .sort((a, b) => {
          const ta = new Date(a.requestUpdatedAt || a.requestedAt || 0).getTime();
          const tb = new Date(b.requestUpdatedAt || b.requestedAt || 0).getTime();
          return tb - ta;
        })[0];
    } catch {
      // ignore
    }
  }

  const pickRequestMeta = () => {
    const fsReqTime = fsRequestUser
      ? new Date(fsRequestUser.requestUpdatedAt || fsRequestUser.requestedAt || 0).getTime()
      : 0;
    const srvReqTime = serverResult?.requestUpdatedAt || serverResult?.requestedAt
      ? new Date(serverResult.requestUpdatedAt || serverResult.requestedAt || 0).getTime()
      : 0;
    if (fsRequestUser && fsReqTime >= srvReqTime) {
      return {
        requestStatus: fsRequestUser.requestStatus,
        requestedAt: fsRequestUser.requestedAt,
        requestUpdatedAt: fsRequestUser.requestUpdatedAt,
        requestNote: fsRequestUser.requestNote,
      };
    }
    return {
      requestStatus: serverResult?.requestStatus || fsRequestUser?.requestStatus,
      requestedAt: serverResult?.requestedAt || fsRequestUser?.requestedAt,
      requestUpdatedAt: serverResult?.requestUpdatedAt || fsRequestUser?.requestUpdatedAt,
      requestNote: serverResult?.requestNote || fsRequestUser?.requestNote,
    };
  };

  const reqMeta = pickRequestMeta();

  // If explicitly revoked by Master Admin in either store (and no active non-revoked Master-synced admin record overrides)
  if ((serverResult?.revoked && !fsAdmin) || (fsRevoked && !serverResult?.authorized)) {
    return {
      authorized: false,
      revoked: true,
      role: 'member',
      ...reqMeta,
      message: serverResult?.message || 'Your administrator access has been revoked by the Master Admin.',
    };
  }

  // Reconcile freshest active AdminUser between server and Firestore
  if (serverResult?.authorized && fsAdmin && !fsRevoked) {
    const srvTime = serverResult.admin?.updatedAt ? new Date(serverResult.admin.updatedAt).getTime() : 0;
    const fsTime = fsAdmin.updatedAt ? new Date(fsAdmin.updatedAt).getTime() : 0;
    const chosen = fsTime >= srvTime ? { ...fsAdmin, email: fsAdmin.email.toLowerCase().trim() } : (serverResult.admin || fsAdmin);
    return {
      authorized: true,
      revoked: false,
      role: chosen.role,
      admin: chosen,
      ...reqMeta,
      requestStatus: reqMeta.requestStatus || 'approved',
    };
  }

  if (serverResult?.authorized && !fsRevoked) {
    return { ...serverResult, ...reqMeta, requestStatus: reqMeta.requestStatus || 'approved' };
  }

  // If Firestore /admins has an active admin record and user is not revoked
  if (fsAdmin && !fsRevoked) {
    return {
      authorized: true,
      revoked: false,
      role: fsAdmin.role,
      admin: { ...fsAdmin, email: fsAdmin.email.toLowerCase().trim() },
      ...reqMeta,
      requestStatus: reqMeta.requestStatus || 'approved',
    };
  }

  // If Firestore /users explicitly holds an active admin/sub-admin role promoted by Master Admin
  if (fsPromotedUser && !fsRevoked) {
    return {
      authorized: true,
      revoked: false,
      role: fsPromotedUser.role,
      admin: {
        id: fsPromotedUser.uid,
        email: fsPromotedUser.email.toLowerCase().trim(),
        name: fsPromotedUser.displayName || cleanEmail.split('@')[0],
        role: fsPromotedUser.role === 'master' ? 'master' : 'restricted',
        assignedCardIds: Array.isArray(fsPromotedUser.assignedCardIds) ? fsPromotedUser.assignedCardIds : [],
        permissions: {
          canEditCards: true,
          canToggleAi: true,
          canExportCsv: fsPromotedUser.role === 'master',
          canCreateCards: fsPromotedUser.role === 'master',
        },
        createdAt: fsPromotedUser.createdAt || new Date().toISOString(),
        updatedAt: fsPromotedUser.lastLoginAt || new Date().toISOString(),
      },
      ...reqMeta,
      requestStatus: reqMeta.requestStatus || 'approved',
    };
  }

  return {
    ...(serverResult || { authorized: false, revoked: false, role: 'member' as const }),
    ...reqMeta,
  };
}

export async function fetchUsers(): Promise<UserProfile[]> {
  let firestoreUsers: UserProfile[] = [];
  if (auth.currentUser) {
    try {
      const snapshot = await getDocs(collection(db, USERS_COLLECTION));
      if (!snapshot.empty) {
        snapshot.forEach((d) => {
          firestoreUsers.push(d.data() as UserProfile);
        });
      }
    } catch (err) {
      console.warn('Firestore fetchUsers notice:', err);
    }
  }

  let serverUsers: UserProfile[] = [];
  let serverOk = false;
  try {
    const res = await fetch('/api/users');
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data.success && Array.isArray(data.users)) {
        serverOk = true;
        serverUsers = data.users;
      }
    }
  } catch {
    // fallback
  }

  if (serverOk || firestoreUsers.length > 0) {
    const mergedMap = new Map<string, UserProfile>();
    for (const fu of firestoreUsers) {
      mergedMap.set(fu.email.toLowerCase(), fu);
    }
    for (const su of serverUsers) {
      const key = su.email.toLowerCase();
      const existing = mergedMap.get(key);
      if (!existing) {
        mergedMap.set(key, su);
      } else {
        // Prefer whichever explicitly recorded revocation or newer login
        const suTime = su.lastLoginAt ? new Date(su.lastLoginAt).getTime() : 0;
        const exTime = existing.lastLoginAt ? new Date(existing.lastLoginAt).getTime() : 0;
        if (su.accessRevoked || suTime >= exTime) {
          mergedMap.set(key, su);
        }
      }
    }
    const list = Array.from(mergedMap.values());
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(list));
    return list;
  }

  const saved = localStorage.getItem(USERS_STORAGE_KEY);
  if (saved) {
    try {
      return JSON.parse(saved) as UserProfile[];
    } catch {
      // ignore
    }
  }

  return [
    {
      uid: 'google-user-66shashwatkumar66',
      email: PRIMARY_MASTER_EMAIL,
      displayName: 'Shashwat Kumar',
      photoURL: 'https://api.dicebear.com/7.x/initials/svg?seed=SK&backgroundColor=1a73e8&textColor=ffffff',
      provider: 'google.com',
      role: 'master',
      emailVerified: true,
      lastLoginAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      loginCount: 1,
      device: 'Web Browser (Google Verified)',
      assignedCardIds: [],
    },
  ];
}

export async function saveUser(
  user: Partial<UserProfile> & { uid: string; email: string },
  caller?: CallerIdentity
): Promise<UserProfile> {
  const cleanEmail = user.email.trim().toLowerCase();
  const now = new Date().toISOString();
  const isMaster = cleanEmail === PRIMARY_MASTER_EMAIL;

  const fullUser: UserProfile = {
    uid: user.uid,
    email: cleanEmail,
    displayName: user.displayName || cleanEmail.split('@')[0],
    photoURL:
      user.photoURL ||
      `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(cleanEmail)}&backgroundColor=1a73e8&textColor=ffffff`,
    provider: user.provider || 'google.com',
    role: isMaster ? 'master' : (user.role || 'member'),
    emailVerified: user.emailVerified !== undefined ? user.emailVerified : true,
    lastLoginAt: now,
    createdAt: user.createdAt || now,
    loginCount: user.loginCount || 1,
    device: user.device || (typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 50) : 'Web Browser'),
    assignedCardIds: user.assignedCardIds || [],
    ...(user.accessRevoked !== undefined ? { accessRevoked: user.accessRevoked } : {}),
    ...(user.requestStatus !== undefined ? { requestStatus: user.requestStatus } : {}),
    ...(user.requestedAt !== undefined ? { requestedAt: user.requestedAt } : {}),
    ...(user.requestUpdatedAt !== undefined ? { requestUpdatedAt: user.requestUpdatedAt } : {}),
    ...(user.requestReviewedBy !== undefined ? { requestReviewedBy: user.requestReviewedBy } : {}),
    ...(user.requestNote !== undefined ? { requestNote: user.requestNote } : {}),
  };

  // 1. Authoritative backend save & revocation check (gracefully tolerating static-host HTML 404/405)
  let finalUser = fullUser;
  let backendUnavailable = false;
  try {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(caller?.id ? { 'x-admin-id': caller.id } : {}),
        ...(caller?.email ? { 'x-admin-email': caller.email } : {}),
      },
      body: JSON.stringify(fullUser),
    });

    if (res.status === 403) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(
        errData.message || 'Access denied: Your administrator access has been revoked by the Master Admin.'
      );
    }

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json().catch(() => ({}));
      if (data.user) {
        const srvUser = data.user as UserProfile;
        const callerRequestedDemotion = Boolean(caller) && user.role === 'member';
        // Guard against unsynced container data/admins.json downgrading a Firestore-verified Sub-Admin back to 'member'
        if (
          !callerRequestedDemotion &&
          srvUser.role === 'member' &&
          !srvUser.accessRevoked &&
          (fullUser.role === 'restricted' || fullUser.role === 'master') &&
          auth.currentUser
        ) {
          const fsVerified = await checkSessionAuthorization(cleanEmail, user.uid).catch(() => null);
          if (
            fsVerified?.authorized &&
            !fsVerified.revoked &&
            (fsVerified.role === 'restricted' || fsVerified.role === 'master')
          ) {
            finalUser = {
              ...srvUser,
              role: fsVerified.role,
              assignedCardIds: fsVerified.admin?.assignedCardIds ?? fullUser.assignedCardIds ?? [],
            };
          } else {
            finalUser = srvUser;
          }
        } else {
          finalUser = srvUser;
        }
      }
    } else if (isStaticBackendUnavailable(res) || !contentType.includes('application/json')) {
      backendUnavailable = true;
    }
  } catch (err: any) {
    if (err instanceof TypeError || (err?.message || '').toLowerCase().includes('failed to fetch')) {
      backendUnavailable = true;
    } else {
      throw err;
    }
  }

  // 2. Sync to Firestore (only write fields allowed by rules for non-master self-writes)
  if (auth.currentUser) {
    const callerIsMaster = auth.currentUser.email?.toLowerCase().trim() === PRIMARY_MASTER_EMAIL;
    try {
      if (callerIsMaster) {
        await setDoc(doc(db, USERS_COLLECTION, finalUser.uid), cleanForFirestore(finalUser), { merge: true });
      } else if (auth.currentUser.uid === finalUser.uid) {
        const existingSnap = await getDoc(doc(db, USERS_COLLECTION, finalUser.uid)).catch(() => null);
        if (existingSnap?.exists()) {
          // Allow syncing role when it matches Master-authorized /admins/{email}; fall back to safe profile-only merge
          try {
            const { accessRevoked: _ar, revokedAt: _ra, ...syncableUpdates } = finalUser;
            await setDoc(doc(db, USERS_COLLECTION, finalUser.uid), cleanForFirestore(syncableUpdates), {
              merge: true,
            });
          } catch {
            const { role: _r, accessRevoked: _ar, revokedAt: _ra, ...safeUpdates } = finalUser;
            await setDoc(doc(db, USERS_COLLECTION, finalUser.uid), cleanForFirestore(safeUpdates), {
              merge: true,
            });
          }
        } else {
          try {
            await setDoc(
              doc(db, USERS_COLLECTION, finalUser.uid),
              cleanForFirestore({ ...finalUser, accessRevoked: false }),
              { merge: true }
            );
          } catch {
            await setDoc(
              doc(db, USERS_COLLECTION, finalUser.uid),
              cleanForFirestore({ ...finalUser, role: 'member', accessRevoked: false }),
              { merge: true }
            );
          }
        }
      }
    } catch (err) {
      if (callerIsMaster) {
        handleFirestoreError(err, OperationType.WRITE, `${USERS_COLLECTION}/${finalUser.uid}`);
      }
      console.warn('Firestore saveUser notice:', err);
    }
  } else if (backendUnavailable && caller) {
    throw new Error(
      'Firebase Google Auth session required: please sign in with Google as Master Admin to save users.'
    );
  }

  // 3. Save to localStorage cache
  try {
    const cachedRaw = localStorage.getItem(USERS_STORAGE_KEY);
    const existing: UserProfile[] = cachedRaw ? JSON.parse(cachedRaw) : [];
    const idx = existing.findIndex((u) => u.uid === finalUser.uid || u.email.toLowerCase() === cleanEmail);
    let updated: UserProfile[];
    if (idx !== -1) {
      updated = [...existing];
      updated[idx] = { ...updated[idx], ...finalUser };
    } else {
      updated = [finalUser, ...existing];
    }
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }

  return finalUser;
}

export async function deleteUser(uid: string, caller?: CallerIdentity): Promise<boolean> {
  // 1. Delete on authoritative backend when available (tolerating static-host HTML 404/405)
  let backendUnavailable = false;
  try {
    const res = await fetch(`/api/users/${encodeURIComponent(uid)}`, {
      method: 'DELETE',
      headers: {
        ...(caller?.id ? { 'x-admin-id': caller.id } : {}),
        ...(caller?.email ? { 'x-admin-email': caller.email } : {}),
      },
    });
    if (!res.ok) {
      if (isStaticBackendUnavailable(res) || res.status === 404) {
        backendUnavailable = true;
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || errData.error || `Failed to delete user (HTTP ${res.status}).`);
      }
    }
  } catch (err: any) {
    if (err instanceof TypeError || (err?.message || '').toLowerCase().includes('failed to fetch')) {
      backendUnavailable = true;
    } else {
      throw err;
    }
  }

  if (backendUnavailable && !auth.currentUser) {
    throw new Error(
      'Firebase Google Auth session required: please sign in with Google as Master Admin to remove users.'
    );
  }

  // 2. Delete in Firestore
  if (auth.currentUser) {
    try {
      await deleteDoc(doc(db, USERS_COLLECTION, uid));
    } catch (err) {
      if (backendUnavailable) {
        handleFirestoreError(err, OperationType.DELETE, `${USERS_COLLECTION}/${uid}`);
      }
      console.warn('Firestore deleteUser notice:', err);
    }
  }

  // 3. Update local cache
  try {
    const cachedRaw = localStorage.getItem(USERS_STORAGE_KEY);
    if (cachedRaw) {
      const existing = JSON.parse(cachedRaw) as UserProfile[];
      const updated = existing.filter((u) => u.uid !== uid);
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updated));
    }
  } catch {
    // ignore
  }

  return true;
}

// ---------------- Pending Sub-Admin Access Requests Layer ----------------

export async function submitAdminAccessRequest(input: {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  note?: string;
}): Promise<UserProfile> {
  const cleanEmail = input.email.trim().toLowerCase();
  const cleanUid = input.uid.trim();
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || !cleanUid) {
    throw new Error('Valid Google account email and UID are required to request access.');
  }

  const now = new Date().toISOString();
  const cleanNote = input.note?.trim() ? input.note.trim().slice(0, 300) : undefined;
  let savedUser: UserProfile = {
    uid: cleanUid,
    email: cleanEmail,
    displayName: input.displayName?.trim() || cleanEmail.split('@')[0],
    photoURL:
      input.photoURL ||
      `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(cleanEmail)}&backgroundColor=1a73e8&textColor=ffffff`,
    provider: 'google.com',
    role: 'member',
    emailVerified: true,
    lastLoginAt: now,
    createdAt: now,
    loginCount: 1,
    assignedCardIds: [],
    accessRevoked: false,
    requestStatus: 'pending',
    requestedAt: now,
    requestUpdatedAt: now,
    ...(cleanNote ? { requestNote: cleanNote } : {}),
  };

  let backendUnavailable = false;
  try {
    const res = await fetch('/api/admin-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: cleanUid,
        email: cleanEmail,
        displayName: savedUser.displayName,
        photoURL: savedUser.photoURL,
        note: cleanNote,
      }),
    });
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (res.ok && ct.includes('application/json')) {
      const data = await res.json().catch(() => ({}));
      if (data.user) savedUser = data.user as UserProfile;
    } else if (isStaticBackendUnavailable(res) || !ct.includes('application/json')) {
      backendUnavailable = true;
    } else {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || errData.error || 'Failed to submit Sub-Admin access request.');
    }
  } catch (err: any) {
    if (err instanceof TypeError || (err?.message || '').toLowerCase().includes('failed to fetch')) {
      backendUnavailable = true;
    } else {
      throw err;
    }
  }

  if (backendUnavailable && !auth.currentUser) {
    throw new Error('Please sign in with Google to submit a Sub-Admin access request.');
  }

  if (auth.currentUser && auth.currentUser.uid === cleanUid) {
    try {
      const userDocRef = doc(db, USERS_COLLECTION, cleanUid);
      const existingSnap = await getDoc(userDocRef).catch(() => null);
      if (existingSnap?.exists()) {
        const existingData = existingSnap.data() as UserProfile;
        if (existingData.accessRevoked) {
          throw new Error('Your administrator access was revoked by the Master Admin.');
        }
        const mergePayload: Record<string, any> = {
          uid: cleanUid,
          email: cleanEmail,
          displayName: savedUser.displayName,
          photoURL: savedUser.photoURL,
          lastLoginAt: now,
          requestStatus: existingData.role === 'restricted' || existingData.role === 'master' ? 'approved' : 'pending',
          requestedAt: existingData.requestStatus === 'pending' && existingData.requestedAt ? existingData.requestedAt : now,
          requestUpdatedAt: now,
          ...(cleanNote ? { requestNote: cleanNote } : {}),
        };
        await setDoc(userDocRef, cleanForFirestore(mergePayload), { merge: true });
        savedUser = { ...existingData, ...mergePayload } as UserProfile;
      } else {
        await setDoc(userDocRef, cleanForFirestore(savedUser), { merge: true });
      }
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, `${USERS_COLLECTION}/${cleanUid}`);
    }
  }

  return savedUser;
}

export async function fetchAdminRequests(caller?: CallerIdentity): Promise<UserProfile[]> {
  const map = new Map<string, UserProfile>();

  if (auth.currentUser) {
    try {
      const snap = await getDocs(collection(db, USERS_COLLECTION));
      snap.forEach((d) => {
        const u = d.data() as UserProfile;
        if (u && u.email && u.requestStatus && u.email.toLowerCase().trim() !== PRIMARY_MASTER_EMAIL) {
          const emailKey = u.email.toLowerCase().trim();
          const prev = map.get(emailKey);
          const uTime = new Date(u.requestUpdatedAt || u.requestedAt || u.lastLoginAt || 0).getTime();
          const pTime = prev ? new Date(prev.requestUpdatedAt || prev.requestedAt || prev.lastLoginAt || 0).getTime() : -1;
          if (!prev || uTime >= pTime) {
            map.set(emailKey, { ...u, uid: d.id, email: emailKey });
          }
        }
      });
    } catch (err) {
      console.warn('Firestore fetchAdminRequests notice:', err);
    }
  }

  try {
    const res = await fetch('/api/admin-requests', {
      headers: {
        ...(caller?.id ? { 'x-admin-id': caller.id } : {}),
        ...(caller?.email ? { 'x-admin-email': caller.email } : {}),
      },
    });
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (res.ok && ct.includes('application/json')) {
      const data = await res.json();
      if (data.success && Array.isArray(data.requests)) {
        for (const reqUser of data.requests as UserProfile[]) {
          if (!reqUser?.email) continue;
          const emailKey = reqUser.email.toLowerCase().trim();
          const existing = map.get(emailKey);
          const rTime = new Date(reqUser.requestUpdatedAt || reqUser.requestedAt || 0).getTime();
          const eTime = existing ? new Date(existing.requestUpdatedAt || existing.requestedAt || 0).getTime() : -1;
          if (!existing || rTime > eTime) {
            map.set(emailKey, { ...reqUser, email: emailKey });
          }
        }
      }
    }
  } catch {
    // ignore when Express backend is unavailable
  }

  return Array.from(map.values()).sort((a, b) => {
    const ta = new Date(a.requestedAt || a.createdAt || 0).getTime();
    const tb = new Date(b.requestedAt || b.createdAt || 0).getTime();
    return tb - ta;
  });
}

export async function approveAdminRequest(
  target: Pick<UserProfile, 'uid' | 'email' | 'displayName' | 'assignedCardIds'>,
  caller?: CallerIdentity,
  assignedCardIds?: string[]
): Promise<{ user: UserProfile; admin: AdminUser }> {
  const cleanEmail = target.email.trim().toLowerCase();
  const displayName = target.displayName?.trim() || cleanEmail.split('@')[0];
  const now = new Date().toISOString();
  const reviewer = (caller?.email || auth.currentUser?.email || PRIMARY_MASTER_EMAIL).toLowerCase().trim();

  // 1. Call Express approval endpoint when available
  let serverAdmin: AdminUser | null = null;
  let serverUser: UserProfile | null = null;
  let backendUnavailable = false;
  try {
    const res = await fetch(`/api/admin-requests/${encodeURIComponent(target.uid || cleanEmail)}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(caller?.id ? { 'x-admin-id': caller.id } : {}),
        ...(caller?.email ? { 'x-admin-email': caller.email } : {}),
      },
      body: JSON.stringify({
        email: cleanEmail,
        displayName,
        ...(assignedCardIds !== undefined ? { assignedCardIds } : {}),
      }),
    });
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (res.ok && ct.includes('application/json')) {
      const data = await res.json().catch(() => ({}));
      serverAdmin = data.admin || null;
      serverUser = data.user || null;
    } else if (isStaticBackendUnavailable(res) || !ct.includes('application/json')) {
      backendUnavailable = true;
    } else {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || errData.error || 'Failed to approve Sub-Admin request.');
    }
  } catch (err: any) {
    if (err instanceof TypeError || (err?.message || '').toLowerCase().includes('failed to fetch')) {
      backendUnavailable = true;
    } else {
      throw err;
    }
  }

  if (backendUnavailable && !auth.currentUser) {
    throw new Error('Firebase Google Auth session required: sign in with Google as Master Admin to approve requests.');
  }

  // 2. Commit canonical /admins + /users approval atomically in Firestore
  const result = await authorizeUserAsAdmin(
    {
      email: cleanEmail,
      displayName,
      role: 'restricted',
      assignedCardIds: assignedCardIds ?? serverAdmin?.assignedCardIds ?? target.assignedCardIds,
      existingUid: target.uid,
    },
    caller
  );

  if (auth.currentUser) {
    try {
      const usersSnap = await getDocs(query(collection(db, USERS_COLLECTION), where('email', '==', cleanEmail)));
      const batch = writeBatch(db);
      const touched = new Set<string>();
      usersSnap.forEach((uDoc) => {
        touched.add(uDoc.id);
        batch.set(
          doc(db, USERS_COLLECTION, uDoc.id),
          cleanForFirestore({
            uid: uDoc.id,
            email: cleanEmail,
            role: 'restricted',
            accessRevoked: false,
            requestStatus: 'approved',
            requestUpdatedAt: now,
            requestReviewedBy: reviewer,
          }),
          { merge: true }
        );
      });
      if (target.uid && !touched.has(target.uid)) {
        batch.set(
          doc(db, USERS_COLLECTION, target.uid),
          cleanForFirestore({
            uid: target.uid,
            email: cleanEmail,
            displayName,
            role: 'restricted',
            accessRevoked: false,
            requestStatus: 'approved',
            requestUpdatedAt: now,
            requestReviewedBy: reviewer,
          }),
          { merge: true }
        );
      }
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `${USERS_COLLECTION}/${target.uid}`);
    }
  }

  return {
    admin: result.admin || serverAdmin!,
    user: {
      ...(serverUser || result.user),
      role: 'restricted',
      accessRevoked: false,
      requestStatus: 'approved',
      requestUpdatedAt: now,
      requestReviewedBy: reviewer,
    },
  };
}

export async function rejectAdminRequest(
  target: Pick<UserProfile, 'uid' | 'email' | 'displayName'>,
  caller?: CallerIdentity
): Promise<UserProfile> {
  const cleanEmail = target.email.trim().toLowerCase();
  const displayName = target.displayName?.trim() || cleanEmail.split('@')[0];
  const now = new Date().toISOString();
  const reviewer = (caller?.email || auth.currentUser?.email || PRIMARY_MASTER_EMAIL).toLowerCase().trim();

  let serverUser: UserProfile | null = null;
  let backendUnavailable = false;
  try {
    const res = await fetch(`/api/admin-requests/${encodeURIComponent(target.uid || cleanEmail)}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(caller?.id ? { 'x-admin-id': caller.id } : {}),
        ...(caller?.email ? { 'x-admin-email': caller.email } : {}),
      },
      body: JSON.stringify({ email: cleanEmail, displayName }),
    });
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (res.ok && ct.includes('application/json')) {
      const data = await res.json().catch(() => ({}));
      serverUser = data.user || null;
    } else if (isStaticBackendUnavailable(res) || !ct.includes('application/json')) {
      backendUnavailable = true;
    } else {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || errData.error || 'Failed to reject Sub-Admin request.');
    }
  } catch (err: any) {
    if (err instanceof TypeError || (err?.message || '').toLowerCase().includes('failed to fetch')) {
      backendUnavailable = true;
    } else {
      throw err;
    }
  }

  if (backendUnavailable && !auth.currentUser) {
    throw new Error('Firebase Google Auth session required: sign in with Google as Master Admin to reject requests.');
  }

  if (auth.currentUser) {
    try {
      const [usersSnap, emailAdminsSnap] = await Promise.all([
        getDocs(query(collection(db, USERS_COLLECTION), where('email', '==', cleanEmail))),
        getDocs(query(collection(db, ADMINS_COLLECTION), where('email', '==', cleanEmail))).catch(() => null),
      ]);
      const batch = writeBatch(db);
      const touched = new Set<string>();
      usersSnap.forEach((uDoc) => {
        touched.add(uDoc.id);
        batch.set(
          doc(db, USERS_COLLECTION, uDoc.id),
          cleanForFirestore({
            uid: uDoc.id,
            email: cleanEmail,
            role: 'member',
            assignedCardIds: [],
            requestStatus: 'rejected',
            requestUpdatedAt: now,
            requestReviewedBy: reviewer,
          }),
          { merge: true }
        );
      });
      if (target.uid && !touched.has(target.uid)) {
        batch.set(
          doc(db, USERS_COLLECTION, target.uid),
          cleanForFirestore({
            uid: target.uid,
            email: cleanEmail,
            displayName,
            role: 'member',
            assignedCardIds: [],
            requestStatus: 'rejected',
            requestUpdatedAt: now,
            requestReviewedBy: reviewer,
          }),
          { merge: true }
        );
      }
      // Ensure no stale /admins docs exist for rejected user
      batch.delete(doc(db, ADMINS_COLLECTION, cleanEmail));
      if (target.uid) batch.delete(doc(db, ADMINS_COLLECTION, target.uid));
      if (emailAdminsSnap) {
        emailAdminsSnap.forEach((aDoc) => batch.delete(doc(db, ADMINS_COLLECTION, aDoc.id)));
      }
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `${USERS_COLLECTION}/${target.uid}`);
    }
  }

  return (
    serverUser || {
      uid: target.uid,
      email: cleanEmail,
      displayName,
      provider: 'google.com',
      role: 'member',
      emailVerified: true,
      lastLoginAt: now,
      createdAt: now,
      loginCount: 0,
      assignedCardIds: [],
      accessRevoked: false,
      requestStatus: 'rejected',
      requestUpdatedAt: now,
      requestReviewedBy: reviewer,
    }
  );
}

const QR_LOGS_COLLECTION = 'qr_logs';

export interface FetchLogsOptions {
  cardId?: string;
  businessName?: string;
  search?: string;
  source?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number | 'all';
  adminId?: string;
  adminEmail?: string;
  allowedCardIds?: string[];
}

export async function fetchQrLogs(
  options: FetchLogsOptions = {}
): Promise<{ logs: QRScanLog[]; totalCount: number; totalPages?: number }> {
  const queryParams = new URLSearchParams();
  if (options.cardId && options.cardId !== 'all') queryParams.set('cardId', options.cardId);
  if (options.businessName && options.businessName !== 'all') queryParams.set('businessName', options.businessName);
  if (options.search) queryParams.set('search', options.search);
  if (options.source && options.source !== 'all') queryParams.set('source', options.source);
  if (options.startDate) queryParams.set('startDate', options.startDate);
  if (options.endDate) queryParams.set('endDate', options.endDate);
  if (options.page) queryParams.set('page', String(options.page));
  if (options.limit) queryParams.set('limit', String(options.limit));

  const url = `/api/logs${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

  try {
    const res = await fetch(url, {
      headers: {
        ...(options.adminId ? { 'x-admin-id': options.adminId } : {}),
        ...(options.adminEmail ? { 'x-admin-email': options.adminEmail } : {}),
      },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.logs)) {
        return {
          logs: data.logs,
          totalCount: data.totalCount || data.logs.length,
          totalPages: data.totalPages || 1,
        };
      }
    }
  } catch (err) {
    console.warn('Backend /api/logs fetch notice, falling back to Firestore:', err);
  }

  // Firestore direct fallback (strictly scoped for non-master callers)
  try {
    if (Array.isArray(options.allowedCardIds) && options.allowedCardIds.length === 0) {
      return { logs: [], totalCount: 0, totalPages: 1 };
    }
    const firestoreLogs: QRScanLog[] = [];
    if (Array.isArray(options.allowedCardIds)) {
      const uniqueIds = Array.from(new Set(options.allowedCardIds));
      for (let i = 0; i < uniqueIds.length; i += 30) {
        const chunk = uniqueIds.slice(i, i + 30);
        const snap = await getDocs(
          query(collection(db, QR_LOGS_COLLECTION), where('cardId', 'in', chunk))
        );
        snap.forEach((docSnap) => {
          firestoreLogs.push(docSnap.data() as QRScanLog);
        });
      }
    } else {
      const snap = await getDocs(collection(db, QR_LOGS_COLLECTION));
      snap.forEach((docSnap) => {
        firestoreLogs.push(docSnap.data() as QRScanLog);
      });
    }
    firestoreLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    let filtered = firestoreLogs;
    if (Array.isArray(options.allowedCardIds)) {
      const allowedSet = new Set(options.allowedCardIds.map((cid) => cid.toLowerCase()));
      filtered = filtered.filter((l) => allowedSet.has(l.cardId.toLowerCase()));
    }
    if (options.cardId && options.cardId !== 'all') {
      filtered = filtered.filter((l) => l.cardId.toLowerCase() === options.cardId!.toLowerCase());
    }
    if (options.search) {
      const t = options.search.toLowerCase();
      filtered = filtered.filter((l) => l.cardId.includes(t) || l.businessName.toLowerCase().includes(t));
    }

    return {
      logs: filtered,
      totalCount: filtered.length,
      totalPages: 1,
    };
  } catch (fsErr) {
    console.error('Firestore logs fetch error:', fsErr);
    return { logs: [], totalCount: 0, totalPages: 1 };
  }
}

export async function recordQrScanLog(payload: {
  cardId: string;
  source?: 'qr' | 'nfc' | 'direct' | 'simulator';
  businessName?: string;
  category?: string;
}): Promise<QRScanLog | null> {
  const scanLogId = `log-${payload.cardId}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();
  const scanLog: QRScanLog = {
    id: scanLogId,
    cardId: payload.cardId,
    businessName: payload.businessName || `Stand #${payload.cardId}`,
    category: payload.category || 'Customer Experience',
    timestamp: now,
    scannedAt: now,
    source: payload.source || 'qr',
    device: typeof navigator !== 'undefined' ? (navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Desktop') : 'Web',
    referrer: typeof document !== 'undefined' ? document.referrer || 'Direct Scan' : 'Direct Scan',
  };

  // 1. Write to Firestore
  try {
    await setDoc(doc(db, QR_LOGS_COLLECTION, scanLogId), cleanForFirestore(scanLog));
  } catch (err) {
    console.warn('Firestore scan log write notice:', err);
  }

  // 2. Notify backend server
  try {
    const res = await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scanLog),
    });
    if (res.ok) {
      const data = await res.json();
      return data.log || scanLog;
    }
  } catch {
    // ignore
  }

  return scanLog;
}

export async function fetchQrLogStats(
  adminId?: string,
  adminEmail?: string
): Promise<{
  totalScans: number;
  uniqueCards: number;
  todayScans: number;
  sourceBreakdown: Record<string, number>;
  deviceBreakdown: Record<string, number>;
} | null> {
  try {
    const res = await fetch('/api/logs/stats', {
      headers: {
        ...(adminId ? { 'x-admin-id': adminId } : {}),
        ...(adminEmail ? { 'x-admin-email': adminEmail } : {}),
      },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success) return data;
    }
  } catch (err) {
    console.warn('Log stats fetch notice:', err);
  }
  return null;
}



