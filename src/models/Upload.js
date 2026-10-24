import mongoose from 'mongoose';
import defineModel from './defineModel';

// Staging area for files uploaded in pieces (see lib/uploads.js). Unused uploads expire after a day.
const EXPIRE_SECONDS = 24 * 60 * 60;

const uploadSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true, maxlength: 200 },
    size: { type: Number, required: true },
    chunkCount: { type: Number, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdAt: { type: Date, default: Date.now, expires: EXPIRE_SECONDS },
  },
  { versionKey: false }
);

const uploadChunkSchema = new mongoose.Schema(
  {
    upload: { type: mongoose.Schema.Types.ObjectId, required: true },
    n: { type: Number, required: true },
    data: { type: Buffer, required: true },
    createdAt: { type: Date, default: Date.now, expires: EXPIRE_SECONDS },
  },
  { versionKey: false }
);
uploadChunkSchema.index({ upload: 1, n: 1 }, { unique: true });

export const UploadChunk = defineModel('UploadChunk', uploadChunkSchema, 'am_upload_chunks');
export default defineModel('Upload', uploadSchema, 'am_uploads');
