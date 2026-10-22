import { connectDB } from '@/lib/db';
import { ok, fail, handleError } from '@/lib/api';
import User from '@/models/User';

export async function GET(req) {
  try {
    await connectDB();
    const user = await User.findById(req.headers.get('x-user-id'));
    if (!user) return fail('User not found', 404);
    return ok({ user: user.toPublic() });
  } catch (err) {
    return handleError(err);
  }
}
