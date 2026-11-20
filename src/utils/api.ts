import {
  CardRecord,
  AdminUser,
  UserProfile,
  ScanLogRecord,
  GenerateReviewRequest,
  GenerateReviewResponse,
} from '../types';
import { auth, db, OperationType } from '../firebase';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  where,
} from 'firebase/firestore';
import { lookupCard } from './cardLookup';

const STORAGE_KEY = '3dbysd_smart_reviews_cards';
const CARDS_COLLECTION = 'cards';
const SCAN_LOGS_COLLECTION = 'scan_logs';
const ADMINS_COLLECTION = 'admins';
const ADMINS_STORAGE_KEY = '3dbysd_smart_reviews_admins';
const USERS_COLLECTION = 'users';
const USERS_STORAGE_KEY = '3dbysd_smart_reviews_users';

export const MASTER_ADMIN_EMAIL = '66shashwatkumar66@gmail.com';

/**
 * Helper to check if current Firebase Auth session belongs to the Master Admin.
 */
export function isCurrentAuthMaster(): boolean {
  const user = auth.currentUser;
  return Boolean(
    user &&
      user.email &&
      user.emailVerified &&
      user.email.toLowerCase() === MASTER_ADMIN_EMAIL
  );
}

/**
 * Returns Authorization headers with a fresh Firebase ID Token when authenticated.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  try {
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
  } catch {
    // ignore token fetch error
  }
  return headers;
}

/**
 * Deeply removes all keys with `undefined` or `null` values.
 * Firestore rejects undefined values and strict rules reject null on typed fields.
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

function formatDbError(error: any, operation: OperationType, path: string): Error {
  const code = error?.code || '';
  const msg = error?.message || String(error);
  console.error(`[3DBYSD Firestore ${operation.toUpperCase()} ${path}]`, code, msg);
  if (code === 'permission-denied' || msg.includes('Missing or insufficient permissions')) {
    return new Error(
      `Permission denied while accessing "${path}". Ensure you are signed in with your verified Google account.`
    );
  }
  return new Error(msg || `Database operation failed on ${path}`);
}

export interface FetchCardsScope {
  isMaster?: boolean;
  email?: string;
  uid?: string;
  assignedCardIds?: string[];
}

/**
 * Authoritative Firestore card loader supporting both Master Admin (full inventory)
 * and Sub-Admin (strictly scoped by assignedToEmail, assignedToUid, and assignedCardIds).
 * Never overwrites live Firestore records with stale local JSON.
 */
export async function fetchCards(scope?: FetchCardsScope): Promise<CardRecord[]> {
  const fbUser = auth.currentUser;
  const effectiveEmail = (scope?.email || fbUser?.email || '').trim().toLowerCase();
  const effectiveUid = (scope?.uid || fbUser?.uid || '').trim();
  const isMaster =
    scope?.isMaster !== undefined
      ? scope.isMaster && isCurrentAuthMaster()
      : isCurrentAuthMaster();

  const cardsMap = new Map<string, CardRecord>();

  if (isMaster) {
    try {
      const snapshot = await getDocs(collection(db, CARDS_COLLECTION));
      snapshot.forEach((docSnap) => {
        const data = { id: docSnap.id, ...(docSnap.data() as Omit<CardRecord, 'id'>) } as CardRecord;
        cardsMap.set(data.id, data);
      });
    } catch (error) {
      throw formatDbError(error, OperationType.LIST, CARDS_COLLECTION);
    }
  } else if (fbUser && (effectiveEmail || effectiveUid)) {
    // Sub-Admin / Card Owner scoped queries matching firestore.rules query-planner constraints
    const queries: Promise<void>[] = [];

    if (effectiveEmail) {
      queries.push(
        getDocs(query(collection(db, CARDS_COLLECTION), where('assignedToEmail', '==', effectiveEmail)))
          .then((snap) => {
            snap.forEach((d) => {
              const data = { id: d.id, ...(d.data() as Omit<CardRecord, 'id'>) } as CardRecord;
              cardsMap.set(data.id, data);
            });
          })
          .catch((err) => {
            console.warn('[3DBYSD] Scoped email cards query notice:', err?.code || err?.message);
          })
      );
    }

    if (effectiveUid) {
      queries.push(
        getDocs(query(collection(db, CARDS_COLLECTION), where('assignedToUid', '==', effectiveUid)))
          .then((snap) => {
            snap.forEach((d) => {
              const data = { id: d.id, ...(d.data() as Omit<CardRecord, 'id'>) } as CardRecord;
              cardsMap.set(data.id, data);
            });
          })
          .catch((err) => {
            console.warn('[3DBYSD] Scoped uid cards query notice:', err?.code || err?.message);
          })
      );
    }

    // Also fetch any explicitly assigned card IDs via single-doc getDoc
    if (scope?.assignedCardIds && scope.assignedCardIds.length > 0) {
      for (const cid of scope.assignedCardIds) {
        const cleanCid = cid.trim();
        if (!cleanCid) continue;
        queries.push(
          getDoc(doc(db, CARDS_COLLECTION, cleanCid))
            .then((snap) => {
              if (snap.exists()) {
                const data = { id: snap.id, ...(snap.data() as Omit<CardRecord, 'id'>) } as CardRecord;
                cardsMap.set(data.id, data);
              }
            })
            .catch(() => {})
        );
      }
    }

    await Promise.all(queries);
  } else {
    throw new Error('Authentication required to load QR cards inventory from Cloud Firestore.');
  }

  const list = Array.from(cardsMap.values());
  list.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      // ignore quota
    }
  }

  return list;
}

