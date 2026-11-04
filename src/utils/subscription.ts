/**
 * Utilities for managing QR/NFC Card Subscriptions.
 * Handles subscription status computation, customer access gating,
 * date validation, and consistent timezone comparisons.
 */
import { CardRecord, SubscriptionStatus } from '../types';

/**
 * Returns the current date formatted as YYYY-MM-DD using local time or provided Date.
 */
/**
 * Returns the current date formatted as YYYY-MM-DD using local time or provided Date or date string.
 */
export function getTodayDateString(date: Date | string = new Date()): string {
  if (typeof date === 'string') {
    const norm = normalizeDateString(date);
    if (norm && /^\d{4}-\d{2}-\d{2}$/.test(norm)) return norm;
    date = new Date(date);
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Normalizes input date strings (handling YYYY-MM-DD or ISO strings).
 */
export function normalizeDateString(input?: string | null): string | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Extract YYYY-MM-DD if in ISO format (e.g. 2026-11-04T00:00:00.000Z)
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) {
    return match[1];
  }
  return trimmed;
}

/**
 * Computes the SubscriptionStatus of a card:
 * - 'unconfigured': No subscription dates specified (backward compatible, accessible).
 * - 'upcoming': Today is strictly before subscriptionStartDate.
 * - 'active': Today is between subscriptionStartDate and subscriptionEndDate (inclusive).
 * - 'expired': Today is strictly after subscriptionEndDate.
 */
export function getSubscriptionStatus(
  card?: Partial<Pick<CardRecord, 'subscriptionStartDate' | 'subscriptionEndDate'>> | null,
  referenceDate: Date | string = new Date()
): SubscriptionStatus {
  if (!card) return 'unconfigured';

  const start = normalizeDateString(card.subscriptionStartDate);
  const end = normalizeDateString(card.subscriptionEndDate);

  if (!start && !end) {
    return 'unconfigured';
  }

  const today = getTodayDateString(referenceDate);

  if (start && today < start) {
    return 'upcoming';
  }

  if (end && today > end) {
    return 'expired';
  }

  return 'active';
}

export interface SubscriptionAccessCheck {
  accessible: boolean;
  status: SubscriptionStatus;
  customerMessage?: string;
  message?: string;
  startDate?: string | null;
  endDate?: string | null;
}

/**
 * Evaluates whether a customer can access the review page for a card.
 * Expired or upcoming subscriptions block access with the exact requested customer messages.
 */
export function isSubscriptionAccessible(
  card?: Partial<Pick<CardRecord, 'subscriptionStartDate' | 'subscriptionEndDate' | 'status'>> | null,
  referenceDate: Date | string = new Date()
): SubscriptionAccessCheck {
  const status = getSubscriptionStatus(card, referenceDate);
  const start = normalizeDateString(card?.subscriptionStartDate);
  const end = normalizeDateString(card?.subscriptionEndDate);

  if (status === 'upcoming') {
    const msg = 'This QR subscription is not active yet.';
    return {
      accessible: false,
      status: 'upcoming',
      customerMessage: msg,
      message: msg,
      startDate: start,
      endDate: end,
    };
  }

  if (status === 'expired') {
    const msg = 'This QR subscription has expired. Please contact the business for assistance.';
    return {
      accessible: false,
      status: 'expired',
      customerMessage: msg,
      message: msg,
      startDate: start,
      endDate: end,
    };
  }

  return {
    accessible: true,
    status,
    startDate: start,
    endDate: end,
  };
}

/**
 * Validates start and end dates before saving.
 * Ensures End Date is not earlier than Start Date.
 */
export function validateSubscriptionDates(
  startDate?: string | null,
  endDate?: string | null
): { valid: boolean; error?: string } {
  const start = normalizeDateString(startDate);
  const end = normalizeDateString(endDate);

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

  if (start && !datePattern.test(start)) {
    return { valid: false, error: 'Subscription Start Date must be in YYYY-MM-DD format.' };
  }

  if (end && !datePattern.test(end)) {
    return { valid: false, error: 'Subscription End Date must be in YYYY-MM-DD format.' };
  }

  if (start && end && end < start) {
    return {
      valid: false,
      error: 'Subscription End Date cannot be earlier than Subscription Start Date.',
    };
  }

  return { valid: true };
}

/**
 * Helper to compute convenient preset dates (e.g. +1 Month, +3 Months, +6 Months, +1 Year).
 */
export function getPresetDates(
  months: number,
  fromStartDate?: string | null
): { startDate: string; endDate: string } {
  const base = fromStartDate && normalizeDateString(fromStartDate)
    ? new Date(fromStartDate + 'T00:00:00')
    : new Date();

  const startDateStr = getTodayDateString(base);

  const target = new Date(base.getTime());
  target.setMonth(target.getMonth() + months);
  // Subtract one day for a full cycle (e.g. 1st Jan to 31st Jan)
  target.setDate(target.getDate() - 1);

  const endDateStr = getTodayDateString(target);
  return { startDate: startDateStr, endDate: endDateStr };
}

/**
 * Formats date string into readable user display (e.g. "04 Nov 2026").
 */
export function formatDisplayDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const norm = normalizeDateString(dateStr);
  if (!norm) return '—';
  try {
    const [year, month, day] = norm.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}
