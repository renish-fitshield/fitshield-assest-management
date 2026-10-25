'use client';

import { useEffect, useRef, useState } from 'react';
import SplashScreen from '@/components/brand/SplashScreen';

const MIN_VISIBLE_MS = 300; // once shown, long enough to read as intentional (no flicker on fast answers)

/**
 * Wraps a page's data area (a table, the dashboard's charts…) and shows the Fitshield splash in its
 * place while it loads. The page title, filters and search stay on screen, and so do the sidebar and
 * header.
 *
 * The splash shows while:
 *   - the first data hasn't arrived (`ready` false — pass loaded || error), and
 *   - a load is fetching different data from what's on screen (`dataKey` changed: new filters,
 *     search, page, sort…).
 * Reloading the same data (coming back to the tab, after a save) refreshes in place, without it.
 * The data area stays mounted underneath, so its requests and state carry on.
 */
export default function DataLoader({ ready, loading, dataKey = '', minHeight, children }) {
  // The key of the data on screen: set when a load finishes.
  const [shownKey, setShownKey] = useState(ready && !loading ? dataKey : null);
  const wasLoading = useRef(loading);
  useEffect(() => {
    if (wasLoading.current && !loading) setShownKey(dataKey);
    wasLoading.current = loading;
  }, [loading, dataKey]);

  const wanted = !ready || (loading && dataKey !== shownKey);
  const [held, setHeld] = useState(false); // kept up after the data arrived, until MIN_VISIBLE_MS has passed
  const shownAt = useRef(0);

  useEffect(() => {
    if (wanted) {
      if (!shownAt.current) shownAt.current = Date.now();
      setHeld(true);
      return undefined;
    }
    if (!held) return undefined;
    const timer = setTimeout(() => {
      shownAt.current = 0;
      setHeld(false);
    }, Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAt.current)));
    return () => clearTimeout(timer);
  }, [wanted, held]);

  const visible = wanted || held;

  return (
    <>
      {visible && <SplashScreen key="splash" variant="section" style={minHeight ? { minHeight } : undefined} />}
      <div key="data" className={visible ? 'data-hidden' : undefined} aria-hidden={visible || undefined}>
        {children}
      </div>
    </>
  );
}
