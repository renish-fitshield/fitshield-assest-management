import { ApiError } from '@/lib/api';

/**
 * List APIs take search, filters, pagination and sorting in the JSON body (never the query string):
 *
 *   {
 *     "filter":          { "searchText": "mac", "status": "Assigned", ... },
 *     "pagination_info": { "page": 1, "perPageData": 20 },
 *     "sort":            { "sortBy": "cost", "data": 1 }      // data: 0 default, 1 ascending, 2 descending
 *   }
 *
 * and respond with
 *
 *   {
 *     "items": [...],
 *     "filter":          { ...filters that were applied },
 *     "pagination_info": { "page": 1, "nextPage": 2 | null, "perPageData": 20, "totalPages": 3 },
 *     "sort":            { "sortBy": "cost" | null, "data": 1 },
 *     "totalCount": 47
 *   }
 */

export const SORT_DATA = { DEFAULT: 0, ASC: 1, DESC: 2 };
export const DEFAULT_PER_PAGE = 10;
export const MAX_PER_PAGE = 100;

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function toInt(value, fallback, label) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n)) throw new ApiError(`${label} must be a whole number`, 400);
  return n;
}

/**
 * Validates `body.filter`: only known keys, string values; blanks are dropped.
 * `searchText` is always allowed.
 */
export function parseFilter(body, allowedKeys) {
  const input = body?.filter ?? {};
  if (!isPlainObject(input)) throw new ApiError('"filter" must be an object', 400);

  const unknown = Object.keys(input).filter((k) => k !== 'searchText' && !allowedKeys.includes(k));
  if (unknown.length) {
    throw new ApiError(`Unknown filter key(s): ${unknown.join(', ')}. Allowed: searchText, ${allowedKeys.join(', ')}`, 400);
  }

  const filter = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === null || value === undefined) continue;
    if (typeof value !== 'string') throw new ApiError(`filter.${key} must be a string`, 400);
    const trimmed = value.trim();
    if (trimmed) filter[key] = key === 'searchText' ? trimmed.slice(0, 100) : trimmed;
  }
  return filter;
}

/** Validates the whole list request body. */
export function parseListRequest(body, { filterKeys, sortFields }) {
  if (!isPlainObject(body)) throw new ApiError('Request body must be a JSON object', 400);

  const filter = parseFilter(body, filterKeys);

  const paging = body.pagination_info ?? {};
  if (!isPlainObject(paging)) throw new ApiError('"pagination_info" must be an object', 400);
  const page = toInt(paging.page, 1, 'pagination_info.page');
  const perPage = toInt(paging.perPageData, DEFAULT_PER_PAGE, 'pagination_info.perPageData');
  if (page < 1) throw new ApiError('pagination_info.page must be 1 or more', 400);
  if (perPage < 1 || perPage > MAX_PER_PAGE) {
    throw new ApiError(`pagination_info.perPageData must be between 1 and ${MAX_PER_PAGE}`, 400);
  }

  const sortIn = body.sort ?? {};
  if (!isPlainObject(sortIn)) throw new ApiError('"sort" must be an object', 400);
  const data = toInt(sortIn.data, SORT_DATA.DEFAULT, 'sort.data');
  if (!Object.values(SORT_DATA).includes(data)) {
    throw new ApiError('sort.data must be 0 (default), 1 (ascending) or 2 (descending)', 400);
  }
  let sortBy = null;
  let mongoSort = { createdAt: -1, _id: -1 }; // default: newest first
  if (data !== SORT_DATA.DEFAULT) {
    if (!sortFields.includes(sortIn.sortBy)) {
      throw new ApiError(`sort.sortBy must be one of: ${sortFields.join(', ')}`, 400);
    }
    sortBy = sortIn.sortBy;
    const dir = data === SORT_DATA.ASC ? 1 : -1;
    // _id tiebreaker keeps page boundaries stable when many rows share a value.
    mongoSort = { [sortBy]: dir, _id: dir };
  }

  return { filter, page, perPage, mongoSort, sort: { sortBy, data } };
}

/**
 * Count, clamp the page (a deleted last row can leave the requested page empty), then fetch it.
 * `query(skip, limit)` must return the Mongoose query for that slice.
 */
export async function runPagedQuery(Model, mongoFilter, { page, perPage }, query) {
  const totalCount = await Model.countDocuments(mongoFilter);
  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));
  const effectivePage = Math.min(page, totalPages);
  const items = await query((effectivePage - 1) * perPage, perPage);
  return { items, totalCount, page: effectivePage, totalPages };
}

export function listResponse({ items, totalCount, page, totalPages, perPage, filter, sort }) {
  return {
    items,
    filter,
    pagination_info: {
      page,
      nextPage: page < totalPages ? page + 1 : null,
      perPageData: perPage,
      totalPages,
    },
    sort,
    totalCount,
  };
}

/** Validates an optional enum value from a parsed filter. */
export function enumValue(filter, key, allowed) {
  const value = filter[key];
  if (!value) return null;
  if (!allowed.includes(value)) throw new ApiError(`Invalid filter.${key}: "${value}"`, 400);
  return value;
}
