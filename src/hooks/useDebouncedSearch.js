'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const SEARCH_DELAY_MS = 400;

/**
 * Search-as-you-type that commits to the server query after a pause (or immediately on Enter).
 * `committed` is the search value currently in the store; `onCommit(value)` updates it.
 */
export default function useDebouncedSearch(committed, onCommit, delay = SEARCH_DELAY_MS) {
  const [searchText, setSearchText] = useState(committed);
  const lastCommitted = useRef(committed);

  // Keep the input in sync when the stored search changes elsewhere (e.g. "Clear filters").
  useEffect(() => {
    if (committed !== lastCommitted.current) {
      lastCommitted.current = committed;
      setSearchText(committed);
    }
  }, [committed]);

  const commit = useCallback(
    (value) => {
      const next = value.trim();
      if (next === lastCommitted.current) return;
      lastCommitted.current = next;
      onCommit(next);
    },
    [onCommit]
  );

  useEffect(() => {
    const timer = setTimeout(() => commit(searchText), delay);
    return () => clearTimeout(timer);
  }, [searchText, commit, delay]);

  return { searchText, setSearchText, submitSearch: commit };
}
