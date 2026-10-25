'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { App, Button, Descriptions, Drawer, Skeleton, Space, Tabs, Tag, Tooltip, Typography } from 'antd';
import { MailOutlined, RollbackOutlined, SwapOutlined, UserAddOutlined } from '@ant-design/icons';
import StatusTag from '@/components/StatusTag';
import ErrorState from '@/components/ErrorState';
import AssetImage from '@/components/assets/AssetImage';
import AssetBillLink from '@/components/assets/AssetBillLink';
import CompactCurrency from '@/components/CompactCurrency';
import { ActivityTimeline, AssignmentTimeline } from '@/components/assets/AssetHistory';
import { reportResend } from '@/components/assets/AssignmentModal';
import { formatDate, formatDateTime } from '@/lib/format';
import { isReturnOverdue, isSingleUnit } from '@/lib/constants';
import { fetchAssetHistory, resendAckEmail } from '@/store/assetsSlice';

const EMPTY_HISTORY = { loading: false, error: null, data: null };

/** Who has the asset, whether they've acknowledged it, and the hand-over actions that make sense now. */
function HolderCard({ asset, onAction, onResend, resending }) {
  const holder = asset.assignedTo;
  if (holder) {
    const overdue = isReturnOverdue(asset);
    const ack = asset.acknowledgement;
    return (
      <div className="assign-summary" style={{ margin: '0 0 16px', alignItems: 'flex-start', flexDirection: 'column', gap: 8 }}>
        <div>
          With <strong>{holder.fullName}</strong> <span className="muted">({holder.employeeId})</span>
          <div className="muted">
            Since {formatDate(asset.assignedAt)}
            {asset.expectedReturnAt && <> · due back {formatDate(asset.expectedReturnAt)}</>}
            {overdue && (
              <Tag color="red" style={{ marginLeft: 6 }}>
                Overdue
              </Tag>
            )}
          </div>
          {ack && (
            <div className="ack-line" style={{ marginTop: 6 }}>
              <span>Acknowledgement</span> <StatusTag value={ack.status} />
              {ack.status === 'Acknowledged' ? (
                <span className="muted">on {formatDateTime(ack.acknowledgedAt)}</span>
              ) : (
                <Button
                  size="small"
                  type="link"
                  icon={<MailOutlined />}
                  loading={resending === `${ack.eventId}:to`}
                  onClick={() => onResend?.(ack.eventId, 'to')}
                  style={{ paddingInline: 4 }}
                >
                  Resend email
                </Button>
              )}
            </div>
          )}
        </div>
        <Space wrap>
          <Button size="small" icon={<SwapOutlined />} onClick={() => onAction?.('transfer', asset)}>
            Transfer
          </Button>
          <Button size="small" icon={<RollbackOutlined />} onClick={() => onAction?.('return', asset)}>
            Return
          </Button>
        </Space>
      </div>
    );
  }
  const blocked = !isSingleUnit(asset)
    ? `This asset has a quantity of ${asset.quantity}. Only assets with quantity 1 can be assigned.`
    : asset.status !== 'Available'
      ? `Only Available assets can be assigned — this one is ${asset.status}.`
      : null;
  return (
    <div className="assign-summary" style={{ margin: '0 0 16px', justifyContent: 'space-between' }}>
      <span className="muted" style={{ fontSize: 14 }}>
        Not assigned to anyone
      </span>
      <Tooltip title={blocked}>
        <Button size="small" type="primary" icon={<UserAddOutlined />} disabled={Boolean(blocked)} onClick={() => onAction?.('assign', asset)}>
          Assign
        </Button>
      </Tooltip>
    </div>
  );
}

/**
 * Asset details with its assignment history and activity log.
 * `onAction(mode, asset)` opens the assign / transfer / return modal.
 */
