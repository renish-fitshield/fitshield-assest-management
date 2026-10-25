import { connectDB } from '@/lib/db';
import { ok, handleError, readJson } from '@/lib/api';
import { parseFilter } from '@/lib/listRequest';
import { buildAssetFilter, ASSET_FILTER_KEYS } from '@/lib/assetFilters';
import {
  ASSET_STATUSES,
  ASSET_CONDITIONS,
  WARRANTY_STATUSES,
  EMPLOYEE_STATUSES,
  WORK_TYPES,
} from '@/lib/constants';
import Asset from '@/models/Asset';
import Employee from '@/models/Employee';
import Category from '@/models/Category';

const EXPIRING_DAYS = 30;
const MONTHS = 12;

const sumCost = { $sum: { $ifNull: ['$cost', 0] } };

/** Fill every known key so the UI can render empty buckets, preserving the canonical order. */
const fillBuckets = (keys, rows, field) => {
  const map = Object.fromEntries(rows.map((r) => [r._id, r]));
  return keys.map((key) => ({ [field]: key, count: map[key]?.count || 0, value: map[key]?.value || 0 }));
};

/** Every category (A→Z, including empty ones), plus "Uncategorized" for assets without a valid category. */
function categoryBuckets(categories, rows) {
  const map = new Map(rows.map((r) => [String(r._id), r]));
  const buckets = categories.map((c) => {
    const row = map.get(String(c._id));
    map.delete(String(c._id));
    return { categoryId: c._id, category: c.name, count: row?.count || 0, value: row?.value || 0 };
  });
  const rest = [...map.values()];
  if (rest.length) {
    buckets.push({
      categoryId: null,
      category: 'Uncategorized',
      count: rest.reduce((n, r) => n + r.count, 0),
      value: rest.reduce((n, r) => n + r.value, 0),
    });
  }
  return buckets;
}

function monthWindow(purchasedTo) {
  const end = purchasedTo ? new Date(purchasedTo) : new Date();
  if (Number.isNaN(end.getTime())) end.setTime(Date.now());
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (MONTHS - 1), 1));
  const months = [];
  for (let i = 0; i < MONTHS; i++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  const endOfWindow = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 1));
  return { start, endOfWindow, months };
}

/**
 * POST /api/dashboard
 * Body: { filter: { searchText, categoryId, status, condition, purchaseType, location, warrantyStatus,
 *                   purchasedFrom, purchasedTo } } — same filter keys as POST /api/assets/list.
 * All asset metrics respect the filters; the people overview covers all employees.
 */
