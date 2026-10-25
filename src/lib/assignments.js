import mongoose from 'mongoose';
import { ApiError, isValidId } from '@/lib/api';
import { ASSET_CONDITIONS, RETURN_STATUSES, isSingleUnit } from '@/lib/constants';
import { activity, holderLabel } from '@/lib/activity';
import { sendHandOverEmails, sidesFor } from '@/lib/acknowledgements';
import Asset from '@/models/Asset';
import Employee from '@/models/Employee';

/**
 * Asset assignment: Assign (to an employee), Transfer (straight to another employee) and Return.
 *
 * Every action is ONE atomic update of the asset that, together:
 *   - changes its state (holder, status, condition, dates),
 *   - appends an entry to `assignmentHistory`, and
 *   - appends an entry to `activities` (field-by-field before → after).
 * The update only matches the version of the asset that was checked (`__v`), so two people acting
 * at once can't both succeed: the second gets a 409 and must refresh. State and history can never
 * disagree, and history is always in date order (each hand-over is dated on/after the previous one).
 */

export const HOLDER_FIELDS = 'employeeId fullName department status';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dayStart = (d) => {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
};
const showDate = (d) =>
  new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(d));

function parseDate(value, field, label) {
  if (typeof value !== 'string' || !DATE_RE.test(value) || Number.isNaN(new Date(value).getTime())) {
    throw new ApiError(`${label} must be a date (YYYY-MM-DD)`, 400, { [field]: `${label} is invalid` });
  }
  return new Date(value);
}

/** Hand-over date: optional YYYY-MM-DD (defaults to today), never in the future. */
function parseEventDate(value, field, label) {
  if (value === undefined || value === null || value === '') return dayStart(Date.now());
  const date = parseDate(value, field, label);
  if (date > dayStart(Date.now())) {
    throw new ApiError(`${label} cannot be in the future`, 400, { [field]: `${label} cannot be in the future` });
  }
  return date;
}

/** Optional due-back date; on or after the hand-over date. */
function parseExpectedReturn(value, handOverDate) {
  if (value === undefined || value === null || value === '') return null;
  const date = parseDate(value, 'expectedReturnAt', 'Expected return date');
  if (date < dayStart(handOverDate)) {
    throw new ApiError('Expected return date cannot be before the hand-over date', 400, {
      expectedReturnAt: 'Must be on or after the hand-over date',
    });
  }
  return date;
}

function parseCondition(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (!ASSET_CONDITIONS.includes(value)) throw new ApiError('Invalid condition', 400, { condition: 'Select a valid condition' });
  return value;
}

function optionalText(value, field, max = 500, label = 'Notes') {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new ApiError(`${label} must be text`, 400, { [field]: 'Must be text' });
  const text = value.trim();
  if (text.length > max) {
    throw new ApiError(`${label} must be at most ${max} characters`, 400, { [field]: `Must be at most ${max} characters` });
  }
  return text || undefined;
}

/** The asset with its current holder and only its LAST hand-over (enough to check dates). */
async function loadAsset(assetId) {
  if (!isValidId(assetId)) throw new ApiError('Invalid asset id', 400);
  const asset = await Asset.findById(assetId)
    .select({ activities: 0, assignmentHistory: { $slice: -1 } })
    .populate('assignedTo', HOLDER_FIELDS)
    .lean();
  if (!asset) throw new ApiError('Asset not found', 404);
  return asset;
}

/** The employee receiving the asset: must exist and must not have exited. */
async function loadRecipient(employeeId) {
  if (!employeeId || !isValidId(employeeId)) {
    throw new ApiError('Select an employee', 400, { employeeId: 'Select an employee' });
  }
  const employee = await Employee.findById(employeeId, HOLDER_FIELDS).lean();
  if (!employee) throw new ApiError('Employee not found', 400, { employeeId: 'This employee no longer exists' });
  if (employee.status === 'Exited') {
    throw new ApiError(`${employee.fullName} has exited and cannot be given assets`, 400, {
      employeeId: 'Exited employees cannot be given assets',
    });
  }
  return employee;
}

const toHolder = (e) => ({ employee: e._id, employeeId: e.employeeId, fullName: e.fullName, department: e.department });

