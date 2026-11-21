/**
 * Verification Suite: React Error #31 Fix on Customer Review Generation Page
 *
 * Tests:
 * 1. Exact reproduction of `{ code, message }` error objects in HTTP error & 200 JSON payloads
 * 2. Normalization of unexpected / object-shaped AI responses (never renders raw object or "[object Object]")
 * 3. Real React rendering (`renderToStaticMarkup`) of CustomerReviewView in loading, error, and active states
 * 4. Live end-to-end customer review-generation flow against running server (English, Hinglish, tones, keywords, option changes, error handling)
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  extractErrorMessage,
  extractReviewText,
  normalizeGenerateReviewResponse,
  generateAiReview,
} from '../src/utils/api';
import { CustomerReviewView } from '../src/components/CustomerReviewView';
import { CardRecord } from '../src/types';

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, detail: string) {
  if (condition) {
    passed++;
    console.log(`[PASS] ${name} — ${detail}`);
  } else {
    failed++;
    console.error(`[FAIL] ${name} — ${detail}`);
  }
}

async function run() {
  console.log('\n=== React Error #31 Fix & Customer Review Flow Verification ===\n');

  // -------------------------------------------------------------------------
  // 1. Exact Reproduction: `{ code, message }` Error Payloads
  // -------------------------------------------------------------------------
  const errObj = { code: '504', message: 'An error occurred with your deployment' };
  const extracted1 = extractErrorMessage(errObj, 'Fallback');
  assert(
    'extractErrorMessage handles {code, message} object',
    typeof extracted1 === 'string' && extracted1 === 'An error occurred with your deployment',
    `result="${extracted1}"`
  );

  const nestedErrObj = { error: { code: 500, message: 'Server busy, please retry' } };
  const extracted2 = extractErrorMessage(nestedErrObj, 'Fallback');
  assert(
    'extractErrorMessage handles nested {error: {code, message}}',
    typeof extracted2 === 'string' && extracted2 === 'Server busy, please retry',
    `result="${extracted2}"`
  );

  const codeOnlyObj = { code: '504' };
  const extracted3 = extractErrorMessage(codeOnlyObj, 'Fallback error');
  assert(
    'extractErrorMessage handles {code} without message (no [object Object])',
    typeof extracted3 === 'string' && extracted3 === 'Fallback error' && !extracted3.includes('[object Object]'),
    `result="${extracted3}"`
  );

  // Mock fetch returning Vercel-style 504 { error: { code, message } }
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ error: { code: 'FUNCTION_INVOCATION_TIMEOUT', message: 'Function timed out' } }),
        { status: 504, headers: { 'Content-Type': 'application/json' } }
      )) as any;

    const res504 = await generateAiReview({
      businessName: 'Mercury Sports',
      rating: 5,
      tags: ['Great Quality'],
      language: 'en',
      tone: 'warm',
    });
    assert(
      'generateAiReview normalizes HTTP 504 {error: {code, message}} to string',
      res504.success === false &&
        typeof res504.error === 'string' &&
        typeof res504.message === 'string' &&
        res504.error === 'Function timed out',
      `error=${JSON.stringify(res504.error)}`
    );

    // Mock fetch returning HTTP 200 with object-shaped review
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ success: true, review: { text: 'Fantastic shop with super helpful staff!' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )) as any;

    const resObjReview = await generateAiReview({
      businessName: 'Mercury Sports',
      rating: 5,
      tags: ['Helpful Staff'],
      language: 'en',
      tone: 'casual',
    });
    assert(
      'generateAiReview extracts string from object-shaped review {text}',
      resObjReview.success === true &&
        typeof resObjReview.review === 'string' &&
        resObjReview.review === 'Fantastic shop with super helpful staff!',
      `review="${resObjReview.review}"`
    );

    // Mock fetch returning HTTP 200 with malformed review object containing no text
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ success: true, review: { code: 'ERR', unexpected: 123 } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )) as any;

    const resMalformed = await generateAiReview({
      businessName: 'Mercury Sports',
      rating: 5,
      tags: [],
      language: 'en',
      tone: 'direct',
    });
    assert(
      'generateAiReview gracefully rejects malformed review object (no [object Object])',
      resMalformed.success === false &&
        typeof resMalformed.error === 'string' &&
        !resMalformed.error.includes('[object Object]') &&
        resMalformed.error.length > 10,
      `error="${resMalformed.error}"`
    );

    // Mock fetch returning HTTP 200 with { success: false, error: { code, message } }
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ success: false, error: { code: 'QUOTA', message: 'Too many requests right now.' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )) as any;

    const res200ErrObj = await generateAiReview({
      businessName: 'Mercury Sports',
      rating: 5,
      tags: [],
      language: 'hinglish',
      tone: 'warm',
    });
    assert(
      'generateAiReview normalizes HTTP 200 {success: false, error: {code, message}}',
      res200ErrObj.success === false &&
        typeof res200ErrObj.error === 'string' &&
        res200ErrObj.error === 'Too many requests right now.',
      `error="${res200ErrObj.error}"`
    );

    // Mock fetch returning raw Gemini candidates shape
    const geminiShape = normalizeGenerateReviewResponse({
      success: true,
      review: {
        candidates: [{ content: { parts: [{ text: 'Great products and fast service.' }] } }],
      },
    });
    assert(
      'normalizeGenerateReviewResponse extracts Gemini candidates shape',
      geminiShape.success === true && geminiShape.review === 'Great products and fast service.',
      `review="${geminiShape.review}"`
    );

    // extractReviewText rejects literal "[object Object]"
    assert(
      'extractReviewText rejects "[object Object]"',
      extractReviewText('[object Object]') === '' && extractReviewText({ foo: 'bar' }) === '',
      'returns empty string cleanly'
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  // -------------------------------------------------------------------------
  // 2. React SSR Render Checks (Guarantees zero React Error #31 in JSX)
  // -------------------------------------------------------------------------
  const sampleCard: CardRecord = {
    id: '0001',
    status: 'assigned',
    businessName: 'Mercury Sports Pro Store',
    category: 'Sports Store',
    googleReviewUrl: 'https://g.page/r/example/review',
    notes: '',
    aiReviewEnabled: true,
    customKeywords: ['Great Quality', 'Helpful Staff', { text: 'Fast Service' } as any],
    scansCount: 113,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-11-20T00:00:00.000Z',
  };

  try {
    const htmlActive = renderToStaticMarkup(
      React.createElement(CustomerReviewView, {
        card: sampleCard,
        cardId: '0001',
        loadState: 'success',
      })
    );
    assert(
      'CustomerReviewView renders active state without React Error #31',
      htmlActive.includes('Mercury Sports Pro Store') &&
        htmlActive.includes('Fast Service') &&
        !htmlActive.includes('[object Object]'),
      `renderedLen=${htmlActive.length}`
    );

    const htmlLoading = renderToStaticMarkup(
      React.createElement(CustomerReviewView, {
        card: null,
        cardId: '0001',
        loadState: 'loading',
      })
    );
    assert(
      'CustomerReviewView renders loading state cleanly',
      htmlLoading.includes('Connecting to Google Reviews'),
      `renderedLen=${htmlLoading.length}`
    );

    // Pass an object `{ code, message }` as errorMessage prop to confirm defensive rendering
    const htmlError = renderToStaticMarkup(
      React.createElement(CustomerReviewView, {
        card: null,
        cardId: '0001',
        loadState: 'error',
        errorMessage: { code: 'NETWORK_ERR', message: 'Temporary connection issue' } as any,
      })
    );
    assert(
      'CustomerReviewView renders object errorMessage safely without React Error #31',
      htmlError.includes('Temporary connection issue') && !htmlError.includes('[object Object]'),
      `containsExpectedMessage=true`
    );
  } catch (renderErr: any) {
    assert('CustomerReviewView SSR render', false, renderErr?.message || String(renderErr));
  }

  // -------------------------------------------------------------------------
  // 3. Live End-to-End Customer Flow Against Running Server
  // -------------------------------------------------------------------------
  try {
    const pageRes = await fetch(`${BASE_URL}/r/0001`);
    const pageHtml = await pageRes.text();
    assert(
      'Live QR route /r/0001 loads HTML cleanly',
      pageRes.status === 200 && pageHtml.includes('<div id="root">'),
      `status=${pageRes.status}`
    );

    const cardRes = await fetch(`${BASE_URL}/api/cards/0001`);
    const cardJson = await cardRes.json();
    const card = cardJson.card || cardJson;
    assert(
      'Live business config loads for Stand #0001',
      cardRes.status === 200 && typeof card.businessName === 'string' && card.businessName.length > 0,
      `businessName="${card.businessName}"`
    );

    // Test English + Hinglish + different tones + keyword combinations
    const scenarios = [
      {
        label: 'English · Casual · 2 keywords',
        payload: {
          cardId: '0001',
          businessName: card.businessName,
          category: card.category || 'Sports Store',
          rating: 5,
          tags: ['Great Quality', 'Helpful Staff'],
          language: 'en' as const,
          tone: 'casual' as const,
        },
      },
      {
        label: 'English · Professional · 1 keyword',
        payload: {
          cardId: '0001',
          businessName: card.businessName,
          category: card.category || 'Sports Store',
          rating: 4,
          tags: ['Value for Money'],
          language: 'en' as const,
          tone: 'professional' as const,
        },
      },
      {
        label: 'Hinglish · Warm · 2 keywords (Tea Paradise)',
        payload: {
          cardId: '0064',
          businessName: 'Tea Paradise',
          category: 'Cafe',
          rating: 5,
          tags: ['Fresh Tea', 'Cozy Ambience'],
          language: 'hinglish' as const,
          tone: 'warm' as const,
        },
      },
    ];

    for (const sc of scenarios) {
      const res = await fetch(`${BASE_URL}/api/generate-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sc.payload),
      });
      const json = await res.json();
      const normalized = normalizeGenerateReviewResponse(json);
      const safeTypes =
        (normalized.review === undefined || typeof normalized.review === 'string') &&
        (normalized.error === undefined || typeof normalized.error === 'string') &&
        (normalized.message === undefined || typeof normalized.message === 'string');

      assert(
        `Live AI flow (${sc.label})`,
        safeTypes &&
          ((res.ok && normalized.success && typeof normalized.review === 'string' && normalized.review.length >= 20) ||
            (!res.ok && normalized.success === false && typeof normalized.error === 'string' && normalized.error.length > 0)),
        res.ok
          ? `status=${res.status}, len=${normalized.review?.length}, preview="${normalized.review?.slice(0, 60)}..."`
          : `status=${res.status}, safeError="${normalized.error}"`
      );
    }

    // Missing options -> HTTP 400 with clean string error
    const badRes = await fetch(`${BASE_URL}/api/generate-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessName: 'Mercury Sports', rating: 5, tags: [] }),
    });
    const badJson = await badRes.json();
    const badNorm = normalizeGenerateReviewResponse(badJson);
    assert(
      'Live missing options returns HTTP 400 with string error',
      badRes.status === 400 && badNorm.success === false && typeof badNorm.error === 'string',
      `status=${badRes.status}, error="${badNorm.error}"`
    );
  } catch (liveErr: any) {
    assert('Live server E2E checks', false, liveErr?.message || String(liveErr));
  }

  console.log(`\n=== SUMMARY: ${passed} PASSED, ${failed} FAILED ===\n`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
