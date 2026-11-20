import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  collection,
  updateDoc,
  setDoc,
  increment,
} from 'firebase/firestore';
import { generateReviewWithGemini } from './src/services/reviewGenerator';
import {
  getSubscriptionStatus,
  isSubscriptionAccessible,
  validateSubscriptionDates,
} from './src/utils/subscription';

dotenv.config();

const MASTER_ADMIN_EMAIL = '66shashwatkumar66@gmail.com';
const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'cards.json');
const ADMINS_FILE = path.join(DATA_DIR, 'admins.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ADS_FILE = path.join(DATA_DIR, 'ads.json');
const UPLOADS_DIR = path.resolve(process.cwd(), 'public', 'uploads', 'logos');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Load Firebase applet configuration for authoritative live Firestore lookups and ID token verification
let firebaseAppletConfig: Record<string, any> = {};
try {
  const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(cfgPath)) {
    firebaseAppletConfig = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
  }
} catch (err) {
  console.warn('[Server] Could not load firebase-applet-config.json:', err);
}

let serverDb: ReturnType<typeof getFirestore> | null = null;
try {
  if (firebaseAppletConfig.projectId && firebaseAppletConfig.apiKey) {
    const existingApp = getApps().find((a) => a.name === 'server-firestore');
    const fbApp = existingApp || initializeApp(firebaseAppletConfig, 'server-firestore');
    serverDb = firebaseAppletConfig.firestoreDatabaseId
      ? getFirestore(fbApp, firebaseAppletConfig.firestoreDatabaseId)
      : getFirestore(fbApp);
  }
} catch (err) {
  console.warn('[Server] Firestore client initialization warning:', err);
}

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use('/uploads', express.static(path.resolve(process.cwd(), 'public', 'uploads')));

// Security & CORS headers
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-id');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

export interface CardRecord {
  id: string;
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
  whatsapp?: string;
  instagram?: string;
  subscriptionStartDate?: string;
  subscriptionEndDate?: string;
  subscriptionStatus?: 'unconfigured' | 'upcoming' | 'active' | 'expired';
  scansCount: number;
  lastScannedAt?: string;
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

interface VerifiedAuthUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  isMaster: boolean;
}

interface AuthenticatedRequest extends Request {
  authUser?: VerifiedAuthUser;
}

/**
 * Verifies a Firebase Auth ID token against Google Identity Toolkit.
 * Never defaults to authorized if missing or invalid.
 */
async function verifyFirebaseIdToken(req: Request): Promise<VerifiedAuthUser | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const idToken = authHeader.slice(7).trim();
  if (!idToken || idToken.length < 20) {
    return null;
  }

  const apiKey = firebaseAppletConfig.apiKey || process.env.VITE_FIREBASE_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
        signal: controller.signal,
      }
    );
    clearTimeout(timer);

    if (!resp.ok) {
      return null;
    }

    const data: any = await resp.json();
    const user = Array.isArray(data?.users) ? data.users[0] : null;
    if (!user || !user.localId || !user.email) {
      return null;
    }

    const cleanEmail = String(user.email).trim().toLowerCase();
    const emailVerified = Boolean(user.emailVerified);
    return {
      uid: String(user.localId),
      email: cleanEmail,
      emailVerified,
      isMaster: emailVerified && cleanEmail === MASTER_ADMIN_EMAIL,
    };
  } catch {
    return null;
  }
}

async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const verified = await verifyFirebaseIdToken(req);
  if (!verified) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Please sign in with your verified Google account.',
    });
  }
  req.authUser = verified;
  next();
}

async function requireMasterAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const verified = await verifyFirebaseIdToken(req);
  if (!verified) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Please sign in with your verified Google account.',
    });
  }
  if (!verified.isMaster) {
    return res.status(403).json({
      success: false,
      message: 'Forbidden: Master Admin access is required for this operation.',
    });
  }
  req.authUser = verified;
  next();
}

/**
 * Strips private owner/internal admin fields before returning a card to public endpoints.
 */
