'use client';

import { useEffect, useState } from 'react';
import { Button, Modal, Space, Spin } from 'antd';
import { DownloadOutlined, ExportOutlined } from '@ant-design/icons';
import ErrorState from '@/components/ErrorState';
import api, { getErrorMessage } from '@/services/axios';

const isPdf = (bill) => bill?.contentType === 'application/pdf';

/** Object URL of an asset's bill — fetched with the auth token, which a plain link can't send. */
export async function fetchBillUrl(assetId, bill, { signal } = {}) {
  const res = await api.get(`/assets/${assetId}/bill/${bill.fileId}`, { responseType: 'blob', timeout: 120000, signal });
  return URL.createObjectURL(res.data);
}

export function saveFile(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
}

/**
 * Shows an asset's bill in a modal: images inline, PDFs in the browser's PDF viewer.
 * `target` is { assetId, bill } (null = closed).
 */
export default function AssetBillViewer({ target, onClose }) {
  // Keep showing the last bill after `target` goes null: the modal still renders while it fades out.
  const [shown, setShown] = useState(target);
  if (target && target !== shown) setShown(target);
  const bill = shown?.bill;
  const [file, setFile] = useState({ loading: false, error: null, url: null });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!target) return undefined;
    const controller = new AbortController();
    let url = null;
    setFile({ loading: true, error: null, url: null });
    (async () => {
      try {
        url = await fetchBillUrl(target.assetId, target.bill, { signal: controller.signal });
        setFile({ loading: false, error: null, url });
      } catch (err) {
        if (controller.signal.aborted) return;
        setFile({ loading: false, error: getErrorMessage(err), url: null });
      }
    })();
    return () => {
      controller.abort();
      // Freed a little later: the modal is still fading out, and an "Open in new tab" may still be loading it.
      if (url) setTimeout(() => URL.revokeObjectURL(url), 60_000);
    };
  }, [target, reloadKey]);

  let body;
  if (file.error) {
    body = (
      <ErrorState variant="page" title="Couldn't load the bill" message={file.error} onRetry={() => setReloadKey((k) => k + 1)} />
    );
  } else if (!file.url) {
    body = (
      <div style={{ padding: '96px 0', textAlign: 'center' }}>
        <Spin size="large" tip="Loading bill…">
          <div style={{ height: 40 }} />
        </Spin>
      </div>
    );
  } else if (isPdf(bill)) {
    body = <iframe src={file.url} title={bill.filename} style={{ width: '100%', height: '75vh', border: 0, borderRadius: 8 }} />;
  } else {
    body = (
      <div style={{ display: 'grid', placeItems: 'center', background: 'var(--fs-bg)', borderRadius: 8, padding: 8 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- blob URL from an authenticated fetch */}
        <img src={file.url} alt={bill.filename} style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain' }} />
      </div>
    );
  }

  return (
    <Modal
      open={Boolean(target)}
      title={bill?.filename || 'Bill'}
      onCancel={onClose}
      width={isPdf(bill) ? 960 : 820}
      destroyOnHidden
      footer={
        <Space wrap style={{ justifyContent: 'flex-end' }}>
          {/* Phones often can't show a PDF inside the page — let them open it in the browser's own viewer. */}
          <Button icon={<ExportOutlined />} disabled={!file.url} onClick={() => window.open(file.url, '_blank')}>
            Open in new tab
          </Button>
          <Button icon={<DownloadOutlined />} disabled={!file.url} onClick={() => saveFile(file.url, bill.filename)}>
            Download
          </Button>
          <Button type="primary" onClick={onClose}>
            Close
          </Button>
        </Space>
      }
    >
      {body}
    </Modal>
  );
}
