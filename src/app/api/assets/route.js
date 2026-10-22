import { connectDB } from '@/lib/db';
import { ok, fail, handleError, pickFields, isValidId, readJson } from '@/lib/api';
import Asset, { ASSET_FIELDS } from '@/models/Asset';
import Employee from '@/models/Employee';
import { nextSequenceId } from '@/models/Counter';

// Listing (search / filters / sorting / pagination) is POST /api/assets/list.

export async function POST(req) {
  try {
    await connectDB();
    const data = pickFields(await readJson(req), ASSET_FIELDS);
    if (data.status === null) delete data.status;
    if (data.status === 'Assigned') {
      const msg = 'Create the asset first, then use "Assign" to give it to an employee';
      return fail(msg, 400, { fields: { status: msg } });
    }

    if (data.purchasedBy) {
      if (!isValidId(data.purchasedBy) || !(await Employee.exists({ _id: data.purchasedBy }))) {
        return fail('Selected employee does not exist', 400, {
          fields: { purchasedBy: 'Selected employee does not exist' },
        });
      }
    }

    // Validate before consuming a sequence number so failed requests don't leave gaps.
    const asset = new Asset({ ...data, assetId: 'pending' });
    await asset.validate();
    asset.assetId = await nextSequenceId('asset', 'AST');
    await asset.save();
    await asset.populate('purchasedBy', 'employeeId fullName');

    return ok({ item: asset, message: 'Asset created' }, 201);
  } catch (err) {
    return handleError(err);
  }
}