export async function POST(req) {
  try {
    const applied = parseFilter(await readJson(req), ASSET_FILTER_KEYS);
    const filter = buildAssetFilter(applied);
    await connectDB();

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const expiringUntil = new Date(today.getTime() + EXPIRING_DAYS * 86400000);
    const { start, endOfWindow, months } = monthWindow(applied.purchasedTo);
    const expiringFilter = { $and: [filter, { warrantyUntil: { $gte: today, $lte: expiringUntil } }] };

    const overdueFilter = { $and: [filter, { expectedReturnAt: { $lt: today } }] };

    const [[facets], expiringSoon, recentAssets, [people], locations, categories, overdueReturns, overdueCount, pendingAckCount, recentAssignments] = await Promise.all([
      Asset.aggregate([
        { $match: filter },
        {
          $facet: {
            totals: [{ $group: { _id: null, count: { $sum: 1 }, value: sumCost } }],
            byCategory: [{ $group: { _id: '$categoryId', count: { $sum: 1 }, value: sumCost } }],
            byStatus: [{ $group: { _id: '$status', count: { $sum: 1 }, value: sumCost } }],
            byCondition: [{ $group: { _id: '$condition', count: { $sum: 1 } } }],
            byWarranty: [
              {
                $group: {
                  _id: {
                    $switch: {
                      branches: [
                        { case: { $eq: [{ $ifNull: ['$warrantyUntil', null] }, null] }, then: 'Not Applicable' },
                        { case: { $gte: ['$warrantyUntil', today] }, then: 'Active' },
                      ],
                      default: 'Expired',
                    },
                  },
                  count: { $sum: 1 },
                },
              },
            ],
            expiringCount: [
              { $match: { warrantyUntil: { $gte: today, $lte: expiringUntil } } },
              { $count: 'count' },
            ],
            byLocation: [
              {
                $group: {
                  _id: {
                    $cond: [
                      { $gt: [{ $strLenCP: { $ifNull: ['$location', ''] } }, 0] },
                      '$location',
                      'Unspecified',
                    ],
                  },
                  count: { $sum: 1 },
                },
              },
              { $sort: { count: -1, _id: 1 } },
              { $limit: 8 },
            ],
            monthly: [
              { $match: { purchaseDate: { $gte: start, $lt: endOfWindow } } },
              {
                $group: {
                  _id: { $dateToString: { format: '%Y-%m', date: '$purchaseDate' } },
                  count: { $sum: 1 },
                  value: sumCost,
                },
              },
            ],
          },
        },
      ]),
      Asset.find(expiringFilter, 'assetId itemName category warrantyUntil location')
        .sort({ warrantyUntil: 1 })
        .limit(6)
        .lean(),
      Asset.find(filter, 'assetId itemName category status cost createdAt')
        .sort({ createdAt: -1 })
        .limit(6)
        .lean(),
      Employee.aggregate([
        {
          $facet: {
            total: [{ $count: 'count' }],
            byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
            byWorkType: [{ $group: { _id: '$workType', count: { $sum: 1 } } }],
            byDepartment: [
              { $group: { _id: '$department', count: { $sum: 1 } } },
              { $sort: { count: -1, _id: 1 } },
              { $limit: 8 },
            ],
          },
        },
      ]),
      Asset.distinct('location', { location: { $nin: [null, ''] } }),
      Category.find({}, 'name').collation({ locale: 'en', strength: 2 }).sort({ name: 1 }).lean(),
      // Assigned assets past their expected return date, most overdue first.
      Asset.find(overdueFilter, 'assetId itemName assignedTo assignedAt expectedReturnAt')
        .populate('assignedTo', 'employeeId fullName')
        .sort({ expectedReturnAt: 1 })
        .limit(6)
        .lean(),
      Asset.countDocuments(overdueFilter),
      Asset.countDocuments({ $and: [filter, { 'acknowledgement.status': 'Pending' }] }),
      // Latest hand-overs across the matching assets (only each asset's last few are unwound).
      Asset.aggregate([
        { $match: filter },
        { $project: { assetId: 1, itemName: 1, event: { $slice: ['$assignmentHistory', -6] } } },
        { $unwind: '$event' },
        { $sort: { 'event.at': -1 } },
        { $limit: 8 },
      ]),
    ]);

    const totals = facets.totals[0] || { count: 0, value: 0 };
    const byStatus = fillBuckets(ASSET_STATUSES, facets.byStatus, 'status');
    const statusCount = (s) => byStatus.find((b) => b.status === s).count;
    const monthlyMap = Object.fromEntries(facets.monthly.map((m) => [m._id, m]));

    return ok({
      kpis: {
        totalAssets: totals.count,
        totalValue: totals.value,
        available: statusCount('Available'),
        assigned: statusCount('Assigned'),
        underRepair: statusCount('Under Repair'),
        retiredOrLost: statusCount('Retired') + statusCount('Lost'),
        expiringSoon: facets.expiringCount[0]?.count || 0,
        overdueReturns: overdueCount,
        pendingAcknowledgements: pendingAckCount,
      },
      byCategory: categoryBuckets(categories, facets.byCategory),
      byStatus,
      byCondition: fillBuckets(ASSET_CONDITIONS, facets.byCondition, 'condition'),
      byWarranty: fillBuckets(WARRANTY_STATUSES, facets.byWarranty, 'warrantyStatus'),
      byLocation: facets.byLocation.map((l) => ({ location: l._id, count: l.count })),
      monthly: months.map((month) => ({
        month,
        count: monthlyMap[month]?.count || 0,
        value: monthlyMap[month]?.value || 0,
      })),
      expiringSoon,
      recentAssets,
      overdueReturns,
      recentAssignments,
      people: {
        total: people.total[0]?.count || 0,
        byStatus: fillBuckets(EMPLOYEE_STATUSES, people.byStatus, 'status'),
        byWorkType: fillBuckets(WORK_TYPES, people.byWorkType, 'workType'),
        byDepartment: people.byDepartment.map((d) => ({ department: d._id, count: d.count })),
      },
      filterOptions: {
        locations: [...new Set(locations.map((l) => l.trim()))].sort((a, b) => a.localeCompare(b)),
      },
      filter: applied,
      expiringDays: EXPIRING_DAYS,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return handleError(err);
  }
}
