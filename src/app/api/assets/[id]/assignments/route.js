import { connectDB } from '@/lib/db';
import { ok, fail, handleError, isValidId } from '@/lib/api';
import { findAssignments } from '@/lib/assignments';
import Asset from '@/models/Asset';

/** GET /api/assets/:id/assignments — assignment history of one asset (newest first). */
export async function GET(_req, { params }) {
  try {
    const { id } = await params;
    if (!isValidId(id)) return fail('Invalid asset id', 400);
    await connectDB();
    if (!(await Asset.exists({ _id: id }))) return fail('Asset not found', 404);
    const items = await findAssignments({ asset: id }, { path: 'employee', select: 'employeeId fullName department' });
    return ok({ items });
  } catch (err) {
    return handleError(err);
  }
}
