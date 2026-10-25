import { connectDB } from '@/lib/db';
import { ok, fail, handleError, isValidId, readJson } from '@/lib/api';
import { appOrigin, resendAckEmail } from '@/lib/acknowledgements';

// Sends email over SMTP; give a slow mail server room (Vercel otherwise uses the plan default).
export const maxDuration = 60;

/**
 * POST /api/assets/:id/acknowledgement-email — send an acknowledgement email again (with a fresh link).
 * Body: { eventId (the hand-over), side: "to" (receipt) | "from" (return) }. Only while still Pending.
 * → { email: { side, to, status, error?, previewUrl? }, message }
 */
export async function POST(req, { params }) {
  try {
    const { id } = await params;
    if (!isValidId(id)) return fail('Invalid asset id', 400);
    const { eventId, side } = await readJson(req);
    await connectDB();
    const email = await resendAckEmail({ assetId: id, eventId, side, origin: appOrigin(req) });
    if (email.status !== 'Sent') return fail(`The email couldn't be sent: ${email.error}`, 502, { email });
    if (email.testOnly) {
      return ok({
        email,
        message: `Email isn't set up yet, so nothing was delivered to ${email.to} (it went to a test inbox). Add the SMTP settings and resend.`,
      });
    }
    return ok({ email, message: `Acknowledgement email sent again to ${email.to}` });
  } catch (err) {
    return handleError(err);
  }
}
