import { connectDB } from '@/lib/db';
import { ok, handleError, pickFields, readJson } from '@/lib/api';
import Employee, { EMPLOYEE_FIELDS } from '@/models/Employee';
import { nextEmployeeId } from '@/lib/employeeId';

// Listing (search / filters / sorting / pagination) is POST /api/employees/list.

export async function POST(req) {
  try {
    await connectDB();
    const data = pickFields(await readJson(req), EMPLOYEE_FIELDS);

    const employee = new Employee({ ...data, employeeId: 'pending' });
    await employee.validate();
    // FSEMP-<department>-<serial>, given once (validated first, so a rejected form uses no number).
    employee.employeeId = await nextEmployeeId(employee.department);
    await employee.save();

    return ok({ item: employee, message: 'Employee created' }, 201);
  } catch (err) {
    return handleError(err);
  }
}
