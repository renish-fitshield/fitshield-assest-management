// Creates (or resets the PIN of) the initial login user.
// Usage: npm run seed   (reads .env.local)
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const {
  MONGODB_URI,
  MONGODB_DB = 'fitshield_asset_management',
  SEED_USER_EMAIL = 'jg@yopmail.com',
  SEED_USER_PIN = '4545',
  SEED_USER_NAME = 'JG',
  SEED_USER_ROLE = 'Admin',
} = process.env;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not set');
  process.exit(1);
}
if (!/^\d{4}$/.test(SEED_USER_PIN)) {
  console.error('SEED_USER_PIN must be exactly 4 digits');
  process.exit(1);
}

await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB, serverSelectionTimeoutMS: 10000 });
const users = mongoose.connection.db.collection('am_users');

await users.createIndex({ email: 1 }, { unique: true });

const email = SEED_USER_EMAIL.trim().toLowerCase();
const now = new Date();
const result = await users.updateOne(
  { email },
  {
    $set: {
      pinHash: await bcrypt.hash(SEED_USER_PIN, 10),
      name: SEED_USER_NAME,
      role: SEED_USER_ROLE,
      isActive: true,
      failedAttempts: 0,
      lockUntil: null,
      updatedAt: now,
    },
    $setOnInsert: { email, lastLoginAt: null, createdAt: now, __v: 0 },
  },
  { upsert: true }
);

console.log(
  `${result.upsertedCount ? 'Created' : 'Updated'} user ${email} (${SEED_USER_ROLE}) in ${MONGODB_DB}.am_users`
);
await mongoose.disconnect();
