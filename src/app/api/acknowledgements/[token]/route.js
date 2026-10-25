import { connectDB } from '@/lib/db';
import { ok, handleError } from '@/lib/api';
import { acknowledge, getAcknowledgement } from '@/lib/acknowledgements';

// PUBLIC (no login): opened from the link emailed to an employee. The signed token in the path names
// the asset, the hand-over, the employee and the side, so nothing else is needed.
// Both methods first check the link, that the asset and the employee still exist, that the hand-over
// names that employee, and the current status (see resolveLink in lib/acknowledgements.js).
// Errors carry a `code`: LINK_INVALID, LINK_EXPIRED, ASSET_NOT_FOUND, EMPLOYEE_NOT_FOUND,
// HANDOVER_NOT_FOUND, ACK_UNAVAILABLE, ACK_NOT_SAVED.

/** GET /api/acknowledgements/:token → what is being acknowledged, and its status. Read-only. */
export async function GET(_req, { params }) {
  try {
    const { token } = await params;
    await connectDB();
    return ok(await getAcknowledgement(token));
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /api/acknowledgements/:token → records the acknowledgement (safe to repeat) and returns the
 * status read back from the database; `alreadyAcknowledged` is true when it had been done before.
 */
export async function POST(req, { params }) {
  try {
    const { token } = await params;
    await connectDB();
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || undefined;
    return ok(await acknowledge(token, { ip, userAgent: req.headers.get('user-agent') || undefined }));
  } catch (err) {
    return handleError(err);
  }
}
