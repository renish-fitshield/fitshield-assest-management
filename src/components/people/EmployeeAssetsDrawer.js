'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { Button, Divider, Drawer, Empty, List, Skeleton, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { PlusOutlined, RollbackOutlined, SwapOutlined } from '@ant-design/icons';
import StatusTag from '@/components/StatusTag';
import ErrorState from '@/components/ErrorState';
import AssetImage from '@/components/assets/AssetImage';
import AssignmentModal from '@/components/assets/AssignmentModal';
import { isReturnOverdue } from '@/lib/constants';
import { formatDate, formatDateTime } from '@/lib/format';
import { fetchEmployeeAssets } from '@/store/employeesSlice';

const holderText = (h) => (h ? `${h.fullName}${h.employeeId ? ` (${h.employeeId})` : ''}` : 'someone');

const AckTag = ({ ack }) => (
  <Tooltip title={ack.status === 'Acknowledged' ? `Acknowledged on ${formatDateTime(ack.acknowledgedAt)}` : 'Not acknowledged yet'}>
    <Tag color={ack.status === 'Acknowledged' ? 'green' : 'gold'} style={{ marginTop: 2 }}>
      {ack.status === 'Acknowledged' ? 'Acknowledged' : 'Ack pending'}
    </Tag>
  </Tooltip>
);

const HISTORY_COLUMNS = [
  {
    title: 'Asset',
    key: 'asset',
    render: (_, p) => (
      <div>
        <Typography.Text>{p.asset.itemName}</Typography.Text>
        <div className="muted">
          {p.asset.assetId}
          {p.asset.category ? ` · ${p.asset.category}` : ''}
        </div>
      </div>
    ),
  },
  {
    title: 'Received',
    key: 'startedAt',
    width: 190,
    render: (_, p) => (
      <div>
        {formatDate(p.startedAt)}
        <div className="muted">
          {p.receivedFrom ? `from ${holderText(p.receivedFrom)}` : 'assigned'}
          {p.assignedBy?.name ? ` · by ${p.assignedBy.name}` : ''}
        </div>
        {p.receiptAck && <AckTag ack={p.receiptAck} />}
      </div>
    ),
  },
  {
    title: 'Ended',
    key: 'endedAt',
    width: 210,
    render: (_, p) =>
      p.current ? (
        <Tag color="green">Still has it</Tag>
      ) : (
        <div>
          {formatDate(p.endedAt)}
          <div className="muted">
            {p.endAction === 'Transferred'
              ? `transferred to ${holderText(p.transferredTo)}`
              : `returned${p.returnCondition ? ` · ${p.returnCondition}` : ''}${p.statusAfter ? ` · now ${p.statusAfter}` : ''}`}
            {p.endedBy?.name ? ` · by ${p.endedBy.name}` : ''}
          </div>
          {p.returnAck && <AckTag ack={p.returnAck} />}
        </div>
      ),
  },
];

/**
 * Everything an employee holds and has held: assign more (one employee can hold many), transfer
 * or return what they have, and see every period they had an asset.
 */
export default function EmployeeAssetsDrawer({ employee, onClose, onChanged }) {
  const dispatch = useDispatch();
  const [state, setState] = useState({ loading: false, error: null, data: null });
  const [reloadKey, setReloadKey] = useState(0);
  const [handOver, setHandOver] = useState(null); // { mode, asset? }

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
    setHandOver(null);
    reload();
    onChanged?.();
  }, [reload, onChanged]);

  const person = state.data?.employee || employee;
  const current = state.data?.current || [];
  const exited = person?.status === 'Exited';
  // The assignment modal needs the asset's holder; here it's always this employee.
  const withHolder = useCallback((a) => ({ ...a, assignedTo: person }), [person]);
  const modalAsset = useMemo(() => (handOver?.asset ? withHolder(handOver.asset) : null), [handOver, withHolder]);

  return (
    <Drawer
      open={Boolean(employee)}
      onClose={onClose}
      width={680}
      destroyOnHidden
      title={employee ? `${employee.fullName} · ${employee.employeeId}` : ''}
      extra={
        <Tooltip title={exited ? 'Exited employees cannot be given assets' : ''}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={exited || !state.data}
            onClick={() => setHandOver({ mode: 'assign', asset: null })}
          >
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
            Currently holding <span className="muted">({current.length})</span>
          </Typography.Title>
          <List
            loading={state.loading}
            dataSource={current}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No assets right now" /> }}
            renderItem={(a) => (
              <List.Item
                actions={[
                  <Tooltip key="transfer" title="Hand it straight to another employee">
                    <Button size="small" icon={<SwapOutlined />} onClick={() => setHandOver({ mode: 'transfer', asset: a })}>
                      Transfer
                    </Button>
                  </Tooltip>,
                  <Button key="return" size="small" icon={<RollbackOutlined />} onClick={() => setHandOver({ mode: 'return', asset: a })}>
                    Return
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  avatar={<AssetImage assetId={a._id} image={a.image} size={44} />}
                  title={
                    <Space size={6} wrap>
                      <span>{a.itemName}</span>
                      <StatusTag value={a.condition} />
                      {isReturnOverdue(withHolder(a)) && <Tag color="red">Overdue</Tag>}
                      {a.acknowledgement && (
                        <Tag color={a.acknowledgement.status === 'Acknowledged' ? 'green' : 'gold'}>
                          {a.acknowledgement.status === 'Acknowledged' ? 'Acknowledged' : 'Ack pending'}
                        </Tag>
                      )}
                    </Space>
                  }
                  description={
                    <>
                      {a.assetId} · {a.category}
                      {a.serialNumber ? ` · ${a.serialNumber}` : ''}
                      <br />
                      Since {formatDate(a.assignedAt)}
                      {a.expectedReturnAt ? ` · due back ${formatDate(a.expectedReturnAt)}` : ''}
                    </>
                  }
                />
              </List.Item>
            )}
          />

          <Divider orientation="left">Assignment history</Divider>
          <Table
            size="small"
            rowKey="key"
            columns={HISTORY_COLUMNS}
            dataSource={state.data.history}
            pagination={state.data.history.length > 10 ? { pageSize: 10, size: 'small' } : false}
            locale={{ emptyText: 'Never held an asset' }}
            scroll={{ x: 560 }}
          />
        </>
      )}

      <AssignmentModal
        open={Boolean(handOver)}
        mode={handOver?.mode}
        asset={modalAsset}
        employee={handOver?.mode === 'assign' ? person : undefined}
        onClose={() => setHandOver(null)}
        onDone={afterChange}
      />
    </Drawer>
  );
}
