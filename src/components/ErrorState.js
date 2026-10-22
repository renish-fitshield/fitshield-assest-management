'use client';

import { memo } from 'react';
import { Alert, Button, Result } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

/**
 * Error display with a retry action.
 * variant="banner" keeps existing content visible; variant="page" replaces it.
 */
function ErrorState({ message, onRetry, retrying = false, variant = 'banner', title = 'Something went wrong' }) {
  const retry = onRetry ? (
    <Button size={variant === 'banner' ? 'small' : 'middle'} icon={<ReloadOutlined />} onClick={onRetry} loading={retrying}>
      Try again
    </Button>
  ) : null;

  if (variant === 'page') {
    return <Result status="warning" title={title} subTitle={message} extra={retry} />;
  }
  return <Alert type="error" showIcon message={message} action={retry} style={{ marginBottom: 16 }} />;
}

export default memo(ErrorState);
