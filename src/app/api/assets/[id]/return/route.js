import { connectDB } from '@/lib/db';
import { ok, handleError, readJson } from '@/lib/api';
import { getActor } from '@/lib/activity';
import { appOrigin, emailSummary } from '@/lib/acknowledgements';
import { returnAsset } from '@/lib/assignments';

// Sends email over SMTP; give a slow mail server room (Vercel otherwise uses the plan default).
export const maxDuration = 60;

/**
 * POST /api/assets/:id/return — take the asset back from its holder.
 * Body: { returnedAt?: "YYYY-MM-DD" (default today), condition?,
 *         statusAfter?: "Available" (default) | "Under Repair" | "Retired" | "Lost", notes? }
 * Emails the employee a return acknowledgement link. → { item, emails, message }
 */
export async function POST(req, { params }) {
  try {
    const { id } = await params;
    const body = await readJson(req);
    await connectDB();
    const { item, emails } = await returnAsset({ assetId: id, body, actor: await getActor(req), origin: appOrigin(req) });
    return ok({ item, emails, message: `${item.assetId} returned — now ${item.status}.${emailSummary(emails)}` });
  } catch (err) {
    return handleError(err);
  }
}
