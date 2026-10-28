import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { CardRecord } from '../types';

export const CARDS_COLLECTION = 'cards';
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
 * Validates whether a card ID has an acceptable, safe format.
 * Card IDs must be 1-64 characters, containing only alphanumeric characters, dashes, dots, or underscores.
 */
export function isValidCardId(id: string | null | undefined): boolean {
  if (!id || typeof id !== 'string') return false;
  const clean = id.trim();
  if (clean.length === 0 || clean.length > 64) return false;
  if (clean === '.' || clean === '..') return false;
  // Disallow control characters, angle brackets, quotes, spaces, slashes
  return /^[a-zA-Z0-9_\-\.]+$/.test(clean);
}

/**
 * Updates a single card record in the local storage cache without clobbering other cards.
 */
export function updateLocalStorageCard(card: CardRecord): void {
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
 * Authoritative, multi-tier card lookup:
 * 1. Validates ID format (returns 'invalid_id' without making network requests if invalid).
 * 2. Checks local cache for instant rendering candidate.
 * 3. Queries server API (/api/cards/:id) which responds in <15ms.
 * 4. Queries Firestore directly for real-time consistency.
 * 5. Distinguishes between genuine 404 ('not_found') and transient network failure ('error').
 * 6. Implements bounded automatic retries for recoverable network errors.
 */
export async function lookupCard(
  rawId: string,
  options: {
    recordScan?: boolean;
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

  // Core single attempt function
  const executeSingleAttempt = async (): Promise<CardLookupResult> => {
    if (options.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    let serverCard: CardRecord | null = null;
    let serverNotFound = false;
    let serverFailed = false;

    // A. Query local server REST API
    try {
      const baseUrl = typeof window !== 'undefined' ? '' : 'http://localhost:3000';
      const scanParam = options.recordScan ? '?scan=true' : '';
      const res = await fetch(`${baseUrl}/api/cards/${encodeURIComponent(cleanId)}${scanParam}`, {
        signal: options.signal,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.card) {
          serverCard = data.card;
        }
      } else if (res.status === 404) {
        serverNotFound = true;
      } else {
        serverFailed = true;
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || options.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      serverFailed = true;
    }

    if (options.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    if (serverCard) {
      updateLocalStorageCard(serverCard);
      return {
        status: 'success',
        card: serverCard,
      };
    }

    // B. Query Cloud Firestore
    // Firestore is authoritative. If server responded 404 or had a transient network error,
    // verify with Firestore.
    try {
      const docRef = doc(db, CARDS_COLLECTION, cleanId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const fsCard = docSnap.data() as CardRecord;
        if (options.recordScan) {
          const newCount = (fsCard.scansCount || 0) + 1;
          const updated: CardRecord = {
            ...fsCard,
            scansCount: newCount,
            updatedAt: new Date().toISOString(),
          };
          setDoc(docRef, updated, { merge: true }).catch(() => {});
          updateLocalStorageCard(updated);
          return { status: 'success', card: updated };
        }
        updateLocalStorageCard(fsCard);
        return { status: 'success', card: fsCard };
      }

      // If document does NOT exist in Firestore:
      // If server also returned 404 (or was skipped), this card genuinely does not exist!
      if (serverNotFound || !serverFailed) {
        return {
          status: 'not_found',
          card: null,
          errorMessage: `Could not retrieve business details for Stand #${cleanId}.`,
        };
      }
    } catch (fsErr: any) {
      if (fsErr.name === 'AbortError') throw fsErr;
      console.warn(`Firestore lookup notice for Stand #${cleanId}:`, fsErr);

      // If both server and Firestore encountered network failures, but we have a cached copy:
      if (cachedCandidate) {
        return {
          status: 'success',
          card: cachedCandidate,
        };
      }

      // Otherwise, return recoverable network error
      return {
        status: 'error',
        card: null,
        errorMessage: 'Network connection issue while connecting to the stand service.',
        isNetworkError: true,
      };
    }

    // If doc doesn't exist in Firestore and server returned 404
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

      // Definitive outcomes do not retry
      if (lastResult.status === 'success' || lastResult.status === 'not_found' || lastResult.status === 'invalid_id') {
        return lastResult;
      }

      // If transient error and retries remaining, wait with exponential backoff + jitter
      if (attempt < maxRetries) {
        attempt++;
        const backoffMs = Math.min(300 * Math.pow(1.5, attempt) + Math.random() * 150, 1500);
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, backoffMs);
          if (options.signal) {
            options.signal.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(new DOMException('Aborted', 'AbortError'));
            });
          }
        });
      } else {
        break;
      }
    } catch (err: any) {
      if (err.name === 'AbortError') throw err;
      if (attempt < maxRetries) {
        attempt++;
        await new Promise((r) => setTimeout(r, 400));
      } else {
        return {
          status: 'error',
          card: cachedCandidate || null,
          errorMessage: err.message || 'Connection failed.',
          isNetworkError: true,
        };
      }
    }
  }

  return lastResult;
}
