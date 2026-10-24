'use client';

import { useState } from 'react';
import { App, Button, Space, Tooltip, Typography } from 'antd';
import { DownloadOutlined, EyeOutlined, FileImageOutlined, FilePdfOutlined } from '@ant-design/icons';
import { getErrorMessage } from '@/services/axios';
import AssetBillViewer, { fetchBillUrl, saveFile } from '@/components/assets/AssetBillViewer';

export const formatFileSize = (bytes) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** An asset's bill file: name + size, with View (in a modal) and Download. */
export default function AssetBillLink({ assetId, bill }) {
  const { message } = App.useApp();
  const [viewing, setViewing] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    setDownloading(true);
    try {
      const url = await fetchBillUrl(assetId, bill);
      saveFile(url, bill.filename);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      message.error(`Couldn't download the bill: ${getErrorMessage(err)}`);
    } finally {
      setDownloading(false);
    }
  };

  const Icon = bill.contentType === 'application/pdf' ? FilePdfOutlined : FileImageOutlined;

  return (
    <Space size={4} wrap>
      <Icon style={{ color: 'var(--fs-muted)' }} />
      <Typography.Text ellipsis style={{ maxWidth: 220 }} title={bill.filename}>
        {bill.filename}
      </Typography.Text>
      <span className="muted">· {formatFileSize(bill.size)}</span>
      <Tooltip title="View">
        <Button type="text" size="small" icon={<EyeOutlined />} aria-label="View bill" onClick={() => setViewing({ assetId, bill })} />
      </Tooltip>
      <Tooltip title="Download">
        <Button type="text" size="small" icon={<DownloadOutlined />} aria-label="Download bill" loading={downloading} onClick={download} />
      </Tooltip>
      <AssetBillViewer target={viewing} onClose={() => setViewing(null)} />
    </Space>
  );
}