/** Keeps history in date order: a hand-over can't be dated before the previous one. */
function checkAfterLastHandOver(date, asset, field, label) {
  const last = asset.assignmentHistory?.[0];
  const floor = [last?.date, asset.assignedAt].filter(Boolean).sort((a, b) => b - a)[0];
  if (floor && dayStart(date) < dayStart(floor)) {
    const when = `${showDate(floor)}, when it was last ${(last?.action || 'Assigned').toLowerCase()}`;
    throw new ApiError(`${label} can't be before ${when}`, 400, { [field]: `Can't be before ${when}` });
  }
}

const changeIf = (field, before, after) =>
  String(before ?? '') === String(after ?? '') ? [] : [{ field, before: before ?? null, after: after ?? null }];

const sameDay = (a, b) => (a ? dayStart(a).getTime() : null) === (b ? dayStart(b).getTime() : null);

/**
 * The one atomic write: new state + history entry (with its acknowledgements set to Pending) + activity
 * entry, only if nothing changed since loading. Then the employee(s) involved are emailed their
 * acknowledgement link; a failed email never undoes the hand-over (it's recorded and can be resent).
 * → { item, handOver, emails: [{ side, to, status, error?, previewUrl? }] }  (emails: null when deferred)
 */
async function commit(asset, { set, event, act, origin, deferEmails = false }) {
  const sides = sidesFor(event.action);
  const handOver = {
    _id: new mongoose.Types.ObjectId(),
    ...event,
    ...(sides.includes('to') ? { toAck: { status: 'Pending' } } : {}),
    ...(sides.includes('from') ? { fromAck: { status: 'Pending' } } : {}),
  };
  // The holder's own acknowledgement status, shown in lists; cleared when the asset comes back.
  const acknowledgement = sides.includes('to') ? { eventId: handOver._id, status: 'Pending' } : null;

  // If this write fails, nothing was saved and the error goes back to the admin as-is.
  const item = await Asset.findOneAndUpdate(
    { _id: asset._id, __v: asset.__v ?? { $exists: false } },
    { $set: { ...set, acknowledgement }, $push: { assignmentHistory: handOver, activities: act }, $inc: { __v: 1 } },
    { new: true, runValidators: true, projection: { assignmentHistory: 0, activities: 0 } }
  );
  if (!item) throw new ApiError('This asset was changed by someone else just now. Refresh and try again.', 409, undefined, 'CONFLICT');

  // From here on the hand-over IS saved: nothing below may turn the response into an error, or the
  // admin would retry something that already happened.
  try {
    await item.populate('assignedTo', HOLDER_FIELDS);
  } catch (err) {
    console.error(`[assign] hand-over ${handOver._id} saved, but loading the holder failed:`, err?.message);
  }
  if (deferEmails) return { item, handOver, emails: null };
  const emails = await sendHandOverEmails({ assetId: item._id, event: handOver, origin });
  return { item, handOver, emails };
}

/** Assign an unassigned, Available, single-unit asset to an employee. */
export async function assignAsset({ assetId, body, actor, origin, deferEmails }) {
  const asset = await loadAsset(assetId);
  if (asset.assignedTo) {
    throw new ApiError(
      `${asset.assetId} is already assigned to ${asset.assignedTo.fullName} (${asset.assignedTo.employeeId}). Transfer or return it instead.`,
      409
    );
  }
  if (asset.status !== 'Available') {
    throw new ApiError(`Only Available assets can be assigned — ${asset.assetId} is ${asset.status}.`, 409);
  }
  if (!isSingleUnit(asset)) {
    throw new ApiError(
      `${asset.assetId} has a quantity of ${asset.quantity}. Only assets with quantity 1 can be assigned to an employee.`,
      409
    );
  }

  const employee = await loadRecipient(body?.employeeId);
  const date = parseEventDate(body?.assignedAt, 'assignedAt', 'Assignment date');
  if (asset.purchaseDate && dayStart(date) < dayStart(asset.purchaseDate)) {
    throw new ApiError('Assignment date cannot be before the purchase date', 400, {
      assignedAt: `Can't be before the purchase date (${showDate(asset.purchaseDate)})`,
    });
  }
  checkAfterLastHandOver(date, asset, 'assignedAt', 'Assignment date');
  const expectedReturnAt = parseExpectedReturn(body?.expectedReturnAt, date);
  const condition = parseCondition(body?.condition, asset.condition);
  const notes = optionalText(body?.notes, 'notes');
  const to = toHolder(employee);

  return commit(asset, {
    origin,
    deferEmails,
    set: { assignedTo: employee._id, assignedAt: date, expectedReturnAt, status: 'Assigned', condition },
    event: { action: 'Assigned', to, date, condition, expectedReturnAt: expectedReturnAt ?? undefined, notes, by: actor, at: new Date() },
    act: activity('Assigned', actor, {
      note: `Assigned to ${holderLabel(to)}`,
      changes: [
        ...changeIf('status', asset.status, 'Assigned'),
        ...changeIf('assignedTo', null, holderLabel(to)),
        ...changeIf('condition', asset.condition, condition),
        ...changeIf('expectedReturnAt', null, expectedReturnAt),
      ],
    }),
  });
}

