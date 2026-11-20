import { Advertisement, AdPlacement } from '../types';
import { db } from '../firebase';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  increment,
} from 'firebase/firestore';
import { cleanForFirestore, isCurrentAuthMaster } from './api';

const ADS_COLLECTION = 'ads';
const ADS_STORAGE_KEY = '3dbysd_smart_reviews_ads';

/**
 * Validates that a destination URL uses safe protocols (http, https).
 */
export function isSafeUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim().toLowerCase();
  return trimmed.startsWith('https://') || trimmed.startsWith('http://');
}

/**
 * Checks whether an advertisement is currently eligible for public display.
 */
export function isAdCurrentlyEligible(ad: Advertisement): boolean {
  if (ad.status !== 'active') return false;
  if (ad.placement === 'disabled') return false;

  const now = Date.now();
  if (ad.startDate) {
    const start = new Date(ad.startDate).getTime();
    if (!isNaN(start) && now < start) return false;
  }
  if (ad.endDate) {
    const end = new Date(ad.endDate).getTime();
    if (!isNaN(end) && now > end) return false;
  }

  return true;
}

/**
 * Fetches advertisements directly from Cloud Firestore (authoritative),
 * falling back to Server REST API only on transient network failure.
 */
export async function fetchAds(forPublic: boolean = false): Promise<Advertisement[]> {
  let adsList: Advertisement[] = [];
  let loadedFromFirestore = false;

  // 1. Query Cloud Firestore FIRST
  try {
    const snap = await getDocs(collection(db, ADS_COLLECTION));
    snap.forEach((d) => {
      adsList.push({ id: d.id, ...(d.data() as Omit<Advertisement, 'id'>) } as Advertisement);
    });
    loadedFromFirestore = true;
  } catch (err) {
    console.warn('Firestore fetchAds notice:', err);
  }

  // 2. Fallback to Server REST API only if Firestore failed
  if (!loadedFromFirestore) {
    try {
      const res = await fetch(`/api/ads${forPublic ? '?public=true' : ''}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.ads)) {
          adsList = data.ads;
        }
      }
    } catch (netErr) {
      console.warn('Server fetchAds notice:', netErr);
    }
  }

  if (typeof localStorage !== 'undefined' && adsList.length > 0) {
    try {
      localStorage.setItem(ADS_STORAGE_KEY, JSON.stringify(adsList));
    } catch {}
  }

  if (forPublic) {
    return adsList
      .filter(isAdCurrentlyEligible)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  return adsList.sort((a, b) => (b.priority || 0) - (a.priority || 0));
}

/**
 * Saves or updates an advertisement directly in Cloud Firestore (Master Admin only).
 */
export async function saveAd(
  adData: Partial<Advertisement> & { name: string; targetUrl: string },
  _adminEmail?: string
): Promise<Advertisement> {
  if (!isCurrentAuthMaster()) {
    throw new Error('Only Master Admin can create or edit advertisements.');
  }

  if (!isSafeUrl(adData.targetUrl)) {
    throw new Error('Destination URL must start with https:// or http://');
  }

  if (adData.imageUrl && adData.imageUrl.trim() && !isSafeUrl(adData.imageUrl) && !adData.imageUrl.trim().startsWith('data:image/')) {
    throw new Error('Image URL must start with https://, http://, or be a valid uploaded image.');
  }

  const now = new Date().toISOString();
  const id = adData.id || `ad-${Date.now().toString(36)}`;

  const fullAd: Advertisement = {
    id,
    name: String(adData.name).trim(),
    advertiser: String(adData.advertiser || 'Sponsored').trim(),
    headline: String(adData.headline || '').trim(),
    description: adData.description ? String(adData.description).trim() : undefined,
    imageUrl: adData.imageUrl ? String(adData.imageUrl).trim() : undefined,
    targetUrl: String(adData.targetUrl).trim(),
    ctaText: adData.ctaText ? String(adData.ctaText).trim() : 'Learn More',
    placement: (adData.placement as AdPlacement) || 'below_draft',
    status: adData.status || 'active',
    startDate: adData.startDate ? String(adData.startDate).trim() : undefined,
    endDate: adData.endDate ? String(adData.endDate).trim() : undefined,
    priority: Number(adData.priority) || 10,
    impressions: Number(adData.impressions) || 0,
    clicks: Number(adData.clicks) || 0,
    createdAt: adData.createdAt || now,
    updatedAt: now,
  };

  const sanitized = cleanForFirestore(fullAd);

  try {
    await setDoc(doc(db, ADS_COLLECTION, id), sanitized);
  } catch (err: any) {
    throw new Error(
      err?.code === 'permission-denied'
        ? 'Permission denied: Master Admin Google authentication required to save advertisements.'
        : err?.message || 'Failed to save advertisement to Firestore.'
    );
  }

  return fullAd;
}

/**
 * Deletes an advertisement from Cloud Firestore (Master Admin only).
 */
export async function deleteAd(id: string, _adminEmail?: string): Promise<boolean> {
  if (!isCurrentAuthMaster()) {
    throw new Error('Only Master Admin can delete advertisements.');
  }

  try {
    await deleteDoc(doc(db, ADS_COLLECTION, id));
  } catch (err: any) {
    throw new Error(
      err?.code === 'permission-denied'
        ? 'Permission denied: Master Admin authentication required to delete advertisements.'
        : err?.message || 'Failed to delete advertisement.'
    );
  }

  return true;
}

/**
 * Atomically increments an ad impression in Cloud Firestore (matches isPublicAdMetricIncrement rule).
 */
export async function recordAdImpression(id: string): Promise<void> {
  if (!id) return;
  try {
    await updateDoc(doc(db, ADS_COLLECTION, id), {
      impressions: increment(1),
    });
  } catch {
    // Non-blocking fire and forget
  }
}

/**
 * Atomically increments an ad click in Cloud Firestore (matches isPublicAdMetricIncrement rule).
 */
export async function recordAdClick(id: string): Promise<void> {
  if (!id) return;
  try {
    await updateDoc(doc(db, ADS_COLLECTION, id), {
      clicks: increment(1),
    });
  } catch {
    // Non-blocking fire and forget
  }
}
