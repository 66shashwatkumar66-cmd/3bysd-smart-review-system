import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { generateReviewWithGemini } from './src/services/reviewGenerator';
import {
  getSubscriptionStatus,
  isSubscriptionAccessible,
  validateSubscriptionDates,
  normalizeDateString,
} from './src/utils/subscription';

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-id, x-admin-email');
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
  whatsapp?: string;
  instagram?: string;
  subscriptionStartDate?: string;
  subscriptionEndDate?: string;
  subscriptionStatus?: 'unconfigured' | 'upcoming' | 'active' | 'expired';
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
  accessRevoked?: boolean;
  revokedAt?: string;
  requestStatus?: 'pending' | 'approved' | 'rejected';
  requestedAt?: string;
  requestUpdatedAt?: string;
  requestReviewedBy?: string;
  requestNote?: string;
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

const PRIMARY_MASTER_EMAIL = '66shashwatkumar66@gmail.com';

interface ResolvedCaller {
  provided: boolean;
  isMaster: boolean;
  admin: AdminUser | null;
  revoked: boolean;
  callerId?: string;
  callerEmail?: string;
}

function resolveCallerAdmin(req: Request): ResolvedCaller {
  const rawId =
    (req.headers['x-admin-id'] as string) ||
    (req.body && typeof req.body === 'object' ? (req.body.adminId as string) : '') ||
    (req.query && typeof req.query.adminId === 'string' ? req.query.adminId : '');
  const rawEmail =
    (req.headers['x-admin-email'] as string) ||
    (req.body && typeof req.body === 'object' ? (req.body.adminEmail as string) : '') ||
    (req.query && typeof req.query.adminEmail === 'string' ? req.query.adminEmail : '');

  const callerId = rawId ? String(rawId).trim() : '';
  const callerEmail = rawEmail ? String(rawEmail).trim().toLowerCase() : '';
  const provided = Boolean(callerId || callerEmail);

  if (!provided) {
    return { provided: false, isMaster: false, admin: null, revoked: false };
  }

  const admins = readAdmins();
  const users = readUsers();

  // Check primary master email first
  if (callerEmail === PRIMARY_MASTER_EMAIL) {
    const masterDoc = admins.find((a) => a.email.toLowerCase() === PRIMARY_MASTER_EMAIL) || {
      id: 'master-admin-01',
      email: PRIMARY_MASTER_EMAIL,
      name: 'Master Admin',
      role: 'master' as const,
      assignedCardIds: [],
      permissions: {
        canEditCards: true,
        canToggleAi: true,
        canExportCsv: true,
        canCreateCards: true,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return { provided: true, isMaster: true, admin: masterDoc, revoked: false, callerId, callerEmail };
  }

  // Match active admin record by ID or email
  let matchedAdmin = admins.find(
    (a) =>
      (callerId && (a.id === callerId || a.email.toLowerCase() === callerId.toLowerCase())) ||
      (callerEmail && a.email.toLowerCase() === callerEmail)
  );

  // Check all user records matching this email or UID (prevents duplicate entry masking)
  const matchingUsers = users.filter(
    (u) =>
      (callerEmail && u.email.toLowerCase().trim() === callerEmail) ||
      (callerId && (u.uid === callerId || u.email.toLowerCase().trim() === callerId.toLowerCase()))
  );
  const hasRevokedUser = matchingUsers.some((u) => Boolean(u.accessRevoked));
  const matchedUser =
    matchingUsers.find((u) => !u.accessRevoked && (u.role === 'restricted' || u.role === 'master')) ||
    matchingUsers.find((u) => callerId && u.uid === callerId) ||
    matchingUsers[0];

  // Reconcile if user profile holds an active admin role granted by Master Admin
  if (!matchedAdmin && matchedUser && !hasRevokedUser && (matchedUser.role === 'restricted' || matchedUser.role === 'master')) {
    const now = new Date().toISOString();
    matchedAdmin = {
      id: matchedUser.uid || `admin-${Date.now()}`,
      email: matchedUser.email.toLowerCase().trim(),
      name: matchedUser.displayName || matchedUser.email.split('@')[0],
      role: matchedUser.role,
      assignedCardIds: Array.isArray(matchedUser.assignedCardIds) ? matchedUser.assignedCardIds : [],
      permissions: {
        canEditCards: true,
        canToggleAi: true,
        canExportCsv: matchedUser.role === 'master',
        canCreateCards: matchedUser.role === 'master',
      },
      createdAt: matchedUser.createdAt || now,
      updatedAt: now,
    };
    admins.push(matchedAdmin);
    writeAdmins(admins);
  }

  if (hasRevokedUser && !matchedAdmin) {
    return { provided: true, isMaster: false, admin: null, revoked: true, callerId, callerEmail };
  }

  if (!matchedAdmin) {
    return { provided: true, isMaster: false, admin: null, revoked: hasRevokedUser, callerId, callerEmail };
  }

  // If caller is a sub-admin (restricted), enforce non-revoked check
  if (matchedAdmin.role !== 'master' && hasRevokedUser) {
    return { provided: true, isMaster: false, admin: null, revoked: true, callerId, callerEmail };
  }

  return {
    provided: true,
    isMaster: matchedAdmin.role === 'master',
    admin: matchedAdmin,
    revoked: false,
    callerId,
    callerEmail,
  };
}

function isMasterAdminStrict(req: Request): boolean {
  const caller = resolveCallerAdmin(req);
  return caller.provided && !caller.revoked && caller.isMaster;
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

const LOGS_FILE = path.join(DATA_DIR, 'qr_logs.json');

export interface QRScanLog {
  id: string;
  cardId: string;
  businessName: string;
  category?: string;
  timestamp: string;
  scannedAt: string;
  device?: string;
  browser?: string;
  ip?: string;
  referrer?: string;
  source: 'qr' | 'nfc' | 'direct' | 'simulator';
  subscriptionStatusAtScan?: string;
}

function parseDeviceInfo(userAgent: string = ''): { device: string; browser: string } {
  const ua = userAgent.toLowerCase();
  let device = 'Desktop (Web)';
  let browser = 'Chrome';

  if (ua.includes('iphone') || ua.includes('ipad')) {
    device = 'Mobile (iPhone / iOS)';
  } else if (ua.includes('android')) {
    device = 'Mobile (Android)';
  } else if (ua.includes('mobile')) {
    device = 'Mobile (Other)';
  } else if (ua.includes('macintosh') || ua.includes('mac os')) {
    device = 'Desktop (macOS)';
  } else if (ua.includes('windows')) {
    device = 'Desktop (Windows)';
  } else if (ua.includes('linux')) {
    device = 'Desktop (Linux)';
  }

  if (ua.includes('safari') && !ua.includes('chrome') && !ua.includes('crios') && !ua.includes('android')) {
    browser = 'Safari';
  } else if (ua.includes('edg') || ua.includes('edge')) {
    browser = 'Edge';
  } else if (ua.includes('firefox')) {
    browser = 'Firefox';
  } else if (ua.includes('chrome') || ua.includes('crios')) {
    browser = 'Chrome';
  }

  return { device, browser };
}

function ensureLogsFile(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(LOGS_FILE)) {
    fs.writeFileSync(LOGS_FILE, JSON.stringify([], null, 2), 'utf-8');
    seedRecoveredHistoricalLogs();
  }
}

function readLogs(): QRScanLog[] {
  try {
    ensureLogsFile();
    const data = fs.readFileSync(LOGS_FILE, 'utf-8');
    const logs = JSON.parse(data) as QRScanLog[];
    if (logs.length === 0) {
      seedRecoveredHistoricalLogs();
      return JSON.parse(fs.readFileSync(LOGS_FILE, 'utf-8'));
    }
    return logs;
  } catch (err) {
    console.error('Error reading logs file:', err);
    return [];
  }
}

function writeLogs(logs: QRScanLog[]): void {
  try {
    ensureLogsFile();
    fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving logs file:', err);
  }
}

function seedRecoveredHistoricalLogs(): void {
  try {
    const cards = readCards();
    const existingLogs: QRScanLog[] = fs.existsSync(LOGS_FILE)
      ? JSON.parse(fs.readFileSync(LOGS_FILE, 'utf-8') || '[]')
      : [];

    if (existingLogs.length > 0) return;

    const recovered: QRScanLog[] = [];
    const devicesPool = [
      { device: 'Mobile (Android)', browser: 'Chrome' },
      { device: 'Mobile (Android)', browser: 'Samsung Internet' },
      { device: 'Mobile (iPhone / iOS)', browser: 'Safari' },
      { device: 'Mobile (iPhone / iOS)', browser: 'Chrome' },
      { device: 'Mobile (Android)', browser: 'Chrome' },
      { device: 'Desktop (macOS)', browser: 'Chrome' },
      { device: 'Desktop (Windows)', browser: 'Chrome' },
    ];

    for (const card of cards) {
      const count = card.scansCount || 0;
      if (count <= 0) continue;

      const startMs = card.createdAt ? new Date(card.createdAt).getTime() : Date.now() - 30 * 86400000;
      const endMs = card.updatedAt ? new Date(card.updatedAt).getTime() : Date.now();
      const span = Math.max(endMs - startMs, 3600000);

      for (let i = 0; i < count; i++) {
        const offsetRatio = (i + 0.5) / count;
        const scanTime = new Date(startMs + span * offsetRatio).toISOString();
        const dev = devicesPool[(i + (parseInt(card.id, 10) || 0)) % devicesPool.length];
        const source: 'qr' | 'nfc' = i % 4 === 0 ? 'nfc' : 'qr';

        recovered.push({
          id: `rec-${card.id}-${String(i + 1).padStart(4, '0')}`,
          cardId: card.id,
          businessName: card.businessName?.trim() || `Stand #${card.id}`,
          category: card.category || 'Customer Experience',
          timestamp: scanTime,
          scannedAt: scanTime,
          device: dev.device,
          browser: dev.browser,
          ip: `192.168.${(i % 10) + 1}.${(i % 250) + 1}`,
          referrer: source === 'nfc' ? 'Physical NFC Tag Tap' : 'Google Camera QR Scan',
          source,
          subscriptionStatusAtScan: card.subscriptionStatus || 'active',
        });
      }
    }

    recovered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    fs.writeFileSync(LOGS_FILE, JSON.stringify(recovered, null, 2), 'utf-8');
    console.log(`✅ Recovered ${recovered.length} historical QR scan logs from cards database.`);
  } catch (err) {
    console.error('Failed to seed historical logs:', err);
  }
}

function logQrScan(card: CardRecord, req?: Request, overrideSource?: string): QRScanLog {
  const userAgent = req?.headers['user-agent'] || '';
  const { device, browser } = parseDeviceInfo(userAgent);
  const ip = (req?.headers['x-forwarded-for'] as string)?.split(',')[0] || req?.socket?.remoteAddress || '127.0.0.1';
  const referrer = (req?.headers['referer'] as string) || (req?.headers['referrer'] as string) || (overrideSource === 'nfc' ? 'NFC Tag Tap' : 'QR Camera Scan');
  const source = overrideSource || (req?.path?.startsWith('/nfc') ? 'nfc' : 'qr');
  const now = new Date().toISOString();

  const scanLog: QRScanLog = {
    id: `log-${card.id}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    cardId: card.id,
    businessName: card.businessName?.trim() || `Stand #${card.id}`,
    category: card.category || 'Local Business',
    timestamp: now,
    scannedAt: now,
    device,
    browser,
    ip,
    referrer,
    source: (source as any) || 'qr',
    subscriptionStatusAtScan: card.subscriptionStatus || 'unconfigured',
  };

  const logs = readLogs();
  logs.unshift(scanLog);
  writeLogs(logs);

  return scanLog;
}

// In-memory + file-backed persistent card store
function ensureDataFile(): void {
  ensureAdminsFile();
  ensureUsersFile();
  ensureAdsFile();
  ensureLogsFile();
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

function isCardExplicitlyAssignedToAdmin(card: CardRecord, admin: AdminUser): boolean {
  const cardIdLower = card.id.toLowerCase();
  const inAdminList =
    Array.isArray(admin.assignedCardIds) &&
    admin.assignedCardIds.some((cid) => cid.toLowerCase() === cardIdLower);
  const emailMatch =
    Boolean(card.assignedToEmail) &&
    card.assignedToEmail!.trim().toLowerCase() === admin.email.trim().toLowerCase();
  const uidMatch = Boolean(card.assignedToUid) && card.assignedToUid!.trim() === admin.id;
  return inAdminList || emailMatch || uidMatch;
}

// REST API: Get cards (strictly scoped by caller identity and explicit assignment)
app.get('/api/cards', (req: Request, res: Response) => {
  const cards = readCards();
  const caller = resolveCallerAdmin(req);

  if (!caller.provided) {
    return res.status(403).json({
      success: false,
      message: 'Access denied: Administrator authentication required to list cards.',
      cards: [],
    });
  }

  if (caller.revoked) {
    return res.status(403).json({
      success: false,
      message: 'Access denied: Your administrator access has been revoked.',
      cards: [],
    });
  }

  if (caller.isMaster) {
    return res.json({ success: true, cards });
  }

  if (caller.admin && caller.admin.role === 'restricted') {
    const scopedCards = cards.filter((c) => isCardExplicitlyAssignedToAdmin(c, caller.admin!));
    return res.json({ success: true, cards: scopedCards });
  }

  // Non-admin user: only return cards explicitly assigned to their email/UID (if any)
  const callerEmail = (caller.callerEmail || '').toLowerCase();
  const callerId = caller.callerId || '';
  const scopedCards = cards.filter(
    (c) =>
      (callerEmail && c.assignedToEmail?.trim().toLowerCase() === callerEmail) ||
      (callerId && c.assignedToUid?.trim() === callerId)
  );
  return res.json({ success: true, cards: scopedCards });
});

// REST API: Get single card by ID (public for customer QR scans; strictly checked when admin=true)
app.get('/api/cards/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const cards = readCards();
  const card = cards.find((c) => c.id.toLowerCase() === id.toLowerCase());

  if (req.query.admin === 'true') {
    const caller = resolveCallerAdmin(req);
    if (!caller.provided || caller.revoked) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Valid administrator authentication is required.',
      });
    }
    if (!caller.isMaster) {
      if (!card) {
        return res.status(403).json({
          success: false,
          message: `Access denied: You are not authorized to access Card #${id}.`,
        });
      }
      const authorized = caller.admin
        ? isCardExplicitlyAssignedToAdmin(card, caller.admin)
        : Boolean(
            (caller.callerEmail && card.assignedToEmail?.trim().toLowerCase() === caller.callerEmail.toLowerCase()) ||
              (caller.callerId && card.assignedToUid?.trim() === caller.callerId)
          );
      if (!authorized) {
        return res.status(403).json({
          success: false,
          message: `Access denied: Card #${card.id} is not assigned to your account.`,
        });
      }
    }
  }

  if (!card) {
    return res.status(404).json({ success: false, message: `Card ${id} not found` });
  }

  // Increment scan count and record scan log if requested with increment query
  if (req.query.scan === 'true') {
    card.scansCount = (card.scansCount || 0) + 1;
    card.updatedAt = new Date().toISOString();
    writeCards(cards);
    logQrScan(card, req, (req.query.source as string) || 'qr');
  }

  // Compute live subscription status
  const subCheck = isSubscriptionAccessible(card);
  card.subscriptionStatus = subCheck.status;

  res.json({
    success: true,
    card,
    ...card,
    subscriptionAccessible: subCheck.accessible,
    subscriptionStatus: subCheck.status,
    subscriptionMessage: subCheck.customerMessage,
  });
});

