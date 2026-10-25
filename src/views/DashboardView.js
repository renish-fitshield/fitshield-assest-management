'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import dayjs from 'dayjs';
import { Avatar, Button, Card, Segmented, Tag, Typography } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  MailOutlined,
  MinusCircleOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  ToolOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { ASSET_STATUSES, ASSIGNMENT_ACTIONS } from '@/lib/constants';
import {
  formatCompactCount,
  formatCompactCurrency,
  formatCount,
  formatDate,
  formatDateTime,
  formatPercent,
  toDayjs,
} from '@/lib/format';
import { NavLink, navigate } from '@/lib/navigation';
import { toFilterPayload } from '@/store/listPayload';
import StatusTag from '@/components/StatusTag';
import CompactCurrency from '@/components/CompactCurrency';
import ErrorState from '@/components/ErrorState';
import DataLoader from '@/components/DataLoader';
import ChartCard from '@/components/dashboard/ChartCard';
import { ColumnChart, DonutChart, HBarChart, preloadCharts } from '@/components/dashboard/charts';
import ShareBar from '@/components/dashboard/ShareBar';
import DashList from '@/components/dashboard/DashList';
import DashboardFilters from '@/components/dashboard/DashboardFilters';
import { AttentionCard, HeroCard, UsageCard } from '@/components/dashboard/OverviewCards';
import {
  AGE_COLORS,
  ASSET_STATUS_COLORS,
  CONDITION_COLORS,
  HAND_OVER_COLORS,
  SERIES,
  STATUS_TONES,
  WARRANTY_COLORS,
} from '@/components/dashboard/chartTheme';
import useAbortableFetch from '@/hooks/useAbortableFetch';
import useRefreshOnFocus from '@/hooks/useRefreshOnFocus';
import useCategories from '@/hooks/useCategories';
import {
  fetchDashboard,
  setDashboardFilters,
  resetDashboardFilters,
  DASHBOARD_FILTER_KEYS,
} from '@/store/dashboardSlice';
import { setAssetQuery } from '@/store/assetsSlice';
import { setCurrentQuery } from '@/store/assignmentsSlice';

/* ---------- chart series & table views ---------- */

const num = (title, dataIndex, render = formatCount) => ({ title, dataIndex, align: 'right', className: 'num', render });
const money = (title = 'Value', dataIndex = 'value') => num(title, dataIndex, (v) => <CompactCurrency value={v} />);

const SPEND_SERIES = {
  spend: [{ key: 'spend', name: 'Spend', color: SERIES[0] }],
  assets: [{ key: 'assets', name: 'Assets bought', color: SERIES[0] }],
};
const SPEND_METRICS = [
  { value: 'spend', label: 'Spend' },
  { value: 'assets', label: 'Assets' },
];
const CATEGORY_METRICS = [
  { value: 'count', label: 'By status' },
  { value: 'value', label: 'By value' },
];
const HAND_OVER_SERIES = ASSIGNMENT_ACTIONS.map((a) => ({ key: a, name: a, color: HAND_OVER_COLORS[a] }));
const VALUE_SERIES = [{ key: 'value', name: 'Value', color: SERIES[0] }];
const COUNT_SERIES = [{ key: 'count', name: 'Assets', color: SERIES[0] }];
const DEPARTMENT_SERIES = [
  { key: 'employees', name: 'Employees', color: SERIES[0] },
  { key: 'assets', name: 'Assets held', color: SERIES[1] },
];

const MONTHLY_COLUMNS = [{ title: 'Month', dataIndex: 'label' }, num('Assets', 'assets'), num('Units', 'units'), money('Spend', 'spend')];
const STATUS_COLUMNS = [
  { title: 'Status', dataIndex: 'name', render: (v) => <StatusTag value={v} /> },
  num('Assets', 'count'),
  num('Share', 'share', formatPercent),
  money(),
];
const CATEGORY_COLUMNS = [
  { title: 'Category', dataIndex: 'category' },
  num('Assets', 'count'),
  ...ASSET_STATUSES.map((s) => num(s, s)),
  money(),
];
const bucketColumns = (title) => [{ title, dataIndex: 'name' }, num('Assets', 'count'), money()];
const HAND_OVER_COLUMNS = [{ title: 'Month', dataIndex: 'label' }, ...ASSIGNMENT_ACTIONS.map((a) => num(a, a)), num('Total', 'total')];
const DEPARTMENT_COLUMNS = [
  { title: 'Department', dataIndex: 'department' },
  num('Employees', 'employees'),
  num('Holding assets', 'holders'),
  num('Assets held', 'assets'),
  money(),
];

