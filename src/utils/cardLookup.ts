import { doc, getDoc, updateDoc, setDoc, increment } from 'firebase/firestore';
import { db } from '../firebase';
import { CardRecord, ScanLogRecord, ScanSource, ScanOutcome } from '../types';
import { getSubscriptionStatus, isSubscriptionAccessible } from './subscription';

export const CARDS_COLLECTION = 'cards';
export const SCAN_LOGS_COLLECTION = 'scan_logs';
export const STORAGE_KEY = '3dbysd_smart_reviews_cards';

export type CustomerLoadState = 'loading' | 'success' | 'not_found' | 'error' | 'invalid_id';

export interface CardLookupResult {
  status: CustomerLoadState;
  card: CardRecord | null;
  errorMessage?: string;
  isNetworkError?: boolean;
}

/**
 * Extracts the target card ID from any supported path, hash, or query parameter format.
 * Preserves exact leading zeros (e.g. '0003' -> '0003').
 */
export function extractCardId(urlOrPath?: string): string | null {
  const locationPath =
    urlOrPath ??
    (typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}${window.location.hash}`
      : '');

  if (!locationPath) return null;

  try {
    // 1. Check path prefix: /r/:id, /c/:id, /review/:id, /nfc/:id
    const pathMatch = locationPath.match(/(?:^\/|\/)(?:r|c|review|nfc)\/([^/?#]+)/i);
    if (pathMatch && pathMatch[1]) {
      const decoded = decodeURIComponent(pathMatch[1]).trim();
      if (decoded) return decoded;
    }

    // 2. Check hash: #/r/:id or #0003
    if (locationPath.includes('#')) {
      const hashPart = locationPath.split('#')[1] || '';
      const hashRMatch = hashPart.match(/(?:^\/|\/)?(?:r|c|review|nfc)\/([^/?#]+)/i);
      if (hashRMatch && hashRMatch[1]) {
        const decoded = decodeURIComponent(hashRMatch[1]).trim();
        if (decoded) return decoded;
      }
      if (hashPart && !hashPart.includes('/') && !hashPart.includes('?')) {
        const decoded = decodeURIComponent(hashPart).replace(/^#/, '').trim();
        if (decoded) return decoded;
      }
    }

    // 3. Check query parameters: ?card=..., ?r=..., ?c=..., ?nfc=..., ?id=...
    if (locationPath.includes('?')) {
      const queryString = locationPath.split('?')[1]?.split('#')[0] || '';
      const params = new URLSearchParams(queryString);
      const qVal =
        params.get('card') ||
        params.get('r') ||
        params.get('c') ||
        params.get('nfc') ||
        params.get('id');
      if (qVal && qVal.trim()) {
        return qVal.trim();
      }
    }
  } catch {
    // Fallback if URL parsing fails
  }

  return null;
}

/**
 * Infers scan source (qr | nfc | direct) from current URL path/query.
 */
export function detectScanSource(urlOrPath?: string): ScanSource {
  const locationPath =
    urlOrPath ??
    (typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}${window.location.hash}`
      : '');
  const lower = locationPath.toLowerCase();
  if (lower.includes('/nfc/') || lower.includes('nfc=') || lower.includes('source=nfc')) {
    return 'nfc';
  }
  if (lower.includes('direct=true')) {
    return 'direct';
  }
  return 'qr';
}

/**
 * Validates whether a card ID has an acceptable, safe format.
 * Card IDs must be 1-64 characters, containing only alphanumeric characters, dashes, dots, or underscores.
 */
export function isValidCardId(id: string | null | undefined): boolean {
  if (!id || typeof id !== 'string') return false;
  const clean = id.trim();
  if (clean.length === 0 || clean.length > 64) return false;
  if (clean === '.' || clean === '..') return false;
  return /^[a-zA-Z0-9_\-.]+$/.test(clean);
}

/**
 * Updates a single card record in the local storage cache without clobbering other cards.
 */
export function updateLocalStorageCard(card: CardRecord): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    let list: CardRecord[] = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) list = [];
    const idx = list.findIndex((c) => c.id.toLowerCase() === card.id.toLowerCase());
    if (idx !== -1) {
      list[idx] = card;
    } else {
      list.push(card);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Ignore localStorage quota or private browsing errors
  }
}

/**
 * Retrieves a card from local storage cache if available.
 */
