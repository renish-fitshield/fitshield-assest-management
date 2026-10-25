import { escapeRegex } from '@/lib/api';
import { enumValue } from '@/lib/listRequest';
import { DEPARTMENTS, EMPLOYEE_STATUSES, EMPLOYMENT_TYPES, WORK_TYPES } from '@/lib/constants';

/** Keys accepted in `body.filter` (plus `searchText`) by the employee list. */
export const EMPLOYEE_FILTER_KEYS = ['department', 'status', 'workType', 'employmentType'];

export const EMPLOYEE_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'employeeId',
  'fullName',
  'employmentType',
  'workEmail',
  'department',
  'designation',
  'workType',
  'location',
  'joiningDate',
  'status',
];

/** Builds a Mongo filter from a parsed `body.filter`. */
export function buildEmployeeFilter(filter) {
  const query = {};

  const enums = { department: DEPARTMENTS, status: EMPLOYEE_STATUSES, workType: WORK_TYPES, employmentType: EMPLOYMENT_TYPES };
  for (const [key, allowed] of Object.entries(enums)) {
    const value = enumValue(filter, key, allowed);
    if (value) query[key] = value;
  }

  if (filter.searchText) {
    const rx = new RegExp(escapeRegex(filter.searchText), 'i');
    query.$or = [
      { employeeId: rx },
      { previousEmployeeIds: rx },
      { fullName: rx },
      { workEmail: rx },
      { designation: rx },
      { location: rx },
      { contactNumber: rx },
    ];
  }

  return query;
}
