import { connectDB } from '@/lib/db';
import { ok, handleError, readJson } from '@/lib/api';
import { assignAsset } from '@/lib/assignments';

/**
 * POST /api/assets/:id/assign
 * Body: { employeeId, assignedAt?: "YYYY-MM-DD", notes? }
 * Only Available, unassigned assets can be assigned; one asset → one employee.
 */
export async function POST(req, { params }) {
  try {
    const { id } = await params;
    const body = await readJson(req);
    await connectDB();
    const item = await assignAsset({ assetId: id, body, userId: req.headers.get('x-user-id') });
    return ok({ item, message: `${item.assetId} assigned to ${item.assignedTo.fullName}` });
  } catch (err) {
    return handleError(err);
  }
}
