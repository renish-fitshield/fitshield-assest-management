import { connectDB } from '@/lib/db';
import { fail, handleError, isValidId } from '@/lib/api';
import { readImage } from '@/lib/assetImages';
import Asset from '@/models/Asset';

/**
 * GET /api/assets/:id/image/:fileId — the image bytes (requires the Bearer token like every API).
 * The fileId changes whenever the image is replaced, so responses can be cached as immutable.
 */
export async function GET(_req, { params }) {
  try {
    const { id, fileId } = await params;
    if (!isValidId(id) || !isValidId(fileId)) return fail('Invalid id', 400);
    await connectDB();
    const asset = await Asset.findById(id, 'image').lean();
    if (!asset?.image || String(asset.image.fileId) !== fileId) return fail('Image not found', 404);

    const bytes = await readImage(fileId);
    return new Response(bytes, {
      headers: {
        'Content-Type': asset.image.contentType,
        'Content-Length': String(bytes.length),
        'Cache-Control': 'private, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
