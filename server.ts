import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { generateReviewWithGemini } from './src/services/reviewGenerator';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'cards.json');
const ADMINS_FILE = path.join(DATA_DIR, 'admins.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const UPLOADS_DIR = path.resolve(process.cwd(), 'public', 'uploads', 'logos');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(path.resolve(process.cwd(), 'public', 'uploads')));

// Enable CORS and handle OPTIONS preflight for all API routes
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-id');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});



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
  customKeywords?: string[];
  reviewTone?: 'enthusiastic' | 'friendly' | 'professional' | 'concise';
  promptStarter?: string;
  customHeadline?: string;
  logoUrl?: string;
  businessDescription?: string;
  scansCount: number;
  assignedToEmail?: string;
  assignedToUid?: string;
  assignedToName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'master' | 'restricted';
  assignedCardIds: string[];
  permissions: {
    canEditCards: boolean;
    canToggleAi: boolean;
    canExportCsv: boolean;
    canCreateCards: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

function ensureAdminsFile(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(ADMINS_FILE)) {
    const initialAdmins: AdminUser[] = [
      {
        id: 'master-admin-01',
        email: '66shashwatkumar66@gmail.com',
        name: 'Master Admin',
        role: 'master',
        assignedCardIds: [],
        permissions: {
          canEditCards: true,
          canToggleAi: true,
          canExportCsv: true,
          canCreateCards: true,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'sub-admin-01',
        email: 'branch.manager@example.com',
        name: 'Branch Manager (Restricted)',
        role: 'restricted',
        assignedCardIds: ['0001', '0002'],
        permissions: {
          canEditCards: true,
          canToggleAi: true,
          canExportCsv: false,
          canCreateCards: false,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    fs.writeFileSync(ADMINS_FILE, JSON.stringify(initialAdmins, null, 2), 'utf-8');
  }
}

function readAdmins(): AdminUser[] {
  try {
    ensureAdminsFile();
    const data = fs.readFileSync(ADMINS_FILE, 'utf-8');
    return JSON.parse(data) as AdminUser[];
  } catch (err) {
    console.error('Error reading admins file:', err);
    return [];
  }
}

function writeAdmins(admins: AdminUser[]): void {
  try {
    ensureAdminsFile();
    fs.writeFileSync(ADMINS_FILE, JSON.stringify(admins, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving admins file:', err);
  }
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  provider: string;
  role: 'master' | 'restricted' | 'member';
  emailVerified: boolean;
  lastLoginAt: string;
  createdAt: string;
  loginCount: number;
  device?: string;
  assignedCardIds?: string[];
}

function ensureUsersFile(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(USERS_FILE)) {
    const initialUsers: UserProfile[] = [
      {
        uid: 'google-user-66shashwatkumar66',
        email: '66shashwatkumar66@gmail.com',
        displayName: 'Shashwat Kumar',
        photoURL: 'https://api.dicebear.com/7.x/initials/svg?seed=SK&backgroundColor=1a73e8&textColor=ffffff',
        provider: 'google.com',
        role: 'master',
        emailVerified: true,
        lastLoginAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        loginCount: 1,
        device: 'Web Browser (Google Verified)',
        assignedCardIds: [],
      },
    ];
    fs.writeFileSync(USERS_FILE, JSON.stringify(initialUsers, null, 2), 'utf-8');
  }
}

function readUsers(): UserProfile[] {
  try {
    ensureUsersFile();
    const data = fs.readFileSync(USERS_FILE, 'utf-8');
    return JSON.parse(data) as UserProfile[];
  } catch (err) {
    console.error('Error reading users file:', err);
    return [];
  }
}

function writeUsers(users: UserProfile[]): void {
  try {
    ensureUsersFile();
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving users file:', err);
  }
}

const ADS_FILE = path.join(DATA_DIR, 'ads.json');

function ensureAdsFile(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(ADS_FILE)) {
    const initialAds = [
      {
        id: 'ad-001',
        name: '3D Printed QR Stands Promotion',
        advertiser: '3DBYSD Studios',
        headline: 'Custom 3D Printed NFC & QR Stands for Businesses',
        description: 'Elevate your counter or table with durable, branded acrylic and wood review stands.',
        imageUrl: 'https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?auto=format&fit=crop&w=400&q=80',
        targetUrl: 'https://3dbysd.com',
        ctaText: 'Explore Stands',
        placement: 'below_draft',
        status: 'active',
        priority: 10,
        impressions: 48,
        clicks: 6,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    fs.writeFileSync(ADS_FILE, JSON.stringify(initialAds, null, 2), 'utf-8');
  }
}

function readAds(): any[] {
  try {
    ensureAdsFile();
    const data = fs.readFileSync(ADS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading ads file:', err);
    return [];
  }
}

function writeAds(ads: any[]): void {
  try {
    ensureAdsFile();
    fs.writeFileSync(ADS_FILE, JSON.stringify(ads, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving ads file:', err);
  }
}

// In-memory + file-backed persistent card store
function ensureDataFile(): void {
  ensureAdminsFile();
  ensureUsersFile();
  ensureAdsFile();
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

// REST API: Create single or batch cards (Master Admin Only)
app.post('/api/cards/batch', (req: Request, res: Response) => {
  try {
    const requesterAdminId = (req.headers['x-admin-id'] as string) || req.body.adminId;
    if (requesterAdminId) {
      const admins = readAdmins();
      const admin = admins.find(
        (a) => a.id === requesterAdminId || a.email.toLowerCase() === requesterAdminId.toLowerCase()
      );
      if (admin && admin.role === 'restricted') {
        return res.status(403).json({
          success: false,
          message: 'Permission Denied: Only Master Admin can generate new QR inventory cards.',
        });
      }
    }

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
    const {
      businessName,
      googleReviewUrl,
      category,
      notes,
      status,
      aiReviewEnabled,
      assignedToEmail,
      assignedToUid,
      assignedToName,
    } = req.body;

    const cards = readCards();
    let index = cards.findIndex((c) => c.id.toLowerCase() === id.toLowerCase());

    if (index === -1) {
      const initial: CardRecord = {
        id,
        status: status || 'available',
        businessName: businessName !== undefined ? String(businessName).trim() : '',
        category: category !== undefined ? String(category).trim() : 'Local Business',
        googleReviewUrl: googleReviewUrl !== undefined ? String(googleReviewUrl).trim() : '',
        notes: notes !== undefined ? String(notes).trim() : '',
        scansCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      cards.push(initial);
      index = cards.length - 1;
    }

    // Sub-admin permission validation: restricted admins can only edit registered cards
    const requesterAdminId = (req.headers['x-admin-id'] as string) || req.body.adminId;
    if (requesterAdminId) {
      const admins = readAdmins();
      const admin = admins.find(
        (a) => a.id === requesterAdminId || a.email.toLowerCase() === requesterAdminId.toLowerCase()
      );
      if (admin && admin.role === 'restricted') {
        const canEdit = admin.assignedCardIds.some((cid) => cid.toLowerCase() === id.toLowerCase());
        if (!canEdit) {
          return res.status(403).json({
            success: false,
            message: `Restricted Access: Sub-admin ${admin.name} is only authorized to edit assigned cards [${admin.assignedCardIds.join(', ')}].`,
          });
        }
      }
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
          : (cards[index].aiReviewEnabled ?? false),
      status:
        status !== undefined
          ? status
          : (cards[index].status || (cards[index].businessName && cards[index].googleReviewUrl ? 'assigned' : 'available')),
      assignedToEmail: assignedToEmail !== undefined ? (assignedToEmail ? String(assignedToEmail).trim() : undefined) : cards[index].assignedToEmail,
      assignedToUid: assignedToUid !== undefined ? (assignedToUid ? String(assignedToUid).trim() : undefined) : cards[index].assignedToUid,
      assignedToName: assignedToName !== undefined ? (assignedToName ? String(assignedToName).trim() : undefined) : cards[index].assignedToName,
      customKeywords:
        req.body.customKeywords !== undefined
          ? (Array.isArray(req.body.customKeywords) ? req.body.customKeywords.map((k: string) => String(k).trim()).filter(Boolean) : [])
          : cards[index].customKeywords,
      reviewTone: req.body.reviewTone !== undefined ? req.body.reviewTone : cards[index].reviewTone,
      promptStarter: req.body.promptStarter !== undefined ? String(req.body.promptStarter).trim() : cards[index].promptStarter,
      customHeadline: req.body.customHeadline !== undefined ? String(req.body.customHeadline).trim() : cards[index].customHeadline,
      logoUrl: req.body.logoUrl !== undefined ? (req.body.logoUrl ? String(req.body.logoUrl).trim() : undefined) : cards[index].logoUrl,
      businessDescription: req.body.businessDescription !== undefined ? (req.body.businessDescription ? String(req.body.businessDescription).trim() : undefined) : cards[index].businessDescription,
      updatedAt: new Date().toISOString(),
    };

    writeCards(cards);

    // Sync with users storage
    if (assignedToEmail) {
      try {
        const users = readUsers();
        const target = users.find((u) => u.email.toLowerCase() === String(assignedToEmail).trim().toLowerCase());
        if (target) {
          if (!target.assignedCardIds) target.assignedCardIds = [];
          if (!target.assignedCardIds.includes(cards[index].id)) {
            target.assignedCardIds.push(cards[index].id);
            writeUsers(users);
          }
        }
      } catch (uErr) {
        console.warn('Could not update user assignedCardIds:', uErr);
      }
    }

    res.json({ success: true, card: cards[index] });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Assignment failed' });
  }
});

// REST API: Upload Business Logo with validation & persistent storage
app.post('/api/upload-logo', (req: Request, res: Response) => {
  try {
    const { image, dataUrl, fileName, cardId } = req.body;
    const rawImage = image || dataUrl;

    if (!rawImage || typeof rawImage !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'No image data provided. Please upload a valid image file.',
      });
    }

    // Match Base64 Data URL format and extract MIME type
    const matches = rawImage.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
    if (!matches) {
      return res.status(400).json({
        success: false,
        message: 'Invalid image format. Supported formats: PNG, JPG/JPEG, WebP.',
      });
    }

    const mimeSubtype = matches[1].toLowerCase();
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    // 2 MB size enforcement
    const MAX_SIZE_BYTES = 2 * 1024 * 1024;
    if (buffer.length > MAX_SIZE_BYTES) {
      return res.status(400).json({
        success: false,
        message: `File size exceeds the 2 MB limit (Current: ${(buffer.length / (1024 * 1024)).toFixed(2)} MB). Please select a smaller image.`,
      });
    }

    // Magic byte validation for actual file contents
    let ext = 'png';
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
    const isJpg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const isWebp =
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer.length > 12 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;

    if (isPng) {
      ext = 'png';
    } else if (isJpg) {
      ext = 'jpg';
    } else if (isWebp) {
      ext = 'webp';
    } else {
      // Fallback to validated header subtype if magic bytes are obscured
      if (['png', 'jpeg', 'jpg', 'webp'].includes(mimeSubtype)) {
        ext = mimeSubtype === 'jpeg' ? 'jpg' : mimeSubtype;
      } else {
        return res.status(400).json({
          success: false,
          message: 'Uploaded file is not a recognized PNG, JPEG, or WebP image.',
        });
      }
    }

    const cleanCard = (cardId ? String(cardId).replace(/[^a-zA-Z0-9_-]/g, '') : 'business').slice(0, 30);
    const uniqueName = `logo-${cleanCard}-${Date.now()}.${ext}`;
    const targetPath = path.join(UPLOADS_DIR, uniqueName);

    fs.writeFileSync(targetPath, buffer);
    const publicUrl = `/uploads/logos/${uniqueName}`;

    console.log(`✅ Business logo saved to disk: ${targetPath} (served at ${publicUrl})`);

    return res.json({
      success: true,
      url: publicUrl,
      fileName: uniqueName,
      sizeBytes: buffer.length,
      mimeType: `image/${ext}`,
    });
  } catch (err: any) {
    console.error('Logo upload error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to upload and store business logo.',
    });
  }
});

// REST API: Remove Business Logo
app.delete('/api/upload-logo', (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    if (typeof url === 'string' && url.startsWith('/uploads/logos/')) {
      const fileName = path.basename(url);
      const filePath = path.join(UPLOADS_DIR, fileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    return res.json({ success: true, message: 'Logo removed' });
  } catch {
    return res.json({ success: true });
  }
});

// REST API: Bulk update card statuses (Available / Assigned)
app.put('/api/cards/bulk-status', (req: Request, res: Response) => {
  try {
    const { ids, status } = req.body;
    if (!Array.isArray(ids) || !ids.length || !['available', 'assigned', 'disabled'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid bulk update parameters' });
    }

    const cards = readCards();
    const requesterAdminId = (req.headers['x-admin-id'] as string) || req.body.adminId;

    let allowedIds = new Set(ids.map((id: string) => id.toLowerCase()));
    if (requesterAdminId) {
      const admins = readAdmins();
      const admin = admins.find(
        (a) => a.id === requesterAdminId || a.email.toLowerCase() === requesterAdminId.toLowerCase()
      );
      if (admin && admin.role === 'restricted') {
        const authorizedSet = new Set(admin.assignedCardIds.map((cid) => cid.toLowerCase()));
        allowedIds = new Set([...allowedIds].filter((id) => authorizedSet.has(id)));
      }
    }

    const updatedCards: CardRecord[] = [];
    for (let i = 0; i < cards.length; i++) {
      if (allowedIds.has(cards[i].id.toLowerCase())) {
        cards[i] = {
          ...cards[i],
          status,
          updatedAt: new Date().toISOString(),
        };
        updatedCards.push(cards[i]);
      }
    }

    writeCards(cards);
    res.json({ success: true, count: updatedCards.length, cards: updatedCards });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Bulk update failed' });
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

// REST API: Get all admins
app.get('/api/admins', (_req: Request, res: Response) => {
  const admins = readAdmins();
  res.json({ success: true, admins });
});

// REST API: Create or register new sub-admin
app.post('/api/admins', (req: Request, res: Response) => {
  try {
    const { email, name, role = 'restricted', assignedCardIds = [], permissions } = req.body;
    if (!email || !name) {
      return res.status(400).json({ success: false, message: 'Email and name are required' });
    }

    const admins = readAdmins();
    const existing = admins.find((a) => a.email.toLowerCase() === email.toLowerCase().trim());
    if (existing) {
      return res.status(400).json({ success: false, message: `Admin with email ${email} already exists` });
    }

    const newAdmin: AdminUser = {
      id: `admin-${Date.now()}`,
      email: email.trim().toLowerCase(),
      name: name.trim(),
      role: role === 'master' ? 'master' : 'restricted',
      assignedCardIds: Array.isArray(assignedCardIds) ? assignedCardIds : [],
      permissions: {
        canEditCards: permissions?.canEditCards ?? true,
        canToggleAi: permissions?.canToggleAi ?? true,
        canExportCsv: permissions?.canExportCsv ?? false,
        canCreateCards: permissions?.canCreateCards ?? false,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    admins.push(newAdmin);
    writeAdmins(admins);
    res.json({ success: true, admin: newAdmin });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to create admin' });
  }
});

// REST API: Update sub-admin permissions and assigned cards
app.put('/api/admins/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, role, assignedCardIds, permissions } = req.body;

    const admins = readAdmins();
    const idx = admins.findIndex((a) => a.id === id || a.email.toLowerCase() === id.toLowerCase());

    if (idx === -1) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    admins[idx] = {
      ...admins[idx],
      name: name !== undefined ? name.trim() : admins[idx].name,
      role: role !== undefined ? role : admins[idx].role,
      assignedCardIds: assignedCardIds !== undefined ? assignedCardIds : admins[idx].assignedCardIds,
      permissions: permissions !== undefined ? { ...admins[idx].permissions, ...permissions } : admins[idx].permissions,
      updatedAt: new Date().toISOString(),
    };

    writeAdmins(admins);
    res.json({ success: true, admin: admins[idx] });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to update admin' });
  }
});

// REST API: Delete sub-admin
app.delete('/api/admins/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const admins = readAdmins();
    const target = admins.find((a) => a.id === id || a.email.toLowerCase() === id.toLowerCase());

    if (!target) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    if (target.role === 'master' && admins.filter((a) => a.role === 'master').length <= 1) {
      return res.status(400).json({ success: false, message: 'Cannot delete the primary Master Admin' });
    }

    const filtered = admins.filter((a) => a.id !== target.id);
    writeAdmins(filtered);
    res.json({ success: true, message: 'Admin removed successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to delete admin' });
  }
});

// ================= User Profiles & Google Verified Logins API =================

// REST API: Get all recorded users
app.get('/api/users', (_req: Request, res: Response) => {
  try {
    const users = readUsers();
    res.json({ success: true, users });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to fetch users' });
  }
});

// REST API: Save or Update User Profile on Google Login/Verification
app.post('/api/users', (req: Request, res: Response) => {
  try {
    const { uid, email, displayName, photoURL, provider, role, emailVerified, device } = req.body;
    if (!email || !uid) {
      return res.status(400).json({ success: false, message: 'Email and UID are required' });
    }

    const users = readUsers();
    const cleanEmail = String(email).trim().toLowerCase();
    const idx = users.findIndex((u) => u.uid === uid || u.email.toLowerCase() === cleanEmail);

    const now = new Date().toISOString();
    let updatedUser: UserProfile;

    // The primary account 66shashwatkumar66@gmail.com is always master
    const isMasterEmail = cleanEmail === '66shashwatkumar66@gmail.com';
    const computedRole = isMasterEmail ? 'master' : (role || (idx !== -1 ? users[idx].role : 'member'));

    if (idx !== -1) {
      updatedUser = {
        ...users[idx],
        uid: uid || users[idx].uid,
        email: cleanEmail,
        displayName: displayName ? String(displayName).trim() : users[idx].displayName,
        photoURL: photoURL || users[idx].photoURL,
        provider: provider || users[idx].provider || 'google.com',
        role: computedRole,
        emailVerified: emailVerified !== undefined ? Boolean(emailVerified) : true,
        lastLoginAt: now,
        loginCount: (users[idx].loginCount || 0) + 1,
        device: device || users[idx].device || 'Web Browser',
      };
      users[idx] = updatedUser;
    } else {
      updatedUser = {
        uid: String(uid).trim(),
        email: cleanEmail,
        displayName: displayName ? String(displayName).trim() : cleanEmail.split('@')[0],
        photoURL:
          photoURL ||
          `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(cleanEmail)}&backgroundColor=1a73e8&textColor=ffffff`,
        provider: provider || 'google.com',
        role: computedRole,
        emailVerified: emailVerified !== undefined ? Boolean(emailVerified) : true,
        lastLoginAt: now,
        createdAt: now,
        loginCount: 1,
        device: device || 'Web Browser',
        assignedCardIds: [],
      };
      users.push(updatedUser);
    }

    writeUsers(users);

    // If master or sub-admin, also keep admins.json synchronized
    if (computedRole === 'master' || computedRole === 'restricted') {
      const admins = readAdmins();
      const adminIdx = admins.findIndex((a) => a.email.toLowerCase() === cleanEmail || a.id === uid);
      if (adminIdx !== -1) {
        admins[adminIdx].name = updatedUser.displayName;
        admins[adminIdx].updatedAt = now;
      } else {
        admins.push({
          id: updatedUser.uid,
          email: updatedUser.email,
          name: updatedUser.displayName,
          role: computedRole,
          assignedCardIds: [],
          permissions: {
            canEditCards: true,
            canToggleAi: true,
            canExportCsv: computedRole === 'master',
            canCreateCards: computedRole === 'master',
          },
          createdAt: now,
          updatedAt: now,
        });
      }
      writeAdmins(admins);
    }

    res.json({ success: true, user: updatedUser });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to save user' });
  }
});

// REST API: Delete user
app.delete('/api/users/:uid', (req: Request, res: Response) => {
  try {
    const { uid } = req.params;
    const users = readUsers();
    const target = users.find((u) => u.uid === uid || u.email.toLowerCase() === uid.toLowerCase());
    if (!target) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (target.email.toLowerCase() === '66shashwatkumar66@gmail.com') {
      return res.status(400).json({ success: false, message: 'Cannot delete primary master account' });
    }
    const filtered = users.filter((u) => u.uid !== target.uid);
    writeUsers(filtered);
    res.json({ success: true, message: 'User removed successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to delete user' });
  }
});

// AI Review Generation Route using @google/genai (delegates to shared service)
app.post('/api/generate-review', async (req: Request, res: Response) => {
  try {
    const { cardId, aiReviewEnabled } = req.body;
    if (aiReviewEnabled === false) {
      return res.status(403).json({
        success: false,
        error: 'AI Review Assistant is disabled for this business stand.',
        message: 'AI Review Assistant is disabled for this business stand.',
      });
    }

    const enrichedPayload = { ...req.body };
    if (cardId) {
      const cards = readCards();
      const targetCard = cards.find((c) => c.id.toLowerCase() === String(cardId).trim().toLowerCase());
      if (targetCard) {
        if (targetCard.aiReviewEnabled === false) {
          return res.status(403).json({
            success: false,
            error: 'AI Review Assistant is disabled for this card configuration.',
            message: 'AI Review Assistant is disabled for this card configuration.',
          });
        }
        if (!enrichedPayload.businessName && targetCard.businessName) {
          enrichedPayload.businessName = targetCard.businessName;
        }
        if (!enrichedPayload.category && targetCard.category) {
          enrichedPayload.category = targetCard.category;
        }
        if (!enrichedPayload.businessDescription) {
          enrichedPayload.businessDescription =
            targetCard.businessDescription || targetCard.promptStarter || targetCard.notes;
        }
      }
    }

    const result = await generateReviewWithGemini(enrichedPayload);
    if (!result.success && result.error) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (error: any) {
    console.error('Error generating review:', error);
    res.status(500).json({ success: false, message: error?.message || 'Failed to generate review' });
  }
});


// ================= Advertisement Management REST API =================

// Helper to check if requester is Master Admin
function isMasterAdminReq(req: Request): boolean {
  const adminEmail = (req.headers['x-admin-email'] as string) || (req.body && req.body.adminEmail);
  if (adminEmail) {
    const clean = String(adminEmail).trim().toLowerCase();
    if (clean === '66shashwatkumar66@gmail.com') return true;
    const admins = readAdmins();
    const admin = admins.find((a) => a.email.toLowerCase() === clean);
    return Boolean(admin && admin.role === 'master');
  }
  const adminId = (req.headers['x-admin-id'] as string) || (req.body && req.body.adminId);
  if (adminId) {
    const admins = readAdmins();
    const admin = admins.find((a) => a.id === adminId || a.email.toLowerCase() === adminId.toLowerCase());
    return Boolean(admin && admin.role === 'master');
  }
  return true;
}

// GET /api/ads: Fetch ads (filtered if public query)
app.get('/api/ads', (req: Request, res: Response) => {
  try {
    const isPublic = req.query.public === 'true';
    const ads = readAds();
    if (isPublic) {
      const now = Date.now();
      const eligible = ads.filter((ad) => {
        if (ad.status !== 'active') return false;
        if (ad.placement === 'disabled') return false;
        if (ad.startDate) {
          const s = new Date(ad.startDate).getTime();
          if (!isNaN(s) && now < s) return false;
        }
        if (ad.endDate) {
          const e = new Date(ad.endDate).getTime();
          if (!isNaN(e) && now > e) return false;
        }
        return true;
      }).sort((a, b) => (b.priority || 0) - (a.priority || 0));
      return res.json({ success: true, ads: eligible });
    }
    return res.json({ success: true, ads: ads.sort((a, b) => (b.priority || 0) - (a.priority || 0)) });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to fetch ads' });
  }
});

// POST /api/ads: Create or update ad (Master Admin only)
app.post('/api/ads', (req: Request, res: Response) => {
  try {
    if (!isMasterAdminReq(req)) {
      return res.status(403).json({ success: false, message: 'Forbidden: Master Admin access required for advertising management.' });
    }
    const { id, name, advertiser, headline, description, imageUrl, targetUrl, ctaText, placement, status, startDate, endDate, priority } = req.body;
    if (!name || !targetUrl) {
      return res.status(400).json({ success: false, message: 'Ad name and destination URL are required.' });
    }
    const cleanUrl = String(targetUrl).trim();
    if (!cleanUrl.toLowerCase().startsWith('https://') && !cleanUrl.toLowerCase().startsWith('http://')) {
      return res.status(400).json({ success: false, message: 'Destination URL must begin with https:// or http://' });
    }

    const ads = readAds();
    const now = new Date().toISOString();
    const adId = id || `ad-${Date.now().toString(36)}`;
    const idx = ads.findIndex((a) => a.id === adId);

    const fullAd = {
      id: adId,
      name: String(name).trim(),
      advertiser: String(advertiser || 'Sponsored').trim(),
      headline: String(headline || '').trim(),
      description: description ? String(description).trim() : undefined,
      imageUrl: imageUrl ? String(imageUrl).trim() : undefined,
      targetUrl: cleanUrl,
      ctaText: ctaText ? String(ctaText).trim() : 'Learn More',
      placement: ['below_biz_info', 'between_sections', 'below_draft', 'footer', 'disabled'].includes(placement) ? placement : 'below_draft',
      status: status === 'paused' ? 'paused' : 'active',
      startDate: startDate ? String(startDate).trim() : undefined,
      endDate: endDate ? String(endDate).trim() : undefined,
      priority: Number(priority) || 10,
      impressions: idx !== -1 ? (ads[idx].impressions || 0) : 0,
      clicks: idx !== -1 ? (ads[idx].clicks || 0) : 0,
      createdAt: idx !== -1 ? ads[idx].createdAt : now,
      updatedAt: now,
    };

    if (idx !== -1) {
      ads[idx] = fullAd;
    } else {
      ads.push(fullAd);
    }

    writeAds(ads);
    res.json({ success: true, ad: fullAd });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to save ad' });
  }
});

// DELETE /api/ads/:id: Delete ad (Master Admin only)
app.delete('/api/ads/:id', (req: Request, res: Response) => {
  try {
    if (!isMasterAdminReq(req)) {
      return res.status(403).json({ success: false, message: 'Forbidden: Master Admin access required.' });
    }
    const { id } = req.params;
    const ads = readAds();
    const filtered = ads.filter((a) => a.id !== id);
    writeAds(filtered);
    res.json({ success: true, message: 'Ad deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to delete ad' });
  }
});

// POST /api/ads/:id/impression: Safe impression recording
app.post('/api/ads/:id/impression', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const ads = readAds();
    const target = ads.find((a) => a.id === id);
    if (target) {
      target.impressions = (target.impressions || 0) + 1;
      writeAds(ads);
    }
    res.json({ success: true });
  } catch {
    res.json({ success: true });
  }
});

// POST /api/ads/:id/click: Safe click recording
app.post('/api/ads/:id/click', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const ads = readAds();
    const target = ads.find((a) => a.id === id);
    if (target) {
      target.clicks = (target.clicks || 0) + 1;
      writeAds(ads);
    }
    res.json({ success: true });
  } catch {
    res.json({ success: true });
  }
});



// Root URL handler: If opened with ?card=... or ?r=..., immediately redirect if assigned!
app.get('/', (req: Request, res: Response, next) => {
  try {
    const queryCard = req.query.card || req.query.r;
    if (typeof queryCard === 'string' && queryCard.trim()) {
      const cardId = queryCard.trim();
      const cards = readCards();
      const card = cards.find((c) => c.id.toLowerCase() === cardId.toLowerCase());
      if (card) {
        card.scansCount = (card.scansCount || 0) + 1;
        card.updatedAt = new Date().toISOString();
        writeCards(cards);

        // Only redirect directly if ?direct=true is explicitly provided
        if ((req.query.direct === 'true' || req.query.direct === '1') && card.googleReviewUrl) {
          return res.redirect(302, card.googleReviewUrl);
        }
      }
    }
  } catch (err) {
    console.error('Error handling root query redirect:', err);
  }
  next();
});

// Customer Short URL Route: /r/:id, /c/:id, /review/:id, /nfc/:id
app.get(['/r/:id', '/c/:id', '/review/:id', '/nfc/:id'], (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;
    const cards = readCards();
    const card = cards.find((c) => c.id.toLowerCase() === id.toLowerCase());

    if (card) {
      // Record scan analytics count
      card.scansCount = (card.scansCount || 0) + 1;
      card.updatedAt = new Date().toISOString();
      writeCards(cards);

      // Only redirect directly to Google if ?direct=true is requested
      if ((req.query.direct === 'true' || req.query.direct === '1') && card.googleReviewUrl) {
        return res.redirect(302, card.googleReviewUrl);
      }
    }
  } catch (err) {
    console.error('Error handling /r/:id route:', err);
  }

  // Hand over to the client SPA so the customer lands on the AI Review Generation Page
  next();
});

// Explicit 404 JSON response for any unmatched API endpoints (prevents HTML fallback)
app.all('/api/*', (req: Request, res: Response) => {
  res.status(404).json({ success: false, message: `Endpoint ${req.method} ${req.path} not found` });
});


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
