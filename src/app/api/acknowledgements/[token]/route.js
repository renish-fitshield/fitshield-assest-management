import { connectDB } from '@/lib/db';
import { ok, handleError } from '@/lib/api';
import { acknowledge, getAcknowledgement, publicView } from '@/lib/acknowledgements';

// PUBLIC (no login): opened from the link emailed to an employee. The signed token in the path names
// the asset, the hand-over, the employee and the side, so nothing else is needed.

/** GET /api/acknowledgements/:token → what is being acknowledged, and whether it already is. */
export async function GET(_req, { params }) {
  try {
    const { token } = await params;
    await connectDB();
    return ok(publicView(await getAcknowledgement(token)));
  } catch (err) {
    return handleError(err);
  }
}

/** POST /api/acknowledgements/:token → records the acknowledgement (safe to repeat). */
export async function POST(req, { params }) {
  try {
    const { token } = await params;
    await connectDB();
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || undefined;
    const result = await acknowledge(token, { ip, userAgent: req.headers.get('user-agent') || undefined });
    return ok(publicView(result));
  } catch (err) {
    return handleError(err);
  }
}
