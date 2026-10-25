import { connectDB } from '@/lib/db';
import { ok, fail, handleError, isValidId } from '@/lib/api';
import Asset from '@/models/Asset';

/**
 * GET /api/assets/:id/history
 * → { assignmentHistory: [hand-overs], activities: [changes], createdAt } — both newest first.
 */
export async function GET(_req, { params }) {
  try {
    const { id } = await params;
    if (!isValidId(id)) return fail('Invalid asset id', 400);
    await connectDB();
    const asset = await Asset.findById(id, 'assignmentHistory activities createdAt').lean();
    if (!asset) return fail('Asset not found', 404);
    // Assets saved before history existed may not have the arrays at all (lean skips schema defaults).
    return ok({
      assignmentHistory: [...(asset.assignmentHistory ?? [])].reverse(),
      activities: [...(asset.activities ?? [])].reverse(),
      createdAt: asset.createdAt,
    });
  } catch (err) {
    return handleError(err);
  }
}
