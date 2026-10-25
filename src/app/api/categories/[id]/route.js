import { connectDB } from '@/lib/db';
import { ok, handleError, readJson } from '@/lib/api';
import { renameCategory } from '@/lib/categories';

/**
 * PUT /api/categories/:id — { name }. Renames the category and the category name on its assets.
 * There is no DELETE: categories can't be removed.
 */
export async function PUT(req, { params }) {
  try {
    const { id } = await params;
    await connectDB();
    const item = await renameCategory(id, await readJson(req));
    return ok({ item, message: 'Category updated' });
  } catch (err) {
    return handleError(err);
  }
}
