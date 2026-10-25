import { connectDB } from '@/lib/db';
import { ok, handleError } from '@/lib/api';
import { DUE_SOON_DAYS } from '@/lib/constants';
import Asset from '@/models/Asset';

/**
 * GET /api/assignments/summary
 * → { assigned, pendingAcknowledgement, overdue, dueSoon, pendingReturnAcknowledgement, holders }
 */
export async function GET() {
  try {
    await connectDB();
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const soon = new Date(today.getTime() + (DUE_SOON_DAYS + 1) * 86400000);

    const [assigned, pendingAcknowledgement, overdue, dueSoon, holders, [returns]] = await Promise.all([
      Asset.countDocuments({ assignedTo: { $ne: null } }),
      Asset.countDocuments({ 'acknowledgement.status': 'Pending' }),
      Asset.countDocuments({ expectedReturnAt: { $lt: today } }),
      Asset.countDocuments({ expectedReturnAt: { $gte: today, $lt: soon } }),
      Asset.distinct('assignedTo', { assignedTo: { $ne: null } }),
      // Hand-overs away from someone (returns, transfers) still waiting for that person to confirm.
      Asset.aggregate([
        { $match: { 'assignmentHistory.fromAck.status': 'Pending' } },
        { $project: { n: { $size: { $filter: { input: '$assignmentHistory', cond: { $eq: ['$$this.fromAck.status', 'Pending'] } } } } } },
        { $group: { _id: null, n: { $sum: '$n' } } },
      ]),
    ]);

    return ok({
      assigned,
      pendingAcknowledgement,
      pendingReturnAcknowledgement: returns?.n || 0,
      overdue,
      dueSoon,
      holders: holders.length,
    });
  } catch (err) {
    return handleError(err);
  }
}
