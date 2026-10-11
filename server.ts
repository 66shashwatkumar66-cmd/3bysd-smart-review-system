import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'cards.json');
const ADMINS_FILE = path.join(DATA_DIR, 'admins.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

app.use(express.json());

// Initialize Supabase Client for Cloud Database Sync
function resolveSupabaseUrl(): string {
  const candidates = [
    process.env.VITE_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_URL,
    'https://lebpkfffdygcwqagjart.supabase.co',
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && (c.startsWith('https://') || c.startsWith('http://'))) {
      return c.trim();
    }
  }
  return 'https://lebpkfffdygcwqagjart.supabase.co';
}

function resolveSupabaseKey(): string {
  const candidates = [
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.VITE_SUPABASE_ANON_KEY,
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    process.env.SUPABASE_ANON_KEY,
    process.env.SUPABASE_KEY,
    'sb_publishable_v6EEzqWTb7je2mQSL1X8Mw_3skO31Gr',
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && !c.startsWith('http://') && !c.startsWith('https://') && c.length > 10) {
      return c.trim();
    }
  }
  return 'sb_publishable_v6EEzqWTb7je2mQSL1X8Mw_3skO31Gr';
}

const SUPABASE_URL = resolveSupabaseUrl();
const SUPABASE_KEY = resolveSupabaseKey();

let supabaseClient: any = null;
try {
  supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('✅ Supabase Client initialized with endpoint:', SUPABASE_URL);
} catch (e) {
  console.warn('⚠️ Supabase could not be initialized:', e);
}


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

// In-memory + file-backed persistent card store
function ensureDataFile(): void {
  ensureAdminsFile();
  ensureUsersFile();
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

// REST API: Get all cards (RBAC Filtered)
app.get('/api/cards', (req: Request, res: Response) => {
  const cards = readCards();
  const userEmail = (req.headers['x-user-email'] as string || req.query.userEmail as string || '').toLowerCase().trim();
  const userRole = (req.headers['x-user-role'] as string || req.query.userRole as string || '').toLowerCase().trim();

  // If requesting user is NOT master admin, strictly filter cards allocated to them
  const isMaster = userEmail === '66shashwatkumar66@gmail.com' || userRole === 'master';
  if (userEmail && !isMaster) {
    const userUid = (req.headers['x-user-uid'] as string) || '';
    const filtered = cards.filter(
      (c) =>
        (c.assignedToEmail && c.assignedToEmail.toLowerCase() === userEmail) ||
        (userUid && c.assignedToUid === userUid)
    );
    return res.json({ success: true, cards: filtered });
  }

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
    const requesterEmail = (req.headers['x-user-email'] as string || req.body.userEmail || '').toLowerCase().trim();
    const requesterRole = (req.headers['x-user-role'] as string || req.body.userRole || '').toLowerCase().trim();

    // Check if non-master attempts to create cards
    if (requesterEmail && requesterEmail !== '66shashwatkumar66@gmail.com' && requesterRole !== 'master') {
      return res.status(403).json({
        success: false,
        message: 'Permission Denied: Only Master Admin can generate new QR inventory cards.',
      });
    }

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
    const index = cards.findIndex((c) => c.id.toLowerCase() === id.toLowerCase());

    if (index === -1) {
      return res.status(404).json({ success: false, message: `Card ${id} not found` });
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
      updatedAt: new Date().toISOString(),
    };

    writeCards(cards);
    syncCardToSupabase(cards[index]);

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
        syncCardToSupabase(cards[i]);
      }
    }

    writeCards(cards);
    res.json({ success: true, count: updatedCards.length, cards: updatedCards });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Bulk update failed' });
  }
});