export function getCachedCard(id: string): CardRecord | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const list = JSON.parse(raw) as CardRecord[];
    if (!Array.isArray(list)) return null;
    return list.find((c) => c.id.toLowerCase() === id.trim().toLowerCase()) || null;
  } catch {
    return null;
  }
}

/**
 * Computes scan outcome from a card's status and subscription dates.
 */
export function determineScanOutcome(card: CardRecord): ScanOutcome {
  if (card.status === 'disabled') return 'disabled';
  if (card.status === 'available') return 'unassigned';
  const access = isSubscriptionAccessible(card);
  if (!access.accessible) {
    return access.status === 'upcoming' ? 'upcoming' : 'expired';
  }
  return 'allowed';
}

/**
 * Records a live QR/NFC scan in Cloud Firestore:
 * 1. Atomically increments scansCount (+1) and sets lastScannedAt/updatedAt on cards/{cardId}.
 * 2. Appends an immutable scan event document into scan_logs/{logId} preserving full attribution.
 * Never overwrites or deletes historical scan logs.
 */
export async function recordPublicCardScan(
  card: CardRecord,
  options: {
    source?: ScanSource;
    route?: string;
    userAgent?: string;
    dedupeWindowMs?: number;
  } = {}
): Promise<ScanLogRecord | null> {
  if (!card || !isValidCardId(card.id)) return null;

  // Prevent React StrictMode / instant duplicate effect mounts from double-logging the same scan
  const dedupeWindowMs = options.dedupeWindowMs ?? 3000;
  if (typeof sessionStorage !== 'undefined' && dedupeWindowMs > 0) {
    try {
      const key = `3dbysd_last_scan_${card.id}`;
      const prevTs = Number(sessionStorage.getItem(key) || '0');
      if (prevTs && Date.now() - prevTs < dedupeWindowMs) {
        return null;
      }
      sessionStorage.setItem(key, String(Date.now()));
    } catch {
      // ignore sessionStorage restrictions
    }
  }

  const now = new Date().toISOString();
  const subStatus = getSubscriptionStatus(card);
  const outcome = determineScanOutcome(card);
  const source: ScanSource = options.source || detectScanSource();
  const route = (
    options.route ||
    (typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : `/r/${card.id}`)
  ).slice(0, 300);
  const userAgent = (
    options.userAgent ||
    (typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown')
  ).slice(0, 300);

  const randomSuffix = Math.random().toString(36).slice(2, 8);
  const logId = `scan_${card.id}_${Date.now()}_${randomSuffix}`;

  const scanLog: ScanLogRecord = {
    id: logId,
    cardId: card.id,
    businessName: (card.businessName || '').slice(0, 250),
    category: (card.category || '').slice(0, 250),
    assignedToEmail: (card.assignedToEmail || '').trim().toLowerCase().slice(0, 200),
    assignedToUid: (card.assignedToUid || '').trim().slice(0, 128),
    source,
    outcome,
    subscriptionStatus: subStatus,
    route,
    userAgent,
    scannedAt: now,
  };

  // Run both Firestore writes in parallel; each strictly adheres to firestore.rules
  const cardRef = doc(db, CARDS_COLLECTION, card.id);
  const logRef = doc(db, SCAN_LOGS_COLLECTION, logId);

  const [incRes, logRes] = await Promise.allSettled([
    updateDoc(cardRef, {
      scansCount: increment(1),
      updatedAt: now,
      lastScannedAt: now,
    }),
    setDoc(logRef, scanLog),
  ]);

  if (incRes.status === 'rejected') {
    console.warn(`[3DBYSD Scan] Counter increment notice for #${card.id}:`, incRes.reason?.message || incRes.reason);
  }
  if (logRes.status === 'rejected') {
    console.warn(`[3DBYSD Scan] Scan log write notice for #${card.id}:`, logRes.reason?.message || logRes.reason);
    return null;
  }

  return scanLog;
}

/**
 * Authoritative, Firestore-first multi-tier card lookup:
 * 1. Validates ID format (returns 'invalid_id' without making network requests if invalid).
 * 2. Queries Cloud Firestore directly as the single authoritative source of truth.
 * 3. Falls back to server API (/api/cards/:id) ONLY if Firestore is transiently unreachable.
 * 4. Distinguishes between genuine 404 ('not_found') and transient network failure ('error').
 * 5. Implements bounded automatic retries for recoverable network errors.
 */
export async function lookupCard(
  rawId: string,
  options: {
    recordScan?: boolean;
    source?: ScanSource;
    signal?: AbortSignal;
    maxRetries?: number;
  } = {}
): Promise<CardLookupResult> {
  const cleanId = (rawId || '').trim();

  // Step 1: Validate ID
  if (!isValidCardId(cleanId)) {
    return {
      status: 'invalid_id',
      card: null,
      errorMessage: `"${rawId}" is not a valid stand identifier.`,
    };
  }

  const cachedCandidate = getCachedCard(cleanId);

  const executeSingleAttempt = async (): Promise<CardLookupResult> => {
    if (options.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    let firestoreFailed = false;
    let firestoreNotFound = false;

    // A. Query Cloud Firestore FIRST (authoritative live database)
    try {
      const docRef = doc(db, CARDS_COLLECTION, cleanId);
      const docSnap = await getDoc(docRef);

      if (options.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      if (docSnap.exists()) {
        const fsCard = { id: docSnap.id, ...(docSnap.data() as Omit<CardRecord, 'id'>) } as CardRecord;
        if (options.recordScan) {
          recordPublicCardScan(fsCard, { source: options.source }).catch(() => {});
        }
        updateLocalStorageCard(fsCard);
        return { status: 'success', card: fsCard };
      }

      firestoreNotFound = true;
    } catch (fsErr: any) {
      if (fsErr?.name === 'AbortError') throw fsErr;
      firestoreFailed = true;
      console.warn(`Firestore lookup notice for Stand #${cleanId}:`, fsErr?.message || fsErr);
    }

    // If Firestore confirmed the document does not exist, verify briefly or return not_found
    if (firestoreNotFound) {
      return {
        status: 'not_found',
        card: null,
        errorMessage: `Could not retrieve business details for Stand #${cleanId}.`,
      };
    }

    // B. Fallback to Server REST API ONLY when Firestore was unreachable
    if (firestoreFailed) {
      try {
        const baseUrl = typeof window !== 'undefined' ? '' : 'http://localhost:3000';
        const res = await fetch(`${baseUrl}/api/cards/${encodeURIComponent(cleanId)}`, {
          signal: options.signal,
        });

        if (res.ok) {
          const data = await res.json();
          if (data.card) {
            updateLocalStorageCard(data.card);
            return { status: 'success', card: data.card };
          }
        } else if (res.status === 404) {
          return {
            status: 'not_found',
            card: null,
            errorMessage: `Could not retrieve business details for Stand #${cleanId}.`,
          };
        }
      } catch (err: any) {
        if (err?.name === 'AbortError' || options.signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
      }

      if (cachedCandidate) {
        return {
          status: 'success',
          card: cachedCandidate,
        };
      }

      return {
        status: 'error',
        card: null,
        errorMessage: 'Network connection issue while connecting to the stand service.',
        isNetworkError: true,
      };
    }

    return {
      status: 'not_found',
      card: null,
      errorMessage: `Could not retrieve business details for Stand #${cleanId}.`,
    };
  };

  // Step 2: Bounded retry strategy for recoverable network errors
  const maxRetries = options.maxRetries ?? 2;
  let attempt = 0;
  let lastResult: CardLookupResult = {
    status: 'error',
    card: null,
    errorMessage: 'Connection attempt failed',
    isNetworkError: true,
  };

  while (attempt <= maxRetries) {
    try {
      lastResult = await executeSingleAttempt();

      if (
        lastResult.status === 'success' ||
        lastResult.status === 'not_found' ||
        lastResult.status === 'invalid_id'
      ) {
        return lastResult;
      }

      if (attempt < maxRetries) {
        attempt++;
        const backoffMs = Math.min(300 * Math.pow(1.5, attempt) + Math.random() * 150, 1500);
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, backoffMs);
          if (options.signal) {
            options.signal.addEventListener(
              'abort',
              () => {
                clearTimeout(timer);
                reject(new DOMException('Aborted', 'AbortError'));
              },
              { once: true }
            );
          }
        });
      } else {
        break;
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') throw err;
      if (attempt < maxRetries) {
        attempt++;
        await new Promise((r) => setTimeout(r, 400));
      } else {
        return {
          status: 'error',
          card: cachedCandidate || null,
          errorMessage: err?.message || 'Connection failed.',
          isNetworkError: true,
        };
      }
    }
  }

  return lastResult;
}
