import mongoose from 'mongoose';
import { ApiError, escapeRegex, isValidId } from '@/lib/api';
import { enumValue } from '@/lib/listRequest';
import {
  ASSET_STATUSES,
  ASSET_CONDITIONS,
  PURCHASE_TYPES,
  WARRANTY_STATUSES,
  RETURN_DUE_FILTERS,
  DUE_SOON_DAYS,
  ACK_STATUSES,
} from '@/lib/constants';

/** Keys accepted in `body.filter` (plus `searchText`) by the asset list and the dashboard. */
export const ASSET_FILTER_KEYS = [
  'assignedTo',
  'categoryId',
  'status',
  'condition',
  'purchaseType',
  'location',
  'warrantyStatus',
  'purchasedFrom',
  'purchasedTo',
  'assignable', // "true" → only assets that can be assigned now (Available, unassigned, quantity 1)
  'returnDue', // "Overdue" | "Due in 7 days" — by the current holder's expected return date
  'assigned', // "true" → only assets someone holds right now
  'acknowledgement', // "Pending" | "Acknowledged" — whether the current holder has acknowledged receipt
];

export const ASSET_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'assetId',
  'itemName',
  'quantity',
  'category',
  'status',
  'condition',
  'cost',
  'purchaseDate',
  'warrantyUntil',
  'location',
  'assignedAt',
  'expectedReturnAt',
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function dateValue(filter, key) {
  const value = filter[key];
  if (!value) return null;
  const d = new Date(value);
  if (!DATE_RE.test(value) || Number.isNaN(d.getTime())) {
    throw new ApiError(`Invalid filter.${key}: expected YYYY-MM-DD`, 400);
  }
  return d;
}

const startOfToday = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

/**
 * Builds a Mongo filter from a parsed `body.filter` (see listRequest.parseFilter).
 * Shared by the asset list and the dashboard so both filter identically.
 * Invalid values throw ApiError(400).
 */
export function buildAssetFilter(filter) {
  const query = {};

  const enums = {
    status: ASSET_STATUSES,
    condition: ASSET_CONDITIONS,
    purchaseType: PURCHASE_TYPES,
  };
  for (const [key, allowed] of Object.entries(enums)) {
    const value = enumValue(filter, key, allowed);
    if (value) query[key] = value;
  }

  if (filter.assignable) {
    if (filter.assignable !== 'true') throw new ApiError('Invalid filter.assignable: expected "true"', 400);
    query.status = 'Available';
    query.assignedTo = null;
    query.quantity = { $not: { $gt: 1 } }; // quantity 1 (or missing on old records)
  }

  if (filter.assigned) {
    if (filter.assigned !== 'true') throw new ApiError('Invalid filter.assigned: expected "true"', 400);
    query.assignedTo = { $ne: null };
  }
  const ack = enumValue(filter, 'acknowledgement', ACK_STATUSES);
  if (ack) query['acknowledgement.status'] = ack; // only set while assigned

  if (filter.location) query.location = new RegExp(`^${escapeRegex(filter.location)}$`, 'i');

  if (filter.assignedTo) {
    if (!isValidId(filter.assignedTo)) throw new ApiError('Invalid filter.assignedTo: expected an employee id', 400);
    query.assignedTo = filter.assignedTo;
  }

  if (filter.categoryId) {
    if (!isValidId(filter.categoryId)) throw new ApiError('Invalid filter.categoryId: expected a category id', 400);
    // An ObjectId, not the string: the dashboard runs this filter in an aggregation, which doesn't cast.
    query.categoryId = new mongoose.Types.ObjectId(filter.categoryId);
  }

  const today = startOfToday();
  switch (enumValue(filter, 'warrantyStatus', WARRANTY_STATUSES)) {
    case 'Active':
      query.warrantyUntil = { $gte: today };
      break;
    case 'Expired':
      query.warrantyUntil = { $lt: today };
      break;
    case 'Not Applicable':
      query.warrantyUntil = null; // matches null and missing
      break;
    default:
  }

  // Only assigned assets have an expected return date (it's cleared on return).
  switch (enumValue(filter, 'returnDue', RETURN_DUE_FILTERS)) {
    case 'Overdue':
      query.expectedReturnAt = { $lt: today };
      break;
    case 'Due in 7 days':
      query.expectedReturnAt = { $gte: today, $lt: new Date(today.getTime() + (DUE_SOON_DAYS + 1) * 86400000) };
      break;
    default:
  }

  const from = dateValue(filter, 'purchasedFrom');
  const to = dateValue(filter, 'purchasedTo');
  if (from && to && from > to) throw new ApiError('filter.purchasedFrom must be on or before filter.purchasedTo', 400);
  if (from || to) {
    query.purchaseDate = {};
    if (from) query.purchaseDate.$gte = from;
    if (to) query.purchaseDate.$lte = to;
  }

  if (filter.searchText) {
    const rx = new RegExp(escapeRegex(filter.searchText), 'i');
    query.$or = [
      { assetId: rx },
      { itemName: rx },
      { brand: rx },
      { modelName: rx },
      { serialNumber: rx },
      { location: rx },
      { vendorName: rx },
      { invoiceNumber: rx },
    ];
  }

  return query;
}