// REST API: Delete card (Master Admin Only)
app.delete('/api/cards/:id', (req: Request, res: Response) => {
  try {
    const requesterEmail = (req.headers['x-user-email'] as string || req.body.userEmail || '').toLowerCase().trim();
    const requesterRole = (req.headers['x-user-role'] as string || req.body.userRole || '').toLowerCase().trim();

    if (requesterEmail && requesterEmail !== '66shashwatkumar66@gmail.com' && requesterRole !== 'master') {
      return res.status(403).json({
        success: false,
        message: 'Permission Denied: Only Master Admin can delete cards.',
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
          return res.json({ success: true, review: generatedText, reviewText: generatedText });
        }
      } catch (geminiError: any) {
        console.warn('Gemini API call skipped or timed out, using fallback:', geminiError.message);
      }
    }

    // High quality fallback generator if API key is not configured yet or fails
    const fallbackReview = generateSmartFallbackReview(safeBusinessName, ratingNum, tagsList, safeNotes);
    return res.json({ success: true, review: fallbackReview, reviewText: fallbackReview });
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

// Helper to sync card changes to Supabase public.cards table
async function syncCardToSupabase(card: CardRecord) {
  if (!supabaseClient) return;
  try {
    const row = {
      card_id: card.id,
      business_name: card.businessName || '',
      google_review_url: card.googleReviewUrl || '',
      status: card.status,
      updated_at: new Date().toISOString(),
    };
    const { data: existing } = await supabaseClient
      .from('cards')
      .select('id')
      .eq('card_id', card.id)
      .limit(1);

    if (existing && existing.length > 0) {
      await supabaseClient.from('cards').update(row).eq('card_id', card.id);
    } else {
      await supabaseClient.from('cards').insert([row]);
    }
  } catch (err) {
    console.warn('Supabase card sync notice:', err);
  }
}

async function syncCardScanToSupabase(cardId: string, _count: number) {
  if (!supabaseClient) return;
  try {
    supabaseClient
      .from('analytics_scans')
      .insert([{ card_id: cardId, scanned_at: new Date().toISOString() }])
      .then(() => {});
  } catch {
    // ignore
  }
}

// Supabase Status & Cloud Diagnostics API
app.get('/api/supabase/status', async (_req: Request, res: Response) => {
  try {
    if (!supabaseClient) {
      return res.json({
        connected: false,
        url: SUPABASE_URL,
        message: 'Supabase client not initialized',
      });
    }

    const { data, error } = await supabaseClient.from('cards').select('*').limit(10);
    if (error) {
      return res.json({
        connected: false,
        url: SUPABASE_URL,
        error: error.message,
      });
    }

    return res.json({
      connected: true,
      url: SUPABASE_URL,
      cardsCount: data ? data.length : 0,
      cardsSample: data,
    });
  } catch (err: any) {
    res.status(500).json({ connected: false, error: err.message });
  }
});

// Supabase Two-Way Sync API
app.post('/api/supabase/sync', async (req: Request, res: Response) => {
  try {
    const { direction } = req.body; // 'push' or 'pull'
    if (!supabaseClient) {
      return res.status(500).json({ success: false, message: 'Supabase client not ready' });
    }

    if (direction === 'pull') {
      const { data, error } = await supabaseClient.from('cards').select('*');
      if (error) return res.status(500).json({ success: false, error: error.message });

      const localCards = readCards();
      for (const row of data || []) {
        const found = localCards.find((c) => c.id.toLowerCase() === row.card_id?.toLowerCase());
        if (found) {
          found.businessName = row.business_name || found.businessName;
          found.googleReviewUrl = row.google_review_url || found.googleReviewUrl;
          found.status = row.status || found.status;
          found.updatedAt = row.updated_at || new Date().toISOString();
        } else if (row.card_id) {
          localCards.push({
            id: row.card_id,
            businessName: row.business_name || '',
            googleReviewUrl: row.google_review_url || '',
            category: 'Local Business',
            status: row.status || 'available',
            notes: '',
            aiReviewEnabled: false,
            scansCount: 0,
            createdAt: row.created_at || new Date().toISOString(),
            updatedAt: row.updated_at || new Date().toISOString(),
          });
        }
      }
      writeCards(localCards);
      return res.json({ success: true, message: 'Successfully imported cards from Supabase', count: (data || []).length });
    } else {
      const localCards = readCards();
      let pushed = 0;
      for (const card of localCards) {
        await syncCardToSupabase(card);
        pushed++;
      }
      return res.json({ success: true, message: 'Successfully exported local cards to Supabase', count: pushed });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
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
        syncCardScanToSupabase(card.id, card.scansCount);

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

      // Async sync scan count
      syncCardScanToSupabase(card.id, card.scansCount);

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
