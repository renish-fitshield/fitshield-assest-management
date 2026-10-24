import api from '@/services/axios';

/**
 * Uploads a file in pieces (Vercel rejects request bodies over 4.5 MB — see lib/uploads.js) and
 * returns the uploadId to pass to the API that uses the file. `onProgress` receives 0–100.
 * Throws the axios error of the first failing request.
 */
export async function uploadInChunks(file, { onProgress } = {}) {
  const { data } = await api.post('/uploads', { filename: file.name, size: file.size });
  const { uploadId, chunkSize, chunkCount } = data;
  for (let n = 0; n < chunkCount; n += 1) {
    const piece = file.slice(n * chunkSize, (n + 1) * chunkSize);
    await api.put(`/uploads/${uploadId}/${n}`, piece, {
      headers: { 'Content-Type': 'application/octet-stream' },
      timeout: 120000,
    });
    onProgress?.(Math.round(((n + 1) / chunkCount) * 100));
  }
  return uploadId;
}
