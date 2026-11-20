/**
 * Comprehensive Verification Suite (Tests 1-6) for Strict Admin Card Assignment,
 * Test Card Isolation (#0001-#0010), Sub-Admin Restrictions & Immediate Unassignment.
 *
 * Snapshots and restores data/*.json in finally block so existing production data
 * (cards, admins, users, qr_logs) remains completely untouched.
 *
 * Run with: npx tsx scripts/test-strict-card-isolation.ts
 */
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000';
const MASTER_ID = 'master-admin-01';
const MASTER_EMAIL = '66shashwatkumar66@gmail.com';

const DATA_FILES = [
  path.join(process.cwd(), 'data', 'cards.json'),
  path.join(process.cwd(), 'data', 'admins.json'),
  path.join(process.cwd(), 'data', 'users.json'),
  path.join(process.cwd(), 'data', 'qr_logs.json'),
];

function assert(condition: any, message: string) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function runTests() {
  const snapshots = new Map<string, string>();
  for (const filePath of DATA_FILES) {
    if (fs.existsSync(filePath)) {
      snapshots.set(filePath, fs.readFileSync(filePath, 'utf-8'));
    }
  }

  const initialCards = JSON.parse(snapshots.get(DATA_FILES[0]) || '[]');
  const initialAdmins = JSON.parse(snapshots.get(DATA_FILES[1]) || '[]');
  const initialUsers = JSON.parse(snapshots.get(DATA_FILES[2]) || '[]');
  const initialLogs = JSON.parse(snapshots.get(DATA_FILES[3]) || '[]');

  console.log(
    `Snapshot: ${initialCards.length} cards, ${initialAdmins.length} admins, ${initialUsers.length} users, ${initialLogs.length} logs`
  );

  try {
    // =========================================================================
    // TEST 1: Sub-Admin with 1 Assigned Card & Sub-Admin with 5 Assigned Cards
    // =========================================================================
    console.log('\n=== TEST 1: Strict Explicit Sub-Admin Card Visibility (1 card & 5 cards) ===');

    const sub1Email = 'sub.onecard@example.com';
    const sub1Res = await fetch(`${BASE_URL}/api/admins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': MASTER_ID,
        'x-admin-email': MASTER_EMAIL,
      },
      body: JSON.stringify({
        name: 'One Card SubAdmin',
        email: sub1Email,
        role: 'restricted',
        assignedCardIds: ['0011'],
        permissions: { canEditCards: true, canToggleAi: true, canExportCsv: false, canCreateCards: false },
      }),
    });
    const sub1Data = (await sub1Res.json()) as any;
    assert(sub1Res.status === 200 && sub1Data.admin?.id, 'Failed creating 1-card sub-admin');
    const sub1Id = sub1Data.admin.id;

    // Fetch /api/cards scoped as 1-card Sub-Admin
    const sub1CardsRes = await fetch(`${BASE_URL}/api/cards`, {
      headers: { 'x-admin-id': sub1Id, 'x-admin-email': sub1Email },
    });
    const sub1CardsData = (await sub1CardsRes.json()) as any;
    assert(
      sub1CardsRes.status === 200 &&
        Array.isArray(sub1CardsData.cards) &&
        sub1CardsData.cards.length === 1 &&
        sub1CardsData.cards[0].id === '0011',
      `Expected ONLY ['0011'], got: ${JSON.stringify(sub1CardsData.cards?.map((c: any) => c.id))}`
    );

    // Edit and persist business fields on assigned card #0011
    const sub1EditRes = await fetch(`${BASE_URL}/api/cards/0011/assign`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': sub1Id,
        'x-admin-email': sub1Email,
      },
      body: JSON.stringify({
        businessName: 'Verified SubAdmin Cafe 0011',
        category: 'Cafe & Bakery',
        googleReviewUrl: 'https://search.google.com/local/writereview?placeid=ChIJ0011Test',
        status: 'assigned',
        whatsapp: '+91 98111 22334',
        instagram: '@subadmincafe0011',
      }),
    });
    assert(sub1EditRes.status === 200, `Sub-admin failed to edit assigned #0011: ${sub1EditRes.status}`);

    const sub1GetRes = await fetch(`${BASE_URL}/api/cards/0011?admin=true`, {
      headers: { 'x-admin-id': sub1Id, 'x-admin-email': sub1Email },
    });
    const sub1GetData = (await sub1GetRes.json()) as any;
    assert(
      sub1GetRes.status === 200 &&
        sub1GetData.card?.businessName === 'Verified SubAdmin Cafe 0011' &&
        sub1GetData.card?.whatsapp === '+91 98111 22334',
      `Sub-admin edited card #0011 did not persist: ${JSON.stringify(sub1GetData)}`
    );

    // Sub-Admin with 5 explicitly assigned non-test cards
    const fiveIds = ['0011', '0012', '0013', '0014', '0015'];
    const sub5Email = 'sub.fivecards@example.com';
    const sub5Res = await fetch(`${BASE_URL}/api/admins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': MASTER_ID,
        'x-admin-email': MASTER_EMAIL,
      },
      body: JSON.stringify({
        name: 'Five Cards SubAdmin',
        email: sub5Email,
        role: 'restricted',
        assignedCardIds: fiveIds,
      }),
    });
    const sub5Data = (await sub5Res.json()) as any;
    assert(sub5Res.status === 200 && sub5Data.admin?.id, 'Failed creating 5-card sub-admin');

    const sub5CardsRes = await fetch(`${BASE_URL}/api/cards`, {
      headers: { 'x-admin-id': sub5Data.admin.id, 'x-admin-email': sub5Email },
    });
    const sub5CardsData = (await sub5CardsRes.json()) as any;
    const sub5ReturnedIds = (sub5CardsData.cards || []).map((c: any) => c.id).sort();
    assert(
      sub5ReturnedIds.length === 5 && JSON.stringify(sub5ReturnedIds) === JSON.stringify(fiveIds),
      `Expected exact 5 cards ${JSON.stringify(fiveIds)}, got ${JSON.stringify(sub5ReturnedIds)}`
    );
    console.log('PASSED Test 1: 1-card & 5-card Sub-Admins see ONLY explicitly assigned cards and can edit & persist');

    // =========================================================================
    // TEST 2: Sub-Admin With 0 Assigned Cards Sees [] & Clean Empty State
    // =========================================================================
    console.log('\n=== TEST 2: 0-Card Sub-Admin Sees Zero Cards (Never #0001-#0010) ===');

    const sub0Email = 'sub.zerocards@example.com';
    const sub0Res = await fetch(`${BASE_URL}/api/admins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': MASTER_ID,
        'x-admin-email': MASTER_EMAIL,
      },
      body: JSON.stringify({
        name: 'Zero Cards SubAdmin',
        email: sub0Email,
        role: 'restricted',
        assignedCardIds: [],
      }),
    });
    const sub0Data = (await sub0Res.json()) as any;
    assert(sub0Res.status === 200 && sub0Data.admin?.id, 'Failed creating 0-card sub-admin');
    const sub0Id = sub0Data.admin.id;

    const sub0CardsRes = await fetch(`${BASE_URL}/api/cards`, {
      headers: { 'x-admin-id': sub0Id, 'x-admin-email': sub0Email },
    });
    const sub0CardsData = (await sub0CardsRes.json()) as any;
    assert(
      sub0CardsRes.status === 200 && Array.isArray(sub0CardsData.cards) && sub0CardsData.cards.length === 0,
      `Expected [] for 0-card sub-admin, got: ${JSON.stringify(sub0CardsData.cards?.map((c: any) => c.id))}`
    );

    const sub0StatsRes = await fetch(`${BASE_URL}/api/logs/stats`, {
      headers: { 'x-admin-id': sub0Id, 'x-admin-email': sub0Email },
    });
    const sub0StatsData = (await sub0StatsRes.json()) as any;
    assert(
      sub0StatsRes.status === 200 && sub0StatsData.totalScans === 0 && sub0StatsData.uniqueCards === 0,
      `Expected 0 log stats for 0-card sub-admin, got: ${JSON.stringify(sub0StatsData)}`
    );

    const sub0LogsRes = await fetch(`${BASE_URL}/api/logs`, {
      headers: { 'x-admin-id': sub0Id, 'x-admin-email': sub0Email },
    });
    const sub0LogsData = (await sub0LogsRes.json()) as any;
    assert(
      sub0LogsRes.status === 200 && sub0LogsData.logs.length === 0 && sub0LogsData.totalCount === 0,
      `Expected 0 logs for 0-card sub-admin, got: ${sub0LogsData.totalCount}`
    );

    // Check UI empty-state & zero-default-'0001' protections
    const appSrc = fs.readFileSync(path.join(process.cwd(), 'src', 'App.tsx'), 'utf-8');
    const simSrc = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'MobileSimulatorModal.tsx'), 'utf-8');
    const customizerSrc = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'ReviewCustomizerView.tsx'), 'utf-8');
    const nfcSrc = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'NfcGeneratorView.tsx'), 'utf-8');

    assert(
      !appSrc.includes("|| '0001'") &&
        !appSrc.includes('displayedCards.length > 0 ? displayedCards : cards') &&
        appSrc.includes('No QR Cards Assigned'),
      'App.tsx must not fall back to 0001 or unfiltered cards'
    );
    assert(
      !simSrc.includes("'0001'") && simSrc.includes('No QR Cards Assigned'),
      'MobileSimulatorModal.tsx must not default to 0001 and must render empty state'
    );
    assert(
      !customizerSrc.includes("'0001'") && customizerSrc.includes('No QR Cards Assigned'),
      'ReviewCustomizerView.tsx must not default to 0001 and must render empty state'
    );
    assert(
      nfcSrc.includes('No QR Cards Assigned') && nfcSrc.includes('isMaster'),
      'NfcGeneratorView.tsx must render empty state and hide stock list for non-master'
    );
    console.log('PASSED Test 2: 0-card Sub-Admin receives 0 cards, 0 log stats, and UI empty state guards verified');

    // =========================================================================
    // TEST 3: #0001-#0010 Test Card Isolation & Immediate Unassign/Reassign Propagation
    // =========================================================================
    console.log('\n=== TEST 3: #0001-#0010 Test Card Isolation & Immediate Unassign/Reassign ===');

    const testIdsSet = new Set(['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009', '0010']);
    const existingSub = initialAdmins.find((a: any) => a.role === 'restricted');
    if (existingSub) {
      const existingSubCardsRes = await fetch(`${BASE_URL}/api/cards`, {
        headers: { 'x-admin-id': existingSub.id, 'x-admin-email': existingSub.email },
      });
      const existingSubCardsData = (await existingSubCardsRes.json()) as any;
      const leakedTestCards = (existingSubCardsData.cards || []).filter((c: any) => testIdsSet.has(c.id));
      assert(
        leakedTestCards.length === 0,
        `Existing sub-admin ${existingSub.email} leaked test cards: ${JSON.stringify(leakedTestCards.map((c: any) => c.id))}`
      );
    }

    // MasterAdminView Select All excludes #0001-#0010
    const masterViewSrc = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'MasterAdminView.tsx'), 'utf-8');
    assert(
      masterViewSrc.includes('isMasterTestCardId') && masterViewSrc.includes('!isMasterTestCardId(c.id)'),
      'MasterAdminView.tsx must exclude #0001-#0010 from Select All'
    );

    // Master assigns #0011 ownership to sub1Email via PUT /api/cards/0011/assign
    const masterAssign11Res = await fetch(`${BASE_URL}/api/cards/0011/assign`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': MASTER_ID,
        'x-admin-email': MASTER_EMAIL,
      },
      body: JSON.stringify({
        assignedToEmail: sub1Email,
        assignedToName: 'One Card SubAdmin',
        status: 'assigned',
      }),
    });
    assert(masterAssign11Res.status === 200, 'Master failed setting assignedToEmail on 0011');

    // Immediate Unassignment via PUT /api/admins/:id (clear sub1 assignedCardIds to [])
    const unassignViaAdminRes = await fetch(`${BASE_URL}/api/admins/${sub1Id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': MASTER_ID,
        'x-admin-email': MASTER_EMAIL,
      },
      body: JSON.stringify({
        assignedCardIds: [],
      }),
    });
    assert(unassignViaAdminRes.status === 200, 'Master failed clearing assignedCardIds on sub1');

    // sub1 must immediately lose access to #0011 (even via stale assignedToEmail on card)
    const sub1AfterUnassignRes = await fetch(`${BASE_URL}/api/cards`, {
      headers: { 'x-admin-id': sub1Id, 'x-admin-email': sub1Email },
    });
    const sub1AfterUnassignData = (await sub1AfterUnassignRes.json()) as any;
    assert(
      sub1AfterUnassignData.cards.length === 0,
      `Expected sub1 cards=[] immediately after unassignment, got ${JSON.stringify(sub1AfterUnassignData.cards.map((c: any) => c.id))}`
    );

    const sub1Get11AfterRes = await fetch(`${BASE_URL}/api/cards/0011?admin=true`, {
      headers: { 'x-admin-id': sub1Id, 'x-admin-email': sub1Email },
    });
    assert(sub1Get11AfterRes.status === 403, `Expected 403 for unassigned sub1 GET /api/cards/0011?admin=true, got ${sub1Get11AfterRes.status}`);

    // Reassign card #0012 from sub5 to sub1 via PUT /api/cards/0012/assign
    const reassignRes = await fetch(`${BASE_URL}/api/cards/0012/assign`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': MASTER_ID,
        'x-admin-email': MASTER_EMAIL,
      },
      body: JSON.stringify({
        assignedToEmail: sub1Email,
        assignedToName: 'One Card SubAdmin',
        status: 'assigned',
      }),
    });
    assert(reassignRes.status === 200, 'Master failed reassigning #0012 to sub1');

    // Verify sub1 now sees #0012 (and only #0012), while old owner sub5 had #0012 removed from assignedCardIds
    const sub1AfterReassignRes = await fetch(`${BASE_URL}/api/cards`, {
      headers: { 'x-admin-id': sub1Id, 'x-admin-email': sub1Email },
    });
    const sub1AfterReassignData = (await sub1AfterReassignRes.json()) as any;
    assert(
      sub1AfterReassignData.cards.length === 1 && sub1AfterReassignData.cards[0].id === '0012',
      `Expected sub1 to have ONLY ['0012'] after reassignment, got ${JSON.stringify(sub1AfterReassignData.cards.map((c: any) => c.id))}`
    );

    const sub5AfterReassignRes = await fetch(`${BASE_URL}/api/cards`, {
      headers: { 'x-admin-id': sub5Data.admin.id, 'x-admin-email': sub5Email },
    });
    const sub5AfterReassignData = (await sub5AfterReassignRes.json()) as any;
    const sub5IdsAfter = sub5AfterReassignData.cards.map((c: any) => c.id);
    assert(
      !sub5IdsAfter.includes('0012') && !sub5IdsAfter.includes('0011') && sub5IdsAfter.length === 3,
      `Expected sub5 to lose #0011 and #0012 immediately after reassignment, got ${JSON.stringify(sub5IdsAfter)}`
    );
    console.log('PASSED Test 3: #0001-#0010 isolated and unassign/reassign immediately updates access & clears stale ownership');

    // =========================================================================
    // TEST 4: Direct Unassigned Access & Stock Revert Blocked (403)
    // =========================================================================
    console.log('\n=== TEST 4: Direct Unassigned Card Access & Stock Revert Blocking ===');

    const directGetTest0001Res = await fetch(`${BASE_URL}/api/cards/0001?admin=true`, {
      headers: { 'x-admin-id': sub1Id, 'x-admin-email': sub1Email },
    });
    assert(directGetTest0001Res.status === 403, `Expected 403 on GET /api/cards/0001?admin=true for sub1, got ${directGetTest0001Res.status}`);

    const directEditTest0001Res = await fetch(`${BASE_URL}/api/cards/0001/assign`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': sub1Id,
        'x-admin-email': sub1Email,
      },
      body: JSON.stringify({ businessName: 'Hijack Test Card 0001' }),
    });
    assert(directEditTest0001Res.status === 403, `Expected 403 on PUT /api/cards/0001/assign for sub1, got ${directEditTest0001Res.status}`);

    const revertAvailableRes = await fetch(`${BASE_URL}/api/cards/0012/assign`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': sub1Id,
        'x-admin-email': sub1Email,
      },
      body: JSON.stringify({ status: 'available' }),
    });
    assert(revertAvailableRes.status === 403, `Expected 403 when sub-admin reverts assigned card to available, got ${revertAvailableRes.status}`);

    const bulkAvailableRes = await fetch(`${BASE_URL}/api/cards/bulk-status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': sub1Id,
        'x-admin-email': sub1Email,
      },
      body: JSON.stringify({ ids: ['0012'], status: 'available' }),
    });
    assert(bulkAvailableRes.status === 403, `Expected 403 when sub-admin bulk-sets assigned card to available, got ${bulkAvailableRes.status}`);

    const unauthCardsRes = await fetch(`${BASE_URL}/api/cards`);
    assert(unauthCardsRes.status === 403, `Expected 403 for unauthenticated GET /api/cards, got ${unauthCardsRes.status}`);

    // Public customer lookup for /r/0001 must still work!
    const publicCardRes = await fetch(`${BASE_URL}/api/cards/0001`);
    assert(publicCardRes.status === 200, `Expected 200 for public customer GET /api/cards/0001, got ${publicCardRes.status}`);
    console.log('PASSED Test 4: Direct unassigned access, stock revert, and unauthenticated listing blocked (403) while public QR scan works (200)');

    // =========================================================================
    // TEST 5: Sub-Admin Card Generation & Deletion Blocked (API 403 + UI Guards)
    // =========================================================================
    console.log('\n=== TEST 5: Sub-Admin QR Creation & Deletion Removed ===');

    const subBatchRes = await fetch(`${BASE_URL}/api/cards/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': sub1Id,
        'x-admin-email': sub1Email,
      },
      body: JSON.stringify({ count: 2, startNumber: 9001, paddingDigits: 4 }),
    });
    assert(subBatchRes.status === 403, `Expected 403 for Sub-Admin batch create, got ${subBatchRes.status}`);

    const subUpsertRes = await fetch(`${BASE_URL}/api/cards/9999/assign`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': sub1Id,
        'x-admin-email': sub1Email,
      },
      body: JSON.stringify({ businessName: 'Unauthorized Create', status: 'assigned' }),
    });
    assert(subUpsertRes.status === 403, `Expected 403 for Sub-Admin creating card #9999, got ${subUpsertRes.status}`);

    const subDeleteRes = await fetch(`${BASE_URL}/api/cards/0012`, {
      method: 'DELETE',
      headers: { 'x-admin-id': sub1Id, 'x-admin-email': sub1Email },
    });
    assert(subDeleteRes.status === 403, `Expected 403 for Sub-Admin deleting card, got ${subDeleteRes.status}`);

    const cardsTableSrc = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'CardsTable.tsx'), 'utf-8');
    const assignModalSrc = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'AssignCardModal.tsx'), 'utf-8');
    const headerSrc = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'AdminHeader.tsx'), 'utf-8');
    const sidebarSrc = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'SlidingSidebar.tsx'), 'utf-8');

    assert(
      !headerSrc.includes('permissions?.canCreateCards') &&
        !sidebarSrc.includes('permissions?.canCreateCards') &&
        !nfcSrc.includes('permissions?.canCreateCards') &&
        nfcSrc.includes('const canCreateCards = effectiveIsMaster') &&
        cardsTableSrc.includes('isMaster &&') &&
        assignModalSrc.includes('isMaster &&') &&
        assignModalSrc.includes("'Save Changes'"),
      'UI components must strictly gate card creation/deletion/available-revert to isMaster'
    );
    console.log('PASSED Test 5: Sub-Admin card creation/deletion blocked on API (403) and removed in UI');

    // =========================================================================
    // TEST 6: Master Admin Full Workflow & Existing Data Integrity
    // =========================================================================
    console.log('\n=== TEST 6: Master Admin Full Workflow & Regression Integrity ===');

    const masterCardsRes = await fetch(`${BASE_URL}/api/cards`, {
      headers: { 'x-admin-id': MASTER_ID, 'x-admin-email': MASTER_EMAIL },
    });
    const masterCardsData = (await masterCardsRes.json()) as any;
    assert(
      masterCardsRes.status === 200 &&
        masterCardsData.cards.length >= initialCards.length &&
        masterCardsData.cards.some((c: any) => c.id === '0001') &&
        masterCardsData.cards.some((c: any) => c.id === '0010'),
      'Master Admin must see full inventory including test cards #0001-#0010'
    );

    const masterBatchRes = await fetch(`${BASE_URL}/api/cards/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': MASTER_ID,
        'x-admin-email': MASTER_EMAIL,
      },
      body: JSON.stringify({ count: 1, startNumber: 7777, paddingDigits: 4 }),
    });
    assert(masterBatchRes.status === 200, `Master batch create failed: ${masterBatchRes.status}`);

    const masterDelRes = await fetch(`${BASE_URL}/api/cards/7777`, {
      method: 'DELETE',
      headers: { 'x-admin-id': MASTER_ID, 'x-admin-email': MASTER_EMAIL },
    });
    assert(masterDelRes.status === 200, `Master card delete failed: ${masterDelRes.status}`);

    const masterLogsRes = await fetch(`${BASE_URL}/api/logs?limit=all`, {
      headers: { 'x-admin-id': MASTER_ID, 'x-admin-email': MASTER_EMAIL },
    });
    const masterLogsData = (await masterLogsRes.json()) as any;
    assert(
      masterLogsRes.status === 200 && masterLogsData.totalCount === initialLogs.length,
      `Expected ${initialLogs.length} historical logs preserved, got ${masterLogsData.totalCount}`
    );
    console.log('PASSED Test 6: Master Admin full inventory, batch create/delete, and historical logs intact');

    console.log('\nALL TESTS 1-6 PASSED SUCCESSFULLY!');
  } finally {
    for (const [filePath, originalContent] of snapshots.entries()) {
      fs.writeFileSync(filePath, originalContent, 'utf-8');
    }
    console.log('Restored data/*.json snapshots cleanly.');
  }
}

runTests().catch((err) => {
  console.error('STRICT ISOLATION TEST SUITE FAILED:', err);
  process.exit(1);
});
