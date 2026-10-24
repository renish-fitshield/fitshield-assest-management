import { ApiError, isValidId } from '@/lib/api';
import { ASSET_BILL_MAX_MB, UPLOAD_CHUNK_BYTES } from '@/lib/constants';
import Upload, { UploadChunk } from '@/models/Upload';

/**
 * Chunked uploads. Vercel caps a request body at 4.5 MB, so the browser sends a file as
 * UPLOAD_CHUNK_BYTES pieces: POST /api/uploads → PUT /api/uploads/:id/:n for each piece → the
 * returned uploadId is passed to the API that uses the file (e.g. `billUploadId` on create/update asset).
 */

export const MAX_UPLOAD_BYTES = ASSET_BILL_MAX_MB * 1024 * 1024;

export async function startUpload(body, userId) {
  const filename = typeof body?.filename === 'string' ? body.filename.trim().slice(0, 200) : '';
  const size = body?.size;
  if (!filename) throw new ApiError('filename is required', 400);
  if (!Number.isInteger(size) || size <= 0) throw new ApiError('size must be a positive number of bytes', 400);
  if (size > MAX_UPLOAD_BYTES) {
    throw new ApiError(`File must be ${ASSET_BILL_MAX_MB} MB or smaller`, 400, { bill: `Must be ${ASSET_BILL_MAX_MB} MB or smaller` });
  }
  const upload = await Upload.create({
    filename,
    size,
    chunkCount: Math.ceil(size / UPLOAD_CHUNK_BYTES),
    createdBy: isValidId(userId) ? userId : null,
  });
  return { uploadId: upload._id, chunkSize: UPLOAD_CHUNK_BYTES, chunkCount: upload.chunkCount };
}

export async function saveChunk(uploadId, n, req) {
  if (!isValidId(uploadId)) throw new ApiError('Invalid upload id', 400);
  const upload = await Upload.findById(uploadId).lean();
  if (!upload) throw new ApiError('Upload not found or expired. Choose the file again.', 404);
  const index = Number(n);
  if (!Number.isInteger(index) || index < 0 || index >= upload.chunkCount) throw new ApiError('Invalid chunk number', 400);

  const data = Buffer.from(await req.arrayBuffer());
  const expected = index === upload.chunkCount - 1 ? upload.size - index * UPLOAD_CHUNK_BYTES : UPLOAD_CHUNK_BYTES;
  if (data.length !== expected) throw new ApiError(`Chunk ${index} should be ${expected} bytes, got ${data.length}`, 400);

  await UploadChunk.updateOne({ upload: upload._id, n: index }, { $set: { data, createdAt: new Date() } }, { upsert: true });
}

/** The complete file of a finished upload. Throws a `field` error if it's missing or incomplete. */
export async function readUpload(uploadId, field) {
  const missing = () => new ApiError('The uploaded file has expired or is incomplete. Choose it again.', 400, { [field]: 'Upload the file again' });
  if (!isValidId(uploadId)) throw missing();
  const upload = await Upload.findById(uploadId).lean();
  if (!upload) throw missing();
  // Not lean(): hydrated docs give `data` as a Buffer rather than a BSON Binary.
  const chunks = await UploadChunk.find({ upload: upload._id }).sort({ n: 1 });
  if (chunks.length !== upload.chunkCount || chunks.some((c, i) => c.n !== i)) throw missing();
  const buffer = Buffer.concat(chunks.map((c) => c.data));
  if (buffer.length !== upload.size) throw missing();
  return { buffer, filename: upload.filename };
}

export async function discardUpload(uploadId) {
  if (!isValidId(uploadId)) return;
  await Promise.all([Upload.deleteOne({ _id: uploadId }), UploadChunk.deleteMany({ upload: uploadId })]);
}
