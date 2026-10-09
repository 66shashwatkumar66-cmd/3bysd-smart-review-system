import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'cards.json');

app.use(express.json());

// Initialize Gemini SDK with telemetry header
const geminiApiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (geminiApiKey) {
  ai = new GoogleGenAI({
    apiKey: geminiApiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export interface CardRecord {
  id: string; // e.g. "0001", "0002"
  status: 'available' | 'assigned' | 'disabled';
  businessName: string;
  category: string;
  googleReviewUrl: string;
  notes: string;
  aiReviewEnabled?: boolean;
  scansCount: number;
  createdAt: string;
  updatedAt: string;
}

// In-memory + file-backed persistent card store
function ensureDataFile(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    const initialCards: CardRecord[] = [
      {
        id: '0001',
        status: 'assigned',
        businessName: 'The Artisan Roastery & Bakery',
        category: 'Specialty Coffee & Brunch',
        googleReviewUrl: 'https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4',
        notes: 'Table 4 Stand - NFC & QR display',
        scansCount: 42,
        createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: '0002',
        status: 'assigned',
        businessName: 'SD Wood-Fired Pizzeria',
        category: 'Italian Restaurant',
        googleReviewUrl: 'https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4',
        notes: 'Host stand entrance',
        scansCount: 19,
        createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: '0003',
        status: 'available',
        businessName: '',
        category: '',
        googleReviewUrl: '',
        notes: 'Batch #1 - Unassigned acrylic stand',
        scansCount: 0,
        createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: '0004',
        status: 'available',
        businessName: '',
        category: '',
        googleReviewUrl: '',
        notes: 'Batch #1 - Unassigned keychain badge',
        scansCount: 0,
        createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialCards, null, 2), 'utf-8');
  }
}

function readCards(): CardRecord[] {
  try {
    ensureDataFile();
    const data = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(data) as CardRecord[];
  } catch (err) {
    console.error('Error reading cards file:', err);
    return [];
  }
}

function writeCards(cards: CardRecord[]): void {
  try {
    ensureDataFile();
    fs.writeFileSync(DATA_FILE, JSON.stringify(cards, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving cards file:', err);
  }
}

// REST API: Get all cards
app.get('/api/cards', (_req: Request, res: Response) => {
  const cards = readCards();
  res.json({ success: true, cards });
});

// REST API: Get single card by ID (with scan count increment)
app.get('/api/cards/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const cards = readCards();
  const card = cards.find((c) => c.id.toLowerCase() === id.toLowerCase());

  if (!card) {
    return res.status(404).json({ success: false, message: `Card ${id} not found` });
  }

  // Increment scan count if requested with increment query
  if (req.query.scan === 'true') {
    card.scansCount = (card.scansCount || 0) + 1;
    card.updatedAt = new Date().toISOString();
    writeCards(cards);
  }

  res.json({ success: true, card });
});

// REST API: Create single or batch cards
app.post('/api/cards/batch', (req: Request, res: Response) => {
  try {
    const { count = 1, startNumber = 1, paddingDigits = 4, prefix = '' } = req.body;
    const cards = readCards();
    const existingIds = new Set(cards.map((c) => c.id));
    const newCards: CardRecord[] = [];

    let currentNum = Number(startNumber) || 1;
    let added = 0;
    const targetCount = Math.min(Math.max(Number(count) || 1, 1), 500);

    while (added < targetCount && currentNum <= 999999) {
      const paddedNum = String(currentNum).padStart(Number(paddingDigits) || 4, '0');
      const candidateId = prefix ? `${prefix}-${paddedNum}` : paddedNum;

      if (!existingIds.has(candidateId)) {
        const newCard: CardRecord = {
          id: candidateId,
          status: 'available',
          businessName: '',
          category: '',
          googleReviewUrl: '',
          notes: `Batch created ${new Date().toLocaleDateString()}`,
          scansCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        newCards.push(newCard);
        existingIds.add(candidateId);
        added++;
      }
      currentNum++;
    }

    const updated = [...cards, ...newCards];
    writeCards(updated);

    res.json({
      success: true,
      message: `Successfully generated ${newCards.length} dynamic QR cards`,
      cards: newCards,
      totalCount: updated.length,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Batch creation failed' });
  }
});

// REST API: Assign or update card details
app.put('/api/cards/:id/assign', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { businessName, googleReviewUrl, category, notes, status, aiReviewEnabled } = req.body;

    const cards = readCards();
    const index = cards.findIndex((c) => c.id.toLowerCase() === id.toLowerCase());

    if (index === -1) {
      return res.status(404).json({ success: false, message: `Card ${id} not found` });
    }

    cards[index] = {
      ...cards[index],
      businessName: businessName !== undefined ? businessName.trim() : cards[index].businessName,
      googleReviewUrl: googleReviewUrl !== undefined ? googleReviewUrl.trim() : cards[index].googleReviewUrl,
      category: category !== undefined ? category.trim() : cards[index].category,
      notes: notes !== undefined ? notes.trim() : cards[index].notes,
      aiReviewEnabled:
        aiReviewEnabled !== undefined
          ? Boolean(aiReviewEnabled)
          : (cards[index].aiReviewEnabled ?? true),
      status:
        status !== undefined
          ? status
          : (cards[index].status || (cards[index].businessName && cards[index].googleReviewUrl ? 'assigned' : 'available')),
      updatedAt: new Date().toISOString(),
    };

    writeCards(cards);
    res.json({ success: true, card: cards[index] });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Assignment failed' });
  }
});

// REST API: Delete card
app.delete('/api/cards/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const cards = readCards();
    const filtered = cards.filter((c) => c.id.toLowerCase() !== id.toLowerCase());

    if (filtered.length === cards.length) {
      return res.status(404).json({ success: false, message: `Card ${id} not found` });
    }

    writeCards(filtered);
    res.json({ success: true, message: `Card ${id} deleted` });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Deletion failed' });
  }
});

// AI Review Generation Route using @google/genai
app.post('/api/generate-review', async (req: Request, res: Response) => {
  try {
    const { businessName, rating, tags, notes, category } = req.body;

    const ratingNum = Math.min(Math.max(Number(rating) || 5, 1), 5);
    const tagsList = Array.isArray(tags) ? tags : [];
    const safeBusinessName = businessName ? String(businessName).trim() : 'this business';
    const safeNotes = notes ? String(notes).trim() : '';
    const safeCategory = category ? String(category).trim() : 'café / local business';

    // System instructions forbidding fake experiences or invented facts
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

    if (ai) {
      try {
        const geminiPromise = ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: userPrompt,
          config: {
            systemInstruction: systemPrompt,
            temperature: 0.7,
          },
        });

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Gemini API timeout')), 4000)
        );

        const response = await Promise.race([geminiPromise, timeoutPromise]);
        const generatedText = response.text ? response.text.trim() : '';
        if (generatedText) {
          return res.json({ success: true, review: generatedText });
        }
      } catch (geminiError: any) {
        console.warn('Gemini API call skipped or timed out, using fallback:', geminiError.message);
      }
    }

    // High quality fallback generator if API key is not configured yet or fails
    const fallbackReview = generateSmartFallbackReview(safeBusinessName, ratingNum, tagsList, safeNotes);
    return res.json({ success: true, review: fallbackReview });
  } catch (error: any) {
    console.error('Error generating review:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to generate review' });
  }
});

