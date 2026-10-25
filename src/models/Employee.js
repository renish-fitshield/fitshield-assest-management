import mongoose from 'mongoose';
import {
  DEPARTMENTS,
  WORK_TYPES,
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPES,
  DEFAULT_EMPLOYMENT_TYPE,
  employeeEmailError,
} from '@/lib/constants';
import defineModel from './defineModel';

export const EMPLOYEE_FIELDS = [
  'fullName',
  'employmentType',
  'workEmail',
  'department',
  'designation',
  'workType',
  'location',
  'joiningDate',
  'status',
  'contactNumber',
  'remarks',
];

const employeeSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, unique: true, immutable: true }, // FSEMP-ENG-0001 (lib/employeeId.js)
    // IDs this employee had before (e.g. EMP-0056 from before the FSEMP format), so searching an old ID
    // — from an old email or note — still finds them. Set only by scripts/migrate-employee-ids.mjs.
    previousEmployeeIds: { type: [String], default: undefined },
    fullName: { type: String, required: [true, 'Full name is required'], trim: true, maxlength: 120 },
    employmentType: {
      type: String,
      enum: { values: EMPLOYMENT_TYPES, message: 'Employment type must be Full-Time or Intern' },
      required: [true, 'Employment type is required'],
      default: DEFAULT_EMPLOYMENT_TYPE,
    },
    // Full-Time: company email only (exactly @fitshield.in). Intern: any valid email. Checked below,
    // here on the server too, not just in the form.
    workEmail: {
      type: String,
      required: [true, 'Work email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: [254, 'Work email is too long'],
    },
    department: { type: String, enum: DEPARTMENTS, required: [true, 'Department is required'] },
    designation: { type: String, trim: true, maxlength: 120 },
    workType: { type: String, enum: WORK_TYPES, required: [true, 'Work type is required'] },
    location: { type: String, trim: true, maxlength: 120 },
    joiningDate: { type: Date },
    status: { type: String, enum: EMPLOYEE_STATUSES, default: 'Active' },
    contactNumber: {
      type: String,
      trim: true,
      match: [/^\+?[0-9\s-]{7,20}$/, 'Contact number is invalid'],
    },
    remarks: { type: String, trim: true, maxlength: 2000 },
  },
  { timestamps: true }
);

// The email rule depends on the employment type, so it's checked across both fields.
employeeSchema.pre('validate', function checkEmailForType() {
  if (!this.workEmail) return; // `required` reports it
  const error = employeeEmailError(this.workEmail, this.employmentType);
  if (error) this.invalidate('workEmail', error);
});

export default defineModel('Employee', employeeSchema, 'am_employees');
