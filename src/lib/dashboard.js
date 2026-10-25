import {
  ASSET_STATUSES,
  ASSET_CONDITIONS,
  ASSIGNMENT_ACTIONS,
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPES,
  DEFAULT_EMPLOYMENT_TYPE,
  DUE_SOON_DAYS,
  DASHBOARD_EXPIRING_DAYS,
  WARRANTY_BUCKETS,
  ASSET_AGE_BUCKETS,
} from '@/lib/constants';
import Asset from '@/models/Asset';
import Employee from '@/models/Employee';
import Category from '@/models/Category';

/*
 * Dashboard metrics, shaped for the charts: every series is an array of flat rows
 * ({ name, count, value, ...one key per stacked series }), so a chart binds a row key
 * to an axis and the other keys to bars without reshaping on the client.
 */

const DAY = 86400000;
const DEFAULT_MONTHS = 12;
const MAX_MONTHS = 24;
const TOP_CATEGORIES = 10;
const TOP_LOCATIONS = 8;
const TOP_HOLDERS = 6;
const LIST_SIZE = 6;

const sumCost = { $sum: { $ifNull: ['$cost', 0] } };
const sumUnits = { $sum: { $ifNull: ['$quantity', 1] } };
// `null < date` is true in aggregation comparisons, so date checks guard against missing values first.
const isSet = (field) => ({ $ne: [{ $ifNull: [field, null] }, null] });
const countIf = (cond) => ({ $sum: { $cond: [cond, 1, 0] } });

const MONTH_LABEL = new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const monthKey = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

/**
 * Calendar months the trend charts cover: the purchased-date range when one is set
 * (at most 24 months, ending at its last month), otherwise the last 12 months.
 * `from`/`to` are already validated YYYY-MM-DD strings (see buildAssetFilter).
 */
export function monthWindow(from, to) {
  const end = to ? new Date(to) : new Date();
  let count = DEFAULT_MONTHS;
  if (from) {
    const start = new Date(from);
    const span = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth() + 1;
    count = Math.min(MAX_MONTHS, Math.max(1, span));
  }
  const monthStart = (offset) => new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + offset, 1));
  const months = Array.from({ length: count }, (_, i) => {
    const d = monthStart(i - (count - 1));
    return { month: monthKey(d), label: MONTH_LABEL.format(d) };
  });
  return {
    start: monthStart(-(count - 1)),
    end: monthStart(1), // exclusive
    previousStart: monthStart(-(2 * count - 1)),
    months,
  };
}

function yearsAgo(date, years) {
  const d = new Date(date);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d;
}

