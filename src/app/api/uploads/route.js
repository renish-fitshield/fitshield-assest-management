import { connectDB } from '@/lib/db';
import { ok, handleError, readJson } from '@/lib/api';
import { startUpload } from '@/lib/uploads';

/**
 * POST /api/uploads — body { filename, size } → { uploadId, chunkSize, chunkCount }.
 * Then PUT each piece to /api/uploads/:uploadId/:n. See lib/uploads.js.
 */
export async function POST(req) {
  try {
    const body = await readJson(req);
    await connectDB();
    return ok(await startUpload(body, req.headers.get('x-user-id')), 201);
  } catch (err) {
    return handleError(err);
  }
}
