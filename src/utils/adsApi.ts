import { Advertisement, AdPlacement } from '../types';
import { db } from '../firebase';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';
import { cleanForFirestore } from './api';

const ADS_COLLECTION = 'ads';
const ADS_STORAGE_KEY = '3dbysd_smart_reviews_ads';

export const INITIAL_SAMPLE_ADS: Advertisement[] = [
  {
    id: 'ad-001',
    name: '3D Printed QR Stands Promotion',
    advertiser: '3DBYSD Studios',
    headline: 'Custom 3D Printed NFC & QR Stands for Businesses',
    description: 'Elevate your counter or table with durable, branded acrylic and wood review stands.',
    imageUrl: 'https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?auto=format&fit=crop&w=400&q=80',
    targetUrl: 'https://3dbysd.com',
    ctaText: 'Explore Stands',
    placement: 'below_draft',
    status: 'active',
    priority: 10,
    impressions: 48,
    clicks: 6,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

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
 * Fetches all advertisements.
 * If `forPublic` is true, returns only currently active, scheduled, and enabled ads.
 */
export async function fetchAds(forPublic: boolean = false): Promise<Advertisement[]> {
  let adsList: Advertisement[] = [];

  // 1. Try Firestore
  try {
    const snap = await getDocs(collection(db, ADS_COLLECTION));
    if (!snap.empty) {
      snap.forEach((d) => {
        adsList.push(d.data() as Advertisement);
      });
    }
  } catch (err) {
    console.warn('Firestore fetchAds notice:', err);
  }

  // 2. Fallback to Server REST API
  if (adsList.length === 0) {
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

  // 3. Fallback to localStorage cache
  if (adsList.length === 0) {
    try {
      const cached = localStorage.getItem(ADS_STORAGE_KEY);
      if (cached) {
        adsList = JSON.parse(cached);
      }
    } catch {
      // ignore
    }
  }

  // Fallback to initial sample ad if brand new setup
  if (adsList.length === 0 && !forPublic) {
    adsList = [...INITIAL_SAMPLE_ADS];
    localStorage.setItem(ADS_STORAGE_KEY, JSON.stringify(adsList));
  }

  // Cache in localStorage for snappy subsequent loads
  if (adsList.length > 0) {
    localStorage.setItem(ADS_STORAGE_KEY, JSON.stringify(adsList));
  }

  if (forPublic) {
    return adsList
      .filter(isAdCurrentlyEligible)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  return adsList.sort((a, b) => (b.priority || 0) - (a.priority || 0));
}

/**
 * Saves or updates an advertisement (Master Admin only).
 */
export async function saveAd(
  adData: Partial<Advertisement> & { name: string; targetUrl: string },
  adminEmail?: string
): Promise<Advertisement> {
  if (!isSafeUrl(adData.targetUrl)) {
    throw new Error('Destination URL must start with https:// or http://');
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

  // 1. Write to Firestore
  try {
    await setDoc(doc(db, ADS_COLLECTION, id), sanitized);
  } catch (err) {
    console.warn(`Firestore saveAd notice for ${id}:`, err);
  }

  // 2. Sync to Server REST API
  try {
    await fetch('/api/ads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(adminEmail ? { 'x-admin-email': adminEmail } : {}),
      },
      body: JSON.stringify(sanitized),
    });
  } catch (netErr) {
    console.warn('Server saveAd notice:', netErr);
  }

  // 3. Update localStorage cache
  try {
    const cached = await fetchAds();
    const idx = cached.findIndex((a) => a.id === id);
    let updated: Advertisement[];
    if (idx !== -1) {
      updated = [...cached];
      updated[idx] = fullAd;
    } else {
      updated = [fullAd, ...cached];
    }
    localStorage.setItem(ADS_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }

  return fullAd;
}

/**
 * Deletes an advertisement (Master Admin only).
 */
export async function deleteAd(id: string, adminEmail?: string): Promise<boolean> {
  // 1. Delete from Firestore
  try {
    await deleteDoc(doc(db, ADS_COLLECTION, id));
  } catch (err) {
    console.warn(`Firestore deleteAd notice for ${id}:`, err);
  }

  // 2. Delete on Server
  try {
    await fetch(`/api/ads/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: {
        ...(adminEmail ? { 'x-admin-email': adminEmail } : {}),
      },
    });
  } catch {
    // ignore
  }

  // 3. Update localStorage cache
  try {
    const cached = await fetchAds();
    const filtered = cached.filter((a) => a.id !== id);
    localStorage.setItem(ADS_STORAGE_KEY, JSON.stringify(filtered));
  } catch {
    // ignore
  }

  return true;
}

/**
 * Records an ad impression safely without double-counting.
 */
export async function recordAdImpression(id: string): Promise<void> {
  try {
    await fetch(`/api/ads/${encodeURIComponent(id)}/impression`, {
      method: 'POST',
    });
  } catch {
    // Non-blocking fire and forget
  }
}

/**
 * Records a user click on an advertisement.
 */
export async function recordAdClick(id: string): Promise<void> {
  try {
    await fetch(`/api/ads/${encodeURIComponent(id)}/click`, {
      method: 'POST',
    });
  } catch {
    // Non-blocking fire and forget
  }
}
