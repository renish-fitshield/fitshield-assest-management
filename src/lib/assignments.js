import { ApiError, isValidId } from '@/lib/api';
import { ASSET_CONDITIONS, RETURN_STATUSES, isSingleUnit } from '@/lib/constants';
import Asset from '@/models/Asset';
import Employee from '@/models/Employee';
import Assignment from '@/models/Assignment';
import '@/models/User';

export const HOLDER_FIELDS = 'employeeId fullName department status';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dayStart = (d) => {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
};

/** Optional YYYY-MM-DD → Date (defaults to now); never in the future. */
function parseEventDate(value, field, label) {
  if (value === undefined || value === null || value === '') return new Date();
  if (typeof value !== 'string' || !DATE_RE.test(value) || Number.isNaN(new Date(value).getTime())) {
    throw new ApiError(`${label} must be a date (YYYY-MM-DD)`, 400, { [field]: `${label} is invalid` });
  }
  const date = new Date(value);
  if (date > dayStart(Date.now())) {
    throw new ApiError(`${label} cannot be in the future`, 400, { [field]: `${label} cannot be in the future` });
  }
  return date;
}

function optionalText(value, field, max = 500) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new ApiError(`${field} must be text`, 400, { [field]: 'Must be text' });
  const text = value.trim();
  if (text.length > max) throw new ApiError(`${field} is too long`, 400, { [field]: `Must be at most ${max} characters` });
  return text || undefined;
}

/**
 * Assign an Available asset to an employee.
 * The conditional update (assignedTo: null, status: 'Available') is the guard that makes
 * double-assignment impossible; the partial unique index on Assignment backs it up.
 */
export async function assignAsset({ assetId, body, userId }) {
  if (!isValidId(assetId)) throw new ApiError('Invalid asset id', 400);
  const employeeId = body?.employeeId;
  if (!employeeId || !isValidId(employeeId)) {
    throw new ApiError('Select an employee', 400, { employeeId: 'Select an employee' });
  }

  const [asset, employee] = await Promise.all([
    Asset.findById(assetId).populate('assignedTo', HOLDER_FIELDS),
    Employee.findById(employeeId),
  ]);
  if (!asset) throw new ApiError('Asset not found', 404);
  if (!employee) throw new ApiError('Employee not found', 400, { employeeId: 'Employee not found' });
  if (employee.status === 'Exited') {
    throw new ApiError(`${employee.fullName} has exited and cannot be assigned assets`, 400, {
      employeeId: 'Exited employees cannot be assigned assets',
    });
  }
  if (asset.assignedTo) {
    throw new ApiError(
      `${asset.assetId} is already assigned to ${asset.assignedTo.fullName} (${asset.assignedTo.employeeId}). Return it before assigning it again.`,
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

  const assignedAt = parseEventDate(body.assignedAt, 'assignedAt', 'Assignment date');
  if (asset.purchaseDate && dayStart(assignedAt) < dayStart(asset.purchaseDate)) {
    throw new ApiError('Assignment date cannot be before the purchase date', 400, {
      assignedAt: 'Cannot be before the purchase date',
    });
  }
  const notes = optionalText(body.notes, 'notes');

  const updated = await Asset.findOneAndUpdate(
    { _id: asset._id, assignedTo: null, status: 'Available', quantity: { $not: { $gt: 1 } } },
    { $set: { assignedTo: employee._id, assignedAt, status: 'Assigned' } },
    { new: true }
  );
  if (!updated) throw new ApiError('This asset was just assigned or changed by someone else. Refresh and try again.', 409);

  try {
    await Assignment.init(); // make sure the one-open-assignment index exists
    await Assignment.create({
      asset: asset._id,
      employee: employee._id,
      assignedAt,
      assignedBy: isValidId(userId) ? userId : null,
      conditionAtAssign: asset.condition,
      notes,
    });
  } catch (err) {
    // Roll the asset back so it never shows as assigned without a history record.
    await Asset.updateOne(
      { _id: asset._id, assignedTo: employee._id },
      { $set: { assignedTo: null, assignedAt: null, status: 'Available' } }
    );
    if (err?.code === 11000) throw new ApiError('This asset already has an open assignment.', 409);
    throw err;
  }

  return updated.populate({ path: 'assignedTo', select: HOLDER_FIELDS });
}

/** Return an assigned asset; optionally record its condition and send it for repair. */
export async function returnAsset({ assetId, body, userId }) {
  if (!isValidId(assetId)) throw new ApiError('Invalid asset id', 400);
  const asset = await Asset.findById(assetId);
  if (!asset) throw new ApiError('Asset not found', 404);
  if (!asset.assignedTo) throw new ApiError(`${asset.assetId} is not currently assigned to anyone.`, 409);

  const statusAfter = body?.statusAfter || 'Available';
  if (!RETURN_STATUSES.includes(statusAfter)) {
    throw new ApiError(`Status after return must be one of: ${RETURN_STATUSES.join(', ')}`, 400, {
      statusAfter: 'Invalid status',
    });
  }
  const condition = body?.condition || undefined;
  if (condition && !ASSET_CONDITIONS.includes(condition)) {
    throw new ApiError('Invalid condition', 400, { condition: 'Invalid condition' });
  }

  const open = await Assignment.findOne({ asset: asset._id, active: true });
  const returnedAt = parseEventDate(body?.returnedAt, 'returnedAt', 'Return date');
  const since = open?.assignedAt || asset.assignedAt;
  if (since && dayStart(returnedAt) < dayStart(since)) {
    throw new ApiError('Return date cannot be before the assignment date', 400, {
      returnedAt: 'Cannot be before the assignment date',
    });
  }
  const returnNotes = optionalText(body?.notes, 'notes');

  const updated = await Asset.findOneAndUpdate(
    { _id: asset._id, assignedTo: asset.assignedTo },
    {
      $set: {
        assignedTo: null,
        assignedAt: null,
        status: statusAfter,
        ...(condition ? { condition } : {}),
      },
    },
    { new: true }
  );
  if (!updated) throw new ApiError('This asset was just changed by someone else. Refresh and try again.', 409);

  if (open) {
    open.set({
      active: false,
      returnedAt,
      returnedBy: isValidId(userId) ? userId : null,
      conditionAtReturn: condition || asset.condition,
      returnNotes,
    });
    await open.save();
  }

  return updated;
}

/** Assignment history for an asset or an employee (newest first). */
export function findAssignments(filter, populate) {
  return Assignment.find(filter)
    .sort({ assignedAt: -1, _id: -1 })
    .limit(200)
    .populate(populate)
    .populate('assignedBy', 'name')
    .populate('returnedBy', 'name')
    .lean();
}