/** Hand an assigned asset straight to another employee (no return in between). */
export async function transferAsset({ assetId, body, actor, origin }) {
  const asset = await loadAsset(assetId);
  if (!asset.assignedTo) throw new ApiError(`${asset.assetId} isn't assigned to anyone — use Assign instead.`, 409);

  const employee = await loadRecipient(body?.employeeId);
  if (String(employee._id) === String(asset.assignedTo._id)) {
    throw new ApiError(`${asset.assetId} is already with ${employee.fullName}`, 400, {
      employeeId: 'The asset is already with this employee',
    });
  }
  const date = parseEventDate(body?.transferredAt, 'transferredAt', 'Transfer date');
  checkAfterLastHandOver(date, asset, 'transferredAt', 'Transfer date');
  const expectedReturnAt = parseExpectedReturn(body?.expectedReturnAt, date);
  const condition = parseCondition(body?.condition, asset.condition);
  const notes = optionalText(body?.notes, 'notes');
  const from = toHolder(asset.assignedTo);
  const to = toHolder(employee);

  return commit(asset, {
    origin,
    set: { assignedTo: employee._id, assignedAt: date, expectedReturnAt, condition },
    event: {
      action: 'Transferred',
      from,
      to,
      date,
      condition,
      expectedReturnAt: expectedReturnAt ?? undefined,
      notes,
      by: actor,
      at: new Date(),
    },
    act: activity('Transferred', actor, {
      note: `Transferred from ${holderLabel(from)} to ${holderLabel(to)}`,
      changes: [
        ...changeIf('assignedTo', holderLabel(from), holderLabel(to)),
        ...changeIf('condition', asset.condition, condition),
        ...(sameDay(asset.expectedReturnAt, expectedReturnAt) ? [] : [{ field: 'expectedReturnAt', before: asset.expectedReturnAt ?? null, after: expectedReturnAt }]),
      ],
    }),
  });
}

/** Take an asset back from its holder; it becomes Available, Under Repair, Retired or Lost. */
export async function returnAsset({ assetId, body, actor, origin }) {
  const asset = await loadAsset(assetId);
  if (!asset.assignedTo) throw new ApiError(`${asset.assetId} is not currently assigned to anyone.`, 409);

  const statusAfter = body?.statusAfter || 'Available';
  if (!RETURN_STATUSES.includes(statusAfter)) {
    throw new ApiError(`Status after return must be one of: ${RETURN_STATUSES.join(', ')}`, 400, {
      statusAfter: 'Invalid status',
    });
  }
  const date = parseEventDate(body?.returnedAt, 'returnedAt', 'Return date');
  checkAfterLastHandOver(date, asset, 'returnedAt', 'Return date');
  const condition = parseCondition(body?.condition, asset.condition);
  const notes = optionalText(body?.notes, 'notes');
  const from = toHolder(asset.assignedTo);

  return commit(asset, {
    origin,
    set: { assignedTo: null, assignedAt: null, expectedReturnAt: null, status: statusAfter, condition },
    event: { action: 'Returned', from, date, condition, statusAfter, notes, by: actor, at: new Date() },
    act: activity('Returned', actor, {
      note: `Returned by ${holderLabel(from)}`,
      changes: [
        ...changeIf('status', asset.status, statusAfter),
        ...changeIf('assignedTo', holderLabel(from), null),
        ...changeIf('condition', asset.condition, condition),
        ...(asset.expectedReturnAt ? [{ field: 'expectedReturnAt', before: asset.expectedReturnAt, after: null }] : []),
      ],
    }),
  });
}

export const MAX_BULK_ASSIGN = 25;

const DB_DOWN = /MongoServerSelectionError|MongoNetwork|MongoNotConnected|MongoPoolCleared|buffering timed out/i;
/** A safe, useful message for an error we didn't anticipate (details go to the server log). */
const unexpectedMessage = (err) =>
  DB_DOWN.test(`${err?.name} ${err?.message}`)
    ? 'The database was unavailable, so this asset was not assigned. Please try it again.'
    : 'Something went wrong assigning this asset, so it was not assigned. Please try it again.';

