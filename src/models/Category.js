import mongoose from 'mongoose';
import { categoryKey } from '@/lib/constants';
import defineModel from './defineModel';

// Asset categories, managed on the Categories page. Can be added and renamed, never deleted.
// Each asset stores both `categoryId` and a copy of the `category` name (kept in sync on rename).
const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Category name is required'],
      trim: true,
      minlength: [2, 'Category name must be at least 2 characters'],
      maxlength: [60, 'Category name must be at most 60 characters'],
      set: (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ') : v),
    },
    // Unique index on the normalised name stops duplicates, even from two requests at once.
    key: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);

categorySchema.pre('validate', function setKey() {
  this.key = categoryKey(this.name);
});

export default defineModel('Category', categorySchema, 'am_categories');
