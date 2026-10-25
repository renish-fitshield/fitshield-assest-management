// One-off: sets employmentType = "Full-Time" on every employee saved before the field existed.
// Employees that already have a type are left alone, so it's safe to run more than once.
// Usage: npm run migrate:employment-type               (reads .env.local)
//        npm run migrate:employment-type -- --dry-run  (only prints who would change)
import mongoose from 'mongoose';

const { MONGODB_URI, MONGODB_DB = 'fitshield_asset_management' } = process.env;
const dryRun = process.argv.includes('--dry-run');

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not set');
  process.exit(1);
}

await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB, serverSelectionTimeoutMS: 10000 });
const employees = mongoose.connection.db.collection('am_employees');

const missing = { employmentType: { $in: [null, ''] } }; // null also matches a missing field
const pending = await employees.find(missing, { projection: { employeeId: 1, fullName: 1, workEmail: 1 } }).toArray();
for (const e of pending) console.log(`→ ${e.employeeId}  ${e.fullName}  (${e.workEmail})  → Full-Time`);

if (!dryRun && pending.length) {
  const { modifiedCount } = await employees.updateMany(missing, { $set: { employmentType: 'Full-Time' } });
  console.log(`Set ${modifiedCount} employee${modifiedCount === 1 ? '' : 's'} to Full-Time in ${MONGODB_DB}.am_employees`);
} else {
  console.log(`${dryRun ? '[dry run] would set' : 'Nothing to do:'} ${pending.length} employee${pending.length === 1 ? '' : 's'} ${dryRun ? 'to Full-Time' : 'without a type'}`);
}
await mongoose.disconnect();