function sanitizePublicCard(card: CardRecord) {
  return {
    id: card.id,
    status: card.status,
    businessName: card.businessName,
    category: card.category,
    googleReviewUrl: card.googleReviewUrl,
    aiReviewEnabled: card.aiReviewEnabled,
    customKeywords: card.customKeywords,
    reviewTone: card.reviewTone,
    promptStarter: card.promptStarter,
    customHeadline: card.customHeadline,
    logoUrl: card.logoUrl,
    businessDescription: card.businessDescription,
    whatsapp: card.whatsapp,
    instagram: card.instagram,
    subscriptionStartDate: card.subscriptionStartDate,
    subscriptionEndDate: card.subscriptionEndDate,
    subscriptionStatus: card.subscriptionStatus,
    scansCount: card.scansCount || 0,
    lastScannedAt: card.lastScannedAt,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
  };
}

/**
 * Authoritative server-side card lookup: Cloud Firestore FIRST, local JSON fallback only on network outage.
 */
async function fetchAuthoritativeCardServer(cardId: string): Promise<{
  card: CardRecord | null;
  source: 'firestore' | 'local' | 'none';
}> {
  const cleanId = String(cardId || '').trim();
  if (!cleanId || !/^[a-zA-Z0-9_-]{1,32}$/.test(cleanId)) {
    return { card: null, source: 'none' };
  }

  if (serverDb) {
    try {
      const snap = await getDoc(doc(serverDb, 'cards', cleanId));
      if (snap.exists()) {
        const data = snap.data() as Omit<CardRecord, 'id'>;
        return {
          card: { id: snap.id, ...data } as CardRecord,
          source: 'firestore',
        };
      }
      // Confirmed absent in authoritative Firestore
      return { card: null, source: 'firestore' };
    } catch (err) {
      console.warn(`[Server] Firestore lookup error for card ${cleanId}, checking local cache:`, err);
    }
  }

  const localCards = readCards();
  const found = localCards.find((c) => c.id.toLowerCase() === cleanId.toLowerCase()) || null;
  return { card: found, source: found ? 'local' : 'none' };
}

/**
 * Records a direct-redirect scan in live Cloud Firestore (scansCount +1 + immutable scan_logs doc).
 */
async function recordServerDirectScan(card: CardRecord, source: 'qr' | 'nfc' | 'direct', outcome: string): Promise<void> {
  if (!serverDb) return;
  try {
    const now = new Date().toISOString();
    await updateDoc(doc(serverDb, 'cards', card.id), {
      scansCount: increment(1),
      updatedAt: now,
      lastScannedAt: now,
    });

    const logId = `scan_${card.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const logDoc: Record<string, any> = {
      id: logId,
      cardId: card.id,
      businessName: card.businessName || '',
      category: card.category || '',
      scannedAt: now,
      source,
      outcome,
      subscriptionStatus: getSubscriptionStatus(card),
      path: `/r/${card.id}`,
    };
    if (card.assignedToEmail) logDoc.assignedToEmail = card.assignedToEmail.trim().toLowerCase();
    if (card.assignedToUid) logDoc.assignedToUid = card.assignedToUid.trim();

    await setDoc(doc(serverDb, 'scan_logs', logId), logDoc);
  } catch (err) {
    console.warn(`[Server] Direct scan log write skipped for card ${card.id}:`, err);
  }
}

// ---------------- Local Fallback File Helpers (Never Overwrite Live Firestore) ----------------

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJsonArray<T>(filePath: string): T[] {
  try {
    ensureDataDir();
    if (!fs.existsSync(filePath)) return [];
    const data = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch (err) {
    console.error(`Error reading ${path.basename(filePath)}:`, err);
    return [];
  }
}

function writeJsonArray<T>(filePath: string, items: T[]): void {
  try {
    ensureDataDir();
    fs.writeFileSync(filePath, JSON.stringify(items, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Error writing ${path.basename(filePath)}:`, err);
  }
}

function readCards(): CardRecord[] {
  return readJsonArray<CardRecord>(DATA_FILE);
}
function writeCards(cards: CardRecord[]): void {
  writeJsonArray(DATA_FILE, cards);
}
function readAdmins(): AdminUser[] {
  return readJsonArray<AdminUser>(ADMINS_FILE);
}
function writeAdmins(admins: AdminUser[]): void {
  writeJsonArray(ADMINS_FILE, admins);
}
function readUsers(): UserProfile[] {
  return readJsonArray<UserProfile>(USERS_FILE);
}
function writeUsers(users: UserProfile[]): void {
  writeJsonArray(USERS_FILE, users);
}
function readAds(): any[] {
  return readJsonArray<any>(ADS_FILE);
}
function writeAds(ads: any[]): void {
  writeJsonArray(ADS_FILE, ads);
}

