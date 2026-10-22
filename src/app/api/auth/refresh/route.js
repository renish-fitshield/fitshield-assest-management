import { cookies } from 'next/headers';
import { connectDB } from '@/lib/db';
import { ok, fail, handleError } from '@/lib/api';
import { verifyRefreshToken, REFRESH_COOKIE } from '@/lib/jwt';
import { buildSessionPayload, clearRefreshCookie } from '@/lib/session';
import User from '@/models/User';

// Issues a new short-lived access token from the httpOnly refresh cookie.
// The refresh token itself is not rotated, so the session has a hard expiry.
export async function POST() {
  try {
    const token = (await cookies()).get(REFRESH_COOKIE)?.value;
    if (!token) return fail('Session not found', 401, { code: 'SESSION_MISSING' });

    let payload;
    try {
      payload = await verifyRefreshToken(token);
    } catch (err) {
      const expired = err?.code === 'ERR_JWT_EXPIRED';
      return clearRefreshCookie(
        fail(expired ? 'Session expired, please log in again' : 'Invalid session', 401, {
          code: expired ? 'SESSION_EXPIRED' : 'SESSION_INVALID',
        })
      );
    }

    await connectDB();
    const user = await User.findById(payload.sub);
    if (!user || !user.isActive) {
      return clearRefreshCookie(fail('Account is no longer active', 401, { code: 'SESSION_INVALID' }));
    }

    return ok(await buildSessionPayload(user));
  } catch (err) {
    return handleError(err);
  }
}
