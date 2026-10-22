import mongoose from 'mongoose';
import { DEPARTMENTS, WORK_TYPES, EMPLOYEE_STATUSES } from '@/lib/constants';
import defineModel from './defineModel';

export const EMPLOYEE_FIELDS = [
  'fullName',
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
    employeeId: { type: String, required: true, unique: true, immutable: true },
    fullName: { type: String, required: [true, 'Full name is required'], trim: true, maxlength: 120 },
    workEmail: {
      type: String,
      required: [true, 'Work email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Work email is invalid'],
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

export default defineModel('Employee', employeeSchema, 'am_employees');
