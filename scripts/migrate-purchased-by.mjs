// One-off: "Purchased By" used to be a reference to an employee and is now free text.
// Rewrites each stored employee id as "Full Name (EMP-0001)"; ids of deleted employees are cleared.
// Safe to run more than once.
// Usage: npm run migrate:purchased-by   (reads .env.local)
import mongoose from 'mongoose';

const { MONGODB_URI, MONGODB_DB = 'fitshield_asset_management' } = process.env;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not set');
  process.exit(1);
}

await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB, serverSelectionTimeoutMS: 10000 });
const assets = mongoose.connection.db.collection('am_assets');
const employees = mongoose.connection.db.collection('am_employees');

const linked = await assets.find({ purchasedBy: { $type: 'objectId' } }, { projection: { purchasedBy: 1 } }).toArray();
const ids = [...new Set(linked.map((a) => a.purchasedBy.toString()))].map((id) => new mongoose.Types.ObjectId(id));
const people = await employees.find({ _id: { $in: ids } }, { projection: { fullName: 1, employeeId: 1 } }).toArray();
const names = new Map(people.map((e) => [e._id.toString(), `${e.fullName} (${e.employeeId})`]));

let converted = 0;
let cleared = 0;
for (const asset of linked) {
  const name = names.get(asset.purchasedBy.toString());
  await assets.updateOne(
    { _id: asset._id, purchasedBy: asset.purchasedBy },
    name ? { $set: { purchasedBy: name } } : { $unset: { purchasedBy: '' } }
  );
  if (name) converted += 1;
  else cleared += 1;
}

// Old documents stored "no purchaser" as null; the field is now simply left out.
const nulls = await assets.updateMany({ purchasedBy: null }, { $unset: { purchasedBy: '' } });

console.log(
  `${MONGODB_DB}.am_assets: ${converted} converted to text, ${cleared} cleared (employee deleted), ${nulls.modifiedCount} empty values tidied`
);
await mongoose.disconnect();
