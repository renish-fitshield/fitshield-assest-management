import mongoose from 'mongoose';

/**
 * Registers a Mongoose model once per process.
 *
 * Mongoose is a single Node module shared across hot reloads, so in development a plain
 * `mongoose.models.X || mongoose.model(...)` keeps serving the schema from the FIRST load —
 * schema edits (new fields) would be ignored until a restart (e.g. StrictPopulateError for a
 * new ref). In development we therefore drop and re-register the model each time its file
 * is evaluated; in production the cached model is reused.
 */
export default function defineModel(name, schema, collection) {
  if (process.env.NODE_ENV !== 'production' && mongoose.models[name]) {
    mongoose.deleteModel(name);
  }
  return mongoose.models[name] || mongoose.model(name, schema, collection);
}
