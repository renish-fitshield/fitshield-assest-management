import { COMPANY_NAME, QUERY_CONTACT_NAME, QUERY_CONTACT_PHONE, QUERY_CONTACT_PHONE_LINK } from '@/lib/constants';
import { LOGO_CID, LOGO_HEIGHT, LOGO_PNG_BASE64, LOGO_WIDTH } from './logo';

/**
 * Acknowledgement emails sent to employees on every hand-over. Both use ONE layout, so they read as a set:
 *   receiptEmail — an asset was assigned / transferred TO the employee    → "Acknowledge receipt"
 *   returnEmail  — an asset was returned / transferred FROM the employee  → "Acknowledge return"
 *
 * Kept plain and factual so they read as genuine company email, not marketing or phishing: a neutral
 * subject (no "Action required"), the company logo and name, who the email is for and why they got it,
 * one clear button, and no long raw links in the body (the plain-text part carries the link for mail
 * apps that can't show buttons).
 *
 * Table-based HTML with inline styles (what email clients support), plus a plain-text version.
 */

const BRAND = '#2f8f28'; // a touch deeper than the app green, for contrast with white button text
const INK = '#111827';
const BODY = '#374151';
const MUTED = '#6b7280';
const LINE = '#e5e7eb';
const PANEL = '#f9fafb';
const FONT = "Roboto,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// Every non-ASCII character (·, —, ©, accented names…) as an HTML entity, so no mail client can garble it.
const asciiOnly = (html) => html.replace(/[^\x00-\x7F]/gu, (c) => `&#${c.codePointAt(0)};`);
const day = (d) =>
  d ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(d)) : null;
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'there';
const person = (h) => (h ? `${h.fullName}${h.employeeId ? ` (${h.employeeId})` : ''}` : null);
const present = (v) => v !== null && v !== undefined && v !== '';
const brandModel = (asset) => [asset.brand, asset.modelName].filter(Boolean).join(' / ') || null;

/** The logo, attached inline so it shows without loading remote images. */
export const logoAttachment = () => ({
  filename: 'fitshield-logo.png',
  content: LOGO_PNG_BASE64,
  encoding: 'base64',
  contentType: 'image/png',
  cid: LOGO_CID,
});

// ---- HTML building blocks

function section({ title, rows }) {
  const shown = rows.filter(([, v]) => present(v));
  if (!shown.length) return '';
  const body = shown
    .map(
      ([label, value], i) => `
          <tr>
            <td valign="top" style="padding:9px 16px;${i ? `border-top:1px solid ${LINE};` : ''}width:40%;font-size:13px;line-height:1.5;color:${MUTED};">${esc(label)}</td>
            <td valign="top" style="padding:9px 16px;${i ? `border-top:1px solid ${LINE};` : ''}font-size:14px;line-height:1.5;color:${INK};font-weight:500;word-break:break-word;">${esc(value)}</td>
          </tr>`
    )
    .join('');
  return `
      <tr><td class="px" style="padding:0 32px 16px;">
        <p style="margin:0 0 8px;font-size:12px;line-height:1.4;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${MUTED};">${esc(title)}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:8px;border-collapse:separate;background:${PANEL};">${body}
        </table>
      </td></tr>`;
}

