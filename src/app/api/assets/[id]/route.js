import { connectDB } from '@/lib/db';
import { ok, fail, handleError, pickFields, isValidId, readJson } from '@/lib/api';
import { deleteImage } from '@/lib/assetImages';
import { HOLDER_FIELDS } from '@/lib/assignments';
import Asset, { ASSET_FIELDS } from '@/models/Asset';
import Employee from '@/models/Employee';

const POPULATE = [
  { path: 'purchasedBy', select: 'employeeId fullName' },
  { path: 'assignedTo', select: HOLDER_FIELDS },
];

export async function GET(_req, { params }) {
  try {
    const { id } = await params;
    if (!isValidId(id)) return fail('Invalid asset id', 400);
    await connectDB();
    const asset = await Asset.findById(id).populate(POPULATE);
    if (!asset) return fail('Asset not found', 404);
    return ok({ item: asset });
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(req, { params }) {
  try {
    const { id } = await params;
    if (!isValidId(id)) return fail('Invalid asset id', 400);
    await connectDB();
    const data = pickFields(await readJson(req), ASSET_FIELDS);
    if (data.status === null) delete data.status;

    if (data.purchasedBy) {
      if (!isValidId(data.purchasedBy) || !(await Employee.exists({ _id: data.purchasedBy }))) {
        return fail('Selected employee does not exist', 400, {
          fields: { purchasedBy: 'Selected employee does not exist' },
        });
      }
    }

    // Load + save (instead of findByIdAndUpdate) so cross-field validators see the whole document.
    const asset = await Asset.findById(id);
    if (!asset) return fail('Asset not found', 404);

    // "Assigned" is controlled by the assign/return APIs so status and holder never disagree.
    if (data.status === 'Assigned' && !asset.assignedTo) {
      const msg = 'Use "Assign" to give this asset to an employee';
      return fail(msg, 400, { fields: { status: msg } });
    }
    if (asset.assignedTo && data.status && data.status !== 'Assigned') {
      const msg = 'Return the asset before changing its status';
      return fail(msg, 400, { fields: { status: msg } });
    }

    asset.set(data);
    // Fail (409) instead of overwriting if the asset was assigned/returned since we loaded it.
    asset.$where = { assignedTo: asset.assignedTo ?? null };
    await asset.save();
    await asset.populate(POPULATE);

    return ok({ item: asset, message: 'Asset updated' });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req, { params }) {
  try {
    const { id } = await params;
    if (!isValidId(id)) return fail('Invalid asset id', 400);
    await connectDB();
    // Only unassigned assets can be deleted (the filter makes this race-free).
    const asset = await Asset.findOneAndDelete({ _id: id, assignedTo: null });
    if (!asset) {
      const existing = await Asset.findById(id).populate('assignedTo', 'fullName employeeId');
      if (!existing) return fail('Asset not found', 404);
      return fail(
        `${existing.assetId} is assigned to ${existing.assignedTo?.fullName ?? 'an employee'}. Return it before deleting.`,
        409
      );
    }
    await deleteImage(asset.image?.fileId);
    return ok({ id, message: 'Asset deleted' });
  } catch (err) {
    return handleError(err);
  }
}
