'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { App, Button, Card, Empty, Input, Select, Space, Table, Tabs, Tag, Tooltip, Typography } from 'antd';
import {
  ClearOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  MailOutlined,
  PlusOutlined,
  RollbackOutlined,
  SafetyCertificateOutlined,
  SwapOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { ACK_STATUSES, ASSIGNMENT_ACTIONS, RETURN_DUE_FILTERS, isReturnOverdue } from '@/lib/constants';
import { formatDate, formatDateTime } from '@/lib/format';
import StatusTag from '@/components/StatusTag';
import ErrorState from '@/components/ErrorState';
import DataLoader from '@/components/DataLoader';
import AssetImage from '@/components/assets/AssetImage';
import AssignmentModal, { reportResend } from '@/components/assets/AssignmentModal';
import AssetDetailsDrawer from '@/components/assets/AssetDetailsDrawer';
import { AckLine } from '@/components/assets/AssetHistory';
import useServerTable, { PAGE_SIZE_OPTIONS } from '@/hooks/useServerTable';
import useRefreshOnFocus from '@/hooks/useRefreshOnFocus';
import useCategories from '@/hooks/useCategories';
import { fetchAssetById, fetchAssignmentSummary, resendAckEmail } from '@/store/assetsSlice';
import { fetchEmployeeOptions } from '@/store/employeesSlice';
import {
  CURRENT_FILTER_KEYS,
  LOG_FILTER_KEYS,
  fetchCurrentAssignments,
  fetchHandOverLog,
  resetCurrentFilters,
  resetLogFilters,
  setCurrentQuery,
  setLogQuery,
} from '@/store/assignmentsSlice';

const toOptions = (list) => list.map((v) => ({ label: v, value: v }));
const ACK_OPTIONS = toOptions(ACK_STATUSES);
const ACTION_OPTIONS = toOptions(ASSIGNMENT_ACTIONS);
const RETURN_DUE_OPTIONS = toOptions(RETURN_DUE_FILTERS);
const ACTION_COLOR = { Assigned: 'green', Transferred: 'blue', Returned: 'orange' };
const person = (h) => (h ? `${h.fullName}${h.employeeId ? ` (${h.employeeId})` : ''}` : '—');

function StatCard({ icon, label, value, hint, tone, onClick, active }) {
  return (
    <Card size="small" hoverable={Boolean(onClick)} onClick={onClick} className={active ? 'stat-active' : undefined} styles={{ body: { padding: 16 } }}>
      <div className="kpi">
        <span className={`kpi-icon${tone ? ` ${tone}` : ''}`}>{icon}</span>
        <div style={{ minWidth: 0 }}>
          <div className="kpi-label">{label}</div>
          <div className="kpi-value">{value ?? '—'}</div>
          {hint && <div className="kpi-hint">{hint}</div>}
        </div>
      </div>
    </Card>
  );
}

/** Calls `fn` whenever `key` changes after the first render (used to refresh a table after a change elsewhere). */
function useOnChange(key, fn) {
  const latest = useRef(fn);
  latest.current = fn;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    latest.current();
  }, [key]);
}