export async function fetchCardById(id: string, recordScan: boolean = false): Promise<CardRecord | null> {
  const result = await lookupCard(id, { recordScan });
  return result.card;
}

/**
 * Fetches historical QR/NFC scan event logs from Cloud Firestore with strict RBAC scoping.
 */
export async function fetchScanLogs(scope?: {
  isMaster?: boolean;
  email?: string;
  uid?: string;
}): Promise<ScanLogRecord[]> {
  const fbUser = auth.currentUser;
  const effectiveEmail = (scope?.email || fbUser?.email || '').trim().toLowerCase();
  const effectiveUid = (scope?.uid || fbUser?.uid || '').trim();
  const isMaster =
    scope?.isMaster !== undefined
      ? scope.isMaster && isCurrentAuthMaster()
      : isCurrentAuthMaster();

  const logsMap = new Map<string, ScanLogRecord>();

  if (isMaster) {
    try {
      const snap = await getDocs(collection(db, SCAN_LOGS_COLLECTION));
      snap.forEach((d) => {
        const data = { id: d.id, ...(d.data() as Omit<ScanLogRecord, 'id'>) } as ScanLogRecord;
        logsMap.set(data.id, data);
      });
    } catch (error) {
      throw formatDbError(error, OperationType.LIST, SCAN_LOGS_COLLECTION);
    }
  } else if (fbUser && (effectiveEmail || effectiveUid)) {
    const queries: Promise<void>[] = [];

    if (effectiveEmail) {
      queries.push(
        getDocs(
          query(collection(db, SCAN_LOGS_COLLECTION), where('assignedToEmail', '==', effectiveEmail))
        )
          .then((snap) => {
            snap.forEach((d) => {
              const data = { id: d.id, ...(d.data() as Omit<ScanLogRecord, 'id'>) } as ScanLogRecord;
              logsMap.set(data.id, data);
            });
          })
          .catch((err) => {
            console.warn('[3DBYSD] Scoped email scan_logs query notice:', err?.code || err?.message);
          })
      );
    }

    if (effectiveUid) {
      queries.push(
        getDocs(
          query(collection(db, SCAN_LOGS_COLLECTION), where('assignedToUid', '==', effectiveUid))
        )
          .then((snap) => {
            snap.forEach((d) => {
              const data = { id: d.id, ...(d.data() as Omit<ScanLogRecord, 'id'>) } as ScanLogRecord;
              logsMap.set(data.id, data);
            });
          })
          .catch((err) => {
            console.warn('[3DBYSD] Scoped uid scan_logs query notice:', err?.code || err?.message);
          })
      );
    }

    await Promise.all(queries);
  } else {
    throw new Error('Authentication required to view QR scan logs.');
  }

  const list = Array.from(logsMap.values());
  list.sort((a, b) => new Date(b.scannedAt || 0).getTime() - new Date(a.scannedAt || 0).getTime());
  return list;
}

