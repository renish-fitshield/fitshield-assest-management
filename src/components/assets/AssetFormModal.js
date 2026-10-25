'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  App,
  AutoComplete,
  Col,
  DatePicker,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Spin,
} from 'antd';
import {
  BRANDS,
  ASSET_CONDITIONS,
  PURCHASE_TYPES,
  ASSET_STATUSES,
  MANUAL_ASSET_STATUSES,
  LOCATIONS,
  MAX_ASSET_QUANTITY,
  getWarrantyStatus,
} from '@/lib/constants';
import { toDayjs } from '@/lib/format';
import { applyServerErrors, disableFutureDates, maxLen, requiredText, trimStart, validateOrScroll } from '@/lib/forms';
import StatusTag from '@/components/StatusTag';
import ErrorState from '@/components/ErrorState';
import ResetFormOnOpen from '@/components/ResetFormOnOpen';
import AssetImageField from '@/components/assets/AssetImageField';
import AssetBillField from '@/components/assets/AssetBillField';
import { getErrorMessage } from '@/services/axios';
import { uploadInChunks } from '@/services/uploads';
import {
  createAsset,
  deleteAssetImage,
  fetchAssetById,
  fetchBrandOptions,
  updateAsset,
  uploadAssetImage,
} from '@/store/assetsSlice';
import { fetchCategories } from '@/store/categoriesSlice';

const toOptions = (list) => list.map((v) => ({ label: v, value: v }));
const DEFAULT_BRAND_OPTIONS = toOptions(BRANDS);
const CONDITION_OPTIONS = toOptions(ASSET_CONDITIONS);
// "Assigned" is only set by the Assign action; an assigned asset's status is locked until returned.
const STATUS_OPTIONS = toOptions(MANUAL_ASSET_STATUSES);
const ALL_STATUS_OPTIONS = toOptions(ASSET_STATUSES);
const NO_IMAGE_CHANGE = { file: null, remove: false };
const NO_BILL_CHANGE = { file: null, remove: false };
const PURCHASE_TYPE_OPTIONS = toOptions(PURCHASE_TYPES);
const LOCATION_OPTIONS = toOptions(LOCATIONS);
const filterAutoComplete = (input, option) => option.value.toLowerCase().includes(input.toLowerCase());
const formatCost = (v) => (v || v === 0 ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '');
const parseCost = (v) => v?.replace(/[^\d.]/g, '');

const DATE_FIELDS = ['purchaseDate', 'warrantyUntil'];
const NEW_ASSET_DEFAULTS = { quantity: 1, condition: 'New', status: 'Available' };

function toFormValues(asset) {
  if (!asset) return NEW_ASSET_DEFAULTS;
  const values = { ...asset };
  DATE_FIELDS.forEach((f) => (values[f] = toDayjs(asset[f])));
  return values;
}

function toPayload(values) {
  const payload = { ...values };
  DATE_FIELDS.forEach((f) => (payload[f] = values[f] ? values[f].format('YYYY-MM-DD') : null));
  return payload;
}

const warrantyAfterPurchase = ({ getFieldValue }) => ({
  validator(_, value) {
    const purchased = getFieldValue('purchaseDate');
    if (!value || !purchased || !value.isBefore(purchased, 'day')) return Promise.resolve();
    return Promise.reject(new Error('Warranty end date must be on or after the purchase date'));
  },
});

/**
 * Add / update asset modal.
 * In edit mode the latest copy of the asset is fetched first, so the form never edits stale data.
 */