const WARRANTY_ICONS = {
  Active: <CheckCircleOutlined />,
  'Expiring soon': <ClockCircleOutlined />,
  Expired: <CloseCircleOutlined />,
  'Not Applicable': <MinusCircleOutlined />,
};
const EMPLOYEE_STATUS_STYLE = {
  Active: { color: STATUS_TONES.good, icon: <CheckCircleOutlined /> },
  'On Notice': { color: STATUS_TONES.warning, icon: <ClockCircleOutlined /> },
  Exited: { color: STATUS_TONES.none, icon: <MinusCircleOutlined /> },
};
const HAND_OVER_TAG = { Assigned: 'blue', Transferred: 'cyan', Returned: 'orange' };

const person = (h) => h?.fullName || '—';
const HAND_OVER_TEXT = {
  Assigned: (e) => `to ${person(e.to)}`,
  Transferred: (e) => `${person(e.from)} → ${person(e.to)}`,
  Returned: (e) => `from ${person(e.from)}`,
};
const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('') || '?';
const daysFromToday = (date) => toDayjs(date).diff(dayjs().startOf('day'), 'day');
const plural = (n, word) => `${formatCount(n)} ${word}${n === 1 ? '' : 's'}`;
const hasAny = (rows, key = 'count') => rows.some((r) => r[key] > 0);

function SectionTitle({ title, note }) {
  return (
    <div className="dash-section">
      <h2>{title}</h2>
      {note && <span>{note}</span>}
    </div>
  );
}