function assetFacets({ today, expiringUntil, dueSoonUntil, window, employees }) {
  return {
    totals: [{ $group: { _id: null, count: { $sum: 1 }, units: sumUnits, value: sumCost } }],
    byStatus: [{ $group: { _id: '$status', count: { $sum: 1 }, value: sumCost } }],
    byCategoryStatus: [
      { $group: { _id: { categoryId: '$categoryId', status: '$status' }, count: { $sum: 1 }, value: sumCost } },
    ],
    byCondition: [{ $group: { _id: '$condition', count: { $sum: 1 }, value: sumCost } }],
    byWarranty: [
      {
        $group: {
          _id: {
            $switch: {
              branches: [
                { case: { $not: [isSet('$warrantyUntil')] }, then: 'Not Applicable' },
                { case: { $lt: ['$warrantyUntil', today] }, then: 'Expired' },
                { case: { $lte: ['$warrantyUntil', expiringUntil] }, then: 'Expiring soon' },
              ],
              default: 'Active',
            },
          },
          count: { $sum: 1 },
          value: sumCost,
        },
      },
    ],
    byAge: [
      {
        $group: {
          _id: {
            $switch: {
              branches: [
                { case: { $not: [isSet('$purchaseDate')] }, then: 'unknown' },
                { case: { $gt: ['$purchaseDate', yearsAgo(today, 1)] }, then: 'lt1' },
                { case: { $gt: ['$purchaseDate', yearsAgo(today, 2)] }, then: '1to2' },
                { case: { $gt: ['$purchaseDate', yearsAgo(today, 3)] }, then: '2to3' },
              ],
              default: '3plus',
            },
          },
          count: { $sum: 1 },
          value: sumCost,
        },
      },
    ],
    byLocation: [
      {
        $group: {
          _id: {
            $cond: [{ $gt: [{ $strLenCP: { $trim: { input: { $ifNull: ['$location', ''] } } } }, 0] }, { $trim: { input: '$location' } }, null],
          },
          count: { $sum: 1 },
          value: sumCost,
        },
      },
      { $sort: { count: -1, _id: 1 } },
    ],
    monthly: [
      { $match: { purchaseDate: { $gte: window.start, $lt: window.end } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$purchaseDate' } },
          count: { $sum: 1 },
          units: sumUnits,
          value: sumCost,
        },
      },
    ],
    previousWindow: [
      { $match: { purchaseDate: { $gte: window.previousStart, $lt: window.start } } },
      { $group: { _id: null, count: { $sum: 1 }, value: sumCost } },
    ],
    // Hand-overs dated inside the window, per month and action.
    handOvers: [
      {
        $project: {
          events: {
            $filter: {
              input: { $ifNull: ['$assignmentHistory', []] },
              as: 'e',
              cond: { $and: [{ $gte: ['$$e.date', window.start] }, { $lt: ['$$e.date', window.end] }] },
            },
          },
        },
      },
      { $unwind: '$events' },
      {
        $group: {
          _id: { month: { $dateToString: { format: '%Y-%m', date: '$events.date' } }, action: '$events.action' },
          count: { $sum: 1 },
        },
      },
    ],
    assignment: [
      {
        $group: {
          _id: null,
          // Same rule as the "assignable" filter: Available, nobody holds it, a single unit.
          assignableNow: countIf({
            $and: [
              { $eq: ['$status', 'Available'] },
              { $not: [isSet('$assignedTo')] },
              { $lte: [{ $ifNull: ['$quantity', 1] }, 1] },
            ],
          }),
          held: countIf(isSet('$assignedTo')),
          overdue: countIf({ $and: [isSet('$expectedReturnAt'), { $lt: ['$expectedReturnAt', today] }] }),
          dueSoon: countIf({
            $and: [isSet('$expectedReturnAt'), { $gte: ['$expectedReturnAt', today] }, { $lt: ['$expectedReturnAt', dueSoonUntil] }],
          }),
          ackPending: countIf({ $eq: ['$acknowledgement.status', 'Pending'] }),
          ackDone: countIf({ $eq: ['$acknowledgement.status', 'Acknowledged'] }),
        },
      },
    ],
    // Everyone holding a matching asset, with their department (for the people charts).
    holders: [
      { $match: { assignedTo: { $ne: null } } },
      { $group: { _id: '$assignedTo', assets: { $sum: 1 }, value: sumCost } },
      { $lookup: { from: employees, localField: '_id', foreignField: '_id', as: 'employee' } },
      { $set: { employee: { $arrayElemAt: ['$employee', 0] } } },
      {
        $project: {
          assets: 1,
          value: 1,
          employeeId: '$employee.employeeId',
          fullName: '$employee.fullName',
          department: '$employee.department',
        },
      },
      { $sort: { assets: -1, value: -1, fullName: 1 } },
    ],
  };
}

const byId = (rows) => new Map(rows.map((r) => [r._id, r]));

/** One row per key in `keys` (zero-filled), in that order. */
const fill = (keys, rows, toRow) => {
  const map = byId(rows);
  return keys.map((key) => toRow(key, map.get(key) || { count: 0, value: 0 }));
};

/** Keeps the first `limit` rows and folds the rest into one "Other" row. */
function foldRest(rows, limit, makeOther) {
  if (rows.length <= limit) return rows;
  const rest = rows.slice(limit - 1);
  return [...rows.slice(0, limit - 1), makeOther(rest)];
}

const sum = (rows, key) => rows.reduce((n, r) => n + (r[key] || 0), 0);
const statusZeros = () => Object.fromEntries(ASSET_STATUSES.map((s) => [s, 0]));

/** Categories as stacked-bar rows: { categoryId, category, count, value, Available, Assigned, … }, largest first. */
function categoryRows(categories, rows) {
  const names = new Map(categories.map((c) => [String(c._id), c.name]));
  const map = new Map();
  for (const r of rows) {
    const id = r._id.categoryId && names.has(String(r._id.categoryId)) ? String(r._id.categoryId) : null;
    const row = map.get(id) || { categoryId: id, category: id ? names.get(id) : 'Uncategorized', count: 0, value: 0, ...statusZeros() };
    row.count += r.count;
    row.value += r.value;
    if (r._id.status in row) row[r._id.status] += r.count;
    map.set(id, row);
  }
  const sorted = [...map.values()].sort((a, b) => b.count - a.count || b.value - a.value || a.category.localeCompare(b.category));
  return foldRest(sorted, TOP_CATEGORIES, (rest) => {
    const other = { categoryId: null, category: `Other (${rest.length})`, isOther: true, count: sum(rest, 'count'), value: sum(rest, 'value') };
    for (const s of ASSET_STATUSES) other[s] = sum(rest, s);
    return other;
  });
}

