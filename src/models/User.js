import mongoose from 'mongoose';
import { ROLES } from '@/lib/constants';
import defineModel from './defineModel';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    pinHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true },
    isActive: { type: Boolean, default: true },
    failedAttempts: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, default: null, select: false },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.methods.toPublic = function toPublic() {
  return { id: String(this._id), name: this.name, email: this.email, role: this.role };
};

export default defineModel('User', userSchema, 'am_users');
