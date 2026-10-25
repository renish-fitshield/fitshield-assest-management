// One-off: moves asset categories into their own collection (am_categories) and links every asset to
// one by `categoryId`, keeping the name in `category`.
//  1. Adds the categories the app used to have built in, plus any other category name found on an asset.
//     "laptop" and "Laptop" are the same category (same rule as src/lib/constants.js → categoryKey).
//  2. Sets `categoryId` (and the category's exact name) on every asset.
// Safe to run more than once: existing categories are reused, and linked assets only get their name refreshed.
// Usage: npm run migrate:categories               (reads .env.local)
//        npm run migrate:categories -- --dry-run  (only prints what would change)
import mongoose from 'mongoose';

const { MONGODB_URI, MONGODB_DB = 'fitshield_asset_management' } = process.env;
const dryRun = process.argv.includes('--dry-run');

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not set');
  process.exit(1);
}

// The list that used to be hard-coded in src/lib/constants.js (ASSET_CATEGORIES).
const BUILT_IN = [
  'Laptop',
  'Desktop',
  'Monitor',
  'Mobile Phone',
  'Tablet',
  'Keyboard',
  'Mouse',
  'Headset',
  'Printer',
  'Networking',
  'Storage Device',
  'Furniture',
  'Accessories',
  'Other',
];

const tidy = (name) => String(name ?? '').trim().replace(/\s+/g, ' ');
const categoryKey = (name) => tidy(name).toLowerCase();

await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB, serverSelectionTimeoutMS: 10000 });
const db = mongoose.connection.db;
const categories = db.collection('am_categories');
const assets = db.collection('am_assets');

if (!dryRun) await categories.createIndex({ key: 1 }, { unique: true });

// 1. Categories: built-in ones first, then any other name used on an asset.
const usedNames = (await assets.distinct('category')).filter((n) => typeof n === 'string' && tidy(n));
const byKey = new Map((await categories.find({}, { projection: { name: 1, key: 1 } }).toArray()).map((c) => [c.key, c]));
let created = 0;
for (const raw of [...BUILT_IN, ...usedNames]) {
  const name = tidy(raw);
  const key = categoryKey(name);
  if (byKey.has(key)) continue;
  const now = new Date();
  const doc = { _id: new mongoose.Types.ObjectId(), name, key, createdAt: now, updatedAt: now, __v: 0 };
  if (!dryRun) {
    // Upsert on the unique key, so a category added in the app meanwhile is reused rather than duplicated.
    await categories.updateOne({ key }, { $setOnInsert: doc }, { upsert: true });
    byKey.set(key, await categories.findOne({ key }, { projection: { name: 1, key: 1 } }));
  } else {
    byKey.set(key, doc);
  }
  created++;
  console.log(`+ category  ${name}`);
}

// 2. Assets: link by name (any capitalisation), then refresh names on already-linked assets.
let linked = 0;
for (const raw of usedNames) {
  const category = byKey.get(categoryKey(raw));
  const filter = { category: raw, categoryId: null }; // null also matches a missing field
  const count = await assets.countDocuments(filter);
  if (!count) continue;
  if (!dryRun) await assets.updateMany(filter, { $set: { categoryId: category._id, category: category.name } });
  linked += count;
  console.log(`→ ${String(count).padStart(4)} asset${count === 1 ? ' ' : 's'} "${raw}" → ${category.name} (${category._id})`);
}

let renamed = 0;
if (!dryRun) {
  for (const category of byKey.values()) {
    const { modifiedCount } = await assets.updateMany(
      { categoryId: category._id, category: { $ne: category.name } },
      { $set: { category: category.name } }
    );
    renamed += modifiedCount;
  }
}

// Assets left without a category (in a dry run nothing was linked yet, so leave out the ones that would be).
const missing = (await assets.countDocuments({ categoryId: null })) - (dryRun ? linked : 0);

console.log(
  `${dryRun ? '[dry run] would add' : 'Added'} ${created} categor${created === 1 ? 'y' : 'ies'}, ` +
    `${dryRun ? 'would link' : 'linked'} ${linked} asset${linked === 1 ? '' : 's'}` +
    (dryRun ? '' : `, refreshed the name on ${renamed}`) +
    ` in ${MONGODB_DB}`
);
if (missing) console.warn(`⚠ ${missing} asset${missing === 1 ? ' has' : 's have'} no category at all — pick one by editing them in the app.`);
await mongoose.disconnect();
