'use client';

import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import useAbortableFetch from '@/hooks/useAbortableFetch';
import { fetchCategories } from '@/store/categoriesSlice';

/**
 * The category list, reloaded each time the calling component mounts (so a category added on the
 * Categories page shows up straight away). `options` are { value: _id, label: name } for a Select.
 */
export default function useCategories() {
  const { items, loading, loaded, error } = useSelector((s) => s.categories);
  const refetch = useAbortableFetch(fetchCategories, undefined);
  const options = useMemo(() => items.map((c) => ({ value: c._id, label: c.name })), [items]);
  return { items, options, loading, loaded, error, refetch };
}
