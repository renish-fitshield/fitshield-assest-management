'use client';

import { useEffect, useRef } from 'react';

const MIN_GAP_MS = 20_000;

/**
 * Calls `refresh` when the user comes back to this browser tab (at most once every 20 s), so changes made
 * elsewhere — like an employee acknowledging an asset from their email — show without a manual refresh.
 */
export default function useRefreshOnFocus(refresh, minGapMs = MIN_GAP_MS) {
  const latest = useRef(refresh);
  const last = useRef(0);

  useEffect(() => {
    latest.current = refresh;
  });

  useEffect(() => {
    last.current = Date.now(); // the page just loaded its data
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last.current < minGapMs) return;
      last.current = Date.now();
      latest.current();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [minGapMs]);
}
