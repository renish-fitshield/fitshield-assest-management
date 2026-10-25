import dayjs from 'dayjs';

// Dates are stored as UTC midnight (YYYY-MM-DD); read the date part so the timezone can't shift the day.
export const toDayjs = (value) => (value ? dayjs(String(value).slice(0, 10)) : null);

export const formatDate = (value) => (value ? toDayjs(value).format('DD MMM YYYY') : '—');

export const formatDateTime = (value) => (value ? dayjs(value).format('DD MMM YYYY, hh:mm A') : '—');

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
export const formatCurrency = (value) => (value === null || value === undefined ? '—' : inr.format(value));

// Indian short form: 56,500 → ₹56.5k, 4,49,000 → ₹4.49L, 2,50,00,000 → ₹2.5Cr.
// Truncates (not rounds) to 2 decimals so the short form never overstates the amount.
const COMPACT_UNITS = [
  { size: 1e7, suffix: 'Cr' },
  { size: 1e5, suffix: 'L' },
  { size: 1e3, suffix: 'k' },
];
export const formatCompactCurrency = (value) => {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  const unit = COMPACT_UNITS.find((u) => Math.abs(n) >= u.size);
  if (!unit) return formatCurrency(n).replace(/\.00$/, '');
  const short = Math.trunc((n / unit.size) * 100) / 100;
  return `${n < 0 ? '-' : ''}₹${Math.abs(short)}${unit.suffix}`;
};

export const STATUS_COLORS = {
  // asset status
  Available: 'green',
  Assigned: 'blue',
  'Under Repair': 'orange',
  Retired: 'default',
  Lost: 'red',
  // condition
  New: 'cyan',
  Good: 'green',
  Fair: 'gold',
  Poor: 'orange',
  Damaged: 'red',
  // warranty
  'Not Applicable': 'default',
  // employee status (Active shared with warranty)
  Active: 'green',
  Expired: 'red',
  'On Notice': 'orange',
  Exited: 'default',
  // acknowledgement
  Pending: 'gold',
  Acknowledged: 'green',
};
