import { CardRecord, AdminUser, GenerateReviewRequest, GenerateReviewResponse } from '../types';
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
  onSnapshot,
} from 'firebase/firestore';

const STORAGE_KEY = '3dbysd_smart_reviews_cards';
const CARDS_COLLECTION = 'cards';

const INITIAL_CARDS: CardRecord[] = [
  {
    id: '0001',
    status: 'assigned',
    businessName: 'The Artisan Roastery & Bakery',
    category: 'Specialty Coffee & Brunch',
    googleReviewUrl: 'https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4',
    notes: 'Table 4 Stand - NFC & QR display',
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
  try {
    const colRef = collection(db, CARDS_COLLECTION);
    const snapshot = await getDocs(colRef);

    if (!snapshot.empty) {
      const cards: CardRecord[] = [];
      snapshot.forEach((docSnap) => {
        cards.push(docSnap.data() as CardRecord);
      });
      cards.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
      return cards;
    } else {
      // Seed initial cards to Firestore
      for (const card of INITIAL_CARDS) {
        await setDoc(doc(db, CARDS_COLLECTION, card.id), card);
      }
      return INITIAL_CARDS;
    }
  } catch (error) {
    console.warn('Firestore fetch failed, attempting server API fallback:', error);
  }

  // Fallback to local server REST API
  try {
    const res = await fetch('/api/cards');
    if (res.ok) {
      const data = await res.json();
      if (data.cards && Array.isArray(data.cards)) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data.cards));
        return data.cards;
      }
    }
  } catch (err) {
    console.warn('Network fetch failed, reading from local storage:', err);
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

export async function fetchCardById(id: string, recordScan: boolean = false): Promise<CardRecord | null> {
  try {
    const docRef = doc(db, CARDS_COLLECTION, id);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const card = docSnap.data() as CardRecord;
      if (recordScan) {
        const newCount = (card.scansCount || 0) + 1;
        const updated = {
          ...card,
          scansCount: newCount,
          updatedAt: new Date().toISOString(),
        };
        await setDoc(docRef, updated, { merge: true });
        return updated;
      }
      return card;
    }
  } catch (error) {
    console.warn(`Firestore get card ${id} failed:`, error);
  }

  // Fallback to server REST API
  try {
    const res = await fetch(`/api/cards/${encodeURIComponent(id)}${recordScan ? '?scan=true' : ''}`);
    if (res.ok) {
      const data = await res.json();
      if (data.card) {
        return data.card;
      }
    }
  } catch (err) {
    console.warn(`Server fetch card ${id} failed:`, err);
  }

  const allCards = await fetchCards();
  return allCards.find((c) => c.id.toLowerCase() === id.toLowerCase()) || null;
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

      // Write to Firestore
      try {
        await setDoc(doc(db, CARDS_COLLECTION, id), card);
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

  try {
    const existingSnap = await getDoc(docRef);
    const existingData = existingSnap.exists()
      ? (existingSnap.data() as CardRecord)
      : { id, status: 'available', scansCount: 0 };

    const mergedCard: CardRecord = {
      ...existingData,
      ...updates,
      id,
      updatedAt: new Date().toISOString(),
    } as CardRecord;

    await setDoc(docRef, mergedCard);

    // Update local cache
    const cached = await fetchCards();
    const idx = cached.findIndex((c) => c.id.toLowerCase() === id.toLowerCase());
    if (idx !== -1) {
      cached[idx] = mergedCard;
    } else {
      cached.push(mergedCard);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));

    return mergedCard;
  } catch (error) {
    console.warn(`Firestore assign card ${id} error:`, error);
  }

  // Server API Fallback
  try {
    const res = await fetch(`/api/cards/${encodeURIComponent(id)}/assign`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(adminId ? { 'x-admin-id': adminId } : {}),
      },
      body: JSON.stringify({ ...updates, adminId }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.card) return data.card;
    }
  } catch {
    // ignore
  }

  return null;
}

export async function deleteCard(id: string): Promise<boolean> {
  try {
    await deleteDoc(doc(db, CARDS_COLLECTION, id));
  } catch (err) {
    console.warn(`Firestore delete card ${id} failed:`, err);
  }

  try {
    await fetch(`/api/cards/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch {
    // ignore
  }

  const cached = await fetchCards();
  const filtered = cached.filter((c) => c.id.toLowerCase() !== id.toLowerCase());
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  return true;
}

export async function generateAiReview(payload: GenerateReviewRequest): Promise<GenerateReviewResponse> {
  try {
    const res = await fetch('/api/generate-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    console.error('Error generating AI review:', err);
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
    await setDoc(doc(db, ADMINS_COLLECTION, newAdmin.id), newAdmin);
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
    await setDoc(doc(db, ADMINS_COLLECTION, merged.id), merged);
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

