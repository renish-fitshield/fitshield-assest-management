'use client';

/**
 * In-app navigation without Next.js RSC requests (`/page?_rsc=…`).
 *
 * Every app page is rendered by one route (app/(dashboard)/[[...slug]]), so switching between them
 * only needs the URL to change. Next.js keeps `usePathname()` in sync with native
 * `history.pushState`, and Back/Forward restore without a fetch.
 * Crossing into or out of that route (login / logout) uses a full page load.
 * Keep this list in step with VIEWS in app/(dashboard)/[[...slug]]/page.js — a page missing here
 * would reload the whole app (and its loaded data) every time it's opened.
 */

export const APP_ROUTES = ['/dashboard', '/assets', '/assignments', '/categories', '/people'];

const isAppRoute = (path) => APP_ROUTES.includes(path);

export function navigate(path, { replace = false } = {}) {
  if (typeof window === 'undefined') return;
  if (!isAppRoute(path)) {
    // Leaving the single app route: plain document navigation (no RSC fetch).
    if (replace) window.location.replace(path);
    else window.location.assign(path);
    return;
  }
  if (window.location.pathname === path) return;
  if (replace) window.history.replaceState(null, '', path);
  else window.history.pushState(null, '', path);
}

/** Real <a href> (so new-tab / middle-click work) that navigates in place on a normal click. */
export function NavLink({ href, children, ...rest }) {
  const onClick = (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(href);
  };
  return (
    <a href={href} onClick={onClick} {...rest}>
      {children}
    </a>
  );
}
