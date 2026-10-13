/**
 * URL utility to generate reliable, scan-ready public URLs for QR Codes and NFC tags.
 */

// Official Cloud Run dev url provided by AI Studio environment
export const PUBLIC_CLOUD_DEV_URL = 'https://ais-dev-tjiubv2lfblco4uohhsdg4-90988740849.asia-east1.run.app';

export function getPublicBaseUrl(): string {
  // 1. User manual override from settings/customizer (e.g. custom domain)
  try {
    const custom = localStorage.getItem('3dbysd_custom_base_url');
    if (custom && custom.trim().startsWith('http')) {
      return custom.trim().replace(/\/+$/, '');
    }
  } catch {
    // ignore
  }

  // 2. Browser check: Always use window.location.origin when in an active browser session!
  if (typeof window !== 'undefined' && window.location) {
    const { origin, hostname } = window.location;
    // If running in browser or iframe, window.location.origin is the exact server where app is mounted!
    if (origin && origin.startsWith('http')) {
      // If user is accessing from localhost, external phones cannot reach localhost,
      // so if they scan from an external phone camera, PUBLIC_CLOUD_DEV_URL is available.
      // But for in-browser testing, clicks, and simulator, return the active origin!
      return origin.replace(/\/+$/, '');
    }
  }

  return PUBLIC_CLOUD_DEV_URL;
}

/**
 * Returns scan URL for browser testing, simulators, and in-app clicks.
 */
export function getCardScanUrl(cardId: string): string {
  const cleanId = String(cardId).trim();
  const base = getPublicBaseUrl();
  return `${base}/r/${encodeURIComponent(cleanId)}`;
}

/**
 * Returns NFC hardware tag payload URL.
 * Also supports direct hash/param compatibility so it always loads the review generator.
 */
export function getNfcCardUrl(cardId: string): string {
  return getCardScanUrl(cardId);
}

/**
 * Returns external phone-scannable Cloud Run URL (useful if testing from physical mobile camera).
 */
export function getExternalPhoneScanUrl(cardId: string): string {
  const cleanId = String(cardId).trim();
  return `${PUBLIC_CLOUD_DEV_URL}/r/${encodeURIComponent(cleanId)}`;
}
