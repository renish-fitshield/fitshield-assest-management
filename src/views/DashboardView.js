'use client';

import { memo, useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { NavLink, navigate } from '@/lib/navigation';
import dayjs from 'dayjs';
import { Button, Card, DatePicker, Empty, Input, Select, Skeleton, Spin, Table, Typography } from 'antd';
import {
  AppstoreOutlined,
  CheckCircleOutlined,
  ClearOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  SwapOutlined,
  TeamOutlined,
  ToolOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import {
  ASSET_CATEGORIES,
  ASSET_STATUSES,
  ASSET_CONDITIONS,
  WARRANTY_STATUSES,
  PURCHASE_TYPES,
} from '@/lib/constants';
import { formatCurrency, formatDate, formatDateTime, toDayjs } from '@/lib/format';
import { toFilterPayload } from '@/store/listPayload';
import StatusTag from '@/components/StatusTag';
import ErrorState from '@/components/ErrorState';
import BarList from '@/components/dashboard/BarList';
import MonthlyChart from '@/components/dashboard/MonthlyChart';
import useAbortableFetch from '@/hooks/useAbortableFetch';
import useDebouncedSearch from '@/hooks/useDebouncedSearch';
import {
  fetchDashboard,
  setDashboardFilters,
  resetDashboardFilters,
  DASHBOARD_FILTER_KEYS,
} from '@/store/dashboardSlice';
import { setAssetQuery } from '@/store/assetsSlice';

const toOptions = (list) => list.map((v) => ({ label: v, value: v }));
const CATEGORY_OPTIONS = toOptions(ASSET_CATEGORIES);
const STATUS_OPTIONS = toOptions(ASSET_STATUSES);
const CONDITION_OPTIONS = toOptions(ASSET_CONDITIONS);
const WARRANTY_OPTIONS = toOptions(WARRANTY_STATUSES);
const PURCHASE_TYPE_OPTIONS = toOptions(PURCHASE_TYPES);
const RANGE_PRESETS = [
  { label: 'Last 30 days', value: [dayjs().subtract(30, 'day'), dayjs()] },
  { label: 'This year', value: [dayjs().startOf('year'), dayjs()] },
  { label: 'Last 12 months', value: [dayjs().subtract(12, 'month'), dayjs()] },
];
const disableFuture = (d) => d && d.isAfter(dayjs().endOf('day'));
const assetCell = (v, r) => (
  <span>
    {v} <span className="muted">{r.assetId}</span>
  </span>
);
const smallEmpty = (text) => <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={text} />;
const pct = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}% of assets` : '—');

const Kpi = memo(function Kpi({ icon, label, value, hint }) {
  return (
    <Card size="small" styles={{ body: { padding: 16 } }}>
      <div className="kpi">
        <span className="kpi-icon">{icon}</span>
        <div style={{ minWidth: 0 }}>
          <div className="kpi-label">{label}</div>
          <div className="kpi-value">{value}</div>
          {hint && <div className="kpi-hint">{hint}</div>}
        </div>
      </div>
    </Card>
  );
});

const EXPIRING_COLUMNS = [
  { title: 'Asset', dataIndex: 'itemName', render: assetCell },
  { title: 'Category', dataIndex: 'category' },
  {
    title: 'Expires',
    dataIndex: 'warrantyUntil',
    render: (v) => (
      <span>
        {formatDate(v)} <span className="muted">({toDayjs(v).diff(dayjs().startOf('day'), 'day')}d)</span>
      </span>
    ),
  },
];

const RECENT_COLUMNS = [
  { title: 'Asset', dataIndex: 'itemName', render: assetCell },
  { title: 'Status', dataIndex: 'status', render: (v) => <StatusTag value={v} /> },
  { title: 'Cost', dataIndex: 'cost', align: 'right', render: formatCurrency },
];

export default function DashboardView() {
  const dispatch = useDispatch();
  const { data, filters, loading, error } = useSelector((s) => s.dashboard);

  // Every filter change re-posts { filter } to /api/dashboard; the previous request is aborted.
  const body = useMemo(() => ({ filter: toFilterPayload(filters, DASHBOARD_FILTER_KEYS) }), [filters]);
  const refetch = useAbortableFetch(fetchDashboard, body);

  const setFilter = useCallback((patch) => dispatch(setDashboardFilters(patch)), [dispatch]);
  const toggleFilter = useCallback(
    (key, value) => setFilter({ [key]: filters[key] === value ? null : value }),
    [setFilter, filters]
  );
  const clearFilters = useCallback(() => dispatch(resetDashboardFilters()), [dispatch]);

  const commitSearch = useCallback((value) => setFilter({ searchText: value }), [setFilter]);
  const { searchText, setSearchText, submitSearch } = useDebouncedSearch(filters.searchText, commitSearch);

  const activeFilterCount = Object.keys(body.filter).length;

  const handleRange = useCallback(
    (range) =>
      setFilter({
        purchasedFrom: range?.[0] ? range[0].format('YYYY-MM-DD') : null,
        purchasedTo: range?.[1] ? range[1].format('YYYY-MM-DD') : null,
      }),
    [setFilter]
  );
  const rangeValue = useMemo(
    () => [toDayjs(filters.purchasedFrom), toDayjs(filters.purchasedTo)],
    [filters.purchasedFrom, filters.purchasedTo]
  );

  // Open the Assets list with the dashboard's matching filters applied (also server-side there).
  const openInAssets = useCallback(
    (extra = {}) => {
      dispatch(
        setAssetQuery({
          page: 1,
          searchText: filters.searchText,
          category: filters.category,
          status: filters.status,
          condition: filters.condition,
          warrantyStatus: filters.warrantyStatus,
          ...extra,
        })
      );
      navigate('/assets');
    },
    [dispatch, filters]
  );

  // Derived chart rows — recomputed only when the response or the matching filter changes.
  const categoryItems = useMemo(
    () =>
      (data?.byCategory || []).map((c) => ({
        key: c.category,
        label: c.category,
        count: c.count,
        active: filters.category === c.category,
        tooltip: `${c.count} assets · ${formatCurrency(c.value)}`,
      })),
    [data?.byCategory, filters.category]
  );
  const statusItems = useMemo(
    () =>
      (data?.byStatus || []).map((s) => ({
        key: s.status,
        label: <StatusTag value={s.status} />,
        count: s.count,
        active: filters.status === s.status,
        tooltip: `${s.count} assets · ${formatCurrency(s.value)}`,
      })),
    [data?.byStatus, filters.status]
  );
  const warrantyItems = useMemo(
    () =>
      (data?.byWarranty || []).map((w) => ({
        key: w.warrantyStatus,
        label: <StatusTag value={w.warrantyStatus} />,
        count: w.count,
        active: filters.warrantyStatus === w.warrantyStatus,
      })),
    [data?.byWarranty, filters.warrantyStatus]
  );
  const conditionItems = useMemo(
    () =>
      (data?.byCondition || []).map((c) => ({
        key: c.condition,
        label: <StatusTag value={c.condition} />,
        count: c.count,
        active: filters.condition === c.condition,
      })),
    [data?.byCondition, filters.condition]
  );
  const locationItems = useMemo(
    () =>
      (data?.byLocation || []).map((l) => ({
        key: l.location,
        label: l.location,
        count: l.count,
        active: filters.location === l.location,
      })),
    [data?.byLocation, filters.location]
  );
  const peopleStatusItems = useMemo(
    () => (data?.people.byStatus || []).map((s) => ({ key: s.status, label: <StatusTag value={s.status} />, count: s.count })),
    [data?.people.byStatus]
  );
  const workTypeItems = useMemo(
    () => (data?.people.byWorkType || []).map((w) => ({ key: w.workType, label: w.workType, count: w.count })),
    [data?.people.byWorkType]
  );
  const departmentItems = useMemo(
    () => (data?.people.byDepartment || []).map((d) => ({ key: d.department, label: d.department, count: d.count })),
    [data?.people.byDepartment]
  );
  const locationOptions = useMemo(() => toOptions(data?.filterOptions.locations || []), [data?.filterOptions.locations]);

  const onCategory = useCallback((item) => toggleFilter('category', item.key), [toggleFilter]);
  const onStatus = useCallback((item) => toggleFilter('status', item.key), [toggleFilter]);
  const onWarranty = useCallback((item) => toggleFilter('warrantyStatus', item.key), [toggleFilter]);
  const onCondition = useCallback((item) => toggleFilter('condition', item.key), [toggleFilter]);
  const onLocation = useCallback(
    (item) => item.key !== 'Unspecified' && toggleFilter('location', item.key),
    [toggleFilter]
  );

  const kpis = data?.kpis;

  let content;
  if (!data && error) {
    content = (
      <Card style={{ marginTop: 16 }}>
        <ErrorState variant="page" title="Couldn't load the dashboard" message={error} onRetry={refetch} retrying={loading} />
      </Card>
    );
  } else if (!data) {
    content = (
      <>
        <div className="kpi-grid">
          {Array.from({ length: 6 }, (_, i) => (
            <Card key={i} size="small">
              <Skeleton active avatar paragraph={{ rows: 1 }} title={false} />
            </Card>
          ))}
        </div>
        <Card>
          <Skeleton active paragraph={{ rows: 8 }} />
        </Card>
      </>
    );
  } else {
    content = (
      // Keep the last result on screen (dimmed) while a new filter result loads.
      <Spin spinning={loading} tip="Updating…" size="large">
        {error && <div style={{ marginTop: 16 }}><ErrorState message={`Couldn't refresh: ${error}`} onRetry={refetch} retrying={loading} /></div>}

        <div className="kpi-grid">
          <Kpi icon={<AppstoreOutlined />} label="Total assets" value={kpis.totalAssets} hint={activeFilterCount ? 'Matching filters' : 'All assets'} />
          <Kpi icon={<WalletOutlined />} label="Total value" value={formatCurrency(kpis.totalValue).replace(/\.00$/, '')} hint="Purchase cost" />
          <Kpi icon={<SwapOutlined />} label="Assigned" value={kpis.assigned} hint={pct(kpis.assigned, kpis.totalAssets)} />
          <Kpi icon={<CheckCircleOutlined />} label="Available" value={kpis.available} hint={pct(kpis.available, kpis.totalAssets)} />
          <Kpi icon={<ToolOutlined />} label="Under repair" value={kpis.underRepair} hint={`${kpis.retiredOrLost} retired or lost`} />
          <Kpi icon={<ClockCircleOutlined />} label="Warranty expiring" value={kpis.expiringSoon} hint={`In the next ${data.expiringDays} days`} />
        </div>

        <div className="dash-grid">
          <Card className="span-7" title="Assets by category" extra={<span className="muted">Click a category to filter</span>}>
            <BarList items={categoryItems} hideZero={!filters.category} emptyText="No assets match these filters" onSelect={onCategory} />
          </Card>
          <div className="span-5" style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
            <Card title="Asset status">
              <BarList items={statusItems} onSelect={onStatus} />
            </Card>
            <Card title="Warranty">
              <BarList items={warrantyItems} onSelect={onWarranty} />
            </Card>
          </div>
        </div>

        <div className="dash-grid">
          <Card className="span-8" title="Purchases per month" extra={<span className="muted">Last 12 months</span>}>
            <MonthlyChart data={data.monthly} />
          </Card>
          <div className="span-4" style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
            <Card title="Condition">
              <BarList items={conditionItems} onSelect={onCondition} />
            </Card>
            <Card title="Top locations">
              <BarList items={locationItems} emptyText="No locations recorded" onSelect={onLocation} />
            </Card>
          </div>
        </div>

        <div className="dash-grid">
          <Card
            className="span-6"
            title={`Warranty expiring in ${data.expiringDays} days`}
            extra={<Button type="link" size="small" onClick={() => openInAssets({ warrantyStatus: 'Active' })}>View assets</Button>}
          >
            <Table
              className="mini-table"
              size="small"
              rowKey="_id"
              pagination={false}
              dataSource={data.expiringSoon}
              locale={{ emptyText: smallEmpty('Nothing expiring soon') }}
              scroll={{ x: 420 }}
              columns={EXPIRING_COLUMNS}
            />
          </Card>
          <Card
            className="span-6"
            title="Recently added"
            extra={<Button type="link" size="small" onClick={() => openInAssets()}>View all</Button>}
          >
            <Table
              className="mini-table"
              size="small"
              rowKey="_id"
              pagination={false}
              dataSource={data.recentAssets}
              locale={{ emptyText: smallEmpty('No assets yet') }}
              scroll={{ x: 420 }}
              columns={RECENT_COLUMNS}
            />
          </Card>
        </div>

        <div className="section-title">
          <TeamOutlined /> People overview <span className="muted">· all employees</span>
        </div>
        <div className="dash-grid">
          <Card className="span-4" title="Employees" extra={<NavLink href="/people">Manage</NavLink>}>
            <div className="kpi-value" style={{ fontSize: 34 }}>{data.people.total}</div>
            <div className="kpi-label" style={{ marginBottom: 12 }}>Total employees</div>
            <BarList items={peopleStatusItems} emptyText="No employees yet" />
          </Card>
          <Card className="span-4" title="Work type">
            <BarList items={workTypeItems} emptyText="No employees yet" />
          </Card>
          <Card className="span-4" title="Top departments">
            <BarList items={departmentItems} emptyText="No employees yet" />
          </Card>
        </div>
      </Spin>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">Overview</div>
          <Typography.Title level={3} style={{ margin: '4px 0 0' }}>
            Dashboard
          </Typography.Title>
          <Typography.Text type="secondary">
            {data ? `Updated ${formatDateTime(data.generatedAt)}` : 'Asset and people insights'}
          </Typography.Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={refetch} loading={loading}>
          Refresh
        </Button>
      </div>

      <Card size="small" styles={{ body: { padding: 16 } }}>
        <div className="dash-filters">
          <Input.Search
            className="search"
            placeholder="Search asset ID, name, brand, serial, vendor, invoice…"
            allowClear
            maxLength={100}
            value={searchText}
            loading={loading && Boolean(searchText)}
            onChange={(e) => setSearchText(e.target.value)}
            onSearch={submitSearch}
          />
          <Select placeholder="Category" allowClear showSearch value={filters.category} options={CATEGORY_OPTIONS} onChange={(v) => setFilter({ category: v ?? null })} />
          <Select placeholder="Status" allowClear value={filters.status} options={STATUS_OPTIONS} onChange={(v) => setFilter({ status: v ?? null })} />
          <Select placeholder="Condition" allowClear value={filters.condition} options={CONDITION_OPTIONS} onChange={(v) => setFilter({ condition: v ?? null })} />
          <Select placeholder="Warranty" allowClear value={filters.warrantyStatus} options={WARRANTY_OPTIONS} onChange={(v) => setFilter({ warrantyStatus: v ?? null })} />
          <Select placeholder="Purchase type" allowClear value={filters.purchaseType} options={PURCHASE_TYPE_OPTIONS} onChange={(v) => setFilter({ purchaseType: v ?? null })} />
          <Select
            placeholder="Location"
            allowClear
            showSearch
            value={filters.location}
            options={locationOptions}
            loading={!data && loading}
            onChange={(v) => setFilter({ location: v ?? null })}
            notFoundContent="No locations yet"
          />
          <DatePicker.RangePicker
            className="range"
            format="DD MMM YYYY"
            placeholder={['Purchased from', 'Purchased to']}
            value={rangeValue}
            allowEmpty={[true, true]}
            disabledDate={disableFuture}
            onChange={handleRange}
            presets={RANGE_PRESETS}
          />
        </div>
        <div className="dash-filter-foot">
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {activeFilterCount
              ? `${activeFilterCount} filter${activeFilterCount > 1 ? 's' : ''} applied · asset figures reflect filters`
              : 'Showing all assets'}
          </Typography.Text>
          <Button type="link" icon={<ClearOutlined />} disabled={!activeFilterCount} onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      </Card>

      {content}
    </>
  );
}
