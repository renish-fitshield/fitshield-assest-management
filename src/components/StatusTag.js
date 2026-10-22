import { memo } from 'react';
import { Tag } from 'antd';
import { STATUS_COLORS } from '@/lib/format';

function StatusTag({ value }) {
  if (!value) return '—';
  return <Tag color={STATUS_COLORS[value] || 'default'}>{value}</Tag>;
}

export default memo(StatusTag);
