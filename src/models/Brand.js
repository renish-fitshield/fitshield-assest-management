import mongoose from 'mongoose';
import { BRANDS } from '@/lib/constants';
import defineModel from './defineModel';

// Brands typed into the asset form that aren't in the built-in BRANDS list; shared by every user.
const brandSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    // Lower-cased name, so "hp" and "HP" are the same brand.
    key: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);

const Brand = defineModel('Brand', brandSchema, 'am_brands');

const brandKey = (name) => name.trim().toLowerCase();
const BUILT_IN = new Map(BRANDS.map((b) => [brandKey(b), b]));

/** Built-in + saved brands, alphabetical with "Other" last. */
export async function listBrands() {
  const saved = await Brand.find({}, 'name key').lean();
  const byKey = new Map(BUILT_IN);
  saved.forEach((b) => byKey.has(b.key) || byKey.set(b.key, b.name));
  return [...byKey.values()].sort((a, b) =>
    a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b, undefined, { sensitivity: 'base' })
  );
}

/**
 * Returns the canonical spelling of a brand (so "hp" is stored as "HP"), saving it as a new
 * brand first if nobody has used it before.
 */
export async function resolveBrand(name) {
  const key = brandKey(name);
  if (BUILT_IN.has(key)) return BUILT_IN.get(key);
  const upsert = () =>
    Brand.findOneAndUpdate(
      { key },
      { $setOnInsert: { name: name.trim(), key } },
      { new: true, upsert: true, runValidators: true }
    );
  try {
    return (await upsert()).name;
  } catch (err) {
    // Two users adding the same new brand at once: one upsert loses the unique-key race; retry finds it.
    if (err?.code !== 11000) throw err;
    return (await upsert()).name;
  }
}

export default Brand;
