'use client';

import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { App, Form, Input, Modal } from 'antd';
import { categoryKey } from '@/lib/constants';
import { applyServerErrors, maxLen, requiredText, trimStart, validateOrScroll } from '@/lib/forms';
import { createCategory, updateCategory } from '@/store/categoriesSlice';

/**
 * Add a category, or rename `category` when given. `existing` is the loaded list, used to flag a
 * duplicate name before saving; the server enforces it too (also against categories added meanwhile).
 */
export default function CategoryFormModal({ open, category, existing, onClose, onSaved }) {
  const [form] = Form.useForm();
  const dispatch = useDispatch();
  const { message } = App.useApp();
  const saving = useSelector((s) => s.categories.saving);
  const isEdit = Boolean(category);

  // Add / Update stays disabled until the name is filled in and shows no error (duplicate, too short…).
  const name = Form.useWatch('name', form);
  const [hasError, setHasError] = useState(false);
  const blocked = !name?.trim() || hasError;
  const trackErrors = useCallback(() => setHasError(form.getFieldError('name').length > 0), [form]);

  const takenNames = useMemo(
    () => new Map(existing.filter((c) => c._id !== category?._id).map((c) => [categoryKey(c.name), c.name])),
    [existing, category]
  );
  const uniqueName = useMemo(
    () => ({
      validator(_, value) {
        const clash = takenNames.get(categoryKey(value));
        return clash ? Promise.reject(new Error(`Category "${clash}" already exists`)) : Promise.resolve();
      },
    }),
    [takenNames]
  );

  useLayoutEffect(() => {
    if (!open) return;
    form.resetFields();
    setHasError(false);
  }, [open, category, form]);

  const handleSubmit = useCallback(async () => {
    if (blocked) return; // Enter in the input shouldn't bypass the disabled button
    const values = await validateOrScroll(form);
    if (!values) return;
    const data = { name: values.name.trim().replace(/\s+/g, ' ') };
    try {
      const result = await dispatch(isEdit ? updateCategory({ id: category._id, data }) : createCategory(data)).unwrap();
      message.success(result.message || (isEdit ? 'Category updated' : 'Category added'));
      onSaved?.(result.item);
    } catch (err) {
      // e.g. someone else added the same name meanwhile: shown under the field, button disabled until it's changed
      const inline = applyServerErrors(form, err);
      if (inline) setHasError(true);
      message.error(inline ? 'Please fix the highlighted field' : err?.message || 'Failed to save category');
    }
  }, [blocked, form, dispatch, isEdit, category, message, onSaved]);

  const handleCancel = useCallback(() => {
    if (!saving) onClose?.();
  }, [saving, onClose]);

  const assetCount = category?.assetCount || 0;

  return (
    <Modal
      open={open}
      title={isEdit ? 'Rename Category' : 'Add Category'}
      okText={isEdit ? 'Update' : 'Add Category'}
      onOk={handleSubmit}
      onCancel={handleCancel}
      confirmLoading={saving}
      okButtonProps={{ disabled: blocked }}
      cancelButtonProps={{ disabled: saving }}
      closable={!saving}
      keyboard={!saving}
      maskClosable={false}
      width={460}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={{ name: category?.name }}
        disabled={saving}
        onFieldsChange={trackErrors}
        style={{ marginTop: 16 }}
      >
        <Form.Item
          label="Category Name"
          name="name"
          normalize={trimStart}
          validateFirst
          rules={[requiredText('Category name'), { min: 2, message: 'Must be at least 2 characters' }, maxLen(60), uniqueName]}
          extra={
            isEdit && assetCount
              ? `${assetCount} asset${assetCount === 1 ? '' : 's'} in this category will show the new name.`
              : 'Category names must be unique — "Laptop" and "laptop" count as the same.'
          }
        >
          <Input placeholder="e.g. Laptop" maxLength={60} autoFocus onPressEnter={handleSubmit} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
