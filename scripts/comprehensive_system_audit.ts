import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000';

interface TestResult {
  suite: string;
  testName: string;
  passed: boolean;
  details: string;
  latencyMs: number;
}

const results: TestResult[] = [];

async function runTest(suite: string, testName: string, fn: () => Promise<string | void>) {
  const start = Date.now();
  try {
    const detail = await fn();
    results.push({
      suite,
      testName,
      passed: true,
      details: detail || 'Passed successfully',
      latencyMs: Date.now() - start,
    });
    console.log(`✅ [${suite}] ${testName} (${Date.now() - start}ms): ${detail || 'OK'}`);
  } catch (err: any) {
    results.push({
      suite,
      testName,
      passed: false,
      details: err?.message || String(err),
      latencyMs: Date.now() - start,
    });
    console.error(`❌ [${suite}] ${testName} (${Date.now() - start}ms): ${err?.message}`);
  }
}

async function runAudit() {
  console.log('=== STARTING 3DBYSD SMART REVIEWS COMPREHENSIVE SYSTEM AUDIT ===\n');

  // --- SUITE 1: Historical Logs & QR Telemetry API ---
  await runTest('QR Logs Audit', 'Verify /api/logs returns recovered historical logs', async () => {
    const res = await fetch(`${BASE_URL}/api/logs?limit=50`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    if (!data.success) throw new Error('API returned success: false');
    if (!Array.isArray(data.logs)) throw new Error('logs is not an array');
    if (data.totalCount < 160) throw new Error(`Expected at least 160 historical logs, found ${data.totalCount}`);
    return `Retrieved ${data.logs.length} logs from page 1, totalCount=${data.totalCount}`;
  });

  await runTest('QR Logs Audit', 'Verify /api/logs/stats returns aggregate telemetry', async () => {
    const res = await fetch(`${BASE_URL}/api/logs/stats`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    if (!data.success) throw new Error('API returned success: false');
    const { totalScans, uniqueCards, sourceBreakdown } = data.stats;
    if (totalScans < 160) throw new Error(`totalScans ${totalScans} is below expected`);
    if (uniqueCards < 4) throw new Error(`uniqueCards ${uniqueCards} is below expected`);
    return `totalScans=${totalScans}, uniqueCards=${uniqueCards}, sources: QR=${sourceBreakdown.qr}, NFC=${sourceBreakdown.nfc}`;
  });

  await runTest('QR Logs Audit', 'Verify stand-specific log filter and search', async () => {
    const res = await fetch(`${BASE_URL}/api/logs?cardId=0001&limit=10`);
    const data = await res.json();
    if (!data.success) throw new Error('Failed to query logs for card 0001');
    const allMatch = data.logs.every((l: any) => l.cardId === '0001');
    if (!allMatch) throw new Error('Logs contain items not belonging to card 0001');
    return `Filtered ${data.logs.length} logs strictly for Stand #0001 (total: ${data.totalCount})`;
  });

  // --- SUITE 2: Customer Scan Journey (Journey A) ---
  await runTest('Journey A: Customer Scan', 'Customer opens /r/0001 stand link and scan is logged', async () => {
    const preStats = await (await fetch(`${BASE_URL}/api/logs/stats`)).json();
    const initialScans = preStats.stats.totalScans;

    const res = await fetch(`${BASE_URL}/api/cards/0001?scan=true&source=qr`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      },
    });
    if (!res.ok) throw new Error(`Failed to load card 0001: HTTP ${res.status}`);
    const card = await res.json();
    if (!card || card.id !== '0001') throw new Error('Card 0001 data mismatch');

    // Verify scan log was appended
    const postStats = await (await fetch(`${BASE_URL}/api/logs/stats`)).json();
    if (postStats.stats.totalScans < initialScans + 1) {
      throw new Error(`Scan was not recorded in stats: initial=${initialScans}, post=${postStats.stats.totalScans}`);
    }
    return `Stand #${card.id} "${card.businessName}" scanned. scansCount=${card.scansCount}, new totalScans=${postStats.stats.totalScans}`;
  });

  await runTest('Journey A: AI Review', 'Verify AI review generation with business category & keywords', async () => {
    const payload = {
      cardId: '0001',
      businessName: 'Dr. Smiles Dental Clinic',
      category: 'Healthcare & Dental',
      language: 'English',
      tone: 'Professional & Polished',
      keywords: ['Painless treatment', 'Clean clinic', 'Friendly doctor'],
      rating: 5,
    };
    const res = await fetch(`${BASE_URL}/api/generate-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Review generation failed: HTTP ${res.status}`);
    const data = await res.json();
    if (!data.review || data.review.length < 20) throw new Error('Generated review is empty or too short');
    const hasClinicOrDoctor =
      data.review.toLowerCase().includes('clinic') ||
      data.review.toLowerCase().includes('dental') ||
      data.review.toLowerCase().includes('doctor') ||
      data.review.toLowerCase().includes('dr. smiles') ||
      data.review.toLowerCase().includes('clean') ||
      data.review.toLowerCase().includes('treatment');
    if (!hasClinicOrDoctor) {
      console.warn('Review text:', data.review);
      throw new Error('Review does not reflect dental business context or keywords');
    }
    return `Generated context-aware review (${data.review.length} chars): "${data.review.substring(0, 80)}..."`;
  });

  // --- SUITE 3: QR Assignment & Subscription Management (Journey B) ---
  await runTest('Journey B: Subscriptions', 'Assign Stand with Subscription Start and End Dates', async () => {
    const today = new Date().toISOString().split('T')[0];
    const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const assignPayload = {
      businessName: 'Audit Test Cafe',
      category: 'Cafe & Bakery',
      googleReviewUrl: 'https://g.page/r/audit-test-cafe/review',
      status: 'assigned',
      subscriptionStartDate: today,
      subscriptionEndDate: nextYear,
      subscriptionStatus: 'active',
      notes: 'Automated audit test assignment',
    };

    const res = await fetch(`${BASE_URL}/api/cards/0004`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': 'master-admin-01',
      },
      body: JSON.stringify(assignPayload),
    });
    if (!res.ok) throw new Error(`Card assignment failed: HTTP ${res.status}`);
    const updated = await res.json();
    if (updated.subscriptionStartDate !== today || updated.subscriptionEndDate !== nextYear) {
      throw new Error('Subscription dates were not persisted properly');
    }
    return `Stand #0004 assigned with subscription ${today} -> ${nextYear} (${updated.subscriptionStatus})`;
  });

  // --- SUITE 4: Role-Based Access Control & Sub-Admin Permissions (Journey C) ---
  await runTest('Journey C: RBAC & Permissions', 'Sub-admin can edit and save assigned card', async () => {
    // admin-1793443869010 is assigned to card ['0001']
    const updatePayload = {
      notes: `Updated by sub-admin at ${new Date().toLocaleTimeString()}`,
    };
    const res = await fetch(`${BASE_URL}/api/cards/0001`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': 'admin-1793443869010',
      },
      body: JSON.stringify(updatePayload),
    });
    if (!res.ok) throw new Error(`Sub-admin update on assigned card failed: HTTP ${res.status}`);
    const data = await res.json();
    return `Sub-admin successfully modified assigned Stand #0001: "${data.notes}"`;
  });

  await runTest('Journey C: RBAC & Permissions', 'Sub-admin is forbidden from editing unassigned card', async () => {
    // Stand 0003 is NOT in admin-1793443869010 assignedCardIds
    const updatePayload = {
      notes: 'Unauthorized attempt to modify card 0003',
    };
    const res = await fetch(`${BASE_URL}/api/cards/0003`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': 'admin-1793443869010',
      },
      body: JSON.stringify(updatePayload),
    });
    if (res.status !== 403) {
      throw new Error(`Expected HTTP 403 Forbidden, but received HTTP ${res.status}`);
    }
    return 'Correctly rejected unauthorized card edit with HTTP 403 Forbidden';
  });

  await runTest('Journey C: RBAC & Permissions', 'Sub-admin only sees assigned logs via RBAC', async () => {
    const res = await fetch(`${BASE_URL}/api/logs?limit=50`, {
      headers: {
        'x-admin-id': 'admin-1793443869010',
      },
    });
    if (!res.ok) throw new Error(`Failed to query logs: HTTP ${res.status}`);
    const data = await res.json();
    const authorizedIds = ['0001'];
    const invalidLog = data.logs.find((l: any) => !authorizedIds.includes(l.cardId));
    if (invalidLog) {
      throw new Error(`Sub-admin received log for unauthorized card ${invalidLog.cardId}`);
    }
    return `Sub-admin received ${data.logs.length} logs, strictly constrained to assigned cards [0001]`;
  });

  // --- SUITE 5: Advertisements & Sponsor System ---
  await runTest('Advertisements Audit', 'Fetch active advertisements and test click/impression tracking', async () => {
    const res = await fetch(`${BASE_URL}/api/ads`);
    if (!res.ok) throw new Error(`Failed to fetch ads: HTTP ${res.status}`);
    const data = await res.json();
    const ads = data.ads || [];
    if (!Array.isArray(ads) || ads.length === 0) throw new Error('No advertisements returned in ads array');

    const ad = ads[0];
    const impRes = await fetch(`${BASE_URL}/api/ads/${ad.id}/impression`, { method: 'POST' });
    if (!impRes.ok) throw new Error('Failed to record ad impression');

    const clickRes = await fetch(`${BASE_URL}/api/ads/${ad.id}/click`, { method: 'POST' });
    if (!clickRes.ok) throw new Error('Failed to record ad click');

    return `Verified ad "${ad.name}" with working impression and click telemetry`;
  });

  // --- SUITE 6: Logo Upload & Storage ---
  await runTest('Logo Upload Audit', 'Upload test business logo with base64 data URL', async () => {
    // 1x1 transparent PNG data URL
    const testPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const res = await fetch(`${BASE_URL}/api/upload-logo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dataUrl: testPng,
        fileName: 'audit_logo_test.png',
        cardId: '0004',
      }),
    });
    if (!res.ok) throw new Error(`Logo upload failed: HTTP ${res.status}`);
    const data = await res.json();
    if (!data.success || !data.logoUrl) throw new Error('Logo upload did not return success and logoUrl');
    return `Logo uploaded successfully: ${data.logoUrl}`;
  });

  // --- Summary ---
  console.log('\n=== AUDIT RESULTS SUMMARY ===');
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`Total Tests: ${results.length} | Passed: ${passed} | Failed: ${failed}`);

  if (failed > 0) {
    console.error('Some tests failed. Please review details above.');
    process.exit(1);
  } else {
    console.log('ALL AUDIT SUITES PASSED PERFECTLY WITH REAL PRODUCTION ENDPOINTS! 🚀');
  }
}

runAudit();
