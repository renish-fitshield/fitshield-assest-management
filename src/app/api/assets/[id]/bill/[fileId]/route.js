import { connectDB } from '@/lib/db';
import { fail, handleError, isValidId } from '@/lib/api';
import { openBillStream } from '@/lib/assetBills';
import Asset from '@/models/Asset';

/**
 * GET /api/assets/:id/bill/:fileId — the bill file, streamed (requires the Bearer token like every API).
 * The fileId changes whenever the bill is replaced, so responses can be cached as immutable.
 */
export async function GET(_req, { params }) {
  try {
    const { id, fileId } = await params;
    if (!isValidId(id) || !isValidId(fileId)) return fail('Invalid id', 400);
    await connectDB();
    const asset = await Asset.findById(id, 'bill').lean();
    const bill = asset?.bill;
    if (!bill || String(bill.fileId) !== fileId) return fail('Bill not found', 404);

    return new Response(openBillStream(fileId), {
      headers: {
        'Content-Type': bill.contentType,
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(bill.filename)}`,
        'Cache-Control': 'private, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
