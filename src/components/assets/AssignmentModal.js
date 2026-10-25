'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import dayjs from 'dayjs';
import { Alert, App, Button, Col, DatePicker, Form, Input, Modal, Radio, Row, Select, Spin, Typography } from 'antd';
import { MailOutlined } from '@ant-design/icons';
import { ASSET_CONDITIONS, RETURN_STATUSES, isReturnOverdue } from '@/lib/constants';
import { formatDate, toDayjs } from '@/lib/format';
import { applyServerErrors, maxLen, validateOrScroll } from '@/lib/forms';
import AssetImage from '@/components/assets/AssetImage';
import StatusTag from '@/components/StatusTag';
import { isOutcomeUnknown } from '@/services/axios';
import { assignAsset, assignManyAssets, returnAsset, searchAssignableAssets, transferAsset } from '@/store/assetsSlice';
import { fetchEmployeeOptions } from '@/store/employeesSlice';

const SEARCH_DELAY_MS = 350;
const CONDITION_OPTIONS = ASSET_CONDITIONS.map((v) => ({ label: v, value: v }));
const RETURN_STATUS_HELP = {
  Available: 'Back in stock, ready to assign again',
  'Under Repair': 'Needs fixing before it can be assigned',
  Retired: 'No longer in use',
  Lost: 'The employee lost it',
};

const MODES = {
  assign: { title: 'Assign asset', ok: 'Assign', dateField: 'assignedAt', dateLabel: 'Assignment date', thunk: assignAsset },
  transfer: { title: 'Transfer asset', ok: 'Transfer', dateField: 'transferredAt', dateLabel: 'Transfer date', thunk: transferAsset },
  return: { title: 'Return asset', ok: 'Mark as returned', dateField: 'returnedAt', dateLabel: 'Return date', thunk: returnAsset },
};

const EMAIL_NOTE = {
  assign: 'The employee will get an email to acknowledge receipt.',
  assignMany: 'The employee will get one email per asset to acknowledge receipt.',
  transfer: 'Both employees will get an email to acknowledge the hand-over.',
  return: 'The employee will get an email to acknowledge the return.',
};

const holderText = (h) => (h ? `${h.fullName}${h.employeeId ? ` (${h.employeeId})` : ''}` : '—');
const today = () => dayjs().startOf('day');

/** Shows the outcome of a hand-over, including whether the acknowledgement email(s) went out. */
export function reportHandOver(message, result) {
  // A failed email, or one that only reached the test inbox (email not set up), needs the admin's attention.
  const attention = (result?.emails || []).some((e) => e.status !== 'Sent' || e.testOnly);
  if (attention) message.warning(result.message, 12);
  else message.success(result.message || 'Saved');
}

/** For "Resend email": a success, unless email isn't set up and it only reached the test inbox. */
export function reportResend(message, result) {
  if (result?.email?.testOnly) message.warning(result.message, 12);
  else message.success(result?.message || 'Email sent');
}

/** The request may have reached the server but no answer came back: we can't say whether it was saved. */
function warnOutcomeUnknown(modal, what) {
  modal.warning({
    title: "We didn't hear back from the server",
    content: `The connection dropped or timed out before the server answered, so the ${what} may or may not have been saved. The list has been refreshed — check it before trying again. (Trying again on something that was saved just says it's already done.)`,
  });
}

