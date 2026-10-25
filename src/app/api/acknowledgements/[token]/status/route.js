import { connectDB } from '@/lib/db';
import { ok, handleError } from '@/lib/api';
import { getAcknowledgementStatus } from '@/lib/acknowledgements';

// PUBLIC (no login), like the parent route.

/**
 * GET /api/acknowledgements/:token/status → the acknowledgement status check.
 * Runs every check (link, asset exists, employee exists, hand-over names the employee) and returns
 *   { status: 'Pending' | 'Acknowledged', acknowledgedAt, canAcknowledge, linkExpired, linkExpiresAt,
 *     checks: { link, asset, employee, handOver }, checkedAt }
 * or an error with a `code` saying which check failed. Read-only.
 */
export async function GET(_req, { params }) {
  try {
    const { token } = await params;
    await connectDB();
    return ok(await getAcknowledgementStatus(token));
  } catch (err) {
    return handleError(err);
  }
}
