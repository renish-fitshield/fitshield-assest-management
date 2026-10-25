import mongoose from 'mongoose';
import { ApiError, isValidId } from '@/lib/api';
import { ACK_TOKEN_TTL, signAckToken, verifyAckToken } from '@/lib/jwt';
import { describeMailError, sendMail } from '@/lib/mailer';
import { logoAttachment, receiptEmail, returnEmail } from '@/lib/emails/assetEmails';
import { activity, holderLabel } from '@/lib/activity';
import { COMPANY_NAME, QUERY_CONTACT_NAME } from '@/lib/constants';
import Asset from '@/models/Asset';
import Employee from '@/models/Employee';

/**
 * Hand-over acknowledgements.
 *
 * Every hand-over (asset.assignmentHistory entry) needs a confirmation from each employee involved:
 *   side "to"   (Assigned, Transferred) — the receiver confirms they got it    → event.toAck
 *   side "from" (Returned, Transferred) — the giver confirms they handed it back → event.fromAck
 * Each starts "Pending". The employee is emailed a personal link (a signed token naming the asset,
 * the hand-over, the employee and the side); opening it and pressing the button records
 * "Acknowledged" with the time, IP and browser. The current holder's status is mirrored on
 * `asset.acknowledgement` so lists can show it.
 */

const ACK_FIELD = { to: 'toAck', from: 'fromAck' };
export const SIDES = Object.keys(ACK_FIELD);
export const sidesFor = (action) => (action === 'Assigned' ? ['to'] : action === 'Returned' ? ['from'] : ['from', 'to']);

const ASSET_FIELDS_FOR_EMAIL = 'assetId itemName category brand modelName serialNumber';

/**
 * Where the app is reachable (for links in emails): APP_URL if set and valid, else the request's own origin.
 * A malformed APP_URL is ignored (and logged) rather than producing broken links in every email.
 */
export function appOrigin(req) {
  const configured = process.env.APP_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === 'https:' || url.protocol === 'http:') return url.origin;
    } catch {
      // fall through
    }
    console.error(`[ack] APP_URL "${configured}" is not a valid http(s) address; using the request's address instead`);
  }
  return new URL(req.url).origin;
}

/** A reason we can't email someone, worded for the admin as-is (unlike raw mail-server errors). */
class AckEmailProblem extends Error {}

/** One asset with only the given hand-over (lean). */
async function loadHandOver(assetId, eventId, extraFields = '') {
  if (!isValidId(assetId) || !isValidId(eventId)) return null;
  const asset = await Asset.findOne(
    { _id: assetId, 'assignmentHistory._id': eventId },
    `${ASSET_FIELDS_FOR_EMAIL} ${extraFields}`
  )
    .select({ assignmentHistory: { $elemMatch: { _id: eventId } } })
    .lean();
  return asset ? { asset, event: asset.assignmentHistory[0] } : null;
}

/**
 * Emails one side of a hand-over its acknowledgement link and records the result on the hand-over.
 * Never throws: returns { side, to, status: 'Sent' | 'Failed', error?, previewUrl? }.
 */
