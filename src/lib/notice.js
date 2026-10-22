// One-time notice passed from middleware to the login page via a short-lived cookie,
// so redirects never need query strings. Edge- and browser-safe (no imports).

export const NOTICE_COOKIE = 'am_notice';

/** Reads the notice cookie in the browser and deletes it so it shows only once. */
export function consumeNotice() {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${NOTICE_COOKIE}=`));
  if (!match) return null;
  document.cookie = `${NOTICE_COOKIE}=; Max-Age=0; Path=/login; SameSite=Strict`;
  return decodeURIComponent(match.split('=')[1] || '');
}
