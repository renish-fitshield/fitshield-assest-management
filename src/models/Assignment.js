import mongoose from 'mongoose';
import { ASSET_CONDITIONS } from '@/lib/constants';
import defineModel from './defineModel';

/**
 * One record per hand-over of an asset to an employee (assignment history).
 * `active: true` marks the open assignment; a partial unique index guarantees an asset
 * can have at most ONE open assignment, even under concurrent requests.
 */
const assignmentSchema = new mongoose.Schema(
  {
    asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    active: { type: Boolean, default: true },
    assignedAt: { type: Date, required: true },
    returnedAt: { type: Date, default: null },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    returnedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    conditionAtAssign: { type: String, enum: ASSET_CONDITIONS },
    conditionAtReturn: { type: String, enum: ASSET_CONDITIONS },
    notes: { type: String, trim: true, maxlength: 500 },
    returnNotes: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

assignmentSchema.index({ asset: 1 }, { unique: true, partialFilterExpression: { active: true } });
assignmentSchema.index({ asset: 1, assignedAt: -1 });
assignmentSchema.index({ employee: 1, active: 1, assignedAt: -1 });

export default defineModel('Assignment', assignmentSchema, 'am_assignments');