export async function createBatchCards(
  payload: {
    count: number;
    startNumber: number;
    paddingDigits: number;
    prefix?: string;
  },
  _caller?: { id?: string; email?: string }
): Promise<CardRecord[]> {
  if (!isCurrentAuthMaster()) {
    throw new Error('Only Master Admin can create new QR card batches.');
  }

  const currentCards = await fetchCards({ isMaster: true });
  const existingIds = new Set(currentCards.map((c) => c.id));
  const newCards: CardRecord[] = [];
  const now = new Date().toISOString();

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
        createdAt: now,
        updatedAt: now,
      };
      newCards.push(card);
      existingIds.add(id);
    }
    current++;
  }

  // Write in Firestore batches (max 500 per batch)
  try {
    for (let i = 0; i < newCards.length; i += 400) {
      const chunk = newCards.slice(i, i + 400);
      const batch = writeBatch(db);
      for (const card of chunk) {
        batch.set(doc(db, CARDS_COLLECTION, card.id), cleanForFirestore(card));
      }
      await batch.commit();
    }
  } catch (err) {
    throw formatDbError(err, OperationType.WRITE, CARDS_COLLECTION);
  }

  const updatedList = [...currentCards, ...newCards];
  updatedList.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));
    } catch {}
  }
  return updatedList;
}

const SUB_ADMIN_ALLOWED_FIELDS = new Set<string>([
  'businessName',
  'category',
  'businessDescription',
  'googleReviewUrl',
  'notes',
  'aiReviewEnabled',
  'customKeywords',
  'reviewTone',
  'promptStarter',
  'customHeadline',
  'logoUrl',
  'whatsapp',
  'instagram',
  'status',
  'updatedAt',
]);

export async function assignCard(
  id: string,
  updates: Partial<CardRecord>,
  _adminId?: string,
  _callerEmail?: string,
  _isMasterHint?: boolean
): Promise<CardRecord | null> {
  const cleanId = id.trim();
  const docRef = doc(db, CARDS_COLLECTION, cleanId);
  const now = new Date().toISOString();

  // Read authoritative existing document from Firestore to preserve scansCount, createdAt, and historical data
  let existingData: CardRecord | null = null;
  try {
    const existingSnap = await getDoc(docRef);
    if (existingSnap.exists()) {
      existingData = { id: existingSnap.id, ...(existingSnap.data() as Omit<CardRecord, 'id'>) } as CardRecord;
    }
  } catch (readErr) {
    throw formatDbError(readErr, OperationType.GET, `${CARDS_COLLECTION}/${cleanId}`);
  }

  const isMaster = isCurrentAuthMaster();

  if (!isMaster) {
    // Sub-admin strictly updates only permitted business/customization fields via updateDoc
    if (!existingData) {
      throw new Error(`Card #${cleanId} not found.`);
    }

    const patch: Record<string, any> = { updatedAt: now };
    for (const [k, v] of Object.entries(updates)) {
      if (SUB_ADMIN_ALLOWED_FIELDS.has(k) && v !== undefined && v !== null) {
        patch[k] = v;
      }
    }
    if (patch.status && patch.status !== 'available' && patch.status !== 'assigned') {
      throw new Error('Sub-admins cannot disable cards.');
    }

    try {
      await updateDoc(docRef, cleanForFirestore(patch));
    } catch (err) {
      throw formatDbError(err, OperationType.UPDATE, `${CARDS_COLLECTION}/${cleanId}`);
    }

    const updatedCard: CardRecord = {
      ...existingData,
      ...patch,
      id: cleanId,
      scansCount: existingData.scansCount || 0,
      createdAt: existingData.createdAt || now,
      updatedAt: now,
    };

    updateCardInLocalCache(updatedCard);
    return updatedCard;
  }

  // Master Admin full update (preserving scansCount and createdAt)
  const normalizedUpdates: Partial<CardRecord> = { ...updates };
  if (typeof normalizedUpdates.assignedToEmail === 'string') {
    normalizedUpdates.assignedToEmail = normalizedUpdates.assignedToEmail.trim().toLowerCase();
  }

  const mergedCard: CardRecord = {
    id: cleanId,
    status: existingData?.status || 'available',
    businessName: existingData?.businessName || '',
    category: existingData?.category || '',
    googleReviewUrl: existingData?.googleReviewUrl || '',
    notes: existingData?.notes || '',
    ...(existingData || {}),
    ...normalizedUpdates,
    scansCount: existingData?.scansCount ?? normalizedUpdates.scansCount ?? 0,
    createdAt: existingData?.createdAt || now,
    updatedAt: now,
  };

  // Strip explicit undefined/empty subscription removal safely while keeping clean Firestore document
  const sanitizedCard = cleanForFirestore(mergedCard);

  try {
    await setDoc(docRef, sanitizedCard);
  } catch (error) {
    throw formatDbError(error, OperationType.WRITE, `${CARDS_COLLECTION}/${cleanId}`);
  }

  updateCardInLocalCache(sanitizedCard);
  return sanitizedCard;
}

