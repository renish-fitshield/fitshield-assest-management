/**
 * Builds the JSON body for list APIs (POST /api/assets/list, /api/employees/list):
 *   { filter: { searchText, ...filters }, pagination_info: { page, perPageData }, sort: { sortBy, data } }
 * Empty values are left out of `filter`.
 */

export const SORT_DATA = { DEFAULT: 0, ASC: 1, DESC: 2 };

const isSet = (v) => v !== null && v !== undefined && v !== '';

/** `{ searchText, ...filters }` with only the values the user actually set. */
export function toFilterPayload(source, filterKeys) {
  const filter = {};
  if (isSet(source.searchText)) filter.searchText = source.searchText;
  for (const key of filterKeys) if (isSet(source[key])) filter[key] = source[key];
  return filter;
}

export function toListPayload(query, filterKeys) {
  return {
    filter: toFilterPayload(query, filterKeys),
    pagination_info: { page: query.page, perPageData: query.perPageData },
    sort: {
      sortBy: query.sortData === SORT_DATA.DEFAULT ? null : query.sortBy,
      data: query.sortData,
    },
  };
}
