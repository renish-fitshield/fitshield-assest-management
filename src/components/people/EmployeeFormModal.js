'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { App, AutoComplete, Col, DatePicker, Form, Input, Modal, Radio, Row, Select, Spin } from 'antd';
import {
  DEPARTMENTS,
  WORK_TYPES,
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPES,
  DEFAULT_EMPLOYMENT_TYPE,
  LOCATIONS,
  WORK_EMAIL_DOMAIN,
  employeeEmailError,
} from '@/lib/constants';
import { toDayjs } from '@/lib/format';
import { applyServerErrors, maxLen, requiredText, trimStart, validateOrScroll } from '@/lib/forms';
import ErrorState from '@/components/ErrorState';
import ResetFormOnOpen from '@/components/ResetFormOnOpen';
import { createEmployee, fetchEmployeeById, updateEmployee } from '@/store/employeesSlice';

const toOptions = (list) => list.map((v) => ({ label: v, value: v }));
const DEPARTMENT_OPTIONS = toOptions(DEPARTMENTS);
const WORK_TYPE_OPTIONS = toOptions(WORK_TYPES);
const STATUS_OPTIONS = toOptions(EMPLOYEE_STATUSES);
const LOCATION_OPTIONS = toOptions(LOCATIONS);
const filterAutoComplete = (input, option) => option.value.toLowerCase().includes(input.toLowerCase());
const EMPLOYMENT_TYPE_OPTIONS = toOptions(EMPLOYMENT_TYPES);
const NEW_EMPLOYEE_DEFAULTS = { status: 'Active', employmentType: DEFAULT_EMPLOYMENT_TYPE };

function toFormValues(employee) {
  if (!employee) return NEW_EMPLOYEE_DEFAULTS;
  return {
    ...employee,
    employmentType: employee.employmentType || DEFAULT_EMPLOYMENT_TYPE,
    joiningDate: toDayjs(employee.joiningDate),
  };
}

const contactNumberRule = {
  validator(_, value) {
    if (!value) return Promise.resolve();
    if (!/^\+?[0-9\s-]+$/.test(value)) {
      return Promise.reject(new Error('Use digits, spaces, - and an optional leading +'));
    }
    const digits = value.replace(/\D/g, '').length;
    if (digits < 7 || digits > 15) return Promise.reject(new Error('Contact number must have 7–15 digits'));
    return Promise.resolve();
  },
};

/**
 * Add / update employee modal.
 * In edit mode the latest copy of the employee is fetched first, so the form never edits stale data.
 */