function updateCardInLocalCache(card: CardRecord): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list: CardRecord[] = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex((c) => c.id.toLowerCase() === card.id.toLowerCase());
    if (idx !== -1) {
      list[idx] = card;
    } else {
      list.push(card);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
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

  // Keep Firestore doc well under 1 MiB limit if storing inline; try server upload first
  try {
    const authHeaders = await getAuthHeaders();
    const res = await fetch('/api/upload-logo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
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
    console.warn('Server logo upload endpoint notice, checking inline data URL fallback:', netErr);
  }

  if (dataUrl.length > 850000) {
    throw new Error(
      'Image is too large for inline cloud storage after compression. Please upload a smaller image (under 600 KB).'
    );
  }

  return { success: true, url: dataUrl };
}

export async function bulkUpdateCardsStatus(
  ids: string[],
  status: 'available' | 'assigned',
  _adminId?: string,
  _callerEmail?: string
): Promise<CardRecord[]> {
  const normalizedIds = ids.map((id) => id.trim()).filter(Boolean);
  if (normalizedIds.length === 0) return [];
  const now = new Date().toISOString();

  try {
    const batch = writeBatch(db);
    for (const id of normalizedIds) {
      const docRef = doc(db, CARDS_COLLECTION, id);
      batch.update(docRef, { status, updatedAt: now });
    }
    await batch.commit();
  } catch (err) {
    throw formatDbError(err, OperationType.UPDATE, CARDS_COLLECTION);
  }

  let updatedList: CardRecord[] = [];
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const cached: CardRecord[] = raw ? JSON.parse(raw) : [];
      const idSet = new Set(normalizedIds.map((id) => id.toLowerCase()));
      updatedList = cached.map((c) =>
        idSet.has(c.id.toLowerCase()) ? { ...c, status, updatedAt: now } : c
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));
    } catch {}
  }
  return updatedList;
}

export async function deleteCard(id: string): Promise<boolean> {
  if (!isCurrentAuthMaster()) {
    throw new Error('Only Master Admin can delete QR cards.');
  }
  const cleanId = id.trim();
  try {
    await deleteDoc(doc(db, CARDS_COLLECTION, cleanId));
  } catch (err) {
    throw formatDbError(err, OperationType.DELETE, `${CARDS_COLLECTION}/${cleanId}`);
  }

  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as CardRecord[];
        const filtered = cached.filter((c) => c.id.toLowerCase() !== cleanId.toLowerCase());
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
      }
    } catch {}
  }
  return true;
}

export async function generateAiReview(
  payload: GenerateReviewRequest,
  signal?: AbortSignal
): Promise<GenerateReviewResponse> {
  try {
    const res = await fetch('/api/generate-review', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal,
    });

    const rawText = await res.text();

    if (!res.ok) {
      let serverError = `Request failed (${res.status}). Please try again.`;
      if (rawText && rawText.trim()) {
        try {
          const parsed = JSON.parse(rawText);
          serverError = parsed.error || parsed.message || serverError;
        } catch {
          if (res.status === 405) {
            serverError = 'Review generation API method not allowed (405).';
          }
        }
      }
      return {
        success: false,
        message: serverError,
        error: serverError,
      };
    }

    if (!rawText || !rawText.trim()) {
      return {
        success: false,
        message: 'Empty response received from review generation service.',
      };
    }

    try {
      return JSON.parse(rawText);
    } catch {
      return {
        success: false,
        message: 'Invalid response format from review generation service.',
      };
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw err;
    }
    return {
      success: false,
      message: err?.message || 'Network request failed. Please check your connection and try again.',
    };
  }
}

// ---------------- Admin Management Layer ----------------

const DEFAULT_MASTER_ADMIN: AdminUser = {
  id: 'master-admin-01',
  email: MASTER_ADMIN_EMAIL,
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
};

