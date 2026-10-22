import { connectDB } from '@/lib/db';
import { ok, handleError, readJson } from '@/lib/api';
import { returnAsset } from '@/lib/assignments';

/**
 * POST /api/assets/:id/return
 * Body: { returnedAt?: "YYYY-MM-DD", condition?, statusAfter?: "Available" | "Under Repair", notes? }
 */
export async function POST(req, { params }) {
  try {
    const { id } = await params;
    const body = await readJson(req);
    await connectDB();
    const item = await returnAsset({ assetId: id, body, userId: req.headers.get('x-user-id') });
    return ok({ item, message: `${item.assetId} returned` });
  } catch (err) {
    return handleError(err);
  }
}
