import { connectDB } from '@/lib/db';
import { ok, fail, handleError, isValidId } from '@/lib/api';
import { employeeAssignmentHistory } from '@/lib/assignments';
import Asset from '@/models/Asset';
import Employee from '@/models/Employee';

/**
 * GET /api/employees/:id/assets
 * → { employee, current: [assets they hold now], history: [every period they held an asset, newest first] }
 */
export async function GET(_req, { params }) {
  try {
    const { id } = await params;
    if (!isValidId(id)) return fail('Invalid employee id', 400);
    await connectDB();
    const employee = await Employee.findById(id, 'employeeId fullName department designation status').lean();
    if (!employee) return fail('Employee not found', 404);

    const [current, history] = await Promise.all([
      Asset.find(
        { assignedTo: id },
        'assetId itemName category brand modelName serialNumber condition status quantity purchaseDate assignedAt expectedReturnAt acknowledgement image'
      )
        .sort({ assignedAt: -1 })
        .lean(),
      employeeAssignmentHistory(employee._id),
    ]);

    return ok({ employee, current, history });
  } catch (err) {
    return handleError(err);
  }
}
