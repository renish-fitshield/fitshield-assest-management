import Counter, { nextSequence } from '@/models/Counter';
import Employee from '@/models/Employee';
import { EMPLOYEE_ID_PREFIX, departmentCode } from '@/lib/constants';

// Employee IDs: FSEMP-<department code>-<4-digit serial>, e.g. FSEMP-ENG-0001.
// The serial counts up separately for each department (counter "employee:<code>").
// scripts/migrate-employee-ids.mjs builds the same format — keep the two in sync.

export const employeeIdPrefix = (department) => `${EMPLOYEE_ID_PREFIX}-${departmentCode(department)}-`;

/** The next free ID for an employee in `department`. */
export async function nextEmployeeId(department) {
  const prefix = employeeIdPrefix(department);
  const counter = `employee:${departmentCode(department)}`;

  // Never hand out a serial that's already taken in this department (e.g. the counter was reset, or the
  // ID migration hasn't run on this database): raise the counter to the highest one in use first.
  // $max and $inc are atomic, so two employees added at once still get different serials.
  const [highest] = await Employee.aggregate([
    { $match: { employeeId: { $regex: `^${prefix}\\d+$` } } },
    { $group: { _id: null, serial: { $max: { $toInt: { $arrayElemAt: [{ $split: ['$employeeId', '-'] }, 2] } } } } },
  ]);
  if (highest?.serial) await Counter.updateOne({ _id: counter }, { $max: { seq: highest.serial } }, { upsert: true });

  const serial = await nextSequence(counter);
  return `${prefix}${String(serial).padStart(4, '0')}`;
}
