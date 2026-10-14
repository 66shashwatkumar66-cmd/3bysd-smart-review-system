import { CardRecord } from '../types';

/**
 * Escapes a cell value according to RFC 4180 standards for CSV
 */
function escapeCsvCell(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return '""';
  const str = String(value);
  // If value contains comma, double-quote, or newline, wrap in quotes and escape existing quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

/**
 * Generates an RFC-4180 compliant CSV string from CardRecord items
 */
export function generateCsvString(cards: CardRecord[], baseUrl: string = 'https://3dbysd.in'): string {
  const origin = typeof window !== 'undefined' && window.location ? window.location.origin : baseUrl;

  const headers = [
    'Card ID',
    'Status',
    'Business Name',
    'Category',
    'Permanent URL',
    'Google Review Destination URL',
    'Physical Stand Notes',
    'Total Scans',
    'Created At',
    'Updated At',
  ];

  const rows = cards.map((card) => [
    card.id,
    card.status,
    card.businessName || '',
    card.category || '',
    `${origin}/r/${card.id}`,
    card.googleReviewUrl || '',
    card.notes || '',
    card.scansCount || 0,
    card.createdAt ? new Date(card.createdAt).toISOString() : '',
    card.updatedAt ? new Date(card.updatedAt).toISOString() : '',
  ]);

  return [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ].join('\r\n');
}

/**
 * Exports cards list to a downloadable CSV file in the browser
 */
export function exportCardsToCsv(cards: CardRecord[]): string {
  const csvContent = generateCsvString(cards);

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    // Include UTF-8 BOM so Microsoft Excel correctly displays accents and formatting
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    const today = new Date().toISOString().split('T')[0];
    link.download = `3dbysd-cards-inventory-${today}.csv`;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return csvContent;
}
