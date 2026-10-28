import { CardRecord, AdminUser, UserProfile, GenerateReviewRequest, GenerateReviewResponse } from '../types';
import {
  db,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
} from 'firebase/firestore';

const STORAGE_KEY = '3dbysd_smart_reviews_cards';
const CARDS_COLLECTION = 'cards';

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

export async function fetchCards(): Promise<CardRecord[]> {
  let firestoreCards: CardRecord[] = [];
  try {
    const colRef = collection(db, CARDS_COLLECTION);
    const snapshot = await getDocs(colRef);

    if (!snapshot.empty) {
      snapshot.forEach((docSnap) => {
        firestoreCards.push(docSnap.data() as CardRecord);
      });
      firestoreCards.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    } else {
      // Seed initial cards to Firestore
      for (const card of INITIAL_CARDS) {
        await setDoc(doc(db, CARDS_COLLECTION, card.id), cleanForFirestore(card));
      }
      firestoreCards = [...INITIAL_CARDS];
    }
  } catch (error) {
    console.warn('Firestore fetch failed, attempting server API fallback:', error);
  }

  // Also query local server REST API to merge any cards not yet in Firestore or with newer data
  let serverCards: CardRecord[] = [];
  try {
    const res = await fetch('/api/cards');
    if (res.ok) {
      const data = await res.json();
      if (data.cards && Array.isArray(data.cards)) {
        serverCards = data.cards;
      }
    }
  } catch (err) {
    console.warn('Network fetch failed, reading from local storage:', err);
  }

  // Smart harmonization: Merge Firestore and Server cards
  if (firestoreCards.length > 0 || serverCards.length > 0) {
    const mergedMap = new Map<string, CardRecord>();

    // Add server cards first
    for (const c of serverCards) {
      mergedMap.set(c.id.toLowerCase(), c);
    }

    // Add or merge Firestore cards (Firestore wins unless server card has strictly newer updatedAt)
    for (const fc of firestoreCards) {
      const existing = mergedMap.get(fc.id.toLowerCase());
      if (!existing) {
        mergedMap.set(fc.id.toLowerCase(), fc);
      } else {
        const fcTime = fc.updatedAt ? new Date(fc.updatedAt).getTime() : 0;
        const exTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
        if (fcTime >= exTime) {
          mergedMap.set(fc.id.toLowerCase(), fc);
        } else {
          // Server had newer data! Sync it back to Firestore so Firestore stays up to date
          setDoc(doc(db, CARDS_COLLECTION, existing.id), cleanForFirestore(existing)).catch(() => {});
        }
      }
    }

    const mergedList = Array.from(mergedMap.values());
    mergedList.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mergedList));
    return mergedList;
  }

  // Fallback to localStorage
  const cached = localStorage.getItem(STORAGE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      // ignore
    }
  }
  return INITIAL_CARDS;
}

import { lookupCard } from './cardLookup';

export async function fetchCardById(id: string, recordScan: boolean = false): Promise<CardRecord | null> {
  const result = await lookupCard(id, { recordScan });
  return result.card;
}

export async function createBatchCards(payload: {
  count: number;
  startNumber: number;
  paddingDigits: number;
  prefix?: string;
}): Promise<CardRecord[]> {
  const currentCards = await fetchCards();
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

      // Write to Firestore with sanitization
      try {
        await setDoc(doc(db, CARDS_COLLECTION, id), cleanForFirestore(card));
      } catch (err) {
        console.warn(`Failed writing card ${id} to Firestore:`, err);
      }
    }
    current++;
  }

  // Also notify server endpoint for backup
  try {
    await fetch('/api/cards/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // ignore
  }

  const updatedList = [...currentCards, ...newCards];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));
  return updatedList;
}

