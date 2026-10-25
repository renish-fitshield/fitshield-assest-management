import { connectDB } from '@/lib/db';
import { ok, handleError, readJson } from '@/lib/api';
import { getActor } from '@/lib/activity';
import { appOrigin, emailSummary } from '@/lib/acknowledgements';
import { assignAsset } from '@/lib/assignments';

// Sends email over SMTP; give a slow mail server room (Vercel otherwise uses the plan default).
export const maxDuration = 60;

/**
 * POST /api/assets/:id/assign
 * Body: { employeeId, assignedAt?: "YYYY-MM-DD" (default today), condition?, expectedReturnAt?: "YYYY-MM-DD", notes? }
 * Only Available, unassigned, quantity-1 assets can be assigned; one asset → one employee.
 * Emails the employee an acknowledgement link. → { item, emails, message }
 */
export async function POST(req, { params }) {
  try {
    const { id } = await params;
    const body = await readJson(req);
    await connectDB();
    const { item, emails } = await assignAsset({ assetId: id, body, actor: await getActor(req), origin: appOrigin(req) });
    return ok({ item, emails, message: `${item.assetId} assigned to ${item.assignedTo?.fullName ?? 'the employee'}.${emailSummary(emails)}` });
  } catch (err) {
    return handleError(err);
  }
}