// ================= Health Check =================

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    success: true,
    status: 'ok',
    database: serverDb ? 'firestore' : 'local_fallback',
    aiConfigured: Boolean(process.env.GEMINI_API_KEY),
    timestamp: new Date().toISOString(),
  });
});

// ================= Cards REST API =================

// Master Admin only: Get all cached cards
app.get('/api/cards', requireMasterAdmin, (_req: AuthenticatedRequest, res: Response) => {
  const cards = readCards();
  res.json({ success: true, cards });
});

// Public endpoint: Get single card by ID from LIVE Cloud Firestore (sanitized, no admin PII)
app.get('/api/cards/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { card } = await fetchAuthoritativeCardServer(id);

  if (!card) {
    return res.status(404).json({ success: false, message: `Card ${id} not found` });
  }

  const subCheck = isSubscriptionAccessible(card);
  const publicCard = sanitizePublicCard({
    ...card,
    subscriptionStatus: subCheck.status,
  });

  if (req.query.scan === 'true') {
    const outcome =
      card.status === 'disabled'
        ? 'disabled'
        : card.status === 'available'
          ? 'unassigned'
          : subCheck.accessible
            ? 'allowed'
            : subCheck.status === 'upcoming'
              ? 'upcoming'
              : 'expired';
    recordServerDirectScan(card, 'qr', outcome).catch(() => {});
  }

  return res.json({
    success: true,
    card: publicCard,
    subscriptionAccessible: card.status !== 'disabled' && subCheck.accessible,
    subscriptionStatus: subCheck.status,
    subscriptionMessage:
      card.status === 'disabled'
        ? 'This QR stand is currently disabled. Please contact the business for assistance.'
        : subCheck.customerMessage,
  });
});

