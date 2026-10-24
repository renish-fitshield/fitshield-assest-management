import { connectDB } from '@/lib/db';
import { ok, fail, handleError, pickFields, isValidId, readJson } from '@/lib/api';
import { deleteImage } from '@/lib/assetImages';
import { storeBill, deleteBill } from '@/lib/assetBills';
import { HOLDER_FIELDS } from '@/lib/assignments';
import Asset, { ASSET_FIELDS } from '@/models/Asset';
import { resolveBrand } from '@/models/Brand';

const POPULATE = [{ path: 'assignedTo', select: HOLDER_FIELDS }];

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

/**
 * PUT /api/assets/:id — asset fields (ASSET_FIELDS), plus optional bill change:
 * `billUploadId` (a finished chunked upload, replaces the bill) or `removeBill: true`.
 */
export async function PUT(req, { params }) {
  try {
    const { id } = await params;
    if (!isValidId(id)) return fail('Invalid asset id', 400);
    await connectDB();
    const body = await readJson(req);
    const data = pickFields(body, ASSET_FIELDS);
    if (data.status === null) delete data.status;

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
    // Only single items can be assigned, so an assigned asset must stay at quantity 1.
    if (asset.assignedTo && typeof data.quantity === 'number' && data.quantity > 1) {
      const msg = 'Return the asset before raising its quantity — only quantity 1 can be assigned';
      return fail(msg, 400, { fields: { quantity: msg } });
    }

    asset.set(data);
    if (asset.brand && asset.isModified('brand')) {
      await asset.validate(); // don't save a new brand for an update that's going to be rejected
      asset.brand = await resolveBrand(asset.brand);
    }

    const previousBill = asset.bill?.fileId;
    let newBill = null;
    if (body.billUploadId) {
      await asset.validate(); // don't store a file for an update that's going to be rejected
      newBill = await storeBill(body.billUploadId, asset._id);
      asset.bill = newBill;
    } else if (body.removeBill === true) {
      asset.bill = null;
    }

    // Fail (409) instead of overwriting if the asset was assigned/returned since we loaded it.
    asset.$where = { assignedTo: asset.assignedTo ?? null };
    try {
      await asset.save();
    } catch (err) {
      await deleteBill(newBill?.fileId); // don't leave an orphaned file
      throw err;
    }
    if (previousBill && (newBill || body.removeBill === true)) await deleteBill(previousBill);
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
    await Promise.all([deleteImage(asset.image?.fileId), deleteBill(asset.bill?.fileId)]);
    return ok({ id, message: 'Asset deleted' });
  } catch (err) {
    return handleError(err);
  }
}
