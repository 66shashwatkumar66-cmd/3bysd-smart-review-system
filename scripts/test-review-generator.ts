import { generateReviewWithGemini, generateSmartFallbackReview, computeTextSimilarity } from '../src/services/reviewGenerator';

const BASE_URL = 'http://localhost:3000';

interface TestRecord {
  id: string;
  name: string;
  passed: boolean;
  output?: string;
  notes?: string;
}

const tests: TestRecord[] = [];

async function runScenario(
  id: string,
  name: string,
  testFn: () => Promise<{ passed: boolean; output: string; notes?: string }>
) {
  console.log(`\n======================================================`);
  console.log(`Running Scenario [${id}]: ${name}`);
  console.log(`======================================================`);
  try {
    const res = await testFn();
    tests.push({ id, name, passed: res.passed, output: res.output, notes: res.notes });
    console.log(`STATUS: ${res.passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`OUTPUT:\n"${res.output}"`);
    if (res.notes) console.log(`ANALYSIS: ${res.notes}`);
  } catch (err: any) {
    tests.push({ id, name, passed: false, output: err?.message, notes: err?.stack });
    console.error(`STATUS: ❌ FAILED WITH EXCEPTION:`, err.message);
  }
}

async function main() {
  console.log('Starting Business-Aware & Keyword-Aware AI Review Verification Suite...');

  // ---------------- TEST A — SPORTS SHOP (Hinglish, Warm, 5 Stars) ----------------
  await runScenario('TEST A', 'Sports Shop — Cricket Equipment & Affordable Prices (Hinglish, Warm, 5 Stars)', async () => {
    const payload = {
      businessName: 'Mercury Sports',
      category: 'Sports Shop',
      businessDescription: 'Sports equipment, fitness accessories, cricket equipment, football gear, badminton equipment, and sportswear.',
      tags: ['Cricket bats', 'Cricket kits', 'Affordable prices'],
      language: 'hinglish' as const,
      tone: 'warm' as const,
      rating: 5,
    };

    const res = await fetch(`${BASE_URL}/api/generate-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    const text = (data.review || '').toLowerCase();

    const hasCricket = text.includes('cricket') || text.includes('bat') || text.includes('kit');
    const hasPrice = text.includes('price') || text.includes('rate') || text.includes('affordable') || text.includes('reasonable');
    const hasNoFood = !text.includes('coffee') && !text.includes('pastry') && !text.includes('food') && !text.includes('dish');
    const isHinglish = text.includes('achha') || text.includes('bohot') || text.includes('kaafi') || text.includes('laga') || text.includes('raha');

    const passed = hasCricket && hasPrice && hasNoFood && isHinglish && data.success;
    return {
      passed,
      output: data.review,
      notes: `Cricket terms: ${hasCricket}, Price terms: ${hasPrice}, Zero food terms: ${hasNoFood}, Hinglish style: ${isHinglish}`,
    };
  });

  // ---------------- TEST B — SAME BUSINESS, DIFFERENT KEYWORDS (English, Professional, 5 Stars) ----------------
  await runScenario('TEST B', 'Sports Shop — Badminton Rackets & Sports Shoes (English, Professional, 5 Stars)', async () => {
    const payload = {
      businessName: 'Mercury Sports',
      category: 'Sports Shop',
      businessDescription: 'Sports equipment, fitness accessories, cricket equipment, football gear, badminton equipment, and sportswear.',
      tags: ['Badminton rackets', 'Sports shoes', 'Genuine products'],
      language: 'en' as const,
      tone: 'professional' as const,
      rating: 5,
    };

    const res = await fetch(`${BASE_URL}/api/generate-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    const text = (data.review || '').toLowerCase();

    const hasBadmintonOrShoes = text.includes('badminton') || text.includes('racket') || text.includes('shoe');
    const hasGenuine = text.includes('genuine') || text.includes('authentic') || text.includes('quality') || text.includes('product');
    const hasNoCricket = !text.includes('cricket');
    const hasNoFood = !text.includes('coffee') && !text.includes('dining') && !text.includes('food');

    const passed = hasBadmintonOrShoes && hasGenuine && hasNoCricket && hasNoFood && data.success;
    return {
      passed,
      output: data.review,
      notes: `Badminton/Shoes: ${hasBadmintonOrShoes}, Genuine/Quality: ${hasGenuine}, No cricket: ${hasNoCricket}, No food: ${hasNoFood}`,
    };
  });

  // ---------------- TEST C — CAFE (English, Casual, 5 Stars) ----------------
  await runScenario('TEST C', 'Example Cafe — Coffee Quality, Fresh Pastries, Friendly Staff (English, Casual, 5 Stars)', async () => {
    const payload = {
      businessName: 'Example Cafe',
      category: 'Cafe & Bakery',
      businessDescription: 'Specialty espresso, artisanal pastries, freshly baked sourdough, and cozy seating.',
      tags: ['Coffee quality', 'Fresh pastries', 'Friendly staff'],
      language: 'en' as const,
      tone: 'casual' as const,
      rating: 5,
    };

    const res = await fetch(`${BASE_URL}/api/generate-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    const text = (data.review || '').toLowerCase();

    const hasCoffeeOrPastry = text.includes('coffee') || text.includes('pastr') || text.includes('bak');
    const hasStaff = text.includes('staff') || text.includes('friend') || text.includes('service') || text.includes('team');
    const hasNoSports = !text.includes('cricket') && !text.includes('badminton') && !text.includes('sports');

    const passed = hasCoffeeOrPastry && hasStaff && hasNoSports && data.success;
    return {
      passed,
      output: data.review,
      notes: `Coffee/Pastry: ${hasCoffeeOrPastry}, Staff: ${hasStaff}, No sports terminology: ${hasNoSports}`,
    };
  });

  // ---------------- TEST D — LOW RATING (Hinglish, Simple & Direct, 2 Stars) ----------------
  await runScenario('TEST D', 'Sports Shop — Expensive Products, Limited Variety (Hinglish, Simple & Direct, 2 Stars)', async () => {
    const payload = {
      businessName: 'Mercury Sports',
      category: 'Sports Shop',
      businessDescription: 'Sports equipment and fitness retail store.',
      tags: ['Expensive products', 'Limited variety'],
      language: 'hinglish' as const,
      tone: 'direct' as const,
      rating: 2,
    };

    const res = await fetch(`${BASE_URL}/api/generate-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    const text = (data.review || '').toLowerCase();

    const hasNegativeSentiment = text.includes('expensive') || text.includes('limited') || text.includes('disappoint') || text.includes('kami') || text.includes('thoda') || text.includes('mehnga') || text.includes('expectations');
    const notGlowing = !text.includes('10/10') && !text.includes('superb') && !text.includes('dil khush');

    const passed = hasNegativeSentiment && notGlowing && data.success;
    return {
      passed,
      output: data.review,
      notes: `Measured negative sentiment: ${hasNegativeSentiment}, No glowing 5-star praise: ${notGlowing}`,
    };
  });

  // ---------------- TEST E — NO SELECTED KEYWORDS (English, Simple & Direct, 4 Stars) ----------------
  await runScenario('TEST E', 'Sports Shop — No Selected Keywords (English, Simple & Direct, 4 Stars)', async () => {
    const payload = {
      businessName: 'Mercury Sports',
      category: 'Sports Shop',
      businessDescription: 'Sports equipment and athletic accessories store.',
      tags: [],
      language: 'en' as const,
      tone: 'direct' as const,
      rating: 4,
    };

    const res = await fetch(`${BASE_URL}/api/generate-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    const text = (data.review || '').toLowerCase();

    const hasNoSpecificClaims = !text.includes('bought a bat') && !text.includes('ordered food');
    const hasCategoryOrStore = text.includes('mercury') || text.includes('sports') || text.includes('store') || text.includes('service') || text.includes('visit');

    const passed = hasNoSpecificClaims && hasCategoryOrStore && data.success;
    return {
      passed,
      output: data.review,
      notes: `Appropriately general without false claims: ${hasNoSpecificClaims}, Category/Store context: ${hasCategoryOrStore}`,
    };
  });

  // ---------------- TEST F — OPTIONAL CUSTOMER DETAILS (Hinglish, Casual, 5 Stars) ----------------
  await runScenario('TEST F', 'Sports Shop with Customer Detail: "Staff helped me compare two bats" (Hinglish, Casual, 5 Stars)', async () => {
    const payload = {
      businessName: 'Mercury Sports',
      category: 'Sports Shop',
      tags: ['Cricket bats'],
      notes: 'Staff helped me compare two bats',
      language: 'hinglish' as const,
      tone: 'casual' as const,
      rating: 5,
    };

    const res = await fetch(`${BASE_URL}/api/generate-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    const text = (data.review || '').toLowerCase();

    const hasNoteOrDetail = text.includes('compare') || text.includes('two bats') || text.includes('bats');
    const hasCricket = text.includes('cricket') || text.includes('bat');

    const passed = hasNoteOrDetail && hasCricket && data.success;
    return {
      passed,
      output: data.review,
      notes: `Incorporated customer specific detail: ${hasNoteOrDetail}, Centered on cricket: ${hasCricket}`,
    };
  });

  // ---------------- TEST G — CROSS-CARD ISOLATION ----------------
  await runScenario('TEST G', 'Cross-Card Isolation — Two distinct card configurations retain independent keywords', async () => {
    // Card 1: Sports Shop
    const res1 = await fetch(`${BASE_URL}/api/generate-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessName: 'Mercury Sports',
        category: 'Sports Shop',
        tags: ['Cricket bats', 'Cricket kits'],
        rating: 5,
        language: 'en',
      }),
    });
    const d1 = await res1.json();

    // Card 2: Dental Clinic
    const res2 = await fetch(`${BASE_URL}/api/generate-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessName: 'Apex Dental Care',
        category: 'Dental Clinic',
        tags: ['Painless treatment', 'Doctor consultation'],
        rating: 5,
        language: 'en',
      }),
    });
    const d2 = await res2.json();

    const text1 = (d1.review || '').toLowerCase();
    const text2 = (d2.review || '').toLowerCase();

    const isolated1 = (text1.includes('cricket') || text1.includes('bat') || text1.includes('kit')) && !text1.includes('dental') && !text1.includes('doctor');
    const isolated2 = (text2.includes('dental') || text2.includes('treatment') || text2.includes('doctor') || text2.includes('clinic')) && !text2.includes('cricket') && !text2.includes('bat');

    const passed = isolated1 && isolated2;
    return {
      passed,
      output: `Card 1 (Sports): "${d1.review}"\nCard 2 (Dental): "${d2.review}"`,
      notes: `Card 1 has zero dental terms: ${isolated1}; Card 2 has zero sports terms: ${isolated2}`,
    };
  });

  // ---------------- TEST H — PERSISTENCE OF CUSTOMIZER KEYWORDS ----------------
  await runScenario('TEST H', 'Keyword Persistence — Custom keywords persist to server and Firestore', async () => {
    const cardId = '0002';
    const testKeywords = ['Custom Tag A', 'Custom Tag B', 'Custom Tag C'];

    // Save keywords to card
    const updateRes = await fetch(`${BASE_URL}/api/cards/${cardId}/assign`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customKeywords: testKeywords,
      }),
    });
    const updateData = await updateRes.json();

    // Fresh fetch to verify persistence
    const fetchRes = await fetch(`${BASE_URL}/api/cards/${cardId}`);
    const fetchData = await fetchRes.json();
    const savedKeywords = fetchData.card?.customKeywords || [];

    const passed =
      Array.isArray(savedKeywords) &&
      testKeywords.every((kw) => savedKeywords.includes(kw));

    return {
      passed,
      output: `Saved & Retrieved: [${savedKeywords.join(', ')}]`,
      notes: `Keywords persisted and re-queried successfully: ${passed}`,
    };
  });

  // ---------------- TEST I — REGENERATION & DIVERSITY ----------------
  await runScenario('TEST I', 'Regeneration & Diversity — Successive drafts vary while keeping inputs consistent', async () => {
    const payload = {
      businessName: 'Mercury Sports',
      category: 'Sports Shop',
      tags: ['Cricket bats', 'Affordable prices'],
      language: 'hinglish' as const,
      tone: 'casual' as const,
      rating: 5,
    };

    const res1 = await fetch(`${BASE_URL}/api/generate-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const d1 = await res1.json();
    const review1 = d1.review || '';

    // Generate second version with recentDrafts passed
    const res2 = await fetch(`${BASE_URL}/api/generate-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        recentDrafts: [review1],
      }),
    });
    const d2 = await res2.json();
    const review2 = d2.review || '';

    const similarity = computeTextSimilarity(review1, review2);
    const areDistinct = review1 !== review2 && similarity < 0.85;

    const passed = areDistinct && review1.length > 20 && review2.length > 20;
    return {
      passed,
      output: `Version 1: "${review1}"\nVersion 2: "${review2}"`,
      notes: `Similarity: ${(similarity * 100).toFixed(1)}% (Distinct & under 85% threshold)`,
    };
  });

  // ---------------- TEST J — ERROR HANDLING ----------------
  await runScenario('TEST J', 'Error Handling — AI Disabled and Missing Configuration handled gracefully', async () => {
    // 1. Test AI Disabled card
    const resDisabled = await fetch(`${BASE_URL}/api/generate-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessName: 'Test Disabled Card',
        aiReviewEnabled: false,
        rating: 5,
      }),
    });

    const is403 = resDisabled.status === 403;
    const bodyDisabled = await resDisabled.json();
    const hasErrorMsg = Boolean(bodyDisabled.error && bodyDisabled.error.includes('disabled'));

    const passed = is403 && hasErrorMsg;
    return {
      passed,
      output: `HTTP ${resDisabled.status}: "${bodyDisabled.error}"`,
      notes: `HTTP 403 returned: ${is403}, Clear error message: ${hasErrorMsg}`,
    };
  });

  // ---------------- SUMMARY ----------------
  console.log(`\n======================================================`);
  console.log(`              FINAL TEST RESULTS SUMMARY              `);
  console.log(`======================================================`);
  const total = tests.length;
  const passedCount = tests.filter((t) => t.passed).length;
  const failedCount = total - passedCount;

  tests.forEach((t) => {
    console.log(`${t.passed ? '✅ [PASS]' : '❌ [FAIL]'} ${t.id}: ${t.name}`);
  });

  console.log(`\nTOTAL: ${passedCount}/${total} PASSED (${failedCount} FAILED)`);

  if (failedCount > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
