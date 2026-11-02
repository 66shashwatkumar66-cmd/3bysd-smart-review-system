/**
 * Utilities for formatting and validating business WhatsApp and Instagram links.
 */

/**
 * Formats a WhatsApp phone number or link into a valid click-to-chat URL.
 * Supports:
 * - Direct phone numbers (e.g. "+91 98765 43210", "9876543210", "09876543210")
 * - Full WhatsApp URLs (e.g. "https://wa.me/919876543210", "https://api.whatsapp.com/send?phone=...")
 */
export function formatWhatsAppUrl(input?: string | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // If already a valid WhatsApp web URL
  if (/^https?:\/\/(wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)\/.+/i.test(trimmed)) {
    return trimmed;
  }

  // Extract all numeric digits
  let digitsOnly = trimmed.replace(/[^0-9]/g, '');

  // Strip leading 0 if 11 digits (e.g. 09876543210 -> 9876543210)
  if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
    digitsOnly = digitsOnly.substring(1);
  }

  // If 10 digits starting with 6-9, standard Indian mobile number without prefix -> prepend 91
  if (digitsOnly.length === 10 && /^[6-9]/.test(digitsOnly)) {
    digitsOnly = `91${digitsOnly}`;
  }

  // A valid international phone number has at least 7 digits (up to 15 per E.164)
  if (digitsOnly.length >= 7) {
    return `https://wa.me/${digitsOnly}`;
  }

  return null;
}

/**
 * Formats an Instagram handle or link into a valid profile URL.
 * Supports:
 * - Handles: "@mercurysports", "mercurysports"
 * - Full URLs: "https://instagram.com/mercurysports", "https://www.instagram.com/mercurysports/"
 */
export function formatInstagramUrl(input?: string | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // If already a valid Instagram URL
  if (/^https?:\/\/(www\.)?instagram\.com\/[a-zA-Z0-9._]+\/?/i.test(trimmed)) {
    return trimmed;
  }

  // Clean handle removing leading @
  const cleanHandle = trimmed.replace(/^@/, '').trim();
  // Instagram handles can contain alphanumeric, periods, and underscores (max 30 chars)
  if (/^[a-zA-Z0-9._]{1,30}$/.test(cleanHandle)) {
    return `https://instagram.com/${cleanHandle}`;
  }

  return null;
}

/**
 * Validates WhatsApp input string.
 * Returns { valid: true } if empty or valid format.
 */
export function validateWhatsAppInput(input?: string | null): { valid: boolean; error?: string } {
  if (!input || !input.trim()) {
    return { valid: true };
  }
  const trimmed = input.trim();

  if (/^https?:\/\/(wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)\/.+/i.test(trimmed)) {
    return { valid: true };
  }

  const digits = trimmed.replace(/[^0-9]/g, '');
  if (digits.length >= 7 && digits.length <= 15) {
    return { valid: true };
  }

  return {
    valid: false,
    error: 'Please enter a valid WhatsApp phone number with country code (e.g. +91 9876543210) or wa.me link.',
  };
}

/**
 * Validates Instagram input string.
 * Returns { valid: true } if empty or valid format.
 */
export function validateInstagramInput(input?: string | null): { valid: boolean; error?: string } {
  if (!input || !input.trim()) {
    return { valid: true };
  }
  const trimmed = input.trim();

  if (/^https?:\/\/(www\.)?instagram\.com\/[a-zA-Z0-9._]+\/?/i.test(trimmed)) {
    return { valid: true };
  }

  const cleanHandle = trimmed.replace(/^@/, '').trim();
  if (/^[a-zA-Z0-9._]{1,30}$/.test(cleanHandle)) {
    return { valid: true };
  }

  return {
    valid: false,
    error: 'Please enter a valid Instagram handle (e.g. @yourbusiness) or full instagram.com URL.',
  };
}
