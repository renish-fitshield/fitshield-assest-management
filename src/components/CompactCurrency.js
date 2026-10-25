import { memo } from 'react';
import { formatCompactCurrency, formatCurrency } from '@/lib/format';

// Short amount (₹31.5k) with the exact amount on hover.
function CompactCurrency({ value }) {
  if (value === null || value === undefined) return '—';
  return <span title={formatCurrency(value)}>{formatCompactCurrency(value)}</span>;
}

export default memo(CompactCurrency);