export default function AssetFormModal({ open, assetId, onClose, onSaved }) {
  const [form] = Form.useForm();
  const dispatch = useDispatch();
  const { message } = App.useApp();
  const saving = useSelector((s) => s.assets.saving);
  const warrantyUntil = Form.useWatch('warrantyUntil', form);
  const isEdit = Boolean(assetId);

  const [record, setRecord] = useState({ loading: false, error: null, asset: null });
  const [reloadKey, setReloadKey] = useState(0);
  const [imageChange, setImageChange] = useState(NO_IMAGE_CHANGE);
  const [savingImage, setSavingImage] = useState(false);
  const [billChange, setBillChange] = useState(NO_BILL_CHANGE);
  const [billProgress, setBillProgress] = useState(null); // 0–100 while the bill uploads
  const busy = saving || savingImage || billProgress !== null;

  // Forget any picked image / bill whenever the modal opens for a different asset (or closes).
  useEffect(() => {
    setImageChange(NO_IMAGE_CHANGE);
    setBillChange(NO_BILL_CHANGE);
  }, [open, assetId]);

  // Load the record to edit (aborted if the modal closes first).
  useEffect(() => {
    if (!open || !assetId) {
      setRecord({ loading: false, error: null, asset: null });
      return undefined;
    }
    const promise = dispatch(fetchAssetById(assetId));
    setRecord({ loading: true, error: null, asset: null });
    (async () => {
      try {
        const { item } = await promise.unwrap();
        setRecord({ loading: false, error: null, asset: item });
      } catch (err) {
        if (err?.name === 'AbortError') return;
        setRecord({ loading: false, error: err?.message || 'Failed to load asset', asset: null });
      }
    })();
    return () => promise.abort();
  }, [open, assetId, reloadKey, dispatch]);

  // Brand suggestions include brands other users have added; until they load (or if that fails)
  // the built-in list is used, and any brand can still be typed.
  const [brandOptions, setBrandOptions] = useState(DEFAULT_BRAND_OPTIONS);
  useEffect(() => {
    if (!open) return undefined;
    const promise = dispatch(fetchBrandOptions());
    promise
      .unwrap()
      .then(({ items }) => setBrandOptions(toOptions(items)))
      .catch(() => {});
    return () => promise.abort();
  }, [open, dispatch]);

  // Categories are managed on the Categories page; reload them each time the form opens.
  const categories = useSelector((s) => s.categories);
  useEffect(() => {
    if (!open) return undefined;
    const promise = dispatch(fetchCategories());
    return () => promise.abort();
  }, [open, dispatch]);
  const categoryOptions = useMemo(() => {
    const options = categories.items.map((c) => ({ value: c._id, label: c.name }));
    // Until the list loads, show the asset's current category by name rather than its raw id.
    const current = record.asset;
    if (current?.categoryId && !options.some((o) => o.value === current.categoryId)) {
      options.push({ value: current.categoryId, label: current.category });
    }
    return options;
  }, [categories.items, record.asset]);

  const initialValues = useMemo(() => toFormValues(record.asset), [record.asset]);
  const warrantyStatus = useMemo(() => getWarrantyStatus(warrantyUntil?.toDate?.()), [warrantyUntil]);

  const handleSubmit = useCallback(async () => {
    const values = await validateOrScroll(form);
    if (!values) return;
    const payload = toPayload(values);

    // The bill goes up first (in pieces), then the create/update request attaches it by uploadId.
    if (billChange.file) {
      setBillProgress(0);
      try {
        payload.billUploadId = await uploadInChunks(billChange.file, { onProgress: setBillProgress });
      } catch (err) {
        message.error(`The bill couldn't be uploaded: ${getErrorMessage(err)}`);
        return;
      } finally {
        setBillProgress(null);
      }
    } else if (billChange.remove && record.asset?.bill) {
      payload.removeBill = true;
    }

    let result;
    try {
      result = await dispatch(isEdit ? updateAsset({ id: assetId, data: payload }) : createAsset(payload)).unwrap();
    } catch (err) {
      const inline = applyServerErrors(form, err);
      message.error(inline ? 'Please fix the highlighted fields' : err?.message || 'Failed to save asset');
      return;
    }

    // The asset is saved; now apply the image change. A failed upload doesn't undo the save.
    const savedId = result.item._id;
    let imageError = null;
    if (imageChange.file || (imageChange.remove && record.asset?.image)) {
      setSavingImage(true);
      try {
        if (imageChange.file) await dispatch(uploadAssetImage({ id: savedId, file: imageChange.file })).unwrap();
        else await dispatch(deleteAssetImage(savedId)).unwrap();
      } catch (err) {
        imageError = err?.message || 'Image could not be saved';
      } finally {
        setSavingImage(false);
      }
    }

    if (imageError) message.warning(`${result.message || 'Asset saved'}, but the image wasn't saved: ${imageError}`);
    else message.success(result.message || (isEdit ? 'Asset updated' : 'Asset created'));
    onSaved?.(result.item);
  }, [form, dispatch, isEdit, assetId, message, onSaved, imageChange, billChange, record.asset]);

  const handleCancel = useCallback(() => {
    if (!busy) onClose?.();
  }, [busy, onClose]);

  const assignedHolder = record.asset?.assignedTo;

  const waitingForRecord = isEdit && (record.loading || (!record.asset && !record.error));
  const showForm = open && !record.error && !waitingForRecord;

  let body;
  if (record.error) {
    body = (
      <ErrorState
        variant="page"
        title="Couldn't load this asset"
        message={record.error}
        onRetry={() => setReloadKey((k) => k + 1)}
      />
    );
  } else if (waitingForRecord) {
    body = (
      <div style={{ padding: '64px 0', textAlign: 'center' }}>
        <Spin size="large" tip="Loading asset…">
          <div style={{ height: 40 }} />
        </Spin>
      </div>
    );
  } else {
    body = (
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        clearOnDestroy
        initialValues={initialValues}
        disabled={busy}
        style={{ marginTop: 16 }}
      >
        <Divider orientation="left" plain style={{ marginTop: 0 }}>
          Item details
        </Divider>
        <Form.Item label="Asset Image">
          <AssetImageField
            assetId={assetId}
            currentImage={record.asset?.image}
            value={imageChange}
            onChange={setImageChange}
            disabled={busy}
          />
        </Form.Item>
        <Row gutter={16}>
          <Col xs={24} md={8}>
            <Form.Item
              label="Category"
              name="categoryId"
              rules={[{ required: true, message: 'Category is required' }]}
              tooltip="Not in the list? Add it on the Categories page first"
            >
              <Select
                options={categoryOptions}
                placeholder="Select category"
                showSearch
                optionFilterProp="label"
                loading={categories.loading}
                notFoundContent={
                  categories.error ? `Couldn't load categories: ${categories.error}` : 'No such category — add it on the Categories page'
                }
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              label="Item Name"
              name="itemName"
              normalize={trimStart}
              rules={[requiredText('Item name'), { min: 2, message: 'Must be at least 2 characters' }, maxLen(150)]}
            >
              <Input placeholder="e.g. MacBook Pro 14" maxLength={150} />
            </Form.Item>
          </Col>
          <Col xs={24} md={4}>
            <Form.Item
              label="Quantity"
              name="quantity"
              tooltip={
                assignedHolder
                  ? `Assigned to ${assignedHolder.fullName} — return it to change the quantity`
                  : 'Only assets with quantity 1 can be assigned to an employee'
              }
              rules={[
                { required: true, message: 'Quantity is required' },
                { type: 'integer', min: 1, message: 'Must be a whole number, 1 or more' },
                { type: 'integer', max: MAX_ASSET_QUANTITY, message: 'Quantity is too large' },
              ]}
            >
              <InputNumber
                style={{ width: '100%' }}
                min={1}
                max={MAX_ASSET_QUANTITY}
                precision={0}
                disabled={Boolean(assignedHolder)}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item
              label="Brand"
              name="brand"
              normalize={trimStart}
              rules={[maxLen(60)]}
              tooltip="Not in the list? Type the brand name — it will be added to the list for everyone"
            >
              <AutoComplete
                options={brandOptions}
                filterOption={filterAutoComplete}
                placeholder="Select or type brand"
                allowClear
                maxLength={60}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item label="Model Name" name="modelName" normalize={trimStart} rules={[maxLen(150)]}>
              <Input placeholder="e.g. A2992" maxLength={150} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item
              label="Serial Number"
              name="serialNumber"
              normalize={trimStart}
              rules={[
                maxLen(100),
                { pattern: /^[A-Za-z0-9\-/. ]*$/, message: 'Only letters, numbers, spaces, - / and .' },
              ]}
            >
              <Input placeholder="Serial number" maxLength={100} />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="Specifications / Description" name="specifications" rules={[maxLen(2000)]}>
              <Input.TextArea rows={2} placeholder="e.g. M3 Pro, 18GB RAM, 512GB SSD" maxLength={2000} showCount />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item label="Asset Location" name="location" normalize={trimStart} rules={[maxLen(120)]}>
              <AutoComplete
                options={LOCATION_OPTIONS}
                filterOption={filterAutoComplete}
                placeholder="Select or type location"
                allowClear
                maxLength={120}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item label="Condition" name="condition" rules={[{ required: true, message: 'Condition is required' }]}>
              <Select options={CONDITION_OPTIONS} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item
              label="Asset Status"
              name="status"
              rules={[{ required: true, message: 'Status is required' }]}
              extra={
                assignedHolder
                  ? `Assigned to ${assignedHolder.fullName} — return it to change the status`
                  : 'To mark as Assigned, use "Assign" from the assets list'
              }
            >
              <Select options={assignedHolder ? ALL_STATUS_OPTIONS : STATUS_OPTIONS} disabled={Boolean(assignedHolder)} />
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left" plain>
          Purchase &amp; warranty
        </Divider>
        <Row gutter={16}>
          <Col xs={24} md={8}>
            <Form.Item label="Purchase Date" name="purchaseDate" tooltip="Cannot be in the future">
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={disableFutureDates} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item
              label="Cost (₹)"
              name="cost"
              rules={[
                { type: 'number', min: 0, message: 'Cost cannot be negative' },
                { type: 'number', max: 1_000_000_000, message: 'Cost is too large' },
              ]}
            >
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                max={1_000_000_000}
                precision={2}
                prefix="₹"
                formatter={formatCost}
                parser={parseCost}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item label="Vendor Name" name="vendorName" normalize={trimStart} rules={[maxLen(150)]}>
              <Input placeholder="Vendor / seller" maxLength={150} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item
              label="Invoice Number"
              name="invoiceNumber"
              normalize={(v) => (typeof v === 'string' ? v.trim() : v)}
              rules={[{ pattern: /^[A-Za-z0-9\-/]+$/, message: 'Only letters, numbers, - and /' }, maxLen(60)]}
            >
              <Input placeholder="e.g. INV-2026-001" maxLength={60} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item
              label="Warranty Until"
              name="warrantyUntil"
              dependencies={['purchaseDate']}
              rules={[warrantyAfterPurchase]}
            >
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item label="Warranty Status" tooltip="Calculated automatically from Warranty Until">
              <div style={{ paddingTop: 5 }}>
                <StatusTag value={warrantyStatus} />
              </div>
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item
              label="Purchase City"
              name="purchaseCity"
              normalize={trimStart}
              rules={[maxLen(120), { pattern: /^[A-Za-z .'-]*$/, message: 'Only letters, spaces, . \' and -' }]}
            >
              <Input placeholder="e.g. Ahmedabad" maxLength={120} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item label="Purchase Type" name="purchaseType">
              <Select options={PURCHASE_TYPE_OPTIONS} placeholder="Select type" allowClear />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item label="Purchased By" name="purchasedBy" normalize={trimStart} rules={[maxLen(120)]}>
              <Input placeholder="Name of the person who purchased it" maxLength={120} />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="Bill / Invoice (optional)">
              <AssetBillField
                assetId={assetId}
                currentBill={record.asset?.bill}
                value={billChange}
                onChange={setBillChange}
                disabled={busy}
              />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="Remarks" name="remarks" rules={[maxLen(2000)]}>
              <Input.TextArea rows={2} placeholder="Any notes" maxLength={2000} showCount />
            </Form.Item>
          </Col>
        </Row>
        {/* Last child: starts every Add / Edit from this record's values, never the previous one's. */}
        <ResetFormOnOpen form={form} open={showForm} values={initialValues} />
      </Form>
    );
  }

  const title = isEdit ? `Update Asset${record.asset ? ` · ${record.asset.assetId}` : ''}` : 'Add Asset';

  return (
    <Modal
      open={open}
      title={title}
      okText={billProgress !== null ? `Uploading bill… ${billProgress}%` : isEdit ? 'Update' : 'Add Asset'}
      onOk={handleSubmit}
      onCancel={handleCancel}
      confirmLoading={busy}
      okButtonProps={{ disabled: waitingForRecord || Boolean(record.error) }}
      cancelButtonProps={{ disabled: busy }}
      closable={!busy}
      keyboard={!busy}
      maskClosable={false}
      width={860}
      destroyOnHidden
    >
      {body}
    </Modal>
  );
}
