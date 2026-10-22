import bcrypt from 'bcryptjs';
import { connectDB } from '@/lib/db';
import { ok, fail, handleError } from '@/lib/api';
import { buildSessionPayload, setRefreshCookie } from '@/lib/session';
import User from '@/models/User';

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export async function POST(req) {
  try {
    const body = await req.json();
    const email = String(body?.email || '').trim().toLowerCase();
    const pin = String(body?.pin || '');

    if (!email || !/^\d{4}$/.test(pin)) {
      return fail('Email and a 4-digit PIN are required', 400);
    }

    await connectDB();
    const user = await User.findOne({ email }).select('+pinHash +failedAttempts +lockUntil');
    if (!user || !user.isActive) return fail('Invalid email or PIN', 401);

    if (user.lockUntil && user.lockUntil > new Date()) {
      const minutes = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return fail(`Too many failed attempts. Try again in ${minutes} minute(s).`, 423);
    }

    const valid = await bcrypt.compare(pin, user.pinHash);
    if (!valid) {
      user.failedAttempts = (user.failedAttempts || 0) + 1;
      if (user.failedAttempts >= MAX_ATTEMPTS) {
        user.failedAttempts = 0;
        user.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60000);
      }
      await user.save();
      return fail('Invalid email or PIN', 401);
    }

    user.failedAttempts = 0;
    user.lockUntil = null;
    user.lastLoginAt = new Date();
    await user.save();

    const response = ok(await buildSessionPayload(user));
    return setRefreshCookie(response, user);
  } catch (err) {
    return handleError(err);
  }
}