export default function DashboardView() {
  const dispatch = useDispatch();
  const { data, filters, loading, error } = useSelector((s) => s.dashboard);
  const [spendMetric, setSpendMetric] = useState('spend');
  const [categoryMetric, setCategoryMetric] = useState('count');

  useEffect(preloadCharts, []);

  // Every filter change re-posts { filter } to /api/dashboard; the previous request is aborted.
  const body = useMemo(() => ({ filter: toFilterPayload(filters, DASHBOARD_FILTER_KEYS) }), [filters]);
  const refetch = useAbortableFetch(fetchDashboard, body);
  // Refresh counts as a new load (so it shows the splash); background updates don't.
  const [refreshes, setRefreshes] = useState(0);
  const refresh = useCallback(() => {
    setRefreshes((n) => n + 1);
    refetch();
  }, [refetch]);
  useRefreshOnFocus(refetch);
  const { options: categoryOptions, loading: categoriesLoading } = useCategories();

  const setFilter = useCallback((patch) => dispatch(setDashboardFilters(patch)), [dispatch]);
  const toggleFilter = useCallback(
    (key, value) => setFilter({ [key]: filters[key] === value ? null : value }),
    [setFilter, filters]
  );
  const clearFilters = useCallback(() => dispatch(resetDashboardFilters()), [dispatch]);
  const filtered = Object.keys(body.filter).length > 0;
  const dateFiltered = Boolean(filters.purchasedFrom || filters.purchasedTo);

  // Drill-downs: the Assets list / Assignments page with the matching filters applied.
  const openInAssets = useCallback(
    (extra = {}) => {
      dispatch(
        setAssetQuery({
          page: 1,
          searchText: filters.searchText,
          categoryId: filters.categoryId,
          status: filters.status,
          condition: filters.condition,
          warrantyStatus: filters.warrantyStatus,
          assignedTo: null,
          returnDue: null,
          ...extra,
        })
      );
      navigate('/assets');
    },
    [dispatch, filters]
  );
  const openAssignments = useCallback(
    (patch) => {
      dispatch(
        setCurrentQuery({
          page: 1,
          searchText: filters.searchText || '',
          categoryId: filters.categoryId,
          assignedTo: null,
          acknowledgement: null,
          returnDue: null,
          ...patch,
        })
      );
      navigate('/assignments');
    },
    [dispatch, filters.searchText, filters.categoryId]
  );
  const showExpiring = useCallback(() => {
    document.getElementById('dash-expiring')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  const onStatus = useCallback((d) => toggleFilter('status', d.key), [toggleFilter]);
  const onCategory = useCallback((row) => row.categoryId && toggleFilter('categoryId', row.categoryId), [toggleFilter]);
  const onCondition = useCallback((row) => toggleFilter('condition', row.key), [toggleFilter]);
  const onLocation = useCallback((row) => row.key && !row.isOther && toggleFilter('location', row.key), [toggleFilter]);
  const onWarranty = useCallback(
    (part) => (part.key === 'Expiring soon' ? showExpiring() : toggleFilter('warrantyStatus', part.key)),
    [toggleFilter, showExpiring]
  );

  const kpis = data?.kpis;
  const charts = data?.charts;

  const statusData = useMemo(
    () => (charts?.status || []).map((s) => ({ ...s, color: ASSET_STATUS_COLORS[s.key] })),
    [charts?.status]
  );
  // Only statuses that occur get a legend entry; colours stay fixed per status.
  const categorySeries = useMemo(
    () =>
      ASSET_STATUSES.filter((s) => (charts?.categories || []).some((c) => c[s] > 0)).map((s) => ({
        key: s,
        name: s,
        color: ASSET_STATUS_COLORS[s],
      })),
    [charts?.categories]
  );
  const warrantyParts = useMemo(
    () => (charts?.warranty || []).map((w) => ({ ...w, color: WARRANTY_COLORS[w.key], icon: WARRANTY_ICONS[w.key] })),
    [charts?.warranty]
  );
  const locationRows = useMemo(() => (charts?.locations || []).filter((l) => l.count > 0), [charts?.locations]);
  const departmentRows = useMemo(
    () => (charts?.departments || []).filter((d) => d.employees > 0 || d.assets > 0),
    [charts?.departments]
  );
  const employeeParts = useMemo(
    () => (data?.people.byStatus || []).map((s) => ({ ...s, ...EMPLOYEE_STATUS_STYLE[s.key] })),
    [data?.people.byStatus]
  );

  const attention = useMemo(() => {
    if (!kpis) return [];
    return [
      { key: 'overdue', label: 'Overdue returns', count: kpis.overdueReturns, tone: 'critical', icon: <ExclamationCircleOutlined />, onClick: () => openAssignments({ returnDue: 'Overdue' }) },
      { key: 'dueSoon', label: `Due back in ${data.dueSoonDays} days`, count: kpis.dueSoon, tone: 'warning', icon: <ClockCircleOutlined />, onClick: () => openAssignments({ returnDue: 'Due in 7 days' }) },
      { key: 'ack', label: 'Awaiting acknowledgement', count: kpis.pendingAcknowledgements, tone: 'warning', icon: <MailOutlined />, onClick: () => openAssignments({ acknowledgement: 'Pending' }) },
      { key: 'warranty', label: `Warranty ends in ${data.expiringDays} days`, count: kpis.expiringSoon, tone: 'warning', icon: <SafetyCertificateOutlined />, onClick: showExpiring },
      { key: 'repair', label: 'Under repair', count: kpis.underRepair, tone: 'serious', icon: <ToolOutlined />, onClick: () => openInAssets({ status: 'Under Repair' }) },
      { key: 'lost', label: 'Lost', count: kpis.lost, tone: 'critical', icon: <WarningOutlined />, onClick: () => openInAssets({ status: 'Lost' }) },
    ];
  }, [kpis, data?.dueSoonDays, data?.expiringDays, openAssignments, openInAssets, showExpiring]);

  const lists = useMemo(() => {
    if (!data) return null;
    const { expiringSoon, overdueReturns, recentAssets, recentHandOvers } = data.lists;
    return {
      expiring: expiringSoon.map((a) => {
        const days = daysFromToday(a.warrantyUntil);
        return {
          key: a._id,
          title: a.itemName,
          meta: `${a.assetId} · ${a.category || 'Uncategorized'}`,
          aside: days === 0 ? 'Today' : `In ${plural(days, 'day')}`,
          asideMeta: formatDate(a.warrantyUntil),
        };
      }),
      overdue: overdueReturns.map((a) => ({
        key: a._id,
        title: a.itemName,
        meta: `${a.assetId} · with ${person(a.assignedTo)}`,
        aside: <span className="overdue-text">{plural(-daysFromToday(a.expectedReturnAt), 'day')} late</span>,
        asideMeta: `Due ${formatDate(a.expectedReturnAt)}`,
        onClick: () => openAssignments({ returnDue: 'Overdue' }),
      })),
      handOvers: recentHandOvers.map((r) => ({
        key: String(r.event._id),
        lead: <Tag color={HAND_OVER_TAG[r.event.action]}>{r.event.action}</Tag>,
        title: r.itemName,
        meta: `${r.assetId} · ${HAND_OVER_TEXT[r.event.action]?.(r.event) || ''}`,
        aside: formatDate(r.event.date),
        asideMeta: r.event.by?.name ? `by ${r.event.by.name}` : null,
      })),
      recent: recentAssets.map((a) => ({
        key: a._id,
        title: a.itemName,
        meta: `${a.assetId} · ${a.category || 'Uncategorized'}`,
        aside: <CompactCurrency value={a.cost} />,
        asideMeta: `Added ${formatDate(a.createdAt)}`,
      })),
      holders: data.people.topHolders.map((h) => ({
        key: String(h._id),
        lead: <Avatar size={32} className="dash-avatar">{initials(h.fullName)}</Avatar>,
        title: h.fullName || 'Unknown employee',
        meta: [h.employeeId, h.department].filter(Boolean).join(' · '),
        aside: plural(h.assets, 'asset'),
        asideMeta: <CompactCurrency value={h.value} />,
        onClick: () => openInAssets({ assignedTo: String(h._id), status: null }),
      })),
    };
  }, [data, openAssignments, openInAssets]);

  let content;
  if (!data && error) {
    content = (
      <Card>
        <ErrorState variant="page" title="Couldn't load the dashboard" message={error} onRetry={refetch} retrying={loading} />
      </Card>
    );
  } else if (!data) {
    content = null; // first load: DataLoader shows the splash
  } else {
    const windowLabel = `${charts.monthly[0].label} – ${charts.monthly.at(-1).label}`;
    const undated = charts.age.find((a) => a.key === 'unknown')?.count || 0;
    const spendFormat = spendMetric === 'spend' ? formatCompactCurrency : formatCount;

    content = (
      // Keep the last result on screen (dimmed) while a new filter result loads — no layout jump.
      <div className={`dash-body${loading ? ' is-refreshing' : ''}`} aria-busy={loading}>
        {error && (
          <div className="dash-row">
            <div className="c-lg-12">
              <ErrorState message={`Couldn't refresh: ${error}`} onRetry={refetch} retrying={loading} />
            </div>
          </div>
        )}

        <div className="dash-row">
          <div className="c-lg-5 c-md-12">
            <HeroCard kpis={kpis} filtered={filtered} windowLabel={windowLabel} dateFiltered={dateFiltered} />
          </div>
          <div className="c-lg-4 c-md-6">
            <UsageCard
              kpis={kpis}
              onReadyToAssign={() => openInAssets({ status: 'Available' })}
              onPendingAcks={() => openAssignments({ acknowledgement: 'Pending' })}
            />
          </div>
          <div className="c-lg-3 c-md-6">
            <AttentionCard items={attention} />
          </div>
        </div>

        <SectionTitle title="Assets" note={filtered ? 'Matching the filters above' : 'All assets'} />
        <div className="dash-row">
          <ChartCard
            className="c-lg-8 c-md-12"
            title={spendMetric === 'spend' ? 'Spend per month' : 'Assets bought per month'}
            subtitle={`By purchase date · ${windowLabel}`}
            controls={<Segmented size="small" value={spendMetric} options={SPEND_METRICS} onChange={setSpendMetric} />}
            empty={!hasAny(charts.monthly, 'assets')}
            emptyText="No purchases dated in this period"
            table={{ columns: MONTHLY_COLUMNS, dataSource: charts.monthly, rowKey: 'month' }}
            footer={undated ? `${plural(undated, 'asset')} without a purchase date ${undated === 1 ? 'is' : 'are'} not in this chart.` : null}
          >
            <ColumnChart
              data={charts.monthly}
              series={SPEND_SERIES[spendMetric]}
              valueFormat={spendFormat}
              tickFormat={spendMetric === 'spend' ? formatCompactCurrency : formatCompactCount}
              labelPeak
              height={300}
              tooltipFooter={(d) =>
                spendMetric === 'spend' ? `${plural(d.assets, 'asset')} · ${plural(d.units, 'unit')}` : `${formatCompactCurrency(d.spend)} spent`
              }
            />
          </ChartCard>
          <ChartCard
            className="c-lg-4 c-md-12"
            title="Asset status"
            subtitle="Click a status to filter"
            empty={!kpis.totalAssets}
            table={{ columns: STATUS_COLUMNS, dataSource: charts.status, rowKey: 'key' }}
          >
            <DonutChart data={statusData} total={kpis.totalAssets} totalLabel={kpis.totalAssets === 1 ? 'asset' : 'assets'} onSelect={onStatus} activeKey={filters.status} />
          </ChartCard>
        </div>

        <div className="dash-row">
          <ChartCard
            className="c-lg-7 c-md-12"
            title="Assets by category"
            subtitle={categoryMetric === 'count' ? 'Count by status · click a category to filter' : 'Purchase value · click a category to filter'}
            controls={<Segmented size="small" value={categoryMetric} options={CATEGORY_METRICS} onChange={setCategoryMetric} />}
            empty={!charts.categories.length}
            table={{ columns: CATEGORY_COLUMNS, dataSource: charts.categories, rowKey: (r) => r.categoryId || r.category }}
          >
            {categoryMetric === 'count' ? (
              <HBarChart
                data={charts.categories}
                categoryKey="category"
                series={categorySeries}
                stacked
                totalFor={(r) => r.count}
                tooltipFooter={(d) => `${plural(d.count, 'asset')} · ${formatCompactCurrency(d.value)}`}
                onSelect={onCategory}
              />
            ) : (
              <HBarChart
                data={charts.categories}
                categoryKey="category"
                series={VALUE_SERIES}
                valueFormat={formatCompactCurrency}
                tooltipFooter={(d) => plural(d.count, 'asset')}
                onSelect={onCategory}
              />
            )}
          </ChartCard>
          <div className="c-lg-5 c-md-12 dash-stack">
            <ChartCard title="Warranty coverage" subtitle={`“Expiring soon” = ends within ${data.expiringDays} days`} empty={!kpis.totalAssets}>
              <ShareBar parts={warrantyParts} total={kpis.totalAssets} onSelect={onWarranty} activeKey={filters.warrantyStatus} />
            </ChartCard>
            <ChartCard
              title="Condition"
              subtitle="Click a condition to filter"
              empty={!hasAny(charts.condition)}
              table={{ columns: bucketColumns('Condition'), dataSource: charts.condition, rowKey: 'key' }}
            >
              <HBarChart
                data={charts.condition}
                series={COUNT_SERIES}
                colorFor={(d) => CONDITION_COLORS[d.key]}
                categoryWidth={80}
                rowHeight={30}
                onSelect={onCondition}
              />
            </ChartCard>
          </div>
        </div>

        <div className="dash-row">
          <ChartCard
            className="c-lg-4 c-md-6"
            title="Asset age"
            subtitle="Time since purchase"
            empty={!kpis.totalAssets}
            table={{ columns: bucketColumns('Age'), dataSource: charts.age, rowKey: 'key' }}
          >
            <ColumnChart
              data={charts.age}
              xKey="name"
              series={COUNT_SERIES}
              colorFor={(d) => AGE_COLORS[d.key]}
              height={220}
              tooltipFooter={(d) => formatCompactCurrency(d.value)}
            />
          </ChartCard>
          <ChartCard
            className="c-lg-4 c-md-6"
            title="Top locations"
            subtitle="Click a location to filter"
            empty={!locationRows.length}
            emptyText="No locations recorded"
            table={{ columns: bucketColumns('Location'), dataSource: locationRows, rowKey: 'name' }}
          >
            <HBarChart data={locationRows} series={COUNT_SERIES} categoryWidth={110} tooltipFooter={(d) => formatCompactCurrency(d.value)} onSelect={onLocation} />
          </ChartCard>
          <ChartCard
            className="c-lg-4 c-md-12"
            id="dash-expiring"
            title="Warranty ending soon"
            subtitle={`Next ${data.expiringDays} days · soonest first`}
            footer={
              kpis.expiringSoon > lists.expiring.length ? `Showing ${lists.expiring.length} of ${formatCount(kpis.expiringSoon)}` : null
            }
          >
            <DashList items={lists.expiring} emptyText={`No warranties end in the next ${data.expiringDays} days`} />
          </ChartCard>
        </div>

        <SectionTitle title="Assignments" note="Hand-overs of the matching assets" />
        <div className="dash-row">
          <ChartCard
            className="c-lg-8 c-md-12"
            title="Hand-overs per month"
            subtitle={`By hand-over date · ${windowLabel}`}
            empty={!hasAny(charts.handOvers, 'total')}
            emptyText="No hand-overs in this period"
            table={{ columns: HAND_OVER_COLUMNS, dataSource: charts.handOvers, rowKey: 'month' }}
          >
            <ColumnChart data={charts.handOvers} series={HAND_OVER_SERIES} stacked height={260} tooltipFooter={(d) => `${plural(d.total, 'hand-over')}`} />
          </ChartCard>
          <ChartCard
            className="c-lg-4 c-md-12"
            title="Overdue returns"
            subtitle="Most overdue first"
            controls={
              kpis.overdueReturns > 0 && (
                <Button type="link" size="small" onClick={() => openAssignments({ returnDue: 'Overdue' })}>
                  View all {formatCount(kpis.overdueReturns)}
                </Button>
              )
            }
          >
            <DashList items={lists.overdue} emptyText="Nothing is overdue" />
          </ChartCard>
        </div>

        <div className="dash-row">
          <ChartCard
            className="c-lg-7 c-md-12"
            title="Latest hand-overs"
            subtitle="Assignments, transfers and returns"
            controls={<NavLink href="/assignments">Open assignments</NavLink>}
          >
            <DashList items={lists.handOvers} emptyText="No hand-overs yet" />
          </ChartCard>
          <ChartCard
            className="c-lg-5 c-md-12"
            title="Recently added"
            subtitle="Newest assets first"
            controls={
              <Button type="link" size="small" onClick={() => openInAssets()}>
                View assets
              </Button>
            }
          >
            <DashList items={lists.recent} emptyText="No assets yet" />
          </ChartCard>
        </div>

        <SectionTitle title="People" note="Employee counts cover everyone; asset numbers follow the filters" />
        <div className="dash-row">
          <ChartCard className="c-lg-4 c-md-6" title="Employees" subtitle="By status" controls={<NavLink href="/people">Manage</NavLink>} empty={!data.people.total} emptyText="No employees yet">
            <div className="people-total">
              <span className="people-total-value">{formatCount(data.people.total)}</span>
              <span className="people-total-label">employees</span>
            </div>
            <ShareBar parts={employeeParts} total={data.people.total} />
            <dl className="people-stats">
              {data.people.byEmploymentType.map((t) => (
                <div key={t.key}>
                  <dt>{t.name}</dt>
                  <dd>{formatCount(t.count)}</dd>
                </div>
              ))}
              <div>
                <dt>Holding assets</dt>
                <dd>{formatCount(data.people.holders)}</dd>
              </div>
              <div>
                <dt>Assets per holder</dt>
                <dd>{data.people.holders ? (Math.round(data.people.assetsPerHolder * 10) / 10).toString() : '—'}</dd>
              </div>
            </dl>
          </ChartCard>
          <ChartCard
            className="c-lg-5 c-md-6"
            title="Departments"
            subtitle="Employees and the assets they hold"
            empty={!departmentRows.length}
            emptyText="No employees yet"
            table={{ columns: DEPARTMENT_COLUMNS, dataSource: departmentRows, rowKey: 'department' }}
          >
            <HBarChart
              data={departmentRows}
              categoryKey="department"
              series={DEPARTMENT_SERIES}
              categoryWidth={118}
              tooltipFooter={(d) => `${plural(d.holders, 'employee')} holding · ${formatCompactCurrency(d.value)}`}
            />
          </ChartCard>
          <ChartCard className="c-lg-3 c-md-12" title="Top holders" subtitle="Most assets right now">
            <DashList items={lists.holders} emptyText="Nobody holds an asset right now" />
          </ChartCard>
        </div>
      </div>
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
            {loading && data ? 'Updating…' : data ? `Updated ${formatDateTime(data.generatedAt)}` : 'Asset and people insights'}
          </Typography.Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={refresh} loading={loading}>
          Refresh
        </Button>
      </div>

      <DashboardFilters
        filters={filters}
        setFilter={setFilter}
        clearFilters={clearFilters}
        loading={loading}
        categoryOptions={categoryOptions}
        categoriesLoading={categoriesLoading}
        locations={data?.filterOptions.locations}
      />

      {/* New filters and Refresh show the splash here; a background update (back to the tab) doesn't. */}
      <DataLoader ready={Boolean(data) || Boolean(error)} loading={loading} dataKey={`${JSON.stringify(body.filter)}#${refreshes}`} minHeight={520}>
        {content}
      </DataLoader>
    </>
  );
}