export async function sendAckEmail({ assetId, eventId, side, origin }) {
  const field = ACK_FIELD[side];
  let to = null;
  let result;
  try {
    if (!field) throw new AckEmailProblem(`Unknown acknowledgement side "${side}"`);
    const found = await loadHandOver(assetId, eventId);
    if (!found?.event?.[side]) throw new AckEmailProblem('This hand-over no longer exists');
    const { asset, event } = found;
    const employee = await Employee.findById(event[side].employee, 'fullName employeeId workEmail').lean();
    if (!employee) throw new AckEmailProblem(`${event[side].fullName} is no longer in the employee list`);
    if (!employee.workEmail) throw new AckEmailProblem(`${employee.fullName} has no work email`);
    to = employee.workEmail;

    let token;
    try {
      token = await signAckToken({ assetId, eventId, employeeId: employee._id, side });
    } catch (err) {
      throw new AckEmailProblem(`The acknowledgement link couldn't be created (${err?.message || err})`);
    }
    const url = `${origin}/acknowledge/${token}`;
    const expiresOn = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(
      new Date(Date.now() + ACK_TOKEN_TTL * 1000)
    );
    const content = (side === 'to' ? receiptEmail : returnEmail)({ employee, asset, event, url, expiresOn });
    const sent = await sendMail({ to, ...content, attachments: [logoAttachment()] });
    result = { side, to, status: 'Sent', sentAt: new Date(), previewUrl: sent.previewUrl, testOnly: Boolean(sent.previewUrl) };
    if (result.testOnly) console.warn(`[ack] email isn't set up: the email for ${to} went to the test inbox and was NOT delivered`);
  } catch (err) {
    const error = (err instanceof AckEmailProblem ? err.message : describeMailError(err)).slice(0, 300);
    console.error(`[ack] email for asset ${assetId}, hand-over ${eventId}, side ${side} failed: ${error}`, err?.stack || '');
    result = { side, to, status: 'Failed', error };
  }

  // Record the outcome on the hand-over so it shows in the app (and can be resent). A failure to record
  // it must not hide the outcome from the admin, so it's logged and the result still returned.
  if (!field) return result;
  try {
    const { side: _side, ...email } = result;
    await Asset.updateOne(
      { _id: assetId, 'assignmentHistory._id': eventId },
      { $set: { [`assignmentHistory.$.${field}.email`]: email }, $inc: { [`assignmentHistory.$.${field}.emailAttempts`]: 1 } }
    );
  } catch (err) {
    console.error(`[ack] could not record the email result for hand-over ${eventId}:`, err?.message);
  }
  return result;
}

/** Emails everyone involved in a hand-over (both sides of a transfer). Never throws. */
export async function sendHandOverEmails({ assetId, event, origin }) {
  try {
    return await Promise.all(sidesFor(event.action).map((side) => sendAckEmail({ assetId, eventId: event._id, side, origin })));
  } catch (err) {
    // sendAckEmail doesn't throw, so this is a programming error — still never let it undo a hand-over.
    console.error(`[ack] sending hand-over emails for ${assetId} failed unexpectedly:`, err);
    return sidesFor(event.action).map((side) => ({ side, to: null, status: 'Failed', error: 'The email could not be sent (unexpected error)' }));
  }
}

/** Admin "Resend email" — only while that side is still pending. */
export async function resendAckEmail({ assetId, eventId, side, origin }) {
  if (!SIDES.includes(side)) throw new ApiError('Invalid side', 400);
  const found = await loadHandOver(assetId, eventId);
  if (!found) throw new ApiError('Hand-over not found', 404);
  const ack = found.event[ACK_FIELD[side]];
  if (!ack || !found.event[side]) throw new ApiError('This hand-over has no acknowledgement for that employee', 400);
  if (ack.status === 'Acknowledged') throw new ApiError('Already acknowledged — no need to send it again', 409);
  return sendAckEmail({ assetId, eventId, side, origin });
}

// ---- the employee's side (public, via the emailed link)

const invalidLink = () => new ApiError('This acknowledgement link is not valid.', 400, undefined, 'LINK_INVALID');

async function readToken(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 2000) throw invalidLink();
  let p;
  try {
    p = await verifyAckToken(token);
  } catch (err) {
    if (err?.code === 'ERR_JWT_EXPIRED') {
      throw new ApiError('This acknowledgement link has expired. Please ask for a new one.', 410, undefined, 'LINK_EXPIRED');
    }
    // jose's own errors (bad signature, malformed, wrong claims) and our type check mean a bad link…
    if (String(err?.code || '').startsWith('ERR_J') || err?.message === 'Wrong token type') throw invalidLink();
    // …anything else (e.g. the signing secret missing) is a server problem, not the employee's.
    console.error('[ack] could not verify an acknowledgement link:', err);
    throw new ApiError('Acknowledgements are temporarily unavailable. Please try again later.', 500, undefined, 'ACK_UNAVAILABLE');
  }
  if (!isValidId(p.aid) || !isValidId(p.eid) || !isValidId(p.emp) || !SIDES.includes(p.side)) throw invalidLink();
  return p;
}

