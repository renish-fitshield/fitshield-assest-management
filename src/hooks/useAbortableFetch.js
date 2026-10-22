'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';

/**
 * Dispatches `thunk(params)` whenever `params` changes (pass a memoised object).
 * The previous in-flight request is aborted first, and the last one is aborted on unmount,
 * so only the latest search/filter/page result is ever applied.
 * Returns `refetch()` for retry buttons and post-mutation refreshes.
 */
export default function useAbortableFetch(thunk, params) {
  const dispatch = useDispatch();
  const inFlight = useRef(null);

  const refetch = useCallback(() => {
    inFlight.current?.abort();
    const promise = dispatch(thunk(params));
    inFlight.current = promise;
    return promise;
  }, [dispatch, thunk, params]);

  useEffect(() => {
    refetch();
    return () => inFlight.current?.abort();
  }, [refetch]);

  return refetch;
}
