import { NextResponse } from 'next/server';
import mongoose from 'mongoose';

export const ok = (data, status = 200) => NextResponse.json(data, { status });

export const fail = (message, status = 400, extra = {}) =>
  NextResponse.json({ message, ...extra }, { status });

/** Throw from anywhere in a route to return a clean 4xx with an optional per-field error map. */
export class ApiError extends Error {
  /** `code` (optional) is a stable machine-readable reason, e.g. "LINK_EXPIRED". */
  constructor(message, status = 400, fields, code) {
    super(message);
    this.status = status;
    this.fields = fields;
    this.code = code;
  }
}

const DUPLICATE_LABELS = { workEmail: 'work email', assetId: 'asset ID', employeeId: 'employee ID', email: 'email' };

export function handleError(err) {
  if (err instanceof ApiError) {
    return fail(err.message, err.status, { ...(err.fields ? { fields: err.fields } : {}), ...(err.code ? { code: err.code } : {}) });
  }
  if (err instanceof mongoose.Error.ValidationError) {
    // `fields` lets the UI show each message under the matching form input.
    const fields = Object.fromEntries(Object.entries(err.errors).map(([path, e]) => [path, e.message]));
    return fail(Object.values(fields).join(', '), 400, { fields });
  }
  if (err instanceof mongoose.Error.CastError) {
    return fail(`Invalid value for ${err.path}`, 400, { fields: { [err.path]: `Invalid value for ${err.path}` } });
  }
  if (err?.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    const message = `A record with this ${DUPLICATE_LABELS[field] || field} already exists`;
    return fail(message, 409, { fields: { [field]: message } });
  }
  if (err instanceof mongoose.Error.DocumentNotFoundError || err instanceof mongoose.Error.VersionError) {
    return fail('This record was changed by someone else. Refresh and try again.', 409);
  }
  if (err instanceof SyntaxError) {
    return fail('Invalid JSON body', 400);
  }
  const bufferingTimeout = err?.name === 'MongooseError' && /buffering timed out/i.test(err.message);
  if (bufferingTimeout || DB_UNAVAILABLE_ERRORS.has(err?.name) || DB_UNAVAILABLE_ERRORS.has(err?.cause?.name)) {
    console.error(`[api] database unavailable (${err.name}):`, err.message);
    return fail('Database is unavailable. Please try again shortly.', 503, { code: 'DB_UNAVAILABLE' });
  }
  console.error('[api] unexpected error:', err);
  // In development, say what actually failed so it shows up in the UI and the Network tab.
  const detail = process.env.NODE_ENV !== 'production' && err ? ` (${err.name}: ${err.message})` : '';
  return fail(`Internal server error${detail}`, 500);
}

// Connection-level failures from the MongoDB driver and Mongoose (they use different names).
const DB_UNAVAILABLE_ERRORS = new Set([
  'MongoServerSelectionError',
  'MongooseServerSelectionError',
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
  'MongoNotConnectedError',
  'MongoTopologyClosedError',
  'MongoPoolClearedError',
]);

export const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

export const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Parse a JSON body, rejecting anything that isn't a plain object. */
export async function readJson(req) {
  const body = await req.json();
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError('Request body must be a JSON object', 400);
  }
  return body;
}

/**
 * Keep only whitelisted fields from a request body and normalise empty values to null,
 * so clients can clear optional fields and cannot write system-managed ones (ids, timestamps).
 */
export function pickFields(body, fields) {
  const out = {};
  for (const key of fields) {
    if (!(key in (body || {}))) continue;
    let value = body[key];
    if (typeof value === 'string') value = value.trim();
    out[key] = value === '' || value === undefined ? null : value;
  }
  return out;
}

