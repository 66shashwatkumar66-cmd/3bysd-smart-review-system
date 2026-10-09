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
  message?: string;
}
