import { NextResponse } from 'next/server';
import { verifyAccessToken, verifyRefreshToken, REFRESH_COOKIE } from '@/lib/jwt';
import { NOTICE_COOKIE } from '@/lib/notice';

// APIs reachable without an access token. Refresh/logout rely on the httpOnly cookie instead.
const PUBLIC_APIS = new Set(['/api/auth/login', '/api/auth/refresh', '/api/auth/logout']);

const unauthorized = (message, code) => NextResponse.json({ message, code }, { status: 401 });

// Opened by employees from their acknowledgement email (no login; the signed token in the path is the proof).
const PUBLIC_ACK_API = '/api/acknowledgements/';
const PUBLIC_ACK_PAGE = '/acknowledge/';

async function guardApi(req) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_APIS.has(pathname) || pathname.startsWith(PUBLIC_ACK_API)) return NextResponse.next();

  const header = req.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return unauthorized('Authentication required', 'TOKEN_MISSING');

  try {
    const payload = await verifyAccessToken(token);
    // Forward the verified identity to route handlers (overwrites any client-sent values).
    const headers = new Headers(req.headers);
    headers.set('x-user-id', payload.sub);
    headers.set('x-user-role', payload.role);
    headers.set('x-user-email', payload.email);
    return NextResponse.next({ request: { headers } });
  } catch (err) {
    if (err?.code === 'ERR_JWT_EXPIRED') return unauthorized('Access token expired', 'TOKEN_EXPIRED');
    return unauthorized('Invalid access token', 'TOKEN_INVALID');
  }
}

async function hasValidSession(req) {
  const token = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!token) return false;
  try {
    await verifyRefreshToken(token);
    return true;
  } catch {
    return false;
  }
}

async function guardPage(req) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith(PUBLIC_ACK_PAGE)) return NextResponse.next();
  const loggedIn = await hasValidSession(req);

  if (pathname === '/login') {
    return loggedIn ? NextResponse.redirect(new URL('/dashboard', req.url)) : NextResponse.next();
  }
  if (!loggedIn) {
    const res = NextResponse.redirect(new URL('/login', req.url));
    if (req.cookies.has(REFRESH_COOKIE)) {
      // One-time notice for the login page (no query strings); it reads and clears this cookie.
      res.cookies.set(NOTICE_COOKIE, 'session-expired', { path: '/login', maxAge: 60, sameSite: 'strict' });
    }
    res.cookies.delete(REFRESH_COOKIE);
    return res;
  }
  if (pathname === '/') return NextResponse.redirect(new URL('/dashboard', req.url));
  return NextResponse.next();
}

export async function middleware(req) {
  return req.nextUrl.pathname.startsWith('/api/') ? guardApi(req) : guardPage(req);
}

export const config = {
  // Every API and every page (the app's pages share one catch-all route), but not static assets.
  matcher: ['/api/:path*', '/((?!_next/|icon.svg|favicon.ico).*)'],
};