function layout({ preheader, eyebrow, heading, greeting, intro, sections, confirmText, button, url, expiresOn, reason }) {
  return asciiOnly(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${esc(heading)}</title>
<style>
  @media (max-width: 480px) {
    .px { padding-left: 20px !important; padding-right: 20px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;">
  <tr><td align="center" style="padding:32px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid ${LINE};border-radius:12px;font-family:${FONT};">
      <tr><td style="height:4px;line-height:4px;font-size:0;background:${BRAND};border-radius:12px 12px 0 0;">&nbsp;</td></tr>
      <tr><td class="px" align="center" style="padding:28px 32px 20px;border-bottom:1px solid ${LINE};">
        <img src="cid:${LOGO_CID}" width="${LOGO_WIDTH}" height="${LOGO_HEIGHT}" alt="${esc(COMPANY_NAME)}" style="display:block;border:0;outline:none;width:${LOGO_WIDTH}px;height:auto;">
      </td></tr>

      <tr><td class="px" style="padding:28px 32px 4px;">
        <p style="margin:0 0 6px;font-size:12px;line-height:1.4;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND};">${esc(eyebrow)}</p>
        <h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;font-weight:700;color:${INK};">${esc(heading)}</h1>
        <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:${BODY};">${esc(greeting)}</p>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BODY};">${intro}</p>
      </td></tr>

      ${sections.map(section).join('')}

      <tr><td class="px" style="padding:8px 32px 0;">
        <p style="margin:0;font-size:13px;line-height:1.6;color:${BODY};">${esc(confirmText)}</p>
      </td></tr>
      <tr><td class="px" align="center" style="padding:24px 32px 8px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td align="center" bgcolor="${BRAND}" style="border-radius:8px;">
            <a href="${esc(url)}" target="_blank" rel="noopener" style="display:inline-block;padding:13px 32px;font-family:${FONT};font-size:15px;font-weight:700;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:8px;">${esc(button)}</a>
          </td>
        </tr></table>
      </td></tr>
      <tr><td class="px" align="center" style="padding:6px 32px 28px;">
        <p style="margin:0;font-size:12px;line-height:1.6;color:${MUTED};">This secure link is personal to you and works until <span style="white-space:nowrap;">${esc(expiresOn)}</span>.<br>No password or login is needed.</p>
      </td></tr>

      <tr><td class="px" style="padding:20px 32px;border-top:1px solid ${LINE};background:${PANEL};border-radius:0 0 12px 12px;">
        <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:${INK};">In case of any query, please contact <strong>${esc(QUERY_CONTACT_NAME)}</strong> on <a href="${QUERY_CONTACT_PHONE_LINK}" style="color:${BRAND};font-weight:700;text-decoration:none;white-space:nowrap;">${esc(QUERY_CONTACT_PHONE)}</a>.</p>
        <p style="margin:0;font-size:12px;line-height:1.6;color:${MUTED};">${esc(reason)}</p>
      </td></tr>
    </table>

    <p style="margin:16px 0 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED};">This email was sent automatically by ${esc(COMPANY_NAME)} Asset Management.</p>
  </td></tr>
</table>
</body>
</html>`);
}

function textVersion({ eyebrow, heading, greeting, introText, sections, confirmText, button, url, expiresOn, reason }) {
  const blocks = sections
    .map(({ title, rows }) => {
      const shown = rows.filter(([, v]) => present(v));
      return shown.length ? [`${title.toUpperCase()}`, ...shown.map(([label, value]) => `  ${label}: ${value}`)].join('\n') : null;
    })
    .filter(Boolean);
  return [
    `${COMPANY_NAME} Asset Management - ${eyebrow}`,
    '',
    heading,
    '',
    greeting,
    '',
    introText,
    '',
    ...blocks.flatMap((b) => [b, '']),
    confirmText,
    '',
    `${button}: ${url}`,
    `This secure link is personal to you and works until ${expiresOn}. No password or login is needed.`,
    '',
    `In case of any query, please contact ${QUERY_CONTACT_NAME} on ${QUERY_CONTACT_PHONE}.`,
    '',
    reason,
    `This email was sent automatically by ${COMPANY_NAME} Asset Management.`,
  ].join('\n');
}

// ---- the two emails

const assetSection = (asset) => ({
  title: 'Asset details',
  rows: [
    ['Asset ID', asset.assetId],
    ['Item', asset.itemName],
    ['Category', asset.category],
    ['Brand / Model', brandModel(asset)],
    ['Serial number', asset.serialNumber],
  ],
});

const subjectAsset = (asset) => `${asset.itemName} (${asset.assetId})`;

/**
 * The asset was assigned (or transferred) to `employee`.
 * `event` is the hand-over ({ action, from, date, condition, expectedReturnAt, notes, by }).
 */
export function receiptEmail({ employee, asset, event, url, expiresOn }) {
  const transferred = event.action === 'Transferred';
  const date = day(event.date);
  const from = person(event.from);
  const greeting = `Hi ${firstName(employee.fullName)},`;
  const introText = transferred
    ? `The ${COMPANY_NAME} asset below has been handed over to you from ${from} on ${date}. Please check the details and confirm that you have received it.`
    : `The ${COMPANY_NAME} asset below has been assigned to you on ${date}. Please check the details and confirm that you have received it.`;
  const intro = transferred
    ? `The ${esc(COMPANY_NAME)} asset below has been handed over to you from <strong>${esc(from)}</strong> on <strong>${esc(date)}</strong>. Please check the details and confirm that you have received it.`
    : `The ${esc(COMPANY_NAME)} asset below has been assigned to you on <strong>${esc(date)}</strong>. Please check the details and confirm that you have received it.`;
  const parts = {
    preheader: `${asset.itemName} has been ${transferred ? 'handed over' : 'assigned'} to you. Please confirm you received it.`,
    eyebrow: 'Asset assignment',
    heading: transferred ? 'An asset has been handed over to you' : 'An asset has been assigned to you',
    greeting,
    sections: [
      assetSection(asset),
      {
        title: 'Assignment details',
        rows: [
          [transferred ? 'Handed over on' : 'Assigned on', date],
          ['Received from', transferred ? from : null],
          ['Condition at hand-over', event.condition],
          ['Expected return', day(event.expectedReturnAt)],
          ['Assigned by', event.by?.name],
          ['Notes', event.notes],
        ],
      },
    ],
    confirmText:
      'By acknowledging, you confirm that you have received this asset in the condition stated above, that you will take good care of it, and that you will return it when asked.',
    button: 'Acknowledge receipt',
    url,
    expiresOn,
    reason: `You are receiving this email because a ${COMPANY_NAME} asset was ${transferred ? 'handed over' : 'assigned'} to you (${employee.employeeId || employee.fullName}).`,
  };
  return {
    subject: `Asset ${transferred ? 'handed over' : 'assigned'} to you: ${subjectAsset(asset)}`,
    html: layout({ ...parts, intro }),
    text: textVersion({ ...parts, introText }),
  };
}

/** The asset was returned by (or transferred away from) `employee`. */
export function returnEmail({ employee, asset, event, url, expiresOn }) {
  const transferred = event.action === 'Transferred';
  const date = day(event.date);
  const to = person(event.to);
  const greeting = `Hi ${firstName(employee.fullName)},`;
  const introText = transferred
    ? `We have recorded that the ${COMPANY_NAME} asset below was handed over from you to ${to} on ${date}. Please check the details and confirm the hand-over.`
    : `We have recorded that you returned the ${COMPANY_NAME} asset below on ${date}. Please check the details and confirm the return.`;
  const intro = transferred
    ? `We have recorded that the ${esc(COMPANY_NAME)} asset below was handed over from you to <strong>${esc(to)}</strong> on <strong>${esc(date)}</strong>. Please check the details and confirm the hand-over.`
    : `We have recorded that you returned the ${esc(COMPANY_NAME)} asset below on <strong>${esc(date)}</strong>. Please check the details and confirm the return.`;
  const parts = {
    preheader: `The ${transferred ? 'hand-over' : 'return'} of ${asset.itemName} has been recorded. Please confirm it.`,
    eyebrow: transferred ? 'Asset hand-over' : 'Asset return',
    heading: transferred ? 'Your asset hand-over has been recorded' : 'Your asset return has been recorded',
    greeting,
    sections: [
      assetSection(asset),
      {
        title: transferred ? 'Hand-over details' : 'Return details',
        rows: [
          [transferred ? 'Handed over on' : 'Returned on', date],
          ['Handed over to', transferred ? to : null],
          [transferred ? 'Condition at hand-over' : 'Condition on return', event.condition],
          ['Recorded by', event.by?.name],
          ['Notes', event.notes],
        ],
      },
    ],
    confirmText: transferred
      ? 'By acknowledging, you confirm that you have handed this asset over as stated above and no longer have it.'
      : 'By acknowledging, you confirm that you have returned this asset in the condition stated above and no longer have it.',
    button: transferred ? 'Acknowledge hand-over' : 'Acknowledge return',
    url,
    expiresOn,
    reason: `You are receiving this email because the ${transferred ? 'hand-over' : 'return'} of a ${COMPANY_NAME} asset was recorded for you (${employee.employeeId || employee.fullName}).`,
  };
  return {
    subject: `Asset ${transferred ? 'hand-over' : 'return'} recorded: ${subjectAsset(asset)}`,
    html: layout({ ...parts, intro }),
    text: textVersion({ ...parts, introText }),
  };
}
