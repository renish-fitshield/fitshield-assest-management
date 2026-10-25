import { isValidId } from '@/lib/api';
import User from '@/models/User';

/**
 * Asset activity log helpers: who is acting, and what changed (field → before / after).
 * Entries are pushed onto `asset.activities` in the same write as the change itself.
 */

/** The logged-in user making this request (middleware puts their id in x-user-id), as stored in history. */
export async function getActor(req) {
  const id = req.headers.get('x-user-id');
  const fallback = { user: isValidId(id) ? id : null, name: req.headers.get('x-user-email') || 'Unknown user' };
  if (!isValidId(id)) return fallback;
  try {
    const user = await User.findById(id, 'name').lean();
    return user ? { user: user._id, name: user.name || fallback.name } : fallback;
  } catch (err) {
    // Who did it is still known (id + email from the verified token); don't block the change over the name.
    console.error('[activity] could not look up the acting user:', err?.message);
    return fallback;
  }
}

// Every field the asset form can change (ASSET_FIELDS, with the category by name), plus the bill.
const TRACKED_FIELDS = [
  'category',
  'itemName',
  'quantity',
  'brand',
  'modelName',
  'serialNumber',
  'specifications',
  'location',
  'condition',
  'purchaseDate',
  'cost',
  'vendorName',
  'invoiceNumber',
  'warrantyUntil',
  'purchaseCity',
  'purchaseType',
  'purchasedBy',
  'status',
  'remarks',
];

/** The tracked values of an asset right now. Take one before and one after a change, then diff them. */
export function snapshot(asset) {
  const values = Object.fromEntries(TRACKED_FIELDS.map((f) => [f, asset[f]]));
  values.bill = asset.bill?.filename ?? null;
  return values;
}

// Empty values ('', null, undefined) are all "not set"; dates compare by time.
const normalise = (v) => {
  if (v === undefined || v === null || v === '') return null;
  if (v instanceof Date) return v.getTime();
  return v;
};
const stored = (v) => (v === undefined || v === '' ? null : v);

/** [{ field, before, after }] for every field whose value really changed. */
export function diff(before, after) {
  return Object.keys(after)
    .filter((field) => normalise(before[field]) !== normalise(after[field]))
    .map((field) => ({ field, before: stored(before[field]), after: stored(after[field]) }));
}

export const activity = (action, actor, { changes = [], note } = {}) => ({
  action,
  changes,
  ...(note ? { note } : {}),
  by: actor,
  at: new Date(),
});

/** "Priya Sharma (EMP-0003)" — how a holder appears in the activity log. */
export const holderLabel = (holder) =>
  holder ? `${holder.fullName}${holder.employeeId ? ` (${holder.employeeId})` : ''}` : null;
