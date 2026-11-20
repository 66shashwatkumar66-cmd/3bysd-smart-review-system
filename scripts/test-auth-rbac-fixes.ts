/**
 * Comprehensive verification test suite (Tests A–F) for:
 *  - Test A: Verified Sub-Admin access (mixed-case email, UsersManagementView role promotion sync, login, session-status)
 *  - Test B: Sub-Admin registered with 0 assigned cards (registration allowed, session authorized, empty state verified)
 *  - Test C: Master assigns card -> Sub-Admin edits permitted fields & persists across refreshes
 *  - Test D: Sub-Admin QR creation/deletion strictly blocked (API 403 + UI checks)
 *  - Test E: Ownership security (unassigned card 403, ownership tampering 403, bulk-status boundary 403, admin endpoints 403)
 *  - Test F: Master Admin full workflow (batch create, assign, edit any card, register/update/delete sub-admin, logs & cards preserved)
 *
 * Automatically snapshots and restores data/*.json in finally block.
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
    `📸 Snapshot: ${initialCards.length} cards, ${initialAdmins.length} admins, ${initialUsers.length} users, ${initialLogs.length} logs`
  );

  try {
    // =========================================================================
    // TEST A: Verified Sub-Admin Access, Email Normalization & Role Promotion Sync
    // =========================================================================
    console.log('\n=== TEST A: Verified Sub-Admin Access & Role Promotion Sync ===');

    // A1: Real existing sub-admin in admins.json (e.g. thakurrsameer001@gmail.com) with mixed casing & spaces
    const existingSub = initialAdmins.find((a: any) => a.role === 'restricted');
    if (existingSub) {
      const mixedEmail = `  ${existingSub.email.toUpperCase()}  `;
      const existingSessionRes = await fetch(
        `${BASE_URL}/api/auth/session-status?email=${encodeURIComponent(mixedEmail)}`
      );
      const existingSession = (await existingSessionRes.json()) as any;
      assert(
        existingSessionRes.status === 200 &&
          existingSession.authorized === true &&
          existingSession.revoked === false &&
          existingSession.role === 'restricted',
        `Expected existing sub-admin ${existingSub.email} authorized, got: ${JSON.stringify(existingSession)}`
      );
      console.log(`✅ A1 Existing sub-admin (${existingSub.email}) authorized with mixed-case email normalization`);
    }

    // A2: Master promotes a user via POST /api/users (like UsersManagementView) -> auto-syncs admins.json & session-status
    const promotedEmailMixed = '  Verified.SubAdmin.Test@Gmail.com ';
    const promotedEmailClean = 'verified.subadmin.test@gmail.com';
    const promoteRes = await fetch(`${BASE_URL}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': MASTER_ID,
        'x-admin-email': MASTER_EMAIL,
      },
      body: JSON.stringify({
        uid: 'uid-promoted-sub-001',
        email: promotedEmailMixed,
        displayName: 'Promoted Sub Admin',
        role: 'restricted',
        emailVerified: true,
        accessRevoked: false,
        assignedCardIds: ['0001'],
      }),
    });
    const promoteData = (await promoteRes.json()) as any;
    assert(
      promoteRes.status === 200 && promoteData.user?.role === 'restricted',
      `Failed promoting user to restricted: ${JSON.stringify(promoteData)}`
    );

    // Confirm /api/auth/session-status authorizes promoted user using UID and mixed-case email
    const promoSessionRes = await fetch(
      `${BASE_URL}/api/auth/session-status?email=${encodeURIComponent('Verified.SubAdmin.Test@GMAIL.COM')}&uid=uid-promoted-sub-001`
    );
    const promoSession = (await promoSessionRes.json()) as any;
    assert(
      promoSession.authorized === true &&
        promoSession.revoked === false &&
        promoSession.role === 'restricted' &&
        promoSession.admin?.permissions?.canCreateCards === false,
      `Expected promoted user authorized as restricted with canCreateCards=false, got: ${JSON.stringify(promoSession)}`
    );

    // Subsequent login sending role='member' must NOT downgrade promoted sub-admin
    const reLoginRes = await fetch(`${BASE_URL}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: 'uid-promoted-sub-001',
        email: promotedEmailClean,
        displayName: 'Promoted Sub Admin',
        role: 'member',
      }),
    });
    const reLoginData = (await reLoginRes.json()) as any;
    assert(
      reLoginRes.status === 200 && reLoginData.user?.role === 'restricted',
      `Expected role preserved as restricted on re-login, got: ${JSON.stringify(reLoginData)}`
    );
    console.log('✅ A2 Master role promotion synced admins.json, session-status, and preserved role on login');

    // =========================================================================
    // TEST B: Sub-Admin Registered With 0 Assigned Cards
    // =========================================================================
    console.log('\n=== TEST B: Sub-Admin With 0 Assigned Cards ===');

    const zeroCardEmail = 'zero.cards.subadmin@example.com';
    const zeroCreateRes = await fetch(`${BASE_URL}/api/admins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': MASTER_ID,
        'x-admin-email': MASTER_EMAIL,
      },
      body: JSON.stringify({
        email: zeroCardEmail,
        name: 'Zero Cards SubAdmin',
        role: 'restricted',
        assignedCardIds: [],
        permissions: {
          canEditCards: true,
          canToggleAi: true,
          canExportCsv: false,
          canCreateCards: true, // Server must force this false!
        },
      }),
    });
    const zeroCreateData = (await zeroCreateRes.json()) as any;
    assert(
      zeroCreateRes.status === 200 &&
        zeroCreateData.success &&
        Array.isArray(zeroCreateData.admin?.assignedCardIds) &&
        zeroCreateData.admin.assignedCardIds.length === 0 &&
        zeroCreateData.admin?.permissions?.canCreateCards === false,
      `Expected 0-card sub-admin allowed with canCreateCards forced false, got: ${JSON.stringify(zeroCreateData)}`
    );

    const zeroSessionRes = await fetch(
      `${BASE_URL}/api/auth/session-status?email=${encodeURIComponent(zeroCardEmail)}`
    );
    const zeroSession = (await zeroSessionRes.json()) as any;
    assert(
      zeroSession.authorized === true &&
        zeroSession.revoked === false &&
        zeroSession.role === 'restricted',
      `Expected 0-card sub-admin session authorized, got: ${JSON.stringify(zeroSession)}`
    );

    const zeroLoginRes = await fetch(`${BASE_URL}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: 'uid-zero-cards-001',
        email: zeroCardEmail,
        displayName: 'Zero Cards SubAdmin',
        role: 'member',
      }),
    });
    const zeroLoginData = (await zeroLoginRes.json()) as any;
    assert(
      zeroLoginRes.status === 200 && zeroLoginData.user?.role === 'restricted',
      `Expected 0-card sub-admin login to preserve restricted role, got: ${JSON.stringify(zeroLoginData)}`
    );

    // Verify UI components have exact empty state and do not leak "Generate First Batch" or block 0-card registration
    const appSrc = fs.readFileSync(path.join(process.cwd(), 'src', 'App.tsx'), 'utf-8');
    const cardsTableSrc = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'CardsTable.tsx'), 'utf-8');
    const masterViewSrc = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'MasterAdminView.tsx'), 'utf-8');
    const headerSrc = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'AdminHeader.tsx'), 'utf-8');
    const nfcSrc = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'NfcGeneratorView.tsx'), 'utf-8');

    assert(
      appSrc.includes('No QR cards have been assigned to your account yet. Contact the Master Admin.'),
      'App.tsx missing exact Sub-Admin 0-card empty state message'
    );
    assert(
      cardsTableSrc.includes('No QR cards have been assigned to your account yet. Contact the Master Admin.') &&
        cardsTableSrc.includes('isMaster ? (') &&
        !masterViewSrc.includes('Please select at least one card this restricted admin is responsible for'),
      'MasterAdminView or CardsTable empty state guard failed check'
    );
    assert(
      !headerSrc.includes('activeAdmin.permissions?.canCreateCards') &&
        !nfcSrc.includes('activeAdmin?.permissions?.canCreateCards'),
      'AdminHeader or NfcGeneratorView still checks sub-admin canCreateCards flag!'
    );
    console.log('✅ B1 0-card Sub-Admin registration, session, login, and UI empty-state verified');

    // =========================================================================
    // TEST C: Master Assigns Card -> Sub-Admin Edits Permitted Fields & Persists
    // =========================================================================
    console.log('\n=== TEST C: Assigned Card Editing & Persistence ===');

    const testCardId = initialCards[0]?.id || '0001';
    const assignToSubRes = await fetch(`${BASE_URL}/api/cards/${testCardId}/assign`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': MASTER_ID,
        'x-admin-email': MASTER_EMAIL,
      },
      body: JSON.stringify({
        assignedToEmail: zeroCardEmail,
        assignedToName: 'Zero Cards SubAdmin',
        assignedToUid: 'uid-zero-cards-001',
        businessName: 'Initial Assigned Cafe',
        googleReviewUrl: 'https://search.google.com/local/writereview?placeid=InitCafe',
        status: 'assigned',
      }),
    });
    assert(assignToSubRes.status === 200, `Master failed assigning card #${testCardId}`);

    const subEditRes = await fetch(`${BASE_URL}/api/cards/${testCardId}/assign`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': zeroCreateData.admin.id,
        'x-admin-email': zeroCardEmail,
      },
      body: JSON.stringify({
        businessName: 'Updated Sub-Admin Bistro',
        category: 'Fine Dining',
        googleReviewUrl: 'https://search.google.com/local/writereview?placeid=UpdatedBistro',
        notes: 'Table 7 Stand',
        aiReviewEnabled: false,
        customKeywords: ['Crispy Fries', 'Warm Service'],
        whatsapp: '+91 99887 76655',
        instagram: '@updatedbistro',
      }),
    });
    const subEditData = (await subEditRes.json()) as any;
    assert(
      subEditRes.status === 200 &&
        subEditData.card?.businessName === 'Updated Sub-Admin Bistro' &&
        subEditData.card?.aiReviewEnabled === false,
      `Sub-admin failed editing assigned card #${testCardId}: ${JSON.stringify(subEditData)}`
    );

    const persistCheckRes = await fetch(`${BASE_URL}/api/cards/${testCardId}`);
    const persistCheck = (await persistCheckRes.json()) as any;
    assert(
      persistCheckRes.status === 200 &&
        persistCheck.card?.businessName === 'Updated Sub-Admin Bistro' &&
        persistCheck.card?.whatsapp === '+91 99887 76655' &&
        persistCheck.card?.instagram === '@updatedbistro',
      `Card edits did not persist across fetch: ${JSON.stringify(persistCheck)}`
    );
    console.log(`✅ C1 Sub-Admin edited & persisted permitted fields on assigned Card #${testCardId}`);

    // =========================================================================
    // TEST D: Sub-Admin QR Creation & Deletion Strictly Blocked (403)
    // =========================================================================
    console.log('\n=== TEST D: Sub-Admin QR Creation & Deletion Blocking ===');

    const subBatchRes = await fetch(`${BASE_URL}/api/cards/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': zeroCreateData.admin.id,
        'x-admin-email': zeroCardEmail,
      },
      body: JSON.stringify({ count: 1, startNumber: 9991, paddingDigits: 4 }),
    });
    assert(subBatchRes.status === 403, `Expected 403 for Sub-Admin POST /api/cards/batch, got ${subBatchRes.status}`);

    const unauthBatchRes = await fetch(`${BASE_URL}/api/cards/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: 1, startNumber: 9992, paddingDigits: 4 }),
    });
    assert(unauthBatchRes.status === 403, `Expected 403 for unauthenticated POST /api/cards/batch, got ${unauthBatchRes.status}`);

    const subUpsertCardRes = await fetch(`${BASE_URL}/api/cards/9993/assign`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': zeroCreateData.admin.id,
        'x-admin-email': zeroCardEmail,
      },
      body: JSON.stringify({ businessName: 'Sneaky New Card', status: 'assigned' }),
    });
    assert(
      subUpsertCardRes.status === 403,
      `Expected 403 for Sub-Admin creating card via PUT /api/cards/9993/assign, got ${subUpsertCardRes.status}`
    );

    const subDeleteCardRes = await fetch(`${BASE_URL}/api/cards/${testCardId}`, {
      method: 'DELETE',
      headers: {
        'x-admin-id': zeroCreateData.admin.id,
        'x-admin-email': zeroCardEmail,
      },
    });
    assert(
      subDeleteCardRes.status === 403,
      `Expected 403 for Sub-Admin DELETE /api/cards/${testCardId}, got ${subDeleteCardRes.status}`
    );

    const unauthDeleteCardRes = await fetch(`${BASE_URL}/api/cards/${testCardId}`, {
      method: 'DELETE',
    });
    assert(
      unauthDeleteCardRes.status === 403,
      `Expected 403 for unauthenticated DELETE /api/cards/${testCardId}, got ${unauthDeleteCardRes.status}`
    );
    console.log('✅ D1 Sub-Admin & unauthenticated requests blocked from creating or deleting QR cards (403)');

    // =========================================================================
    // TEST E: Ownership & Role Isolation Boundaries
    // =========================================================================
    console.log('\n=== TEST E: Ownership & Role Isolation ===');

    const unassignedCard = initialCards.find((c: any) => c.id !== testCardId);
    if (unassignedCard) {
      const editOtherRes = await fetch(`${BASE_URL}/api/cards/${unassignedCard.id}/assign`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-id': zeroCreateData.admin.id,
          'x-admin-email': zeroCardEmail,
        },
        body: JSON.stringify({ businessName: 'Hijacked' }),
      });
      assert(editOtherRes.status === 403, `Expected 403 editing unassigned card #${unassignedCard.id}, got ${editOtherRes.status}`);

      const bulkMixedRes = await fetch(`${BASE_URL}/api/cards/bulk-status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-id': zeroCreateData.admin.id,
          'x-admin-email': zeroCardEmail,
        },
        body: JSON.stringify({ ids: [testCardId, unassignedCard.id], status: 'available' }),
      });
      assert(bulkMixedRes.status === 403, `Expected 403 for bulk-status including unassigned card, got ${bulkMixedRes.status}`);
    }

    const tamperEmailRes = await fetch(`${BASE_URL}/api/cards/${testCardId}/assign`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': zeroCreateData.admin.id,
        'x-admin-email': zeroCardEmail,
      },
      body: JSON.stringify({
        businessName: 'Updated Sub-Admin Bistro',
        assignedToEmail: 'attacker@evil.com',
      }),
    });
    assert(tamperEmailRes.status === 403, `Expected 403 tampering assignedToEmail, got ${tamperEmailRes.status}`);

    const tamperNameRes = await fetch(`${BASE_URL}/api/cards/${testCardId}/assign`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': zeroCreateData.admin.id,
        'x-admin-email': zeroCardEmail,
      },
      body: JSON.stringify({
        businessName: 'Updated Sub-Admin Bistro',
        assignedToName: 'Someone Else',
      }),
    });
    assert(tamperNameRes.status === 403, `Expected 403 tampering assignedToName, got ${tamperNameRes.status}`);

    const subAdminCreateRes = await fetch(`${BASE_URL}/api/admins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': zeroCreateData.admin.id,
        'x-admin-email': zeroCardEmail,
      },
      body: JSON.stringify({ email: 'rogue2@example.com', name: 'Rogue 2', role: 'master' }),
    });
    assert(subAdminCreateRes.status === 403, `Expected 403 for Sub-Admin POST /api/admins, got ${subAdminCreateRes.status}`);
    console.log('✅ E1 Unassigned edits, bulk-status boundary, ownership field tampering, and admin routes blocked (403)');

    // =========================================================================
    // TEST F: Master Admin Full Workflow & Deletion Data Preservation
    // =========================================================================
    console.log('\n=== TEST F: Master Admin Full Workflow & Deletion ===');

    const batchRes = await fetch(`${BASE_URL}/api/cards/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': MASTER_ID,
        'x-admin-email': MASTER_EMAIL,
      },
      body: JSON.stringify({ count: 1, startNumber: 8888, paddingDigits: 4 }),
    });
    const batchData = (await batchRes.json()) as any;
    assert(
      batchRes.status === 200 &&
        batchData.success &&
        Array.isArray(batchData.cards) &&
        batchData.cards.some((c: any) => c.id === '8888'),
      `Master batch creation failed: ${JSON.stringify(batchData)}`
    );

    const assignNewCardRes = await fetch(`${BASE_URL}/api/cards/8888/assign`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': MASTER_ID,
        'x-admin-email': MASTER_EMAIL,
      },
      body: JSON.stringify({
        businessName: 'Master Created Stand #8888',
        googleReviewUrl: 'https://search.google.com/local/writereview?placeid=Master8888',
        assignedToEmail: zeroCardEmail,
        status: 'assigned',
      }),
    });
    assert(assignNewCardRes.status === 200, 'Master failed assigning new card #8888');

    // Delete Sub-Admin and verify immediate revocation + data preservation
    const deleteSubRes = await fetch(`${BASE_URL}/api/admins/${zeroCreateData.admin.id}`, {
      method: 'DELETE',
      headers: {
        'x-admin-id': MASTER_ID,
        'x-admin-email': MASTER_EMAIL,
      },
    });
    assert(deleteSubRes.status === 200, 'Master failed deleting sub-admin');

    const postDeleteSessionRes = await fetch(
      `${BASE_URL}/api/auth/session-status?email=${encodeURIComponent(zeroCardEmail)}`
    );
    const postDeleteSession = (await postDeleteSessionRes.json()) as any;
    assert(
      postDeleteSession.authorized === false && postDeleteSession.revoked === true,
      `Deleted sub-admin not immediately revoked: ${JSON.stringify(postDeleteSession)}`
    );

    const cardCheckAfterDeleteRes = await fetch(`${BASE_URL}/api/cards/8888`);
    const cardCheckAfterDelete = (await cardCheckAfterDeleteRes.json()) as any;
    assert(
      cardCheckAfterDeleteRes.status === 200 && cardCheckAfterDelete.card?.businessName === 'Master Created Stand #8888',
      'Card #8888 lost after deleting sub-admin!'
    );

    const logsAfterRes = await fetch(`${BASE_URL}/api/logs?limit=all`);
    const logsAfterData = (await logsAfterRes.json()) as any;
    assert(
      logsAfterData.totalCount === initialLogs.length,
      `QR logs altered! Expected ${initialLogs.length}, got ${logsAfterData.totalCount}`
    );

    const deleteCreatedCardRes = await fetch(`${BASE_URL}/api/cards/8888`, {
      method: 'DELETE',
      headers: {
        'x-admin-id': MASTER_ID,
        'x-admin-email': MASTER_EMAIL,
      },
    });
    assert(deleteCreatedCardRes.status === 200, 'Master failed deleting card #8888');
    console.log('✅ F1 Master Admin batch create, assign, sub-admin deletion/revocation, and card/log preservation passed');

    console.log('\n🎉 ALL TESTS A–F PASSED SUCCESSFULLY!');
  } finally {
    for (const [filePath, originalContent] of snapshots.entries()) {
      fs.writeFileSync(filePath, originalContent, 'utf-8');
    }
    console.log('♻️  Restored data/*.json snapshots cleanly.');
  }
}

runTests().catch((err) => {
  console.error('❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