/**
 * Assign several assets to one employee in one go (e.g. laptop, mouse, keyboard). Each asset is still
 * its own atomic hand-over with its own acknowledgement email; one that can't be assigned doesn't stop
 * the others. Each asset keeps its own condition.
 * → [{ assetId, ok: true, item, emails } | { assetId, ok: false, error }]
 */
export async function assignMany({ body, actor, origin }) {
  const ids = Array.isArray(body?.assetIds) ? [...new Set(body.assetIds.map(String))] : [];
  if (!ids.length) throw new ApiError('Select at least one asset', 400, { assetIds: 'Select at least one asset' });
  if (ids.length > MAX_BULK_ASSIGN) {
    throw new ApiError(`Assign at most ${MAX_BULK_ASSIGN} assets at a time`, 400, { assetIds: `At most ${MAX_BULK_ASSIGN} assets` });
  }
  // Check what applies to every asset once, up front.
  await loadRecipient(body.employeeId);
  const date = parseEventDate(body.assignedAt, 'assignedAt', 'Assignment date');
  parseExpectedReturn(body.expectedReturnAt, date);
  optionalText(body.notes, 'notes');

  const shared = { employeeId: body.employeeId, assignedAt: body.assignedAt, expectedReturnAt: body.expectedReturnAt, notes: body.notes };
  const results = [];
  // Hand-overs one at a time (each is its own atomic write)…
  for (const assetId of ids) {
    try {
      const { item, handOver } = await assignAsset({ assetId, body: shared, actor, origin, deferEmails: true });
      results.push({ assetId, ok: true, item, handOver });
    } catch (err) {
      // Earlier assets in the batch are already assigned, so even an unexpected error (e.g. the database
      // dropping) is reported for this asset only — never as a failure of the whole request.
      if (!(err instanceof ApiError)) console.error(`[assign] bulk: asset ${assetId} failed unexpectedly:`, err);
      results.push({ assetId, ok: false, error: err instanceof ApiError ? err.message : unexpectedMessage(err) });
    }
  }
  // …then the emails, a few at a time, so a big batch stays well within the request time limit.
  const done = results.filter((r) => r.ok);
  for (let i = 0; i < done.length; i += EMAIL_CONCURRENCY) {
    await Promise.all(
      done.slice(i, i + EMAIL_CONCURRENCY).map(async (r) => {
        r.emails = await sendHandOverEmails({ assetId: r.item._id, event: r.handOver, origin });
        delete r.handOver;
      })
    );
  }
  return results;
}

const EMAIL_CONCURRENCY = 5;

/**
 * Every period an employee held an asset (newest first), built from the assets' hand-over history:
 * { asset, startedAt, startAction, receivedFrom?, assignedBy, conditionAtStart, expectedReturnAt, notes,
 *   current, endedAt?, endAction?, endedBy?, transferredTo?, returnCondition?, statusAfter?, endNotes? }
 */
export async function employeeAssignmentHistory(employeeId) {
  const assets = await Asset.find(
    { 'assignmentHistory.to.employee': employeeId },
    'assetId itemName category serialNumber image assignmentHistory'
  ).lean();

  const id = String(employeeId);
  const periods = [];
  for (const { assignmentHistory, ...asset } of assets) {
    let open = null;
    for (const e of assignmentHistory ?? []) {
      // Stored in order, so each hand-over away from this employee closes their open period.
      if (open && e.from && String(e.from.employee) === id) {
        periods.push({
          ...open,
          current: false,
          endedAt: e.date,
          endAction: e.action,
          endedBy: e.by,
          transferredTo: e.action === 'Transferred' ? e.to : undefined,
          returnCondition: e.action === 'Returned' ? e.condition : undefined,
          statusAfter: e.statusAfter,
          endNotes: e.notes,
          returnAck: e.fromAck,
        });
        open = null;
      }
      if (e.to && String(e.to.employee) === id) {
        open = {
          key: String(e._id),
          asset,
          startedAt: e.date,
          startAction: e.action,
          receivedFrom: e.action === 'Transferred' ? e.from : undefined,
          assignedBy: e.by,
          conditionAtStart: e.condition,
          expectedReturnAt: e.expectedReturnAt,
          notes: e.notes,
          receiptAck: e.toAck,
        };
      }
    }
    if (open) periods.push({ ...open, current: true });
  }
  return periods.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
}
