import { connectDB } from '@/lib/db';
import { ok, handleError } from '@/lib/api';
import { listBrands } from '@/models/Brand';

// Options for the asset "Brand" field: built-in brands plus any added by users.
export async function GET() {
  try {
    await connectDB();
    return ok({ items: await listBrands() });
  } catch (err) {
    return handleError(err);
  }
}
