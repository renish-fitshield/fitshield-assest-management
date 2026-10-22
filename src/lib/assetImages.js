import { Readable } from 'node:stream';
import mongoose from 'mongoose';
import { ApiError } from '@/lib/api';

export const IMAGE_BUCKET = 'am_asset_images';
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: IMAGE_BUCKET });

/** Detect the real type from the file's first bytes (the browser-supplied type can't be trusted). */
function sniffImageType(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

/** Reads and validates the `image` field of a multipart request. */
export async function readImageUpload(req) {
  let form;
  try {
    form = await req.formData();
  } catch {
    throw new ApiError('Send the image as multipart/form-data in a field named "image"', 400);
  }
  const file = form.get('image');
  if (!file || typeof file === 'string') {
    throw new ApiError('No image file received', 400, { image: 'Choose an image to upload' });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ApiError('Image must be 2 MB or smaller', 400, { image: 'Image must be 2 MB or smaller' });
  }
  if (file.size === 0) throw new ApiError('Image file is empty', 400, { image: 'Image file is empty' });

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = sniffImageType(buffer);
  if (!contentType) {
    throw new ApiError('Only JPEG, PNG or WebP images are allowed', 400, { image: 'Only JPEG, PNG or WebP images' });
  }
  return { buffer, contentType, filename: String(file.name || 'asset-image').slice(0, 120) };
}

export function saveImage({ buffer, contentType, filename }, metadata) {
  return new Promise((resolve, reject) => {
    const upload = bucket().openUploadStream(filename, { contentType, metadata });
    Readable.from(buffer)
      .pipe(upload)
      .on('error', reject)
      .on('finish', () => resolve(upload.id));
  });
}

export async function deleteImage(fileId) {
  if (!fileId) return;
  try {
    await bucket().delete(new mongoose.Types.ObjectId(String(fileId)));
  } catch (err) {
    // A missing file is fine (already gone); anything else is logged but never blocks the request.
    if (!/FileNotFound|File not found/i.test(err?.message || '')) console.error('[images] delete failed:', err);
  }
}

/** Reads a stored image fully into memory (images are ≤ 2 MB). */
export async function readImage(fileId) {
  const chunks = [];
  const stream = bucket().openDownloadStream(new mongoose.Types.ObjectId(String(fileId)));
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}
