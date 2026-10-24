import { Readable } from 'node:stream';
import mongoose from 'mongoose';
import { ApiError } from '@/lib/api';
import { sniffImageType } from '@/lib/assetImages';
import { readUpload, discardUpload } from '@/lib/uploads';

// Bill / invoice / cheque files (JPEG, PNG, WebP or PDF, ≤ 10 MB), stored in GridFS.
export const BILL_BUCKET = 'am_asset_bills';

const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: BILL_BUCKET });

/** Real type from the file's first bytes (the browser-supplied type can't be trusted). */
function sniffBillType(buf) {
  if (buf.length >= 5 && buf.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  return sniffImageType(buf);
}

/**
 * Moves a finished chunked upload (lib/uploads.js) into the bill bucket and returns the
 * `asset.bill` value. The caller must deleteBill(bill.fileId) if the asset then fails to save.
 */
export async function storeBill(uploadId, assetId) {
  const { buffer, filename } = await readUpload(uploadId, 'bill');
  const contentType = sniffBillType(buffer);
  if (!contentType) {
    await discardUpload(uploadId);
    throw new ApiError('Bill must be a PDF or an image (JPEG, PNG or WebP)', 400, { bill: 'Only PDF, JPEG, PNG or WebP files' });
  }
  const fileId = await new Promise((resolve, reject) => {
    const upload = bucket().openUploadStream(filename, { contentType, metadata: { assetId } });
    Readable.from(buffer)
      .pipe(upload)
      .on('error', reject)
      .on('finish', () => resolve(upload.id));
  });
  await discardUpload(uploadId);
  return { fileId, filename, contentType, size: buffer.length, uploadedAt: new Date() };
}

export async function deleteBill(fileId) {
  if (!fileId) return;
  try {
    await bucket().delete(new mongoose.Types.ObjectId(String(fileId)));
  } catch (err) {
    // A missing file is fine (already gone); anything else is logged but never blocks the request.
    if (!/FileNotFound|File not found/i.test(err?.message || '')) console.error('[bills] delete failed:', err);
  }
}

/** Web stream of the file — streamed responses aren't subject to Vercel's 4.5 MB response cap. */
export const openBillStream = (fileId) =>
  Readable.toWeb(bucket().openDownloadStream(new mongoose.Types.ObjectId(String(fileId))));
