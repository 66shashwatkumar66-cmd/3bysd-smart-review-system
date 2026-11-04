import http from 'http';

function makeRequest(
  method: string,
  urlPath: string,
  data?: any,
  headers?: Record<string, string>
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const postData = data ? JSON.stringify(data) : '';
    const options: http.RequestOptions = {
      hostname: 'localhost',
      port: 3000,
      path: urlPath,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(postData) } : {}),
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode || 200, body: parsed });
        } catch {
          resolve({ status: res.statusCode || 200, body });
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (data) {
      req.write(postData);
    }
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Starting "No Pre-Selected Options – Customer Must Choose" Verification Suite...');

  // Test 1: Calling /api/generate-review without language or tone should fail with 400
  console.log('\n--- TEST 1: Backend rejects generation when language or tone is missing ---');
  const missingBothRes = await makeRequest('POST', '/api/generate-review', {
    businessName: 'Mercury Sports',
    category: 'Sports Shop',
    cardId: '0001',
  });
  console.log('Missing both status:', missingBothRes.status, missingBothRes.body);
  if (missingBothRes.status !== 400 || !missingBothRes.body.error?.includes('Select your preferred language and tone')) {
    throw new Error(`Expected HTTP 400 with selection message, got ${missingBothRes.status}`);
  }
  console.log('✅ Test 1.1 Passed: Missing language and tone correctly rejected with 400.');

  const missingToneRes = await makeRequest('POST', '/api/generate-review', {
    businessName: 'Mercury Sports',
    category: 'Sports Shop',
    cardId: '0001',
    language: 'en',
  });
  console.log('Missing tone status:', missingToneRes.status, missingToneRes.body);
  if (missingToneRes.status !== 400 || !missingToneRes.body.error?.includes('Select your preferred language and tone')) {
    throw new Error(`Expected HTTP 400 with selection message when tone missing, got ${missingToneRes.status}`);
  }
  console.log('✅ Test 1.2 Passed: Missing tone correctly rejected with 400.');

  const missingLangRes = await makeRequest('POST', '/api/generate-review', {
    businessName: 'Mercury Sports',
    category: 'Sports Shop',
    cardId: '0001',
    tone: 'enthusiastic',
  });
  console.log('Missing language status:', missingLangRes.status, missingLangRes.body);
  if (missingLangRes.status !== 400 || !missingLangRes.body.error?.includes('Select your preferred language and tone')) {
    throw new Error(`Expected HTTP 400 with selection message when language missing, got ${missingLangRes.status}`);
  }
  console.log('✅ Test 1.3 Passed: Missing language correctly rejected with 400.');

  // Test 2: When both language and tone are provided, generation succeeds
  console.log('\n--- TEST 2: Generation succeeds when both language and tone are provided ---');
  const validGenRes = await makeRequest('POST', '/api/generate-review', {
    businessName: 'Mercury Sports',
    category: 'Sports Shop',
    businessDescription: 'Cricket bats, football gear, badminton equipment',
    cardId: '0001',
    language: 'en',
    tone: 'casual',
    tags: ['Cricket bats', 'Affordable prices'],
  });
  console.log('Valid generation status:', validGenRes.status, validGenRes.body.success ? 'Success' : 'Failed');
  if (validGenRes.status !== 200 || !validGenRes.body.success || !validGenRes.body.review) {
    throw new Error(`Expected successful generation with review text, got: ${JSON.stringify(validGenRes.body)}`);
  }
  console.log('Generated review preview:', validGenRes.body.review.slice(0, 100) + '...');
  console.log('✅ Test 2 Passed: Successful generation with language, tone, and keywords.');

  // Test 3: Hinglish generation with tone selection
  console.log('\n--- TEST 3: Hinglish generation with tone selection ---');
  const hinglishGenRes = await makeRequest('POST', '/api/generate-review', {
    businessName: 'Mercury Sports',
    category: 'Sports Shop',
    businessDescription: 'Cricket bats, football gear, badminton equipment',
    cardId: '0001',
    language: 'hinglish',
    tone: 'enthusiastic',
    tags: ['Cricket kits', 'Good quality'],
  });
  if (hinglishGenRes.status !== 200 || !hinglishGenRes.body.success || !hinglishGenRes.body.review) {
    throw new Error(`Expected successful Hinglish generation, got: ${JSON.stringify(hinglishGenRes.body)}`);
  }
  console.log('Hinglish review preview:', hinglishGenRes.body.review.slice(0, 100) + '...');
  console.log('✅ Test 3 Passed: Hinglish generation operates cleanly.');

  // Test 4: Verify Card fetch and public QR scan endpoint
  console.log('\n--- TEST 4: Fetch public card details ---');
  const cardRes = await makeRequest('GET', '/api/cards/0001');
  if (cardRes.status !== 200 || !cardRes.body.card) {
    throw new Error('Failed to fetch card 0001');
  }
  console.log('Card 0001 details:', {
    businessName: cardRes.body.card.businessName,
    category: cardRes.body.card.category,
    customKeywords: cardRes.body.card.customKeywords,
  });
  console.log('✅ Test 4 Passed: Card 0001 configuration loads normally without forced selection.');

  console.log('\n🎉 ALL VERIFICATION TESTS PASSED!');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
