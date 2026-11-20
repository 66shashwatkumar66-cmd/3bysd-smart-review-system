/**
 * Test script for Stay Connected social links and Sub-admin card editing permissions.
 * Run with: npx tsx scripts/test-stay-connected-and-subadmin.ts
 */
import { formatWhatsAppUrl, formatInstagramUrl, validateWhatsAppInput, validateInstagramInput } from '../src/utils/socialLinks';
import fetch from 'node-fetch';

async function runTests() {
  console.log('=== TEST 1: Social Links URL Formatting & Validation ===');

  // Test WhatsApp formatting
  const wa1 = formatWhatsAppUrl('+91 98765 43210');
  console.log('WA "+91 98765 43210" ->', wa1);
  if (wa1 !== 'https://wa.me/919876543210') throw new Error(`WA 1 failed: ${wa1}`);

  const wa2 = formatWhatsAppUrl('9876543210');
  console.log('WA "9876543210" ->', wa2);
  if (wa2 !== 'https://wa.me/919876543210') throw new Error(`WA 2 failed: ${wa2}`);

  const wa3 = formatWhatsAppUrl('https://wa.me/919876543210?text=Hello');
  console.log('WA "https://wa.me/..." ->', wa3);
  if (wa3 !== 'https://wa.me/919876543210?text=Hello') throw new Error(`WA 3 failed: ${wa3}`);

  const wa4 = formatWhatsAppUrl('');
  console.log('WA empty ->', wa4);
  if (wa4 !== null) throw new Error(`WA 4 should be null: ${wa4}`);

  // Test WhatsApp validation
  const waVal1 = validateWhatsAppInput('+91 98765 43210');
  if (!waVal1.valid) throw new Error(`WA val1 failed: ${waVal1.error}`);

  const waVal2 = validateWhatsAppInput('invalid-phone');
  if (waVal2.valid) throw new Error('WA val2 should have failed');
  console.log('WA invalid rejected correctly:', waVal2.error);

  // Test Instagram formatting
  const ig1 = formatInstagramUrl('@mercurysports');
  console.log('IG "@mercurysports" ->', ig1);
  if (ig1 !== 'https://instagram.com/mercurysports') throw new Error(`IG 1 failed: ${ig1}`);

  const ig2 = formatInstagramUrl('mercurysports');
  console.log('IG "mercurysports" ->', ig2);
  if (ig2 !== 'https://instagram.com/mercurysports') throw new Error(`IG 2 failed: ${ig2}`);

  const ig3 = formatInstagramUrl('https://instagram.com/mercurysports');
  console.log('IG URL ->', ig3);
  if (ig3 !== 'https://instagram.com/mercurysports') throw new Error(`IG 3 failed: ${ig3}`);

  const ig4 = formatInstagramUrl('');
  console.log('IG empty ->', ig4);
  if (ig4 !== null) throw new Error(`IG 4 should be null: ${ig4}`);

  // Test Instagram validation
  const igVal1 = validateInstagramInput('@mercurysports');
  if (!igVal1.valid) throw new Error(`IG val1 failed: ${igVal1.error}`);

  const igVal2 = validateInstagramInput('http://malicious.com/notinstagram');
  if (igVal2.valid) throw new Error('IG val2 should have failed');
  console.log('IG invalid rejected correctly:', igVal2.error);

  console.log('✅ ALL URL FORMATTING & VALIDATION TESTS PASSED!\n');

  console.log('=== TEST 2: Server API Sub-Admin Permissions & Social Fields ===');
  const baseUrl = 'http://localhost:3000';

  // 1. Fetch current cards and admins
  const adminsRes = await fetch(`${baseUrl}/api/admins`);
  const adminsData = (await adminsRes.json()) as any;
  let subAdmin = adminsData.admins.find((a: any) => a.role === 'restricted');

  if (!subAdmin) {
    console.log('No sub-admin found. Creating test sub-admin via POST /api/admins...');
    const createSubRes = await fetch(`${baseUrl}/api/admins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'merchant.sports@gmail.com',
        name: 'Mercury Sports Store Manager',
        role: 'restricted',
        assignedCardIds: ['0001'],
        permissions: {
          canEditCards: true,
          canToggleAi: true,
          canExportCsv: false,
          canCreateCards: false,
        },
      }),
    });
    const createData = (await createSubRes.json()) as any;
    if (!createData.success || !createData.admin) {
      throw new Error(`Failed to create test sub-admin: ${JSON.stringify(createData)}`);
    }
    subAdmin = createData.admin;
    console.log('Created test sub-admin:', subAdmin.id, subAdmin.name);
  }
  console.log(`Sub-admin identified: ${subAdmin.name} (${subAdmin.email}), assigned cards:`, subAdmin.assignedCardIds);

  const assignedCardId = subAdmin.assignedCardIds[0];
  if (!assignedCardId) {
    throw new Error('Sub-admin has no assigned cards');
  }

  // 2. Sub-admin edits their assigned card with WhatsApp & Instagram
  console.log(`Sub-admin editing ASSIGNED card #${assignedCardId}...`);
  const editAssignedRes = await fetch(`${baseUrl}/api/cards/${assignedCardId}/assign`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-id': subAdmin.id,
    },
    body: JSON.stringify({
      businessName: 'Mercury Sports Pro Store',
      category: 'Sports Shop',
      googleReviewUrl: 'https://search.google.com/local/writereview?placeid=ChIJMercurySports',
      status: 'assigned',
      whatsapp: '+91 98765 43210',
      instagram: '@mercurysports',
      adminId: subAdmin.id,
    }),
  });

  const editAssignedData = (await editAssignedRes.json()) as any;
  console.log('Sub-admin edit response status:', editAssignedRes.status, 'success:', editAssignedData.success);
  if (editAssignedRes.status !== 200 || !editAssignedData.success) {
    throw new Error(`Sub-admin was improperly denied permission on assigned card: ${JSON.stringify(editAssignedData)}`);
  }
  if (editAssignedData.card.whatsapp !== '+91 98765 43210' || editAssignedData.card.instagram !== '@mercurysports') {
    throw new Error(`Social fields not preserved on card: ${JSON.stringify(editAssignedData.card)}`);
  }
  console.log('✅ Sub-admin successfully edited assigned card and saved social links!');

  // 3. Verify public lookup endpoint returns the updated social links
  const publicRes = await fetch(`${baseUrl}/api/cards/${assignedCardId}`);
  const publicData = (await publicRes.json()) as any;
  if (!publicData.card || publicData.card.whatsapp !== '+91 98765 43210' || publicData.card.instagram !== '@mercurysports') {
    throw new Error(`Public endpoint did not return social links: ${JSON.stringify(publicData)}`);
  }
  console.log('✅ Public card lookup returned correct WhatsApp & Instagram links!');

  // 4. Sub-admin tries to edit an UNASSIGNED card (e.g. '0003' or any card not in their assignedCardIds)
  const cardsRes = await fetch(`${baseUrl}/api/cards`);
  const cardsData = (await cardsRes.json()) as any;
  const unassignedCard = cardsData.cards.find((c: any) => !subAdmin.assignedCardIds.includes(c.id));

  if (unassignedCard) {
    console.log(`Sub-admin attempting to edit UNASSIGNED card #${unassignedCard.id}...`);
    const editUnassignedRes = await fetch(`${baseUrl}/api/cards/${unassignedCard.id}/assign`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-id': subAdmin.id,
      },
      body: JSON.stringify({
        businessName: 'Hacker Sports',
        adminId: subAdmin.id,
      }),
    });

    console.log('Unassigned edit response status:', editUnassignedRes.status);
    if (editUnassignedRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden for sub-admin on unassigned card, got ${editUnassignedRes.status}`);
    }
    console.log('✅ Sub-admin correctly FORBIDDEN from editing unassigned cards (403)!');
  }

  // 5. Sub-admin tries to reassign ownership of their card to a different email
  console.log('Sub-admin attempting to reassign ownership email...');
  const reassignRes = await fetch(`${baseUrl}/api/cards/${assignedCardId}/assign`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-id': subAdmin.id,
    },
    body: JSON.stringify({
      assignedToEmail: 'attacker@evil.com',
      adminId: subAdmin.id,
    }),
  });

  console.log('Reassign response status:', reassignRes.status);
  if (reassignRes.status !== 403) {
    throw new Error(`Expected 403 Forbidden when sub-admin tries to change assignedToEmail, got ${reassignRes.status}`);
  }
  console.log('✅ Sub-admin correctly PREVENTED from changing card ownership (403)!');

  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! Both Part 1 and Part 2 verified.');
}

runTests().catch((err) => {
  console.error('TEST SUITE FAILED:', err);
  process.exit(1);
});
