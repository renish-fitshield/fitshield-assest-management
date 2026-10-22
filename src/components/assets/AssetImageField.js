'use client';

import { useEffect, useMemo } from 'react';
import { App, Button, Space, Upload } from 'antd';
import { DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import { ASSET_IMAGE_MAX_MB, ASSET_IMAGE_TYPES } from '@/lib/constants';
import AssetImage from '@/components/assets/AssetImage';

/**
 * Pick / replace / remove an asset photo inside the asset form.
 * Nothing is uploaded here — the form uploads `value.file` (or deletes when `value.remove`)
 * after the asset itself is saved, because a new asset has no id until then.
 *
 * value: { file: File | null, remove: boolean }
 */
export default function AssetImageField({ assetId, currentImage, value, onChange, disabled }) {
  const { message } = App.useApp();

  const previewUrl = useMemo(() => (value.file ? URL.createObjectURL(value.file) : null), [value.file]);
  useEffect(() => () => previewUrl && URL.revokeObjectURL(previewUrl), [previewUrl]);

  const beforeUpload = (file) => {
    if (!ASSET_IMAGE_TYPES.includes(file.type)) {
      message.error('Only JPEG, PNG or WebP images are allowed');
      return Upload.LIST_IGNORE;
    }
    if (file.size > ASSET_IMAGE_MAX_MB * 1024 * 1024) {
      message.error(`Image must be ${ASSET_IMAGE_MAX_MB} MB or smaller`);
      return Upload.LIST_IGNORE;
    }
    onChange({ file, remove: false });
    return false; // keep it local; uploaded on save
  };

  const showsCurrent = !value.file && !value.remove && currentImage;
  const hasImage = Boolean(value.file || showsCurrent);

  return (
    <Space align="center" size={16}>
      {value.file ? (
        <span
          style={{
            width: 96,
            height: 96,
            borderRadius: 12,
            overflow: 'hidden',
            border: '1px solid var(--fs-line)',
            display: 'block',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- local preview of the chosen file */}
          <img src={previewUrl} alt="New asset" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </span>
      ) : (
        <AssetImage assetId={assetId} image={showsCurrent ? currentImage : null} size={96} radius={12} />
      )}
      <Space direction="vertical" size={6}>
        <Upload accept={ASSET_IMAGE_TYPES.join(',')} showUploadList={false} beforeUpload={beforeUpload} disabled={disabled}>
          <Button icon={<UploadOutlined />} disabled={disabled}>
            {hasImage ? 'Replace image' : 'Upload image'}
          </Button>
        </Upload>
        {hasImage && (
          <Button
            type="text"
            danger
            size="small"
            icon={<DeleteOutlined />}
            disabled={disabled}
            onClick={() => onChange({ file: null, remove: Boolean(currentImage) })}
          >
            Remove
          </Button>
        )}
        <span className="muted">JPEG, PNG or WebP · up to {ASSET_IMAGE_MAX_MB} MB</span>
        {value.file && <span className="muted">New image will be uploaded when you save</span>}
        {value.remove && <span className="muted">Image will be removed when you save</span>}
      </Space>
    </Space>
  );
}
