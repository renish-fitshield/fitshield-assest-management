import mongoose from 'mongoose';
import defineModel from './defineModel';

const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { versionKey: false }
);

const Counter = defineModel('Counter', counterSchema, 'am_counters');

/** Atomically generates the next human-readable ID, e.g. AST-0001. */
export async function nextSequenceId(name, prefix) {
  const counter = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `${prefix}-${String(counter.seq).padStart(4, '0')}`;
}

export default Counter;
