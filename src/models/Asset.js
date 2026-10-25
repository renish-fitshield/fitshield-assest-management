import mongoose from 'mongoose';
import {
  ASSET_CONDITIONS,
  PURCHASE_TYPES,
  ASSET_STATUSES,
  MAX_ASSET_QUANTITY,
  ASSIGNMENT_ACTIONS,
  ACTIVITY_ACTIONS,
  ACK_STATUSES,
  getWarrantyStatus,
} from '@/lib/constants';
import '@/models/Employee';
import defineModel from './defineModel';

// The client sends `categoryId`; the server fills in the `category` name (lib/categories.js).
export const ASSET_FIELDS = [
  'categoryId',
  'itemName',
  'quantity',
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

// Bill / invoice / cheque in GridFS (bucket am_asset_bills); set via `billUploadId` on create/update.
const billSchema = new mongoose.Schema(
  {
    fileId: { type: mongoose.Schema.Types.ObjectId, required: true },
    filename: { type: String, required: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedAt: { type: Date, required: true },
  },
  { _id: false }
);

// ---- History. Entries are only ever appended (never edited or removed), in the same atomic write
// as the change they describe, so an asset's state and its history can't disagree.
// People are stored as they were at the time (snapshots), so history survives renames and deletions.

// The app user who made a change.
const actorSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    name: { type: String, required: true },
  },
  { _id: false }
);

// An employee on one side of a hand-over.
const holderSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    employeeId: { type: String }, // FSEMP-ENG-0001
    fullName: { type: String, required: true },
    department: { type: String },
  },
  { _id: false }
);

// The last acknowledgement email sent for one side of a hand-over.
const ackEmailSchema = new mongoose.Schema(
  {
    to: { type: String },
    status: { type: String, enum: ['Sent', 'Failed'], required: true },
    sentAt: { type: Date },
    error: { type: String },
    previewUrl: { type: String }, // development test inbox only
    testOnly: { type: Boolean }, // true = email isn't set up, so it went to the test inbox and was NOT delivered
  },
  { _id: false }
);

// An employee's confirmation of one side of a hand-over, given through the emailed link.
const ackSchema = new mongoose.Schema(
  {
    status: { type: String, enum: ACK_STATUSES, default: 'Pending' },
    acknowledgedAt: { type: Date },
    ip: { type: String },
    userAgent: { type: String },
    email: { type: ackEmailSchema, default: undefined },
    emailAttempts: { type: Number, default: 0 },
  },
  { _id: false }
);

const assignmentEventSchema = new mongoose.Schema({
  action: { type: String, enum: ASSIGNMENT_ACTIONS, required: true },
  from: { type: holderSchema, default: undefined }, // Transferred, Returned
  to: { type: holderSchema, default: undefined }, // Assigned, Transferred
  toAck: { type: ackSchema, default: undefined }, // `to` confirms receiving it
  fromAck: { type: ackSchema, default: undefined }, // `from` confirms giving it back
  date: { type: Date, required: true }, // the hand-over date picked by the admin
  condition: { type: String, enum: ASSET_CONDITIONS }, // at hand-over / on return
  expectedReturnAt: { type: Date }, // Assigned, Transferred (optional)
  statusAfter: { type: String, enum: ASSET_STATUSES }, // Returned
  notes: { type: String, trim: true, maxlength: 500 },
  by: { type: actorSchema, required: true },
  at: { type: Date, default: Date.now }, // when it was recorded
});

const activitySchema = new mongoose.Schema({
  action: { type: String, enum: ACTIVITY_ACTIONS, required: true },
  // Field-by-field changes; values as stored (dates, numbers, text). See ASSET_FIELD_LABELS.
  changes: {
    type: [
      new mongoose.Schema(
        { field: { type: String, required: true }, before: mongoose.Schema.Types.Mixed, after: mongoose.Schema.Types.Mixed },
        { _id: false }
      ),
    ],
    default: [],
  },
  note: { type: String, maxlength: 300 },
  by: { type: actorSchema, required: true },
  at: { type: Date, default: Date.now },
});

const assetSchema = new mongoose.Schema(
  {
    assetId: { type: String, required: true, unique: true, immutable: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: [true, 'Category is required'] },
    // Copy of the category's name (for display, search and sorting); updated when the category is renamed.
    category: { type: String, trim: true },
    itemName: { type: String, required: [true, 'Item name is required'], trim: true, maxlength: 150 },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      default: 1,
      min: [1, 'Quantity must be at least 1'],
      max: [MAX_ASSET_QUANTITY, 'Quantity is too large'],
      validate: { validator: Number.isInteger, message: 'Quantity must be a whole number' },
    },
    // Free text; new brands are saved to am_brands (see models/Brand.js) so they show up for everyone.
    brand: { type: String, trim: true, maxlength: 60 },
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
    purchasedBy: { type: String, trim: true, maxlength: 120 },
    status: { type: String, enum: ASSET_STATUSES, default: 'Available' },
    remarks: { type: String, trim: true, maxlength: 2000 },

    // Current holder — set/cleared only by the assign/transfer/return APIs (never via create/update),
    // so one asset can belong to at most one employee at a time.
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
    assignedAt: { type: Date, default: null }, // when the current holder got it
    expectedReturnAt: { type: Date, default: null }, // optional due-back date for the current holder
    // Whether the current holder has acknowledged receiving it (mirrors the hand-over's toAck; null when unassigned).
    acknowledgement: {
      type: new mongoose.Schema(
        {
          eventId: { type: mongoose.Schema.Types.ObjectId, required: true },
          status: { type: String, enum: ACK_STATUSES, default: 'Pending' },
          acknowledgedAt: { type: Date },
        },
        { _id: false }
      ),
      default: null,
    },

    // Photo stored in GridFS (bucket am_asset_images); managed by the image APIs.
    image: { type: imageSchema, default: null },
    bill: { type: billSchema, default: null },

    // Read via GET /api/assets/:id/history; left out of every other response (see toJSON below).
    assignmentHistory: { type: [assignmentEventSchema], default: [] },
    activities: { type: [activitySchema], default: [] },
  },
  {
    timestamps: true,
    // save() fails (409) if the asset changed after it was loaded, so logged "before" values are always true.
    optimisticConcurrency: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        delete ret.assignmentHistory;
        delete ret.activities;
        return ret;
      },
    },
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
assetSchema.index({ categoryId: 1, createdAt: -1 });
assetSchema.index({ status: 1 });
// Everyone who ever held an asset appears as `to` in one of its events (employee history).
assetSchema.index({ 'assignmentHistory.to.employee': 1 });
assetSchema.index({ 'acknowledgement.status': 1 });

/** Projection that leaves out the (growing) history arrays — use it for lists and lookups. */
export const WITHOUT_HISTORY = '-assignmentHistory -activities';

export default defineModel('Asset', assetSchema, 'am_assets');