// Master Admin only: Create batch cards
app.post('/api/cards/batch', requireMasterAdmin, (req: AuthenticatedRequest, res: Response) => {
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
        const now = new Date().toISOString();
        const newCard: CardRecord = {
          id: candidateId,
          status: 'available',
          businessName: '',
          category: '',
          googleReviewUrl: '',
          notes: `Batch created ${new Date().toLocaleDateString()}`,
          scansCount: 0,
          createdAt: now,
          updatedAt: now,
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

// Authenticated Admin/Owner: Assign or update card details (enforces ownership and Master-only fields)
app.put('/api/cards/:id/assign', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const authUser = req.authUser!;
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
      subscriptionStartDate,
      subscriptionEndDate,
    } = req.body;

    const cards = readCards();
    let index = cards.findIndex((c) => c.id.toLowerCase() === id.toLowerCase());

    if (index === -1) {
      if (!authUser.isMaster) {
        return res.status(403).json({
          success: false,
          message: 'Permission Denied: Only Master Admin can create new QR cards.',
        });
      }
      const now = new Date().toISOString();
      cards.push({
        id,
        status: status || 'available',
        businessName: businessName !== undefined ? String(businessName).trim() : '',
        category: category !== undefined ? String(category).trim() : 'Local Business',
        googleReviewUrl: googleReviewUrl !== undefined ? String(googleReviewUrl).trim() : '',
        notes: notes !== undefined ? String(notes).trim() : '',
        scansCount: 0,
        createdAt: now,
        updatedAt: now,
      });
      index = cards.length - 1;
    }

    const existingCard = cards[index];

    // Enforce Sub-Admin ownership & Master-only field protection
    if (!authUser.isMaster) {
      const ownsCard =
        (existingCard.assignedToEmail &&
          existingCard.assignedToEmail.toLowerCase() === authUser.email) ||
        (existingCard.assignedToUid && existingCard.assignedToUid === authUser.uid);

      if (!ownsCard) {
        return res.status(403).json({
          success: false,
          message: 'Permission Denied: You are only authorized to edit your assigned cards.',
        });
      }

      if (
        assignedToEmail !== undefined ||
        assignedToUid !== undefined ||
        assignedToName !== undefined ||
        subscriptionStartDate !== undefined ||
        subscriptionEndDate !== undefined ||
        status === 'disabled'
      ) {
        return res.status(403).json({
          success: false,
          message: 'Permission Denied: Only Master Admin can modify ownership, subscription dates, or disable cards.',
        });
      }
    }

    if (subscriptionStartDate !== undefined || subscriptionEndDate !== undefined) {
      const startCandidate =
        subscriptionStartDate !== undefined
          ? subscriptionStartDate
            ? String(subscriptionStartDate).trim()
            : null
          : existingCard.subscriptionStartDate || null;
      const endCandidate =
        subscriptionEndDate !== undefined
          ? subscriptionEndDate
            ? String(subscriptionEndDate).trim()
            : null
          : existingCard.subscriptionEndDate || null;

      const valRes = validateSubscriptionDates(startCandidate, endCandidate);
      if (!valRes.valid) {
        return res.status(400).json({ success: false, message: valRes.error });
      }
    }

    const effectiveStart =
      authUser.isMaster && subscriptionStartDate !== undefined
        ? subscriptionStartDate
          ? String(subscriptionStartDate).trim()
          : undefined
        : existingCard.subscriptionStartDate;
    const effectiveEnd =
      authUser.isMaster && subscriptionEndDate !== undefined
        ? subscriptionEndDate
          ? String(subscriptionEndDate).trim()
          : undefined
        : existingCard.subscriptionEndDate;
    const computedSubStatus = getSubscriptionStatus({
      subscriptionStartDate: effectiveStart,
      subscriptionEndDate: effectiveEnd,
    });

    cards[index] = {
      ...existingCard,
      businessName: businessName !== undefined ? String(businessName).trim() : existingCard.businessName,
      googleReviewUrl:
        googleReviewUrl !== undefined ? String(googleReviewUrl).trim() : existingCard.googleReviewUrl,
      category: category !== undefined ? String(category).trim() : existingCard.category,
      notes: notes !== undefined ? String(notes).trim() : existingCard.notes,
      aiReviewEnabled:
        aiReviewEnabled !== undefined
          ? Boolean(aiReviewEnabled)
          : existingCard.aiReviewEnabled ?? true,
      status: status !== undefined ? status : existingCard.status,
      assignedToEmail: authUser.isMaster && assignedToEmail !== undefined
        ? assignedToEmail
          ? String(assignedToEmail).trim().toLowerCase()
          : undefined
        : existingCard.assignedToEmail,
      assignedToUid: authUser.isMaster && assignedToUid !== undefined
        ? assignedToUid
          ? String(assignedToUid).trim()
          : undefined
        : existingCard.assignedToUid,
      assignedToName: authUser.isMaster && assignedToName !== undefined
        ? assignedToName
          ? String(assignedToName).trim()
          : undefined
        : existingCard.assignedToName,
      customKeywords:
        req.body.customKeywords !== undefined
          ? Array.isArray(req.body.customKeywords)
            ? req.body.customKeywords.map((k: string) => String(k).trim()).filter(Boolean)
            : []
          : existingCard.customKeywords,
      reviewTone: req.body.reviewTone !== undefined ? req.body.reviewTone : existingCard.reviewTone,
      promptStarter:
        req.body.promptStarter !== undefined
          ? String(req.body.promptStarter).trim()
          : existingCard.promptStarter,
      customHeadline:
        req.body.customHeadline !== undefined
          ? String(req.body.customHeadline).trim()
          : existingCard.customHeadline,
      logoUrl:
        req.body.logoUrl !== undefined
          ? req.body.logoUrl
            ? String(req.body.logoUrl).trim()
            : undefined
          : existingCard.logoUrl,
      businessDescription:
        req.body.businessDescription !== undefined
          ? req.body.businessDescription
            ? String(req.body.businessDescription).trim()
            : undefined
          : existingCard.businessDescription,
      whatsapp:
        req.body.whatsapp !== undefined
          ? req.body.whatsapp
            ? String(req.body.whatsapp).trim()
            : undefined
          : existingCard.whatsapp,
      instagram:
        req.body.instagram !== undefined
          ? req.body.instagram
            ? String(req.body.instagram).trim()
            : undefined
          : existingCard.instagram,
      subscriptionStartDate: effectiveStart,
      subscriptionEndDate: effectiveEnd,
      subscriptionStatus: computedSubStatus,
      scansCount: existingCard.scansCount || 0,
      createdAt: existingCard.createdAt,
      updatedAt: new Date().toISOString(),
    };

    writeCards(cards);
    res.json({ success: true, card: cards[index] });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Assignment failed' });
  }
});

