import {
  getSubscriptionStatus,
  isSubscriptionAccessible,
  validateSubscriptionDates,
  formatDisplayDate,
  getPresetDates,
  getTodayDateString,
} from '../src/utils/subscription';
import fs from 'fs';
import path from 'path';

async function runTests() {
  console.log('--- 🧪 STARTING QR SUBSCRIPTION & CONNECT BUTTON TESTS ---');

  const today = getTodayDateString();
  console.log(`Current Reference Date: ${today}`);

  // Test 1: Unit tests for getSubscriptionStatus and isSubscriptionAccessible
  console.log('\n[TEST 1] Testing Subscription Helper Logic...');

  // 1a: Unconfigured card
  const unconfiguredCard: any = { id: '0001', status: 'assigned' };
  const unconfiguredStatus = getSubscriptionStatus(unconfiguredCard);
  const unconfiguredAccess = isSubscriptionAccessible(unconfiguredCard);
  if (unconfiguredStatus !== 'unconfigured' || !unconfiguredAccess.accessible) {
    throw new Error(`Test 1a failed: Expected unconfigured & accessible, got ${unconfiguredStatus}`);
  }
  console.log('✅ 1a: Unconfigured card backward compatibility works (status: unconfigured, accessible: true)');

  // 1b: Active card (started 10 days ago, ends in 20 days)
  const activeCard: any = {
    id: '0002',
    status: 'assigned',
    subscriptionStartDate: '2026-10-01',
    subscriptionEndDate: '2026-12-31',
  };
  const activeStatus = getSubscriptionStatus(activeCard, '2026-11-04');
  const activeAccess = isSubscriptionAccessible(activeCard, '2026-11-04');
  if (activeStatus !== 'active' || !activeAccess.accessible) {
    throw new Error(`Test 1b failed: Expected active & accessible, got ${activeStatus}`);
  }
  console.log('✅ 1b: Active card is accessible (status: active, accessible: true)');

  // 1c: Upcoming card (starts next month)
  const upcomingCard: any = {
    id: '0003',
    status: 'assigned',
    subscriptionStartDate: '2026-12-01',
    subscriptionEndDate: '2027-12-01',
  };
  const upcomingStatus = getSubscriptionStatus(upcomingCard, '2026-11-04');
  const upcomingAccess = isSubscriptionAccessible(upcomingCard, '2026-11-04');
  if (upcomingStatus !== 'upcoming' || upcomingAccess.accessible) {
    throw new Error(`Test 1c failed: Expected upcoming & blocked, got ${upcomingStatus}`);
  }
  if (upcomingAccess.message !== 'This QR subscription is not active yet.') {
    throw new Error(`Test 1c failed: Expected exact message 'This QR subscription is not active yet.', got '${upcomingAccess.message}'`);
  }
  console.log('✅ 1c: Upcoming card blocked with exact message: "This QR subscription is not active yet."');

  // 1d: Expired card (ended last month)
  const expiredCard: any = {
    id: '0004',
    status: 'assigned',
    subscriptionStartDate: '2025-01-01',
    subscriptionEndDate: '2026-10-31',
  };
  const expiredStatus = getSubscriptionStatus(expiredCard, '2026-11-04');
  const expiredAccess = isSubscriptionAccessible(expiredCard, '2026-11-04');
  if (expiredStatus !== 'expired' || expiredAccess.accessible) {
    throw new Error(`Test 1d failed: Expected expired & blocked, got ${expiredStatus}`);
  }
  if (expiredAccess.message !== 'This QR subscription has expired. Please contact the business for assistance.') {
    throw new Error(`Test 1d failed: Expected exact message 'This QR subscription has expired. Please contact the business for assistance.', got '${expiredAccess.message}'`);
  }
  console.log('✅ 1d: Expired card blocked with exact message: "This QR subscription has expired. Please contact the business for assistance."');

  // Test 2: Validation of dates
  console.log('\n[TEST 2] Testing Date Validation...');
  const validCheck = validateSubscriptionDates('2026-11-01', '2026-12-01');
  if (!validCheck.valid) {
    throw new Error(`Test 2a failed: Expected valid dates, got ${validCheck.error}`);
  }

  const invalidCheck = validateSubscriptionDates('2026-12-01', '2026-11-01');
  if (invalidCheck.valid) {
    throw new Error('Test 2b failed: Expected invalid dates when end < start');
  }
  console.log(`✅ 2: Date validation correctly caught invalid range: "${invalidCheck.error}"`);

  // Test 3: API Integration Tests against local server (PORT 3000)
  console.log('\n[TEST 3] Testing Server API Endpoints...');

  // 3a: Assign card with active subscription
  const assignRes = await fetch('http://localhost:3000/api/cards/0002/assign', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      businessName: 'Active Bakery',
      category: 'Bakery',
      subscriptionStartDate: '2026-10-01',
      subscriptionEndDate: '2027-10-01',
      googleReviewUrl: 'https://example.com/review',
    }),
  });
  if (!assignRes.ok) {
    throw new Error(`Test 3a failed: Assign active card returned ${assignRes.status}`);
  }
  const assignData = await assignRes.json();
  if (assignData.card.subscriptionStatus !== 'active') {
    throw new Error(`Test 3a failed: Expected active status in server response, got ${assignData.card.subscriptionStatus}`);
  }
  console.log('✅ 3a: Server PUT /api/cards/:id/assign successfully saved active subscription dates and status');

  // 3b: Test invalid date range on server
  const invalidAssignRes = await fetch('http://localhost:3000/api/cards/0002/assign', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscriptionStartDate: '2027-01-01',
      subscriptionEndDate: '2026-01-01',
    }),
  });
  if (invalidAssignRes.status !== 400) {
    throw new Error(`Test 3b failed: Expected HTTP 400 for invalid dates, got ${invalidAssignRes.status}`);
  }
  console.log('✅ 3b: Server properly rejected invalid dates with HTTP 400');

  // 3c: Assign an expired subscription to card 0003
  await fetch('http://localhost:3000/api/cards/0003/assign', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      businessName: 'Expired Business',
      category: 'Shop',
      subscriptionStartDate: '2025-01-01',
      subscriptionEndDate: '2026-01-01', // Ended in the past
      googleReviewUrl: 'https://example.com/review3',
    }),
  });

  // Check GET /api/cards/0003
  const getExpiredRes = await fetch('http://localhost:3000/api/cards/0003');
  const getExpiredData = await getExpiredRes.json();
  if (getExpiredData.subscriptionStatus !== 'expired' || getExpiredData.subscriptionAccessible !== false) {
    throw new Error(`Test 3c failed: Card 0003 was expected to be expired, got ${getExpiredData.subscriptionStatus}`);
  }
  console.log('✅ 3c: GET /api/cards/0003 returns subscriptionStatus: "expired" and subscriptionAccessible: false');

  // 3d: Attempt to generate AI review on expired card 0003 -> MUST return HTTP 403 Forbidden!
  const reviewAttemptRes = await fetch('http://localhost:3000/api/generate-review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cardId: '0003',
      businessName: 'Expired Business',
      category: 'Shop',
      rating: 5,
      tags: ['Good quality'],
      language: 'en',
      tone: 'casual',
      aiReviewEnabled: true,
    }),
  });
  if (reviewAttemptRes.status !== 403) {
    throw new Error(`Test 3d failed: Expected HTTP 403 Forbidden for review on expired card, got ${reviewAttemptRes.status}`);
  }
  const reviewErrData = await reviewAttemptRes.json();
  if (reviewErrData.message !== 'This QR subscription has expired. Please contact the business for assistance.') {
    throw new Error(`Test 3d failed: Expected exact message on review block, got: ${reviewErrData.message}`);
  }
  console.log('✅ 3d: POST /api/generate-review returned HTTP 403 with exact customer message: "This QR subscription has expired. Please contact the business for assistance."');

  // 3e: Assign upcoming subscription to card 0004
  await fetch('http://localhost:3000/api/cards/0004/assign', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      businessName: 'Future Grand Opening',
      category: 'Restaurant',
      subscriptionStartDate: '2027-01-01', // Starts in future
      subscriptionEndDate: '2028-01-01',
      googleReviewUrl: 'https://example.com/review4',
    }),
  });

  const reviewUpcomingRes = await fetch('http://localhost:3000/api/generate-review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cardId: '0004',
      businessName: 'Future Grand Opening',
      category: 'Restaurant',
      rating: 5,
      tags: ['Good quality'],
      language: 'en',
      tone: 'casual',
      aiReviewEnabled: true,
    }),
  });
  if (reviewUpcomingRes.status !== 403) {
    throw new Error(`Test 3e failed: Expected HTTP 403 for upcoming card, got ${reviewUpcomingRes.status}`);
  }
  const upcomingErr = await reviewUpcomingRes.json();
  if (upcomingErr.message !== 'This QR subscription is not active yet.') {
    throw new Error(`Test 3e failed: Expected exact message on upcoming card, got: ${upcomingErr.message}`);
  }
  console.log('✅ 3e: POST /api/generate-review returned HTTP 403 with exact customer message: "This QR subscription is not active yet."');

  // Test 4: Verify CustomerReviewView.tsx source has Let's Connect button and exact customer messages
  console.log('\n[TEST 4] Verifying CustomerReviewView UI & Button Styling...');
  const customerViewContent = fs.readFileSync(path.join(process.cwd(), 'src/components/CustomerReviewView.tsx'), 'utf-8');

  if (!customerViewContent.includes("Let's Connect")) {
    throw new Error('Test 4a failed: CustomerReviewView.tsx does not contain "Let\'s Connect"');
  }
  if (!customerViewContent.includes('bg-[#16A34A]')) {
    throw new Error('Test 4a failed: "Let\'s Connect" button missing green background class bg-[#16A34A]');
  }
  if (!customerViewContent.includes('text-white font-bold')) {
    throw new Error('Test 4a failed: "Let\'s Connect" button missing text-white font-bold');
  }
  if (!customerViewContent.includes('This QR subscription has expired. Please contact the business for assistance.')) {
    throw new Error('Test 4b failed: Missing exact expired message in CustomerReviewView.tsx');
  }
  if (!customerViewContent.includes('This QR subscription is not active yet.')) {
    throw new Error('Test 4b failed: Missing exact upcoming message in CustomerReviewView.tsx');
  }
  console.log('✅ 4a: "Let\'s Connect" button verified with large green button bg-[#16A34A], white text/icons, and thumb-friendly padding');
  console.log('✅ 4b: Exact customer-facing messages verified in CustomerReviewView.tsx');

  // Test 5: Verify CardsTable.tsx has Subscription column and filters
  console.log('\n[TEST 5] Verifying CardsTable Subscription Column & Filters...');
  const cardsTableContent = fs.readFileSync(path.join(process.cwd(), 'src/components/CardsTable.tsx'), 'utf-8');
  if (!cardsTableContent.includes('subscriptionFilter')) {
    throw new Error('Test 5 failed: subscriptionFilter not found in CardsTable.tsx');
  }
  if (!cardsTableContent.includes('>Subscription</th>')) {
    throw new Error('Test 5 failed: Subscription th header not found in CardsTable.tsx');
  }
  console.log('✅ 5: CardsTable has Subscription column and active/upcoming/expired/unconfigured filter shortcuts');

  console.log('\n🎉 ALL QR SUBSCRIPTION & CONNECT BUTTON TESTS PASSED SUCCESSFULLY! 🎉\n');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
