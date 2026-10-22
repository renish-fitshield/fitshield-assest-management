'use client';

import { memo, useEffect, useState } from 'react';
import { Skeleton } from 'antd';
import { PictureOutlined, WarningOutlined } from '@ant-design/icons';
import api from '@/services/axios';

// Image bytes are fetched with the auth token (an <img src> can't send it) and kept as object
// URLs per fileId. A fileId never changes content — replacing an image creates a new fileId.
const cache = new Map();

function loadImage(assetId, fileId) {
  if (!cache.has(fileId)) {
    const promise = api
      .get(`/assets/${assetId}/image/${fileId}`, { responseType: 'blob' })
      .then((res) => URL.createObjectURL(res.data))
      .catch((err) => {
        cache.delete(fileId); // allow a retry next time
        throw err;
      });
    cache.set(fileId, promise);
  }
  return cache.get(fileId);
}

/** Shows an asset's photo, or a placeholder when it has none. */
function AssetImage({ assetId, image, size = 40, radius = 8, style }) {
  const fileId = image?.fileId ? String(image.fileId) : null;
  const [state, setState] = useState({ url: null, error: false });

  useEffect(() => {
    if (!fileId) return undefined;
    let alive = true;
    setState({ url: null, error: false });
    (async () => {
      try {
        const url = await loadImage(assetId, fileId);
        if (alive) setState({ url, error: false });
      } catch {
        if (alive) setState({ url: null, error: true });
      }
    })();
    return () => {
      alive = false;
    };
  }, [assetId, fileId]);

  const box = {
    width: size,
    height: size,
    borderRadius: radius,
    flex: 'none',
    overflow: 'hidden',
    display: 'grid',
    placeItems: 'center',
    background: 'var(--fs-bg)',
    border: '1px solid var(--fs-line)',
    color: 'var(--fs-muted-light)',
    fontSize: Math.max(14, size / 3),
    ...style,
  };

  if (!fileId) {
    return (
      <span style={box} aria-label="No image">
        <PictureOutlined />
      </span>
    );
  }
  if (state.error) {
    return (
      <span style={box} title="Image could not be loaded">
        <WarningOutlined />
      </span>
    );
  }
  if (!state.url) {
    return <Skeleton.Image active style={{ width: size, height: size, borderRadius: radius }} />;
  }
  return (
    <span style={box}>
      {/* eslint-disable-next-line @next/next/no-img-element -- blob URL from an authenticated fetch */}
      <img src={state.url} alt="Asset" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </span>
  );
}

export default memo(AssetImage);
