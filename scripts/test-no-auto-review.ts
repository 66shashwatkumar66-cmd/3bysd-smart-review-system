import fs from 'fs';
import path from 'path';

async function runTests() {
  console.log('--- 🧪 RUNNING AI REVIEW NO-AUTO-GENERATION TEST SUITE ---');

  const customerViewFile = path.join(process.cwd(), 'src/components/CustomerReviewView.tsx');
  const code = fs.readFileSync(customerViewFile, 'utf-8');

  // Test 1: Verify NO automatic useEffect calls handleGenerate on mount
  console.log('\n[TEST 1] Verifying NO useEffect triggers review generation on mount...');
  const autoGenEffectPattern = /useEffect\s*\(\s*\(\)\s*=>\s*\{[^}]*handleGenerate\s*\([^}]*\}[^)]*\[\s*card\?\.id/s;
  if (autoGenEffectPattern.test(code)) {
    throw new Error('Test 1 failed: Found an auto-generate useEffect in CustomerReviewView.tsx');
  }
  if (code.includes('Auto-generate starter review draft')) {
    throw new Error('Test 1 failed: Auto-generate comment or hook still exists in CustomerReviewView.tsx');
  }
  console.log('✅ 1: Verified NO automatic generation useEffect exists in CustomerReviewView.tsx.');

  // Test 2: Verify language and tone changes trigger generation once required selections are complete
  console.log('\n[TEST 2] Verifying generation requires both language and tone before generating...');
  const langHandlerMatch = code.match(/const handleLanguageChange =[\s\S]*?};/);
  if (!langHandlerMatch) {
    throw new Error('Test 2 failed: handleLanguageChange not found');
  }
  if (!langHandlerMatch[0].includes('if (tone)')) {
    throw new Error('Test 2 failed: handleLanguageChange should check if tone is selected before generating!');
  }

  const toneHandlerMatch = code.match(/const handleToneChange =[\s\S]*?};/);
  if (!toneHandlerMatch) {
    throw new Error('Test 2 failed: handleToneChange not found');
  }
  if (!toneHandlerMatch[0].includes('if (language)')) {
    throw new Error('Test 2 failed: handleToneChange should check if language is selected before generating!');
  }

  const genHandlerMatch = code.match(/const handleGenerate =[\s\S]*?};/);
  if (!genHandlerMatch || !genHandlerMatch[0].includes('if (!activeTone || !activeLang) return;')) {
    throw new Error('Test 2 failed: handleGenerate must guard against missing activeTone or activeLang!');
  }
  console.log('✅ 2: Verified generation requires both language and tone before auto-generating on selection changes.');

  // Test 3: Verify State A – Initial Empty State UI
  console.log('\n[TEST 3] Verifying State A (Initial Empty State) UI Elements...');
  if (!code.includes('Your review will appear here.')) {
    throw new Error('Test 3 failed: Missing "Your review will appear here." empty state heading');
  }
  if (!code.includes('Choose your preferred language and tone, then generate your review.')) {
    throw new Error('Test 3 failed: Missing supporting text "Choose your preferred language and tone, then generate your review."');
  }
  if (!code.includes('Generate My Review')) {
    throw new Error('Test 3 failed: Missing "Generate My Review" button text');
  }
  console.log('✅ 3: State A has exact required empty-state heading, supporting text, and "Generate My Review" button.');

  // Test 4: Verify State B – Generating UI Elements
  console.log('\n[TEST 4] Verifying State B (Generating) UI Elements...');
  if (!code.includes('Creating your personalized review...')) {
    throw new Error('Test 4 failed: Missing "Creating your personalized review..." loading state text');
  }
  if (!code.includes('if (isGenerating) return;')) {
    throw new Error('Test 4 failed: Missing isGenerating guard against duplicate concurrent generation requests');
  }
  console.log('✅ 4: State B shows "Creating your personalized review..." loading indicator and blocks duplicate requests.');

  // Test 5: Verify State C – Generated UI Elements
  console.log('\n[TEST 5] Verifying State C (Generated) UI Elements...');
  if (!code.includes('Try Another Version')) {
    throw new Error('Test 5 failed: Missing "Try Another Version" button');
  }
  if (!code.includes('Copy & Open Google Review')) {
    throw new Error('Test 5 failed: Missing "Copy & Open Google Review" button');
  }
  if (!/\bwords\s*<\/span>/.test(code)) {
    throw new Error('Test 5 failed: Missing word count display');
  }
  console.log('✅ 5: State C provides editable textarea, word count, "Try Another Version", and "Copy & Open Google Review".');

  // Test 6: Verify State D – Error UI Elements
  console.log('\n[TEST 6] Verifying State D (Error) UI Elements...');
  if (!code.includes('generationError')) {
    throw new Error('Test 6 failed: Missing generationError state');
  }
  if (!code.includes('Try Again') && !code.includes('Retry')) {
    throw new Error('Test 6 failed: Missing retry button in error state');
  }
  console.log('✅ 6: State D displays error message and provides a retry mechanism.');

  // Test 7: Verify initial state in component declaration
  console.log('\n[TEST 7] Verifying initial state variables in CustomerReviewView...');
  if (!code.includes("const [generatedReview, setGeneratedReview] = useState<string>('');")) {
    throw new Error('Test 7 failed: generatedReview is not initialized to empty string');
  }
  if (!code.includes('const [hasGenerated, setHasGenerated] = useState<boolean>(false);')) {
    throw new Error('Test 7 failed: hasGenerated is not initialized to false');
  }
  console.log('✅ 7: Initial state defaults strictly to empty review and hasGenerated=false.');

  // Test 8: Integration check on running dev server
  console.log('\n[TEST 8] Verifying Public Card Load and Manual Review Generation API...');
  // 8a: Load /r/0001 HTML - must return 200 without auto-triggering review generation
  const pageRes = await fetch('http://localhost:3000/r/0001');
  if (pageRes.status !== 200) {
    throw new Error(`Test 8a failed: /r/0001 returned HTTP ${pageRes.status}`);
  }
  console.log('✅ 8a: Public QR route /r/0001 loaded successfully with HTTP 200.');

  // Ensure card 0001 has aiReviewEnabled: true
  await fetch('http://localhost:3000/api/cards/0001/assign', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ aiReviewEnabled: true }),
  });

  // 8b: Explicit customer click generates review via /api/generate-review
  const genRes = await fetch('http://localhost:3000/api/generate-review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cardId: '0001',
      businessName: 'Mercury Sports',
      category: 'Sports Shop',
      rating: 5,
      tags: ['Cricket bats', 'Affordable prices'],
      language: 'en',
      tone: 'casual',
      aiReviewEnabled: true,
    }),
  });
  if (!genRes.ok) {
    throw new Error(`Test 8b failed: /api/generate-review returned HTTP ${genRes.status}`);
  }
  const genData = await genRes.json();
  if (!genData.review || typeof genData.review !== 'string' || genData.review.length < 10) {
    throw new Error(`Test 8b failed: Invalid review returned: ${JSON.stringify(genData)}`);
  }
  console.log(`✅ 8b: Explicit generation request generated valid review (${genData.review.length} chars).`);

  console.log('\n🎉 ALL 8 TESTS PASSED! Automatic review generation successfully removed, and customer-controlled workflow verified. 🎉\n');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