export async function assignCard(
  id: string,
  updates: Partial<CardRecord>,
  adminId?: string
): Promise<CardRecord | null> {
  const docRef = doc(db, CARDS_COLLECTION, id);

  // Read existing data from cache first as baseline
  let existingData: Partial<CardRecord> = { id, status: 'available', scansCount: 0 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const list = JSON.parse(raw) as CardRecord[];
      const hit = list.find((c) => c.id.toLowerCase() === id.toLowerCase());
      if (hit) existingData = { ...hit };
    }
  } catch {}

  // Read existing doc if available in Firestore
  try {
    const existingSnap = await getDoc(docRef);
    if (existingSnap.exists()) {
      existingData = { ...existingData, ...(existingSnap.data() as CardRecord) };
    }
  } catch (readErr) {
    console.warn(`Firestore read card ${id} notice:`, readErr);
  }

  // Merge existing + new updates
  const mergedCard: CardRecord = {
    ...existingData,
    ...updates,
    id,
    updatedAt: new Date().toISOString(),
  } as CardRecord;

  // CRITICAL: Deeply sanitize all fields to eliminate undefined values
  const sanitizedCard = cleanForFirestore(mergedCard);

  // 1. Write to Firestore
  try {
    await setDoc(docRef, sanitizedCard);
    console.log(`✅ Firestore updated successfully for Card #${id}`);
  } catch (error) {
    console.error(`Firestore assign card ${id} error:`, error);
  }

  // 2. ALWAYS sync with Server API (data/cards.json backup & Supabase cloud sync)
  try {
    const res = await fetch(`/api/cards/${encodeURIComponent(id)}/assign`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(adminId ? { 'x-admin-id': adminId } : {}),
      },
      body: JSON.stringify({ ...sanitizedCard, adminId }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.card) {
        Object.assign(sanitizedCard, data.card);
      }
    }
  } catch (serverErr) {
    console.warn(`Server API assign card ${id} sync notice:`, serverErr);
  }

  // 3. Update localStorage cache directly without redundant network reads
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list: CardRecord[] = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex((c) => c.id.toLowerCase() === id.toLowerCase());
    if (idx !== -1) {
      list[idx] = sanitizedCard;
    } else {
      list.push(sanitizedCard);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }

  return sanitizedCard;
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
  adminId?: string
): Promise<CardRecord[]> {
  const normalizedIds = ids.map((id) => id.trim());
  const now = new Date().toISOString();

  // 1. Try batch updating in Firestore with sanitized payload
  try {
    const batch = writeBatch(db);
    for (const id of normalizedIds) {
      const docRef = doc(db, CARDS_COLLECTION, id);
      batch.set(docRef, cleanForFirestore({ status, updatedAt: now }), { merge: true });
    }
    await batch.commit();
  } catch (err) {
    console.warn('Firestore bulk update failed, falling back:', err);
  }

  // 2. Server API fallback/sync
  try {
    await fetch('/api/cards/bulk-status', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(adminId ? { 'x-admin-id': adminId } : {}),
      },
      body: JSON.stringify({ ids: normalizedIds, status, adminId }),
    });
  } catch {
    // ignore
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

export async function deleteCard(id: string): Promise<boolean> {
  const cleanId = id.trim();
  try {
    await deleteDoc(doc(db, CARDS_COLLECTION, cleanId));
  } catch (err) {
    console.warn(`Firestore delete card ${cleanId} failed:`, err);
  }

  try {
    await fetch(`/api/cards/${encodeURIComponent(cleanId)}`, { method: 'DELETE' });
  } catch {
    // ignore
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

const DEFAULT_ADMINS: AdminUser[] = [
  {
    id: 'master-admin-01',
    email: '66shashwatkumar66@gmail.com',
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
  {
    id: 'sub-admin-01',
    email: 'artisan.manager@example.com',
    name: 'Artisan Branch Manager',
    role: 'restricted',
    assignedCardIds: ['0001', '0002'],
    permissions: {
      canEditCards: true,
      canToggleAi: true,
      canExportCsv: false,
      canCreateCards: false,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export async function fetchAdmins(): Promise<AdminUser[]> {
  try {
    const colRef = collection(db, ADMINS_COLLECTION);
    const snapshot = await getDocs(colRef);
    if (!snapshot.empty) {
      const list: AdminUser[] = [];
      snapshot.forEach((d) => list.push(d.data() as AdminUser));
      localStorage.setItem(ADMINS_STORAGE_KEY, JSON.stringify(list));
      return list;
    }
  } catch (err) {
    console.warn('Firestore fetch admins failed, falling back to server/cache:', err);
  }

  try {
    const res = await fetch('/api/admins');
    if (res.ok) {
      const data = await res.json();
      if (data.admins && data.admins.length > 0) {
        localStorage.setItem(ADMINS_STORAGE_KEY, JSON.stringify(data.admins));
        return data.admins;
      }
    }
  } catch {
    // ignore
  }

  const cached = localStorage.getItem(ADMINS_STORAGE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached) as AdminUser[];
    } catch {
      // ignore
    }
  }

  localStorage.setItem(ADMINS_STORAGE_KEY, JSON.stringify(DEFAULT_ADMINS));
  return DEFAULT_ADMINS;
}

export async function createAdmin(payload: Partial<AdminUser>): Promise<AdminUser | null> {
  const newAdmin: AdminUser = {
    id: payload.id || `admin-${Date.now()}`,
    email: payload.email?.toLowerCase().trim() || '',
    name: payload.name?.trim() || 'Sub-Admin',
    role: payload.role === 'master' ? 'master' : 'restricted',
    assignedCardIds: Array.isArray(payload.assignedCardIds) ? payload.assignedCardIds : [],
    permissions: {
      canEditCards: payload.permissions?.canEditCards ?? true,
      canToggleAi: payload.permissions?.canToggleAi ?? true,
      canExportCsv: payload.permissions?.canExportCsv ?? false,
      canCreateCards: payload.permissions?.canCreateCards ?? false,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    await setDoc(doc(db, ADMINS_COLLECTION, newAdmin.id), cleanForFirestore(newAdmin));
  } catch (err) {
    console.warn(`Firestore create admin failed:`, err);
  }

  try {
    await fetch('/api/admins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newAdmin),
    });
  } catch {
    // ignore
  }

  const current = await fetchAdmins();
  const updated = [...current.filter((a) => a.id !== newAdmin.id), newAdmin];
  localStorage.setItem(ADMINS_STORAGE_KEY, JSON.stringify(updated));
  return newAdmin;
}

export async function updateAdmin(id: string, updates: Partial<AdminUser>): Promise<AdminUser | null> {
  const current = await fetchAdmins();
  const existing = current.find((a) => a.id === id || a.email.toLowerCase() === id.toLowerCase());
  if (!existing) return null;

  const merged: AdminUser = {
    ...existing,
    ...updates,
    id: existing.id,
    updatedAt: new Date().toISOString(),
  };

  try {
    await setDoc(doc(db, ADMINS_COLLECTION, merged.id), cleanForFirestore(merged));
  } catch (err) {
    console.warn(`Firestore update admin failed:`, err);
  }

  try {
    await fetch(`/api/admins/${encodeURIComponent(merged.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  } catch {
    // ignore
  }

  const updated = current.map((a) => (a.id === merged.id ? merged : a));
  localStorage.setItem(ADMINS_STORAGE_KEY, JSON.stringify(updated));
  return merged;
}

export async function deleteAdmin(id: string): Promise<boolean> {
  try {
    await deleteDoc(doc(db, ADMINS_COLLECTION, id));
  } catch (err) {
    console.warn(`Firestore delete admin failed:`, err);
  }

  try {
    await fetch(`/api/admins/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch {
    // ignore
  }

  const current = await fetchAdmins();
  const updated = current.filter((a) => a.id !== id);
  localStorage.setItem(ADMINS_STORAGE_KEY, JSON.stringify(updated));
  return true;
}

// ---------------- Users & Google Verified Logins Layer ----------------
const USERS_COLLECTION = 'users';
const USERS_STORAGE_KEY = '3dbysd_smart_reviews_users';

export async function fetchUsers(): Promise<UserProfile[]> {
  try {
    // 1. Try Firestore
    const snapshot = await getDocs(collection(db, USERS_COLLECTION));
    if (!snapshot.empty) {
      const list: UserProfile[] = [];
      snapshot.forEach((d) => {
        list.push(d.data() as UserProfile);
      });
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(list));
      return list;
    }
  } catch (err) {
    console.warn('Firestore fetchUsers notice:', err);
  }

  // 2. Try REST backend /api/users
  try {
    const res = await fetch('/api/users');
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.users) && data.users.length > 0) {
        localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(data.users));
        return data.users;
      }
    }
  } catch {
    // fallback
  }

  // 3. Fallback to localStorage
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
      email: '66shashwatkumar66@gmail.com',
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

export async function saveUser(user: Partial<UserProfile> & { uid: string; email: string }): Promise<UserProfile> {
  const cleanEmail = user.email.trim().toLowerCase();
  const now = new Date().toISOString();
  const isMaster = cleanEmail === '66shashwatkumar66@gmail.com';

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
    loginCount: (user.loginCount || 1),
    device: user.device || navigator.userAgent.slice(0, 50) || 'Web Browser',
    assignedCardIds: user.assignedCardIds || [],
  };

  // 1. Save to Firestore
  try {
    await setDoc(doc(db, USERS_COLLECTION, fullUser.uid), cleanForFirestore(fullUser));
  } catch (err) {
    console.warn('Firestore saveUser notice:', err);
  }

  // 2. Save to Backend Server
  try {
    await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fullUser),
    });
  } catch {
    // ignore
  }

  // 3. Save to localStorage cache
  try {
    const existing = await fetchUsers();
    const idx = existing.findIndex((u) => u.uid === fullUser.uid || u.email.toLowerCase() === cleanEmail);
    let updated: UserProfile[];
    if (idx !== -1) {
      updated = [...existing];
      updated[idx] = { ...updated[idx], ...fullUser, loginCount: (updated[idx].loginCount || 0) + 1 };
    } else {
      updated = [fullUser, ...existing];
    }
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }

  return fullUser;
}

export async function deleteUser(uid: string): Promise<boolean> {
  // 1. Delete in Firestore
  try {
    await deleteDoc(doc(db, USERS_COLLECTION, uid));
  } catch (err) {
    console.warn('Firestore deleteUser notice:', err);
  }

  // 2. Delete on backend
  try {
    await fetch(`/api/users/${encodeURIComponent(uid)}`, { method: 'DELETE' });
  } catch {
    // ignore
  }

  // 3. Local storage
  try {
    const existing = await fetchUsers();
    const updated = existing.filter((u) => u.uid !== uid);
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }

  return true;
}