function generateSmartFallbackReview(
  businessName: string,
  rating: number,
  tags: string[],
  notes: string
): string {
  const highlights = tags.map((t) => t.toLowerCase());
  const hasFood = highlights.some((h) => h.includes('food') || h.includes('drink'));
  const hasStaff = highlights.some((h) => h.includes('staff') || h.includes('friendly') || h.includes('service'));
  const hasAmbience = highlights.some((h) => h.includes('ambience') || h.includes('cosy') || h.includes('vibe'));
  const hasValue = highlights.some((h) => h.includes('value'));

  if (rating >= 5) {
    let text = `Had a wonderful experience at ${businessName}. `;
    if (hasStaff && hasFood) {
      text += `The team was incredibly welcoming and everything we ordered was freshly prepared and delicious. `;
    } else if (hasStaff) {
      text += `The staff was genuinely attentive and made us feel right at home from the moment we walked in. `;
    } else if (hasFood) {
      text += `The quality and presentation exceeded expectations. `;
    }
    if (hasAmbience) {
      text += `The atmosphere is comfortable and relaxed. `;
    }
    if (notes) {
      text += `${notes}. `;
    }
    text += `Will definitely be returning and recommending to others!`;
    return text.trim();
  } else if (rating === 4) {
    let text = `Really enjoyed our visit to ${businessName}. `;
    if (hasFood) text += `The food and drinks were top notch. `;
    if (hasStaff) text += `Staff was polite and helpful. `;
    if (hasAmbience) text += `Great cosy environment. `;
    if (notes) text += `${notes}. `;
    text += `A solid 4-star spot worth checking out.`;
    return text.trim();
  } else {
    let text = `Visited ${businessName} recently. `;
    if (notes) {
      text += `${notes}. `;
    } else {
      text += `There were a few positive aspects, but also room for improvement in overall service and speed. `;
    }
    text += `Hope to see continued refinement on future visits.`;
    return text.trim();
  }
}

// Development mode with Vite middleware vs Production static serving
async function startServer() {
  ensureDataFile();

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 3DBYSD Smart Reviews server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
