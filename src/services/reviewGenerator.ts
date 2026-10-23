import { GoogleGenAI } from '@google/genai';
import { ReviewLanguage, ReviewTone } from '../types';

export interface GenerateReviewInput {
  businessName?: string;
  category?: string;
  rating?: number;
  tags?: string[];
  notes?: string;
  language?: ReviewLanguage;
  tone?: ReviewTone;
  recentDrafts?: string[];
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
 * Intelligent contextual fallback generator ensuring customers always receive
 * a natural, authentic, rating-aligned review draft even if API keys or networks fail.
 * Supports both English and Hinglish across all 5 distinct tones with built-in variety.
 */
export function generateSmartFallbackReview(
  businessName: string,
  rating: number,
  tags: string[],
  notes: string,
  language: ReviewLanguage = 'en',
  tone: ReviewTone = 'casual',
  recentDrafts: string[] = []
): string {
  const highlights = (tags || []).map((t) => t.toLowerCase());
  const hasFood = highlights.some((h) => h.includes('food') || h.includes('drink') || h.includes('coffee') || h.includes('print'));
  const hasStaff = highlights.some((h) => h.includes('staff') || h.includes('friendly') || h.includes('service') || h.includes('team'));
  const hasAmbience = highlights.some((h) => h.includes('ambience') || h.includes('cosy') || h.includes('vibe') || h.includes('clean'));
  const hasValue = highlights.some((h) => h.includes('value') || h.includes('price') || h.includes('quality'));

  const pickFresh = (arr: string[]): string => {
    const fresh = arr.filter(
      (item) => !recentDrafts.some((d) => d.toLowerCase().includes(item.toLowerCase().slice(0, 18)))
    );
    const pool = fresh.length > 0 ? fresh : arr;
    return pool[Math.floor(Math.random() * pool.length)];
  };

  if (language === 'hinglish') {
    // Hinglish (Roman script Hindi-English)
    if (rating >= 5) {
      if (tone === 'enthusiastic') {
        const intros = [
          `Superb experience raha ${businessName} ke saath!`,
          `${businessName} definitely exceeded expectations, bohot hi badhiya!`,
          `Sach me outstanding visit rahi ${businessName} me!`,
          `Ekdum top notch experience tha ${businessName} par!`,
          `${businessName} ne to bilkul impress kar diya aaj!`,
        ];
        const middles = [
          hasStaff ? `Staff super energetic and helpful tha.` : `Team ka coordination super impressive tha.`,
          hasFood || hasValue ? `Quality aur presentation dono bilkul flawless the.` : `Quality standard bohot high tha.`,
          hasAmbience ? `Vibe aur mahaul kaafi positive aur clean tha.` : `Environment kaafi energetic tha.`,
        ];
        if (notes) middles.push(`Specially note kiya: ${notes}.`);
        const closings = [
          `Definitely visit karna chahiye, 10/10 experience!`,
          `Agli baar bhi yahi aayenge pakka!`,
          `Totally worth it, bohot maza aaya!`,
          `Har kisi ko zaroor try karna chahiye!`,
        ];
        return `${pickFresh(intros)} ${pickFresh(middles)} ${pickFresh(closings)}`.trim();
      } else if (tone === 'warm') {
        const intros = [
          `${businessName} me visit karke bohot achha laga.`,
          `${businessName} ki hospitality sach me dil ko chhu gayi.`,
          `${businessName} me bohot warm welcome mila.`,
          `Itni pyari service dekhkar bohot khushi hui ${businessName} me.`,
        ];
        const middles = [
          hasStaff ? `Staff ka behavior bohot polite aur caring tha.` : `Team bohot humble aur respectful thi.`,
          hasFood || hasValue ? `Saari cheezein bohot thoughtfully aur pyar se prepare ki gayi thi.` : `Har cheez me care dikh rahi thi.`,
          hasAmbience ? `Kaafi peaceful aur warm atmosphere tha.` : `Setting bohot pleasant thi.`,
        ];
        if (notes) middles.push(`${notes}.`);
        const closings = [
          `Aise warm welcome ke liye thank you so much.`,
          `Family aur friends ke saath aane ke liye perfect jagah hai.`,
          `Bohot gratitude feel ho raha hai aisi service ke liye.`,
        ];
        return `${pickFresh(intros)} ${pickFresh(middles)} ${pickFresh(closings)}`.trim();
      } else if (tone === 'professional') {
        const intros = [
          `${businessName} me overall service quality kaafi impressive rahi.`,
          `${businessName} standard aur professionalism maintain karta hai.`,
          `Extremely well-managed setup at ${businessName}.`,
          `${businessName} delivers consistent quality and professional efficiency.`,
        ];
        const middles = [
          hasStaff ? `Team ka coordination aur courtesy commendable tha.` : `Management aur communication prompt thi.`,
          hasFood || hasValue ? `Deliverables aur quality standards benchmark ke according the.` : `Execution seamless aur accurate thi.`,
          hasAmbience ? `Environment organized aur hygiene standards maintain the.` : `Facility well-maintained thi.`,
        ];
        if (notes) middles.push(`Particular observation: ${notes}.`);
        const closings = [
          `Consistent performance ke liye fully 5 stars deserved.`,
          `Definitely reliable aur recommended service provider hai.`,
          `Commendable operation across all parameters.`,
        ];
        return `${pickFresh(intros)} ${pickFresh(middles)} ${pickFresh(closings)}`.trim();
      } else if (tone === 'direct') {
        const intros = [
          `Solid visit to ${businessName}.`,
          `Great experience at ${businessName}.`,
          `${businessName} delivers on point.`,
        ];
        const details = [];
        if (hasStaff) details.push(`Staff quick and helpful.`);
        if (hasFood || hasValue) details.push(`Quality solid thi.`);
        if (notes) details.push(`${notes}.`);
        const closings = [
          `Overall 5/5, totally satisfied.`,
          `No complaints, highly reliable.`,
          `Clean, prompt and dependable.`,
        ];
        return `${pickFresh(intros)} ${details.join(' ')} ${pickFresh(closings)}`.trim();
      } else {
        // Casual default
        const intros = [
          `Had a really nice time at ${businessName}.`,
          `${businessName} ka experience sach me kaafi achha raha.`,
          `${businessName} me sab kuch smoothly ho gaya.`,
          `Dropped by ${businessName} today and thoroughly enjoyed it.`,
          `Really glad I checked out ${businessName}.`,
        ];
        const middles = [
          hasStaff ? `Staff bohot friendly aur responsive tha.` : `Team bohot helpful aur chill thi.`,
          hasFood || hasValue ? `Quality aur taste ekdum badhiya tha.` : `Everything was spot on.`,
          hasAmbience ? `Place ka atmosphere kaafi cosy aur chill tha.` : `Vibe was pleasant throughout.`,
        ];
        if (notes) middles.push(`${notes}.`);
        const closings = [
          `Overall great vibe, definitely wapas aana banta hai.`,
          `Worth recommending to everyone.`,
          `Glad I stopped in, happy to give full 5 stars.`,
          `Will definitely visit again soon!`,
        ];
        return `${pickFresh(intros)} ${pickFresh(middles)} ${pickFresh(closings)}`.trim();
      }
    } else if (rating === 4) {
      const intros = [
        `${businessName} me achha experience raha.`,
        `Visited ${businessName} and overall had a good time.`,
        `Pleasant experience at ${businessName}.`,
      ];
      const middles = [];
      if (hasStaff) middles.push(`Staff polite aur helpful tha.`);
      if (hasFood || hasValue) middles.push(`Quality overall kaafi achhi thi.`);
      if (notes) middles.push(`${notes}.`);
      const closings = [
        `Minor improvements ke sath aur bhi better ho sakta hai, par overall very satisfied 4 stars.`,
        `A dependable 4-star experience that I'd easily recommend.`,
      ];
      return `${pickFresh(intros)} ${middles.join(' ')} ${pickFresh(closings)}`.trim();
    } else if (rating === 3) {
      const intros = [
        `Visited ${businessName} recently.`,
        `Overall an average experience at ${businessName}.`,
      ];
      return `${pickFresh(intros)} Service decent thi par speed aur consistency thodi improve ho sakti hai. ${notes ? notes + '. ' : ''}Average 3-star visit.`.trim();
    } else {
      return `Visited ${businessName}. Unfortunately my visit fell short of expectations. Service aur response time me improvements ki zaroorat hai. ${notes ? notes + '. ' : ''}Hoping to see improvements in the future.`.trim();
    }
  }

  // English generator
  if (rating >= 5) {
    if (tone === 'enthusiastic') {
      const intros = [
        `Absolutely blown away by ${businessName}!`,
        `${businessName} exceeded every expectation today!`,
        `What an incredible experience with ${businessName}!`,
        `Could not be happier with my visit to ${businessName}!`,
        `${businessName} truly knocked it out of the park!`,
      ];
      const middles = [
        hasStaff ? `The crew was full of positive energy and so attentive.` : `The entire team was buzzing with genuine enthusiasm.`,
        hasFood || hasValue ? `Everything delivered was fresh, premium, and flawless.` : `The standard of quality was unmatched.`,
        hasAmbience ? `The ambience was buzzing yet super comfortable.` : `The atmosphere added so much to the whole visit.`,
      ];
      if (notes) middles.push(`${notes}.`);
      const closings = [
        `Can't wait to come back!`,
        `Easily a 10 out of 10 in my book!`,
        `Will be raving about this to everyone!`,
        `Deserves every bit of these 5 stars!`,
      ];
      return `${pickFresh(intros)} ${pickFresh(middles)} ${pickFresh(closings)}`.trim();
    } else if (tone === 'warm') {
      const intros = [
        `Such a heartwarming visit to ${businessName}.`,
        `Genuinely touched by the hospitality at ${businessName}.`,
        `Felt truly taken care of at ${businessName}.`,
        `The warmth and care at ${businessName} made my day.`,
      ];
      const middles = [
        hasStaff ? `The kindness and patience of the team made all the difference.` : `Everyone treated us with genuine thoughtfulness.`,
        hasFood || hasValue ? `The thoughtful attention to detail was evident in everything.` : `Every aspect showed true dedication to customer satisfaction.`,
        hasAmbience ? `A relaxing, lovely setting that made our time special.` : `The calm, inviting environment was deeply appreciated.`,
      ];
      if (notes) middles.push(`${notes}.`);
      const closings = [
        `Thank you for making our day that much brighter.`,
        `Deeply appreciate the care put into every detail.`,
        `Leaving with a smile and immense appreciation.`,
      ];
      return `${pickFresh(intros)} ${pickFresh(middles)} ${pickFresh(closings)}`.trim();
    } else if (tone === 'professional') {
      const intros = [
        `${businessName} operates at a commendable standard of professionalism.`,
        `A thoroughly well-managed experience at ${businessName}.`,
        `Impressed by the operational efficiency at ${businessName}.`,
        `${businessName} demonstrates notable attention to quality and consistency.`,
      ];
      const middles = [
        hasStaff ? `The staff exhibited clear competence, prompt communication, and courtesy.` : `The team conducted themselves with exemplary professionalism.`,
        hasFood || hasValue ? `Both product quality and execution met strict benchmarks.` : `Execution was timely, precise, and dependable.`,
        hasAmbience ? `The facility was organized, well-maintained, and orderly.` : `Standards of cleanliness and presentation were evident throughout.`,
      ];
      if (notes) middles.push(`Notable mention: ${notes}.`);
      const closings = [
        `A dependable establishment worthy of high praise.`,
        `Fully deserving of this 5-star rating.`,
        `Will readily engage their services again without hesitation.`,
      ];
      return `${pickFresh(intros)} ${pickFresh(middles)} ${pickFresh(closings)}`.trim();
    } else if (tone === 'direct') {
      const intros = [
        `Solid visit to ${businessName}.`,
        `Great service at ${businessName}.`,
        `Quick and seamless at ${businessName}.`,
        `${businessName} delivered exactly as promised.`,
      ];
      const details = [];
      if (hasStaff) details.push(`Staff was prompt and courteous.`);
      if (hasFood || hasValue) details.push(`Top-tier quality throughout.`);
      if (notes) details.push(`${notes}.`);
      const closings = [
        `No complaints, 5 stars all around.`,
        `Efficient, clean, and reliable.`,
        `Highly dependable, would use again.`,
      ];
      return `${pickFresh(intros)} ${details.join(' ')} ${pickFresh(closings)}`.trim();
    } else {
      // Casual default
      const intros = [
        `Had a really great time at ${businessName}.`,
        `Stopped by ${businessName} and was super impressed.`,
        `${businessName} definitely hit the spot today.`,
        `Really pleased with my experience at ${businessName}.`,
        `Check out ${businessName} today—was thoroughly happy with everything.`,
      ];
      const middles = [
        hasStaff ? `The staff was super friendly and made us feel right at home.` : `The team was easygoing and helpful.`,
        hasFood || hasValue ? `Everything was high quality and well worth it.` : `Quality was right on the mark.`,
        hasAmbience ? `Really enjoyed the relaxed vibe and clean space.` : `Great casual atmosphere all around.`,
      ];
      if (notes) middles.push(`${notes}.`);
      const closings = [
        `Will definitely be dropping in again soon!`,
        `Glad I stopped in, happy to give 5 stars.`,
        `Easy 5-star experience in my book.`,
        `Definitely coming back next time I'm around!`,
      ];
      return `${pickFresh(intros)} ${pickFresh(middles)} ${pickFresh(closings)}`.trim();
    }
  } else if (rating === 4) {
    const intros = [
      `Enjoyed my visit to ${businessName}.`,
      `Had a solid, enjoyable visit at ${businessName}.`,
      `Pretty great experience at ${businessName}.`,
    ];
    const middles = [];
    if (hasStaff) middles.push(`Staff was polite and welcoming.`);
    if (hasFood || hasValue) middles.push(`Solid quality throughout.`);
    if (notes) middles.push(`${notes}.`);
    const closings = [
      `Minor areas could be even faster, but definitely a strong 4-star experience.`,
      `A few small refinements would make it perfect, but very happy overall.`,
    ];
    return `${pickFresh(intros)} ${middles.join(' ')} ${pickFresh(closings)}`.trim();
  } else if (rating === 3) {
    return `Visited ${businessName}. Overall an average experience with decent service. ${notes ? notes + '. ' : ''}A few good touches, but room for refinement in speed and consistency.`.trim();
  } else {
    return `Visited ${businessName}. Unfortunately my visit fell short of expectations. ${notes ? notes + '. ' : ''}Hoping to see improvements in communication and service quality moving forward.`.trim();
  }
}

/**
 * Builds the tone-specific instruction block.
 */
function getTonePromptDirective(tone: ReviewTone): string {
  switch (tone) {
    case 'warm':
      return `TONE REQUIREMENT: Warm & Appreciative.
- Style: Heartfelt, grateful, expressing genuine appreciation for great hospitality and feeling cared for.
- Vocabulary: Use thoughtful, grateful expressions (e.g., "warm hospitality", "genuinely cared", "made us feel so welcome", "thoughtful attention").
- Avoid cold corporate phrases or over-hyped marketing jargon.`;

    case 'professional':
      return `TONE REQUIREMENT: Professional & Polished.
- Style: Clear, articulate, objective, and well-structured. Balanced, respectful, and observant.
- Vocabulary: Professional and measured phrasing (e.g., "impressed by the prompt execution", "standards of consistency", "courteous and well-organized").
- Avoid slang, excessive exclamation points, and informal chatter.`;

    case 'enthusiastic':
      return `TONE REQUIREMENT: Enthusiastic & Vibrant.
- Style: High energy, expressive, genuine excitement and delight.
- Vocabulary: Lively, dynamic praise (e.g., "absolutely fantastic", "blown away", "superb quality", "highlight of the day").
- Keep it natural—never use all-caps screaming, emojis, or exclamation mark overload.`;

    case 'direct':
      return `TONE REQUIREMENT: Simple & Direct.
- Style: Short, concise, punchy, and straight to the point. No fluff or flowery adjectives.
- Structure: 2 or 3 quick sentences covering what was good, what stood out, and the final verdict.
- Ideal word count: 35-50 words.`;

    case 'casual':
    default:
      return `TONE REQUIREMENT: Casual & Friendly (Default).
- Style: Everyday conversational language, relaxed, approachable, natural contractions (it's, didn't, was really).
- Tone sounds like a friendly regular or happy first-timer recommending a spot to a friend.`;
  }
}

/**
 * Builds the language-specific instruction block.
 */
function getLanguagePromptDirective(language: ReviewLanguage): string {
  if (language === 'hinglish') {
    return `LANGUAGE REQUIREMENT: Hinglish (Roman-Script Hindi-English as spoken across India).
- Use natural conversational Roman-script Hindi-English (e.g., "Service kaafi achhi thi aur staff bohot helpful tha", "Quality ekdum badhiya thi", "Overall experience really good raha", "Zaroor recommend karunga").
- STRICT: NEVER write in Devanagari script. Use Roman alphabet exclusively.
- Do NOT translate literally word-for-word from English into bookish Hindi. It must sound like how real Indians casually speak and write reviews on Google Maps.
- Keep business names, brand names, menu items, drinks, dishes, and staff names in English.
- Naturally blend English nouns/adjectives with conversational Hindi verbs and connectors.`;
  }

  return `LANGUAGE REQUIREMENT: English.
- Natural, fluent English with native phrasing, correct grammar, and varied sentence lengths.
- Do not mix in foreign words unless explicitly provided in customer notes or business names.`;
}

/**
 * Generates an authentic AI review using Gemini 3.8 Flash,
 * with diversity enforcement, language & tone personalization,
 * similarity checking against recent drafts, and graceful fallback.
 */
export async function generateReviewWithGemini(
  input: GenerateReviewInput
): Promise<GenerateReviewOutput> {
  const ratingNum = Math.min(Math.max(Number(input.rating) || 5, 1), 5);
  const tagsList = Array.isArray(input.tags) ? input.tags.filter(Boolean) : [];
  const safeBusinessName = input.businessName ? String(input.businessName).trim() : 'this business';
  const safeNotes = input.notes ? String(input.notes).trim() : '';
  const safeCategory = input.category ? String(input.category).trim() : 'local business / customer service';
  const targetLanguage: ReviewLanguage = input.language === 'hinglish' ? 'hinglish' : 'en';
  const targetTone: ReviewTone =
    input.tone && ['casual', 'warm', 'professional', 'enthusiastic', 'direct'].includes(input.tone)
      ? input.tone
      : 'casual';
  const recentDrafts = Array.isArray(input.recentDrafts) ? input.recentDrafts.filter(Boolean).slice(0, 4) : [];

  // Opening angles to inject varied sentence structures and opening approaches
  const openingAngles = [
    'Lead directly with a decisive impression or verdict about the experience.',
    'Begin by highlighting the specific experience tags or atmosphere.',
    'Start with a personal perspective or mention of what brought you in.',
    'Focus initially on the staff attitude, efficiency, or service reception.',
    'Open with a concise statement on overall product/service quality.',
  ];
  const chosenAngle = openingAngles[Math.floor(Math.random() * openingAngles.length)];
  const randomSeed = Math.floor(Math.random() * 100000);

  const toneDirective = getTonePromptDirective(targetTone);
  const languageDirective = getLanguagePromptDirective(targetLanguage);

  let antiDuplicationDirective = '';
  if (recentDrafts.length > 0) {
    antiDuplicationDirective = `\nPREVIOUS GENERATED DRAFTS TO AVOID DUPLICATING:
The customer has already seen these draft variations in their current session:
${recentDrafts.map((d, i) => `[Draft ${i + 1}]: "${d.replace(/\n+/g, ' ')}"`).join('\n')}
MANDATORY: You MUST write a FRESH variation. Do NOT copy the opening clause, sentence structure, or exact phrasing from the drafts above. Use different vocabulary and a distinct rhythm.`;
  }

  const systemPrompt = `You are an expert customer review copywriter crafting an authentic, original Google Review for "${safeBusinessName}" (${safeCategory}).
Your task is to write ONE unique, believable customer review draft based strictly on the user's inputs.

${languageDirective}

${toneDirective}

CRITICAL RULES:
1. STAR RATING: The customer chose ${ratingNum} out of 5 stars. The sentiment, adjectives, and tone MUST strictly match a ${ratingNum}-star rating.
2. SELECTED HIGHLIGHTS: The customer selected these highlights: ${tagsList.length > 0 ? tagsList.join(', ') : 'overall positive experience'}. Weave them in naturally without sounding like a bulleted checklist.
3. CUSTOMER NOTES: ${safeNotes ? `The customer specifically provided: "${safeNotes}". You MUST naturally incorporate this detail.` : 'No special notes provided. Do NOT invent specific dishes, drinks, prices, or staff names.'}
4. NO INVENTED FACTS: Never hallucinate specific staff names, exact prices, transactional details, or events not mentioned by the customer.
5. DIVERSITY & ANTI-CLICHÉ:
   - DIVERSE OPENING: ${chosenAngle}
   - BAN FORMULAIC OPENINGS: Never start with "I recently visited...", "Look no further than...", "From the moment I walked in...", or "As soon as I entered...".
   - BAN PREDICTABLE ENDINGS: Do not force every review to end with "Highly recommend!" or "Will definitely be back!". Mix up closing thoughts or end on a specific positive note.
   - Varied sentence structures: Mix shorter and longer sentences.
6. LENGTH: 35 to 80 words (roughly 2 to 4 sentences).
7. CLEAN OUTPUT: Return ONLY the raw plain text of the review. No quotation marks, no emojis, no hashtags, no intro/outro conversational text.${antiDuplicationDirective}`;

  const userPrompt = `Draft a completely unique, natural ${ratingNum}-star review for ${safeBusinessName}. Variation seed: ${randomSeed}.`;

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

      // Generation attempt with retry if output is excessively similar to recent drafts
      let candidateReview = '';
      let attempts = 0;
      const maxAttempts = recentDrafts.length > 0 ? 2 : 1;

      while (attempts < maxAttempts && !candidateReview) {
        attempts++;
        const currentTemperature = attempts === 1 ? 0.85 : 0.95;

        const geminiPromise = ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: userPrompt,
          config: {
            systemInstruction: systemPrompt,
            temperature: currentTemperature,
          },
        });

        // 4-second timeout guard per attempt to maintain rapid interactive UX
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Gemini API request timed out')), 4000)
        );

        const response = await Promise.race([geminiPromise, timeoutPromise]);
        let text = response.text ? response.text.trim() : '';

        // Clean any stray quotes or markdown wrapping
        text = text.replace(/^["'`]+|["'`]+$/g, '').trim();

        if (text) {
          // Check similarity against recent drafts
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

  // Fallback generator ensuring zero customer disruption
  const fallbackText = generateSmartFallbackReview(
    safeBusinessName,
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
