// One-off: gives every employee an ID in the FSEMP-<department>-<serial> format (e.g. EMP-0056 →
// FSEMP-ENG-0002) and updates every place the old ID was copied into an asset:
//   - the hand-over history (assignmentHistory[].to / .from employeeId)
//   - the activity log text (notes and before/after values, e.g. "Renish Salakhana (EMP-0056)")
//   - "Purchased by"
// Serials count up per department, in the order the employees were added. The old ID is kept in
// previousEmployeeIds, so searching it still finds the employee.
// Safe to run more than once: employees already on the new format are left alone, and the asset pass
// re-applies every recorded old → new ID (so it also finishes a run that was interrupted).
// Usage: npm run migrate:employee-ids               (reads .env.local)
//        npm run migrate:employee-ids -- --dry-run  (only prints what would change)
import mongoose from 'mongoose';

// Same format and codes as src/lib/employeeId.js and DEPARTMENT_CODES in src/lib/constants.js — keep in sync.
const PREFIX = 'FSEMP';
const DEPARTMENT_CODES = {
  Engineering: 'ENG',
  Product: 'PRD',
  Design: 'DSN',
  'Data Science': 'DSC',
  QA: 'QA',
  DevOps: 'DVO',
  'Human Resources': 'HR',
  Finance: 'FIN',
  Sales: 'SAL',
  Marketing: 'MKT',
  Operations: 'OPS',
  'Customer Support': 'CS',
  Management: 'MGT',
};
const departmentCode = (department) =>
  DEPARTMENT_CODES[department] || String(department || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'GEN';
const NEW_FORMAT = new RegExp(`^${PREFIX}-[A-Z]+-\\d+$`);

const { MONGODB_URI, MONGODB_DB = 'fitshield_asset_management' } = process.env;
const dryRun = process.argv.includes('--dry-run');

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not set');
  process.exit(1);
}

await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB, serverSelectionTimeoutMS: 10000 });
const db = mongoose.connection.db;
const employees = db.collection('am_employees');
const assets = db.collection('am_assets');
const counters = db.collection('am_counters');

try {
  // ---- 1. Employees: work out each new ID
  const all = await employees
    .find({}, { projection: { employeeId: 1, fullName: 1, department: 1, createdAt: 1, previousEmployeeIds: 1 } })
    .toArray();

  const highest = new Map(); // department code → highest serial already in use
  for (const e of all) {
    if (!NEW_FORMAT.test(e.employeeId)) continue;
    const [, code, serial] = e.employeeId.split('-');
    highest.set(code, Math.max(highest.get(code) || 0, Number(serial)));
  }

  const legacyNumber = (id) => Number(String(id).match(/(\d+)$/)?.[1] ?? Number.MAX_SAFE_INTEGER);
  const renames = all
    .filter((e) => !NEW_FORMAT.test(e.employeeId))
    .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0) || legacyNumber(a.employeeId) - legacyNumber(b.employeeId))
    .map((e) => {
      const code = departmentCode(e.department);
      const serial = (highest.get(code) || 0) + 1;
      highest.set(code, serial);
      return { _id: e._id, from: e.employeeId, to: `${PREFIX}-${code}-${String(serial).padStart(4, '0')}`, fullName: e.fullName, department: e.department };
    });

  for (const r of renames) console.log(`→ ${r.from.padEnd(12)} → ${r.to.padEnd(16)} ${r.fullName} (${r.department || 'no department'})`);
  if (!renames.length) console.log('Every employee already has an FSEMP ID.');

  if (!dryRun) {
    for (const r of renames) {
      // Matching on the old ID too: if someone changed it meanwhile, it's left alone.
      await employees.updateOne({ _id: r._id, employeeId: r.from }, { $set: { employeeId: r.to }, $addToSet: { previousEmployeeIds: r.from } });
    }
    // New employees continue each department's serials from here.
    for (const [code, serial] of highest) {
      await counters.updateOne({ _id: `employee:${code}` }, { $max: { seq: serial } }, { upsert: true });
    }
  }

  // ---- 2. Assets: every copy of an old ID
  const currentId = new Map(); // employee _id → current ID
  const oldToNew = new Map(); // old ID → current ID
  for (const e of all) {
    currentId.set(String(e._id), e.employeeId);
    for (const old of e.previousEmployeeIds || []) oldToNew.set(old, e.employeeId);
  }
  for (const r of renames) {
    currentId.set(String(r._id), r.to);
    oldToNew.set(r.from, r.to);
  }

  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Whole IDs only: "EMP-0005" never matches inside "EMP-00056" or "FSEMP-ENG-0005".
  const pattern = oldToNew.size
    ? new RegExp(`(?<![A-Za-z0-9-])(${[...oldToNew.keys()].map(escape).join('|')})(?![A-Za-z0-9])`, 'g')
    : null;
  const swap = (value) => (typeof value === 'string' && pattern ? value.replace(pattern, (id) => oldToNew.get(id)) : value);

  let assetsChanged = 0;
  let fieldsChanged = 0;
  const cursor = assets.find(
    {},
    { projection: { assetId: 1, purchasedBy: 1, 'assignmentHistory.to': 1, 'assignmentHistory.from': 1, 'activities.note': 1, 'activities.changes': 1 } }
  );
  for await (const asset of cursor) {
    // Paths by array position: history and activities are only ever appended to, so a concurrent
    // hand-over can't shift what these point at.
    const set = {};
    (asset.assignmentHistory || []).forEach((event, i) => {
      for (const side of ['to', 'from']) {
        const holder = event[side];
        if (!holder) continue;
        const id = (holder.employee && currentId.get(String(holder.employee))) || oldToNew.get(holder.employeeId);
        if (id && holder.employeeId !== id) set[`assignmentHistory.${i}.${side}.employeeId`] = id;
      }
    });
    (asset.activities || []).forEach((entry, i) => {
      const note = swap(entry.note);
      if (note !== entry.note) set[`activities.${i}.note`] = note;
      (entry.changes || []).forEach((change, j) => {
        for (const key of ['before', 'after']) {
          const value = swap(change[key]);
          if (value !== change[key]) set[`activities.${i}.changes.${j}.${key}`] = value;
        }
      });
    });
    const purchasedBy = swap(asset.purchasedBy);
    if (purchasedBy !== asset.purchasedBy) set.purchasedBy = purchasedBy;

    const count = Object.keys(set).length;
    if (!count) continue;
    assetsChanged++;
    fieldsChanged += count;
    console.log(`  ${asset.assetId}: ${count} place${count === 1 ? '' : 's'}`);
    if (!dryRun) await assets.updateOne({ _id: asset._id }, { $set: set });
  }

  const verb = dryRun ? '[dry run] would update' : 'Updated';
  console.log(
    `${verb} ${renames.length} employee ID${renames.length === 1 ? '' : 's'} and ${fieldsChanged} copied ID${fieldsChanged === 1 ? '' : 's'} in ${assetsChanged} asset${assetsChanged === 1 ? '' : 's'} (${MONGODB_DB}).`
  );
} finally {
  await mongoose.disconnect();
}
