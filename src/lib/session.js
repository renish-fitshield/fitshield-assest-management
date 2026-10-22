import { signAccessToken, signRefreshToken, REFRESH_COOKIE, REFRESH_TOKEN_TTL, ACCESS_TOKEN_TTL } from '@/lib/jwt';

export const refreshCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/',
};

export async function buildSessionPayload(user) {
  return {
    accessToken: await signAccessToken(user),
    expiresIn: ACCESS_TOKEN_TTL,
    user: user.toPublic(),
  };
}

export async function setRefreshCookie(response, user) {
  response.cookies.set(REFRESH_COOKIE, await signRefreshToken(user), {
    ...refreshCookieOptions,
    maxAge: REFRESH_TOKEN_TTL,
  });
  return response;
}

export function clearRefreshCookie(response) {
  response.cookies.set(REFRESH_COOKIE, '', { ...refreshCookieOptions, maxAge: 0 });
  return response;
}
