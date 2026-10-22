import { connectDB } from '@/lib/db';
import { ok, handleError, readJson } from '@/lib/api';
import { parseListRequest, runPagedQuery, listResponse } from '@/lib/listRequest';
import { buildAssetFilter, ASSET_FILTER_KEYS, ASSET_SORT_FIELDS } from '@/lib/assetFilters';
import { HOLDER_FIELDS } from '@/lib/assignments';
import Asset from '@/models/Asset';

/**
 * POST /api/assets/list
 * Body: { filter: { searchText, assignedTo (employee id), category, status, condition, purchaseType, location, warrantyStatus,
 *                   purchasedFrom, purchasedTo }, pagination_info: { page, perPageData }, sort: { sortBy, data } }
 */
export async function POST(req) {
  try {
    const request = parseListRequest(await readJson(req), {
      filterKeys: ASSET_FILTER_KEYS,
      sortFields: ASSET_SORT_FIELDS,
    });
    const mongoFilter = buildAssetFilter(request.filter);

    await connectDB();
    const result = await runPagedQuery(Asset, mongoFilter, request, (skip, limit) =>
      Asset.find(mongoFilter)
        .sort(request.mongoSort)
        .skip(skip)
        .limit(limit)
        .populate('purchasedBy', 'employeeId fullName')
        .populate('assignedTo', HOLDER_FIELDS)
    );

    return ok(listResponse({ ...result, perPage: request.perPage, filter: request.filter, sort: request.sort }));
  } catch (err) {
    return handleError(err);
  }
}
