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
 * Exports cards list to a downloadable CSV file
 */
export function exportCardsToCsv(cards: CardRecord[]): void {
  const origin = window.location.origin;

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

  const csvContent = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ].join('\r\n');

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
