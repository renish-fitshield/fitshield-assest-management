import { connectDB } from '@/lib/db';
import { ok, handleError, pickFields, readJson } from '@/lib/api';
import Employee, { EMPLOYEE_FIELDS } from '@/models/Employee';
import { nextSequenceId } from '@/models/Counter';

// Listing (search / filters / sorting / pagination) is POST /api/employees/list.

export async function POST(req) {
  try {
    await connectDB();
    const data = pickFields(await readJson(req), EMPLOYEE_FIELDS);

    const employee = new Employee({ ...data, employeeId: 'pending' });
    await employee.validate();
    employee.employeeId = await nextSequenceId('employee', 'EMP');
    await employee.save();

    return ok({ item: employee, message: 'Employee created' }, 201);
  } catch (err) {
    return handleError(err);
  }
}
