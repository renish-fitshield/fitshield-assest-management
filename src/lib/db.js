import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || 'fitshield_asset_management';

// Reuse the connection across hot reloads in dev and across invocations in prod.
let cached = global._mongooseCache;
if (!cached) cached = global._mongooseCache = { promise: null };

/**
 * Connects once and reuses the connection.
 * - If the initial connect fails, the cache is cleared so the next request retries.
 * - If an established connection drops, the MongoDB driver reconnects by itself; queries issued
 *   meanwhile are buffered (up to bufferTimeoutMS) instead of failing instantly.
 */
export async function connectDB() {
  if (!MONGODB_URI) throw new Error('MONGODB_URI is not configured');

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI, {
        dbName: MONGODB_DB,
        serverSelectionTimeoutMS: 10000,
        bufferTimeoutMS: 10000,
      })
      .catch((err) => {
        cached.promise = null; // let the next request try again
        throw err;
      });
  }
  return cached.promise;
}
