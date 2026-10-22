'use client';

import { useCallback, useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { SORT_DATA, toListPayload } from '@/store/listPayload';
import useAbortableFetch from './useAbortableFetch';
import useDebouncedSearch from './useDebouncedSearch';

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

/**
 * Wires an antd Table to a server-paginated list in Redux.
 * Search, filters, sorting and pagination are sent in the request body — nothing is filtered client-side.
 *
 * @param query          slice query ({ page, perPageData, sortBy, sortData, searchText, ...filters })
 * @param fetchThunk     list thunk (receives the { filter, pagination_info, sort } body)
 * @param setQueryAction slice action that merges a patch into the query
 * @param filterKeys     keys of `query` that are sent in `filter` (besides searchText)
 */
export default function useServerTable({ query, fetchThunk, setQueryAction, filterKeys }) {
  const dispatch = useDispatch();

  const body = useMemo(() => toListPayload(query, filterKeys), [query, filterKeys]);
  const refetch = useAbortableFetch(fetchThunk, body);

  const setQuery = useCallback((patch) => dispatch(setQueryAction(patch)), [dispatch, setQueryAction]);

  /** Any filter change goes back to page 1. */
  const setFilter = useCallback((patch) => setQuery({ ...patch, page: 1 }), [setQuery]);

  const commitSearch = useCallback((searchText) => setFilter({ searchText }), [setFilter]);
  const search = useDebouncedSearch(query.searchText, commitSearch);

  const activeFilterCount = useMemo(() => Object.keys(body.filter).length, [body.filter]);

  const onTableChange = useCallback(
    (pagination, _filters, sorter, extra) => {
      if (extra?.action === 'sort') {
        const s = Array.isArray(sorter) ? sorter[0] : sorter;
        const sortData = s?.order === 'ascend' ? SORT_DATA.ASC : s?.order === 'descend' ? SORT_DATA.DESC : SORT_DATA.DEFAULT;
        setQuery({ sortBy: sortData ? s.columnKey ?? s.field : null, sortData, page: 1 });
        return;
      }
      const sizeChanged = pagination.pageSize !== query.perPageData;
      setQuery({ page: sizeChanged ? 1 : pagination.current, perPageData: pagination.pageSize });
    },
    [setQuery, query.perPageData]
  );

  /** Controlled antd sortOrder for a column key. */
  const sortOrderFor = useCallback(
    (key) => {
      if (query.sortBy !== key) return null;
      if (query.sortData === SORT_DATA.ASC) return 'ascend';
      if (query.sortData === SORT_DATA.DESC) return 'descend';
      return null;
    },
    [query.sortBy, query.sortData]
  );

  return { refetch, setFilter, onTableChange, sortOrderFor, activeFilterCount, ...search };
}
