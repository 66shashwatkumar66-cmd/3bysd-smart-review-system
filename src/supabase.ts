import { createClient } from '@supabase/supabase-js';
import { CardRecord, AdminUser } from './types';

// Supabase credentials provided by user with robust URL and Key validation
function resolveSupabaseUrl(): string {
  const candidates = [
    typeof import.meta !== 'undefined' ? import.meta.env?.VITE_SUPABASE_URL : undefined,
    typeof import.meta !== 'undefined' ? import.meta.env?.NEXT_PUBLIC_SUPABASE_URL : undefined,
    typeof process !== 'undefined' ? process.env?.VITE_SUPABASE_URL : undefined,
    typeof process !== 'undefined' ? process.env?.NEXT_PUBLIC_SUPABASE_URL : undefined,
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
    typeof import.meta !== 'undefined' ? import.meta.env?.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY : undefined,
    typeof import.meta !== 'undefined' ? import.meta.env?.VITE_SUPABASE_ANON_KEY : undefined,
    typeof process !== 'undefined' ? process.env?.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY : undefined,
    typeof process !== 'undefined' ? process.env?.VITE_SUPABASE_ANON_KEY : undefined,
    'sb_publishable_v6EEzqWTb7je2mQSL1X8Mw_3skO31Gr',
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && !c.startsWith('http://') && !c.startsWith('https://') && c.length > 10) {
      return c.trim();
    }
  }
  return 'sb_publishable_v6EEzqWTb7je2mQSL1X8Mw_3skO31Gr';
}

export const SUPABASE_URL = resolveSupabaseUrl();
export const SUPABASE_ANON_KEY = resolveSupabaseKey();

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Interface matching the user's Supabase public.cards table
 */
export interface SupabaseCardRow {
  id?: number;
  card_id: string;
  business_name?: string | null;
  google_review_url?: string | null;
  status: string;
  category?: string | null;
  notes?: string | null;
  ai_review_enabled?: boolean | null;
  scans_count?: number | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Convert local CardRecord to Supabase row format
 */
export function cardRecordToSupabase(card: CardRecord): Partial<SupabaseCardRow> {
  const row: Partial<SupabaseCardRow> = {
    card_id: card.id,
    business_name: card.businessName || '',
    google_review_url: card.googleReviewUrl || '',
    status: card.status,
    updated_at: new Date().toISOString(),
  };
  return row;
}

/**
 * Convert Supabase row to local CardRecord format
 */
export function supabaseToCardRecord(row: SupabaseCardRow): CardRecord {
  return {
    id: row.card_id,
    status: (row.status as CardRecord['status']) || 'available',
    businessName: row.business_name || '',
    category: row.category || 'Local Business',
    googleReviewUrl: row.google_review_url || '',
    notes: row.notes || '',
    aiReviewEnabled: row.ai_review_enabled === true,
    scansCount: Number(row.scans_count) || 0,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

/**
 * Fetch all cards from Supabase public.cards table
 */
export async function fetchCardsFromSupabase(): Promise<{
  success: boolean;
  cards: CardRecord[];
  error?: string;
}> {
  try {
    const { data, error } = await supabase
      .from('cards')
      .select('*')
      .order('card_id', { ascending: true });

    if (error) {
      return { success: false, cards: [], error: error.message };
    }

    const cards = (data || []).map((row) => supabaseToCardRecord(row as SupabaseCardRow));
    return { success: true, cards };
  } catch (err: any) {
    return { success: false, cards: [], error: err.message || 'Network error' };
  }
}

/**
 * Upsert card into Supabase
 */
export async function upsertCardToSupabase(card: CardRecord): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const row = cardRecordToSupabase(card);
    // Check if card_id already exists in Supabase
    const { data: existing } = await supabase
      .from('cards')
      .select('id')
      .eq('card_id', card.id)
      .limit(1);

    if (existing && existing.length > 0) {
      const { error } = await supabase
        .from('cards')
        .update(row)
        .eq('card_id', card.id);
      if (error) return { success: false, error: error.message };
    } else {
      const { error } = await supabase.from('cards').insert([row]);
      if (error) return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Test Supabase connectivity and return schema status
 */
export async function testSupabaseConnection(): Promise<{
  connected: boolean;
  cardsTableExists: boolean;
  rowCount: number;
  adminsTableExists: boolean;
  error?: string;
}> {
  try {
    const { data, error, count } = await supabase
      .from('cards')
      .select('*', { count: 'exact', head: false })
      .limit(5);

    if (error) {
      return {
        connected: false,
        cardsTableExists: false,
        rowCount: 0,
        adminsTableExists: false,
        error: error.message,
      };
    }

    // Check public.admins
    let adminsExists = false;
    try {
      const { error: adminErr } = await supabase.from('admins').select('id').limit(1);
      adminsExists = !adminErr;
    } catch {
      adminsExists = false;
    }

    return {
      connected: true,
      cardsTableExists: true,
      rowCount: data ? data.length : 0,
      adminsTableExists: adminsExists,
    };
  } catch (err: any) {
    return {
      connected: false,
      cardsTableExists: false,
      rowCount: 0,
      adminsTableExists: false,
      error: err.message,
    };
  }
}

/**
 * SQL migration schema for user to execute in Supabase SQL editor if desired
 */
export const SUPABASE_SQL_SCHEMA = `-- 3DBYSD Smart Reviews - Supabase Database Schema
-- Run this in your Supabase Dashboard > SQL Editor:

-- 1. Ensure cards table has all columns
CREATE TABLE IF NOT EXISTS public.cards (
  id BIGSERIAL PRIMARY KEY,
  card_id TEXT UNIQUE NOT NULL,
  business_name TEXT DEFAULT '',
  google_review_url TEXT DEFAULT '',
  status TEXT DEFAULT 'available',
  category TEXT DEFAULT 'Local Business',
  notes TEXT DEFAULT '',
  ai_review_enabled BOOLEAN DEFAULT FALSE,
  scans_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add any missing columns to existing cards table safely
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Local Business';
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS ai_review_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS scans_count INTEGER DEFAULT 0;

-- 2. Create admins table for Master & Restricted Admin roles
CREATE TABLE IF NOT EXISTS public.admins (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'restricted',
  assigned_card_ids TEXT[] DEFAULT '{}',
  permissions JSONB DEFAULT '{"canEditCards": true, "canToggleAi": false, "canExportCsv": false, "canCreateCards": false}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create scan analytics table
CREATE TABLE IF NOT EXISTS public.analytics_scans (
  id BIGSERIAL PRIMARY KEY,
  card_id TEXT NOT NULL,
  scanned_at TIMESTAMPTZ DEFAULT NOW(),
  referrer TEXT,
  user_agent TEXT
);

-- 4. Enable Row Level Security (RLS) with public access policy
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Read Cards" ON public.cards FOR SELECT USING (true);
CREATE POLICY "Public Insert Cards" ON public.cards FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Cards" ON public.cards FOR UPDATE USING (true);

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Read Admins" ON public.admins FOR SELECT USING (true);
CREATE POLICY "Public Write Admins" ON public.admins FOR ALL USING (true);
`;
