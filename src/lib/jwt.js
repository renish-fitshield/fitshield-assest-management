// Edge-compatible (used by middleware) — do not import Node-only modules here.
import { SignJWT, jwtVerify } from 'jose';

export const REFRESH_COOKIE = 'am_refresh';
export const ACCESS_TOKEN_TTL = Number(process.env.ACCESS_TOKEN_TTL_SECONDS) || 900;
export const REFRESH_TOKEN_TTL = Number(process.env.REFRESH_TOKEN_TTL_SECONDS) || 28800;

const encoder = new TextEncoder();

function secret(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return encoder.encode(value);
}

async function sign(user, type, ttl, secretName) {
  return new SignJWT({ type, email: user.email, role: user.role, name: user.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user._id ?? user.id))
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttl)
    .sign(secret(secretName));
}

async function verify(token, type, secretName) {
  const { payload } = await jwtVerify(token, secret(secretName), { algorithms: ['HS256'] });
  if (payload.type !== type) throw new Error('Wrong token type');
  return payload;
}

export const signAccessToken = (user) => sign(user, 'access', ACCESS_TOKEN_TTL, 'JWT_ACCESS_SECRET');
export const signRefreshToken = (user) => sign(user, 'refresh', REFRESH_TOKEN_TTL, 'JWT_REFRESH_SECRET');
export const verifyAccessToken = (token) => verify(token, 'access', 'JWT_ACCESS_SECRET');
export const verifyRefreshToken = (token) => verify(token, 'refresh', 'JWT_REFRESH_SECRET');
