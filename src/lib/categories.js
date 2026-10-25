import { ApiError, isValidId } from '@/lib/api';
import Asset from '@/models/Asset';
import { categoryKey } from '@/lib/constants';
import Category from '@/models/Category';

// Case-insensitive A→Z, so "mouse" doesn't sort after "Tablet".
const BY_NAME = { locale: 'en', strength: 2 };

/** Every category, A→Z, with how many assets use it. */
export async function listCategories() {
  const [categories, counts] = await Promise.all([
    Category.find({}, 'name createdAt updatedAt').collation(BY_NAME).sort({ name: 1 }).lean(),
    Asset.aggregate([{ $group: { _id: '$categoryId', count: { $sum: 1 } } }]),
  ]);
  const countById = new Map(counts.map((c) => [String(c._id), c.count]));
  return categories.map((c) => ({ ...c, assetCount: countById.get(String(c._id)) || 0 }));
}

function readName(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) throw new ApiError('Category name is required', 400, { name: 'Category name is required' });
  return name;
}

async function assertUnique(name, exceptId) {
  const clash = await Category.findOne({ key: categoryKey(name), _id: { $ne: exceptId } }, 'name').lean();
  if (clash) throw duplicateError(clash.name);
}

const duplicateError = (existing) => {
  const msg = `Category "${existing}" already exists`;
  return new ApiError(msg, 409, { name: msg });
};

/** Saves, turning a lost unique-key race (two people adding "Laptop" at once) into the same 409. */
async function saveUnique(category, name) {
  try {
    await category.save();
  } catch (err) {
    if (err?.code === 11000) throw duplicateError(name);
    throw err;
  }
}

export async function createCategory(body) {
  const name = readName(body);
  const category = new Category({ name });
  await category.validate();
  await assertUnique(category.name);
  await saveUnique(category, category.name);
  return category;
}

/** Renames a category and updates the category name stored on its assets. */
export async function renameCategory(id, body) {
  if (!isValidId(id)) throw new ApiError('Invalid category id', 400);
  const name = readName(body);
  const category = await Category.findById(id);
  if (!category) throw new ApiError('Category not found', 404);

  category.name = name;
  await category.validate();
  // Changing only the capitalisation ("laptop" → "Laptop") is allowed: it's still the same category.
  await assertUnique(category.name, category._id);
  if (category.isModified('name')) await saveUnique(category, category.name);
  await Asset.updateMany({ categoryId: category._id }, { $set: { category: category.name } });
  return category;
}

/**
 * Copies the chosen category's name onto an asset (`categoryId` comes from the form).
 * Call before validating/saving whenever `categoryId` is new or changed.
 */
export async function setAssetCategory(asset) {
  if (!asset.categoryId) return; // the required validator reports a missing category
  const category = await Category.findById(asset.categoryId, 'name').lean();
  if (!category) {
    throw new ApiError('The selected category no longer exists', 400, {
      categoryId: 'Select a category from the list',
    });
  }
  asset.category = category.name;
}