function CurrentTab({ reloadKey, employeeOptions, onView, onHandOver, onResend, resending }) {
  const dispatch = useDispatch();
  const { items, totalCount, query, loading, loaded, error } = useSelector((s) => s.currentAssignments);
  const { options: categoryOptions } = useCategories();
  const { refetch, setFilter, onTableChange, sortOrderFor, activeFilterCount, searchText, setSearchText, submitSearch } =
    useServerTable({ query, fetchThunk: fetchCurrentAssignments, setQueryAction: setCurrentQuery, filterKeys: CURRENT_FILTER_KEYS });
  useOnChange(reloadKey, refetch);

  const columns = useMemo(
    () => [
      {
        title: 'Asset',
        key: 'itemName',
        dataIndex: 'itemName',
        width: 280,
        sorter: true,
        sortOrder: sortOrderFor('itemName'),
        render: (_, r) => (
          <Space size={10}>
            <AssetImage assetId={r._id} image={r.image} size={40} />
            <div>
              <Typography.Text strong>{r.itemName}</Typography.Text>
              <div className="muted">
                {r.assetId} · {r.category}
              </div>
            </div>
          </Space>
        ),
      },
      {
        title: 'With',
        key: 'assignedAt',
        width: 230,
        sorter: true,
        sortOrder: sortOrderFor('assignedAt'),
        render: (_, r) => (
          <div>
            <Typography.Text>{r.assignedTo?.fullName}</Typography.Text>
            <div className="muted">
              {r.assignedTo?.employeeId} · since {formatDate(r.assignedAt)}
            </div>
          </div>
        ),
      },
      {
        title: 'Due back',
        key: 'expectedReturnAt',
        width: 160,
        sorter: true,
        sortOrder: sortOrderFor('expectedReturnAt'),
        render: (_, r) =>
          !r.expectedReturnAt ? (
            <span className="muted">No due date</span>
          ) : isReturnOverdue(r) ? (
            <Tag color="red">Overdue · {formatDate(r.expectedReturnAt)}</Tag>
          ) : (
            formatDate(r.expectedReturnAt)
          ),
      },
      {
        title: 'Acknowledgement',
        key: 'acknowledgement',
        width: 230,
        render: (_, r) => {
          const ack = r.acknowledgement;
          if (!ack) return <span className="muted">—</span>;
          if (ack.status === 'Acknowledged') {
            return (
              <div>
                <StatusTag value="Acknowledged" />
                <div className="muted">{formatDateTime(ack.acknowledgedAt)}</div>
              </div>
            );
          }
          return (
            <Space size={4} wrap>
              <StatusTag value="Pending" />
              <Button
                size="small"
                type="link"
                icon={<MailOutlined />}
                loading={resending === `${ack.eventId}:to`}
                onClick={() => onResend(r._id, ack.eventId, 'to')}
                style={{ paddingInline: 2 }}
              >
                Resend
              </Button>
            </Space>
          );
        },
      },
      {
        title: 'Actions',
        key: 'actions',
        width: 130,
        fixed: 'right',
        render: (_, r) => (
          <Space size={2}>
            <Tooltip title="Details & history">
              <Button type="text" icon={<EyeOutlined />} aria-label="View asset" onClick={() => onView(r)} />
            </Tooltip>
            <Tooltip title={`Transfer from ${r.assignedTo?.fullName} to someone else`}>
              <Button type="text" icon={<SwapOutlined />} aria-label="Transfer" onClick={() => onHandOver('transfer', r)} />
            </Tooltip>
            <Tooltip title={`Return from ${r.assignedTo?.fullName}`}>
              <Button type="text" icon={<RollbackOutlined />} aria-label="Return" onClick={() => onHandOver('return', r)} />
            </Tooltip>
          </Space>
        ),
      },
    ],
    [sortOrderFor, onView, onHandOver, onResend, resending]
  );

  return (
    <>
      <div className="filters">
        <Input.Search
          placeholder="Search asset ID, name, serial…"
          allowClear
          value={searchText}
          maxLength={100}
          loading={loading && Boolean(searchText)}
          onChange={(e) => setSearchText(e.target.value)}
          onSearch={submitSearch}
        />
        <Select
          placeholder="Employee"
          allowClear
          showSearch
          optionFilterProp="label"
          style={{ minWidth: 220 }}
          value={query.assignedTo}
          options={employeeOptions}
          onChange={(v) => setFilter({ assignedTo: v ?? null })}
        />
        <Select placeholder="Acknowledgement" allowClear value={query.acknowledgement} options={ACK_OPTIONS} onChange={(v) => setFilter({ acknowledgement: v ?? null })} />
        <Select placeholder="Return due" allowClear value={query.returnDue} options={RETURN_DUE_OPTIONS} onChange={(v) => setFilter({ returnDue: v ?? null })} />
        <Select placeholder="Category" allowClear showSearch optionFilterProp="label" value={query.categoryId} options={categoryOptions} onChange={(v) => setFilter({ categoryId: v ?? null })} />
        {activeFilterCount > 0 && (
          <Button icon={<ClearOutlined />} onClick={() => dispatch(resetCurrentFilters())}>
            Clear ({activeFilterCount})
          </Button>
        )}
      </div>
      {error && <ErrorState message={error} onRetry={refetch} retrying={loading} />}
      <DataLoader ready={loaded || Boolean(error)} loading={loading} dataKey={JSON.stringify(query)}>
        <Table
          rowKey="_id"
          columns={columns}
          dataSource={items}
          scroll={{ x: 1030 }}
          onChange={onTableChange}
          showSorterTooltip={false}
          pagination={{
            current: query.page,
            pageSize: query.perPageData,
            total: totalCount,
            showSizeChanger: true,
            pageSizeOptions: PAGE_SIZE_OPTIONS,
            showTotal: (t) => `${t} assigned asset${t === 1 ? '' : 's'}`,
            disabled: loading,
          }}
          locale={{
            emptyText: !loaded ? ' ' : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={activeFilterCount ? 'No assignments match these filters' : 'No assets are assigned right now'} />
            ),
          }}
        />
      </DataLoader>
    </>
  );
}

