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

/** Atomically returns the next number (1, 2, 3…) for the named sequence. */
export async function nextSequence(name) {
  const counter = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter.seq;
}

export default Counter;