/** Departments: employees (everyone) next to the matching assets they hold. */
function departmentRows(employeeRows, holders) {
  const map = new Map();
  const row = (department) => {
    const key = department || 'Unassigned';
    if (!map.has(key)) map.set(key, { department: key, employees: 0, holders: 0, assets: 0, value: 0 });
    return map.get(key);
  };
  for (const e of employeeRows) row(e._id).employees += e.count;
  for (const h of holders) {
    const r = row(h.department);
    r.holders += 1;
    r.assets += h.assets;
    r.value += h.value;
  }
  return [...map.values()].sort((a, b) => b.assets - a.assets || b.employees - a.employees || a.department.localeCompare(b.department));
}

const share = (part, whole) => (whole ? part / whole : 0);

/**
 * Builds the dashboard for assets matching `filter` (a Mongo filter from buildAssetFilter).
 * `applied` is the parsed request filter, echoed back and used for the trend window.
 * The people section counts all employees; their asset numbers respect the asset filters.
 */
export async function buildDashboard(filter, applied) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const expiringUntil = new Date(today.getTime() + DASHBOARD_EXPIRING_DAYS * DAY);
  const dueSoonUntil = new Date(today.getTime() + (DUE_SOON_DAYS + 1) * DAY);
  const window = monthWindow(applied.purchasedFrom, applied.purchasedTo);
  const dateFiltered = Boolean(applied.purchasedFrom || applied.purchasedTo);

  const [[facets], [people], categories, locations, expiringSoon, overdueReturns, recentAssets, recentHandOvers] =
    await Promise.all([
      Asset.aggregate([
        { $match: filter },
        { $facet: assetFacets({ today, expiringUntil, dueSoonUntil, window, employees: Employee.collection.name }) },
      ]),
      Employee.aggregate([
        {
          $facet: {
            byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
            byEmploymentType: [{ $group: { _id: { $ifNull: ['$employmentType', DEFAULT_EMPLOYMENT_TYPE] }, count: { $sum: 1 } } }],
            byDepartment: [{ $group: { _id: '$department', count: { $sum: 1 } } }],
          },
        },
      ]),
      Category.find({}, 'name').lean(),
      Asset.distinct('location', { location: { $nin: [null, ''] } }),
      Asset.find({ $and: [filter, { warrantyUntil: { $gte: today, $lte: expiringUntil } }] }, 'assetId itemName category warrantyUntil')
        .sort({ warrantyUntil: 1 })
        .limit(LIST_SIZE)
        .lean(),
      Asset.find({ $and: [filter, { expectedReturnAt: { $lt: today } }] }, 'assetId itemName assignedTo expectedReturnAt')
        .populate('assignedTo', 'employeeId fullName')
        .sort({ expectedReturnAt: 1 })
        .limit(LIST_SIZE)
        .lean(),
      Asset.find(filter, 'assetId itemName category status cost createdAt').sort({ createdAt: -1 }).limit(LIST_SIZE).lean(),
      // Latest hand-overs across the matching assets (only each asset's last few are unwound).
      Asset.aggregate([
        { $match: filter },
        { $project: { assetId: 1, itemName: 1, event: { $slice: [{ $ifNull: ['$assignmentHistory', []] }, -LIST_SIZE] } } },
        { $unwind: '$event' },
        { $sort: { 'event.at': -1 } },
        { $limit: LIST_SIZE + 2 },
        { $project: { assetId: 1, itemName: 1, 'event._id': 1, 'event.action': 1, 'event.from': 1, 'event.to': 1, 'event.date': 1, 'event.at': 1, 'event.by.name': 1 } },
      ]),
    ]);

  const totals = facets.totals[0] || { count: 0, units: 0, value: 0 };
  const assignment = facets.assignment[0] || { assignableNow: 0, held: 0, overdue: 0, dueSoon: 0, ackPending: 0, ackDone: 0 };

  const status = fill(ASSET_STATUSES, facets.byStatus, (key, r) => ({
    key,
    name: key,
    count: r.count,
    value: r.value,
    share: share(r.count, totals.count),
  }));
  const statusCount = Object.fromEntries(status.map((s) => [s.key, s.count]));

  const monthly = byId(facets.monthly);
  const handOverMap = new Map(facets.handOvers.map((r) => [`${r._id.month}|${r._id.action}`, r.count]));
  const spendInWindow = sum(facets.monthly, 'value');
  const previous = facets.previousWindow[0];

  const holders = facets.holders;
  const employeesTotal = sum(people.byStatus, 'count');
  const assignedOrReady = statusCount.Assigned + assignment.assignableNow;

  return {
    kpis: {
      totalAssets: totals.count,
      totalUnits: totals.units,
      totalValue: totals.value,
      averageCost: totals.count ? totals.value / totals.count : 0,
      ...Object.fromEntries(ASSET_STATUSES.map((s) => [s === 'Under Repair' ? 'underRepair' : s.toLowerCase(), statusCount[s]])),
      assignableNow: assignment.assignableNow,
      // Share of the assets that could be with someone (assigned + ready to assign) that are.
      utilization: share(statusCount.Assigned, assignedOrReady),
      expiringSoon: byId(facets.byWarranty).get('Expiring soon')?.count || 0,
      overdueReturns: assignment.overdue,
      dueSoon: assignment.dueSoon,
      pendingAcknowledgements: assignment.ackPending,
      acknowledged: assignment.ackDone,
      acknowledgementRate: share(assignment.ackDone, assignment.ackDone + assignment.ackPending),
      holders: holders.length,
      spend: {
        value: spendInWindow,
        count: sum(facets.monthly, 'count'),
        // A previous-period comparison only means something when the purchase date isn't filtered.
        previousValue: dateFiltered ? null : previous?.value || 0,
        previousCount: dateFiltered ? null : previous?.count || 0,
      },
    },
    charts: {
      monthly: window.months.map(({ month, label }) => ({
        month,
        label,
        spend: monthly.get(month)?.value || 0,
        assets: monthly.get(month)?.count || 0,
        units: monthly.get(month)?.units || 0,
      })),
      handOvers: window.months.map(({ month, label }) => {
        const row = { month, label };
        for (const action of ASSIGNMENT_ACTIONS) row[action] = handOverMap.get(`${month}|${action}`) || 0;
        row.total = ASSIGNMENT_ACTIONS.reduce((n, action) => n + row[action], 0);
        return row;
      }),
      status,
      categories: categoryRows(categories, facets.byCategoryStatus),
      condition: fill(ASSET_CONDITIONS, facets.byCondition, (key, r) => ({ key, name: key, count: r.count, value: r.value })),
      warranty: fill(WARRANTY_BUCKETS, facets.byWarranty, (key, r) => ({
        key,
        name: key,
        count: r.count,
        value: r.value,
        share: share(r.count, totals.count),
      })),
      age: fill(ASSET_AGE_BUCKETS.map((b) => b.key), facets.byAge, (key, r) => ({
        key,
        name: ASSET_AGE_BUCKETS.find((b) => b.key === key).label,
        count: r.count,
        value: r.value,
      })),
      locations: foldRest(
        facets.byLocation.map((l) => ({ key: l._id ?? '', name: l._id ?? 'Not recorded', count: l.count, value: l.value, isUnset: l._id == null })),
        TOP_LOCATIONS,
        (rest) => ({ key: '', name: `Other (${rest.length})`, isOther: true, count: sum(rest, 'count'), value: sum(rest, 'value') })
      ),
      departments: departmentRows(people.byDepartment, holders),
    },
    people: {
      total: employeesTotal,
      byStatus: fill(EMPLOYEE_STATUSES, people.byStatus, (key, r) => ({ key, name: key, count: r.count })),
      byEmploymentType: fill(EMPLOYMENT_TYPES, people.byEmploymentType, (key, r) => ({ key, name: key, count: r.count })),
      holders: holders.length,
      assetsPerHolder: holders.length ? assignment.held / holders.length : 0,
      topHolders: holders.slice(0, TOP_HOLDERS),
    },
    lists: { expiringSoon, overdueReturns, recentAssets, recentHandOvers },
    window: { from: window.months[0].month, to: window.months.at(-1).month, months: window.months.length },
    filterOptions: {
      locations: [...new Set(locations.map((l) => l.trim()))].sort((a, b) => a.localeCompare(b)),
    },
    filter: applied,
    expiringDays: DASHBOARD_EXPIRING_DAYS,
    dueSoonDays: DUE_SOON_DAYS,
    generatedAt: new Date().toISOString(),
  };
}
