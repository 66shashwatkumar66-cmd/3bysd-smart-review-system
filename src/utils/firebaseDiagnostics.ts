import { auth, db, firebaseConfig } from '../firebase';
import { doc, getDocFromServer } from 'firebase/firestore';

export interface FirebaseDiagnosticReport {
  timestamp: string;
  firebaseInitialized: boolean;
  authInitialized: boolean;
  firestoreInitialized: boolean;
  firestoreConnected: boolean;
  firestoreError?: string;
  projectId: string;
  firestoreDatabaseId: string;
  authDomain: string;
  oAuthClientId: string;
  currentHostname: string;
  currentOrigin: string;
  isLocalhost: boolean;
  isStandardFirebaseDomain: boolean;
  isDomainLikelyAuthorized: boolean;
  standardAuthorizedDomains: string[];
  allKnownDomains: string[];
  issues: string[];
  recommendations: string[];
}

/**
 * Standard domains that are pre-authorized in Firebase Auth by default:
 * 1. localhost & 127.0.0.1
 * 2. <projectId>.firebaseapp.com
 * 3. <projectId>.web.app
 */
export function getStandardAuthorizedDomains(): string[] {
  const projectId = firebaseConfig.projectId || '';
  return [
    'localhost',
    '127.0.0.1',
    `${projectId}.firebaseapp.com`,
    `${projectId}.web.app`,
  ];
}

/**
 * All known domains for this application environment (including AI Studio preview URLs).
 */
export function getAllKnownAppDomains(): string[] {
  const standard = getStandardAuthorizedDomains();
  const additional = [
    'ais-dev-tjiubv2lfblco4uohhsdg4-90988740849.asia-east1.run.app',
    'ais-pre-tjiubv2lfblco4uohhsdg4-90988740849.asia-east1.run.app',
  ];
  return Array.from(new Set([...standard, ...additional])).filter(Boolean);
}

/**
 * Validates Firebase initialization, database connection, and OAuth domain configuration.
 */
export async function runFirebaseDiagnostics(): Promise<FirebaseDiagnosticReport> {
  const currentHostname = typeof window !== 'undefined' ? window.location.hostname : 'unknown';
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'unknown';

  const isLocalhost =
    currentHostname === 'localhost' ||
    currentHostname === '127.0.0.1' ||
    currentHostname === '0.0.0.0';

  const standardDomains = getStandardAuthorizedDomains();
  const allKnown = getAllKnownAppDomains();

  const isStandardFirebaseDomain =
    isLocalhost ||
    standardDomains.some((d) => d.toLowerCase() === currentHostname.toLowerCase());

  // Check if current hostname is recognized
  const isDomainLikelyAuthorized =
    isStandardFirebaseDomain ||
    allKnown.some((d) => d.toLowerCase() === currentHostname.toLowerCase());

  const issues: string[] = [];
  const recommendations: string[] = [];

  // 1. Firebase Config check
  const firebaseInitialized = Boolean(
    firebaseConfig.projectId && firebaseConfig.apiKey && firebaseConfig.appId
  );
  if (!firebaseInitialized) {
    issues.push('Firebase app configuration is missing critical keys (projectId, apiKey, or appId).');
    recommendations.push('Verify firebase-applet-config.json has valid credentials.');
  }

  // 2. Auth config check
  const authInitialized = Boolean(auth && firebaseConfig.authDomain);
  if (!authInitialized) {
    issues.push('Firebase Auth is not properly initialized or authDomain is missing.');
    recommendations.push('Ensure authDomain is set in firebase-applet-config.json.');
  }

  // 3. OAuth client ID check
  if (!firebaseConfig.oAuthClientId) {
    issues.push('OAuth Client ID is not configured in firebase-applet-config.json.');
    recommendations.push('Configure Google OAuth Client ID for full third-party popup federation.');
  }

  // 4. Domain Authorization check
  if (!isStandardFirebaseDomain) {
    issues.push(
      `Current domain "${currentHostname}" is not in Firebase's default authorized domains list (${standardDomains.join(', ')}).`
    );
    recommendations.push(
      `If Google Sign-In gives 'auth/unauthorized-domain', add "${currentHostname}" to Firebase Console -> Authentication -> Settings -> Authorized Domains, or sign in using your pre-authorized Google email below.`
    );
  }

  // 5. Firestore test
  let firestoreConnected = false;
  let firestoreError: string | undefined;
  const firestoreInitialized = Boolean(db && firebaseConfig.firestoreDatabaseId);

  try {
    const testDocRef = doc(db, 'test', 'connection');
    await getDocFromServer(testDocRef);
    firestoreConnected = true;
  } catch (err: any) {
    const msg = err?.message || String(err);
    firestoreError = msg;
    if (msg.includes('Missing or insufficient permissions') || msg.includes('permission-denied')) {
      // Missing document or rule is healthy, server replied!
      firestoreConnected = true;
      firestoreError = undefined;
    } else if (msg.includes('offline') || msg.includes('not found')) {
      firestoreConnected = false;
      issues.push(`Firestore database unreachable: ${msg}`);
      recommendations.push(
        `Ensure database "${firebaseConfig.firestoreDatabaseId}" is provisioned in Firebase Console under project "${firebaseConfig.projectId}".`
      );
    } else {
      // Other error, connection still reached server
      firestoreConnected = true;
    }
  }

  const report: FirebaseDiagnosticReport = {
    timestamp: new Date().toISOString(),
    firebaseInitialized,
    authInitialized,
    firestoreInitialized,
    firestoreConnected,
    firestoreError,
    projectId: firebaseConfig.projectId,
    firestoreDatabaseId: firebaseConfig.firestoreDatabaseId,
    authDomain: firebaseConfig.authDomain,
    oAuthClientId: firebaseConfig.oAuthClientId,
    currentHostname,
    currentOrigin,
    isLocalhost,
    isStandardFirebaseDomain,
    isDomainLikelyAuthorized,
    standardAuthorizedDomains: standardDomains,
    allKnownDomains: allKnown,
    issues,
    recommendations,
  };

  return report;
}

