'use client';

import { useCallback, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { Button, Card, Empty, Input, Table, Tooltip, Typography } from 'antd';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { navigate } from '@/lib/navigation';
import ErrorState from '@/components/ErrorState';
import DataLoader from '@/components/DataLoader';
import CategoryFormModal from '@/components/categories/CategoryFormModal';
import useCategories from '@/hooks/useCategories';
import { ASSET_DEFAULT_QUERY, setAssetQuery } from '@/store/assetsSlice';

const CLOSED_MODAL = { open: false, category: null };
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

/** Asset categories: add and rename. Categories can't be deleted. */
export default function CategoriesView() {
  const dispatch = useDispatch();
  const { items, loading, loaded, error, refetch } = useCategories();
  const [modalState, setModalState] = useState(CLOSED_MODAL);
  const [searchText, setSearchText] = useState('');

  const openCreate = useCallback(() => setModalState({ open: true, category: null }), []);
  const openEdit = useCallback((category) => setModalState({ open: true, category }), []);
  const closeModal = useCallback(() => setModalState(CLOSED_MODAL), []);
  const handleSaved = useCallback(() => {
    setModalState(CLOSED_MODAL);
    refetch();
  }, [refetch]);

  // Open the Assets list filtered to this category.
  const showAssets = useCallback(
    (category) => {
      dispatch(setAssetQuery({ ...ASSET_DEFAULT_QUERY, categoryId: category._id }));
      navigate('/assets');
    },
    [dispatch]
  );

  const filtered = useMemo(() => {
    const text = searchText.trim().toLowerCase();
    return text ? items.filter((c) => c.name.toLowerCase().includes(text)) : items;
  }, [items, searchText]);

  const columns = useMemo(
    () => [
      {
        title: 'Category',
        dataIndex: 'name',
        key: 'name',
        sorter: byName,
        defaultSortOrder: 'ascend',
        render: (v) => <Typography.Text strong>{v}</Typography.Text>,
      },
      {
        title: 'Assets',
        dataIndex: 'assetCount',
        key: 'assetCount',
        width: 120,
        align: 'center',
        sorter: (a, b) => a.assetCount - b.assetCount,
        render: (count, record) =>
          count ? (
            <Button type="link" size="small" onClick={() => showAssets(record)} aria-label={`Show ${record.name} assets`}>
              {count}
            </Button>
          ) : (
            <span className="muted">0</span>
          ),
      },
      {
        title: 'Actions',
        key: 'actions',
        width: 90,
        render: (_, record) => (
          <Tooltip title="Rename">
            <Button type="text" icon={<EditOutlined />} aria-label={`Rename ${record.name}`} onClick={() => openEdit(record)} />
          </Tooltip>
        ),
      },
    ],
    [openEdit, showAssets]
  );

  const emptyText = !loaded ? (
    ' '
  ) : searchText ? (
    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`No category matches "${searchText}"`}>
      <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
        Add a category
      </Button>
    </Empty>
  ) : (
    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No categories yet">
      <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
        Add your first category
      </Button>
    </Empty>
  );

  return (
    <>
      <div className="page-header">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            Categories
          </Typography.Title>
          <Typography.Text type="secondary">
            Add and rename the categories assets are grouped under. Categories can&apos;t be deleted.
          </Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          Add Category
        </Button>
      </div>

      <Card>
        <div className="filters">
          <Input.Search
            placeholder="Search categories…"
            allowClear
            value={searchText}
            maxLength={60}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>

        {error && <ErrorState message={error} onRetry={refetch} retrying={loading} />}

        {/* The search here filters the loaded list in the browser, so only loading the list shows the splash. */}
        <DataLoader ready={loaded || Boolean(error)} loading={loading}>
          <Table
            rowKey="_id"
            columns={columns}
            dataSource={filtered}
            pagination={{ pageSize: 20, hideOnSinglePage: true, showTotal: (t) => `${t} categories` }}
            locale={{ emptyText }}
            scroll={{ x: 380 }}
            showSorterTooltip={false}
          />
        </DataLoader>
      </Card>

      <CategoryFormModal
        open={modalState.open}
        category={modalState.category}
        existing={items}
        onClose={closeModal}
        onSaved={handleSaved}
      />
    </>
  );
}