function LogTab({ reloadKey, employeeOptions, onView }) {
  const dispatch = useDispatch();
  const { items, totalCount, query, loading, loaded, error } = useSelector((s) => s.handOverLog);
  const { refetch, setFilter, onTableChange, activeFilterCount, searchText, setSearchText, submitSearch } = useServerTable({
    query,
    fetchThunk: fetchHandOverLog,
    setQueryAction: setLogQuery,
    filterKeys: LOG_FILTER_KEYS,
  });
  useOnChange(reloadKey, refetch);

  const columns = useMemo(
    () => [
      {
        title: 'Date',
        key: 'date',
        width: 150,
        render: (_, r) => (
          <div>
            {formatDate(r.event.date)}
            <div className="muted">by {r.event.by?.name || '—'}</div>
          </div>
        ),
      },
      { title: 'Hand-over', key: 'action', width: 120, render: (_, r) => <Tag color={ACTION_COLOR[r.event.action]}>{r.event.action}</Tag> },
      {
        title: 'Asset',
        key: 'asset',
        width: 240,
        render: (_, r) => (
          <Button type="link" style={{ padding: 0, height: 'auto', textAlign: 'left' }} onClick={() => onView(r.asset._id)}>
            <span>
              {r.asset.itemName}
              <div className="muted">{r.asset.assetId}</div>
            </span>
          </Button>
        ),
      },
      {
        title: 'From → To',
        key: 'people',
        width: 270,
        render: (_, r) => (
          <span>
            {r.event.from ? person(r.event.from) : <span className="muted">stock</span>} → {r.event.to ? person(r.event.to) : <span className="muted">back to stock</span>}
            {r.event.statusAfter && (
              <>
                {' '}
                <StatusTag value={r.event.statusAfter} />
              </>
            )}
          </span>
        ),
      },
      { title: 'Condition', key: 'condition', width: 110, render: (_, r) => <StatusTag value={r.event.condition} /> },
      {
        title: 'Acknowledgements',
        key: 'acks',
        width: 250,
        render: (_, r) => {
          const e = r.event;
          if (!e.toAck && !e.fromAck) return <span className="muted">—</span>;
          // Status only: the log is a record. Resending is on the "Currently assigned" tab and in the asset's history.
          return (
            <div style={{ display: 'grid', gap: 2 }}>
              <AckLine compact label={e.from?.fullName} ack={e.fromAck} />
              <AckLine compact label={e.to?.fullName} ack={e.toAck} />
            </div>
          );
        },
      },
    ],
    [onView]
  );

  return (
    <>
      <div className="filters">
        <Input.Search
          placeholder="Search asset ID, name, serial…"
          allowClear
          value={searchText}
          maxLength={100}
          loading={loading && Boolean(searchText)}
          onChange={(e) => setSearchText(e.target.value)}
          onSearch={submitSearch}
        />
        <Select
          placeholder="Employee"
          allowClear
          showSearch
          optionFilterProp="label"
          style={{ minWidth: 220 }}
          value={query.employeeId}
          options={employeeOptions}
          onChange={(v) => setFilter({ employeeId: v ?? null })}
        />
        <Select placeholder="Hand-over" allowClear value={query.action} options={ACTION_OPTIONS} onChange={(v) => setFilter({ action: v ?? null })} />
        <Select placeholder="Acknowledgement" allowClear value={query.acknowledgement} options={ACK_OPTIONS} onChange={(v) => setFilter({ acknowledgement: v ?? null })} />
        {activeFilterCount > 0 && (
          <Button icon={<ClearOutlined />} onClick={() => dispatch(resetLogFilters())}>
            Clear ({activeFilterCount})
          </Button>
        )}
      </div>
      {error && <ErrorState message={error} onRetry={refetch} retrying={loading} />}
      <DataLoader ready={loaded || Boolean(error)} loading={loading} dataKey={JSON.stringify(query)}>
        <Table
          rowKey="_id"
          columns={columns}
          dataSource={items}
          scroll={{ x: 1100 }}
          onChange={onTableChange}
          pagination={{
            current: query.page,
            pageSize: query.perPageData,
            total: totalCount,
            showSizeChanger: true,
            pageSizeOptions: PAGE_SIZE_OPTIONS,
            showTotal: (t) => `${t} hand-over${t === 1 ? '' : 's'}`,
            disabled: loading,
          }}
          locale={{
            emptyText: !loaded ? ' ' : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={activeFilterCount ? 'No hand-overs match these filters' : 'No hand-overs yet'} />
            ),
          }}
        />
      </DataLoader>
    </>
  );
}