// Authenticated Admin/Owner: Upload Business Logo with strict magic-byte & size validation
app.post('/api/upload-logo', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { image, dataUrl, cardId } = req.body;
    const rawImage = image || dataUrl;

    if (!rawImage || typeof rawImage !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'No image data provided. Please upload a valid PNG, JPEG, or WebP file.',
      });
    }

    const matches = rawImage.match(/^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/i);
    if (!matches) {
      return res.status(400).json({
        success: false,
        message: 'Invalid image format. Supported formats: PNG, JPG/JPEG, WebP.',
      });
    }

    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    const MAX_SIZE_BYTES = 2 * 1024 * 1024;
    if (buffer.length === 0 || buffer.length > MAX_SIZE_BYTES) {
      return res.status(400).json({
        success: false,
        message: `File size must be under 2 MB (received ${(buffer.length / (1024 * 1024)).toFixed(2)} MB).`,
      });
    }

    // Strict magic byte verification — reject spoofed non-image payloads
    const isPng =
      buffer.length > 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47;
    const isJpg =
      buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const isWebp =
      buffer.length > 12 &&
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50;

    let ext: 'png' | 'jpg' | 'webp' | null = null;
    if (isPng) ext = 'png';
    else if (isJpg) ext = 'jpg';
    else if (isWebp) ext = 'webp';

    if (!ext) {
      return res.status(400).json({
        success: false,
        message: 'File signature check failed: payload is not a genuine PNG, JPEG, or WebP image.',
      });
    }

    const cleanCard = (cardId ? String(cardId).replace(/[^a-zA-Z0-9_-]/g, '') : 'business').slice(0, 30);
    const uniqueName = `logo-${cleanCard}-${Date.now()}.${ext}`;
    const targetPath = path.resolve(UPLOADS_DIR, uniqueName);
    if (!targetPath.startsWith(UPLOADS_DIR)) {
      return res.status(400).json({ success: false, message: 'Invalid filename.' });
    }

    fs.writeFileSync(targetPath, buffer);
    const publicUrl = `/uploads/logos/${uniqueName}`;

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
      message: 'Failed to upload and store business logo.',
    });
  }
});

// Authenticated Admin/Owner: Remove Business Logo
app.delete('/api/upload-logo', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { url } = req.body;
    if (typeof url === 'string' && url.startsWith('/uploads/logos/')) {
      const fileName = path.basename(url);
      const filePath = path.resolve(UPLOADS_DIR, fileName);
      if (filePath.startsWith(UPLOADS_DIR) && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    return res.json({ success: true, message: 'Logo removed' });
  } catch {
    return res.json({ success: true });
  }
});

// Master Admin only: Bulk update card statuses
app.put('/api/cards/bulk-status', requireMasterAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { ids, status } = req.body;
    if (!Array.isArray(ids) || !ids.length || !['available', 'assigned', 'disabled'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid bulk update parameters' });
    }

    const cards = readCards();
    const allowedIds = new Set(ids.map((id: string) => String(id).toLowerCase()));
    const updatedCards: CardRecord[] = [];
    const now = new Date().toISOString();

    for (let i = 0; i < cards.length; i++) {
      if (allowedIds.has(cards[i].id.toLowerCase())) {
        cards[i] = { ...cards[i], status, updatedAt: now };
        updatedCards.push(cards[i]);
      }
    }

    writeCards(cards);
    res.json({ success: true, count: updatedCards.length, cards: updatedCards });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Bulk update failed' });
  }
});