export async function fetchAdmins(): Promise<AdminUser[]> {
  const fbUser = auth.currentUser;
  if (!fbUser) {
    return [DEFAULT_MASTER_ADMIN];
  }

  try {
    if (isCurrentAuthMaster()) {
      const snapshot = await getDocs(collection(db, ADMINS_COLLECTION));
      const list: AdminUser[] = [];
      snapshot.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<AdminUser, 'id'>) } as AdminUser));
      if (!list.some((a) => a.email.toLowerCase() === MASTER_ADMIN_EMAIL)) {
        list.unshift(DEFAULT_MASTER_ADMIN);
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(ADMINS_STORAGE_KEY, JSON.stringify(list));
      }
      return list;
    }

    // Sub-admin: query ONLY their own admin document by verified email
    const email = (fbUser.email || '').trim().toLowerCase();
    if (!email) return [];
    const snap = await getDocs(query(collection(db, ADMINS_COLLECTION), where('email', '==', email)));
    const list: AdminUser[] = [];
    snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<AdminUser, 'id'>) } as AdminUser));
    return list;
  } catch (err) {
    console.warn('[3DBYSD] fetchAdmins Firestore notice:', err);
    return isCurrentAuthMaster() ? [DEFAULT_MASTER_ADMIN] : [];
  }
}

export async function createAdmin(payload: Partial<AdminUser>): Promise<AdminUser | null> {
  if (!isCurrentAuthMaster()) {
    throw new Error('Only Master Admin can create admin accounts.');
  }

  const cleanEmail = (payload.email || '').toLowerCase().trim();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('A valid email address is required.');
  }

  const now = new Date().toISOString();
  const newAdmin: AdminUser = {
    id: payload.id || `admin-${Date.now()}`,
    email: cleanEmail,
    name: payload.name?.trim() || 'Sub-Admin',
    role: payload.role === 'master' ? 'master' : 'restricted',
    assignedCardIds: Array.isArray(payload.assignedCardIds) ? payload.assignedCardIds : [],
    permissions: {
      canEditCards: payload.permissions?.canEditCards ?? true,
      canToggleAi: payload.permissions?.canToggleAi ?? true,
      canExportCsv: payload.permissions?.canExportCsv ?? false,
      canCreateCards: payload.permissions?.canCreateCards ?? false,
    },
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, ADMINS_COLLECTION, newAdmin.id), cleanForFirestore(newAdmin));
  } catch (err) {
    throw formatDbError(err, OperationType.CREATE, `${ADMINS_COLLECTION}/${newAdmin.id}`);
  }

  // Sync assignedCardIds onto the corresponding card docs so Firestore ownership rules match immediately
  if (newAdmin.assignedCardIds.length > 0) {
    const batch = writeBatch(db);
    for (const cid of newAdmin.assignedCardIds) {
      batch.update(doc(db, CARDS_COLLECTION, cid), {
        assignedToEmail: cleanEmail,
        assignedToName: newAdmin.name,
        updatedAt: now,
      });
    }
    await batch.commit().catch((err) => console.warn('Card ownership sync notice:', err));
  }

  return newAdmin;
}

export async function updateAdmin(id: string, updates: Partial<AdminUser>): Promise<AdminUser | null> {
  if (!isCurrentAuthMaster()) {
    throw new Error('Only Master Admin can update admin accounts.');
  }

  const current = await fetchAdmins();
  const existing = current.find((a) => a.id === id || a.email.toLowerCase() === id.toLowerCase());
  if (!existing) throw new Error('Admin account not found.');

  const now = new Date().toISOString();
  const merged: AdminUser = {
    ...existing,
    ...updates,
    id: existing.id,
    email: (updates.email || existing.email).toLowerCase().trim(),
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, ADMINS_COLLECTION, merged.id), cleanForFirestore(merged));
  } catch (err) {
    throw formatDbError(err, OperationType.UPDATE, `${ADMINS_COLLECTION}/${merged.id}`);
  }

  // Keep card ownership fields aligned when assignedCardIds changes
  if (Array.isArray(updates.assignedCardIds)) {
    const prevSet = new Set(existing.assignedCardIds || []);
    const nextSet = new Set(updates.assignedCardIds);
    const batch = writeBatch(db);
    let ops = 0;

    for (const cid of nextSet) {
      if (!prevSet.has(cid)) {
        batch.update(doc(db, CARDS_COLLECTION, cid), {
          assignedToEmail: merged.email,
          assignedToName: merged.name,
          updatedAt: now,
        });
        ops++;
      }
    }
    for (const cid of prevSet) {
      if (!nextSet.has(cid)) {
        batch.update(doc(db, CARDS_COLLECTION, cid), {
          assignedToEmail: '',
          assignedToName: '',
          assignedToUid: '',
          updatedAt: now,
        });
        ops++;
      }
    }
    if (ops > 0) {
      await batch.commit().catch((err) => console.warn('Card ownership diff sync notice:', err));
    }
  }

  return merged;
}

