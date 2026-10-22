import { connectDB } from '@/lib/db';
import { ok, handleError, readJson } from '@/lib/api';
import { parseListRequest, runPagedQuery, listResponse } from '@/lib/listRequest';
import { buildEmployeeFilter, EMPLOYEE_FILTER_KEYS, EMPLOYEE_SORT_FIELDS } from '@/lib/employeeFilters';
import Employee from '@/models/Employee';
import Asset from '@/models/Asset';

/**
 * POST /api/employees/list
 * Body: { filter: { searchText, department, status, workType },
 *         pagination_info: { page, perPageData }, sort: { sortBy, data } }
 */
export async function POST(req) {
  try {
    const request = parseListRequest(await readJson(req), {
      filterKeys: EMPLOYEE_FILTER_KEYS,
      sortFields: EMPLOYEE_SORT_FIELDS,
    });
    const mongoFilter = buildEmployeeFilter(request.filter);

    await connectDB();
    const result = await runPagedQuery(Employee, mongoFilter, request, (skip, limit) =>
      Employee.find(mongoFilter).sort(request.mongoSort).skip(skip).limit(limit).lean()
    );

    // How many assets each employee on this page currently holds.
    const counts = await Asset.aggregate([
      { $match: { assignedTo: { $in: result.items.map((e) => e._id) } } },
      { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
    ]);
    const countById = new Map(counts.map((c) => [String(c._id), c.count]));
    const items = result.items.map((e) => ({ ...e, assignedAssetCount: countById.get(String(e._id)) || 0 }));

    return ok(
      listResponse({ ...result, items, perPage: request.perPage, filter: request.filter, sort: request.sort })
    );
  } catch (err) {
    return handleError(err);
  }
}
