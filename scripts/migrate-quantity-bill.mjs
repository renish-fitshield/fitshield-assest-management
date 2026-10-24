// One-off: adds the new asset fields to assets created before they existed —
// `quantity: 1` and `bill: null` (no bill / invoice file). Safe to run more than once.
// Usage: npm run migrate:quantity-bill   (reads .env.local)
import mongoose from 'mongoose';

const { MONGODB_URI, MONGODB_DB = 'fitshield_asset_management' } = process.env;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not set');
  process.exit(1);
}

await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB, serverSelectionTimeoutMS: 10000 });
const assets = mongoose.connection.db.collection('am_assets');

const quantity = await assets.updateMany({ quantity: { $exists: false } }, { $set: { quantity: 1 } });
const bill = await assets.updateMany({ bill: { $exists: false } }, { $set: { bill: null } });

console.log(
  `${MONGODB_DB}.am_assets: quantity set to 1 on ${quantity.modifiedCount} asset(s), empty bill added to ${bill.modifiedCount} asset(s)`
);
await mongoose.disconnect();