export default function AssetDetailsDrawer({ asset, onClose, onAction }) {
  const dispatch = useDispatch();
  const { message } = App.useApp();
  const [history, setHistory] = useState(EMPTY_HISTORY);
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState('details');
  const [resending, setResending] = useState(null); // "eventId:side"

  const resend = useCallback(
    async (eventId, side) => {
      setResending(`${eventId}:${side}`);
      try {
        const result = await dispatch(resendAckEmail({ id: asset._id, eventId, side })).unwrap();
        reportResend(message, result);
      } catch (err) {
        message.error(err?.message || "The email couldn't be sent");
      } finally {
        setResending(null);
        setReloadKey((k) => k + 1); // show the new delivery status
      }
    },
    [dispatch, asset?._id, message]
  );

  useEffect(() => {
    if (!asset?._id) setTab('details');
  }, [asset?._id]);

  // Reloaded whenever the asset changes (an assign/return from the drawer updates `updatedAt`).
  useEffect(() => {
    if (!asset?._id) {
      setHistory(EMPTY_HISTORY);
      return undefined;
    }
    const id = asset._id;
    const promise = dispatch(fetchAssetHistory(id));
    // Keep showing this asset's history while it reloads, but never another asset's.
    setHistory((h) => ({ loading: true, error: null, data: h.assetId === id ? h.data : null, assetId: id }));
    (async () => {
      try {
        const data = await promise.unwrap();
        setHistory({ loading: false, error: null, data, assetId: id });
      } catch (err) {
        if (err?.name === 'AbortError') return;
        setHistory({ loading: false, error: err?.message || 'Failed to load history', data: null, assetId: id });
      }
    })();
    return () => promise.abort();
  }, [asset?._id, asset?.updatedAt, reloadKey, dispatch]);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  const details = useMemo(
    () =>
      asset
        ? [
            ['Asset ID', asset.assetId],
            ['Category', asset.category],
            ['Quantity', asset.quantity ?? 1],
            ['Brand', asset.brand],
            ['Model Name', asset.modelName],
            ['Serial Number', asset.serialNumber],
            ['Specifications', asset.specifications],
            ['Asset Location', asset.location],
            ['Condition', <StatusTag key="c" value={asset.condition} />],
            ['Asset Status', <StatusTag key="s" value={asset.status} />],
            ['Purchase Date', formatDate(asset.purchaseDate)],
            ['Cost', <CompactCurrency key="cost" value={asset.cost} />],
            ['Vendor Name', asset.vendorName],
            ['Invoice Number', asset.invoiceNumber],
            ['Warranty Until', formatDate(asset.warrantyUntil)],
            ['Warranty Status', <StatusTag key="w" value={asset.warrantyStatus} />],
            ['Purchase City', asset.purchaseCity],
            ['Purchase Type', asset.purchaseType],
            ['Purchased By', asset.purchasedBy],
            ['Bill / Invoice', asset.bill ? <AssetBillLink key="b" assetId={asset._id} bill={asset.bill} /> : null],
            ['Remarks', asset.remarks],
            ['Created At', formatDateTime(asset.createdAt)],
            ['Updated At', formatDateTime(asset.updatedAt)],
          ].map(([label, value]) => ({ key: label, label, children: value || '—' }))
        : [],
    [asset]
  );

  const historyBody = (render) =>
    history.error ? (
      <ErrorState message={history.error} onRetry={retry} />
    ) : !history.data ? (
      <Skeleton active paragraph={{ rows: 4 }} />
    ) : (
      render(history.data)
    );

  const count = (list) => (history.data ? ` (${list.length})` : '');

  return (
    <Drawer open={Boolean(asset)} onClose={onClose} title={asset?.itemName} width={600} destroyOnHidden>
      {asset && (
        <>
          <Space align="start" size={16} style={{ marginBottom: 16 }}>
            <AssetImage assetId={asset._id} image={asset.image} size={96} radius={14} />
            <div>
              <Typography.Title level={5} style={{ margin: 0 }}>
                {asset.itemName}
              </Typography.Title>
              <div className="muted" style={{ marginBottom: 8 }}>
                {asset.assetId} · {asset.category}
              </div>
              <Space size={4} wrap>
                <StatusTag value={asset.status} />
                <StatusTag value={asset.condition} />
              </Space>
            </div>
          </Space>

          <HolderCard asset={asset} onAction={onAction} onResend={resend} resending={resending} />

          <Tabs
            activeKey={tab}
            onChange={setTab}
            items={[
              { key: 'details', label: 'Details', children: <Descriptions column={1} bordered size="small" items={details} /> },
              {
                key: 'assignments',
                label: `Assignment history${count(history.data?.assignmentHistory || [])}`,
                children: historyBody((d) => (
                  <AssignmentTimeline
                    items={d.assignmentHistory}
                    currentHolderId={asset.assignedTo?._id}
                    onResend={resend}
                    resending={resending}
                  />
                )),
              },
              {
                key: 'activity',
                label: `Activity${count(history.data?.activities || [])}`,
                children: historyBody((d) => <ActivityTimeline items={d.activities} createdAt={d.createdAt} />),
              },
            ]}
          />
        </>
      )}
    </Drawer>
  );
}
