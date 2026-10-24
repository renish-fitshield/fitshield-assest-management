// One-off: renames old asset IDs (AST-0001) to the FITSHIELD format, e.g. FITSHIELD-DELL-26-001.
// Same format as src/lib/assetId.js — keep the two in sync. Oldest assets get the lowest numbers.
// Assets already in the new format are left alone, so it's safe to run more than once.
// Usage: npm run migrate:asset-ids               (reads .env.local)
//        npm run migrate:asset-ids -- --dry-run  (only prints the old → new mapping)
import mongoose from 'mongoose';

const { MONGODB_URI, MONGODB_DB = 'fitshield_asset_management' } = process.env;
const dryRun = process.argv.includes('--dry-run');

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not set');
  process.exit(1);
}

const PREFIX = 'FITSHIELD';
const yearFormat = new Intl.DateTimeFormat('en-IN', { year: '2-digit', timeZone: 'Asia/Kolkata' });
const assetIdCode = (itemName) =>
  (itemName || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'ITEM';

await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB, serverSelectionTimeoutMS: 10000 });
const assets = mongoose.connection.db.collection('am_assets');
const counters = mongoose.connection.db.collection('am_counters');

const pending = await assets
  .find({ assetId: { $not: new RegExp(`^${PREFIX}-`) } }, { projection: { assetId: 1, itemName: 1, createdAt: 1 } })
  .sort({ createdAt: 1, _id: 1 })
  .toArray();

// Dry runs number locally; real runs use the same counters as the app, so IDs never collide.
const localSeq = new Map();
async function nextSeq(name) {
  if (dryRun) {
    if (!localSeq.has(name)) localSeq.set(name, (await counters.findOne({ _id: name }))?.seq ?? 0);
    localSeq.set(name, localSeq.get(name) + 1);
    return localSeq.get(name);
  }
  const counter = await counters.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  return counter.seq;
}

for (const asset of pending) {
  const code = assetIdCode(asset.itemName);
  const yy = yearFormat.format(asset.createdAt ?? asset._id.getTimestamp());
  const newId = `${PREFIX}-${code}-${yy}-${String(await nextSeq(`asset:${code}:${yy}`)).padStart(3, '0')}`;
  if (!dryRun) {
    const { modifiedCount } = await assets.updateOne({ _id: asset._id, assetId: asset.assetId }, { $set: { assetId: newId } });
    if (!modifiedCount) {
      console.warn(`skipped ${asset.assetId}: it changed while migrating (run again)`);
      continue;
    }
  }
  console.log(`${asset.assetId.padEnd(12)} → ${newId.padEnd(24)} ${asset.itemName}`);
}

console.log(
  `${dryRun ? '[dry run] would rename' : 'Renamed'} ${pending.length} asset${pending.length === 1 ? '' : 's'} in ${MONGODB_DB}.am_assets`
);
await mongoose.disconnect();