/**
 * Assignments: the hub for handing assets to employees. Assign one or many, transfer, return,
 * and follow up on acknowledgements and overdue returns; plus a log of every hand-over.
 */
export default function AssignmentsView() {
  const dispatch = useDispatch();
  const { message } = App.useApp();
  const employees = useSelector((s) => s.employees.options);
  const [tab, setTab] = useState('current');
  const [reloadKey, setReloadKey] = useState(0);
  const [summary, setSummary] = useState(null);
  const [summaryError, setSummaryError] = useState(null);
  const [handOver, setHandOver] = useState(null); // { mode, asset? }
  const [viewing, setViewing] = useState(null); // asset (from the current list) or { _id } to load
  const [resending, setResending] = useState(null);

  useEffect(() => {
    const p = dispatch(fetchEmployeeOptions());
    return () => p.abort();
  }, [dispatch]);
  const employeeOptions = useMemo(() => employees.map((e) => ({ value: e._id, label: `${e.fullName} (${e.employeeId})` })), [employees]);

  // The counts at the top; the previous numbers stay on screen while they reload or if a reload fails.
  useEffect(() => {
    const promise = dispatch(fetchAssignmentSummary());
    (async () => {
      try {
        setSummary(await promise.unwrap());
        setSummaryError(null);
      } catch (err) {
        if (err?.name === 'AbortError') return;
        setSummaryError(err?.message || "Couldn't load the counts");
      }
    })();
    return () => promise.abort();
  }, [dispatch, reloadKey]);

  const reloadAll = useCallback(() => setReloadKey((k) => k + 1), []);
  // Coming back to this tab reloads the counts and lists, so new acknowledgements show up.
  useRefreshOnFocus(reloadAll);
  const openHandOver = useCallback((mode, asset) => setHandOver({ mode, asset }), []);
  // `updated` is null after a bulk assign, an unknown outcome (timeout) or stale data: close an open
  // drawer rather than leave it showing outdated details.
  const afterHandOver = useCallback(
    (updated) => {
      setHandOver(null);
      setViewing((v) => (!v ? v : !updated ? null : v._id === updated._id ? updated : v));
      reloadAll();
    },
    [reloadAll]
  );

  const resend = useCallback(
    async (assetId, eventId, side) => {
      setResending(`${eventId}:${side}`);
      try {
        const result = await dispatch(resendAckEmail({ id: assetId, eventId, side })).unwrap();
        reportResend(message, result);
      } catch (err) {
        message.error(err?.message || "The email couldn't be sent");
      } finally {
        setResending(null);
        reloadAll();
      }
    },
    [dispatch, message, reloadAll]
  );

  // The log only has a summary of the asset, so load the full asset before opening its drawer.
  const view = useCallback(
    async (assetOrId) => {
      if (typeof assetOrId !== 'string') return setViewing(assetOrId);
      try {
        const { item } = await dispatch(fetchAssetById(assetOrId)).unwrap();
        setViewing(item);
      } catch (err) {
        message.error(err?.message || "Couldn't open this asset");
      }
      return undefined;
    },
    [dispatch, message]
  );

  const setCurrentFilter = (patch) => {
    dispatch(setCurrentQuery({ assignedTo: null, acknowledgement: null, returnDue: null, categoryId: null, searchText: '', page: 1, ...patch }));
    setTab('current');
  };
  const currentQuery = useSelector((s) => s.currentAssignments.query);
  // First load: the splash shows until the counts and the "Currently assigned" list are in (or failed).
  const currentReady = useSelector((s) => s.currentAssignments.loaded || Boolean(s.currentAssignments.error));
  const firstLoad = (!summary && !summaryError) || !currentReady;

  return (
    <>
      <div className="page-header">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            Assignments
          </Typography.Title>
          <Typography.Text type="secondary">
            Hand assets to employees, track their acknowledgements and get them back on time
          </Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openHandOver('assign', null)}>
          Assign assets
        </Button>
      </div>

      {/* First load: one splash for the counts and the list together (later loads: each tab's own). */}
      <DataLoader ready={!firstLoad} loading={false}>
        <div className="stat-grid">
          <StatCard
            icon={<SwapOutlined />}
            label="Assigned now"
            value={summary?.assigned}
            hint={summary ? `with ${summary.holders} employee${summary.holders === 1 ? '' : 's'}` : null}
            onClick={() => setCurrentFilter({})}
            active={tab === 'current' && !currentQuery.acknowledgement && !currentQuery.returnDue}
          />
          <StatCard
            icon={<SafetyCertificateOutlined />}
            tone="warn"
            label="Awaiting acknowledgement"
            value={summary?.pendingAcknowledgement}
            hint={summary?.pendingReturnAcknowledgement ? `+ ${summary.pendingReturnAcknowledgement} return${summary.pendingReturnAcknowledgement === 1 ? '' : 's'} not yet acknowledged` : 'receipts not yet confirmed'}
            onClick={() => setCurrentFilter({ acknowledgement: 'Pending' })}
            active={tab === 'current' && currentQuery.acknowledgement === 'Pending'}
          />
          <StatCard
            icon={<WarningOutlined />}
            tone="danger"
            label="Overdue returns"
            value={summary?.overdue}
            hint="past their expected return date"
            onClick={() => setCurrentFilter({ returnDue: 'Overdue' })}
            active={tab === 'current' && currentQuery.returnDue === 'Overdue'}
          />
          <StatCard
            icon={<ClockCircleOutlined />}
            label="Due in 7 days"
            value={summary?.dueSoon}
            hint="expected back this week"
            onClick={() => setCurrentFilter({ returnDue: 'Due in 7 days' })}
            active={tab === 'current' && currentQuery.returnDue === 'Due in 7 days'}
          />
        </div>

        {summaryError && (
          <div style={{ marginBottom: 16 }}>
            <ErrorState message={`Couldn't load the counts: ${summaryError}`} onRetry={reloadAll} />
          </div>
        )}

        <Card>
          <Tabs
            activeKey={tab}
            onChange={setTab}
            items={[
              {
                key: 'current',
                label: 'Currently assigned',
                children:
                  tab === 'current' ? (
                    <CurrentTab
                      reloadKey={reloadKey}
                      employeeOptions={employeeOptions}
                      onView={view}
                      onHandOver={openHandOver}
                      onResend={resend}
                      resending={resending}
                    />
                  ) : null,
              },
              {
                key: 'log',
                label: 'Hand-over log',
                children:
                  tab === 'log' ? (
                    <LogTab reloadKey={reloadKey} employeeOptions={employeeOptions} onView={view} />
                  ) : null,
              },
            ]}
          />
        </Card>
      </DataLoader>

      <AssignmentModal
        open={Boolean(handOver)}
        mode={handOver?.mode}
        asset={handOver?.asset}
        onClose={() => setHandOver(null)}
        onDone={afterHandOver}
      />
      <AssetDetailsDrawer asset={viewing} onClose={() => setViewing(null)} onAction={openHandOver} />
    </>
  );
}
