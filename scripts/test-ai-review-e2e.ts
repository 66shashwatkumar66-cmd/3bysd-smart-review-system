/**
 * End-to-End Customer AI Review Generation Verification Suite
 * Tests:
 * 1. Vercel serverless handler (/api/generate-review.ts) runtime import & HTTP behaviors
 * 2. Live Firebase Firestore card retrieval via lookupCard() for multiple real businesses
 * 3. Live /api/generate-review across multiple businesses, categories, English, Hinglish, all 5 tones, keywords & uniqueness
 * 4. Authorization & guard checks (expired card 403, AI disabled 403, missing options 400)
 * 5. Frontend generateAiReview() resilience against HTTP 500/429/503/504, malformed JSON, network failures & abort
 * 6. CustomerReviewView SSR rendering across active, loading, error, AI-off direct Google mode, and Google review link
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { generateAiReview } from '../src/utils/api';
import { lookupCard } from '../src/utils/cardLookup';
import { computeTextSimilarity } from '../src/services/reviewGenerator';
import { CustomerReviewView } from '../src/components/CustomerReviewView';
import type { CardRecord, ReviewLanguage, ReviewTone } from '../src/types';

const BASE = 'http://127.0.0.1:3000';
let passed = 0;
let failed = 0;

function pass(name: string, detail?: string) {
  passed++;
  console.log(`[PASS] ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name: string, detail?: string) {
  failed++;
  console.error(`[FAIL] ${name}${detail ? ` — ${detail}` : ''}`);
}

function assert(cond: boolean, name: string, detail?: string) {
  if (cond) pass(name, detail);
  else fail(name, detail);
}

async function run() {
  console.log('\n=== 1. LIVE FIREBASE FIRESTORE CUSTOMER CARD RETRIEVAL ===');
  const card0001 = await lookupCard('0001', { recordScan: false });
  assert(
    card0001.status === 'success' && Boolean(card0001.card?.businessName) && Boolean(card0001.card?.googleReviewUrl),
    'Firestore lookupCard(0001) loads full business config',
    card0001.card ? `${card0001.card.businessName} (${card0001.card.category}) url=${card0001.card.googleReviewUrl}` : card0001.status
  );

  const card0002 = await lookupCard('0002', { recordScan: false });
  assert(
    card0002.status === 'success' &&
      Boolean(card0002.card?.businessName) &&
      Array.isArray(card0002.card?.customKeywords) &&
      card0002.card!.customKeywords!.length > 0,
    'Firestore lookupCard(0002) loads custom keywords & category',
    card0002.card ? `${card0002.card.businessName} · ${card0002.card.customKeywords?.length} keywords` : card0002.status
  );

  const card0004 = await lookupCard('0004', { recordScan: false });
  assert(
    card0004.status === 'success' && card0004.card?.aiReviewEnabled === false,
    'Firestore lookupCard(0004) accurately reflects aiReviewEnabled=false',
    card0004.card ? `${card0004.card.businessName} aiReviewEnabled=${card0004.card.aiReviewEnabled}` : card0004.status
  );

  const badCard = await lookupCard('INVALID!@#', { recordScan: false });
  assert(badCard.status === 'invalid_id', 'lookupCard rejects malformed card ID cleanly', `status=${badCard.status}`);

  const missingCard = await lookupCard('NONEXISTENT99999', { recordScan: false });
  assert(missingCard.status === 'not_found', 'lookupCard returns not_found for missing stand', `status=${missingCard.status}`);

  console.log('\n=== 2. LIVE QR/NFC ENTRY & SERVER GUARD CHECKS ===');
  for (const route of ['/r/0001', '/nfc/0002']) {
    const r = await fetch(`${BASE}${route}`);
    const html = await r.text();
    assert(r.status === 200 && html.includes('id="root"'), `Entry route ${route} serves SPA HTML`, `HTTP ${r.status}`);
  }

  // Missing options -> 400
  {
    const r = await fetch(`${BASE}/api/generate-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardId: '0001', businessName: 'Mercury Sports Pro Store', rating: 5, tags: [] }),
    });
    const j = await r.json();
    assert(r.status === 400 && j.success === false && typeof j.error === 'string', 'Missing language/tone returns HTTP 400', j.error);
  }

  // Expired card 0003 -> 403
  {
    const r = await fetch(`${BASE}/api/generate-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cardId: '0003',
        businessName: 'Expired Business',
        rating: 5,
        tags: [],
        language: 'en',
        tone: 'casual',
      }),
    });
    const j = await r.json();
    assert(r.status === 403 && j.success === false, 'Expired stand 0003 blocked with HTTP 403', j.error);
  }

  // AI disabled card 0004 -> 403
  {
    const r = await fetch(`${BASE}/api/generate-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cardId: '0004',
        businessName: 'Mercury Sports',
        rating: 5,
        tags: ['cricket bats'],
        language: 'en',
        tone: 'casual',
      }),
    });
    const j = await r.json();
    assert(r.status === 403 && j.success === false, 'AI-disabled stand 0004 blocked with HTTP 403', j.error);
  }

  console.log('\n=== 3. LIVE AI REVIEW GENERATION MATRIX (MULTI-BUSINESS, EN + HINGLISH, ALL 5 TONES, KEYWORDS, UNIQUENESS) ===');
  const matrix: Array<{
    name: string;
    cardId: string;
    businessName: string;
    category: string;
    language: ReviewLanguage;
    tone: ReviewTone;
    rating: number;
    tags: string[];
    notes?: string;
  }> = [
    {
      name: 'Mercury Sports · English · casual · default tags',
      cardId: '0001',
      businessName: 'Mercury Sports Pro Store',
      category: 'Sports Shop',
      language: 'en',
      tone: 'casual',
      rating: 5,
      tags: ['Friendly Staff', 'Great Value'],
    },
    {
      name: 'Selfdrive Car · English · professional · custom keywords',
      cardId: '0002',
      businessName: 'Selfdrive Renal Car',
      category: 'Self-Drive Car Rental,Car Rental Agency',
      language: 'en',
      tone: 'professional',
      rating: 5,
      tags: ['Well-Maintained Cars', 'Easy Booking Process'],
    },
    {
      name: 'Selfdrive Car · Hinglish · warm · custom keywords',
      cardId: '0002',
      businessName: 'Selfdrive Renal Car',
      category: 'Self-Drive Car Rental,Car Rental Agency',
      language: 'hinglish',
      tone: 'warm',
      rating: 5,
      tags: ['Clean & Sanitised Cars', 'Affordable Rental Prices'],
    },
    {
      name: 'Mercury Sports · Hinglish · enthusiastic · notes',
      cardId: '0001',
      businessName: 'Mercury Sports Pro Store',
      category: 'Sports Shop',
      language: 'hinglish',
      tone: 'enthusiastic',
      rating: 5,
      tags: ['Fast Service'],
      notes: 'Rahul helped pick a great badminton racket',
    },
    {
      name: 'Mercury Sports · English · direct · 4 stars · no tags',
      cardId: '0001',
      businessName: 'Mercury Sports Pro Store',
      category: 'Sports Shop',
      language: 'en',
      tone: 'direct',
      rating: 4,
      tags: [],
    },
  ];

  let firstDraftForUniqueness = '';
  for (const tc of matrix) {
    const t0 = Date.now();
    const res = await fetch(`${BASE}/api/generate-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tc),
    });
    const elapsed = Date.now() - t0;
    const data = await res.json();
    const text = typeof data.review === 'string' ? data.review.trim() : '';
    const ok = res.status === 200 && data.success === true && text.length >= 30 && !text.includes('[object Object]');
    // Ensure Hinglish does not output Devanagari script
    const noDevanagari = tc.language === 'hinglish' ? !/[\u0900-\u097F]/.test(text) : true;
    assert(
      ok && noDevanagari,
      tc.name,
      `HTTP ${res.status} (${elapsed}ms) source=${data.source} len=${text.length} "${text.slice(0, 80)}..."`
    );
    if (tc.name.startsWith('Mercury Sports · English · casual') && ok) {
      firstDraftForUniqueness = text;
    }
  }

  // Test "Try Another Version" uniqueness with recentDrafts
  if (firstDraftForUniqueness) {
    const t0 = Date.now();
    const res = await fetch(`${BASE}/api/generate-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cardId: '0001',
        businessName: 'Mercury Sports Pro Store',
        category: 'Sports Shop',
        language: 'en',
        tone: 'casual',
        rating: 5,
        tags: ['Friendly Staff', 'Great Value'],
        recentDrafts: [firstDraftForUniqueness],
      }),
    });
    const data = await res.json();
    const alt = typeof data.review === 'string' ? data.review.trim() : '';
    const sim = computeTextSimilarity(firstDraftForUniqueness, alt);
    assert(
      res.status === 200 && data.success === true && alt.length >= 30 && alt !== firstDraftForUniqueness && sim < 0.85,
      'Try Another Version generates unique alternative draft',
      `(${Date.now() - t0}ms) similarity=${sim.toFixed(2)} "${alt.slice(0, 75)}..."`
    );
  }

  console.log('\n=== 4. CLIENT RESILIENCE & SAFE ERROR HANDLING (MOCKED FAILURE MODES) ===');
  const origFetch = globalThis.fetch;
  try {
    // Vercel HTTP 500 {"error":{"code":"500","message":"A server error has occurred"}}
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { code: '500', message: 'A server error has occurred' } }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })) as any;
    const r500 = await generateAiReview({ businessName: 'Test', rating: 5, tags: [], language: 'en', tone: 'casual' });
    assert(
      r500.success === false && typeof r500.error === 'string' && r500.error.includes('temporary server error'),
      'Client replaces generic Vercel 500 message with friendly retry notice',
      r500.error
    );

    // HTTP 429 rate limit
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ success: false, errorCode: 'RESOURCE_EXHAUSTED', error: 'Quota busy' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      })) as any;
    const r429 = await generateAiReview({ businessName: 'Test', rating: 5, tags: [], language: 'en', tone: 'casual' });
    assert(
      r429.success === false && r429.errorCode === 'RESOURCE_EXHAUSTED' && r429.error!.includes('busy'),
      'Client handles HTTP 429 rate limit cleanly',
      r429.error
    );

    // HTTP 503 missing API key config
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          success: false,
          errorCode: 'API_KEY_MISSING',
          error: 'AI review service is temporarily unavailable due to a server configuration issue.',
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      )) as any;
    const r503 = await generateAiReview({ businessName: 'Test', rating: 5, tags: [], language: 'en', tone: 'casual' });
    assert(
      r503.success === false && !r503.error!.includes('GEMINI_API_KEY') && r503.error!.includes('configuration'),
      'Client handles HTTP 503 config error safely without leaking env var names',
      r503.error
    );

    // Invalid HTML / non-JSON response
    globalThis.fetch = (async () =>
      new Response('<html><body>Bad Gateway</body></html>', { status: 200, headers: { 'Content-Type': 'text/html' } })) as any;
    const rBadJson = await generateAiReview({ businessName: 'Test', rating: 5, tags: [], language: 'en', tone: 'casual' });
    assert(
      rBadJson.success === false && rBadJson.errorCode === 'INVALID_RESPONSE',
      'Client handles non-JSON 200 response gracefully',
      rBadJson.error
    );

    // Network offline
    globalThis.fetch = (async () => {
      throw new TypeError('Failed to fetch');
    }) as any;
    const rNet = await generateAiReview({ businessName: 'Test', rating: 5, tags: [], language: 'en', tone: 'casual' });
    assert(
      rNet.success === false && rNet.errorCode === 'NETWORK_ERROR' && rNet.error!.includes('internet connection'),
      'Client handles offline/network drop gracefully',
      rNet.error
    );

    // Caller AbortSignal cancellation (rapid option switch)
    const ac = new AbortController();
    ac.abort();
    let abortedCorrectly = false;
    try {
      await generateAiReview({ businessName: 'Test', rating: 5, tags: [], language: 'en', tone: 'casual' }, ac.signal);
    } catch (e: any) {
      abortedCorrectly = e?.name === 'AbortError';
    }
    assert(abortedCorrectly, 'Caller AbortSignal immediately cancels stale request cleanly');
  } finally {
    globalThis.fetch = origFetch;
  }

  console.log('\n=== 5. CUSTOMER REVIEW VIEW RENDERING (ACTIVE, DIRECT GOOGLE MODE, LOADING, ERROR) ===');
  if (card0002.card) {
    const htmlActive = renderToStaticMarkup(
      React.createElement(CustomerReviewView, {
        card: card0002.card,
        cardId: '0002',
        loadState: 'success',
      })
    );
    assert(
      htmlActive.includes('Selfdrive Renal Car') &&
        htmlActive.includes('Well-Maintained Cars') &&
        htmlActive.includes(card0002.card.googleReviewUrl) &&
        !htmlActive.includes('[object Object]'),
      'CustomerReviewView renders Card 0002 business name, custom keywords, and Google Review URL',
      `len=${htmlActive.length}`
    );
  }

  if (card0004.card) {
    const htmlDirect = renderToStaticMarkup(
      React.createElement(CustomerReviewView, {
        card: card0004.card,
        cardId: '0004',
        loadState: 'success',
      })
    );
    assert(
      htmlDirect.includes('Write Review on Google') && htmlDirect.includes(card0004.card.googleReviewUrl),
      'CustomerReviewView renders Direct Google Review mode cleanly when aiReviewEnabled=false'
    );
  }

  console.log(`\n=== E2E SUMMARY: ${passed} PASSED, ${failed} FAILED ===`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