// Master Admin only: Delete card
app.delete('/api/cards/:id', requireMasterAdmin, (req: AuthenticatedRequest, res: Response) => {
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

// ================= Admin Management REST API (Master Admin Only) =================

app.get('/api/admins', requireMasterAdmin, (_req: AuthenticatedRequest, res: Response) => {
  res.json({ success: true, admins: readAdmins() });
});

app.post('/api/admins', requireMasterAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, name, role = 'restricted', assignedCardIds = [], permissions } = req.body;
    if (!email || !name) {
      return res.status(400).json({ success: false, message: 'Email and name are required' });
    }

    const admins = readAdmins();
    const cleanEmail = String(email).trim().toLowerCase();
    if (admins.some((a) => a.email.toLowerCase() === cleanEmail)) {
      return res.status(400).json({ success: false, message: `Admin with email ${cleanEmail} already exists` });
    }

    const now = new Date().toISOString();
    const newAdmin: AdminUser = {
      id: `admin-${Date.now()}`,
      email: cleanEmail,
      name: String(name).trim(),
      role: role === 'master' ? 'master' : 'restricted',
      assignedCardIds: Array.isArray(assignedCardIds) ? assignedCardIds : [],
      permissions: {
        canEditCards: permissions?.canEditCards ?? true,
        canToggleAi: permissions?.canToggleAi ?? true,
        canExportCsv: permissions?.canExportCsv ?? false,
        canCreateCards: permissions?.canCreateCards ?? false,
      },
      createdAt: now,
      updatedAt: now,
    };

    admins.push(newAdmin);
    writeAdmins(admins);
    res.json({ success: true, admin: newAdmin });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to create admin' });
  }
});

app.put('/api/admins/:id', requireMasterAdmin, (req: AuthenticatedRequest, res: Response) => {
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
      name: name !== undefined ? String(name).trim() : admins[idx].name,
      role: role !== undefined ? role : admins[idx].role,
      assignedCardIds: assignedCardIds !== undefined ? assignedCardIds : admins[idx].assignedCardIds,
      permissions:
        permissions !== undefined ? { ...admins[idx].permissions, ...permissions } : admins[idx].permissions,
      updatedAt: new Date().toISOString(),
    };

    writeAdmins(admins);
    res.json({ success: true, admin: admins[idx] });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to update admin' });
  }
});

app.delete('/api/admins/:id', requireMasterAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const admins = readAdmins();
    const target = admins.find((a) => a.id === id || a.email.toLowerCase() === id.toLowerCase());
    if (!target) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }
    if (target.email.toLowerCase() === MASTER_ADMIN_EMAIL) {
      return res.status(400).json({ success: false, message: 'Cannot delete the primary Master Admin' });
    }

    writeAdmins(admins.filter((a) => a.id !== target.id));
    res.json({ success: true, message: 'Admin removed successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to delete admin' });
  }
});

// ================= User Profiles REST API (Master Admin Only) =================

app.get('/api/users', requireMasterAdmin, (_req: AuthenticatedRequest, res: Response) => {
  res.json({ success: true, users: readUsers() });
});

app.post('/api/users', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const authUser = req.authUser!;
    const { uid, email, displayName, photoURL, provider, role, device } = req.body;
    const targetUid = authUser.isMaster && uid ? String(uid).trim() : authUser.uid;
    const targetEmail = authUser.isMaster && email ? String(email).trim().toLowerCase() : authUser.email;

    const users = readUsers();
    const idx = users.findIndex((u) => u.uid === targetUid || u.email.toLowerCase() === targetEmail);
    const now = new Date().toISOString();

    const isMasterEmail = targetEmail === MASTER_ADMIN_EMAIL;
    const computedRole: UserProfile['role'] = isMasterEmail
      ? 'master'
      : authUser.isMaster && role
        ? role
        : idx !== -1
          ? users[idx].role
          : 'member';

    const updatedUser: UserProfile =
      idx !== -1
        ? {
            ...users[idx],
            uid: targetUid,
            email: targetEmail,
            displayName: displayName ? String(displayName).trim() : users[idx].displayName,
            photoURL: photoURL || users[idx].photoURL,
            provider: provider || users[idx].provider || 'google.com',
            role: computedRole,
            emailVerified: authUser.emailVerified,
            lastLoginAt: now,
            loginCount: (users[idx].loginCount || 0) + 1,
            device: device || users[idx].device || 'Web Browser',
          }
        : {
            uid: targetUid,
            email: targetEmail,
            displayName: displayName ? String(displayName).trim() : targetEmail.split('@')[0],
            photoURL:
              photoURL ||
              `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(targetEmail)}&backgroundColor=1a73e8&textColor=ffffff`,
            provider: provider || 'google.com',
            role: computedRole,
            emailVerified: authUser.emailVerified,
            lastLoginAt: now,
            createdAt: now,
            loginCount: 1,
            device: device || 'Web Browser',
            assignedCardIds: [],
          };

    if (idx !== -1) users[idx] = updatedUser;
    else users.push(updatedUser);

    writeUsers(users);
    res.json({ success: true, user: updatedUser });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to save user' });
  }
});

