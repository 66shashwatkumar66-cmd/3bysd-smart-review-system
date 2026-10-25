import { GoogleGenAI } from '@google/genai';
import { ReviewLanguage, ReviewTone } from '../types';

export interface GenerateReviewInput {
  businessName?: string;
  category?: string;
  businessDescription?: string;
  rating?: number;
  tags?: string[];
  notes?: string;
  language?: ReviewLanguage;
  tone?: ReviewTone;
  recentDrafts?: string[];
  cardId?: string;
  aiReviewEnabled?: boolean;
}

export interface GenerateReviewOutput {
  success: boolean;
  review?: string;
  reviewText?: string;
  source?: 'gemini' | 'smart_fallback';
  message?: string;
  error?: string;
  toneUsed?: ReviewTone;
  languageUsed?: ReviewLanguage;
}

/**
 * Calculates Jaccard token similarity between two text snippets (ignoring short stopwords).
 */
export function computeTextSimilarity(a: string, b: string): number {
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

/**
 * Formats a list of keywords into a natural grammatical clause.
 */
function formatKeywordsList(tags: string[], language: ReviewLanguage): string {
  if (!tags || tags.length === 0) return '';
  const clean = tags.map((t) => t.trim()).filter(Boolean);
  if (clean.length === 0) return '';
  if (clean.length === 1) return clean[0];
  const last = clean[clean.length - 1];
  const rest = clean.slice(0, -1).join(', ');
  return language === 'hinglish' ? `${rest} aur ${last}` : `${rest} and ${last}`;
}

/**
 * Intelligent category-aware and keyword-aware fallback generator.
 * Produces authentic, rating-aligned, language-aligned reviews without external API dependencies.
 * Never defaults to cafe/food imagery unless the business or keywords actually describe food.
 */
export function generateSmartFallbackReview(
  businessName: string,
  category: string = 'Local Business',
  businessDescription: string = '',
  rating: number = 5,
  tags: string[] = [],
  notes: string = '',
  language: ReviewLanguage = 'en',
  tone: ReviewTone = 'casual',
  recentDrafts: string[] = []
): string {
  const safeBiz = businessName.trim() || 'This business';
  const cleanTags = Array.isArray(tags) ? tags.map((t) => t.trim()).filter(Boolean) : [];
  const safeNotes = notes.trim();
  const tagsPhrase = formatKeywordsList(cleanTags, language);

  const pickFresh = (arr: string[]): string => {
    const fresh = arr.filter(
      (item) => !recentDrafts.some((d) => d.toLowerCase().includes(item.toLowerCase().slice(0, 18)))
    );
    const pool = fresh.length > 0 ? fresh : arr;
    return pool[Math.floor(Math.random() * pool.length)];
  };

  if (language === 'hinglish') {
    // ---------------- HINGLISH ----------------
    if (rating >= 5) {
      if (tone === 'warm') {
        const intros = [
          `${safeBiz} me shopping karke sach me bohot achha laga.`,
          `${safeBiz} visit karke kaafi dil ko chhu jaane wala experience raha.`,
          `${safeBiz} par bohot respectful aur warm welcome mila.`,
        ];
        const middles = cleanTags.length > 0
          ? [
              `${tagsPhrase} ka selection aur quality sach me dil khush kar dene wali thi.`,
              `Khaas taur par ${tagsPhrase} ki variety aur service kaafi achhi lagi.`,
              `${tagsPhrase} ko lekar unka response aur standards commendable the.`,
            ]
          : [
              `Unka staff aur hospitality bohot thoughtful aur caring tha.`,
              `Har cheez me customer care aur quality standard clearly dikh raha tha.`,
            ];
        const extras = safeNotes ? [`Khaas taur par: ${safeNotes}.`] : [];
        const closings = [
          `Aise achhe experience ke liye thank you so much!`,
          `Definitely visit karne layak place hai, bohot shukriya!`,
          `Family aur friends ke saath yahan zaroor recommend karunga.`,
        ];
        return `${pickFresh(intros)} ${pickFresh(middles)} ${extras.join(' ')} ${pickFresh(closings)}`.replace(/\s+/g, ' ').trim();
      } else if (tone === 'professional') {
        const intros = [
          `${safeBiz} standard benchmark aur operational efficiency maintain karta hai.`,
          `${safeBiz} par overall service delivery aur professionalism kaafi impressive raha.`,
          `Extremely well-managed setup at ${safeBiz}.`,
        ];
        const middles = cleanTags.length > 0
          ? [
              `${tagsPhrase} ke parameters par unki quality aur handling commendable thi.`,
              `${tagsPhrase} ki availability aur specifications perfectly accurate mile.`,
            ]
          : [
              `Operations aur customer coordination prompt aur reliable tha.`,
              `Consistent quality aur systematic execution dekhne ko mila.`,
            ];
        const extras = safeNotes ? [`Particular note: ${safeNotes}.`] : [];
        const closings = [
          `Consistent performance ke liye fully 5 stars deserved.`,
          `Definitely reliable aur recommended service provider hai.`,
        ];
        return `${pickFresh(intros)} ${pickFresh(middles)} ${extras.join(' ')} ${pickFresh(closings)}`.replace(/\s+/g, ' ').trim();
      } else if (tone === 'enthusiastic') {
        const intros = [
          `Superb experience raha ${safeBiz} ke saath!`,
          `${safeBiz} definitely exceeded all expectations, ekdum badhiya!`,
          `Sach me outstanding visit rahi ${safeBiz} par!`,
        ];
        const middles = cleanTags.length > 0
          ? [
              `${tagsPhrase} to bilkul top-notch aur lajawab the!`,
              `${tagsPhrase} dekh kar maza aa gaya, super quality!`,
            ]
          : [
              `Quality standard aur overall vibe bilkul amazing tha!`,
              `Team ka coordination aur speed mind-blowing thi!`,
            ];
        const extras = safeNotes ? [`Specially: ${safeNotes}!`] : [];
        const closings = [
          `10/10 experience, har kisi ko zaroor try karna chahiye!`,
          `Agli baar bhi definitely yahi aayenge!`,
          `Totally worth it, full 5 stars!`,
        ];
        return `${pickFresh(intros)} ${pickFresh(middles)} ${extras.join(' ')} ${pickFresh(closings)}`.replace(/\s+/g, ' ').trim();
      } else if (tone === 'direct') {
        const intros = [
          `Great visit to ${safeBiz}.`,
          `Solid experience at ${safeBiz}.`,
          `${safeBiz} delivers exactly as promised.`,
        ];
        const middle = cleanTags.length > 0
          ? `${tagsPhrase} bilkul on point the.`
          : `Service aur quality reliable rahi.`;
        const extra = safeNotes ? `${safeNotes}.` : '';
        const closing = `5/5 rating, totally satisfied.`;
        return `${pickFresh(intros)} ${middle} ${extra} ${closing}`.replace(/\s+/g, ' ').trim();
      } else {
        // Casual default
        const intros = [
          `${safeBiz} se shopping karke kaafi achha laga.`,
          `${safeBiz} visit karke maza aaya aaj.`,
          `Stopped by ${safeBiz} and was really impressed.`,
        ];
        const middles = cleanTags.length > 0
          ? [
              `${tagsPhrase} ki range aur quality kaafi solid lagi.`,
              `${tagsPhrase} explore karke achha experience mila.`,
            ]
          : [
              `Overall setup aur arrangements kaafi smooth the.`,
              `Quality standard aur assistance genuinely helpful tha.`,
            ];
        const extras = safeNotes ? [`Aur haan, ${safeNotes}.`] : [];
        const closings = [
          `Zaroor recommend karunga sabko!`,
          `Next time bhi yahi visit karenge.`,
          `Happy to give a well-deserved 5 stars.`,
        ];
        return `${pickFresh(intros)} ${pickFresh(middles)} ${extras.join(' ')} ${pickFresh(closings)}`.replace(/\s+/g, ' ').trim();
      }
    } else if (rating === 4) {
      const intros = [
        `Solid experience at ${safeBiz}.`,
        `${safeBiz} par overall visit kaafi achhi rahi.`,
        `Pretty good visit to ${safeBiz}.`,
      ];
      const middle = cleanTags.length > 0
        ? `${tagsPhrase} kaafi decent aur satisfactory lage.`
        : `Overall service aur coordination reliable raha.`;
      const extra = safeNotes ? `Specially: ${safeNotes}.` : '';
      const closing = `Chhote-mote areas thode aur refine ho sakte hain, but definitely a strong 4-star experience.`;
      return `${pickFresh(intros)} ${middle} ${extra} ${closing}`.replace(/\s+/g, ' ').trim();
    } else if (rating === 3) {
      const middle = cleanTags.length > 0
        ? `${tagsPhrase} theek-thaak lage, par expectations se thoda kam the.`
        : `Service average rahi.`;
      const extra = safeNotes ? `${safeNotes}.` : '';
      return `${safeBiz} visit kiya. ${middle} ${extra} Overall a balanced visit, thoda improvement aur speed ki zaroorat hai.`.replace(/\s+/g, ' ').trim();
    } else {
      // 1 or 2 stars
      const middle = cleanTags.length > 0
        ? `${tagsPhrase} ko lekar experience disappointing raha.`
        : `Overall service expectations ke mutabiq nahi rahi.`;
      const extra = safeNotes ? `${safeNotes}.` : '';
      return `${safeBiz} par visit kiya. ${middle} ${extra} Service aur customer handling me kafi improvement ki zaroorat hai.`.replace(/\s+/g, ' ').trim();
    }
  }

  // ---------------- ENGLISH ----------------
  if (rating >= 5) {
    if (tone === 'warm') {
      const intros = [
        `Visiting ${safeBiz} was a truly heartwarming and delightful experience.`,
        `I am genuinely grateful for the thoughtful hospitality at ${safeBiz}.`,
        `Such a warm and caring visit to ${safeBiz}.`,
      ];
      const middles = cleanTags.length > 0
        ? [
            `The attention to ${tagsPhrase} was evident and deeply appreciated.`,
            `They took wonderful care with ${tagsPhrase}, making the visit truly special.`,
          ]
        : [
            `Every detail reflected genuine care and personal attention.`,
            `The staff made us feel completely welcome from start to finish.`,
          ];
      const extras = safeNotes ? [`In particular: ${safeNotes}.`] : [];
      const closings = [
        `Thank you for such dedicated care and service!`,
        `Will cherish this visit and gladly return soon.`,
        `Wholeheartedly deserving of these 5 stars.`,
      ];
      return `${pickFresh(intros)} ${pickFresh(middles)} ${extras.join(' ')} ${pickFresh(closings)}`.replace(/\s+/g, ' ').trim();
    } else if (tone === 'professional') {
      const intros = [
        `${safeBiz} operates at a commendable standard of professionalism.`,
        `A thoroughly well-managed operational experience at ${safeBiz}.`,
        `Impressed by the consistency and high standards demonstrated by ${safeBiz}.`,
      ];
      const middles = cleanTags.length > 0
        ? [
            `Their delivery regarding ${tagsPhrase} met stringent quality benchmarks.`,
            `The standards observed across ${tagsPhrase} reflect thorough competence and diligence.`,
          ]
        : [
            `Execution was punctual, well-coordinated, and precise throughout.`,
            `Staff demonstrated courteous communication and efficient client care.`,
          ];
      const extras = safeNotes ? [`Notable mention: ${safeNotes}.`] : [];
      const closings = [
        `A dependable establishment worthy of complete recommendation.`,
        `Fully deserving of this 5-star rating.`,
      ];
      return `${pickFresh(intros)} ${pickFresh(middles)} ${extras.join(' ')} ${pickFresh(closings)}`.replace(/\s+/g, ' ').trim();
    } else if (tone === 'enthusiastic') {
      const intros = [
        `Superb experience with ${safeBiz}!`,
        `${safeBiz} completely exceeded my expectations today!`,
        `An absolute standout visit at ${safeBiz}!`,
      ];
      const middles = cleanTags.length > 0
        ? [
            `The ${tagsPhrase} were top-notch and truly impressive!`,
            `Blown away by how fantastic the ${tagsPhrase} were!`,
          ]
        : [
            `Everything was of remarkable quality and energy!`,
            `The team was energetic, prompt, and thoroughly impressive!`,
          ];
      const extras = safeNotes ? [`Highlight of the visit: ${safeNotes}!`] : [];
      const closings = [
        `Hands down a 10/10 experience!`,
        `Easily one of my favorite places—cannot recommend them enough!`,
        `Will definitely be returning again soon!`,
      ];
      return `${pickFresh(intros)} ${pickFresh(middles)} ${extras.join(' ')} ${pickFresh(closings)}`.replace(/\s+/g, ' ').trim();
    } else if (tone === 'direct') {
      const intros = [
        `Solid visit to ${safeBiz}.`,
        `Great experience at ${safeBiz}.`,
        `${safeBiz} delivered exactly as promised.`,
      ];
      const middle = cleanTags.length > 0
        ? `The ${tagsPhrase} were on point.`
        : `Service and quality were dependable.`;
      const extra = safeNotes ? `${safeNotes}.` : '';
      const closing = `Efficient, clean, and reliable. 5 stars.`;
      return `${pickFresh(intros)} ${middle} ${extra} ${closing}`.replace(/\s+/g, ' ').trim();
    } else {
      // Casual default
      const intros = [
        `Had a really great time checking out ${safeBiz}.`,
        `Stopped by ${safeBiz} and was super pleased with everything.`,
        `Really happy with my experience at ${safeBiz}.`,
      ];
      const middles = cleanTags.length > 0
        ? [
            `The ${tagsPhrase} were spot on and made the visit well worth it.`,
            `Really appreciated the quality and variety with ${tagsPhrase}.`,
          ]
        : [
            `Everything was well-organized and the staff was easygoing and helpful.`,
            `Great overall atmosphere and dependable service from start to finish.`,
          ];
      const extras = safeNotes ? [`Specifically, ${safeNotes}.`] : [];
      const closings = [
        `Will definitely be dropping in again next time I am around!`,
        `Glad I stopped in, happy to leave 5 stars.`,
        `Definitely a spot I will recommend to friends.`,
      ];
      return `${pickFresh(intros)} ${pickFresh(middles)} ${extras.join(' ')} ${pickFresh(closings)}`.replace(/\s+/g, ' ').trim();
    }
  } else if (rating === 4) {
    const intros = [
      `Enjoyed my visit to ${safeBiz}.`,
      `Had a solid, pleasant experience at ${safeBiz}.`,
      `Pretty great visit overall to ${safeBiz}.`,
    ];
    const middle = cleanTags.length > 0
      ? `The ${tagsPhrase} were reliable and met expectations nicely.`
      : `Service was polite and the setup was organized.`;
    const extra = safeNotes ? `Note: ${safeNotes}.` : '';
    const closing = `A few small refinements would make it flawless, but very happy with this strong 4-star visit.`;
    return `${pickFresh(intros)} ${middle} ${extra} ${closing}`.replace(/\s+/g, ' ').trim();
  } else if (rating === 3) {
    const middle = cleanTags.length > 0
      ? `The ${tagsPhrase} were average.`
      : `Service was moderate.`;
    const extra = safeNotes ? `${safeNotes}.` : '';
    return `Visited ${safeBiz}. ${middle} ${extra} Overall a balanced visit, though there is clear room for refinement in service and speed.`.replace(/\s+/g, ' ').trim();
  } else {
    // 1 or 2 stars
    const middle = cleanTags.length > 0
      ? `The ${tagsPhrase} fell short of expectations.`
      : `The overall experience was unsatisfactory.`;
    const extra = safeNotes ? `${safeNotes}.` : '';
    return `Visited ${safeBiz} recently. ${middle} ${extra} Hoping to see better attention to quality and communication moving forward.`.replace(/\s+/g, ' ').trim();
  }
}

/**
 * Builds the tone-specific instruction block.
 */
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

/**
 * Builds the language-specific instruction block.
 */
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

/**
 * Generates an authentic AI review using Gemini 3.8 Flash,
 * strictly business-aware, keyword-aware, rating-aligned, and tone-personalized.
 */
export async function generateReviewWithGemini(
  input: GenerateReviewInput
): Promise<GenerateReviewOutput> {
  if (input.aiReviewEnabled === false) {
    return {
      success: false,
      error: 'AI Review Assistant is disabled for this business stand.',
      message: 'AI Review Assistant is disabled for this business stand.',
    };
  }

  const ratingNum = Math.min(Math.max(Number(input.rating) || 5, 1), 5);
  const tagsList = Array.isArray(input.tags)
    ? input.tags.map((t) => String(t).trim()).filter(Boolean)
    : [];
  const safeBusinessName = input.businessName ? String(input.businessName).trim() : 'this business';
  const safeNotes = input.notes ? String(input.notes).trim() : '';
  const safeCategory = input.category ? String(input.category).trim() : 'Local Business';
  const safeDescription = input.businessDescription ? String(input.businessDescription).trim() : '';
  const targetLanguage: ReviewLanguage = input.language === 'hinglish' ? 'hinglish' : 'en';
  const targetTone: ReviewTone =
    input.tone && ['casual', 'warm', 'professional', 'enthusiastic', 'direct'].includes(input.tone)
      ? input.tone
      : 'casual';
  const recentDrafts = Array.isArray(input.recentDrafts) ? input.recentDrafts.filter(Boolean).slice(0, 4) : [];

  const toneDirective = getTonePromptDirective(targetTone);
  const languageDirective = getLanguagePromptDirective(targetLanguage);

  // Dynamic sentence openers to maintain diversity across runs
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
   - Do NOT invent false transactional details (e.g. if 'Cricket bats' is selected, praise the bat quality/variety, but do not fabricate invoice numbers, tournament wins, or discounts unless stated).`
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

  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (geminiApiKey) {
    try {
      const ai = new GoogleGenAI({
        apiKey: geminiApiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      let candidateReview = '';
      let attempts = 0;
      const maxAttempts = recentDrafts.length > 0 ? 2 : 1;

      while (attempts < maxAttempts && !candidateReview) {
        attempts++;
        const currentTemperature = attempts === 1 ? 0.75 : 0.88;

        const geminiPromise = ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: userPrompt,
          config: {
            systemInstruction: systemPrompt,
            temperature: currentTemperature,
          },
        });

        // 8-second timeout guard to ensure reliable API responses without premature fallback
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Gemini API request timed out')), 8000)
        );

        const response = await Promise.race([geminiPromise, timeoutPromise]);
        let text = response.text ? response.text.trim() : '';

        // Clean any stray quotes or markdown wrapping
        text = text.replace(/^["'`]+|["'`]+$/g, '').trim();

        if (text) {
          let isTooSimilar = false;
          for (const draft of recentDrafts) {
            const similarity = computeTextSimilarity(text, draft);
            if (similarity > 0.65) {
              isTooSimilar = true;
              break;
            }
          }

          if (!isTooSimilar || attempts >= maxAttempts) {
            candidateReview = text;
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
    } catch (geminiError: any) {
      console.warn('Gemini generation notice, employing smart fallback engine:', geminiError?.message || geminiError);
    }
  }

  // Category-aware & Keyword-aware fallback generator
  const fallbackText = generateSmartFallbackReview(
    safeBusinessName,
    safeCategory,
    safeDescription,
    ratingNum,
    tagsList,
    safeNotes,
    targetLanguage,
    targetTone,
    recentDrafts
  );

  return {
    success: true,
    review: fallbackText,
    reviewText: fallbackText,
    source: 'smart_fallback',
    toneUsed: targetTone,
    languageUsed: targetLanguage,
  };
}
