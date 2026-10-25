import { connectDB } from '@/lib/db';
import { ok, handleError } from '@/lib/api';
import Employee from '@/models/Employee';

// Lightweight list for dropdowns (e.g. "Assign asset" and the assets "Assigned to" filter).
export async function GET() {
  try {
    await connectDB();
    const items = await Employee.find({}, 'employeeId fullName status employmentType').sort({ fullName: 1 }).lean();
    return ok({ items });
  } catch (err) {
    return handleError(err);
  }
}
