import { generateReviewWithGemini } from '../src/services/reviewGenerator';

/**
 * Vercel Serverless Function handler for POST /api/generate-review
 */
export default async function handler(req: any, res: any) {
  // Set standard CORS headers for cross-origin or domain routing
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: `Method ${req.method} Not Allowed. Please send a POST request.`,
    });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }

    const result = await generateReviewWithGemini(body || {});
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Serverless function error in /api/generate-review:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Internal server error while generating review',
    });
  }
}
