'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import dayjs from 'dayjs';
import { Alert, App, Button, DatePicker, Descriptions, Form, Input, Modal, Select, Spin } from 'antd';
import { toDayjs } from '@/lib/format';
import { applyServerErrors, maxLen, validateOrScroll } from '@/lib/forms';
import { assignAsset, searchAssignableAssets } from '@/store/assetsSlice';
import { fetchEmployeeOptions } from '@/store/employeesSlice';

const SEARCH_DELAY_MS = 350;

/**
 * Assign an asset to an employee. Two entry points:
 *  - from an asset (pass `asset`)       → pick the employee
 *  - from an employee (pass `employee`) → pick an Available asset (searched on the server)
 */
export default function AssignAssetModal({ open, asset, employee, onClose, onDone }) {
  const [form] = Form.useForm();
  const dispatch = useDispatch();
  const { message } = App.useApp();
  const saving = useSelector((s) => s.assets.saving);
  const { options: employees, optionsLoading, optionsError } = useSelector((s) => s.employees);
  const pickAsset = !asset;

  // ---- employee options (asset → employee mode)
  const loadEmployees = useCallback(() => dispatch(fetchEmployeeOptions()), [dispatch]);
  useEffect(() => {
    if (!open || pickAsset) return undefined;
    const p = loadEmployees();
    return () => p.abort();
  }, [open, pickAsset, loadEmployees]);

  const employeeOptions = useMemo(
    () =>
      employees.map((e) => ({
        value: e._id,
        label: `${e.fullName} (${e.employeeId})${e.status === 'Exited' ? ' · Exited' : e.status === 'On Notice' ? ' · On notice' : ''}`,
        disabled: e.status === 'Exited',
      })),
    [employees]
  );

  // ---- available-asset search (employee → asset mode); server-side, latest request wins
  const [assetSearch, setAssetSearch] = useState({ loading: false, error: null, items: [] });
  const searchRef = useRef({ timer: null, promise: null });

  const runAssetSearch = useCallback(
    (text) => {
      clearTimeout(searchRef.current.timer);
      searchRef.current.timer = setTimeout(async () => {
        searchRef.current.promise?.abort();
        const promise = dispatch(searchAssignableAssets(text.trim()));
        searchRef.current.promise = promise;
        setAssetSearch((s) => ({ ...s, loading: true, error: null }));
        try {
          const { items } = await promise.unwrap();
          setAssetSearch({ loading: false, error: null, items });
        } catch (err) {
          if (err?.name === 'AbortError') return;
          setAssetSearch({ loading: false, error: err?.message || 'Search failed', items: [] });
        }
      }, SEARCH_DELAY_MS);
    },
    [dispatch]
  );

  useEffect(() => {
    if (!open || !pickAsset) return undefined;
    runAssetSearch('');
    const ref = searchRef.current;
    return () => {
      clearTimeout(ref.timer);
      ref.promise?.abort();
    };
  }, [open, pickAsset, runAssetSearch]);

  const assetOptions = useMemo(
    () =>
      assetSearch.items.map((a) => ({
        value: a._id,
        label: `${a.assetId} · ${a.itemName}${a.serialNumber ? ` · ${a.serialNumber}` : ''}`,
        purchaseDate: a.purchaseDate,
      })),
    [assetSearch.items]
  );

  const selectedAssetId = Form.useWatch('assetId', form);
  const purchaseDate = useMemo(() => {
    if (asset) return asset.purchaseDate;
    return assetSearch.items.find((a) => a._id === selectedAssetId)?.purchaseDate;
  }, [asset, assetSearch.items, selectedAssetId]);

  const disabledDate = useCallback(
    (d) => d.isAfter(dayjs().endOf('day')) || (purchaseDate ? d.isBefore(toDayjs(purchaseDate), 'day') : false),
    [purchaseDate]
  );

  const handleSubmit = useCallback(async () => {
    const values = await validateOrScroll(form);
    if (!values) return;
    const assetId = asset?._id ?? values.assetId;
    try {
      const result = await dispatch(
        assignAsset({
          id: assetId,
          data: {
            employeeId: employee?._id ?? values.employeeId,
            assignedAt: values.assignedAt.format('YYYY-MM-DD'),
            notes: values.notes || undefined,
          },
        })
      ).unwrap();
      message.success(result.message || 'Asset assigned');
      onDone?.(result.item);
    } catch (err) {
      const inline = applyServerErrors(form, err);
      message.error(inline ? 'Please fix the highlighted fields' : err?.message || 'Failed to assign asset');
    }
  }, [form, asset, employee, dispatch, message, onDone]);

  return (
    <Modal
      open={open}
      title="Assign asset"
      okText="Assign"
      onOk={handleSubmit}
      onCancel={() => !saving && onClose?.()}
      confirmLoading={saving}
      cancelButtonProps={{ disabled: saving }}
      closable={!saving}
      keyboard={!saving}
      maskClosable={false}
      destroyOnHidden
      width={560}
    >
      <Descriptions size="small" column={1} bordered style={{ margin: '12px 0 16px' }}>
        {asset && <Descriptions.Item label="Asset">{`${asset.assetId} · ${asset.itemName}`}</Descriptions.Item>}
        {employee && (
          <Descriptions.Item label="Employee">{`${employee.fullName} (${employee.employeeId})`}</Descriptions.Item>
        )}
      </Descriptions>

      <Form
        form={form}
        layout="vertical"
        preserve={false}
        disabled={saving}
        initialValues={{ assignedAt: dayjs() }}
      >
        {pickAsset ? (
          <Form.Item
            label="Asset"
            name="assetId"
            rules={[{ required: true, message: 'Select an asset' }]}
            extra="Only Available assets can be assigned."
            validateStatus={assetSearch.error ? 'warning' : undefined}
            help={
              assetSearch.error ? (
                <span>
                  {assetSearch.error}{' '}
                  <Button type="link" size="small" style={{ padding: 0 }} onClick={() => runAssetSearch('')}>
                    Retry
                  </Button>
                </span>
              ) : undefined
            }
          >
            <Select
              showSearch
              placeholder="Search by asset ID, name or serial…"
              filterOption={false}
              onSearch={runAssetSearch}
              options={assetOptions}
              loading={assetSearch.loading}
              notFoundContent={assetSearch.loading ? <Spin size="small" /> : 'No available assets found'}
            />
          </Form.Item>
        ) : (
          <Form.Item
            label="Employee"
            name="employeeId"
            rules={[{ required: true, message: 'Select an employee' }]}
            validateStatus={optionsError ? 'warning' : undefined}
            help={
              optionsError ? (
                <span>
                  Couldn&apos;t load employees.{' '}
                  <Button type="link" size="small" style={{ padding: 0 }} onClick={loadEmployees}>
                    Retry
                  </Button>
                </span>
              ) : undefined
            }
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder={optionsLoading ? 'Loading employees…' : 'Select employee'}
              loading={optionsLoading}
              options={employeeOptions}
              notFoundContent={optionsLoading ? <Spin size="small" /> : 'No employees found'}
            />
          </Form.Item>
        )}

        <Form.Item
          label="Assignment date"
          name="assignedAt"
          rules={[{ required: true, message: 'Select the assignment date' }]}
          tooltip="Cannot be in the future or before the purchase date"
        >
          <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={disabledDate} allowClear={false} />
        </Form.Item>

        <Form.Item label="Notes" name="notes" rules={[maxLen(500)]}>
          <Input.TextArea rows={2} maxLength={500} showCount placeholder="e.g. Handed over with charger and bag" />
        </Form.Item>
      </Form>

      {pickAsset && !assetSearch.loading && !assetSearch.error && assetSearch.items.length === 0 && (
        <Alert type="info" showIcon message="There are no Available assets to assign right now." />
      )}
    </Modal>
  );
}
