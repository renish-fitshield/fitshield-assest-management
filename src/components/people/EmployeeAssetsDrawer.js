'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { Button, Divider, Drawer, Empty, List, Skeleton, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { PlusOutlined, RollbackOutlined } from '@ant-design/icons';
import StatusTag from '@/components/StatusTag';
import ErrorState from '@/components/ErrorState';
import AssetImage from '@/components/assets/AssetImage';
import AssignAssetModal from '@/components/assets/AssignAssetModal';
import ReturnAssetModal from '@/components/assets/ReturnAssetModal';
import { formatDate } from '@/lib/format';
import { fetchEmployeeAssets } from '@/store/employeesSlice';

const HISTORY_COLUMNS = [
  {
    title: 'Asset',
    dataIndex: 'asset',
    render: (a) => (a ? `${a.assetId} · ${a.itemName}` : <span className="muted">Deleted asset</span>),
  },
  { title: 'From', dataIndex: 'assignedAt', width: 110, render: formatDate },
  {
    title: 'To',
    dataIndex: 'returnedAt',
    width: 110,
    render: (v, r) => (r.active ? <Tag color="blue">Current</Tag> : formatDate(v)),
  },
];

/**
 * Assets an employee holds: return any of them, assign more (one employee can hold many),
 * and see the full assignment history.
 */
export default function EmployeeAssetsDrawer({ employee, onClose, onChanged }) {
  const dispatch = useDispatch();
  const [state, setState] = useState({ loading: false, error: null, data: null });
  const [reloadKey, setReloadKey] = useState(0);
  const [assignOpen, setAssignOpen] = useState(false);
  const [returning, setReturning] = useState(null);

  useEffect(() => {
    if (!employee?._id) return undefined;
    const promise = dispatch(fetchEmployeeAssets(employee._id));
    // Keep showing data while reloading the same employee; drop it when switching employees.
    setState((s) => ({
      loading: true,
      error: null,
      data: s.data && String(s.data.employee?._id) === String(employee._id) ? s.data : null,
    }));
    (async () => {
      try {
        const data = await promise.unwrap();
        setState({ loading: false, error: null, data });
      } catch (err) {
        if (err?.name === 'AbortError') return;
        setState({ loading: false, error: err?.message || 'Failed to load assets', data: null });
      }
    })();
    return () => promise.abort();
  }, [employee?._id, reloadKey, dispatch]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  const afterChange = useCallback(() => {
    setAssignOpen(false);
    setReturning(null);
    reload();
    onChanged?.();
  }, [reload, onChanged]);

  const current = state.data?.current || [];
  const exited = (state.data?.employee || employee)?.status === 'Exited';
  const returnTarget = useMemo(
    () => (returning ? { ...returning, assignedTo: state.data?.employee || employee } : null),
    [returning, state.data, employee]
  );

  return (
    <Drawer
      open={Boolean(employee)}
      onClose={onClose}
      width={620}
      destroyOnHidden
      title={employee ? `${employee.fullName} · ${employee.employeeId}` : ''}
      extra={
        <Tooltip title={exited ? 'Exited employees cannot be assigned assets' : ''}>
          <Button type="primary" icon={<PlusOutlined />} disabled={exited || !state.data} onClick={() => setAssignOpen(true)}>
            Assign asset
          </Button>
        </Tooltip>
      }
    >
      {state.error ? (
        <ErrorState variant="page" title="Couldn't load assets" message={state.error} onRetry={reload} />
      ) : !state.data ? (
        <Skeleton active avatar paragraph={{ rows: 4 }} />
      ) : (
        <>
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            Currently assigned <span className="muted">({current.length})</span>
          </Typography.Title>
          <List
            loading={state.loading}
            dataSource={current}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No assets assigned" /> }}
            renderItem={(a) => (
              <List.Item
                actions={[
                  <Button key="return" size="small" icon={<RollbackOutlined />} onClick={() => setReturning(a)}>
                    Return
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  avatar={<AssetImage assetId={a._id} image={a.image} size={44} />}
                  title={
                    <Space size={6}>
                      <span>{a.itemName}</span>
                      <StatusTag value={a.condition} />
                    </Space>
                  }
                  description={`${a.assetId} · ${a.category}${a.serialNumber ? ` · ${a.serialNumber}` : ''} · since ${formatDate(a.assignedAt)}`}
                />
              </List.Item>
            )}
          />

          <Divider orientation="left">History</Divider>
          <Table
            size="small"
            rowKey="_id"
            columns={HISTORY_COLUMNS}
            dataSource={state.data.history}
            pagination={state.data.history.length > 10 ? { pageSize: 10, size: 'small' } : false}
            locale={{ emptyText: 'No assignment history' }}
          />
        </>
      )}

      <AssignAssetModal
        open={assignOpen}
        employee={state.data?.employee || employee}
        onClose={() => setAssignOpen(false)}
        onDone={afterChange}
      />
      <ReturnAssetModal open={Boolean(returning)} asset={returnTarget} onClose={() => setReturning(null)} onDone={afterChange} />
    </Drawer>
  );
}
