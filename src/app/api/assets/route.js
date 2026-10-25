import { connectDB } from '@/lib/db';
import { ok, fail, handleError, pickFields, readJson } from '@/lib/api';
import Asset, { ASSET_FIELDS } from '@/models/Asset';
import { resolveBrand } from '@/models/Brand';
import { setAssetCategory } from '@/lib/categories';
import { activity, getActor } from '@/lib/activity';
import { nextAssetId } from '@/lib/assetId';
import { storeBill, deleteBill } from '@/lib/assetBills';

// Listing (search / filters / sorting / pagination) is POST /api/assets/list.

/**
 * POST /api/assets — asset fields (ASSET_FIELDS), plus optional `billUploadId`: a finished
 * chunked upload (POST /api/uploads) to attach as the bill / invoice.
 */
export async function POST(req) {
  try {
    await connectDB();
    const body = await readJson(req);
    const data = pickFields(body, ASSET_FIELDS);
    if (data.status === null) delete data.status;
    if (data.status === 'Assigned') {
      const msg = 'Create the asset first, then use "Assign" to give it to an employee';
      return fail(msg, 400, { fields: { status: msg } });
    }

    // Validate before consuming a sequence number (or saving a new brand) so failed requests leave no trace.
    const asset = new Asset({ ...data, assetId: 'pending' });
    await setAssetCategory(asset);
    await asset.validate();
    if (asset.brand) asset.brand = await resolveBrand(asset.brand);
    if (body.billUploadId) asset.bill = await storeBill(body.billUploadId, asset._id);
    try {
      asset.assetId = await nextAssetId(asset.itemName);
      asset.activities.push(activity('Created', await getActor(req), { note: `Added as ${asset.assetId}` }));
      await asset.save();
    } catch (err) {
      await deleteBill(asset.bill?.fileId); // don't leave an orphaned file
      throw err;
    }

    return ok({ item: asset, message: 'Asset created' }, 201);
  } catch (err) {
    return handleError(err);
  }
}
