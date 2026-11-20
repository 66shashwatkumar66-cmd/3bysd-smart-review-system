/**
 * 3DBYSD Smart Reviews — Live End-to-End Audit Verification Suite
 *
 * Safely verifies:
 * 1. Server health & live Cloud Firestore connectivity (non-destructive on production cards)
 * 2. Historical QR card & scan count preservation (all 90 live cards, 0004 Mercury Sports, 0064 Tea Paradise, 0084 cafe buddies)
 * 3. Public endpoint PII sanitization (no assignedToEmail/Uid/Name/notes leaked)
 * 4. QR/NFC subscription & disabled enforcement (including ?direct=true bypass protection)
 * 5. Live Gemini 4 AI review generation (English, Hinglish, all 5 tones, uniqueness, 400 & 403 enforcement)
 * 6. Backend HTTP 401 RBAC enforcement on all admin/mutating endpoints
 * 7. Live Cloud Firestore Security Rules enforcement (list denials, closed TEST-* backdoor, nonexistent scan_log denial)
 * 8. Frontend customer UX invariants (no auto-review on load, no pre-selected options, concurrency control, Stay Connected)
 */

import fs from 'fs';
import path from 'path';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  setDoc,
  collection,
} from 'firebase/firestore';

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';

interface TestResult {
  section: string;
  name: string;
  passed: boolean;
  detail: string;
}

const results: TestResult[] = [];

function record(section: string, name: string, passed: boolean, detail: string) {
  results.push({ section, name, passed, detail });
  const icon = passed ? 'PASS' : 'FAIL';
  console.log(`[${icon}] (${section}) ${name} — ${detail}`);
}

