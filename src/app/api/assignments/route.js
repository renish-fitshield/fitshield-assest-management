import { connectDB } from '@/lib/db';
import { ok, handleError, readJson } from '@/lib/api';
import { getActor } from '@/lib/activity';
import { appOrigin } from '@/lib/acknowledgements';
import { assignMany } from '@/lib/assignments';

// Sends email over SMTP; give a slow mail server room (Vercel otherwise uses the plan default).
export const maxDuration = 60;

/**
 * POST /api/assignments — assign several assets to one employee.
 * Body: { employeeId, assetIds: [id], assignedAt?, expectedReturnAt?, notes? }
 * Each asset is its own hand-over with its own acknowledgement email; one failing doesn't stop the rest.
 * → { results: [{ assetId, ok, item?, emails?, error? }], assigned, failed }
 */
export async function POST(req) {
  try {
    const body = await readJson(req);
    await connectDB();
    const results = await assignMany({ body, actor: await getActor(req), origin: appOrigin(req) });
    const assigned = results.filter((r) => r.ok).length;
    return ok({ results, assigned, failed: results.length - assigned });
  } catch (err) {
    return handleError(err);
  }
}
