import { connectDB } from '@/lib/db';
import { ok, fail, handleError, isValidId } from '@/lib/api';
import { readImageUpload, saveImage, deleteImage } from '@/lib/assetImages';
import Asset from '@/models/Asset';
import { activity, getActor } from '@/lib/activity';

/**
 * POST /api/assets/:id/image — multipart/form-data with field "image" (JPEG/PNG/WebP, ≤ 2 MB).
 * Replaces any existing image.
 */
export async function POST(req, { params }) {
  try {
    const { id } = await params;
    if (!isValidId(id)) return fail('Invalid asset id', 400);
    const upload = await readImageUpload(req);

    await connectDB();
    const asset = await Asset.findById(id);
    if (!asset) return fail('Asset not found', 404);

    const fileId = await saveImage(upload, { assetId: asset._id });
    const previous = asset.image?.fileId;
    const previousAt = asset.image?.uploadedAt ?? null;
    asset.image = { fileId, contentType: upload.contentType, size: upload.buffer.length, uploadedAt: new Date() };
    // Photo values in the log are upload times: before null = added, after null = removed.
    asset.activities.push(
      activity('Updated', await getActor(req), { changes: [{ field: 'image', before: previousAt, after: asset.image.uploadedAt }] })
    );
    try {
      await asset.save();
    } catch (err) {
      await deleteImage(fileId); // don't leave an orphaned file
      throw err;
    }
    await deleteImage(previous);

    return ok({ image: asset.image, message: 'Image uploaded' }, 201);
  } catch (err) {
    return handleError(err);
  }
}

/** DELETE /api/assets/:id/image — removes the asset's image. */
export async function DELETE(req, { params }) {
  try {
    const { id } = await params;
    if (!isValidId(id)) return fail('Invalid asset id', 400);
    await connectDB();
    const asset = await Asset.findById(id);
    if (!asset) return fail('Asset not found', 404);
    const previous = asset.image?.fileId;
    if (!previous) return ok({ message: 'Image removed' });
    asset.activities.push(
      activity('Updated', await getActor(req), { changes: [{ field: 'image', before: asset.image.uploadedAt, after: null }] })
    );
    asset.image = null;
    await asset.save();
    await deleteImage(previous);
    return ok({ message: 'Image removed' });
  } catch (err) {
    return handleError(err);
  }
}
