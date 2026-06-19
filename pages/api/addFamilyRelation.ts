import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Método no permitido' });
  }

  return res.status(410).json({
    success: false,
    message: 'This endpoint is disabled. Use the safe addFamilyRelation server action.',
  });
}
