'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { App, Button, Card, Empty, Input, Select, Space, Table, Tooltip, Typography } from 'antd';
import {
  ClearOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  PlusOutlined,
  RollbackOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import { ASSET_CATEGORIES, ASSET_STATUSES, ASSET_CONDITIONS, WARRANTY_STATUSES, isSingleUnit } from '@/lib/constants';
import { formatCurrency, formatDate } from '@/lib/format';
import StatusTag from '@/components/StatusTag';
import ErrorState from '@/components/ErrorState';
import AssetImage from '@/components/assets/AssetImage';
import AssetFormModal from '@/components/assets/AssetFormModal';
import AssetDetailsDrawer from '@/components/assets/AssetDetailsDrawer';
import AssetBillViewer from '@/components/assets/AssetBillViewer';
import AssignAssetModal from '@/components/assets/AssignAssetModal';
import ReturnAssetModal from '@/components/assets/ReturnAssetModal';
import useServerTable, { PAGE_SIZE_OPTIONS } from '@/hooks/useServerTable';
import { fetchAssets, deleteAsset, setAssetQuery, resetAssetFilters, ASSET_FILTER_KEYS } from '@/store/assetsSlice';
import { fetchEmployeeOptions } from '@/store/employeesSlice';

const toOptions = (list) => list.map((v) => ({ label: v, value: v }));
const CATEGORY_OPTIONS = toOptions(ASSET_CATEGORIES);
const STATUS_OPTIONS = toOptions(ASSET_STATUSES);
const CONDITION_OPTIONS = toOptions(ASSET_CONDITIONS);
const WARRANTY_OPTIONS = toOptions(WARRANTY_STATUSES);
const CLOSED_MODAL = { open: false, assetId: null };

/** Why an unassigned asset can't be assigned right now (null = it can). */
function assignBlockedReason(asset) {
  if (!isSingleUnit(asset)) {
    return `Quantity limitation: this asset has a quantity of ${asset.quantity}, so you can't assign it. Only assets with quantity 1 can be assigned.`;
  }
  if (asset.status !== 'Available') return 'Only Available assets can be assigned';
  return null;
}

export default function AssetsView() {
  const dispatch = useDispatch();
  const { modal, message } = App.useApp();
  const { items, totalCount, query, loading, loaded, error } = useSelector((s) => s.assets);
  const { options: employees, optionsLoading: employeesLoading } = useSelector((s) => s.employees);
  const [modalState, setModalState] = useState(CLOSED_MODAL);
  const [viewing, setViewing] = useState(null);
  const [assigning, setAssigning] = useState(null);
  const [returning, setReturning] = useState(null);
  const [viewingBill, setViewingBill] = useState(null); // { assetId, bill }

  // Employee list for the "Assigned to" filter.
  useEffect(() => {
    const promise = dispatch(fetchEmployeeOptions());
    return () => promise.abort();
  }, [dispatch]);

  const employeeFilterOptions = useMemo(
    () => employees.map((e) => ({ value: e._id, label: `${e.fullName} (${e.employeeId})` })),
    [employees]
  );

  const {
    refetch,
    setFilter,
    onTableChange,
    sortOrderFor,
    activeFilterCount,
    searchText,
    setSearchText,
    submitSearch,
  } = useServerTable({ query, fetchThunk: fetchAssets, setQueryAction: setAssetQuery, filterKeys: ASSET_FILTER_KEYS });

  const clearFilters = useCallback(() => dispatch(resetAssetFilters()), [dispatch]);
  const openCreate = useCallback(() => setModalState({ open: true, assetId: null }), []);
  const openEdit = useCallback((record) => setModalState({ open: true, assetId: record._id }), []);
  const closeModal = useCallback(() => setModalState(CLOSED_MODAL), []);

  const handleSaved = useCallback(() => {
    setModalState(CLOSED_MODAL);
    refetch();
  }, [refetch]);

  // After assign/return: refresh the table and keep an open details drawer in sync.
  const handleAssignmentChange = useCallback(
    (updated) => {
      setAssigning(null);
      setReturning(null);
      setViewing((v) => (v && updated && v._id === updated._id ? updated : v));
      refetch();
    },
    [refetch]
  );

  const confirmDelete = useCallback(
    (asset) => {
      modal.confirm({
        title: 'Are you sure you want to delete this asset?',
        content: `${asset.assetId} · ${asset.itemName} will be permanently deleted. This cannot be undone.`,
        okText: 'Yes, delete',
        okType: 'danger',
        cancelText: 'Cancel',
        // Returning the promise keeps the OK button spinning until the request finishes.
        onOk: async () => {
          try {
            const result = await dispatch(deleteAsset(asset._id)).unwrap();
            message.success(result.message || 'Asset deleted');
            if (viewing?._id === asset._id) setViewing(null);
            refetch(); // server clamps the page if this emptied the last one
          } catch (err) {
            message.error(err?.message || 'Failed to delete asset');
          }
        },
      });
    },
    [modal, dispatch, message, refetch, viewing]
  );

  const columns = useMemo(
    () => [
      { title: 'Asset ID', dataIndex: 'assetId', key: 'assetId', width: 200, fixed: 'left', sorter: true, sortOrder: sortOrderFor('assetId') },
      {
        title: 'Item',
        dataIndex: 'itemName',
        key: 'itemName',
        sorter: true,
        sortOrder: sortOrderFor('itemName'),
        width: 280,
        render: (_, r) => (
          <Space size={10}>
            <AssetImage assetId={r._id} image={r.image} size={40} />
            <div>
              <Typography.Text strong>{r.itemName}</Typography.Text>
              <div className="muted">{[r.brand, r.modelName].filter(Boolean).join(' · ') || '—'}</div>
            </div>
          </Space>
        ),
      },
      { title: 'Qty', dataIndex: 'quantity', key: 'quantity', width: 80, align: 'right', sorter: true, sortOrder: sortOrderFor('quantity'), render: (v) => v ?? 1 },
      { title: 'Category', dataIndex: 'category', key: 'category', width: 130, sorter: true, sortOrder: sortOrderFor('category') },
      { title: 'Serial No.', dataIndex: 'serialNumber', key: 'serialNumber', width: 140, render: (v) => v || '—' },
      { title: 'Condition', dataIndex: 'condition', key: 'condition', width: 115, sorter: true, sortOrder: sortOrderFor('condition'), render: (v) => <StatusTag value={v} /> },
      { title: 'Status', dataIndex: 'status', key: 'status', width: 125, sorter: true, sortOrder: sortOrderFor('status'), render: (v) => <StatusTag value={v} /> },
      { title: 'Warranty', dataIndex: 'warrantyStatus', key: 'warrantyUntil', width: 135, sorter: true, sortOrder: sortOrderFor('warrantyUntil'), render: (v) => <StatusTag value={v} /> },
      { title: 'Cost', dataIndex: 'cost', key: 'cost', width: 125, align: 'right', sorter: true, sortOrder: sortOrderFor('cost'), render: formatCurrency },
      { title: 'Location', dataIndex: 'location', key: 'location', width: 120, sorter: true, sortOrder: sortOrderFor('location'), render: (v) => v || '—' },
      {
        title: 'Assigned To',
        dataIndex: 'assignedTo',
        key: 'assignedAt',
        width: 190,
        sorter: true,
        sortOrder: sortOrderFor('assignedAt'),
        render: (holder, r) =>
          holder ? (
            <div>
              <Typography.Text>{holder.fullName}</Typography.Text>
              <div className="muted">
                {holder.employeeId} · since {formatDate(r.assignedAt)}
              </div>
            </div>
          ) : (
            <span className="muted">—</span>
          ),
      },
      {
        title: 'Bill',
        dataIndex: 'bill',
        key: 'bill',
        width: 100,
        align: 'center',
        // A labelled file button, so it isn't mistaken for the eye icon (view details) under Actions.
        render: (bill, r) =>
          bill ? (
            <Tooltip title={`View bill · ${bill.filename}`}>
              <Button
                size="small"
                icon={bill.contentType === 'application/pdf' ? <FilePdfOutlined /> : <FileImageOutlined />}
                aria-label="View bill"
                onClick={() => setViewingBill({ assetId: r._id, bill })}
              >
                Bill
              </Button>
            </Tooltip>
          ) : (
            <span className="muted">—</span>
          ),
      },
      {
        title: 'Actions',
        key: 'actions',
        width: 170,
        fixed: 'right',
        render: (_, record) => (
          <Space size={2}>
            <Tooltip title="View details">
              <Button type="text" icon={<EyeOutlined />} aria-label="View asset details" onClick={() => setViewing(record)} />
            </Tooltip>
            {record.assignedTo ? (
              <Tooltip title={`Return from ${record.assignedTo.fullName}`}>
                <Button type="text" icon={<RollbackOutlined />} aria-label="Return asset" onClick={() => setReturning(record)} />
              </Tooltip>
            ) : (
              <Tooltip title={assignBlockedReason(record) || 'Assign to employee'}>
                <Button
                  type="text"
                  icon={<UserAddOutlined />}
                  aria-label="Assign asset"
                  disabled={Boolean(assignBlockedReason(record))}
                  onClick={() => setAssigning(record)}
                />
              </Tooltip>
            )}
            <Tooltip title="Edit">
              <Button type="text" icon={<EditOutlined />} aria-label="Edit asset" onClick={() => openEdit(record)} />
            </Tooltip>
            <Tooltip title={record.assignedTo ? 'Return the asset before deleting' : 'Delete'}>
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                aria-label="Delete asset"
                disabled={Boolean(record.assignedTo)}
                onClick={() => confirmDelete(record)}
              />
            </Tooltip>
          </Space>
        ),
      },
    ],
    [sortOrderFor, openEdit, confirmDelete]
  );

  const pagination = useMemo(
    () => ({
      current: query.page,
      pageSize: query.perPageData,
      total: totalCount,
      showSizeChanger: true,
      pageSizeOptions: PAGE_SIZE_OPTIONS,
      showQuickJumper: totalCount > query.perPageData * 5,
      showTotal: (t, [from, to]) => `${from}–${to} of ${t} assets`,
      disabled: loading,
    }),
    [query.page, query.perPageData, totalCount, loading]
  );

  const emptyText = useMemo(
    () =>
      !loaded ? (
        ' '
      ) : activeFilterCount ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No assets match your search or filters">
          <Button onClick={clearFilters} icon={<ClearOutlined />}>
            Clear filters
          </Button>
        </Empty>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No assets yet">
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Add your first asset
          </Button>
        </Empty>
      ),
    [loaded, activeFilterCount, clearFilters, openCreate]
  );

  return (
    <>
      <div className="page-header">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            Assets
          </Typography.Title>
          <Typography.Text type="secondary">Add, assign, return and manage company assets</Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          Add Asset
        </Button>
      </div>

      <Card>
        <div className="filters">
          <Input.Search
            placeholder="Search ID, name, brand, serial…"
            allowClear
            value={searchText}
            maxLength={100}
            loading={loading && Boolean(searchText)}
            onChange={(e) => setSearchText(e.target.value)}
            onSearch={submitSearch}
          />
          <Select placeholder="Category" allowClear showSearch value={query.category} options={CATEGORY_OPTIONS} onChange={(v) => setFilter({ category: v ?? null })} />
          <Select placeholder="Status" allowClear value={query.status} options={STATUS_OPTIONS} onChange={(v) => setFilter({ status: v ?? null })} />
          <Select placeholder="Condition" allowClear value={query.condition} options={CONDITION_OPTIONS} onChange={(v) => setFilter({ condition: v ?? null })} />
          <Select placeholder="Warranty" allowClear value={query.warrantyStatus} options={WARRANTY_OPTIONS} onChange={(v) => setFilter({ warrantyStatus: v ?? null })} />
          <Select
            placeholder="Assigned to"
            allowClear
            showSearch
            optionFilterProp="label"
            style={{ minWidth: 220 }}
            loading={employeesLoading}
            value={query.assignedTo}
            options={employeeFilterOptions}
            onChange={(v) => setFilter({ assignedTo: v ?? null })}
          />
          {activeFilterCount > 0 && (
            <Button icon={<ClearOutlined />} onClick={clearFilters}>
              Clear ({activeFilterCount})
            </Button>
          )}
        </div>

        {error && <ErrorState message={error} onRetry={refetch} retrying={loading} />}

        <Table
          rowKey="_id"
          columns={columns}
          dataSource={items}
          loading={{ spinning: loading, tip: 'Loading assets…' }}
          scroll={{ x: 1960 }}
          pagination={pagination}
          onChange={onTableChange}
          locale={{ emptyText }}
          showSorterTooltip={false}
        />
      </Card>

      <AssetFormModal open={modalState.open} assetId={modalState.assetId} onClose={closeModal} onSaved={handleSaved} />
      <AssetDetailsDrawer
        asset={viewing}
        onClose={() => setViewing(null)}
        onAssign={setAssigning}
        onReturn={setReturning}
      />
      <AssetBillViewer target={viewingBill} onClose={() => setViewingBill(null)} />
      <AssignAssetModal
        open={Boolean(assigning)}
        asset={assigning}
        onClose={() => setAssigning(null)}
        onDone={handleAssignmentChange}
      />
      <ReturnAssetModal
        open={Boolean(returning)}
        asset={returning}
        onClose={() => setReturning(null)}
        onDone={handleAssignmentChange}
      />
    </>
  );
}
