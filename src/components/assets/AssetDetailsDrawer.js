'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { Button, Descriptions, Divider, Drawer, Empty, Skeleton, Space, Tag, Timeline, Typography } from 'antd';
import { RollbackOutlined, UserAddOutlined } from '@ant-design/icons';
import StatusTag from '@/components/StatusTag';
import ErrorState from '@/components/ErrorState';
import AssetImage from '@/components/assets/AssetImage';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format';
import { fetchAssetAssignments } from '@/store/assetsSlice';

function HistoryItem({ entry }) {
  const who = entry.employee ? `${entry.employee.fullName} (${entry.employee.employeeId})` : 'Deleted employee';
  return (
    <div>
      <Typography.Text strong>{who}</Typography.Text>
      {entry.active && (
        <Tag color="blue" style={{ marginLeft: 8 }}>
          Current
        </Tag>
      )}
      <div className="muted" style={{ fontSize: 13 }}>
        {formatDate(entry.assignedAt)} → {entry.returnedAt ? formatDate(entry.returnedAt) : 'now'}
        {entry.assignedBy?.name ? ` · assigned by ${entry.assignedBy.name}` : ''}
      </div>
      {entry.notes && <div style={{ fontSize: 13 }}>Note: {entry.notes}</div>}
      {entry.returnedAt && (
        <div style={{ fontSize: 13 }}>
          Returned in <StatusTag value={entry.conditionAtReturn} /> condition
          {entry.returnNotes ? ` — ${entry.returnNotes}` : ''}
        </div>
      )}
    </div>
  );
}

export default function AssetDetailsDrawer({ asset, onClose, onAssign, onReturn }) {
  const dispatch = useDispatch();
  const [history, setHistory] = useState({ loading: false, error: null, items: [] });
  const [reloadKey, setReloadKey] = useState(0);

  // Assignment history is loaded each time the drawer opens (or the asset changes).
  useEffect(() => {
    if (!asset?._id) return undefined;
    const promise = dispatch(fetchAssetAssignments(asset._id));
    setHistory({ loading: true, error: null, items: [] });
    (async () => {
      try {
        const { items } = await promise.unwrap();
        setHistory({ loading: false, error: null, items });
      } catch (err) {
        if (err?.name === 'AbortError') return;
        setHistory({ loading: false, error: err?.message || 'Failed to load history', items: [] });
      }
    })();
    return () => promise.abort();
  }, [asset?._id, asset?.assignedTo?._id, reloadKey, dispatch]);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  const details = useMemo(
    () =>
      asset
        ? [
            ['Asset ID', asset.assetId],
            ['Category', asset.category],
            ['Brand', asset.brand],
            ['Model Name', asset.modelName],
            ['Serial Number', asset.serialNumber],
            ['Specifications', asset.specifications],
            ['Asset Location', asset.location],
            ['Condition', <StatusTag key="c" value={asset.condition} />],
            ['Asset Status', <StatusTag key="s" value={asset.status} />],
            ['Purchase Date', formatDate(asset.purchaseDate)],
            ['Cost', formatCurrency(asset.cost)],
            ['Vendor Name', asset.vendorName],
            ['Invoice Number', asset.invoiceNumber],
            ['Warranty Until', formatDate(asset.warrantyUntil)],
            ['Warranty Status', <StatusTag key="w" value={asset.warrantyStatus} />],
            ['Purchase City', asset.purchaseCity],
            ['Purchase Type', asset.purchaseType],
            ['Purchased By', asset.purchasedBy ? `${asset.purchasedBy.fullName} (${asset.purchasedBy.employeeId})` : null],
            ['Remarks', asset.remarks],
            ['Created At', formatDateTime(asset.createdAt)],
            ['Updated At', formatDateTime(asset.updatedAt)],
          ].map(([label, value]) => ({ key: label, label, children: value || '—' }))
        : [],
    [asset]
  );

  const holder = asset?.assignedTo;

  return (
    <Drawer open={Boolean(asset)} onClose={onClose} title={asset?.itemName} width={560} destroyOnHidden>
      {asset && (
        <>
          <Space align="start" size={16} style={{ marginBottom: 20 }}>
            <AssetImage assetId={asset._id} image={asset.image} size={120} radius={14} />
            <div>
              <Typography.Title level={5} style={{ margin: 0 }}>
                {asset.itemName}
              </Typography.Title>
              <div className="muted" style={{ marginBottom: 8 }}>
                {asset.assetId} · {asset.category}
              </div>
              {holder ? (
                <>
                  <div>
                    Assigned to <strong>{holder.fullName}</strong> <span className="muted">({holder.employeeId})</span>
                  </div>
                  <div className="muted">Since {formatDate(asset.assignedAt)}</div>
                  <Button size="small" icon={<RollbackOutlined />} style={{ marginTop: 8 }} onClick={() => onReturn?.(asset)}>
                    Return asset
                  </Button>
                </>
              ) : (
                <>
                  <div className="muted">Not assigned</div>
                  {asset.status === 'Available' && (
                    <Button
                      size="small"
                      type="primary"
                      icon={<UserAddOutlined />}
                      style={{ marginTop: 8 }}
                      onClick={() => onAssign?.(asset)}
                    >
                      Assign to employee
                    </Button>
                  )}
                </>
              )}
            </div>
          </Space>

          <Descriptions column={1} bordered size="small" items={details} />

          <Divider orientation="left">Assignment history</Divider>
          {history.error ? (
            <ErrorState message={history.error} onRetry={retry} />
          ) : history.loading ? (
            <Skeleton active paragraph={{ rows: 3 }} />
          ) : history.items.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Never assigned" />
          ) : (
            <Timeline
              items={history.items.map((entry) => ({
                key: entry._id,
                color: entry.active ? 'green' : 'gray',
                children: <HistoryItem entry={entry} />,
              }))}
            />
          )}
        </>
      )}
    </Drawer>
  );
}
