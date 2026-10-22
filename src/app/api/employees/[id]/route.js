import { connectDB } from '@/lib/db';
import { ok, fail, handleError, pickFields, isValidId, readJson } from '@/lib/api';
import Employee, { EMPLOYEE_FIELDS } from '@/models/Employee';
import Asset from '@/models/Asset';

export async function GET(_req, { params }) {
  try {
    const { id } = await params;
    if (!isValidId(id)) return fail('Invalid employee id', 400);
    await connectDB();
    const employee = await Employee.findById(id);
    if (!employee) return fail('Employee not found', 404);
    return ok({ item: employee });
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(req, { params }) {
  try {
    const { id } = await params;
    if (!isValidId(id)) return fail('Invalid employee id', 400);
    await connectDB();
    const data = pickFields(await readJson(req), EMPLOYEE_FIELDS);

    const employee = await Employee.findById(id);
    if (!employee) return fail('Employee not found', 404);

    if (data.status === 'Exited' && employee.status !== 'Exited') {
      const held = await Asset.countDocuments({ assignedTo: id });
      if (held) {
        const msg = `${employee.fullName} still has ${held} assigned asset${held > 1 ? 's' : ''}. Return them before marking as Exited.`;
        return fail(msg, 409, { fields: { status: msg } });
      }
    }

    employee.set(data);
    await employee.save();

    return ok({ item: employee, message: 'Employee updated' });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req, { params }) {
  try {
    const { id } = await params;
    if (!isValidId(id)) return fail('Invalid employee id', 400);
    await connectDB();

    const held = await Asset.countDocuments({ assignedTo: id });
    if (held) {
      return fail(`This employee has ${held} assigned asset${held > 1 ? 's' : ''}. Return them before deleting.`, 409);
    }

    const employee = await Employee.findByIdAndDelete(id);
    if (!employee) return fail('Employee not found', 404);

    // Don't leave assets pointing at a deleted employee.
    await Asset.updateMany({ purchasedBy: id }, { $set: { purchasedBy: null } });

    return ok({ id, message: 'Employee deleted' });
  } catch (err) {
    return handleError(err);
  }
}
