export interface CardRecord {
  id: string; // e.g. "0001", "0002"
  status: 'available' | 'assigned' | 'disabled';
  businessName: string;
  category: string;
  googleReviewUrl: string;
  notes: string;
  aiReviewEnabled?: boolean; // Controls whether AI assistant is active (default true) or direct redirect
  scansCount: number;
  assignedToEmail?: string; // Assigned user email for RBAC ownership
  assignedToUid?: string;   // Assigned user Google UID
  assignedToName?: string;  // Assigned user display name
  customKeywords?: string[]; // Custom experience tags/keywords for this business
  reviewTone?: 'enthusiastic' | 'friendly' | 'professional' | 'concise'; // Tone for AI review generation
  promptStarter?: string; // Optional custom guidance for AI review generator
  customHeadline?: string; // Optional custom headline on customer review page
  logoUrl?: string; // Optional business logo URL (Firebase/Supabase/server uploaded)
  businessDescription?: string; // Business description and product offerings
  createdAt: string;
  updatedAt: string;
}

export interface AdminPermissions {
  canEditCards: boolean;
  canToggleAi: boolean;
  canExportCsv: boolean;
  canCreateCards: boolean;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'master' | 'restricted';
  assignedCardIds: string[]; // List of card IDs this sub-admin is restricted to managing
  permissions: AdminPermissions;
  createdAt: string;
  updatedAt: string;
}

export type ReviewLanguage = 'en' | 'hinglish';
export type ReviewTone = 'casual' | 'warm' | 'professional' | 'enthusiastic' | 'direct';

export interface GenerateReviewRequest {
  businessName: string;
  rating: number;
  tags: string[];
  notes?: string;
  category?: string;
  businessDescription?: string;
  language?: ReviewLanguage;
  tone?: ReviewTone;
  recentDrafts?: string[];
  cardId?: string;
  aiReviewEnabled?: boolean;
}

export interface GenerateReviewResponse {
  success: boolean;
  review?: string;
  reviewText?: string;
  message?: string;
  error?: string;
}

export type AdPlacement = 'below_biz_info' | 'between_sections' | 'below_draft' | 'footer' | 'disabled';
export type AdStatus = 'active' | 'paused';

export interface Advertisement {
  id: string;
  name: string;
  advertiser: string;
  headline: string;
  description?: string;
  imageUrl?: string;
  targetUrl: string;
  ctaText?: string;
  placement: AdPlacement;
  status: AdStatus;
  startDate?: string;
  endDate?: string;
  priority: number;
  impressions: number;
  clicks: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  provider: string; // 'google.com' | 'google-verified'
  role: 'master' | 'restricted' | 'member';
  emailVerified: boolean;
  lastLoginAt: string;
  createdAt: string;
  loginCount: number;
  device?: string;
  assignedCardIds?: string[];
}
