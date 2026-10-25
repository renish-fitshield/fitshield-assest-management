// One-off: copies the old assignment records (am_assignments) into each asset's `assignmentHistory`
// array (an "Assigned" entry, plus a "Returned" entry if it was returned), with employee and user names
// as they are now. Old entries go before any newer ones. am_assignments itself is left untouched.
// Safe to run more than once: an "Assigned" entry keeps the old record's _id, so copied records are skipped.
// Also creates the index used for employee history, and gives older assets empty history arrays.
// Usage: npm run migrate:assignment-history               (reads .env.local)
//        npm run migrate:assignment-history -- --dry-run  (only prints what would change)
import mongoose from 'mongoose';

const { MONGODB_URI, MONGODB_DB = 'fitshield_asset_management' } = process.env;
const dryRun = process.argv.includes('--dry-run');

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not set');
  process.exit(1);
}

await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB, serverSelectionTimeoutMS: 10000 });
const db = mongoose.connection.db;
const assets = db.collection('am_assets');

if (!dryRun) await assets.createIndex({ 'assignmentHistory.to.employee': 1 });

// Assets saved before history existed have no arrays at all; give them empty ones.
for (const field of ['assignmentHistory', 'activities']) {
  const missing = { [field]: { $exists: false } };
  const count = await assets.countDocuments(missing);
  if (count && !dryRun) await assets.updateMany(missing, { $set: { [field]: [] } });
  if (count) console.log(`${dryRun ? '[dry run] would add' : 'Added'} an empty ${field} to ${count} asset${count === 1 ? '' : 's'}`);
}

const legacy = await db.collection('am_assignments').find().sort({ assignedAt: 1, createdAt: 1 }).toArray();
const employees = new Map(
  (await db.collection('am_employees').find({}, { projection: { employeeId: 1, fullName: 1, department: 1 } }).toArray()).map(
    (e) => [String(e._id), e]
  )
);
const users = new Map((await db.collection('am_users').find({}, { projection: { name: 1 } }).toArray()).map((u) => [String(u._id), u]));

const holder = (id) => {
  const e = employees.get(String(id));
  return e
    ? { employee: e._id, employeeId: e.employeeId, fullName: e.fullName, department: e.department }
    : { employee: id, fullName: 'Deleted employee' };
};
const actor = (id) => {
  const u = id && users.get(String(id));
  return u ? { user: u._id, name: u.name } : { user: null, name: 'Unknown user' };
};
// Leave out empty fields rather than storing nulls.
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));

const byAsset = new Map();
for (const a of legacy) {
  const key = String(a.asset);
  if (!byAsset.has(key)) byAsset.set(key, []);
  byAsset.get(key).push(a);
}

let copied = 0;
let skipped = 0;
for (const [assetKey, records] of byAsset) {
  const asset = await assets.findOne({ _id: records[0].asset }, { projection: { assetId: 1, itemName: 1, 'assignmentHistory._id': 1 } });
  if (!asset) {
    console.warn(`- skipped ${records.length} record(s) for a deleted asset (${assetKey})`);
    skipped += records.length;
    continue;
  }
  const already = new Set((asset.assignmentHistory || []).map((e) => String(e._id)));
  const events = [];
  for (const a of records) {
    if (already.has(String(a._id))) {
      skipped++;
      continue;
    }
    const who = holder(a.employee);
    events.push(
      clean({
        _id: a._id,
        action: 'Assigned',
        to: who,
        date: a.assignedAt,
        condition: a.conditionAtAssign,
        notes: a.notes,
        by: actor(a.assignedBy),
        at: a.createdAt || a.assignedAt,
      })
    );
    if (!a.active && a.returnedAt) {
      events.push(
        clean({
          _id: new mongoose.Types.ObjectId(),
          action: 'Returned',
          from: who,
          date: a.returnedAt,
          condition: a.conditionAtReturn,
          notes: a.returnNotes,
          by: actor(a.returnedBy),
          at: a.updatedAt || a.returnedAt,
        })
      );
    }
    copied++;
    console.log(
      `→ ${asset.assetId.padEnd(24)} ${who.fullName}: ${a.assignedAt.toISOString().slice(0, 10)} → ${
        a.returnedAt ? a.returnedAt.toISOString().slice(0, 10) : 'now'
      }`
    );
  }
  if (!events.length || dryRun) continue;
  events.sort((x, y) => x.date - y.date || x.at - y.at);
  // Older than anything recorded since, so they go first.
  await assets.updateOne({ _id: asset._id }, { $push: { assignmentHistory: { $each: events, $position: 0 } } });
}

console.log(
  `${dryRun ? '[dry run] would copy' : 'Copied'} ${copied} assignment record${copied === 1 ? '' : 's'}` +
    `${skipped ? `, skipped ${skipped} (already copied or asset deleted)` : ''} in ${MONGODB_DB}`
);
await mongoose.disconnect();
