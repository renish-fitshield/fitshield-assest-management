'use client';

import { memo, useCallback, useMemo } from 'react';
import dayjs from 'dayjs';
import { Button, DatePicker, Input, Select } from 'antd';
import { ClearOutlined } from '@ant-design/icons';
import { ASSET_STATUSES, ASSET_CONDITIONS, WARRANTY_STATUSES, PURCHASE_TYPES } from '@/lib/constants';
import { formatDate, toDayjs } from '@/lib/format';
import useDebouncedSearch from '@/hooks/useDebouncedSearch';
import MoreFilters, { FilterChips } from '@/components/MoreFilters';

const toOptions = (list) => list.map((v) => ({ label: v, value: v }));
const MORE_FILTERS = [
  { key: 'status', label: 'Status', options: toOptions(ASSET_STATUSES) },
  { key: 'condition', label: 'Condition', options: toOptions(ASSET_CONDITIONS) },
  { key: 'warrantyStatus', label: 'Warranty', options: toOptions(WARRANTY_STATUSES) },
  { key: 'purchaseType', label: 'Purchase type', options: toOptions(PURCHASE_TYPES) },
];
const MORE_KEYS = [...MORE_FILTERS.map((f) => f.key), 'location'];
const CHIP_LABELS = Object.fromEntries([...MORE_FILTERS.map((f) => [f.key, f.label]), ['location', 'Location']]);

// Indian financial year: 1 April – 31 March.
function financialYearStart(date) {
  const year = date.month() >= 3 ? date.year() : date.year() - 1;
  return dayjs(`${year}-04-01`);
}

function rangePresets() {
  const today = dayjs();
  const fyStart = financialYearStart(today);
  return [
    { label: 'Last 30 days', value: [today.subtract(30, 'day'), today] },
    { label: 'Last 90 days', value: [today.subtract(90, 'day'), today] },
    { label: 'This financial year', value: [fyStart, today] },
    { label: 'Last financial year', value: [fyStart.subtract(1, 'year'), fyStart.subtract(1, 'day')] },
    { label: 'Last 12 months', value: [today.subtract(12, 'month').add(1, 'day'), today] },
  ];
}
const disableFuture = (d) => d && d.isAfter(dayjs().endOf('day'));

/**
 * The dashboard's single filter row: purchase date range first, then search and category;
 * the rarer filters sit behind "More filters". Active filters show as removable chips below.
 */
function DashboardFilters({ filters, setFilter, clearFilters, loading, categoryOptions, categoriesLoading, locations }) {
  const commitSearch = useCallback((value) => setFilter({ searchText: value }), [setFilter]);
  const { searchText, setSearchText, submitSearch } = useDebouncedSearch(filters.searchText, commitSearch);

  const presets = useMemo(rangePresets, []);
  const rangeValue = useMemo(
    () => [toDayjs(filters.purchasedFrom), toDayjs(filters.purchasedTo)],
    [filters.purchasedFrom, filters.purchasedTo]
  );
  const onRange = useCallback(
    (range) =>
      setFilter({
        purchasedFrom: range?.[0] ? range[0].format('YYYY-MM-DD') : null,
        purchasedTo: range?.[1] ? range[1].format('YYYY-MM-DD') : null,
      }),
    [setFilter]
  );

  const locationOptions = useMemo(() => toOptions(locations || []), [locations]);
  const moreFields = useMemo(
    () => [
      ...MORE_FILTERS,
      { key: 'location', label: 'Location', options: locationOptions, showSearch: true, notFoundContent: 'No locations recorded' },
    ],
    [locationOptions]
  );
  const categoryName = categoryOptions.find((o) => o.value === filters.categoryId)?.label;

  const chips = [];
  const chip = (key, label, clear) => chips.push({ key, label, onClose: () => setFilter(clear) });
  if (filters.purchasedFrom || filters.purchasedTo) {
    chip(
      'purchased',
      `Purchased ${filters.purchasedFrom ? formatDate(filters.purchasedFrom) : '…'} – ${filters.purchasedTo ? formatDate(filters.purchasedTo) : 'today'}`,
      { purchasedFrom: null, purchasedTo: null }
    );
  }
  if (filters.searchText) chip('searchText', `Search: “${filters.searchText}”`, { searchText: '' });
  if (filters.categoryId) chip('categoryId', `Category: ${categoryName || 'Selected'}`, { categoryId: null });
  for (const key of MORE_KEYS) {
    if (filters[key]) chip(key, `${CHIP_LABELS[key]}: ${filters[key]}`, { [key]: null });
  }

  return (
    <div className="dash-filterbar">
      <div className="dash-filter-row">
        <DatePicker.RangePicker
          className="dash-range"
          format="DD MMM YYYY"
          placeholder={['Purchased from', 'Purchased to']}
          value={rangeValue}
          allowEmpty={[true, true]}
          disabledDate={disableFuture}
          onChange={onRange}
          presets={presets}
        />
        <Input.Search
          className="dash-search"
          placeholder="Search asset ID, name, brand, serial…"
          allowClear
          maxLength={100}
          value={searchText}
          loading={loading && Boolean(searchText)}
          onChange={(e) => setSearchText(e.target.value)}
          onSearch={submitSearch}
        />
        <Select
          className="dash-category"
          placeholder="All categories"
          allowClear
          showSearch
          optionFilterProp="label"
          value={filters.categoryId}
          options={categoryOptions}
          loading={categoriesLoading}
          onChange={(v) => setFilter({ categoryId: v ?? null })}
        />
        <MoreFilters fields={moreFields} values={filters} onApply={setFilter} />
        {chips.length > 0 && (
          <Button type="link" icon={<ClearOutlined />} onClick={clearFilters}>
            Clear all
          </Button>
        )}
      </div>
      <FilterChips chips={chips} />
    </div>
  );
}

export default memo(DashboardFilters);
