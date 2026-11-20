import { auth, db, firebaseConfig } from '../firebase';
import { doc, getDocFromServer } from 'firebase/firestore';

const PRIMARY_MASTER_EMAIL = '66shashwatkumar66@gmail.com';

export interface FirebaseDiagnosticReport {
  timestamp: string;
  firebaseInitialized: boolean;
  authInitialized: boolean;
  firestoreInitialized: boolean;
  firestoreConnected: boolean;
  firestoreError?: string;
  signedInEmail: string | null;
  signedInUid: string | null;
  isEmailVerified: boolean;
  isMasterAuthSession: boolean;
  backendApiReachable: boolean;
  backendMode: 'express' | 'firestore-only';
  adminRegistryReadable: boolean;
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
 * Validates Firebase initialization, active Auth session, backend mode, database connection, and OAuth domain configuration.
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

  // 2. Auth config & active session check
  const authInitialized = Boolean(auth && firebaseConfig.authDomain);
  if (!authInitialized) {
    issues.push('Firebase Auth is not properly initialized or authDomain is missing.');
    recommendations.push('Ensure authDomain is set in firebase-applet-config.json.');
  }

  const currentAuthUser = auth?.currentUser || null;
  const signedInEmail = currentAuthUser?.email?.toLowerCase().trim() || null;
  const signedInUid = currentAuthUser?.uid || null;
  const isEmailVerified = Boolean(currentAuthUser?.emailVerified);
  const isMasterAuthSession = Boolean(signedInEmail === PRIMARY_MASTER_EMAIL && isEmailVerified);

  if (!currentAuthUser) {
    issues.push('No active Firebase Google Auth session detected in this browser tab.');
    recommendations.push('Sign in with Google so Firestore security rules can authorize admin operations.');
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
      `If Google Sign-In gives 'auth/unauthorized-domain', add "${currentHostname}" to Firebase Console -> Authentication -> Settings -> Authorized Domains.`
    );
  }

  // 5. Backend API reachability check (Express full-stack vs Static/Firestore-only host)
  let backendApiReachable = false;
  try {
    const res = await fetch(
      `/api/auth/session-status?email=${encodeURIComponent(signedInEmail || PRIMARY_MASTER_EMAIL)}`
    );
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (res.ok && ct.includes('application/json')) {
      backendApiReachable = true;
    }
  } catch {
    backendApiReachable = false;
  }
  const backendMode: 'express' | 'firestore-only' = backendApiReachable ? 'express' : 'firestore-only';

  // 6. Firestore connectivity & Admin Registry read check
  let firestoreConnected = false;
  let adminRegistryReadable = false;
  let firestoreError: string | undefined;
  const firestoreInitialized = Boolean(db && firebaseConfig.firestoreDatabaseId);

  try {
    const probeRef = signedInEmail
      ? doc(db, 'admins', signedInEmail)
      : doc(db, 'test', 'connection');
    await getDocFromServer(probeRef);
    firestoreConnected = true;
    if (signedInEmail) {
      adminRegistryReadable = true;
    }
  } catch (err: any) {
    const msg = err?.message || String(err);
    firestoreError = msg;
    if (msg.includes('Missing or insufficient permissions') || msg.includes('permission-denied')) {
      firestoreConnected = true;
      if (signedInEmail) {
        adminRegistryReadable = false;
        issues.push(`Firestore denied read on admins/${signedInEmail}: ${msg}`);
        recommendations.push('Verify Firestore security rules are deployed and your Google email is verified.');
      } else {
        firestoreError = undefined;
      }
    } else if (msg.includes('offline') || msg.includes('not found')) {
      firestoreConnected = false;
      issues.push(`Firestore database unreachable: ${msg}`);
      recommendations.push(
        `Ensure database "${firebaseConfig.firestoreDatabaseId}" is provisioned in Firebase Console under project "${firebaseConfig.projectId}".`
      );
    } else {
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
    signedInEmail,
    signedInUid,
    isEmailVerified,
    isMasterAuthSession,
    backendApiReachable,
    backendMode,
    adminRegistryReadable,
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
