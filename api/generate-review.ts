import { GoogleGenAI, ThinkingLevel } from '@google/genai';

type ReviewLanguage = 'en' | 'hinglish';
type ReviewTone = 'casual' | 'warm' | 'professional' | 'enthusiastic' | 'direct';

interface GenerateReviewInput {
  businessName?: string;
  category?: string;
  businessDescription?: string;
  rating?: number;
  tags?: string[];
  keywords?: string[];
  notes?: string;
  language?: ReviewLanguage | string;
  tone?: ReviewTone | string;
  recentDrafts?: string[];
  cardId?: string;
  aiReviewEnabled?: boolean;
}

interface GenerateReviewOutput {
  success: boolean;
  review?: string;
  reviewText?: string;
  source?: 'gemini';
  message?: string;
  error?: string;
  errorCode?: string;
  toneUsed?: ReviewTone;
  languageUsed?: ReviewLanguage;
}

function computeTextSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const tokenize = (str: string) =>
    new Set(
      str
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2)
    );

  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

function getTonePromptDirective(tone: ReviewTone): string {
  switch (tone) {
    case 'warm':
      return `TONE REQUIREMENT: Warm & Appreciative.
- Style: Heartfelt, grateful, expressing genuine appreciation for thoughtful assistance and feeling cared for.
- Vocabulary: Thoughtful, welcoming phrasing (e.g. "warm hospitality", "genuinely cared", "thoughtful attention", "pleasure to visit").
- Strictly avoid cold corporate jargon or over-hyped advertising speak.`;

    case 'professional':
      return `TONE REQUIREMENT: Professional & Polished.
- Style: Clear, articulate, objective, well-structured, measured, and observant.
- Vocabulary: Professional phrasing (e.g. "impressed by prompt execution", "standards of consistency", "courteous and well-organized", "dependable establishment").
- Avoid slang, exclamation mark overuse, and informal chatter.`;

    case 'enthusiastic':
      return `TONE REQUIREMENT: Enthusiastic & Vibrant.
- Style: High energy, expressive, genuine delight and excitement.
- Vocabulary: Dynamic praise (e.g. "absolutely fantastic", "superb quality", "highlight of the week", "blown away").
- Natural excitement without all-caps screaming, emojis, or punctuation overload.`;

    case 'direct':
      return `TONE REQUIREMENT: Simple & Direct.
- Style: Concise, punchy, straight to the point. No fluff or flowery adjectives.
- Structure: 2 or 3 quick sentences covering what was good, what stood out, and the verdict.
- Word count: 30-50 words.`;

    case 'casual':
    default:
      return `TONE REQUIREMENT: Casual & Friendly.
- Style: Everyday conversational language, relaxed, approachable, natural contractions (it's, didn't, was really).
- Sounds like an authentic customer or regular recommending a spot to a friend.`;
  }
}

function getLanguagePromptDirective(language: ReviewLanguage): string {
  if (language === 'hinglish') {
    return `LANGUAGE REQUIREMENT: Hinglish (Roman-Script Hindi-English as spoken across India).
- Use natural conversational Roman-script Hindi-English (e.g., "Shopping karke achha experience raha", "Quality kaafi badhiya thi", "Staff bohot helpful tha", "Zaroor recommend karunga").
- STRICT: NEVER write in Devanagari script. Use Roman alphabet exclusively.
- Do NOT translate literally from bookish Hindi. It must sound like how real Indians casually speak and write reviews on Google Maps.
- Keep business names, brand names, product names, equipment names, and employee names in English.
- Naturally blend English nouns/adjectives with conversational Hindi verbs and connectors.`;
  }

  return `LANGUAGE REQUIREMENT: English.
- Natural, fluent English with native phrasing, correct grammar, and varied sentence lengths.
- Do not mix in foreign words unless explicitly provided in customer notes or business names.`;
}

