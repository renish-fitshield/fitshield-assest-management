// Shared between client and server — keep this file free of Node/browser-only imports.

export const ROLES = ['Admin', 'CTO', 'HR'];

export const ASSET_CATEGORIES = [
  'Laptop',
  'Desktop',
  'Monitor',
  'Mobile Phone',
  'Tablet',
  'Keyboard',
  'Mouse',
  'Headset',
  'Printer',
  'Networking',
  'Storage Device',
  'Furniture',
  'Accessories',
  'Other',
];

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
export const RETURN_STATUSES = ['Available', 'Under Repair'];

export const ASSET_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const ASSET_IMAGE_MAX_MB = 2;

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