export async function deleteAdmin(id: string): Promise<boolean> {
  if (!isCurrentAuthMaster()) {
    throw new Error('Only Master Admin can remove admin accounts.');
  }
  try {
    await deleteDoc(doc(db, ADMINS_COLLECTION, id));
  } catch (err) {
    throw formatDbError(err, OperationType.DELETE, `${ADMINS_COLLECTION}/${id}`);
  }
  return true;
}

// ---------------- Users & Google Verified Logins Layer ----------------

export async function fetchUsers(): Promise<UserProfile[]> {
  const fbUser = auth.currentUser;
  if (!fbUser) return [];

  try {
    if (isCurrentAuthMaster()) {
      const snapshot = await getDocs(collection(db, USERS_COLLECTION));
      const list: UserProfile[] = [];
      snapshot.forEach((d) => list.push(d.data() as UserProfile));
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(list));
      }
      return list;
    }

    const snap = await getDoc(doc(db, USERS_COLLECTION, fbUser.uid));
    return snap.exists() ? [snap.data() as UserProfile] : [];
  } catch (err) {
    console.warn('[3DBYSD] fetchUsers Firestore notice:', err);
    return [];
  }
}

export async function saveUser(
  user: Partial<UserProfile> & { uid: string; email: string }
): Promise<UserProfile> {
  const cleanEmail = user.email.trim().toLowerCase();
  const now = new Date().toISOString();
  const isMasterEmail = cleanEmail === MASTER_ADMIN_EMAIL;
  const callerIsMaster = isCurrentAuthMaster();

  let existing: UserProfile | null = null;
  if (auth.currentUser) {
    try {
      const snap = await getDoc(doc(db, USERS_COLLECTION, user.uid));
      if (snap.exists()) existing = snap.data() as UserProfile;
    } catch {
      // ignore read failure on first login
    }
  }

  // Enforce strict role integrity matching firestore.rules (no self-escalation!)
  const resolvedRole: 'master' | 'restricted' | 'member' = callerIsMaster
    ? user.role || existing?.role || (isMasterEmail ? 'master' : 'member')
    : existing?.role || 'member';

  const fullUser: UserProfile = {
    uid: user.uid,
    email: existing?.email || cleanEmail,
    displayName: user.displayName || existing?.displayName || cleanEmail.split('@')[0],
    photoURL:
      user.photoURL ||
      existing?.photoURL ||
      `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(cleanEmail)}&backgroundColor=1a73e8&textColor=ffffff`,
    provider: user.provider || existing?.provider || 'google.com',
    role: resolvedRole,
    emailVerified: user.emailVerified !== undefined ? user.emailVerified : true,
    lastLoginAt: now,
    createdAt: existing?.createdAt || user.createdAt || now,
    loginCount: existing ? (existing.loginCount || 0) + 1 : user.loginCount || 1,
    device:
      user.device ||
      (typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 60) : 'Web Browser'),
    assignedCardIds: user.assignedCardIds || existing?.assignedCardIds || [],
  };

  if (auth.currentUser) {
    try {
      await setDoc(doc(db, USERS_COLLECTION, fullUser.uid), cleanForFirestore(fullUser));
    } catch (err) {
      if (callerIsMaster) {
        throw formatDbError(err, OperationType.WRITE, `${USERS_COLLECTION}/${fullUser.uid}`);
      }
      console.warn('[3DBYSD] saveUser notice:', err);
    }
  }

  return fullUser;
}

export async function deleteUser(uid: string, _caller?: { id?: string; email?: string }): Promise<boolean> {
  if (!isCurrentAuthMaster()) {
    throw new Error('Only Master Admin can remove user profiles.');
  }
  try {
    await deleteDoc(doc(db, USERS_COLLECTION, uid));
  } catch (err) {
    throw formatDbError(err, OperationType.DELETE, `${USERS_COLLECTION}/${uid}`);
  }
  return true;
}

