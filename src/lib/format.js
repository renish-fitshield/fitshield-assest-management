import dayjs from 'dayjs';

// Dates are stored as UTC midnight (YYYY-MM-DD); read the date part so the timezone can't shift the day.
export const toDayjs = (value) => (value ? dayjs(String(value).slice(0, 10)) : null);

export const formatDate = (value) => (value ? toDayjs(value).format('DD MMM YYYY') : '—');

export const formatDateTime = (value) => (value ? dayjs(value).format('DD MMM YYYY, hh:mm A') : '—');

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
export const formatCurrency = (value) => (value === null || value === undefined ? '—' : inr.format(value));

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
};
