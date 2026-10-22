import mongoose from 'mongoose';
import {
  ASSET_CATEGORIES,
  BRANDS,
  ASSET_CONDITIONS,
  PURCHASE_TYPES,
  ASSET_STATUSES,
  getWarrantyStatus,
} from '@/lib/constants';
import '@/models/Employee';
import defineModel from './defineModel';

export const ASSET_FIELDS = [
  'category',
  'itemName',
  'brand',
  'modelName',
  'serialNumber',
  'specifications',
  'location',
  'condition',
  'purchaseDate',
  'cost',
  'vendorName',
  'invoiceNumber',
  'warrantyUntil',
  'purchaseCity',
  'purchaseType',
  'purchasedBy',
  'status',
  'remarks',
];

const imageSchema = new mongoose.Schema(
  {
    fileId: { type: mongoose.Schema.Types.ObjectId, required: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedAt: { type: Date, required: true },
  },
  { _id: false }
);

const assetSchema = new mongoose.Schema(
  {
    assetId: { type: String, required: true, unique: true, immutable: true },
    category: { type: String, enum: ASSET_CATEGORIES, required: [true, 'Category is required'] },
    itemName: { type: String, required: [true, 'Item name is required'], trim: true, maxlength: 150 },
    brand: { type: String, enum: BRANDS },
    modelName: { type: String, trim: true, maxlength: 150 },
    serialNumber: { type: String, trim: true, maxlength: 100 },
    specifications: { type: String, trim: true, maxlength: 2000 },
    location: { type: String, trim: true, maxlength: 120 },
    condition: { type: String, enum: ASSET_CONDITIONS, default: 'New' },
    purchaseDate: { type: Date },
    cost: {
      type: Number,
      min: [0, 'Cost cannot be negative'],
      max: [1_000_000_000, 'Cost is too large'],
    },
    vendorName: { type: String, trim: true, maxlength: 150 },
    invoiceNumber: {
      type: String,
      trim: true,
      maxlength: 60,
      match: [/^[A-Za-z0-9\-/]+$/, 'Invoice number must be alphanumeric'],
    },
    warrantyUntil: { type: Date },
    purchaseCity: { type: String, trim: true, maxlength: 120 },
    purchaseType: { type: String, enum: PURCHASE_TYPES },
    purchasedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
    status: { type: String, enum: ASSET_STATUSES, default: 'Available' },
    remarks: { type: String, trim: true, maxlength: 2000 },

    // Current holder — set/cleared only by the assign/return APIs (never via create/update),
    // so one asset can belong to at most one employee at a time.
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
    assignedAt: { type: Date, default: null },

    // Photo stored in GridFS (bucket am_asset_images); managed by the image APIs.
    image: { type: imageSchema, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Computed on read so it never goes stale as dates pass.
assetSchema.virtual('warrantyStatus').get(function warrantyStatus() {
  return getWarrantyStatus(this.warrantyUntil);
});

// Cross-field rules (runs on create and on save-based updates).
assetSchema.pre('validate', function validateDates() {
  const tomorrow = new Date();
  tomorrow.setUTCHours(24, 0, 0, 0);
  if (this.purchaseDate && this.purchaseDate >= tomorrow) {
    this.invalidate('purchaseDate', 'Purchase date cannot be in the future');
  }
  if (this.purchaseDate && this.warrantyUntil && this.warrantyUntil < this.purchaseDate) {
    this.invalidate('warrantyUntil', 'Warranty end date must be on or after the purchase date');
  }
});

assetSchema.index({ assignedTo: 1 });
assetSchema.index({ category: 1, createdAt: -1 });
assetSchema.index({ status: 1 });

export default defineModel('Asset', assetSchema, 'am_assets');