/** What the link is for, and whether it's done — shown on the acknowledgement page. */
export async function getAcknowledgement(token) {
  const p = await readToken(token);
  const found = await loadHandOver(p.aid, p.eid);
  if (!found) throw new ApiError('This asset hand-over no longer exists.', 404, undefined, 'HANDOVER_NOT_FOUND');
  const { asset, event } = found;
  const holder = event[p.side];
  if (!holder || String(holder.employee) !== p.emp) throw invalidLink();
  const ack = event[ACK_FIELD[p.side]] || {};
  const counterpart = p.side === 'to' ? event.from : event.to;
  return {
    kind: p.side === 'to' ? 'receipt' : 'return',
    status: ack.status || 'Pending',
    acknowledgedAt: ack.acknowledgedAt || null,
    employee: { fullName: holder.fullName, employeeId: holder.employeeId },
    asset: {
      assetId: asset.assetId,
      itemName: asset.itemName,
      category: asset.category,
      brand: asset.brand,
      modelName: asset.modelName,
      serialNumber: asset.serialNumber,
    },
    handOver: {
      action: event.action,
      date: event.date,
      condition: event.condition,
      expectedReturnAt: event.expectedReturnAt,
      notes: event.notes,
      by: event.by?.name,
      counterpart: counterpart ? { fullName: counterpart.fullName, employeeId: counterpart.employeeId } : null,
    },
    company: COMPANY_NAME,
    contact: QUERY_CONTACT_NAME,
    _token: p,
  };
}

/**
 * Records the acknowledgement. Idempotent: a second click (or two at once) just reports it's done.
 * Matches on asset id + hand-over id + employee id + side, and only while still Pending.
 */
export async function acknowledge(token, { ip, userAgent }) {
  const { _token: p, ...details } = await getAcknowledgement(token);
  if (details.status === 'Acknowledged') return { ...details, alreadyAcknowledged: true };

  const field = ACK_FIELD[p.side];
  const eventId = new mongoose.Types.ObjectId(p.eid);
  const now = new Date();
  const match = { _id: eventId, [`${p.side}.employee`]: new mongoose.Types.ObjectId(p.emp), [`${field}.status`]: 'Pending' };
  const set = {
    [`assignmentHistory.$.${field}.status`]: 'Acknowledged',
    [`assignmentHistory.$.${field}.acknowledgedAt`]: now,
    [`assignmentHistory.$.${field}.ip`]: ip?.slice(0, 100),
    [`assignmentHistory.$.${field}.userAgent`]: userAgent?.slice(0, 300),
  };
  const who = holderLabel(details.employee);
  const log = activity('Acknowledged', { user: null, name: who }, {
    note: p.side === 'to' ? `${who} acknowledged receiving it` : `${who} acknowledged handing it back`,
  });

  let res = { modifiedCount: 0 };
  // Receipt by the current holder also updates the asset's own acknowledgement status (same write).
  if (p.side === 'to') {
    res = await Asset.updateOne(
      { _id: p.aid, 'acknowledgement.eventId': eventId, assignmentHistory: { $elemMatch: match } },
      { $set: { ...set, 'acknowledgement.status': 'Acknowledged', 'acknowledgement.acknowledgedAt': now }, $push: { activities: log } }
    );
  }
  if (!res.modifiedCount) {
    res = await Asset.updateOne({ _id: p.aid, assignmentHistory: { $elemMatch: match } }, { $set: set, $push: { activities: log } });
  }
  if (!res.modifiedCount) {
    // Someone (e.g. a double click) acknowledged it a moment ago.
    const { _token, ...now2 } = await getAcknowledgement(token);
    return { ...now2, alreadyAcknowledged: true };
  }
  return { ...details, status: 'Acknowledged', acknowledgedAt: now };
}

/** " Acknowledgement email sent to a@b." / " The email to a@b couldn't be sent: …" — appended to API messages. */
export function emailSummary(emails = []) {
  return emails
    .map((e) =>
      e.status !== 'Sent'
        ? ` The acknowledgement email${e.to ? ` to ${e.to}` : ''} couldn't be sent (${e.error}) — resend it from the asset's assignment history.`
        : e.testOnly
          ? ` Email isn't set up yet, so NOTHING was delivered to ${e.to} (it went to a test inbox). Add the SMTP settings, then use "Resend email".`
          : ` Acknowledgement email sent to ${e.to}.`
    )
    .join('');
}

/** True when an email result needs the admin's attention (failed, or only went to the test inbox). */
export const emailNeedsAttention = (e) => e.status !== 'Sent' || e.testOnly;

/** The public view of an acknowledgement (no token internals). */
export const publicView = ({ _token, ...view }) => view;
