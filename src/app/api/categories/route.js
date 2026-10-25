import { connectDB } from '@/lib/db';
import { ok, handleError, readJson } from '@/lib/api';
import { createCategory, listCategories } from '@/lib/categories';

// Asset categories. Add and rename only — categories are never deleted (no DELETE handler).

/** GET /api/categories → { items: [{ _id, name, assetCount, createdAt, updatedAt }] }, A→Z. */
export async function GET() {
  try {
    await connectDB();
    return ok({ items: await listCategories() });
  } catch (err) {
    return handleError(err);
  }
}

/** POST /api/categories — { name }. 409 if a category with that name (any capitalisation) exists. */
export async function POST(req) {
  try {
    await connectDB();
    const item = await createCategory(await readJson(req));
    return ok({ item, message: `Category "${item.name}" added` }, 201);
  } catch (err) {
    return handleError(err);
  }
}