app.delete('/api/users/:uid', requireMasterAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { uid } = req.params;
    const users = readUsers();
    const target = users.find((u) => u.uid === uid || u.email.toLowerCase() === uid.toLowerCase());
    if (!target) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (target.email.toLowerCase() === MASTER_ADMIN_EMAIL) {
      return res.status(400).json({ success: false, message: 'Cannot delete primary master account' });
    }
    writeUsers(users.filter((u) => u.uid !== target.uid));
    res.json({ success: true, message: 'User removed successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to delete user' });
  }
});

// ================= AI Review Generation Route (Live Firestore Validated + Gemini 4) =================

app.post('/api/generate-review', async (req: Request, res: Response) => {
  try {
    const { cardId, aiReviewEnabled, language, tone } = req.body || {};

    if (aiReviewEnabled === false) {
      return res.status(403).json({
        success: false,
        error: 'AI Review Assistant is disabled for this business stand.',
        message: 'AI Review Assistant is disabled for this business stand.',
      });
    }

    if (!language || !tone) {
      return res.status(400).json({
        success: false,
        error: 'Select your preferred language and tone to generate your review.',
        message: 'Select your preferred language and tone to generate your review.',
      });
    }

    const enrichedPayload = { ...req.body };

    if (cardId) {
      const { card: targetCard } = await fetchAuthoritativeCardServer(String(cardId));
      if (targetCard) {
        if (targetCard.status === 'disabled') {
          return res.status(403).json({
            success: false,
            error: 'This QR stand is currently disabled. Please contact the business for assistance.',
            message: 'This QR stand is currently disabled. Please contact the business for assistance.',
          });
        }

        const subCheck = isSubscriptionAccessible(targetCard);
        if (!subCheck.accessible) {
          return res.status(403).json({
            success: false,
            error: subCheck.customerMessage || 'This QR subscription is not active.',
            message: subCheck.customerMessage || 'This QR subscription is not active.',
            subscriptionStatus: subCheck.status,
          });
        }

        if (targetCard.aiReviewEnabled === false) {
          return res.status(403).json({
            success: false,
            error: 'AI Review Assistant is disabled for this card configuration.',
            message: 'AI Review Assistant is disabled for this card configuration.',
          });
        }

        // Authoritative business details from Firestore override untrusted client values when present
        if (targetCard.businessName) {
          enrichedPayload.businessName = targetCard.businessName;
        }
        if (targetCard.category) {
          enrichedPayload.category = targetCard.category;
        }
        if (!enrichedPayload.businessDescription) {
          enrichedPayload.businessDescription =
            targetCard.businessDescription || targetCard.promptStarter || undefined;
        }
      }
    }

    const result = await generateReviewWithGemini(enrichedPayload);
    if (!result.success) {
      const statusCode = result.error?.includes('disabled')
        ? 403
        : result.error?.includes('Select your preferred')
          ? 400
          : 502;
      return res.status(statusCode).json(result);
    }

    return res.json(result);
  } catch (error: any) {
    console.error('Error generating review:', error?.message || error);
    return res.status(502).json({
      success: false,
      error: 'Unable to reach AI review service right now. Please try again in a moment.',
      message: 'Unable to reach AI review service right now. Please try again in a moment.',
    });
  }
});

// ================= Advertisement Management REST API =================

