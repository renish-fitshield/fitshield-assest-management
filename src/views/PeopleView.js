'use client';

import { useCallback, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { App, Button, Card, Empty, Input, Select, Space, Table, Tooltip, Typography } from 'antd';
import { ClearOutlined, DeleteOutlined, EditOutlined, LaptopOutlined, PlusOutlined } from '@ant-design/icons';
import EmployeeAssetsDrawer from '@/components/people/EmployeeAssetsDrawer';
import { DEPARTMENTS, WORK_TYPES, EMPLOYEE_STATUSES } from '@/lib/constants';
import { formatDate } from '@/lib/format';
import StatusTag from '@/components/StatusTag';
import ErrorState from '@/components/ErrorState';
import EmployeeFormModal from '@/components/people/EmployeeFormModal';
import useServerTable, { PAGE_SIZE_OPTIONS } from '@/hooks/useServerTable';
import {
  fetchEmployees,
  deleteEmployee,
  setEmployeeQuery,
  resetEmployeeFilters,
  EMPLOYEE_FILTER_KEYS,
} from '@/store/employeesSlice';

const toOptions = (list) => list.map((v) => ({ label: v, value: v }));
const DEPARTMENT_OPTIONS = toOptions(DEPARTMENTS);
const WORK_TYPE_OPTIONS = toOptions(WORK_TYPES);
const STATUS_OPTIONS = toOptions(EMPLOYEE_STATUSES);
const CLOSED_MODAL = { open: false, employeeId: null };

export default function PeopleView() {
  const dispatch = useDispatch();
  const { modal, message } = App.useApp();
  const { items, totalCount, query, loading, loaded, error } = useSelector((s) => s.employees);
  const [modalState, setModalState] = useState(CLOSED_MODAL);
  const [assetsOf, setAssetsOf] = useState(null);

  const {
    refetch,
    setFilter,
    onTableChange,
    sortOrderFor,
    activeFilterCount,
    searchText,
    setSearchText,
    submitSearch,
  } = useServerTable({
    query,
    fetchThunk: fetchEmployees,
    setQueryAction: setEmployeeQuery,
    filterKeys: EMPLOYEE_FILTER_KEYS,
  });

  const clearFilters = useCallback(() => dispatch(resetEmployeeFilters()), [dispatch]);
  const openCreate = useCallback(() => setModalState({ open: true, employeeId: null }), []);
  const openEdit = useCallback((record) => setModalState({ open: true, employeeId: record._id }), []);
  const closeModal = useCallback(() => setModalState(CLOSED_MODAL), []);

  const handleSaved = useCallback(() => {
    setModalState(CLOSED_MODAL);
    refetch();
  }, [refetch]);

  const confirmDelete = useCallback(
    (employee) => {
      modal.confirm({
        title: 'Are you sure you want to delete this employee?',
        content: `${employee.employeeId} · ${employee.fullName} will be permanently deleted. Assets purchased by them will no longer show a purchaser.`,
        okText: 'Yes, delete',
        okType: 'danger',
        cancelText: 'Cancel',
        onOk: async () => {
          try {
            const result = await dispatch(deleteEmployee(employee._id)).unwrap();
            message.success(result.message || 'Employee deleted');
            refetch();
          } catch (err) {
            message.error(err?.message || 'Failed to delete employee');
          }
        },
      });
    },
    [modal, dispatch, message, refetch]
  );

  const columns = useMemo(
    () => [
      { title: 'Employee ID', dataIndex: 'employeeId', key: 'employeeId', width: 130, fixed: 'left', sorter: true, sortOrder: sortOrderFor('employeeId') },
      {
        title: 'Name',
        dataIndex: 'fullName',
        key: 'fullName',
        width: 260,
        sorter: true,
        sortOrder: sortOrderFor('fullName'),
        render: (_, r) => (
          <div>
            <Typography.Text strong>{r.fullName}</Typography.Text>
            <div className="muted">{r.workEmail}</div>
          </div>
        ),
      },
      { title: 'Department', dataIndex: 'department', key: 'department', width: 160, sorter: true, sortOrder: sortOrderFor('department') },
      { title: 'Designation', dataIndex: 'designation', key: 'designation', width: 180, sorter: true, sortOrder: sortOrderFor('designation'), render: (v) => v || '—' },
      { title: 'Work Type', dataIndex: 'workType', key: 'workType', width: 120, sorter: true, sortOrder: sortOrderFor('workType') },
      { title: 'Location', dataIndex: 'location', key: 'location', width: 130, sorter: true, sortOrder: sortOrderFor('location'), render: (v) => v || '—' },
      { title: 'Joining Date', dataIndex: 'joiningDate', key: 'joiningDate', width: 140, sorter: true, sortOrder: sortOrderFor('joiningDate'), render: formatDate },
      { title: 'Status', dataIndex: 'status', key: 'status', width: 115, sorter: true, sortOrder: sortOrderFor('status'), render: (v) => <StatusTag value={v} /> },
      { title: 'Contact', dataIndex: 'contactNumber', key: 'contactNumber', width: 150, render: (v) => v || '—' },
      {
        title: 'Assets',
        dataIndex: 'assignedAssetCount',
        key: 'assignedAssetCount',
        width: 110,
        align: 'center',
        render: (count, record) => (
          <Button
            size="small"
            type={count ? 'default' : 'dashed'}
            icon={<LaptopOutlined />}
            onClick={() => setAssetsOf(record)}
            aria-label={`Assets of ${record.fullName}`}
          >
            {count ?? 0}
          </Button>
        ),
      },
      {
        title: 'Actions',
        key: 'actions',
        width: 100,
        fixed: 'right',
        render: (_, record) => (
          <Space size={4}>
            <Tooltip title="Edit">
              <Button type="text" icon={<EditOutlined />} aria-label="Edit employee" onClick={() => openEdit(record)} />
            </Tooltip>
            <Tooltip title={record.assignedAssetCount ? 'Return their assets before deleting' : 'Delete'}>
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                aria-label="Delete employee"
                disabled={Boolean(record.assignedAssetCount)}
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
      showTotal: (t, [from, to]) => `${from}–${to} of ${t} employees`,
      disabled: loading,
    }),
    [query.page, query.perPageData, totalCount, loading]
  );

  const emptyText = useMemo(
    () =>
      !loaded ? (
        ' '
      ) : activeFilterCount ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No employees match your search or filters">
          <Button onClick={clearFilters} icon={<ClearOutlined />}>
            Clear filters
          </Button>
        </Empty>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No employees yet">
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Add your first employee
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
            People
          </Typography.Title>
          <Typography.Text type="secondary">Manage employees and the assets assigned to them</Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          Add Employee
        </Button>
      </div>

      <Card>
        <div className="filters">
          <Input.Search
            placeholder="Search ID, name, email, designation…"
            allowClear
            value={searchText}
            maxLength={100}
            loading={loading && Boolean(searchText)}
            onChange={(e) => setSearchText(e.target.value)}
            onSearch={submitSearch}
          />
          <Select placeholder="Department" allowClear showSearch value={query.department} options={DEPARTMENT_OPTIONS} onChange={(v) => setFilter({ department: v ?? null })} />
          <Select placeholder="Work Type" allowClear value={query.workType} options={WORK_TYPE_OPTIONS} onChange={(v) => setFilter({ workType: v ?? null })} />
          <Select placeholder="Status" allowClear value={query.status} options={STATUS_OPTIONS} onChange={(v) => setFilter({ status: v ?? null })} />
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
          loading={{ spinning: loading, tip: 'Loading employees…' }}
          scroll={{ x: 1610 }}
          pagination={pagination}
          onChange={onTableChange}
          locale={{ emptyText }}
          showSorterTooltip={false}
        />
      </Card>

      <EmployeeFormModal open={modalState.open} employeeId={modalState.employeeId} onClose={closeModal} onSaved={handleSaved} />
      <EmployeeAssetsDrawer employee={assetsOf} onClose={() => setAssetsOf(null)} onChanged={refetch} />
    </>
  );
}
