import QRCode from 'qrcode';

/**
 * Returns an SVG string of the QR code
 */
export async function generateQrSvg(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: 'svg',
    margin: 1,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
    errorCorrectionLevel: 'H',
  });
}

/**
 * Returns a high-resolution PNG Data URL for a given target URL
 */
export async function generateQrPng(url: string, width: number = 1024): Promise<string> {
  return QRCode.toDataURL(url, {
    width,
    margin: 1,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
    errorCorrectionLevel: 'H',
  });
}

/**
 * Downloads high-res PNG for a specific card
 */
export async function downloadCardPng(url: string, cardId: string, businessName?: string): Promise<void> {
  const dataUrl = await generateQrPng(url, 2048);
  const link = document.createElement('a');
  const filename = businessName
    ? `qr-card-${cardId}-${businessName.toLowerCase().replace(/[^a-z0-9]/g, '-')}.png`
    : `qr-card-${cardId}.png`;
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

/**
 * Downloads SVG for a specific card
 */
export async function downloadCardSvg(url: string, cardId: string, businessName?: string): Promise<void> {
  const svgString = await generateQrSvg(url);
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const filename = businessName
    ? `qr-card-${cardId}-${businessName.toLowerCase().replace(/[^a-z0-9]/g, '-')}.svg`
    : `qr-card-${cardId}.svg`;
  link.download = filename;
  link.href = objectUrl;
  link.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

/**
 * Format a number to zero-padded card ID (e.g. 1 -> "0001")
 */
export function formatCardId(num: number, digits: number = 4, prefix: string = ''): string {
  const padded = String(num).padStart(digits, '0');
  return prefix ? `${prefix}-${padded}` : padded;
}
