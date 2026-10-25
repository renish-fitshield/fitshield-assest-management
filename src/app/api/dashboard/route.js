import { connectDB } from '@/lib/db';
import { ok, handleError, readJson } from '@/lib/api';
import { parseFilter } from '@/lib/listRequest';
import { buildAssetFilter, ASSET_FILTER_KEYS } from '@/lib/assetFilters';
import { buildDashboard } from '@/lib/dashboard';

/**
 * POST /api/dashboard
 * Body: { filter: { searchText, categoryId, status, condition, purchaseType, location, warrantyStatus,
 *                   purchasedFrom, purchasedTo } } — same filter keys as POST /api/assets/list.
 *
 * Responds with chart-ready rows (see lib/dashboard.js):
 *   kpis    — totals, value, status counts, utilization, acknowledgements, returns, spend in the window
 *   charts  — monthly, handOvers (one row per month), status, categories (stacked by status),
 *             condition, warranty, age, locations, departments
 *   people  — employees by status / employment type, holders, top holders
 *   lists   — expiringSoon, overdueReturns, recentAssets, recentHandOvers
 *   window  — the months the trend charts cover
 * All asset metrics respect the filters; employee counts cover everyone.
 */
export async function POST(req) {
  try {
    const applied = parseFilter(await readJson(req), ASSET_FILTER_KEYS);
    const filter = buildAssetFilter(applied);
    await connectDB();
    return ok(await buildDashboard(filter, applied));
  } catch (err) {
    return handleError(err);
  }
}
