import { connectDB } from '@/lib/db';
import { ok, handleError } from '@/lib/api';
import { saveChunk } from '@/lib/uploads';

/** PUT /api/uploads/:id/:n — raw bytes (application/octet-stream) of piece n (0-based). */
export async function PUT(req, { params }) {
  try {
    const { id, n } = await params;
    await connectDB();
    await saveChunk(id, n, req);
    return ok({ n: Number(n) });
  } catch (err) {
    return handleError(err);
  }
}