export default function EmployeeFormModal({ open, employeeId, onClose, onSaved }) {
  const [form] = Form.useForm();
  const dispatch = useDispatch();
  const { message } = App.useApp();
  const saving = useSelector((s) => s.employees.saving);
  const isEdit = Boolean(employeeId);

  const [record, setRecord] = useState({ loading: false, error: null, employee: null });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!open || !employeeId) {
      setRecord({ loading: false, error: null, employee: null });
      return undefined;
    }
    const promise = dispatch(fetchEmployeeById(employeeId));
    setRecord({ loading: true, error: null, employee: null });
    (async () => {
      try {
        const { item } = await promise.unwrap();
        setRecord({ loading: false, error: null, employee: item });
      } catch (err) {
        if (err?.name === 'AbortError') return;
        setRecord({ loading: false, error: err?.message || 'Failed to load employee', employee: null });
      }
    })();
    return () => promise.abort();
  }, [open, employeeId, reloadKey, dispatch]);

  const initialValues = useMemo(() => toFormValues(record.employee), [record.employee]);
  const intern = Form.useWatch('employmentType', form) === 'Intern';

  const handleSubmit = useCallback(async () => {
    const values = await validateOrScroll(form);
    if (!values) return;
    try {
      const payload = { ...values, joiningDate: values.joiningDate ? values.joiningDate.format('YYYY-MM-DD') : null };
      const result = await dispatch(
        isEdit ? updateEmployee({ id: employeeId, data: payload }) : createEmployee(payload)
      ).unwrap();
      message.success(result.message || (isEdit ? 'Employee updated' : 'Employee created'));
      onSaved?.(result.item);
    } catch (err) {
      const inline = applyServerErrors(form, err);
      message.error(inline ? 'Please fix the highlighted fields' : err?.message || 'Failed to save employee');
    }
  }, [form, dispatch, isEdit, employeeId, message, onSaved]);

  const handleCancel = useCallback(() => {
    if (!saving) onClose?.();
  }, [saving, onClose]);

  const waitingForRecord = isEdit && (record.loading || (!record.employee && !record.error));
  const showForm = open && !record.error && !waitingForRecord;

  let body;
  if (record.error) {
    body = (
      <ErrorState
        variant="page"
        title="Couldn't load this employee"
        message={record.error}
        onRetry={() => setReloadKey((k) => k + 1)}
      />
    );
  } else if (waitingForRecord) {
    body = (
      <div style={{ padding: '64px 0', textAlign: 'center' }}>
        <Spin size="large" tip="Loading employee…">
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
        disabled={saving}
        style={{ marginTop: 16 }}
      >
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item
              label="Full Name"
              name="fullName"
              normalize={trimStart}
              rules={[
                requiredText('Full name'),
                { min: 2, message: 'Must be at least 2 characters' },
                maxLen(120),
                { pattern: /^[\p{L} .'-]+$/u, message: "Only letters, spaces, . ' and -" },
              ]}
            >
              <Input placeholder="e.g. Priya Sharma" maxLength={120} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              label="Employment Type"
              name="employmentType"
              rules={[{ required: true, message: 'Employment type is required' }]}
              tooltip={`Full-Time employees need a company email (@${WORK_EMAIL_DOMAIN}); interns can use any valid email`}
            >
              <Radio.Group optionType="button" buttonStyle="solid" options={EMPLOYMENT_TYPE_OPTIONS} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              label="Work Email"
              name="workEmail"
              normalize={(v) => (typeof v === 'string' ? v.trim().toLowerCase() : v)}
              // Re-checked when the employment type changes (an intern's gmail stops being valid for Full-Time).
              dependencies={['employmentType']}
              validateTrigger={['onChange', 'onBlur']}
              extra={intern ? 'Interns can use any valid email.' : `Company email only: must end with @${WORK_EMAIL_DOMAIN}.`}
              rules={[
                { required: true, message: 'Work email is required' },
                maxLen(254),
                // The domain rule is checked when leaving the field (and on save), not on every keystroke.
                ({ getFieldValue }) => ({
                  validateTrigger: 'onBlur',
                  validator(_, value) {
                    if (!value) return Promise.resolve();
                    const error = employeeEmailError(value, getFieldValue('employmentType'));
                    return error ? Promise.reject(new Error(error)) : Promise.resolve();
                  },
                }),
              ]}
            >
              <Input placeholder={intern ? 'johndoe@gmail.com' : `johndoe@${WORK_EMAIL_DOMAIN}`} maxLength={254} autoComplete="off" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label="Department" name="department" rules={[{ required: true, message: 'Department is required' }]}>
              <Select options={DEPARTMENT_OPTIONS} placeholder="Select department" showSearch />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label="Designation" name="designation" normalize={trimStart} rules={[maxLen(120)]}>
              <Input placeholder="e.g. Senior Software Engineer" maxLength={120} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label="Work Type" name="workType" rules={[{ required: true, message: 'Work type is required' }]}>
              <Select options={WORK_TYPE_OPTIONS} placeholder="Select work type" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label="Employee Location" name="location" normalize={trimStart} rules={[maxLen(120)]}>
              <AutoComplete
                options={LOCATION_OPTIONS}
                filterOption={filterAutoComplete}
                placeholder="Select or type location"
                allowClear
                maxLength={120}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label="Joining Date" name="joiningDate">
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label="Employee Status" name="status" rules={[{ required: true, message: 'Status is required' }]}>
              <Select options={STATUS_OPTIONS} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label="Contact Number" name="contactNumber" normalize={trimStart} rules={[contactNumberRule]}>
              <Input placeholder="+91 98765 43210" maxLength={20} />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="Remarks" name="remarks" rules={[maxLen(2000)]}>
              <Input.TextArea rows={3} placeholder="Any notes" maxLength={2000} showCount />
            </Form.Item>
          </Col>
        </Row>
        {/* Last child: starts every Add / Edit from this employee's values, never the previous one's. */}
        <ResetFormOnOpen form={form} open={showForm} values={initialValues} />
      </Form>
    );
  }

  const title = isEdit
    ? `Update Employee${record.employee ? ` · ${record.employee.employeeId}` : ''}`
    : 'Add Employee';

  return (
    <Modal
      open={open}
      title={title}
      okText={isEdit ? 'Update' : 'Add Employee'}
      onOk={handleSubmit}
      onCancel={handleCancel}
      confirmLoading={saving}
      okButtonProps={{ disabled: waitingForRecord || Boolean(record.error) }}
      cancelButtonProps={{ disabled: saving }}
      closable={!saving}
      keyboard={!saving}
      maskClosable={false}
      width={760}
      destroyOnHidden
    >
      {body}
    </Modal>
  );
}
