import { connectDB } from '@/lib/db';
import { ok, handleError, readJson } from '@/lib/api';
import { getActor } from '@/lib/activity';
import { appOrigin, emailSummary } from '@/lib/acknowledgements';
import { transferAsset } from '@/lib/assignments';

// Sends email over SMTP; give a slow mail server room (Vercel otherwise uses the plan default).
export const maxDuration = 60;

/**
 * POST /api/assets/:id/transfer — hand an assigned asset straight to another employee.
 * Body: { employeeId, transferredAt?: "YYYY-MM-DD" (default today), condition?, expectedReturnAt?: "YYYY-MM-DD", notes? }
 * Emails both employees (hand-over to the old holder, receipt to the new one). → { item, emails, message }
 */
export async function POST(req, { params }) {
  try {
    const { id } = await params;
    const body = await readJson(req);
    await connectDB();
    const { item, emails } = await transferAsset({ assetId: id, body, actor: await getActor(req), origin: appOrigin(req) });
    return ok({ item, emails, message: `${item.assetId} transferred to ${item.assignedTo?.fullName ?? 'the new holder'}.${emailSummary(emails)}` });
  } catch (err) {
    return handleError(err);
  }
}