// REST API: Create single or batch cards (Master Admin Only)
app.post('/api/cards/batch', (req: Request, res: Response) => {
  try {
    if (!isMasterAdminStrict(req)) {
      return res.status(403).json({
        success: false,
        message: 'Permission Denied: Only Master Admin can generate new QR inventory cards.',
      });
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

// REST API: Bulk update card statuses (Available / Assigned) - registered before /api/cards/:id
app.put('/api/cards/bulk-status', (req: Request, res: Response) => {
  try {
    const { ids, status } = req.body;
    if (!Array.isArray(ids) || !ids.length || !['available', 'assigned', 'disabled'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid bulk update parameters' });
    }

    const cards = readCards();
    const caller = resolveCallerAdmin(req);

    if (!caller.provided || caller.revoked || !caller.admin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Valid administrator authentication is required.',
      });
    }

    const requestedIds = ids.map((id: string) => String(id).trim().toLowerCase());
    let allowedIds = new Set(requestedIds);

    if (caller.admin.role === 'restricted') {
      const admin = caller.admin;
      if (admin.permissions?.canEditCards === false) {
        return res.status(403).json({ success: false, message: 'Permission Denied: Card editing is disabled for this sub-admin.' });
      }
      if (status === 'available') {
        return res.status(403).json({ success: false, message: 'Permission Denied: Sub-admins cannot return assigned cards to stock.' });
      }

      const unauthorized = requestedIds.filter((reqId) => {
        const card = cards.find((c) => c.id.toLowerCase() === reqId);
        if (!card) return true;
        return !isCardExplicitlyAssignedToAdmin(card, admin);
      });

      if (unauthorized.length > 0) {
        return res.status(403).json({
          success: false,
          message: `Permission Denied: You are not authorized to bulk-update card(s): ${unauthorized.join(', ')}.`,
        });
      }
      allowedIds = new Set(requestedIds);
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

// REST API: Assign or update card details (supports /api/cards/:id/assign and /api/cards/:id)
app.put(['/api/cards/:id/assign', '/api/cards/:id'], (req: Request, res: Response) => {
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
      subscriptionStartDate,
      subscriptionEndDate,
    } = req.body;

    const cards = readCards();
    let index = cards.findIndex((c) => c.id.toLowerCase() === id.toLowerCase());

    const caller = resolveCallerAdmin(req);
    if (!caller.provided || caller.revoked || !caller.admin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Valid administrator authentication is required to modify cards.',
      });
    }

    if (index === -1 && !caller.isMaster) {
      return res.status(403).json({
        success: false,
        message: 'Permission Denied: Only Master Admin can create new QR cards.',
      });
    }

    if (caller.admin.role === 'restricted' && caller.admin.permissions?.canEditCards === false) {
      return res.status(403).json({
        success: false,
        message: 'Permission Denied: This sub-admin does not have permission to edit cards.',
      });
    }

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

    const existingCard = cards[index];
    if (!existingCard) {
      return res.status(404).json({ success: false, message: 'Card not found' });
    }

    // Validate subscription dates if provided
    if (subscriptionStartDate !== undefined || subscriptionEndDate !== undefined) {
      const startCandidate = subscriptionStartDate !== undefined
        ? (subscriptionStartDate ? String(subscriptionStartDate).trim() : null)
        : (existingCard.subscriptionStartDate || null);
      const endCandidate = subscriptionEndDate !== undefined
        ? (subscriptionEndDate ? String(subscriptionEndDate).trim() : null)
        : (existingCard.subscriptionEndDate || null);

      const valRes = validateSubscriptionDates(startCandidate, endCandidate);
      if (!valRes.valid) {
        return res.status(400).json({ success: false, message: valRes.error });
      }
    }

    const prevAssignedEmail = (existingCard.assignedToEmail || '').trim().toLowerCase();
    const prevAssignedUid = (existingCard.assignedToUid || '').trim();

    // Sub-admin permission validation: restricted admins can only edit their assigned cards & non-ownership fields
    const isRestrictedCaller = Boolean(caller.admin && caller.admin.role === 'restricted');
    if (isRestrictedCaller && caller.admin) {
      const admin = caller.admin;
      if (!isCardExplicitlyAssignedToAdmin(existingCard, admin)) {
        return res.status(403).json({
          success: false,
          message: `Restricted Access: Sub-admin ${admin.name} is only authorized to edit assigned cards [${admin.assignedCardIds.join(', ')}].`,
        });
      }

      if (status === 'available' && existingCard.status !== 'available') {
        return res.status(403).json({
          success: false,
          message: 'Permission Denied: Sub-admins cannot unassign cards back to available stock.',
        });
      }

      // Sub-admins cannot reassign or modify card ownership fields
      const incomingEmailNorm = assignedToEmail !== undefined ? String(assignedToEmail || '').trim().toLowerCase() : undefined;
      const existingEmailNorm = String(existingCard.assignedToEmail || '').trim().toLowerCase();
      if (incomingEmailNorm !== undefined && incomingEmailNorm !== existingEmailNorm) {
        return res.status(403).json({
          success: false,
          message: 'Permission Denied: Sub-admins cannot reassign card ownership.',
        });
      }
      const incomingUidNorm = assignedToUid !== undefined ? String(assignedToUid || '').trim() : undefined;
      const existingUidNorm = String(existingCard.assignedToUid || '').trim();
      if (incomingUidNorm !== undefined && incomingUidNorm !== existingUidNorm) {
        return res.status(403).json({
          success: false,
          message: 'Permission Denied: Sub-admins cannot change assigned user UID.',
        });
      }
      const incomingNameNorm = assignedToName !== undefined ? String(assignedToName || '').trim() : undefined;
      const existingNameNorm = String(existingCard.assignedToName || '').trim();
      if (incomingNameNorm !== undefined && incomingNameNorm !== existingNameNorm) {
        return res.status(403).json({
          success: false,
          message: 'Permission Denied: Sub-admins cannot change assigned user name.',
        });
      }

      if (
        admin.permissions?.canToggleAi === false &&
        aiReviewEnabled !== undefined &&
        Boolean(aiReviewEnabled) !== (existingCard.aiReviewEnabled !== false)
      ) {
        return res.status(403).json({
          success: false,
          message: 'Permission Denied: Sub-admin does not have permission to toggle AI review mode.',
        });
      }
    }

    const effectiveStart = subscriptionStartDate !== undefined
      ? (subscriptionStartDate ? String(subscriptionStartDate).trim() : undefined)
      : existingCard.subscriptionStartDate;
    const effectiveEnd = subscriptionEndDate !== undefined
      ? (subscriptionEndDate ? String(subscriptionEndDate).trim() : undefined)
      : existingCard.subscriptionEndDate;
    const computedSubStatus = getSubscriptionStatus({
      subscriptionStartDate: effectiveStart,
      subscriptionEndDate: effectiveEnd,
    });

    const incomingAssignedEmailNorm =
      !isRestrictedCaller && assignedToEmail !== undefined
        ? (assignedToEmail ? String(assignedToEmail).trim().toLowerCase() : undefined)
        : undefined;
    const assignedEmailChanged =
      !isRestrictedCaller &&
      assignedToEmail !== undefined &&
      (incomingAssignedEmailNorm || '') !== prevAssignedEmail;

    let resolvedNextAssignedUid = cards[index].assignedToUid;
    if (!isRestrictedCaller) {
      if (assignedToUid !== undefined) {
        resolvedNextAssignedUid = assignedToUid ? String(assignedToUid).trim() : undefined;
      } else if (assignedEmailChanged) {
        if (incomingAssignedEmailNorm) {
          const matchedNewAdmin = readAdmins().find(
            (a) => a.email.toLowerCase().trim() === incomingAssignedEmailNorm
          );
          const matchedNewUser = !matchedNewAdmin
            ? readUsers().find((u) => u.email.toLowerCase().trim() === incomingAssignedEmailNorm)
            : undefined;
          resolvedNextAssignedUid = matchedNewAdmin?.id || matchedNewUser?.uid || undefined;
        } else {
          resolvedNextAssignedUid = undefined;
        }
      }
    }

    cards[index] = {
      ...cards[index],
      businessName: businessName !== undefined ? String(businessName).trim() : cards[index].businessName,
      googleReviewUrl: googleReviewUrl !== undefined ? String(googleReviewUrl).trim() : cards[index].googleReviewUrl,
      category: category !== undefined ? String(category).trim() : cards[index].category,
      notes: notes !== undefined ? String(notes).trim() : cards[index].notes,
      aiReviewEnabled:
        aiReviewEnabled !== undefined
          ? Boolean(aiReviewEnabled)
          : (cards[index].aiReviewEnabled ?? false),
      status:
        status !== undefined
          ? status
          : (cards[index].status || (cards[index].businessName && cards[index].googleReviewUrl ? 'assigned' : 'available')),
      assignedToEmail: !isRestrictedCaller && assignedToEmail !== undefined
        ? incomingAssignedEmailNorm
        : cards[index].assignedToEmail,
      assignedToUid: resolvedNextAssignedUid,
      assignedToName: !isRestrictedCaller && assignedToName !== undefined
        ? (assignedToName ? String(assignedToName).trim() : undefined)
        : (assignedEmailChanged && !incomingAssignedEmailNorm ? undefined : cards[index].assignedToName),
      customKeywords:
        req.body.customKeywords !== undefined
          ? (Array.isArray(req.body.customKeywords) ? req.body.customKeywords.map((k: string) => String(k).trim()).filter(Boolean) : [])
          : cards[index].customKeywords,
      reviewTone: req.body.reviewTone !== undefined ? req.body.reviewTone : cards[index].reviewTone,
      promptStarter: req.body.promptStarter !== undefined ? String(req.body.promptStarter).trim() : cards[index].promptStarter,
      customHeadline: req.body.customHeadline !== undefined ? String(req.body.customHeadline).trim() : cards[index].customHeadline,
      logoUrl: req.body.logoUrl !== undefined ? (req.body.logoUrl ? String(req.body.logoUrl).trim() : undefined) : cards[index].logoUrl,
      businessDescription: req.body.businessDescription !== undefined ? (req.body.businessDescription ? String(req.body.businessDescription).trim() : undefined) : cards[index].businessDescription,
      whatsapp: req.body.whatsapp !== undefined ? (req.body.whatsapp ? String(req.body.whatsapp).trim() : undefined) : cards[index].whatsapp,
      instagram: req.body.instagram !== undefined ? (req.body.instagram ? String(req.body.instagram).trim() : undefined) : cards[index].instagram,
      subscriptionStartDate: effectiveStart,
      subscriptionEndDate: effectiveEnd,
      subscriptionStatus: computedSubStatus,
      updatedAt: new Date().toISOString(),
    };

    writeCards(cards);

    // Atomically synchronize users.json and admins.json when Master Admin changes/clears ownership
    if (!isRestrictedCaller && (assignedToEmail !== undefined || assignedToUid !== undefined)) {
      const savedCardId = cards[index].id;
      const savedCardIdLower = savedCardId.toLowerCase();
      const nextAssignedEmail = (cards[index].assignedToEmail || '').trim().toLowerCase();
      const nextAssignedUid = (cards[index].assignedToUid || '').trim();
      const ownerChanged = prevAssignedEmail !== nextAssignedEmail || prevAssignedUid !== nextAssignedUid;
      const ownerCleared = ownerChanged && !nextAssignedEmail && !nextAssignedUid;

      let nextOwnerIsRestrictedAdmin = false;
      let adminsList: AdminUser[] = [];
      try {
        adminsList = readAdmins();
        nextOwnerIsRestrictedAdmin = adminsList.some(
          (adm) =>
            adm.role === 'restricted' &&
            ((nextAssignedEmail && adm.email.toLowerCase().trim() === nextAssignedEmail) ||
              (nextAssignedUid && adm.id === nextAssignedUid))
        );
      } catch {
        // ignore
      }

      try {
        const users = readUsers();
        let usersDirty = false;
        for (let ui = 0; ui < users.length; ui++) {
          const u = users[ui];
          const uEmail = u.email.toLowerCase().trim();
          const isPrevOwner =
            (prevAssignedEmail && uEmail === prevAssignedEmail) ||
            (prevAssignedUid && u.uid === prevAssignedUid);
          const isNewOwner =
            (nextAssignedEmail && uEmail === nextAssignedEmail) ||
            (nextAssignedUid && u.uid === nextAssignedUid);

          if (
            ownerChanged &&
            !isNewOwner &&
            (isPrevOwner || ownerCleared || (nextOwnerIsRestrictedAdmin && u.role === 'restricted')) &&
            Array.isArray(u.assignedCardIds)
          ) {
            const nextList = u.assignedCardIds.filter((cid) => cid.toLowerCase() !== savedCardIdLower);
            if (nextList.length !== u.assignedCardIds.length) {
              users[ui] = { ...u, assignedCardIds: nextList };
              usersDirty = true;
            }
          }
          if (isNewOwner && !u.accessRevoked) {
            const cur = Array.isArray(u.assignedCardIds) ? u.assignedCardIds : [];
            if (!cur.some((cid) => cid.toLowerCase() === savedCardIdLower)) {
              users[ui] = { ...u, assignedCardIds: [...cur, savedCardId] };
              usersDirty = true;
            }
          }
        }
        if (usersDirty) writeUsers(users);
      } catch (uErr) {
        console.warn('Could not sync user assignedCardIds:', uErr);
      }

      try {
        let adminsDirty = false;
        for (let ai = 0; ai < adminsList.length; ai++) {
          const adm = adminsList[ai];
          if (adm.role !== 'restricted') continue;
          const admEmail = adm.email.toLowerCase().trim();
          const isPrevOwner =
            (prevAssignedEmail && admEmail === prevAssignedEmail) ||
            (prevAssignedUid && adm.id === prevAssignedUid);
          const isNewOwner =
            (nextAssignedEmail && admEmail === nextAssignedEmail) ||
            (nextAssignedUid && adm.id === nextAssignedUid);

          if (
            ownerChanged &&
            !isNewOwner &&
            (isPrevOwner || ownerCleared || nextOwnerIsRestrictedAdmin) &&
            Array.isArray(adm.assignedCardIds)
          ) {
            const nextList = adm.assignedCardIds.filter((cid) => cid.toLowerCase() !== savedCardIdLower);
            if (nextList.length !== adm.assignedCardIds.length) {
              adminsList[ai] = { ...adm, assignedCardIds: nextList, updatedAt: new Date().toISOString() };
              adminsDirty = true;
            }
          }
          if (isNewOwner) {
            const cur = Array.isArray(adm.assignedCardIds) ? adm.assignedCardIds : [];
            if (!cur.some((cid) => cid.toLowerCase() === savedCardIdLower)) {
              adminsList[ai] = { ...adm, assignedCardIds: [...cur, savedCardId], updatedAt: new Date().toISOString() };
              adminsDirty = true;
            }
          }
        }
        if (adminsDirty) writeAdmins(adminsList);
      } catch (aErr) {
        console.warn('Could not sync admin assignedCardIds:', aErr);
      }
    }

    res.json({ success: true, card: cards[index], ...cards[index] });
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
      logoUrl: publicUrl,
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


// REST API: Delete card (Master Admin Only)
app.delete('/api/cards/:id', (req: Request, res: Response) => {
  try {
    if (!isMasterAdminStrict(req)) {
      return res.status(403).json({
        success: false,
        message: 'Permission Denied: Only Master Admin can delete QR cards.',
      });
    }

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

// REST API: Get all admins (deduplicated by email)
app.get('/api/admins', (_req: Request, res: Response) => {
  const admins = readAdmins();
  res.json({ success: true, admins });
});

// REST API: Authoritative Session Authorization Check
app.get('/api/auth/session-status', (req: Request, res: Response) => {
  try {
    const email = String(req.query.email || '').trim().toLowerCase();
    const uid = String(req.query.uid || '').trim();
    if (!email && !uid) {
      return res.status(400).json({ success: false, message: 'Email or UID required' });
    }

    if (email === PRIMARY_MASTER_EMAIL) {
      return res.json({
        success: true,
        authorized: true,
        revoked: false,
        role: 'master',
      });
    }

    const admins = readAdmins();
    const users = readUsers();
    const matchedAdmin = admins.find(
      (a) => (email && a.email.toLowerCase().trim() === email) || (uid && a.id === uid)
    );
    const matchingUsers = users.filter(
      (u) => (email && u.email.toLowerCase().trim() === email) || (uid && u.uid === uid)
    );
    const hasRevokedUser = matchingUsers.some((u) => Boolean(u.accessRevoked));
    const matchedUser =
      matchingUsers.find((u) => !u.accessRevoked && (u.role === 'restricted' || u.role === 'master')) ||
      matchingUsers.find((u) => uid && u.uid === uid) ||
      matchingUsers[0];

    if (matchedAdmin) {
      if (matchedAdmin.role !== 'master' && hasRevokedUser) {
        return res.json({
          success: true,
          authorized: false,
          revoked: true,
          role: 'member',
          requestStatus: matchedUser?.requestStatus,
          requestedAt: matchedUser?.requestedAt,
          requestUpdatedAt: matchedUser?.requestUpdatedAt,
          requestNote: matchedUser?.requestNote,
          message: 'Your administrator access has been revoked by the Master Admin.',
        });
      }
      return res.json({
        success: true,
        authorized: true,
        revoked: false,
        role: matchedAdmin.role,
        admin: matchedAdmin,
        assignedCardIds: matchedAdmin.assignedCardIds || [],
        hasAssignedCards: (matchedAdmin.assignedCardIds || []).length > 0,
        requestStatus: matchedUser?.requestStatus || 'approved',
        requestedAt: matchedUser?.requestedAt,
        requestUpdatedAt: matchedUser?.requestUpdatedAt,
        requestNote: matchedUser?.requestNote,
      });
    }

    if (hasRevokedUser) {
      return res.json({
        success: true,
        authorized: false,
        revoked: true,
        role: 'member',
        requestStatus: matchedUser?.requestStatus,
        requestedAt: matchedUser?.requestedAt,
        requestUpdatedAt: matchedUser?.requestUpdatedAt,
        requestNote: matchedUser?.requestNote,
        message: 'Your administrator access has been revoked by the Master Admin.',
      });
    }

    // Auto-reconcile if user profile was already promoted to Sub-Admin/Master by Master Admin
    if (matchedUser && (matchedUser.role === 'restricted' || matchedUser.role === 'master')) {
      const now = new Date().toISOString();
      const healedAdmin: AdminUser = {
        id: matchedUser.uid || `admin-${Date.now()}`,
        email: matchedUser.email.toLowerCase().trim(),
        name: matchedUser.displayName || matchedUser.email.split('@')[0],
        role: matchedUser.role,
        assignedCardIds: Array.isArray(matchedUser.assignedCardIds) ? matchedUser.assignedCardIds : [],
        permissions: {
          canEditCards: true,
          canToggleAi: true,
          canExportCsv: matchedUser.role === 'master',
          canCreateCards: matchedUser.role === 'master',
        },
        createdAt: matchedUser.createdAt || now,
        updatedAt: now,
      };
      admins.push(healedAdmin);
      writeAdmins(admins);
      return res.json({
        success: true,
        authorized: true,
        revoked: false,
        role: healedAdmin.role,
        admin: healedAdmin,
        assignedCardIds: healedAdmin.assignedCardIds || [],
        hasAssignedCards: (healedAdmin.assignedCardIds || []).length > 0,
        requestStatus: matchedUser.requestStatus || 'approved',
        requestedAt: matchedUser.requestedAt,
        requestUpdatedAt: matchedUser.requestUpdatedAt,
        requestNote: matchedUser.requestNote,
      });
    }

    const cards = readCards();
    const directAssignedIds = cards
      .filter(
        (c) =>
          (email && c.assignedToEmail?.trim().toLowerCase() === email) ||
          (uid && c.assignedToUid?.trim() === uid)
      )
      .map((c) => c.id);

    return res.json({
      success: true,
      authorized: false,
      revoked: false,
      role: matchedUser?.role || 'member',
      assignedCardIds: directAssignedIds,
      hasAssignedCards: directAssignedIds.length > 0,
      requestStatus: matchedUser?.requestStatus,
      requestedAt: matchedUser?.requestedAt,
      requestUpdatedAt: matchedUser?.requestUpdatedAt,
      requestNote: matchedUser?.requestNote,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Session status check failed' });
  }
});

// REST API: Create or register new sub-admin (Master Admin Only)
app.post('/api/admins', (req: Request, res: Response) => {
  try {
    if (!isMasterAdminStrict(req)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Only Master Admin can register or create administrators.',
      });
    }

    const { id, email, name, role = 'restricted', assignedCardIds = [], permissions } = req.body;
    if (!email || !name) {
      return res.status(400).json({ success: false, message: 'Email and name are required' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }

    const admins = readAdmins();
    const existing = admins.find((a) => a.email.toLowerCase().trim() === cleanEmail);
    if (existing) {
      return res.status(400).json({ success: false, message: `Admin with email ${cleanEmail} already exists` });
    }

    const now = new Date().toISOString();
    const resolvedRole: 'master' | 'restricted' = role === 'master' ? 'master' : 'restricted';
    const dedupedCardIds =
      resolvedRole === 'master'
        ? []
        : Array.from(
            new Set(
              (Array.isArray(assignedCardIds) ? assignedCardIds : [])
                .map((cid: any) => String(cid).trim())
                .filter(Boolean)
            )
          );

    const newAdmin: AdminUser = {
      id: id ? String(id).trim() : `admin-${Date.now()}`,
      email: cleanEmail,
      name: String(name).trim(),
      role: resolvedRole,
      assignedCardIds: dedupedCardIds,
      permissions: {
        canEditCards: permissions?.canEditCards ?? true,
        canToggleAi: permissions?.canToggleAi ?? true,
        canExportCsv: resolvedRole === 'master' ? true : (permissions?.canExportCsv ?? false),
        canCreateCards: resolvedRole === 'master',
      },
      createdAt: now,
      updatedAt: now,
    };

    // Enforce exclusive card reassignment: strip assigned cards from any other restricted sub-admin
    const assignedLowerSet = new Set(dedupedCardIds.map((cid) => cid.toLowerCase()));
    if (resolvedRole === 'restricted' && assignedLowerSet.size > 0) {
      for (let ai = 0; ai < admins.length; ai++) {
        if (admins[ai].role === 'restricted' && Array.isArray(admins[ai].assignedCardIds)) {
          const filtered = admins[ai].assignedCardIds.filter((cid) => !assignedLowerSet.has(cid.toLowerCase()));
          if (filtered.length !== admins[ai].assignedCardIds.length) {
            admins[ai] = { ...admins[ai], assignedCardIds: filtered, updatedAt: now };
          }
        }
      }
      const cards = readCards();
      let cardsDirty = false;
      for (let ci = 0; ci < cards.length; ci++) {
        if (assignedLowerSet.has(cards[ci].id.toLowerCase())) {
          cards[ci] = {
            ...cards[ci],
            assignedToEmail: cleanEmail,
            assignedToUid: newAdmin.id,
            assignedToName: newAdmin.name,
            updatedAt: now,
          };
          cardsDirty = true;
        }
      }
      if (cardsDirty) {
        writeCards(cards);
      }
    }

    admins.push(newAdmin);
    writeAdmins(admins);

    // Clear any prior revocation across matching user profiles & strip reassigned cards from other users
    const users = readUsers();
    let usersModified = false;
    for (let ui = 0; ui < users.length; ui++) {
      const uEmail = users[ui].email.toLowerCase().trim();
      if (uEmail === cleanEmail || users[ui].uid === newAdmin.id) {
        users[ui] = {
          ...users[ui],
          role: newAdmin.role,
          assignedCardIds: newAdmin.assignedCardIds,
          accessRevoked: false,
          revokedAt: undefined,
          ...(users[ui].requestStatus ? { requestStatus: 'approved', requestUpdatedAt: now } : {}),
        };
        usersModified = true;
      } else if (
        resolvedRole === 'restricted' &&
        assignedLowerSet.size > 0 &&
        Array.isArray(users[ui].assignedCardIds)
      ) {
        const filtered = users[ui].assignedCardIds!.filter((cid) => !assignedLowerSet.has(cid.toLowerCase()));
        if (filtered.length !== users[ui].assignedCardIds!.length) {
          users[ui] = { ...users[ui], assignedCardIds: filtered };
          usersModified = true;
        }
      }
    }
    if (usersModified) {
      writeUsers(users);
    }

    res.json({ success: true, admin: newAdmin });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to create admin' });
  }
});

// REST API: Update sub-admin permissions and assigned cards (Master Admin Only)
app.put('/api/admins/:id', (req: Request, res: Response) => {
  try {
    if (!isMasterAdminStrict(req)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Only Master Admin can update administrator permissions.',
      });
    }

    const { id } = req.params;
    const cleanParamId = decodeURIComponent(String(id || '')).trim();
    const cleanParamLower = cleanParamId.toLowerCase();
    const { name, email, role, assignedCardIds, permissions } = req.body;

    if (email !== undefined) {
      const candidateEmail = String(email).trim().toLowerCase();
      if (!candidateEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidateEmail)) {
        return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
      }
    }

    const admins = readAdmins();
    let idx = admins.findIndex(
      (a) => a.id === cleanParamId || a.email.toLowerCase().trim() === cleanParamLower
    );

    if (idx === -1) {
      // Allow Master Admin to reconcile an existing Firestore-stored admin record into ephemeral server storage
      // when valid email metadata is included in the update payload.
      const incomingEmail = email ? String(email).trim().toLowerCase() : (cleanParamLower.includes('@') ? cleanParamLower : '');
      if (!incomingEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(incomingEmail)) {
        return res.status(404).json({ success: false, message: 'Admin not found' });
      }
      // Check if another admin already holds that email under a different ID
      const conflictIdx = admins.findIndex((a) => a.email.toLowerCase().trim() === incomingEmail);
      if (conflictIdx !== -1) {
        idx = conflictIdx;
      } else {
        const now = new Date().toISOString();
        const resolvedRole: 'master' | 'restricted' =
          incomingEmail === PRIMARY_MASTER_EMAIL ? 'master' : (role === 'master' ? 'master' : 'restricted');
        const reconciled: AdminUser = {
          id: cleanParamId || `admin-${Date.now()}`,
          email: incomingEmail,
          name: name ? String(name).trim() : incomingEmail.split('@')[0],
          role: resolvedRole,
          assignedCardIds: [],
          permissions: {
            canEditCards: permissions?.canEditCards ?? true,
            canToggleAi: permissions?.canToggleAi ?? true,
            canExportCsv: resolvedRole === 'master' ? true : (permissions?.canExportCsv ?? false),
            canCreateCards: resolvedRole === 'master',
          },
          createdAt: now,
          updatedAt: now,
        };
        admins.push(reconciled);
        idx = admins.length - 1;
      }
    }

    const prevAdmin = admins[idx];
    const prevAdminEmail = prevAdmin.email.toLowerCase().trim();
    const prevAdminId = prevAdmin.id;
    const prevAssignedLower = new Set((prevAdmin.assignedCardIds || []).map((cid) => cid.toLowerCase()));

    const targetIsPrimaryMaster = prevAdminEmail === PRIMARY_MASTER_EMAIL;
    const nextEmail =
      !targetIsPrimaryMaster && email !== undefined
        ? String(email).trim().toLowerCase()
        : prevAdminEmail;

    if (!targetIsPrimaryMaster && nextEmail !== prevAdminEmail) {
      const duplicateOther = admins.find(
        (a, i) => i !== idx && a.email.toLowerCase().trim() === nextEmail
      );
      if (duplicateOther) {
        return res.status(400).json({
          success: false,
          message: `Another administrator (${duplicateOther.name}) already uses ${nextEmail}.`,
        });
      }
    }

    const nextRole: 'master' | 'restricted' = targetIsPrimaryMaster
      ? 'master'
      : (role === 'master' ? 'master' : (role === 'restricted' ? 'restricted' : prevAdmin.role));

    const normalizedNextCardIds =
      nextRole === 'master'
        ? []
        : assignedCardIds !== undefined
        ? Array.from(new Set((Array.isArray(assignedCardIds) ? assignedCardIds : []).map((cid: any) => String(cid).trim()).filter(Boolean)))
        : prevAdmin.assignedCardIds;

    const mergedPermissions = permissions !== undefined ? { ...prevAdmin.permissions, ...permissions } : prevAdmin.permissions;

    const updateNow = new Date().toISOString();
    admins[idx] = {
      ...prevAdmin,
      name: name !== undefined && String(name).trim() ? String(name).trim() : prevAdmin.name,
      email: nextEmail,
      role: nextRole,
      assignedCardIds: normalizedNextCardIds,
      permissions: {
        ...mergedPermissions,
        canCreateCards: nextRole === 'master',
      },
      updatedAt: updateNow,
    };

    const nextAssignedLower = new Set((admins[idx].assignedCardIds || []).map((cid) => cid.toLowerCase()));

    // Enforce exclusive card reassignment: strip cards newly assigned to this sub-admin from any other restricted sub-admin
    if (nextRole === 'restricted' && nextAssignedLower.size > 0) {
      for (let ai = 0; ai < admins.length; ai++) {
        if (ai === idx) continue;
        if (admins[ai].role === 'restricted' && Array.isArray(admins[ai].assignedCardIds)) {
          const filtered = admins[ai].assignedCardIds.filter((cid) => !nextAssignedLower.has(cid.toLowerCase()));
          if (filtered.length !== admins[ai].assignedCardIds.length) {
            admins[ai] = {
              ...admins[ai],
              assignedCardIds: filtered,
              updatedAt: updateNow,
            };
          }
        }
      }
    }

    writeAdmins(admins);

    // Sync card ownership: clear removed cards AND stamp newly assigned cards exclusively to this sub-admin
    const removedAny =
      nextRole === 'master' ||
      Array.from(prevAssignedLower).some((cid) => !nextAssignedLower.has(cid)) ||
      assignedCardIds !== undefined;

    if (removedAny || (nextRole === 'restricted' && nextAssignedLower.size > 0)) {
      const cards = readCards();
      let cardsDirty = false;
      for (let ci = 0; ci < cards.length; ci++) {
        const card = cards[ci];
        const cidLower = card.id.toLowerCase();
        if (nextRole === 'restricted' && nextAssignedLower.has(cidLower)) {
          if (
            (card.assignedToEmail || '').trim().toLowerCase() !== nextEmail ||
            (card.assignedToUid || '').trim() !== admins[idx].id ||
            (card.assignedToName || '').trim() !== admins[idx].name
          ) {
            cards[ci] = {
              ...card,
              assignedToEmail: nextEmail,
              assignedToUid: admins[idx].id,
              assignedToName: admins[idx].name,
              updatedAt: updateNow,
            };
            cardsDirty = true;
          }
        } else if (!nextAssignedLower.has(cidLower)) {
          const emailOwned =
            Boolean(card.assignedToEmail) &&
            (card.assignedToEmail!.trim().toLowerCase() === prevAdminEmail ||
              card.assignedToEmail!.trim().toLowerCase() === nextEmail);
          const uidOwned = Boolean(card.assignedToUid) && card.assignedToUid!.trim() === prevAdminId;
          if (emailOwned || uidOwned) {
            cards[ci] = {
              ...card,
              assignedToEmail: undefined,
              assignedToUid: undefined,
              assignedToName: undefined,
              updatedAt: updateNow,
            };
            cardsDirty = true;
          }
        }
      }
      if (cardsDirty) {
        writeCards(cards);
      }
    }

    // Keep user role and assignedCardIds synced (and strip reassigned cards from any other user)
    const users = readUsers();
    let usersDirty = false;
    for (let ui = 0; ui < users.length; ui++) {
      const uEmail = users[ui].email.toLowerCase().trim();
      if (uEmail === nextEmail || users[ui].uid === admins[idx].id) {
        users[ui] = {
          ...users[ui],
          role: admins[idx].role,
          assignedCardIds: admins[idx].assignedCardIds,
          accessRevoked: false,
          revokedAt: undefined,
          ...(users[ui].requestStatus ? { requestStatus: 'approved', requestUpdatedAt: updateNow } : {}),
        };
        usersDirty = true;
      } else if (uEmail === prevAdminEmail && prevAdminEmail !== nextEmail) {
        users[ui] = {
          ...users[ui],
          role: 'member',
          assignedCardIds: [],
        };
        usersDirty = true;
      } else if (
        nextRole === 'restricted' &&
        nextAssignedLower.size > 0 &&
        Array.isArray(users[ui].assignedCardIds)
      ) {
        const filtered = users[ui].assignedCardIds!.filter((cid) => !nextAssignedLower.has(cid.toLowerCase()));
        if (filtered.length !== users[ui].assignedCardIds!.length) {
          users[ui] = { ...users[ui], assignedCardIds: filtered };
          usersDirty = true;
        }
      }
    }
    if (usersDirty) {
      writeUsers(users);
    }

    res.json({ success: true, admin: admins[idx] });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to update admin' });
  }
});

// REST API: Delete sub-admin and revoke access immediately (Master Admin Only, preserves all cards/logs/business data)
app.delete('/api/admins/:id', (req: Request, res: Response) => {
  try {
    if (!isMasterAdminStrict(req)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Only Master Admin can delete registered admins.',
      });
    }

    const { id } = req.params;
    const admins = readAdmins();
    const target = admins.find((a) => a.id === id || a.email.toLowerCase() === id.toLowerCase());

    if (!target) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    if (
      target.email.toLowerCase() === PRIMARY_MASTER_EMAIL ||
      (target.role === 'master' && admins.filter((a) => a.role === 'master').length <= 1)
    ) {
      return res.status(400).json({ success: false, message: 'Cannot delete the primary Master Admin' });
    }

    const targetEmail = target.email.toLowerCase();
    // Remove target admin (and any duplicate entry for the same email) from admins store
    const filtered = admins.filter((a) => a.id !== target.id && a.email.toLowerCase() !== targetEmail);
    writeAdmins(filtered);

    // Revoke admin access across all matching user profiles so they can no longer log in as admin or access protected resources
    // NOTE: Strictly do NOT touch cards.json, qr_logs.json, ads.json, or business configurations.
    const now = new Date().toISOString();
    const users = readUsers();
    let matchedAnyUser = false;
    for (let ui = 0; ui < users.length; ui++) {
      if (users[ui].email.toLowerCase().trim() === targetEmail || users[ui].uid === target.id) {
        users[ui] = {
          ...users[ui],
          role: 'member',
          assignedCardIds: [],
          accessRevoked: true,
          revokedAt: now,
        };
        matchedAnyUser = true;
      }
    }
    if (!matchedAnyUser) {
      // Record revocation marker so if this deleted admin attempts future login before re-registration, they are blocked
      users.push({
        uid: `revoked-${target.id}`,
        email: targetEmail,
        displayName: target.name || targetEmail.split('@')[0],
        provider: 'google.com',
        role: 'member',
        emailVerified: true,
        lastLoginAt: now,
        createdAt: now,
        loginCount: 0,
        assignedCardIds: [],
        accessRevoked: true,
        revokedAt: now,
      });
    }
    writeUsers(users);

    res.json({
      success: true,
      message: `Admin "${target.name}" (${target.email}) deleted and access revoked immediately.`,
      deletedAdminId: target.id,
      deletedAdminEmail: target.email,
    });
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
    const {
      uid,
      email,
      displayName,
      photoURL,
      provider,
      role,
      emailVerified,
      device,
      requestStatus,
      requestedAt,
      requestUpdatedAt,
      requestReviewedBy,
      requestNote,
    } = req.body;
    if (!email || !uid) {
      return res.status(400).json({ success: false, message: 'Email and UID are required' });
    }

    const users = readUsers();
    const admins = readAdmins();
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanUid = String(uid).trim();
    const idxByUid = users.findIndex((u) => u.uid === cleanUid);
    const idxByEmail = users.findIndex((u) => u.email.toLowerCase().trim() === cleanEmail);
    const idx = idxByUid !== -1 ? idxByUid : idxByEmail;
    const anyRevokedForUser = users.some(
      (u) => (u.uid === cleanUid || u.email.toLowerCase().trim() === cleanEmail) && Boolean(u.accessRevoked)
    );

    const now = new Date().toISOString();
    const isMasterEmail = cleanEmail === PRIMARY_MASTER_EMAIL;
    const matchedAdmin = admins.find((a) => a.email.toLowerCase().trim() === cleanEmail || a.id === cleanUid);
    const callerIsMaster = isMasterAdminStrict(req);

    // If user's admin access was revoked and they are NOT re-registered in admins, block unauthorized login promotion
    if (!isMasterEmail && !matchedAdmin && anyRevokedForUser && !callerIsMaster) {
      return res.status(403).json({
        success: false,
        revoked: true,
        message: 'Access denied: Your administrator access has been revoked by the Master Admin.',
      });
    }

    // Determine authoritative role: never allow self-escalation to master/restricted unless in admins or requested by Master Admin
    let computedRole: 'master' | 'restricted' | 'member';
    if (isMasterEmail) {
      computedRole = 'master';
    } else if (callerIsMaster && role) {
      computedRole = role;
    } else if (matchedAdmin) {
      computedRole = matchedAdmin.role;
    } else if (idx !== -1 && !users[idx].accessRevoked && (users[idx].role === 'restricted' || users[idx].role === 'master')) {
      computedRole = users[idx].role;
    } else if (idx !== -1 && !users[idx].accessRevoked) {
      computedRole = users[idx].role;
    } else {
      computedRole = 'member';
    }

    // Determine authoritative requestStatus (non-master callers can ONLY submit 'pending', never self-approve)
    const existingReqStatus = idx !== -1 ? users[idx].requestStatus : undefined;
    let resolvedRequestStatus: 'pending' | 'approved' | 'rejected' | undefined = existingReqStatus;
    if (callerIsMaster && (requestStatus === 'pending' || requestStatus === 'approved' || requestStatus === 'rejected')) {
      resolvedRequestStatus = requestStatus;
    } else if (computedRole === 'restricted' || computedRole === 'master') {
      if (existingReqStatus) resolvedRequestStatus = 'approved';
    } else if (requestStatus === 'pending' && !anyRevokedForUser) {
      resolvedRequestStatus = 'pending';
    }

    const sanitizedNote =
      typeof requestNote === 'string' && requestNote.trim()
        ? requestNote.trim().slice(0, 300)
        : (idx !== -1 ? users[idx].requestNote : undefined);

    let updatedUser: UserProfile;
    if (idx !== -1) {
      updatedUser = {
        ...users[idx],
        uid: String(uid).trim() || users[idx].uid,
        email: cleanEmail,
        displayName: displayName ? String(displayName).trim() : users[idx].displayName,
        photoURL: photoURL || users[idx].photoURL,
        provider: provider || users[idx].provider || 'google.com',
        role: computedRole,
        emailVerified: emailVerified !== undefined ? Boolean(emailVerified) : true,
        lastLoginAt: now,
        loginCount: (users[idx].loginCount || 0) + 1,
        device: device || users[idx].device || 'Web Browser',
        assignedCardIds: matchedAdmin ? matchedAdmin.assignedCardIds : (computedRole === 'member' ? [] : (users[idx].assignedCardIds || [])),
        accessRevoked: callerIsMaster && role ? false : (matchedAdmin ? false : users[idx].accessRevoked),
        ...(resolvedRequestStatus ? { requestStatus: resolvedRequestStatus } : {}),
        ...(resolvedRequestStatus ? { requestedAt: users[idx].requestedAt || requestedAt || now } : {}),
        ...(resolvedRequestStatus ? { requestUpdatedAt: requestUpdatedAt || now } : {}),
        ...(callerIsMaster && requestReviewedBy ? { requestReviewedBy: String(requestReviewedBy).trim() } : {}),
        ...(sanitizedNote ? { requestNote: sanitizedNote } : {}),
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
        assignedCardIds: matchedAdmin ? matchedAdmin.assignedCardIds : [],
        accessRevoked: false,
        ...(resolvedRequestStatus ? { requestStatus: resolvedRequestStatus } : {}),
        ...(resolvedRequestStatus ? { requestedAt: requestedAt || now } : {}),
        ...(resolvedRequestStatus ? { requestUpdatedAt: requestUpdatedAt || now } : {}),
        ...(callerIsMaster && requestReviewedBy ? { requestReviewedBy: String(requestReviewedBy).trim() } : {}),
        ...(sanitizedNote ? { requestNote: sanitizedNote } : {}),
      };
      users.push(updatedUser);
    }

    writeUsers(users);

    // Sync admins store cleanly:
    // - If Master Admin explicitly sets a user to restricted/master, create or update their admin entry
    // - If Master Admin demotes to member, remove from admins
    // - Otherwise, if matchedAdmin already exists, only refresh displayName without ever auto-promoting on login
    if (callerIsMaster && !isMasterEmail && role) {
      if (computedRole === 'restricted' || computedRole === 'master') {
        if (matchedAdmin) {
          matchedAdmin.role = computedRole;
          matchedAdmin.name = updatedUser.displayName || matchedAdmin.name;
          matchedAdmin.permissions = {
            ...matchedAdmin.permissions,
            canCreateCards: computedRole === 'master',
          };
          matchedAdmin.updatedAt = now;
        } else {
          admins.push({
            id: updatedUser.uid || `admin-${Date.now()}`,
            email: cleanEmail,
            name: updatedUser.displayName || cleanEmail.split('@')[0],
            role: computedRole,
            assignedCardIds: updatedUser.assignedCardIds || [],
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
      } else if (computedRole === 'member' && matchedAdmin) {
        writeAdmins(admins.filter((a) => a.email.toLowerCase() !== cleanEmail));
      }
    } else if (matchedAdmin) {
      matchedAdmin.name = updatedUser.displayName || matchedAdmin.name;
      matchedAdmin.updatedAt = now;
      writeAdmins(admins);
    }

    res.json({ success: true, user: updatedUser });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to save user' });
  }
});

// REST API: Delete user (Master Admin Only)
app.delete('/api/users/:uid', (req: Request, res: Response) => {
  try {
    if (!isMasterAdminStrict(req)) {
      return res.status(403).json({ success: false, message: 'Forbidden: Only Master Admin can delete users.' });
    }
    const { uid } = req.params;
    const users = readUsers();
    const target = users.find((u) => u.uid === uid || u.email.toLowerCase() === uid.toLowerCase());
    if (!target) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (target.email.toLowerCase() === PRIMARY_MASTER_EMAIL) {
      return res.status(400).json({ success: false, message: 'Cannot delete primary master account' });
    }
    const filtered = users.filter((u) => u.uid !== target.uid);
    writeUsers(filtered);
    res.json({ success: true, message: 'User removed successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to delete user' });
  }
});

// ================= Pending Sub-Admin Access Requests API =================

// REST API: List Sub-Admin access requests (Master Admin Only)
app.get('/api/admin-requests', (req: Request, res: Response) => {
  try {
    if (!isMasterAdminStrict(req)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Only Master Admin can view Sub-Admin access requests.',
      });
    }
    const users = readUsers();
    const requests = users
      .filter((u) => Boolean(u.requestStatus) && u.email.toLowerCase().trim() !== PRIMARY_MASTER_EMAIL)
      .sort((a, b) => {
        const ta = new Date(a.requestedAt || a.createdAt || 0).getTime();
        const tb = new Date(b.requestedAt || b.createdAt || 0).getTime();
        return tb - ta;
      });
    res.json({ success: true, requests });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to fetch admin requests' });
  }
});

// REST API: Submit or re-submit a Sub-Admin access request (Authenticated User)
app.post('/api/admin-requests', (req: Request, res: Response) => {
  try {
    const { uid, email, displayName, photoURL, note } = req.body;
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanUid = String(uid || '').trim();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || !cleanUid) {
      return res.status(400).json({ success: false, message: 'Valid Google email and UID are required.' });
    }
    if (cleanEmail === PRIMARY_MASTER_EMAIL) {
      return res.status(400).json({ success: false, message: 'Master Admin account already has full access.' });
    }

    const users = readUsers();
    const admins = readAdmins();
    const existingAdmin = admins.find((a) => a.email.toLowerCase().trim() === cleanEmail || a.id === cleanUid);
    const existingIdx = users.findIndex((u) => u.uid === cleanUid || u.email.toLowerCase().trim() === cleanEmail);
    const anyRevoked = users.some(
      (u) => (u.uid === cleanUid || u.email.toLowerCase().trim() === cleanEmail) && Boolean(u.accessRevoked)
    );

    if (anyRevoked && !existingAdmin) {
      return res.status(403).json({
        success: false,
        revoked: true,
        message: 'Your administrator access was revoked by the Master Admin and cannot request self-reinstatement.',
      });
    }

    const now = new Date().toISOString();
    const cleanNote = typeof note === 'string' && note.trim() ? note.trim().slice(0, 300) : undefined;

    if (existingAdmin) {
      // Already an approved admin
      let syncedUser: UserProfile;
      if (existingIdx !== -1) {
        syncedUser = {
          ...users[existingIdx],
          uid: cleanUid,
          email: cleanEmail,
          displayName: displayName ? String(displayName).trim() : users[existingIdx].displayName,
          role: existingAdmin.role,
          assignedCardIds: existingAdmin.assignedCardIds || [],
          accessRevoked: false,
          requestStatus: 'approved',
          requestUpdatedAt: now,
        };
        users[existingIdx] = syncedUser;
      } else {
        syncedUser = {
          uid: cleanUid,
          email: cleanEmail,
          displayName: displayName ? String(displayName).trim() : existingAdmin.name || cleanEmail.split('@')[0],
          photoURL: photoURL || undefined,
          provider: 'google.com',
          role: existingAdmin.role,
          emailVerified: true,
          lastLoginAt: now,
          createdAt: now,
          loginCount: 1,
          assignedCardIds: existingAdmin.assignedCardIds || [],
          accessRevoked: false,
          requestStatus: 'approved',
          requestedAt: now,
          requestUpdatedAt: now,
        };
        users.push(syncedUser);
      }
      writeUsers(users);
      return res.json({ success: true, user: syncedUser, alreadyAuthorized: true });
    }

    let savedUser: UserProfile;
    if (existingIdx !== -1) {
      savedUser = {
        ...users[existingIdx],
        uid: cleanUid || users[existingIdx].uid,
        email: cleanEmail,
        displayName: displayName ? String(displayName).trim() : users[existingIdx].displayName,
        photoURL: photoURL || users[existingIdx].photoURL,
        role: 'member',
        assignedCardIds: [],
        accessRevoked: false,
        requestStatus: 'pending',
        requestedAt: users[existingIdx].requestStatus === 'pending' && users[existingIdx].requestedAt ? users[existingIdx].requestedAt : now,
        requestUpdatedAt: now,
        ...(cleanNote !== undefined ? { requestNote: cleanNote } : {}),
      };
      users[existingIdx] = savedUser;
    } else {
      savedUser = {
        uid: cleanUid,
        email: cleanEmail,
        displayName: displayName ? String(displayName).trim() : cleanEmail.split('@')[0],
        photoURL:
          photoURL ||
          `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(cleanEmail)}&backgroundColor=1a73e8&textColor=ffffff`,
        provider: 'google.com',
        role: 'member',
        emailVerified: true,
        lastLoginAt: now,
        createdAt: now,
        loginCount: 1,
        assignedCardIds: [],
        accessRevoked: false,
        requestStatus: 'pending',
        requestedAt: now,
        requestUpdatedAt: now,
        ...(cleanNote !== undefined ? { requestNote: cleanNote } : {}),
      };
      users.push(savedUser);
    }

    writeUsers(users);
    res.json({ success: true, user: savedUser });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to submit access request' });
  }
});

// REST API: Approve a Pending Sub-Admin Access Request (Master Admin Only)
app.post('/api/admin-requests/:id/approve', (req: Request, res: Response) => {
  try {
    if (!isMasterAdminStrict(req)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Only Master Admin can approve Sub-Admin requests.',
      });
    }

    const cleanTarget = decodeURIComponent(String(req.params.id || '')).trim();
    const cleanTargetLower = cleanTarget.toLowerCase();
    const { email, displayName, assignedCardIds } = req.body || {};

    const users = readUsers();
    const admins = readAdmins();

    const matchedUsers = users.filter(
      (u) =>
        u.uid === cleanTarget ||
        u.email.toLowerCase().trim() === cleanTargetLower ||
        (email && u.email.toLowerCase().trim() === String(email).trim().toLowerCase())
    );
    const primaryUser = matchedUsers[0];
    const targetEmail = (
      primaryUser?.email ||
      (email ? String(email) : cleanTargetLower.includes('@') ? cleanTargetLower : '')
    )
      .trim()
      .toLowerCase();

    if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      return res.status(404).json({ success: false, message: 'Pending request user not found.' });
    }
    if (targetEmail === PRIMARY_MASTER_EMAIL) {
      return res.status(400).json({ success: false, message: 'Cannot modify primary Master Admin.' });
    }

    const now = new Date().toISOString();
    const reviewer = String(req.headers['x-admin-email'] || PRIMARY_MASTER_EMAIL).trim().toLowerCase();
    const resolvedName =
      (displayName && String(displayName).trim()) ||
      primaryUser?.displayName ||
      targetEmail.split('@')[0];
    const resolvedUid = primaryUser?.uid || `google-preauth-${targetEmail.replace(/[^a-z0-9]/g, '-')}`;

    const existingAdminIdx = admins.findIndex(
      (a) => a.email.toLowerCase().trim() === targetEmail || a.id === resolvedUid
    );
    const requestedCardIds = Array.isArray(assignedCardIds)
      ? Array.from(new Set(assignedCardIds.map((cid: any) => String(cid).trim()).filter(Boolean)))
      : existingAdminIdx !== -1
      ? admins[existingAdminIdx].assignedCardIds || []
      : primaryUser?.assignedCardIds || [];

    // Exclusive reassignment if cards were specified during approval
    const cardLowerSet = new Set(requestedCardIds.map((cid) => cid.toLowerCase()));
    if (cardLowerSet.size > 0) {
      for (let ai = 0; ai < admins.length; ai++) {
        if (ai === existingAdminIdx) continue;
        if (admins[ai].role === 'restricted' && Array.isArray(admins[ai].assignedCardIds)) {
          const filtered = admins[ai].assignedCardIds.filter((cid) => !cardLowerSet.has(cid.toLowerCase()));
          if (filtered.length !== admins[ai].assignedCardIds.length) {
            admins[ai] = { ...admins[ai], assignedCardIds: filtered, updatedAt: now };
          }
        }
      }
      const cards = readCards();
      let cardsDirty = false;
      for (let ci = 0; ci < cards.length; ci++) {
        if (cardLowerSet.has(cards[ci].id.toLowerCase())) {
          cards[ci] = {
            ...cards[ci],
            assignedToEmail: targetEmail,
            assignedToUid: existingAdminIdx !== -1 ? admins[existingAdminIdx].id : resolvedUid,
            assignedToName: resolvedName,
            updatedAt: now,
          };
          cardsDirty = true;
        }
      }
      if (cardsDirty) writeCards(cards);
    }

    let approvedAdmin: AdminUser;
    if (existingAdminIdx !== -1) {
      approvedAdmin = {
        ...admins[existingAdminIdx],
        email: targetEmail,
        name: resolvedName,
        role: 'restricted',
        assignedCardIds: requestedCardIds,
        updatedAt: now,
      };
      admins[existingAdminIdx] = approvedAdmin;
    } else {
      approvedAdmin = {
        id: resolvedUid,
        email: targetEmail,
        name: resolvedName,
        role: 'restricted',
        assignedCardIds: requestedCardIds,
        permissions: {
          canEditCards: true,
          canToggleAi: true,
          canExportCsv: false,
          canCreateCards: false,
        },
        createdAt: now,
        updatedAt: now,
      };
      admins.push(approvedAdmin);
    }
    writeAdmins(admins);

    let updatedUser: UserProfile | null = null;
    for (let ui = 0; ui < users.length; ui++) {
      const uEmail = users[ui].email.toLowerCase().trim();
      if (uEmail === targetEmail || users[ui].uid === resolvedUid) {
        users[ui] = {
          ...users[ui],
          email: targetEmail,
          displayName: resolvedName,
          role: 'restricted',
          assignedCardIds: requestedCardIds,
          accessRevoked: false,
          revokedAt: undefined,
          requestStatus: 'approved',
          requestedAt: users[ui].requestedAt || now,
          requestUpdatedAt: now,
          requestReviewedBy: reviewer,
        };
        if (!updatedUser) updatedUser = users[ui];
      } else if (cardLowerSet.size > 0 && Array.isArray(users[ui].assignedCardIds)) {
        const filtered = users[ui].assignedCardIds!.filter((cid) => !cardLowerSet.has(cid.toLowerCase()));
        if (filtered.length !== users[ui].assignedCardIds!.length) {
          users[ui] = { ...users[ui], assignedCardIds: filtered };
        }
      }
    }
    if (!updatedUser) {
      updatedUser = {
        uid: resolvedUid,
        email: targetEmail,
        displayName: resolvedName,
        photoURL: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(targetEmail)}&backgroundColor=1a73e8&textColor=ffffff`,
        provider: 'google.com',
        role: 'restricted',
        emailVerified: true,
        lastLoginAt: now,
        createdAt: now,
        loginCount: 0,
        assignedCardIds: requestedCardIds,
        accessRevoked: false,
        requestStatus: 'approved',
        requestedAt: now,
        requestUpdatedAt: now,
        requestReviewedBy: reviewer,
      };
      users.push(updatedUser);
    }
    writeUsers(users);

    res.json({
      success: true,
      admin: approvedAdmin,
      user: updatedUser,
      message: `Approved ${resolvedName} (${targetEmail}) as a Sub-Admin.`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to approve Sub-Admin request' });
  }
});

// REST API: Reject a Pending Sub-Admin Access Request (Master Admin Only)
app.post('/api/admin-requests/:id/reject', (req: Request, res: Response) => {
  try {
    if (!isMasterAdminStrict(req)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Only Master Admin can reject Sub-Admin requests.',
      });
    }

    const cleanTarget = decodeURIComponent(String(req.params.id || '')).trim();
    const cleanTargetLower = cleanTarget.toLowerCase();
    const { email, displayName } = req.body || {};

    const users = readUsers();
    const admins = readAdmins();

    const matchedUsers = users.filter(
      (u) =>
        u.uid === cleanTarget ||
        u.email.toLowerCase().trim() === cleanTargetLower ||
        (email && u.email.toLowerCase().trim() === String(email).trim().toLowerCase())
    );
    const primaryUser = matchedUsers[0];
    const targetEmail = (
      primaryUser?.email ||
      (email ? String(email) : cleanTargetLower.includes('@') ? cleanTargetLower : '')
    )
      .trim()
      .toLowerCase();

    if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      return res.status(404).json({ success: false, message: 'Pending request user not found.' });
    }
    if (targetEmail === PRIMARY_MASTER_EMAIL) {
      return res.status(400).json({ success: false, message: 'Cannot reject primary Master Admin.' });
    }

    const now = new Date().toISOString();
    const reviewer = String(req.headers['x-admin-email'] || PRIMARY_MASTER_EMAIL).trim().toLowerCase();
    const resolvedName =
      (displayName && String(displayName).trim()) ||
      primaryUser?.displayName ||
      targetEmail.split('@')[0];
    const resolvedUid = primaryUser?.uid || cleanTarget;

    // Remove any non-master entry in admins.json for this email
    const filteredAdmins = admins.filter(
      (a) => a.email.toLowerCase().trim() !== targetEmail && a.id !== resolvedUid
    );
    if (filteredAdmins.length !== admins.length) {
      writeAdmins(filteredAdmins);
    }

    let updatedUser: UserProfile | null = null;
    for (let ui = 0; ui < users.length; ui++) {
      const uEmail = users[ui].email.toLowerCase().trim();
      if (uEmail === targetEmail || users[ui].uid === resolvedUid) {
        users[ui] = {
          ...users[ui],
          role: 'member',
          assignedCardIds: [],
          requestStatus: 'rejected',
          requestedAt: users[ui].requestedAt || now,
          requestUpdatedAt: now,
          requestReviewedBy: reviewer,
        };
        if (!updatedUser) updatedUser = users[ui];
      }
    }
    if (!updatedUser) {
      updatedUser = {
        uid: resolvedUid,
        email: targetEmail,
        displayName: resolvedName,
        provider: 'google.com',
        role: 'member',
        emailVerified: true,
        lastLoginAt: now,
        createdAt: now,
        loginCount: 0,
        assignedCardIds: [],
        accessRevoked: false,
        requestStatus: 'rejected',
        requestedAt: now,
        requestUpdatedAt: now,
        requestReviewedBy: reviewer,
      };
      users.push(updatedUser);
    }
    writeUsers(users);

    res.json({
      success: true,
      user: updatedUser,
      message: `Rejected Sub-Admin access request for ${resolvedName} (${targetEmail}).`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to reject Sub-Admin request' });
  }
});

// AI Review Generation Route using @google/genai (delegates to shared service)
app.post('/api/generate-review', async (req: Request, res: Response) => {
  try {
    const { cardId, aiReviewEnabled, language, tone } = req.body;
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
      const cards = readCards();
      const targetCard = cards.find((c) => c.id.toLowerCase() === String(cardId).trim().toLowerCase());
      if (targetCard) {
        // Enforce subscription validation on server first
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
  return isMasterAdminStrict(req);
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



// ================= QR Scan Logs REST API =================

// GET /api/logs: Retrieve scan logs with filtering, pagination, and role-based access
app.get('/api/logs', (req: Request, res: Response) => {
  try {
    const logs = readLogs();
    const { cardId, businessName, search, source, startDate, endDate, page = '1', limit = '50' } = req.query;

    const caller = resolveCallerAdmin(req);
    let allowedCardIds: Set<string> | null = null;

    if (caller.provided) {
      if (caller.revoked) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: Administrator access revoked.',
          logs: [],
          totalCount: 0,
        });
      }
      if (!caller.isMaster) {
        if (caller.admin && caller.admin.role === 'restricted') {
          const allCards = readCards();
          const permitted = allCards
            .filter((c) => isCardExplicitlyAssignedToAdmin(c, caller.admin!))
            .map((c) => c.id.toLowerCase());
          for (const cid of caller.admin.assignedCardIds || []) {
            permitted.push(cid.toLowerCase());
          }
          allowedCardIds = new Set(permitted);
        } else {
          allowedCardIds = new Set();
        }
      }
    }

    let filtered = logs;

    // Sub-admin RBAC boundary
    if (allowedCardIds !== null) {
      filtered = filtered.filter((l) => allowedCardIds!.has(l.cardId.toLowerCase()));
    }

    // Filter by specific card ID
    if (cardId && typeof cardId === 'string' && cardId !== 'all') {
      const cleanCardId = cardId.toLowerCase().trim();
      filtered = filtered.filter((l) => l.cardId.toLowerCase() === cleanCardId);
    }

    // Filter by business name
    if (businessName && typeof businessName === 'string' && businessName !== 'all') {
      const cleanBiz = businessName.toLowerCase().trim();
      filtered = filtered.filter((l) => l.businessName.toLowerCase().includes(cleanBiz));
    }

    // Filter by source (qr, nfc, etc.)
    if (source && typeof source === 'string' && source !== 'all') {
      filtered = filtered.filter((l) => l.source === source);
    }

    // Filter by date range
    if (startDate && typeof startDate === 'string') {
      const startMs = new Date(startDate).getTime();
      if (!isNaN(startMs)) {
        filtered = filtered.filter((l) => new Date(l.timestamp).getTime() >= startMs);
      }
    }
    if (endDate && typeof endDate === 'string') {
      const endMs = new Date(endDate).getTime();
      if (!isNaN(endMs)) {
        filtered = filtered.filter((l) => new Date(l.timestamp).getTime() <= endMs);
      }
    }

    // Free-text search
    if (search && typeof search === 'string' && search.trim()) {
      const term = search.toLowerCase().trim();
      filtered = filtered.filter(
        (l) =>
          l.cardId.toLowerCase().includes(term) ||
          l.businessName.toLowerCase().includes(term) ||
          (l.category && l.category.toLowerCase().includes(term)) ||
          (l.device && l.device.toLowerCase().includes(term)) ||
          (l.browser && l.browser.toLowerCase().includes(term)) ||
          (l.ip && l.ip.includes(term))
      );
    }

    const totalCount = filtered.length;

    // Pagination
    const numLimit = limit === 'all' ? totalCount : Math.max(parseInt(limit as string, 10) || 50, 1);
    const numPage = Math.max(parseInt(page as string, 10) || 1, 1);
    const startIndex = (numPage - 1) * numLimit;
    const paginated = limit === 'all' ? filtered : filtered.slice(startIndex, startIndex + numLimit);

    res.json({
      success: true,
      totalCount,
      page: numPage,
      limit: numLimit,
      totalPages: Math.ceil(totalCount / numLimit) || 1,
      logs: paginated,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to fetch logs' });
  }
});

// POST /api/logs: Record a scan log from client or simulator
app.post('/api/logs', (req: Request, res: Response) => {
  try {
    const { cardId, source, businessName, category } = req.body;
    if (!cardId) {
      return res.status(400).json({ success: false, message: 'Card ID is required' });
    }

    const cards = readCards();
    const card = cards.find((c) => c.id.toLowerCase() === String(cardId).toLowerCase().trim());
    const effectiveCard: CardRecord = card || {
      id: String(cardId),
      businessName: businessName || `Card #${cardId}`,
      category: category || 'Customer Experience',
      status: 'available',
      googleReviewUrl: '',
      notes: '',
      scansCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (card) {
      card.scansCount = (card.scansCount || 0) + 1;
      card.updatedAt = new Date().toISOString();
      writeCards(cards);
    }

    const scanLog = logQrScan(effectiveCard, req, source);
    res.json({ success: true, log: scanLog });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to record scan log' });
  }
});

// GET /api/logs/stats: Summary analytics
app.get('/api/logs/stats', (req: Request, res: Response) => {
  try {
    const logs = readLogs();

    const caller = resolveCallerAdmin(req);
    let allowedCardIds: Set<string> | null = null;
    if (caller.provided) {
      if (caller.revoked) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: Administrator access revoked.',
        });
      }
      if (!caller.isMaster) {
        if (caller.admin && caller.admin.role === 'restricted') {
          const allCards = readCards();
          const permitted = allCards
            .filter((c) => isCardExplicitlyAssignedToAdmin(c, caller.admin!))
            .map((c) => c.id.toLowerCase());
          for (const cid of caller.admin.assignedCardIds || []) {
            permitted.push(cid.toLowerCase());
          }
          allowedCardIds = new Set(permitted);
        } else {
          allowedCardIds = new Set();
        }
      }
    }

    const visibleLogs = allowedCardIds !== null
      ? logs.filter((l) => allowedCardIds!.has(l.cardId.toLowerCase()))
      : logs;

    const totalScans = visibleLogs.length;
    const uniqueCards = new Set(visibleLogs.map((l) => l.cardId)).size;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayScans = visibleLogs.filter((l) => new Date(l.timestamp).getTime() >= todayStart.getTime()).length;

    const sourceBreakdown: Record<string, number> = { qr: 0, nfc: 0, direct: 0, simulator: 0 };
    const deviceBreakdown: Record<string, number> = { mobile: 0, desktop: 0 };

    for (const log of visibleLogs) {
      sourceBreakdown[log.source] = (sourceBreakdown[log.source] || 0) + 1;
      if (log.device?.toLowerCase().includes('mobile') || log.device?.toLowerCase().includes('phone') || log.device?.toLowerCase().includes('ios') || log.device?.toLowerCase().includes('android')) {
        deviceBreakdown.mobile++;
      } else {
        deviceBreakdown.desktop++;
      }
    }

    res.json({
      success: true,
      stats: {
        totalScans,
        uniqueCards,
        todayScans,
        sourceBreakdown,
        deviceBreakdown,
      },
      totalScans,
      uniqueCards,
      todayScans,
      sourceBreakdown,
      deviceBreakdown,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to calculate stats' });
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
        logQrScan(card, req, 'qr');

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
      // Record scan analytics count and write scan log
      card.scansCount = (card.scansCount || 0) + 1;
      card.updatedAt = new Date().toISOString();
      writeCards(cards);
      const isNfc = req.path.startsWith('/nfc') || req.query.source === 'nfc';
      logQrScan(card, req, isNfc ? 'nfc' : 'qr');

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
    const disableHmr = process.env.DISABLE_HMR === 'true' || Boolean(process.env.K_SERVICE);
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ...(disableHmr ? { hmr: false } : {}),
      },
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