/** The asset the action is about (or, when picking assets for an employee, the employee). */
function Summary({ asset, employee }) {
  if (!asset) {
    if (!employee) return null;
    return (
      <div className="assign-summary">
        <div>
          <div className="muted">Assigning to</div>
          <Typography.Text strong>{holderText(employee)}</Typography.Text>
          {employee.department && <span className="muted"> · {employee.department}</span>}
        </div>
      </div>
    );
  }
  const holder = asset.assignedTo;
  return (
    <div className="assign-summary">
      <AssetImage assetId={asset._id} image={asset.image} size={52} radius={10} />
      <div style={{ minWidth: 0 }}>
        <Typography.Text strong>{asset.itemName}</Typography.Text>
        <div className="muted">
          {asset.assetId}
          {asset.category ? ` · ${asset.category}` : ''}
          {asset.serialNumber ? ` · ${asset.serialNumber}` : ''}
        </div>
        <div style={{ marginTop: 4, fontSize: 13 }}>
          {holder ? (
            <>
              With <strong>{holderText(holder)}</strong> since {formatDate(asset.assignedAt)}
              {asset.expectedReturnAt && (
                <span className={isReturnOverdue(asset) ? 'overdue-text' : 'muted'}> · due back {formatDate(asset.expectedReturnAt)}</span>
              )}
            </>
          ) : (
            <>
              <StatusTag value={asset.status} /> <StatusTag value={asset.condition} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Every hand-over goes through here:
 *  - "assign" + `asset`     → pick the employee
 *  - "assign" without asset → pick one or more Available assets (and the employee, unless `employee` is given)
 *  - "transfer" + `asset`   → pick the new holder; it goes straight from one employee to the other
 *  - "return"   + `asset`   → take it back; record its condition and what it becomes
 * `asset` needs assignedTo populated ({ _id, fullName, employeeId }) for transfer/return.
 * Each hand-over emails the employee(s) a link to acknowledge it.
 */
export default function AssignmentModal({ open, mode = 'assign', asset, employee, onClose, onDone }) {
  const [form] = Form.useForm();
  const dispatch = useDispatch();
  const { message, modal } = App.useApp();
  const saving = useSelector((s) => s.assets.saving);
  const { options: employees, optionsLoading, optionsError } = useSelector((s) => s.employees);
  const config = MODES[mode] || MODES.assign;
  const multi = mode === 'assign' && !asset;
  const pickEmployee = mode !== 'return' && !employee;

  // ---- employee options
  const loadEmployees = useCallback(() => dispatch(fetchEmployeeOptions()), [dispatch]);
  useEffect(() => {
    if (!open || !pickEmployee) return undefined;
    const p = loadEmployees();
    return () => p.abort();
  }, [open, pickEmployee, loadEmployees]);

  const currentHolderId = asset?.assignedTo?._id;
  const employeeOptions = useMemo(
    () =>
      employees.map((e) => {
        const isHolder = currentHolderId && e._id === currentHolderId;
        const note = isHolder ? ' · has it now' : e.status === 'Exited' ? ' · Exited' : e.status === 'On Notice' ? ' · On notice' : '';
        return { value: e._id, label: `${e.fullName} (${e.employeeId})${note}`, disabled: e.status === 'Exited' || isHolder };
      }),
    [employees, currentHolderId]
  );

  // ---- available-asset search (multi-assign); server-side, latest request wins
  const [assetSearch, setAssetSearch] = useState({ loading: false, error: null, items: [] });
  const searchRef = useRef({ timer: null, promise: null });
  const known = useRef(new Map()); // every asset seen in a search, so selections survive new searches
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
          items.forEach((a) => known.current.set(a._id, a));
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
    if (!open || !multi) return undefined;
    known.current = new Map();
    runAssetSearch('');
    const ref = searchRef.current;
    return () => {
      clearTimeout(ref.timer);
      ref.promise?.abort();
    };
  }, [open, multi, runAssetSearch]);

  const selectedIds = Form.useWatch('assetIds', form);
  // `known` is filled before each search result is stored, so recomputing on results picks up new entries.
  const selectedAssets = useMemo(
    () => (selectedIds || []).map((id) => known.current.get(id)).filter(Boolean),
    [selectedIds, assetSearch.items]
  );
  const assetOptions = useMemo(() => {
    const shown = new Map(assetSearch.items.map((a) => [a._id, a]));
    selectedAssets.forEach((a) => shown.set(a._id, a)); // keep chosen ones listed while searching
    return [...shown.values()].map((a) => ({
      value: a._id,
      label: `${a.assetId} · ${a.itemName}${a.serialNumber ? ` · ${a.serialNumber}` : ''}`,
    }));
  }, [assetSearch.items, selectedAssets]);

  // ---- dates: never in the future; never before the purchase (assign) or the current hand-over (transfer/return)
  const minDate = useMemo(() => {
    const floors =
      mode === 'assign'
        ? (asset ? [asset] : selectedAssets).map((a) => a.purchaseDate).filter(Boolean)
        : [asset?.assignedAt].filter(Boolean);
    if (!floors.length) return null;
    return floors.map(toDayjs).reduce((a, b) => (b.isAfter(a) ? b : a));
  }, [mode, asset, selectedAssets]);
  const disabledDate = useCallback(
    (d) => d.isAfter(dayjs().endOf('day')) || (minDate ? d.isBefore(minDate, 'day') : false),
    [minDate]
  );
  const handOverDate = Form.useWatch(config.dateField, form);
  const disabledDueDate = useCallback((d) => d.isBefore(handOverDate || today(), 'day'), [handOverDate]);

  const initialValues = useMemo(
    () => ({
      [config.dateField]: today(),
      condition: asset?.condition,
      statusAfter: 'Available',
      // A transfer keeps the current due date unless it's changed.
      expectedReturnAt: mode === 'transfer' ? toDayjs(asset?.expectedReturnAt) : null,
    }),
    [config.dateField, asset, mode]
  );

  // The form instance outlives each open: reset so the previous asset's values don't carry over.
  useLayoutEffect(() => {
    if (open) form.resetFields();
  }, [open, initialValues, form]);

  const handleSubmit = useCallback(async () => {
    const values = await validateOrScroll(form);
    if (!values) return;
    const ymd = (d) => (d ? d.format('YYYY-MM-DD') : null);
    const employeeId = employee?._id ?? values.employeeId;

    if (multi) {
      let result;
      try {
        result = await dispatch(
          assignManyAssets({
            employeeId,
            assetIds: values.assetIds,
            assignedAt: ymd(values.assignedAt),
            expectedReturnAt: ymd(values.expectedReturnAt),
            notes: values.notes || undefined,
          })
        ).unwrap();
      } catch (err) {
        if (isOutcomeUnknown(err)) {
          warnOutcomeUnknown(modal, 'assignment');
          onDone?.(null);
          return;
        }
        const inline = applyServerErrors(form, err);
        message.error(inline ? 'Please fix the highlighted fields' : err?.message || 'Something went wrong');
        return;
      }
      const name = (id) => known.current.get(id)?.assetId || 'Asset';
      const failed = result.results.filter((r) => !r.ok);
      const mailFailed = result.results.filter((r) => r.ok && r.emails?.some((e) => e.status !== 'Sent'));
      const testOnly = result.results.filter((r) => r.ok && r.emails?.some((e) => e.status === 'Sent' && e.testOnly));
      if (failed.length || mailFailed.length || testOnly.length) {
        modal.warning({
          title: `${result.assigned} of ${result.results.length} assets assigned`,
          width: 520,
          content: (
            <div>
              {failed.map((r) => (
                <p key={r.assetId}>
                  <strong>{name(r.assetId)}</strong> wasn&apos;t assigned: {r.error}
                </p>
              ))}
              {mailFailed.map((r) => (
                <p key={r.assetId}>
                  <strong>{name(r.assetId)}</strong> was assigned, but its acknowledgement email couldn&apos;t be sent (
                  {r.emails.find((e) => e.status !== 'Sent').error}). Resend it from the asset&apos;s assignment history.
                </p>
              ))}
              {testOnly.length > 0 && (
                <p>
                  Email isn&apos;t set up yet, so the acknowledgement email{testOnly.length > 1 ? 's were' : ' was'} NOT delivered
                  (they went to a test inbox). Add the SMTP settings, then use &quot;Resend email&quot;.
                </p>
              )}
            </div>
          ),
        });
      } else {
        message.success(
          `${result.assigned} asset${result.assigned === 1 ? '' : 's'} assigned. Acknowledgement emails sent to ${result.results[0].emails?.[0]?.to}.`
        );
      }
      if (result.assigned) onDone?.(null);
      return;
    }

    const data = {
      [config.dateField]: ymd(values[config.dateField]),
      condition: values.condition,
      notes: values.notes || undefined,
    };
    if (mode === 'return') data.statusAfter = values.statusAfter;
    else {
      data.employeeId = employeeId;
      data.expectedReturnAt = ymd(values.expectedReturnAt);
    }
    try {
      const result = await dispatch(config.thunk({ id: asset._id, data })).unwrap();
      reportHandOver(message, result);
      onDone?.(result.item);
    } catch (err) {
      if (isOutcomeUnknown(err)) {
        warnOutcomeUnknown(modal, mode === 'return' ? 'return' : mode === 'transfer' ? 'transfer' : 'assignment');
        onDone?.(null);
        return;
      }
      if (err?.status === 409) {
        // Someone else changed this asset (or it's already assigned/returned): this form is out of date.
        message.error(`${err.message} The list has been refreshed.`, 8);
        onDone?.(null);
        return;
      }
      const inline = applyServerErrors(form, err);
      message.error(inline ? 'Please fix the highlighted fields' : err?.message || 'Something went wrong');
    }
  }, [form, config, mode, multi, employee, asset, dispatch, message, modal, onDone]);

  const employeeHelp = optionsError ? (
    <span>
      Couldn&apos;t load employees.{' '}
      <Button type="link" size="small" style={{ padding: 0 }} onClick={loadEmployees}>
        Retry
      </Button>
    </span>
  ) : undefined;

  const okText = multi ? `Assign${selectedAssets.length > 1 ? ` ${selectedAssets.length} assets` : ''}` : config.ok;

  return (
    <Modal
      open={open}
      title={multi ? 'Assign assets' : config.title}
      okText={okText}
      onOk={handleSubmit}
      onCancel={() => !saving && onClose?.()}
      confirmLoading={saving}
      cancelButtonProps={{ disabled: saving }}
      closable={!saving}
      keyboard={!saving}
      maskClosable={false}
      destroyOnHidden
      width={640}
    >
      <Summary asset={asset} employee={employee} />

      <Form form={form} layout="vertical" preserve={false} disabled={saving} initialValues={initialValues} style={{ marginTop: asset || employee ? 0 : 16 }}>
        {pickEmployee && (
          <Form.Item
            label={mode === 'transfer' ? 'Transfer to' : 'Assign to'}
            name="employeeId"
            rules={[{ required: true, message: 'Select an employee' }]}
            validateStatus={optionsError ? 'warning' : undefined}
            help={employeeHelp}
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

        {multi && (
          <Form.Item
            label="Assets"
            name="assetIds"
            rules={[{ required: true, message: 'Select at least one asset' }]}
            extra="Pick one or more — e.g. laptop, mouse and keyboard. Only Available assets with quantity 1 are listed; each keeps its own condition."
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
              mode="multiple"
              showSearch
              placeholder="Search by asset ID, name or serial…"
              filterOption={false}
              onSearch={runAssetSearch}
              options={assetOptions}
              loading={assetSearch.loading}
              maxCount={25}
              notFoundContent={assetSearch.loading ? <Spin size="small" /> : 'No available assets found'}
            />
          </Form.Item>
        )}

        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item
              label={config.dateLabel}
              name={config.dateField}
              rules={[{ required: true, message: `Select the ${config.dateLabel.toLowerCase()}` }]}
              tooltip={
                mode === 'assign'
                  ? 'Cannot be in the future or before the purchase date'
                  : 'Cannot be in the future or before the date it was handed to the current holder'
              }
            >
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={disabledDate} allowClear={false} />
            </Form.Item>
          </Col>
          {!multi && (
            <Col xs={24} sm={12}>
              <Form.Item
                label={mode === 'return' ? 'Condition on return' : 'Condition at hand-over'}
                name="condition"
                rules={[{ required: true, message: 'Select the condition' }]}
              >
                <Select options={CONDITION_OPTIONS} placeholder="Select condition" />
              </Form.Item>
            </Col>
          )}
          {mode !== 'return' && (
            <Col xs={24} sm={12}>
              <Form.Item
                label="Expected return (optional)"
                name="expectedReturnAt"
                tooltip="For loans and temporary use. The asset is flagged as overdue after this date."
                dependencies={[config.dateField]}
                rules={[
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      const from = getFieldValue(config.dateField);
                      if (!value || !from || !value.isBefore(from, 'day')) return Promise.resolve();
                      return Promise.reject(new Error(`Must be on or after the ${config.dateLabel.toLowerCase()}`));
                    },
                  }),
                ]}
              >
                <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={disabledDueDate} placeholder="No due date" />
              </Form.Item>
            </Col>
          )}
        </Row>

        {mode === 'return' && (
          <Form.Item label="After return, the asset is" name="statusAfter">
            <Radio.Group
              optionType="button"
              buttonStyle="solid"
              options={RETURN_STATUSES.map((s) => ({ label: s, value: s, title: RETURN_STATUS_HELP[s] }))}
            />
          </Form.Item>
        )}

        <Form.Item label="Notes" name="notes" rules={[maxLen(500)]}>
          <Input.TextArea
            rows={2}
            maxLength={500}
            showCount
            placeholder={mode === 'return' ? 'e.g. Screen has a scratch' : 'e.g. Handed over with charger and bag'}
          />
        </Form.Item>
      </Form>

      {multi && !assetSearch.loading && !assetSearch.error && assetSearch.items.length === 0 && (
        <Alert type="info" showIcon message="There are no Available assets to assign right now." style={{ marginBottom: 12 }} />
      )}
      <div className="muted" style={{ fontSize: 13 }}>
        <MailOutlined /> {EMAIL_NOTE[multi ? 'assignMany' : mode] || EMAIL_NOTE.assign}
      </div>
    </Modal>
  );
}
