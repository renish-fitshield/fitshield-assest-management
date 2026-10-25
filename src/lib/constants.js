// Shared between client and server — keep this file free of Node/browser-only imports.

export const ROLES = ['Admin', 'CTO', 'HR'];

// Asset categories live in the database (am_categories) and are managed on the Categories page.
// Two names with the same key are the same category: "Laptop", "laptop" and " LAPTOP " clash.
export const categoryKey = (name) => String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export const BRANDS = [
  'Apple',
  'Dell',
  'HP',
  'Lenovo',
  'Asus',
  'Acer',
  'Microsoft',
  'Samsung',
  'LG',
  'BenQ',
  'Logitech',
  'Sony',
  'JBL',
  'OnePlus',
  'Xiaomi',
  'Canon',
  'Epson',
  'TP-Link',
  'Netgear',
  'SanDisk',
  'Seagate',
  'Western Digital',
  'Featherlite',
  'Godrej',
  'Other',
];

export const ASSET_CONDITIONS = ['New', 'Good', 'Fair', 'Poor', 'Damaged'];
export const PURCHASE_TYPES = ['Online', 'Offline (Physical Store)'];
export const ASSET_STATUSES = ['Available', 'Assigned', 'Under Repair', 'Retired', 'Lost'];
export const WARRANTY_STATUSES = ['Active', 'Expired', 'Not Applicable'];

// "Assigned" is set only by assigning an asset to an employee, never chosen in the asset form.
export const MANUAL_ASSET_STATUSES = ASSET_STATUSES.filter((s) => s !== 'Assigned');
// What the asset becomes when it's taken back from an employee.
export const RETURN_STATUSES = MANUAL_ASSET_STATUSES;

// Asset assignment history (asset.assignmentHistory): one entry per hand-over.
//   Assigned    → `to` an employee (the asset was unassigned)
//   Transferred → `from` one employee `to` another, directly
//   Returned    → taken back `from` an employee
export const ASSIGNMENT_ACTIONS = ['Assigned', 'Transferred', 'Returned'];

// Asset activity log (asset.activities): every change, with each field's before → after.
export const ACTIVITY_ACTIONS = ['Created', 'Updated', ...ASSIGNMENT_ACTIONS, 'Acknowledged'];

// Acknowledgements: every hand-over emails the employee(s) involved a link to confirm it.
//   receipt — the employee who RECEIVES the asset (Assigned, Transferred to them)
//   return  — the employee who GIVES IT BACK (Returned, Transferred away from them)
export const ACK_STATUSES = ['Pending', 'Acknowledged'];
export const COMPANY_NAME = 'Fitshield';
export const QUERY_CONTACT_NAME = 'Jeel Borda';
export const QUERY_CONTACT_PHONE = '+91 95126 62666';
export const QUERY_CONTACT_PHONE_LINK = 'tel:+919512662666';

// Labels for the fields that appear in the activity log.
export const ASSET_FIELD_LABELS = {
  category: 'Category',
  itemName: 'Item Name',
  quantity: 'Quantity',
  brand: 'Brand',
  modelName: 'Model Name',
  serialNumber: 'Serial Number',
  specifications: 'Specifications',
  location: 'Asset Location',
  condition: 'Condition',
  purchaseDate: 'Purchase Date',
  cost: 'Cost',
  vendorName: 'Vendor Name',
  invoiceNumber: 'Invoice Number',
  warrantyUntil: 'Warranty Until',
  purchaseCity: 'Purchase City',
  purchaseType: 'Purchase Type',
  purchasedBy: 'Purchased By',
  status: 'Asset Status',
  remarks: 'Remarks',
  bill: 'Bill / Invoice',
  image: 'Photo',
  assignedTo: 'Assigned To',
  expectedReturnAt: 'Expected Return',
};
export const ASSET_DATE_FIELDS = ['purchaseDate', 'warrantyUntil', 'expectedReturnAt'];

// Filter on the current holder's expected return date.
export const RETURN_DUE_FILTERS = ['Overdue', 'Due in 7 days'];
export const DUE_SOON_DAYS = 7;

/** True when an assigned asset is past its expected return date (compared by day). */
export function isReturnOverdue(asset) {
  if (!asset?.assignedTo || !asset.expectedReturnAt) return false;
  const due = new Date(asset.expectedReturnAt);
  const today = new Date();
  return Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate()) < Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
}

export const ASSET_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const ASSET_IMAGE_MAX_MB = 2;

// Bill / invoice / cheque file attached to an asset.
export const ASSET_BILL_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const ASSET_BILL_MAX_MB = 10;
// Large files are uploaded in pieces of this size: Vercel rejects request bodies over 4.5 MB.
export const UPLOAD_CHUNK_BYTES = 2 * 1024 * 1024;

export const MAX_ASSET_QUANTITY = 100_000;

// Only single items can be assigned to an employee; an entry with quantity > 1 can't be.
export const isSingleUnit = (asset) => (asset?.quantity ?? 1) <= 1;

export const DEPARTMENTS = [
  'Engineering',
  'Product',
  'Design',
  'Data Science',
  'QA',
  'DevOps',
  'Human Resources',
  'Finance',
  'Sales',
  'Marketing',
  'Operations',
  'Customer Support',
  'Management',
];
export const WORK_TYPES = ['WFH', 'Onsite', 'Hybrid', 'Freelance'];
export const EMPLOYEE_STATUSES = ['Active', 'On Notice', 'Exited'];

// Suggestions only — location fields also accept free text.
export const LOCATIONS = ['Ahmedabad', 'Mumbai', 'Bengaluru', 'Delhi NCR', 'Pune', 'Hyderabad', 'Remote'];

export function getWarrantyStatus(warrantyUntil) {
  if (!warrantyUntil) return 'Not Applicable';
  const end = new Date(warrantyUntil);
  if (Number.isNaN(end.getTime())) return 'Not Applicable';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return end >= today ? 'Active' : 'Expired';
}