export function formatApiError(err: unknown, fallback = 'Operation failed'): string {
  if (!err) return fallback;
  if (typeof err === 'string') return err;
  if (err instanceof Error && err.message) return err.message;
  const anyErr = err as any;
  return anyErr?.message || anyErr?.error || fallback;
}

export interface SessionAuthResult {
  authorized: boolean;
  revoked: boolean;
  role: 'master' | 'restricted' | 'member';
  admin?: AdminUser;
  message?: string;
}

export async function checkSessionAuthorization(
  email: string,
  uid?: string
): Promise<SessionAuthResult> {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail) {
    return { authorized: false, revoked: false, role: 'member' };
  }
  if (cleanEmail === MASTER_ADMIN_EMAIL) {
    return { authorized: true, revoked: false, role: 'master' };
  }

  try {
    const admins = await fetchAdmins();
    const matchedAdmin = admins.find(
      (a) => a.email.trim().toLowerCase() === cleanEmail || (uid && a.id === uid)
    );
    if (matchedAdmin) {
      return {
        authorized: true,
        revoked: false,
        role: matchedAdmin.role === 'master' ? 'master' : 'restricted',
        admin: matchedAdmin,
      };
    }

    if (uid && auth.currentUser) {
      const userSnap = await getDoc(doc(db, USERS_COLLECTION, uid)).catch(() => null);
      if (userSnap && userSnap.exists()) {
        const userData = userSnap.data() as UserProfile;
        if (userData.accessRevoked) {
          return {
            authorized: false,
            revoked: true,
            role: 'member',
            message: 'Access Denied: Your administrator access has been revoked by the Master Admin.',
          };
        }
        if (userData.role === 'restricted' || userData.role === 'master') {
          return {
            authorized: true,
            revoked: false,
            role: userData.role,
          };
        }
      }
    }
  } catch (err) {
    console.warn('[3DBYSD] checkSessionAuthorization notice:', err);
  }

  return { authorized: false, revoked: false, role: 'member' };
}

export async function authorizeUserAsAdmin(
  payload: {
    email: string;
    displayName?: string;
    role: 'master' | 'restricted' | 'member';
    existingUid?: string;
    assignedCardIds?: string[];
  },
  _caller?: { id?: string; email?: string }
): Promise<{ user: UserProfile; admin?: AdminUser | null }> {
  if (!isCurrentAuthMaster()) {
    throw new Error('Only Master Admin can authorize or change user roles.');
  }

  const cleanEmail = payload.email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('A valid email address is required.');
  }
  if (cleanEmail === MASTER_ADMIN_EMAIL && payload.role !== 'master') {
    throw new Error('Cannot demote the primary Master Administrator.');
  }

  const uid =
    payload.existingUid || `preauth-${cleanEmail.replace(/[^a-zA-Z0-9]/g, '-')}`;
  const displayName = payload.displayName?.trim() || cleanEmail.split('@')[0];

  const savedUser = await saveUser({
    uid,
    email: cleanEmail,
    displayName,
    role: payload.role,
    emailVerified: true,
    ...(payload.assignedCardIds ? { assignedCardIds: payload.assignedCardIds } : {}),
  });

  const existingAdmins = await fetchAdmins();
  const matchedAdmin = existingAdmins.find((a) => a.email.trim().toLowerCase() === cleanEmail);
  let syncedAdmin: AdminUser | null = null;

  if (payload.role === 'restricted' || payload.role === 'master') {
    if (matchedAdmin) {
      syncedAdmin = await updateAdmin(matchedAdmin.id, {
        name: displayName,
        email: cleanEmail,
        role: payload.role,
        ...(payload.assignedCardIds ? { assignedCardIds: payload.assignedCardIds } : {}),
      });
    } else {
      syncedAdmin = await createAdmin({
        email: cleanEmail,
        name: displayName,
        role: payload.role,
        assignedCardIds: payload.assignedCardIds || [],
      });
    }
  } else if (matchedAdmin && matchedAdmin.email.trim().toLowerCase() !== MASTER_ADMIN_EMAIL) {
    await deleteAdmin(matchedAdmin.id);
  }

  return { user: savedUser, admin: syncedAdmin };
}
