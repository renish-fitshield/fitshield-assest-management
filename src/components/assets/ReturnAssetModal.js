'use client';

import { useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import dayjs from 'dayjs';
import { App, DatePicker, Descriptions, Form, Input, Modal, Radio, Select } from 'antd';
import { ASSET_CONDITIONS, RETURN_STATUSES } from '@/lib/constants';
import { formatDate, toDayjs } from '@/lib/format';
import { applyServerErrors, maxLen, validateOrScroll } from '@/lib/forms';
import { returnAsset } from '@/store/assetsSlice';

const CONDITION_OPTIONS = ASSET_CONDITIONS.map((v) => ({ label: v, value: v }));

/**
 * Return an assigned asset. `asset` must include assetId, itemName, condition, assignedAt and
 * assignedTo ({ fullName, employeeId }).
 */
export default function ReturnAssetModal({ open, asset, onClose, onDone }) {
  const [form] = Form.useForm();
  const dispatch = useDispatch();
  const { message } = App.useApp();
  const saving = useSelector((s) => s.assets.saving);

  const initialValues = useMemo(
    () => ({ returnedAt: dayjs(), condition: asset?.condition, statusAfter: 'Available' }),
    [asset]
  );

  const disabledDate = useCallback(
    (d) =>
      d.isAfter(dayjs().endOf('day')) || (asset?.assignedAt ? d.isBefore(toDayjs(asset.assignedAt), 'day') : false),
    [asset]
  );

  const handleSubmit = useCallback(async () => {
    const values = await validateOrScroll(form);
    if (!values) return;
    try {
      const result = await dispatch(
        returnAsset({
          id: asset._id,
          data: {
            returnedAt: values.returnedAt.format('YYYY-MM-DD'),
            condition: values.condition,
            statusAfter: values.statusAfter,
            notes: values.notes || undefined,
          },
        })
      ).unwrap();
      message.success(result.message || 'Asset returned');
      onDone?.(result.item);
    } catch (err) {
      const inline = applyServerErrors(form, err);
      message.error(inline ? 'Please fix the highlighted fields' : err?.message || 'Failed to return asset');
    }
  }, [form, asset, dispatch, message, onDone]);

  return (
    <Modal
      open={open}
      title="Return asset"
      okText="Mark as returned"
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
      {asset && (
        <Descriptions size="small" column={1} bordered style={{ margin: '12px 0 16px' }}>
          <Descriptions.Item label="Asset">{`${asset.assetId} · ${asset.itemName}`}</Descriptions.Item>
          <Descriptions.Item label="Assigned to">
            {asset.assignedTo ? `${asset.assignedTo.fullName} (${asset.assignedTo.employeeId})` : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Since">{formatDate(asset.assignedAt)}</Descriptions.Item>
        </Descriptions>
      )}

      <Form form={form} layout="vertical" preserve={false} disabled={saving} initialValues={initialValues}>
        <Form.Item
          label="Return date"
          name="returnedAt"
          rules={[{ required: true, message: 'Select the return date' }]}
          tooltip="Cannot be in the future or before the assignment date"
        >
          <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={disabledDate} allowClear={false} />
        </Form.Item>
        <Form.Item label="Condition on return" name="condition" rules={[{ required: true, message: 'Select condition' }]}>
          <Select options={CONDITION_OPTIONS} />
        </Form.Item>
        <Form.Item label="After return the asset is" name="statusAfter">
          <Radio.Group optionType="button" buttonStyle="solid" options={RETURN_STATUSES} />
        </Form.Item>
        <Form.Item label="Notes" name="notes" rules={[maxLen(500)]}>
          <Input.TextArea rows={2} maxLength={500} showCount placeholder="e.g. Screen has a scratch" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
