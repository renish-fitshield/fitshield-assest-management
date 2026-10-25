import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { ok, handleError, readJson, ApiError, escapeRegex, isValidId } from '@/lib/api';
import { parseListRequest, listResponse, enumValue } from '@/lib/listRequest';
import { ASSIGNMENT_ACTIONS, ACK_STATUSES } from '@/lib/constants';
import Asset from '@/models/Asset';

/**
 * POST /api/assignments/log — every hand-over across all assets, newest first.
 * Body: { filter: { searchText (asset ID / name / serial), action, employeeId, acknowledgement },
 *         pagination_info: { page, perPageData } }
 * Items: { _id (hand-over id), asset: { _id, assetId, itemName, category, serialNumber }, event }
 */
export async function POST(req) {
  try {
    const request = parseListRequest(await readJson(req), {
      filterKeys: ['action', 'employeeId', 'acknowledgement'],
      sortFields: [],
    });
    const { filter } = request;

    const assetMatch = { 'assignmentHistory.0': { $exists: true } };
    if (filter.searchText) {
      const rx = new RegExp(escapeRegex(filter.searchText), 'i');
      assetMatch.$or = [{ assetId: rx }, { itemName: rx }, { serialNumber: rx }];
    }
    const eventMatch = {};
    const action = enumValue(filter, 'action', ASSIGNMENT_ACTIONS);
    if (action) eventMatch['event.action'] = action;
    if (filter.employeeId) {
      if (!isValidId(filter.employeeId)) throw new ApiError('Invalid filter.employeeId', 400);
      const id = new mongoose.Types.ObjectId(filter.employeeId);
      eventMatch.$or = [{ 'event.to.employee': id }, { 'event.from.employee': id }];
      assetMatch['assignmentHistory.to.employee'] = id; // anyone in a hand-over held it at some point
    }
    const ack = enumValue(filter, 'acknowledgement', ACK_STATUSES);
    if (ack === 'Pending') eventMatch.$and = [{ $or: [{ 'event.toAck.status': 'Pending' }, { 'event.fromAck.status': 'Pending' }] }];
    if (ack === 'Acknowledged') {
      // Every acknowledgement this hand-over needs is done.
      eventMatch['event.toAck.status'] = { $ne: 'Pending' };
      eventMatch['event.fromAck.status'] = { $ne: 'Pending' };
    }

    await connectDB();
    const skip = (request.page - 1) * request.perPage;
    const [result] = await Asset.aggregate([
      { $match: assetMatch },
      { $project: { assetId: 1, itemName: 1, category: 1, serialNumber: 1, event: '$assignmentHistory' } },
      { $unwind: '$event' },
      { $match: eventMatch },
      { $sort: { 'event.at': -1, 'event._id': -1 } },
      {
        $facet: {
          total: [{ $count: 'n' }],
          items: [{ $skip: skip }, { $limit: request.perPage }],
        },
      },
    ]);
    const totalCount = result.total[0]?.n || 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / request.perPage));
    const items = result.items.map(({ _id, event, ...asset }) => ({ _id: event._id, asset: { _id, ...asset }, event }));

    return ok(
      listResponse({ items, totalCount, page: request.page, totalPages, perPage: request.perPage, filter, sort: request.sort })
    );
  } catch (err) {
    return handleError(err);
  }
}