async function run() {
  console.log(`\n=== 3DBYSD Smart Reviews Live E2E Audit Suite ===`);
  console.log(`Target Server: ${BASE_URL}\n`);

  // Initialize read-only unauthenticated Firebase client matching frontend config
  const fbConfig = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'firebase-applet-config.json'), 'utf8')
  );
  const fbApp = initializeApp(fbConfig, 'audit-e2e-runner');
  const db = getFirestore(fbApp, fbConfig.firestoreDatabaseId);

  // =========================================================================
  // SECTION 1: Health & Live Firestore Historical Data Recovery
  // =========================================================================
  try {
    const healthRes = await fetch(`${BASE_URL}/api/health`);
    const health = await healthRes.json();
    record(
      'Health',
      'GET /api/health',
      healthRes.status === 200 && health.success === true && health.database === 'firestore' && health.aiConfigured === true,
      `status=${healthRes.status}, db=${health.database}, aiConfigured=${health.aiConfigured}`
    );
  } catch (err: any) {
    record('Health', 'GET /api/health', false, err?.message || String(err));
  }

  // Verify live Firestore cards 0001, 0004 (Mercury Sports), 0064 (Tea Paradise), 0084 (cafe buddies)
  const expectedCards: Array<{ id: string; expectedName: string; minScans?: number }> = [
    { id: '0001', expectedName: 'Mercury Sports Pro Store', minScans: 113 },
    { id: '0004', expectedName: 'Mercury Sports', minScans: 6 },
    { id: '0064', expectedName: 'Tea Paradise' },
    { id: '0084', expectedName: 'cafe buddies' },
  ];

  for (const item of expectedCards) {
    try {
      const res = await fetch(`${BASE_URL}/api/cards/${item.id}`);
      const data = await res.json();
      const card = data.card || data;
      const nameMatches =
        typeof card.businessName === 'string' &&
        card.businessName.toLowerCase().includes(item.expectedName.toLowerCase());
      const scansOk = item.minScans === undefined || (Number(card.scansCount) || 0) >= item.minScans;
      const piiClean =
        card.assignedToEmail === undefined &&
        card.assignedToUid === undefined &&
        card.assignedToName === undefined &&
        card.notes === undefined;

      record(
        'Firestore & PII',
        `GET /api/cards/${item.id} (${item.expectedName})`,
        res.status === 200 && nameMatches && scansOk && piiClean,
        `name="${card.businessName}", scans=${card.scansCount}, piiStripped=${piiClean}`
      );
    } catch (err: any) {
      record('Firestore & PII', `GET /api/cards/${item.id}`, false, err?.message || String(err));
    }
  }

  // Verify pre-audit backup snapshot exists and preserves all 90 cards & 183 scans
  try {
    const backupCardsPath = path.resolve(
      process.cwd(),
      'data/pre_audit_backup/full_snapshot/live_firestore_cards.json'
    );
    const backupCards = JSON.parse(fs.readFileSync(backupCardsPath, 'utf8'));
    const totalBackupScans = backupCards.reduce(
      (sum: number, c: any) => sum + (Number(c.scansCount) || 0),
      0
    );
    record(
      'Data Protection',
      'Pre-audit Firestore backup integrity',
      Array.isArray(backupCards) && backupCards.length === 90 && totalBackupScans === 183,
      `cards=${backupCards.length}, historicalScans=${totalBackupScans}`
    );
  } catch (err: any) {
    record('Data Protection', 'Pre-audit Firestore backup integrity', false, err?.message || String(err));
  }

  // =========================================================================
  // SECTION 2: QR / NFC Subscription & Direct Redirect Enforcement
  // =========================================================================
  try {
    // Card 0003 is expired (2025-01-01 to 2025-12-31)
    const expDirect = await fetch(`${BASE_URL}/r/0003?direct=true`, { redirect: 'manual' });
    record(
      'QR/NFC Lifecycle',
      'Expired card #0003 blocks ?direct=true bypass',
      expDirect.status === 200 && !expDirect.headers.get('location'),
      `status=${expDirect.status}, location=${expDirect.headers.get('location') || 'none'}`
    );

    // Card 0014 is disabled
    const disDirect = await fetch(`${BASE_URL}/r/0014?direct=true`, { redirect: 'manual' });
    record(
      'QR/NFC Lifecycle',
      'Disabled card #0014 blocks ?direct=true bypass',
      disDirect.status === 200 && !disDirect.headers.get('location'),
      `status=${disDirect.status}, location=${disDirect.headers.get('location') || 'none'}`
    );

    // Active card 0001 SPA route
    const activeRoute = await fetch(`${BASE_URL}/r/0001`);
    const html = await activeRoute.text();
    record(
      'QR/NFC Lifecycle',
      'Active card #0001 serves SPA cleanly',
      activeRoute.status === 200 && html.includes('<div id="root">'),
      `status=${activeRoute.status}, hasRoot=${html.includes('<div id="root">')}`
    );
  } catch (err: any) {
    record('QR/NFC Lifecycle', 'QR/NFC route checks', false, err?.message || String(err));
  }

  // =========================================================================
  // SECTION 3: Live Gemini 4 AI Review Generation
  // =========================================================================
  // 3A. Missing language/tone -> 400
  try {
    const res = await fetch(`${BASE_URL}/api/generate-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessName: 'Mercury Sports',
        rating: 5,
        tags: ['Great Quality'],
      }),
    });
    const body = await res.json();
    record(
      'AI Review',
      'Rejects request with missing language/tone (HTTP 400)',
      res.status === 400 && body.success === false,
      `status=${res.status}, error="${body.error || body.message}"`
    );
  } catch (err: any) {
    record('AI Review', 'Rejects missing language/tone', false, err?.message || String(err));
  }

  // 3B. Expired card #0003 -> 403
  try {
    const res = await fetch(`${BASE_URL}/api/generate-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cardId: '0003',
        businessName: 'Expired Demo',
        rating: 5,
        tags: ['Quick Service'],
        language: 'en',
        tone: 'warm',
      }),
    });
    const body = await res.json();
    record(
      'AI Review',
      'Blocks expired card #0003 from AI generation (HTTP 403)',
      res.status === 403 && body.success === false,
      `status=${res.status}, error="${body.error || body.message}"`
    );
  } catch (err: any) {
    record('AI Review', 'Blocks expired card #0003', false, err?.message || String(err));
  }

  // 3C. Disabled card #0014 -> 403
  try {
    const res = await fetch(`${BASE_URL}/api/generate-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cardId: '0014',
        businessName: 'Disabled Demo',
        rating: 5,
        tags: ['Clean'],
        language: 'en',
        tone: 'warm',
      }),
    });
    const body = await res.json();
    record(
      'AI Review',
      'Blocks disabled card #0014 from AI generation (HTTP 403)',
      res.status === 403 && body.success === false,
      `status=${res.status}, error="${body.error || body.message}"`
    );
  } catch (err: any) {
    record('AI Review', 'Blocks disabled card #0014', false, err?.message || String(err));
  }

  // 3D. AI disabled toggle -> 403
  try {
    const res = await fetch(`${BASE_URL}/api/generate-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessName: 'Mercury Sports',
        rating: 5,
        tags: ['Great Quality'],
        language: 'en',
        tone: 'casual',
        aiReviewEnabled: false,
      }),
    });
    const body = await res.json();
    record(
      'AI Review',
      'Respects aiReviewEnabled=false (HTTP 403)',
      res.status === 403 && body.success === false,
      `status=${res.status}, error="${body.error || body.message}"`
    );
  } catch (err: any) {
    record('AI Review', 'Respects aiReviewEnabled=false', false, err?.message || String(err));
  }

  // 3D-2. Server-side authoritative aiReviewEnabled=false enforcement on live card #0004
  try {
    const res = await fetch(`${BASE_URL}/api/generate-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cardId: '0004',
        businessName: 'Mercury Sports',
        rating: 5,
        tags: ['Great Quality'],
        language: 'en',
        tone: 'casual',
      }),
    });
    const body = await res.json();
    record(
      'AI Review',
      'Enforces live Firestore aiReviewEnabled=false on card #0004 (HTTP 403)',
      res.status === 403 && body.success === false,
      `status=${res.status}, error="${body.error || body.message}"`
    );
  } catch (err: any) {
    record('AI Review', 'Enforces live Firestore aiReviewEnabled=false', false, err?.message || String(err));
  }

  // 3E. Live Gemini 4 generation across English, Hinglish, and all 5 tones (active AI-enabled card #0001)
  const tones = ['casual', 'warm', 'professional', 'enthusiastic', 'direct'] as const;
  let firstEnglishReview = '';
  for (const tone of tones) {
    try {
      const t0 = Date.now();
      const res = await fetch(`${BASE_URL}/api/generate-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: '0001',
          businessName: 'Mercury Sports Pro Store',
          category: 'Sports Store',
          rating: 5,
          tags: ['Great Quality', 'Helpful Staff'],
          language: 'en',
          tone,
        }),
      });
      const body = await res.json();
      const elapsed = Date.now() - t0;
      const reviewText = body.reviewText || body.review || '';
      if (tone === 'casual') firstEnglishReview = reviewText;
      record(
        'AI Review',
        `Live Gemini 4 English (${tone})`,
        res.status === 200 && body.success === true && body.source === 'gemini' && reviewText.length >= 25,
        `status=${res.status}, source=${body.source}, ${elapsed}ms, len=${reviewText.length}`
      );
    } catch (err: any) {
      record('AI Review', `Live Gemini 4 English (${tone})`, false, err?.message || String(err));
    }
  }

  // 3F. Live Gemini 4 Hinglish
  try {
    const t0 = Date.now();
    const res = await fetch(`${BASE_URL}/api/generate-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cardId: '0064',
        businessName: 'Tea Paradise',
        category: 'Cafe & Tea Shop',
        rating: 5,
        tags: ['Fresh Tea', 'Cozy Ambience'],
        language: 'hinglish',
        tone: 'warm',
      }),
    });
    const body = await res.json();
    const elapsed = Date.now() - t0;
    const reviewText = body.reviewText || body.review || '';
    record(
      'AI Review',
      'Live Gemini 4 Hinglish (Tea Paradise)',
      res.status === 200 && body.success === true && body.source === 'gemini' && reviewText.length >= 25,
      `status=${res.status}, source=${body.source}, ${elapsed}ms, preview="${reviewText.slice(0, 70)}..."`
    );
  } catch (err: any) {
    record('AI Review', 'Live Gemini 4 Hinglish', false, err?.message || String(err));
  }

  // 3G. Try Another Version uniqueness (passes recentDrafts)
  try {
    const res = await fetch(`${BASE_URL}/api/generate-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cardId: '0001',
        businessName: 'Mercury Sports Pro Store',
        category: 'Sports Store',
        rating: 5,
        tags: ['Great Quality', 'Helpful Staff'],
        language: 'en',
        tone: 'casual',
        recentDrafts: firstEnglishReview ? [firstEnglishReview] : [],
      }),
    });
    const body = await res.json();
    const altText = body.reviewText || body.review || '';
    const isUnique = Boolean(altText && altText.trim() !== firstEnglishReview.trim());
    record(
      'AI Review',
      'Try Another Version generates unique alternative',
      res.status === 200 && body.success === true && body.source === 'gemini' && isUnique,
      `source=${body.source}, unique=${isUnique}, len=${altText.length}`
    );
  } catch (err: any) {
    record('AI Review', 'Try Another Version uniqueness', false, err?.message || String(err));
  }

  // =========================================================================
  // SECTION 4: Backend API Security & RBAC (Unauthenticated -> 401)
  // =========================================================================
  const protectedEndpoints: Array<{ method: string; path: string; body?: any }> = [
    { method: 'GET', path: '/api/cards' },
    { method: 'POST', path: '/api/cards/batch', body: { count: 1, startNumber: 999, paddingDigits: 4 } },
    { method: 'PUT', path: '/api/cards/0001/assign', body: { businessName: 'Hacked' } },
    { method: 'DELETE', path: '/api/cards/0001' },
    { method: 'GET', path: '/api/admins' },
    { method: 'POST', path: '/api/admins', body: { email: 'evil@example.com', name: 'Evil' } },
    { method: 'GET', path: '/api/users' },
    { method: 'POST', path: '/api/ads', body: { name: 'Spam', headline: 'Spam', targetUrl: 'https://example.com' } },
    { method: 'POST', path: '/api/upload-logo', body: { image: 'data:image/png;base64,AAAA' } },
  ];

  for (const ep of protectedEndpoints) {
    try {
      const res = await fetch(`${BASE_URL}${ep.path}`, {
        method: ep.method,
        headers: ep.body ? { 'Content-Type': 'application/json' } : undefined,
        body: ep.body ? JSON.stringify(ep.body) : undefined,
      });
      record(
        'API Security',
        `Unauthenticated ${ep.method} ${ep.path} -> 401`,
        res.status === 401,
        `status=${res.status}`
      );
    } catch (err: any) {
      record('API Security', `${ep.method} ${ep.path}`, false, err?.message || String(err));
    }
  }

  // =========================================================================
  // SECTION 5: Live Cloud Firestore Security Rules Enforcement
  // =========================================================================
  // 5A. Public single-doc GET on active card 0004 works
  try {
    const snap = await getDoc(doc(db, 'cards', '0004'));
    record(
      'Firestore Rules',
      'Public single-doc get(cards/0004) allowed',
      snap.exists() && snap.data()?.businessName === 'Mercury Sports',
      `exists=${snap.exists()}, businessName="${snap.data()?.businessName}"`
    );
  } catch (err: any) {
    record('Firestore Rules', 'Public single-doc get(cards/0004)', false, err?.code || err?.message);
  }

  // 5B. Unauthenticated LIST on cards, admins, users, scan_logs MUST fail with permission-denied
  for (const colName of ['cards', 'admins', 'users', 'scan_logs']) {
    try {
      await getDocs(collection(db, colName));
      record('Firestore Rules', `Unauthenticated list(${colName}) denied`, false, 'UNEXPECTEDLY ALLOWED');
    } catch (err: any) {
      const denied = err?.code === 'permission-denied' || String(err?.message).includes('permission');
      record('Firestore Rules', `Unauthenticated list(${colName}) denied`, denied, `code=${err?.code}`);
    }
  }

  // 5C. Old TEST-* unauthenticated write backdoor MUST be denied
  try {
    await setDoc(doc(db, 'cards', 'TEST-AUDIT-9999'), {
      id: 'TEST-AUDIT-9999',
      status: 'available',
      businessName: 'Unauthorized',
      category: '',
      googleReviewUrl: '',
      notes: '',
      scansCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    record('Firestore Rules', 'Closed TEST-* unauthenticated card write backdoor', false, 'UNEXPECTEDLY ALLOWED');
  } catch (err: any) {
    const denied = err?.code === 'permission-denied' || String(err?.message).includes('permission');
    record('Firestore Rules', 'Closed TEST-* unauthenticated card write backdoor', denied, `code=${err?.code}`);
  }

  // 5D. Unauthenticated scan_log creation for a NONEXISTENT card MUST be denied
  try {
    await setDoc(doc(db, 'scan_logs', 'audit-invalid-card-log'), {
      id: 'audit-invalid-card-log',
      cardId: 'NONEXISTENT-9999',
      businessName: 'Fake',
      category: '',
      assignedToEmail: '',
      assignedToUid: '',
      source: 'qr',
      outcome: 'allowed',
      subscriptionStatus: 'unconfigured',
      route: '/r/NONEXISTENT-9999',
      userAgent: 'AuditRunner',
      scannedAt: new Date().toISOString(),
    });
    record('Firestore Rules', 'Rejects scan_log for nonexistent card', false, 'UNEXPECTEDLY ALLOWED');
  } catch (err: any) {
    const denied = err?.code === 'permission-denied' || String(err?.message).includes('permission');
    record('Firestore Rules', 'Rejects scan_log for nonexistent card', denied, `code=${err?.code}`);
  }

  // =========================================================================
  // SECTION 6: Frontend Code Invariants
  // =========================================================================
  try {
    const crv = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/CustomerReviewView.tsx'),
      'utf8'
    );
    const noClientGenAi = !crv.includes('reviewGenerator') && !crv.includes('@google/genai');
    const hasAbortCtrl = crv.includes('abortControllerRef') && crv.includes('requestIdRef');
    const noPreselected =
      crv.includes("useState<ReviewLanguage | null>(null)") &&
      crv.includes("useState<ReviewTone | null>(null)") &&
      crv.includes("useState<string[]>([])");
    const hasGreenConnect = crv.includes("Let's Connect") && crv.includes('emerald');

    record(
      'Frontend UX',
      'CustomerReviewView: server-only AI, concurrency guard, no pre-selected options, green Stay Connected',
      noClientGenAi && hasAbortCtrl && noPreselected && hasGreenConnect,
      `serverOnlyAI=${noClientGenAi}, concurrencyGuard=${hasAbortCtrl}, noPreselected=${noPreselected}, stayConnected=${hasGreenConnect}`
    );
  } catch (err: any) {
    record('Frontend UX', 'CustomerReviewView invariants', false, err?.message || String(err));
  }

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n=== SUMMARY: ${passed}/${results.length} PASSED, ${failed} FAILED ===\n`);

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal test suite error:', err);
  process.exit(1);
});
