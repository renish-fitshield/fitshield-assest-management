import { ok } from '@/lib/api';
import { clearRefreshCookie } from '@/lib/session';

export async function POST() {
  return clearRefreshCookie(ok({ message: 'Logged out' }));
}
