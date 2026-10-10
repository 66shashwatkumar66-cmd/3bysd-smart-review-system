export interface CardRecord {
  id: string; // e.g. "0001", "0002"
  status: 'available' | 'assigned' | 'disabled';
  businessName: string;
  category: string;
  googleReviewUrl: string;
  notes: string;
  aiReviewEnabled?: boolean; // Controls whether AI assistant is active (default true) or direct redirect
  scansCount: number;
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

export interface GenerateReviewRequest {
  businessName: string;
  rating: number;
  tags: string[];
  notes?: string;
  category?: string;
}

export interface GenerateReviewResponse {
  success: boolean;
  review?: string;
  reviewText?: string;
  message?: string;
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
