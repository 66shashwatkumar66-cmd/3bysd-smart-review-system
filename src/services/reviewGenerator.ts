import { GoogleGenAI } from '@google/genai';

export interface GenerateReviewInput {
  businessName?: string;
  category?: string;
  rating?: number;
  tags?: string[];
  notes?: string;
}

export interface GenerateReviewOutput {
  success: boolean;
  review?: string;
  reviewText?: string;
  source?: 'gemini' | 'smart_fallback';
  message?: string;
  error?: string;
}

/**
 * Intelligent contextual fallback generator ensuring customers always receive
 * a natural, helpful, rating-aligned review draft even if API keys or networks fail.
 */
export function generateSmartFallbackReview(
  businessName: string,
  rating: number,
  tags: string[],
  notes: string
): string {
  const highlights = tags.map((t) => t.toLowerCase());
  const hasFood = highlights.some((h) => h.includes('food') || h.includes('drink') || h.includes('coffee') || h.includes('print'));
  const hasStaff = highlights.some((h) => h.includes('staff') || h.includes('friendly') || h.includes('service') || h.includes('team'));
  const hasAmbience = highlights.some((h) => h.includes('ambience') || h.includes('cosy') || h.includes('vibe') || h.includes('clean'));
  const hasValue = highlights.some((h) => h.includes('value') || h.includes('price') || h.includes('quality'));

  if (rating >= 5) {
    let text = `Had an exceptional experience with ${businessName}. `;
    if (hasStaff && hasFood) {
      text += `The team was incredibly welcoming, helpful, and everything exceeded my expectations. `;
    } else if (hasStaff) {
      text += `The staff was genuinely attentive, professional, and went above and beyond. `;
    } else if (hasFood || hasValue) {
      text += `The quality, attention to detail, and turnaround time were absolutely top tier. `;
    }
    if (hasAmbience) {
      text += `Great atmosphere and immaculate presentation throughout. `;
    }
    if (notes) {
      text += `${notes}. `;
    }
    text += `Will definitely be returning and highly recommend to anyone looking for top quality!`;
    return text.trim();
  } else if (rating === 4) {
    let text = `Really great experience at ${businessName}. `;
    if (hasStaff) text += `Staff was polite, responsive, and welcoming. `;
    if (hasFood || hasValue) text += `Quality of the products and service was solid. `;
    if (hasAmbience) text += `Nice environment and very clean setup. `;
    if (notes) text += `${notes}. `;
    text += `A dependable 4-star spot that I'd happily recommend.`;
    return text.trim();
  } else if (rating === 3) {
    let text = `Visited ${businessName} recently. Overall an okay experience with decent service. `;
    if (notes) text += `${notes}. `;
    text += `A few positive aspects, but also minor room for improvement in speed and consistency.`;
    return text.trim();
  } else {
    let text = `Visited ${businessName}. Unfortunately my visit did not meet expectations. `;
    if (notes) text += `${notes}. `;
    text += `Hoping to see improvements in communication and service quality in the future.`;
    return text.trim();
  }
}

/**
 * Generates an authentic AI review using Gemini 3.8 Flash,
 * with timeout resilience and automatic smart fallback.
 */
export async function generateReviewWithGemini(
  input: GenerateReviewInput
): Promise<GenerateReviewOutput> {
  const ratingNum = Math.min(Math.max(Number(input.rating) || 5, 1), 5);
  const tagsList = Array.isArray(input.tags) ? input.tags.filter(Boolean) : [];
  const safeBusinessName = input.businessName ? String(input.businessName).trim() : 'this business';
  const safeNotes = input.notes ? String(input.notes).trim() : '';
  const safeCategory = input.category ? String(input.category).trim() : 'local business / customer service';

  // System instructions strictly forbidding hallucinations or invented facts
  const systemPrompt = `You are an authentic, honest, and helpful customer review assistant for "${safeBusinessName}" (${safeCategory}).
Your goal is to write ONE natural, genuine customer review draft based strictly on the customer's selected rating, experience highlights, and optional notes.

CRITICAL RULES:
1. Star Rating: The customer gave a ${ratingNum}-star rating. The tone of the review MUST reflect this exact rating level (${ratingNum} out of 5 stars).
2. Selected Highlights: The customer specifically chose: ${tagsList.length > 0 ? tagsList.join(', ') : 'Overall positive impression'}.
3. Customer Notes: ${safeNotes ? `The customer specifically noted: "${safeNotes}". You MUST weave this in naturally.` : 'No additional customer notes provided.'}
4. NO INVENTED DETAILS: Do not invent dishes, drinks, wait times, staff names, or events not mentioned by the customer.
5. NO HASHTAGS, NO EMOJIS, NO QUOTATION MARKS around the review.
6. LENGTH: 2 to 4 concise, genuine sentences (40-75 words).
7. Format: Return ONLY the raw plain text of the review. Nothing else.`;

  const userPrompt = `Draft an honest ${ratingNum}-star Google review for ${safeBusinessName}.`;

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

      const geminiPromise = ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.7,
        },
      });

      // 4-second timeout guard to ensure rapid UX
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini API request timed out')), 4000)
      );

      const response = await Promise.race([geminiPromise, timeoutPromise]);
      const generatedText = response.text ? response.text.trim() : '';

      if (generatedText) {
        return {
          success: true,
          review: generatedText,
          reviewText: generatedText,
          source: 'gemini',
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
    safeNotes
  );

  return {
    success: true,
    review: fallbackText,
    reviewText: fallbackText,
    source: 'smart_fallback',
  };
}
