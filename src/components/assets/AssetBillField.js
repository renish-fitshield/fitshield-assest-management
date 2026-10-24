'use client';

import { App, Button, Space, Typography, Upload } from 'antd';
import { DeleteOutlined, PaperClipOutlined, UploadOutlined } from '@ant-design/icons';
import { ASSET_BILL_MAX_MB, ASSET_BILL_TYPES } from '@/lib/constants';
import AssetBillLink, { formatFileSize } from '@/components/assets/AssetBillLink';

/**
 * Pick / replace / remove the asset's bill (invoice, cheque…) inside the asset form.
 * Nothing is uploaded here — the form uploads `value.file` when the asset is saved.
 *
 * value: { file: File | null, remove: boolean }
 */
export default function AssetBillField({ assetId, currentBill, value, onChange, disabled }) {
  const { message } = App.useApp();

  const beforeUpload = (file) => {
    if (!ASSET_BILL_TYPES.includes(file.type)) {
      message.error('Only PDF or image files (JPEG, PNG, WebP) are allowed');
      return Upload.LIST_IGNORE;
    }
    if (file.size > ASSET_BILL_MAX_MB * 1024 * 1024) {
      message.error(`Bill must be ${ASSET_BILL_MAX_MB} MB or smaller`);
      return Upload.LIST_IGNORE;
    }
    if (file.size === 0) {
      message.error('This file is empty');
      return Upload.LIST_IGNORE;
    }
    onChange({ file, remove: false });
    return false; // keep it local; uploaded on save
  };

  const showsCurrent = !value.file && !value.remove && currentBill;
  const hasBill = Boolean(value.file || showsCurrent);

  return (
    <Space direction="vertical" size={6}>
      {value.file && (
        <Space size={4}>
          <PaperClipOutlined style={{ color: 'var(--fs-muted)' }} />
          <Typography.Text ellipsis style={{ maxWidth: 260 }} title={value.file.name}>
            {value.file.name}
          </Typography.Text>
          <span className="muted">· {formatFileSize(value.file.size)}</span>
        </Space>
      )}
      {showsCurrent && <AssetBillLink assetId={assetId} bill={currentBill} />}
      <Space size={8} wrap>
        <Upload accept={ASSET_BILL_TYPES.join(',')} showUploadList={false} beforeUpload={beforeUpload} disabled={disabled}>
          <Button icon={<UploadOutlined />} disabled={disabled}>
            {hasBill ? 'Replace bill' : 'Upload bill'}
          </Button>
        </Upload>
        {hasBill && (
          <Button
            type="text"
            danger
            size="small"
            icon={<DeleteOutlined />}
            disabled={disabled}
            onClick={() => onChange({ file: null, remove: Boolean(currentBill) })}
          >
            Remove
          </Button>
        )}
      </Space>
      <span className="muted">Invoice, cheque, receipt… · PDF, JPEG, PNG or WebP · up to {ASSET_BILL_MAX_MB} MB</span>
      {value.file && <span className="muted">The bill will be uploaded when you save</span>}
      {value.remove && <span className="muted">The bill will be removed when you save</span>}
    </Space>
  );
}