function mapErrorCodeToStatus(errorCode?: string, errorMessage?: string): number {
  if (errorCode === 'MISSING_OPTIONS' || errorCode === 'INVALID_ARGUMENT') return 400;
  if (errorCode === 'AI_DISABLED' || errorMessage?.includes('disabled')) return 403;
  if (errorCode === 'RESOURCE_EXHAUSTED') return 429;
  if (errorCode === 'API_KEY_MISSING' || errorCode === 'API_KEY_INVALID' || errorCode === 'PERMISSION_DENIED') {
    return 503;
  }
  if (errorCode === 'TIMEOUT') return 504;
  return 502;
}

async function generateReviewServerless(input: GenerateReviewInput): Promise<GenerateReviewOutput> {
  if (input.aiReviewEnabled === false) {
    const msg = 'AI Review Assistant is disabled for this business stand.';
    return { success: false, error: msg, message: msg, errorCode: 'AI_DISABLED' };
  }

  const ratingNum = Math.min(Math.max(Number(input.rating) || 5, 1), 5);
  const rawTags = Array.isArray(input.tags)
    ? input.tags
    : Array.isArray(input.keywords)
      ? input.keywords
      : [];
  const tagsList = rawTags
    .map((t) => (typeof t === 'string' ? t.trim() : ''))
    .filter(Boolean)
    .slice(0, 25);

  const safeBusinessName = input.businessName ? String(input.businessName).trim().slice(0, 160) : 'this business';
  const safeNotes = input.notes ? String(input.notes).trim().slice(0, 400) : '';
  const safeCategory = input.category ? String(input.category).trim().slice(0, 160) : 'Local Business';
  const safeDescription = input.businessDescription
    ? String(input.businessDescription).trim().slice(0, 500)
    : '';

  const normalizedLangInput = typeof input.language === 'string' ? input.language.trim().toLowerCase() : '';
  const normalizedToneInput = typeof input.tone === 'string' ? input.tone.trim().toLowerCase() : '';

  if (!normalizedLangInput || !normalizedToneInput) {
    const msg = 'Select your preferred language and tone to generate your review.';
    return { success: false, error: msg, message: msg, errorCode: 'MISSING_OPTIONS' };
  }

  const targetLanguage: ReviewLanguage = normalizedLangInput === 'hinglish' ? 'hinglish' : 'en';
  const validTones: ReviewTone[] = ['casual', 'warm', 'professional', 'enthusiastic', 'direct'];
  const targetTone: ReviewTone = validTones.includes(normalizedToneInput as ReviewTone)
    ? (normalizedToneInput as ReviewTone)
    : 'casual';
  const recentDrafts = Array.isArray(input.recentDrafts)
    ? input.recentDrafts.filter((d): d is string => typeof d === 'string' && d.trim().length > 0).slice(0, 4)
    : [];

  const geminiApiKey = (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.API_KEY ||
    ''
  ).trim();

  if (!geminiApiKey) {
    console.error('[3DBYSD AI Serverless] Missing Gemini API key in deployment environment.');
    const msg =
      'AI review service is temporarily unavailable due to a server configuration issue. Please try again shortly or skip directly to Google.';
    return { success: false, error: msg, message: msg, errorCode: 'API_KEY_MISSING' };
  }

  const toneDirective = getTonePromptDirective(targetTone);
  const languageDirective = getLanguagePromptDirective(targetLanguage);

  const openingAngles = [
    'Lead directly with a decisive, authentic customer impression about the visit.',
    'Begin by highlighting the specific experience keywords or product quality.',
    'Start with a personal perspective on why you were pleased or what stood out.',
    'Focus on the staff assistance, efficiency, and overall attention to detail.',
    'Open with a concise verdict on overall value and experience.',
  ];
  const chosenAngle = openingAngles[Math.floor(Math.random() * openingAngles.length)];
  const randomSeed = Math.floor(Math.random() * 100000);

  let antiDuplicationDirective = '';
  if (recentDrafts.length > 0) {
    antiDuplicationDirective = `\nPREVIOUS DRAFTS ALREADY SHOWN IN THIS SESSION (DO NOT DUPLICATE):
${recentDrafts.map((d, i) => `[Draft ${i + 1}]: "${d.replace(/\n+/g, ' ')}"`).join('\n')}
MANDATORY: Write a FRESH variation. Do NOT repeat the opening clause, exact phrasing, or structure of the previous drafts. Use distinct vocabulary and rhythm.`;
  }

  const systemPrompt = `You are an expert customer review copywriter crafting an authentic, credible Google Maps review for "${safeBusinessName}".

BUSINESS IDENTITY:
- Business Name: ${safeBusinessName}
- Business Category: ${safeCategory}
- Business Offerings / Description: ${safeDescription || 'Not specified'}

${languageDirective}

${toneDirective}

CRITICAL RULES:
1. BUSINESS CATEGORY AWARENESS:
   - Tailor all vocabulary, context, and focus strictly to the business category "${safeCategory}".
   - For a Sports Shop: focus on sports equipment, fitness gear, athletic wear, pricing, and product selection.
   - For a Salon: grooming, styling, haircut, cleanliness, and consultation.
   - For a Clinic: appointment experience, staff courtesy, and facility hygiene (NEVER invent medical diagnosis or health claims).
   - For a Cafe/Restaurant: food, beverages, taste, and dining atmosphere.
   - For Retail/Shop: product quality, variety, fair pricing, and assistance.
   - STRICT: NEVER mention food, drinks, coffee, or restaurant features if the business is NOT in food/hospitality!

2. PRIMARY CONTENT SIGNAL — SELECTED KEYWORDS:
${
  tagsList.length > 0
    ? `   - The customer specifically selected these experience keywords: [${tagsList.join(', ')}].
   - MANDATORY: These selected keywords are the PRIMARY content of the review. The review MUST naturally center around these specific topics.
   - Do NOT substitute unrelated topics for the selected keywords.
   - NEVER introduce unselected products or services unless the customer explicitly mentioned them in their personal notes.
   - Smoothly combine and integrate these keywords into natural human sentences. Avoid robotic grocery-list repetition.
   - Do NOT invent false transactional details unless stated.`
    : `   - No specific keywords were selected.
   - Generate a natural, general review reflecting the business category (${safeCategory}) and overall experience. Do not invent specific unmentioned products, menu items, or false claims.`
}

3. OPTIONAL CUSTOMER DETAILS:
${
  safeNotes
    ? `   - The customer specifically added this personal detail: "${safeNotes}". You MUST naturally incorporate this actual experience into the review.`
    : '   - No personal customer notes provided. Do NOT hallucinate employee names, specific transaction details, or false incidents.'
}

4. STAR RATING SENTIMENT ALIGNMENT (${ratingNum} out of 5 Stars):
   - 5 Stars: Strongly positive, enthusiastic or warm recommendation.
   - 4 Stars: Positive and solid, happy with the visit with a slightly measured touch.
   - 3 Stars: Balanced and moderate, noting decent points alongside areas with room for refinement.
   - 2 Stars: Mostly negative / critical, reflecting any selected negative/fair keywords or general letdown without inventing dramatic incidents.
   - 1 Star: Negative and dissatisfied, expressing disappointment in a measured, realistic customer voice without fabricating dramatic false events.

5. DIVERSITY & ANTI-CLICHÉ:
   - Diverse Opening: ${chosenAngle}
   - Ban Formulaic Openings: Do NOT start with "I recently visited...", "Look no further than...", "From the moment I walked in...", or "As someone who...".
   - Ban Predictable Endings: Do not end every review with "Highly recommend!" or "Will definitely be back!". Mix up closing thoughts naturally.
   - Sentence Variation: Mix short and medium sentences.
   - Word Count: 35 to 80 words (roughly 2 to 4 sentences).
   - Clean Output: Output ONLY the plain text of the review. No quotes, no markdown, no emojis, no introductory commentary.${antiDuplicationDirective}`;

  const userPrompt = `Draft an authentic, natural ${ratingNum}-star ${targetTone} customer review in ${targetLanguage === 'hinglish' ? 'conversational Hinglish (Roman script)' : 'English'} for "${safeBusinessName}" (${safeCategory}).
${safeDescription ? `Business Context: ${safeDescription}` : ''}
${tagsList.length > 0 ? `Selected Highlights to include: ${tagsList.join(', ')}` : 'Selected Highlights: None (general experience review)'}
${safeNotes ? `Customer Personal Detail: "${safeNotes}"` : ''}
Random variation seed: ${randomSeed}.`;

  try {
    const ai = new GoogleGenAI({
      apiKey: geminiApiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const callGeminiModel = async (modelName: string, timeoutMs: number): Promise<string> => {
      const config: Record<string, any> = {
        systemInstruction: systemPrompt,
      };
      if (modelName === 'gemini-4-hydrogen') {
        config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
      }

      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      try {
        const geminiPromise = ai.models.generateContent({
          model: modelName,
          contents: userPrompt,
          config,
        });
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error('AI review generation timed out. Please try again.')),
            timeoutMs
          );
        });
        const response = await Promise.race([geminiPromise, timeoutPromise]);
        const rawText = typeof response?.text === 'string' ? response.text : '';
        return rawText.trim().replace(/^["'`]+|["'`]+$/g, '').trim();
      } finally {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
        }
      }
    };

    const isTransientError = (err: any): boolean => {
      const status = Number(err?.status || err?.code || 0);
      const msg = String(err?.message || '');
      return (
        status === 503 ||
        status === 502 ||
        status === 504 ||
        status === 429 ||
        status === 500 ||
        status === 404 ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('DEADLINE_EXCEEDED') ||
        msg.includes('timed out') ||
        msg.includes('fetch failed')
      );
    };

    const callWithResilience = async (fastOnly: boolean = false): Promise<string> => {
      if (fastOnly) {
        return await callGeminiModel('gemini-3.1-flash-lite', 9000);
      }

      const raceHedged = (): Promise<string> =>
        new Promise((resolve, reject) => {
          let settled = false;
          let hedgeStarted = false;
          let completedCount = 0;
          let totalLaunched = 1;
          let lastError: any = null;
          let hedgeTimer: ReturnType<typeof setTimeout> | undefined;

          const cleanup = () => {
            if (hedgeTimer !== undefined) {
              clearTimeout(hedgeTimer);
              hedgeTimer = undefined;
            }
          };

          const finishSuccess = (text: string) => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(text);
          };

          const onAttemptDone = (err?: any) => {
            completedCount++;
            if (err) {
              lastError = err;
              if (!isTransientError(err)) {
                if (!settled) {
                  settled = true;
                  cleanup();
                  reject(err);
                }
                return;
              }
              if (!hedgeStarted && !settled) {
                startHedge();
                return;
              }
            }
            if (!settled && completedCount >= totalLaunched && hedgeStarted) {
              settled = true;
              cleanup();
              if (lastError) reject(lastError);
              else resolve('');
            }
          };

          const startHedge = () => {
            if (hedgeStarted || settled) return;
            hedgeStarted = true;
            totalLaunched = 2;
            cleanup();
            callGeminiModel('gemini-4-hydrogen', 13000)
              .then((text) => {
                if (text) finishSuccess(text);
                else onAttemptDone(new Error('Empty response from fallback model'));
              })
              .catch((err) => onAttemptDone(err));
          };

          hedgeTimer = setTimeout(startHedge, 4500);

          callGeminiModel('gemini-3.1-flash-lite', 13000)
            .then((text) => {
              if (text) finishSuccess(text);
              else onAttemptDone(new Error('Empty response from primary model'));
            })
            .catch((err) => onAttemptDone(err));
        });

      try {
        const text = await raceHedged();
        if (text) return text;
      } catch (err: any) {
        if (!isTransientError(err)) {
          throw err;
        }
        await new Promise((r) => setTimeout(r, 350));
        return await callGeminiModel('gemini-3.1-flash-lite', 9000);
      }

      return '';
    };

    const startedAt = Date.now();
    let candidateReview = await callWithResilience(false);

    if (candidateReview && recentDrafts.length > 0 && Date.now() - startedAt < 10000) {
      const isTooSimilar = recentDrafts.some((draft) => computeTextSimilarity(candidateReview, draft) > 0.72);
      if (isTooSimilar) {
        try {
          const alt = await callWithResilience(true);
          if (alt) candidateReview = alt;
        } catch {
          // Keep valid first candidate
        }
      }
    }

    if (candidateReview) {
      return {
        success: true,
        review: candidateReview,
        reviewText: candidateReview,
        source: 'gemini',
        toneUsed: targetTone,
        languageUsed: targetLanguage,
      };
    }

    const emptyMsg = 'The AI service returned an empty draft. Please tap Try Again.';
    return { success: false, error: emptyMsg, message: emptyMsg, errorCode: 'EMPTY_RESPONSE' };
  } catch (geminiError: any) {
    const status = Number(geminiError?.status || geminiError?.code || 0);
    const rawMsg = String(geminiError?.message || '');
    console.error('[3DBYSD AI Serverless] Gemini generation failed:', status || 'unknown', rawMsg);

    if (rawMsg.includes('timed out') || rawMsg.includes('DEADLINE_EXCEEDED') || status === 504) {
      const msg = 'Review generation timed out. Please tap Try Again.';
      return { success: false, error: msg, message: msg, errorCode: 'TIMEOUT' };
    }
    if (
      status === 403 ||
      rawMsg.includes('PERMISSION_DENIED') ||
      rawMsg.includes('API_KEY_INVALID') ||
      rawMsg.includes('API key not valid')
    ) {
      const msg =
        'AI review service is temporarily unavailable due to a server configuration issue. Please try again shortly or skip directly to Google.';
      return {
        success: false,
        error: msg,
        message: msg,
        errorCode: rawMsg.includes('API_KEY') ? 'API_KEY_INVALID' : 'PERMISSION_DENIED',
      };
    }
    if (status === 404 || rawMsg.includes('NOT_FOUND')) {
      const msg = 'The AI review service is temporarily unavailable. Please tap Try Again in a moment.';
      return { success: false, error: msg, message: msg, errorCode: 'MODEL_NOT_FOUND' };
    }
    if (status === 429 || rawMsg.includes('RESOURCE_EXHAUSTED')) {
      const msg = 'The AI review service is busy right now. Please wait a few seconds and tap Try Again.';
      return { success: false, error: msg, message: msg, errorCode: 'RESOURCE_EXHAUSTED' };
    }
    if (status === 400 || rawMsg.includes('INVALID_ARGUMENT')) {
      const msg = 'Unable to process the selected review options. Please adjust your selection and tap Try Again.';
      return { success: false, error: msg, message: msg, errorCode: 'INVALID_ARGUMENT' };
    }
    const msg = 'The AI review service is temporarily unavailable. Please tap Try Again in a moment.';
    return {
      success: false,
      error: msg,
      message: msg,
      errorCode: status ? `HTTP_${status}` : 'UPSTREAM_ERROR',
    };
  }
}

/**
 * Self-contained Vercel Serverless Function handler for POST /api/generate-review.
 * Uses zero cross-directory relative imports so Node.js ESM ("type": "module") never fails
 * with ERR_MODULE_NOT_FOUND on serverless cold starts.
 */
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    const msg = `Method ${req.method} Not Allowed. Please send a POST request.`;
    return res.status(405).json({
      success: false,
      error: msg,
      message: msg,
      errorCode: 'METHOD_NOT_ALLOWED',
    });
  }

  try {
    let body: any = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        const msg = 'Invalid JSON request body.';
        return res.status(400).json({
          success: false,
          error: msg,
          message: msg,
          errorCode: 'INVALID_JSON',
        });
      }
    }

    const result = await generateReviewServerless(body && typeof body === 'object' ? body : {});
    if (!result.success) {
      const statusCode = mapErrorCodeToStatus(result.errorCode, result.error);
      return res.status(statusCode).json(result);
    }

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('[3DBYSD AI Serverless] Unhandled error in /api/generate-review:', error?.message || error);
    const msg = 'The AI review service encountered a temporary error. Please tap Try Again.';
    return res.status(502).json({
      success: false,
      error: msg,
      message: msg,
      errorCode: 'SERVER_ERROR',
    });
  }
}