/**
 * Logs comprehensive, structured debugging information to the browser console when Google sign-in fails.
 */
export function logAuthFailure(error: any, context: string = 'Google Sign-In'): void {
  const currentHostname = typeof window !== 'undefined' ? window.location.hostname : 'unknown';
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'unknown';
  const errorCode = error?.code || 'unknown_error';
  const errorMessage = error?.message || String(error);
  const standardDomains = getStandardAuthorizedDomains();

  console.group(`🔴 [3DBYSD Auth Diagnostics] ${context} Failed`);
  console.error('Error Code:', errorCode);
  console.error('Error Message:', errorMessage);
  console.info('Current Origin:', currentOrigin);
  console.info('Current Hostname:', currentHostname);
  console.info('Firebase Project ID:', firebaseConfig.projectId);
  console.info('Firebase Auth Domain:', firebaseConfig.authDomain);
  console.info('OAuth Client ID:', firebaseConfig.oAuthClientId);
  console.info('Default Authorized Domains:', standardDomains);

  if (errorCode === 'auth/unauthorized-domain' || errorMessage.includes('unauthorized-domain')) {
    console.warn(
      `⚠️ DOMAIN NOT AUTHORIZED: The current domain "${currentHostname}" must be added to your Firebase project's authorized domains list.`
    );
    console.info(
      '👉 To resolve in Firebase Console:\n' +
        `1. Visit: https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/settings\n` +
        '2. Click on the "Authorized domains" tab\n' +
        `3. Click "Add domain" and enter: ${currentHostname}\n` +
        '4. Save changes and reload this page.'
    );
  } else if (errorCode === 'auth/popup-blocked') {
    console.warn(
      '⚠️ POPUP BLOCKED: The browser blocked the OAuth popup window. User must enable popups or use fallback verified email authorization.'
    );
  } else if (errorCode === 'auth/popup-closed-by-user') {
    console.info('ℹ️ POPUP CANCELLED: The user closed the Google sign-in popup before completing authentication.');
  }

  console.groupEnd();
}