app.get('/api/ads', async (req: Request, res: Response) => {
  try {
    const isPublic = req.query.public === 'true';
    let ads: any[] = [];

    if (serverDb) {
      try {
        const snap = await getDocs(collection(serverDb, 'ads'));
        snap.forEach((d) => ads.push({ id: d.id, ...d.data() }));
      } catch {
        ads = readAds();
      }
    } else {
      ads = readAds();
    }

    if (isPublic) {
      const now = Date.now();
      const eligible = ads
        .filter((ad) => {
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
        })
        .sort((a, b) => (b.priority || 0) - (a.priority || 0));
      return res.json({ success: true, ads: eligible });
    }

    return res.json({ success: true, ads: ads.sort((a, b) => (b.priority || 0) - (a.priority || 0)) });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to fetch ads' });
  }
});

app.post('/api/ads', requireMasterAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      id,
      name,
      advertiser,
      headline,
      description,
      imageUrl,
      targetUrl,
      ctaText,
      placement,
      status,
      startDate,
      endDate,
      priority,
    } = req.body;

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
      placement: ['below_biz_info', 'between_sections', 'below_draft', 'footer', 'disabled'].includes(placement)
        ? placement
        : 'below_draft',
      status: status === 'paused' ? 'paused' : 'active',
      startDate: startDate ? String(startDate).trim() : undefined,
      endDate: endDate ? String(endDate).trim() : undefined,
      priority: Number(priority) || 10,
      impressions: idx !== -1 ? ads[idx].impressions || 0 : 0,
      clicks: idx !== -1 ? ads[idx].clicks || 0 : 0,
      createdAt: idx !== -1 ? ads[idx].createdAt : now,
      updatedAt: now,
    };

    if (idx !== -1) ads[idx] = fullAd;
    else ads.push(fullAd);

    writeAds(ads);
    res.json({ success: true, ad: fullAd });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to save ad' });
  }
});

app.delete('/api/ads/:id', requireMasterAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const ads = readAds();
    writeAds(ads.filter((a) => a.id !== id));
    res.json({ success: true, message: 'Ad deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to delete ad' });
  }
});

app.post('/api/ads/:id/impression', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (serverDb) {
      await updateDoc(doc(serverDb, 'ads', id), { impressions: increment(1) }).catch(() => {});
    }
    res.json({ success: true });
  } catch {
    res.json({ success: true });
  }
});

app.post('/api/ads/:id/click', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (serverDb) {
      await updateDoc(doc(serverDb, 'ads', id), { clicks: increment(1) }).catch(() => {});
    }
    res.json({ success: true });
  } catch {
    res.json({ success: true });
  }
});

// ================= Customer Short URL Routes (Strict Subscription Enforcement) =================

async function handleDirectRedirectIfAllowed(
  req: Request,
  res: Response,
  cardId: string
): Promise<boolean> {
  const isDirectRequested = req.query.direct === 'true' || req.query.direct === '1';
  if (!isDirectRequested) {
    return false;
  }

  const { card } = await fetchAuthoritativeCardServer(cardId);
  if (!card) {
    return false;
  }

  const subCheck = isSubscriptionAccessible(card);
  const isAllowed = card.status === 'assigned' && subCheck.accessible && Boolean(card.googleReviewUrl);

  if (!isAllowed) {
    // Do NOT redirect expired, upcoming, disabled, or unassigned cards — let SPA display proper restriction screen
    return false;
  }

  // Record direct redirect scan in live Cloud Firestore before redirecting
  await recordServerDirectScan(card, 'direct', 'allowed');
  res.redirect(302, card.googleReviewUrl);
  return true;
}

app.get('/', async (req: Request, res: Response, next) => {
  try {
    const queryCard = req.query.card || req.query.r;
    if (typeof queryCard === 'string' && queryCard.trim()) {
      const redirected = await handleDirectRedirectIfAllowed(req, res, queryCard.trim());
      if (redirected) return;
    }
  } catch (err) {
    console.error('Error handling root query redirect:', err);
  }
  next();
});

app.get(['/r/:id', '/c/:id', '/review/:id', '/nfc/:id'], async (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;
    const redirected = await handleDirectRedirectIfAllowed(req, res, id);
    if (redirected) return;
  } catch (err) {
    console.error('Error handling /r/:id route:', err);
  }
  next();
});

// Explicit 404 JSON response for unmatched API routes
app.all('/api/*', (req: Request, res: Response) => {
  res.status(404).json({ success: false, message: `Endpoint ${req.method} ${req.path} not found` });
});

async function startServer() {
  ensureDataDir();

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
    console.log(`3DBYSD Smart Reviews server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
