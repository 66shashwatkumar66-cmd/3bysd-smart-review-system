/**
 * Comprehensive verification test suite for:
 *  - Issue 1: Master Admin deleting registered admins + immediate revocation + data preservation
 *  - Issue 2: Sub-admin assigned card editing + strict RBAC enforcement + negative boundaries
 *
 * Automatically snapshots and restores data/*.json in a finally block so production data stays untouched.
 * Run with: npx tsx scripts/test-admin-delete-and-subadmin-edit.ts
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
  // Snapshot existing JSON files before running live tests
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
    `📸 Snapshot taken: ${initialCards.length} cards, ${initialAdmins.length} admins, ${initialUsers.length} users, ${initialLogs.length} qr_logs`
  );

  try {
    // =========================================================================
    // ISSUE 1: MASTER ADMIN ADMIN MANAGEMENT & DELETION TESTS
    // =========================================================================
    console.log('\n=== ISSUE 1 TESTS: Admin Registration, Deletion & Revocation ===');

    // 1.1 Non-master cannot create admin
    const unauthCreateRes = await fetch(`${BASE_URL}/api/admins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': 'admin-1793443869010',
        'x-admin-email': 'merchant.sports@gmail.com',
      },
      body: JSON.stringify({
        email: 'rogue@example.com',
        name: 'Rogue Admin',
        role: 'restricted',
      }),
    });
    assert(unauthCreateRes.status === 403, `Expected 403 for non-master POST /api/admins, got ${unauthCreateRes.status}`);
    console.log('✅ 1.1 Non-master blocked from registering admins (403)');

    // 1.2 Primary master cannot be deleted
    const deletePrimaryRes = await fetch(`${BASE_URL}/api/admins/${MASTER_ID}`, {
      method: 'DELETE',
      headers: {
        'x-admin-id': MASTER_ID,
        'x-admin-email': MASTER_EMAIL,
      },
    });
    assert(
      deletePrimaryRes.status === 400 || deletePrimaryRes.status === 403,
      `Expected 400/403 deleting primary master, got ${deletePrimaryRes.status}`
    );
    console.log('✅ 1.2 Primary Master Admin protected from deletion');

    // 1.3 Master Admin registers a temporary sub-admin assigned to Card #0003
    const tempEmail = 'temp.subadmin.test@example.com';
    const createSubRes = await fetch(`${BASE_URL}/api/admins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': MASTER_ID,
        'x-admin-email': MASTER_EMAIL,
      },
      body: JSON.stringify({
        email: tempEmail,
        name: 'Temp Sub Admin',
        role: 'restricted',
        assignedCardIds: ['0003'],
        permissions: {
          canEditCards: true,
          canToggleAi: true,
          canExportCsv: false,
          canCreateCards: false,
        },
      }),
    });
    const createSubData = (await createSubRes.json()) as any;
    assert(createSubRes.status === 200 && createSubData.success && createSubData.admin?.id, 'Failed to create temp sub-admin');
    const tempAdminId = createSubData.admin.id;
    console.log(`✅ 1.3 Master Admin created temp sub-admin (${tempAdminId})`);

    // 1.4 Sub-admin session status is authorized, and login via POST /api/users preserves role 'restricted'
    const sessionBeforeRes = await fetch(
      `${BASE_URL}/api/auth/session-status?email=${encodeURIComponent(tempEmail)}`
    );
    const sessionBefore = (await sessionBeforeRes.json()) as any;
    assert(
      sessionBefore.authorized === true && sessionBefore.revoked === false && sessionBefore.role === 'restricted',
      `Unexpected session status before deletion: ${JSON.stringify(sessionBefore)}`
    );

    const loginRes = await fetch(`${BASE_URL}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: 'temp-uid-subadmin-123',
        email: tempEmail,
        displayName: 'Temp Sub Admin',
        role: 'member', // Simulate client sending 'member' — server must preserve 'restricted'!
      }),
    });
    const loginData = (await loginRes.json()) as any;
    assert(
      loginRes.status === 200 && loginData.user?.role === 'restricted',
      `Expected server to preserve 'restricted' role on login, got: ${JSON.stringify(loginData)}`
    );
    console.log('✅ 1.4 Sub-admin session authorized and login preserves restricted role');

    // 1.5 Non-master cannot delete an admin
    const subDeleteRes = await fetch(`${BASE_URL}/api/admins/${tempAdminId}`, {
      method: 'DELETE',
      headers: {
        'x-admin-id': 'admin-1793443869010',
        'x-admin-email': 'merchant.sports@gmail.com',
      },
    });
    assert(subDeleteRes.status === 403, `Expected 403 for non-master DELETE /api/admins, got ${subDeleteRes.status}`);
    console.log('✅ 1.5 Non-master blocked from deleting admins (403)');

    // 1.6 Temp sub-admin edits Card #0003 before deletion
    const preDeleteEditRes = await fetch(`${BASE_URL}/api/cards/0003/assign`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': tempAdminId,
        'x-admin-email': tempEmail,
      },
      body: JSON.stringify({
        businessName: 'Temp Test Business 0003',
        googleReviewUrl: 'https://search.google.com/local/writereview?placeid=Test0003',
        status: 'assigned',
      }),
    });
    assert(preDeleteEditRes.status === 200, `Temp sub-admin failed to edit card 0003: ${preDeleteEditRes.status}`);

    // 1.7 Master Admin deletes temp sub-admin
    const masterDeleteRes = await fetch(`${BASE_URL}/api/admins/${tempAdminId}`, {
      method: 'DELETE',
      headers: {
        'x-admin-id': MASTER_ID,
        'x-admin-email': MASTER_EMAIL,
      },
    });
    const masterDeleteData = (await masterDeleteRes.json()) as any;
    assert(masterDeleteRes.status === 200 && masterDeleteData.success, `Master delete failed: ${JSON.stringify(masterDeleteData)}`);
    console.log('✅ 1.6 Master Admin deleted temp sub-admin (200)');

    // 1.8 Verify admin is removed from /api/admins, session-status is revoked, card edit & login are rejected
    const adminsAfterRes = await fetch(`${BASE_URL}/api/admins`);
    const adminsAfter = (await adminsAfterRes.json()) as any;
    assert(
      !adminsAfter.admins.some((a: any) => a.email?.toLowerCase() === tempEmail || a.id === tempAdminId),
      'Deleted admin still present in GET /api/admins'
    );

    const sessionAfterRes = await fetch(
      `${BASE_URL}/api/auth/session-status?email=${encodeURIComponent(tempEmail)}`
    );
    const sessionAfter = (await sessionAfterRes.json()) as any;
    assert(
      sessionAfter.authorized === false && sessionAfter.revoked === true,
      `Expected revoked session after deletion, got: ${JSON.stringify(sessionAfter)}`
    );

    const revokedCardEditRes = await fetch(`${BASE_URL}/api/cards/0003/assign`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': tempAdminId,
        'x-admin-email': tempEmail,
      },
      body: JSON.stringify({ businessName: 'Should Fail' }),
    });
    assert(revokedCardEditRes.status === 403, `Deleted admin was still able to edit card! Status: ${revokedCardEditRes.status}`);

    const revokedLoginRes = await fetch(`${BASE_URL}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: 'temp-uid-subadmin-123',
        email: tempEmail,
        displayName: 'Temp Sub Admin',
      }),
    });
    assert(revokedLoginRes.status === 403, `Revoked admin login should return 403, got ${revokedLoginRes.status}`);
    console.log('✅ 1.7 Deleted admin immediately revoked from session, login, and protected endpoints (403)');

    // 1.9 Data preservation: Card 0003, all other cards, and QR logs still intact
    const card0003Res = await fetch(`${BASE_URL}/api/cards/0003`);
    const card0003Data = (await card0003Res.json()) as any;
    assert(
      card0003Res.status === 200 && card0003Data.card?.businessName === 'Temp Test Business 0003',
      'Card 0003 business config was lost or corrupted after admin deletion!'
    );

    const logsRes = await fetch(`${BASE_URL}/api/logs?limit=all`);
    const logsData = (await logsRes.json()) as any;
    assert(
      logsData.totalCount === initialLogs.length && Array.isArray(logsData.logs) && logsData.logs.length === initialLogs.length,
      `QR logs count changed! Expected ${initialLogs.length}, got totalCount=${logsData.totalCount}, len=${logsData.logs?.length}`
    );
    console.log('✅ 1.8 Assigned card #0003, business config, and all 171 QR logs completely preserved');

    // =========================================================================
    // ISSUE 2: SUB-ADMIN ASSIGNED CARD EDIT PERMISSIONS & BOUNDARIES
    // =========================================================================
    console.log('\n=== ISSUE 2 TESTS: Sub-Admin Card Editing & RBAC Boundaries ===');

    const subAdminId = 'admin-1793443869010';
    const subAdminEmail = 'merchant.sports@gmail.com';

    // 2.1 Existing sub-admin edits assigned Card #0001 across all permitted fields
    const subEditRes = await fetch(`${BASE_URL}/api/cards/0001/assign`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': subAdminId,
        'x-admin-email': subAdminEmail,
      },
      body: JSON.stringify({
        businessName: 'Mercury Sports Flagship Test',
        category: 'Sporting Goods',
        googleReviewUrl: 'https://search.google.com/local/writereview?placeid=ChIJMercuryTest',
        notes: 'Front Counter Stand',
        status: 'assigned',
        aiReviewEnabled: false,
        customKeywords: ['Great Gear', 'Helpful Staff'],
        reviewTone: 'enthusiastic',
        promptStarter: 'Highlight athletic equipment selection',
        customHeadline: 'Share your sports visit!',
        whatsapp: '+91 98765 43210',
        instagram: '@mercurysports',
        subscriptionStartDate: '2026-01-01',
        subscriptionEndDate: '2027-01-01',
        subscriptionStatus: 'active',
      }),
    });
    const subEditData = (await subEditRes.json()) as any;
    assert(
      subEditRes.status === 200 &&
        subEditData.success &&
        subEditData.card?.businessName === 'Mercury Sports Flagship Test' &&
        subEditData.card?.aiReviewEnabled === false &&
        subEditData.card?.whatsapp === '+91 98765 43210' &&
        subEditData.card?.subscriptionEndDate === '2027-01-01',
      `Sub-admin edit of assigned card #0001 failed: ${JSON.stringify(subEditData)}`
    );

    // Confirm persistence via GET /api/cards/0001
    const verifyCardRes = await fetch(`${BASE_URL}/api/cards/0001`);
    const verifyCardData = (await verifyCardRes.json()) as any;
    assert(
      verifyCardData.card?.businessName === 'Mercury Sports Flagship Test' &&
        verifyCardData.card?.customKeywords?.length === 2,
      'Edited card fields did not persist to storage'
    );
    console.log('✅ 2.1 Sub-admin successfully edited & persisted all permitted fields on assigned Card #0001');

    // 2.2 Sub-admin recognized by email alone even if client sends mismatched/legacy ID
    const emailLookupEditRes = await fetch(`${BASE_URL}/api/cards/0001/assign`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': 'firebase-uid-mismatch-fallback',
        'x-admin-email': subAdminEmail,
      },
      body: JSON.stringify({
        businessName: 'Mercury Sports Email Lookup OK',
      }),
    });
    assert(
      emailLookupEditRes.status === 200,
      `Expected 200 via email lookup fallback, got ${emailLookupEditRes.status}`
    );
    console.log('✅ 2.2 Sub-admin recognized via email header fallback when UID differs from admin doc ID');

    // 2.3 Sub-admin bulk-status allowed for assigned card #0001, blocked for unassigned #0002
    const bulkAllowedRes = await fetch(`${BASE_URL}/api/cards/bulk-status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': subAdminId,
        'x-admin-email': subAdminEmail,
      },
      body: JSON.stringify({ ids: ['0001'], status: 'assigned' }),
    });
    assert(bulkAllowedRes.status === 200, `Expected 200 for sub-admin bulk-status on own card, got ${bulkAllowedRes.status}`);

    const bulkDeniedRes = await fetch(`${BASE_URL}/api/cards/bulk-status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': subAdminId,
        'x-admin-email': subAdminEmail,
      },
      body: JSON.stringify({ ids: ['0001', '0002'], status: 'assigned' }),
    });
    assert(bulkDeniedRes.status === 403, `Expected 403 for sub-admin bulk-status including unassigned card #0002, got ${bulkDeniedRes.status}`);
    console.log('✅ 2.3 Sub-admin bulk-status allowed for own card (200) & denied when including unassigned card (403)');

    // 2.4 Sub-admin blocked from editing unassigned card (#0002)
    const editUnassignedRes = await fetch(`${BASE_URL}/api/cards/0002/assign`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': subAdminId,
        'x-admin-email': subAdminEmail,
      },
      body: JSON.stringify({ businessName: 'Unauthorized Edit' }),
    });
    assert(editUnassignedRes.status === 403, `Expected 403 editing unassigned card #0002, got ${editUnassignedRes.status}`);
    console.log('✅ 2.4 Sub-admin blocked from editing unassigned Card #0002 (403)');

    // 2.5 Sub-admin blocked from changing ownership fields
    const tamperOwnerRes = await fetch(`${BASE_URL}/api/cards/0001/assign`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': subAdminId,
        'x-admin-email': subAdminEmail,
      },
      body: JSON.stringify({
        businessName: 'Mercury Sports',
        assignedToEmail: 'attacker@evil.com',
      }),
    });
    assert(tamperOwnerRes.status === 403, `Expected 403 changing assignedToEmail, got ${tamperOwnerRes.status}`);
    console.log('✅ 2.5 Sub-admin blocked from altering card ownership fields (403)');

    // 2.6 Sub-admin blocked from master-only card batch creation and card deletion
    const batchCreateRes = await fetch(`${BASE_URL}/api/cards/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': subAdminId,
        'x-admin-email': subAdminEmail,
      },
      body: JSON.stringify({ count: 1, startNumber: 999, paddingDigits: 4 }),
    });
    assert(batchCreateRes.status === 403, `Expected 403 for sub-admin batch card creation, got ${batchCreateRes.status}`);

    const deleteCardRes = await fetch(`${BASE_URL}/api/cards/0001`, {
      method: 'DELETE',
      headers: {
        'x-admin-id': subAdminId,
        'x-admin-email': subAdminEmail,
      },
    });
    assert(deleteCardRes.status === 403, `Expected 403 for sub-admin card deletion, got ${deleteCardRes.status}`);
    console.log('✅ 2.6 Sub-admin blocked from creating/deleting cards (403)');

    // 2.6 Sub-admin with canToggleAi: false cannot toggle AI, but CAN edit business fields
    const lockAiAdminRes = await fetch(`${BASE_URL}/api/admins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': MASTER_ID,
        'x-admin-email': MASTER_EMAIL,
      },
      body: JSON.stringify({
        email: 'locked.ai.sub@example.com',
        name: 'Locked AI Sub',
        role: 'restricted',
        assignedCardIds: ['0001'],
        permissions: {
          canEditCards: true,
          canToggleAi: false,
          canExportCsv: false,
          canCreateCards: false,
        },
      }),
    });
    assert(lockAiAdminRes.status === 200, 'Failed creating locked.ai.sub admin');

    const tryToggleAiRes = await fetch(`${BASE_URL}/api/cards/0001/assign`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-email': 'locked.ai.sub@example.com',
      },
      body: JSON.stringify({
        businessName: 'Mercury Sports',
        aiReviewEnabled: true, // Trying to flip from current false -> true
      }),
    });
    assert(tryToggleAiRes.status === 403, `Expected 403 when canToggleAi=false flips AI, got ${tryToggleAiRes.status}`);

    const editWithoutAiRes = await fetch(`${BASE_URL}/api/cards/0001/assign`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-email': 'locked.ai.sub@example.com',
      },
      body: JSON.stringify({
        businessName: 'Mercury Sports Safe Edit',
      }),
    });
    assert(editWithoutAiRes.status === 200, `Expected 200 editing non-AI fields with canToggleAi=false, got ${editWithoutAiRes.status}`);
    console.log('✅ 2.6 canToggleAi=false blocks AI toggle (403) while allowing permitted card edits (200)');

    // 2.7 Sub-admin assigned solely via card.assignedToEmail (not in assignedCardIds) can edit
    const assignByOwnerRes = await fetch(`${BASE_URL}/api/cards/0004/assign`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': MASTER_ID,
        'x-admin-email': MASTER_EMAIL,
      },
      body: JSON.stringify({
        assignedToEmail: 'owner.only.sub@example.com',
        businessName: 'Owner Assigned Stand',
        googleReviewUrl: 'https://search.google.com/local/writereview?placeid=OwnerOnly',
        status: 'assigned',
      }),
    });
    assert(assignByOwnerRes.status === 200, 'Master failed setting assignedToEmail on 0004');

    const createOwnerAdminRes = await fetch(`${BASE_URL}/api/admins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': MASTER_ID,
        'x-admin-email': MASTER_EMAIL,
      },
      body: JSON.stringify({
        email: 'owner.only.sub@example.com',
        name: 'Owner Only Sub',
        role: 'restricted',
        assignedCardIds: [],
        permissions: { canEditCards: true, canToggleAi: true, canExportCsv: false, canCreateCards: false },
      }),
    });
    assert(createOwnerAdminRes.status === 200, 'Failed creating owner.only.sub');

    const ownerEditRes = await fetch(`${BASE_URL}/api/cards/0004/assign`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-email': 'owner.only.sub@example.com',
      },
      body: JSON.stringify({
        businessName: 'Owner Only Updated Business',
      }),
    });
    assert(ownerEditRes.status === 200, `Expected 200 when assigned via card.assignedToEmail, got ${ownerEditRes.status}`);
    console.log('✅ 2.7 Sub-admin matched via card.assignedToEmail edits card reliably (200)');

    console.log('\n🎉 ALL ISSUE 1 & ISSUE 2 SERVER/RBAC VERIFICATION TESTS PASSED!');
  } finally {
    // Always restore original JSON files so zero test artifacts pollute production data
    for (const [filePath, originalContent] of snapshots.entries()) {
      fs.writeFileSync(filePath, originalContent, 'utf-8');
    }
    console.log('♻️  Restored data/*.json snapshots cleanly (zero leftover test data).');
  }
}

runTests().catch((err) => {
  console.error('❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
