import crypto from 'crypto';
import nodemailer from 'nodemailer';

/**
 * Outgoing email. ONE sending mailbox delivers to everyone — Outlook, Zoho, Gmail, Yopmail… inboxes all
 * receive it. Only the sending account needs setting up, in one of two ways:
 *
 * 1. Microsoft 365 via Microsoft Graph (recommended for fitshield.in, whose mail is on Microsoft 365):
 *      MAIL_PROVIDER=microsoft365
 *      MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET   from an app registration in Microsoft Entra that has the
 *                                                     Mail.Send application permission (admin consented)
 *      MAIL_FROM="Fitshield Asset Management <jeel.borda@fitshield.in>"   the mailbox it sends from
 *
 * 2. SMTP (any mail server):
 *      MAIL_PROVIDER  outlook | zoho | zoho-in | zoho-eu | gmail   (fills in server, port and encryption)
 *      SMTP_USER, SMTP_PASS    the sending mailbox and its (app) password
 *      MAIL_FROM               optional; must be SMTP_USER or one of its aliases
 *    Or leave MAIL_PROVIDER empty and set SMTP_HOST, SMTP_PORT, SMTP_SECURE ("true" for 465).
 *
 * MAIL_REPLY_TO is optional for both. With nothing set, development sends to an Ethereal test inbox
 * (nothing is delivered; each email gets a preview link) and production fails with a clear error.
 */

// SMTP presets. Yopmail isn't here: it only receives (useful as a test recipient, never as the sender).
export const MAIL_PROVIDERS = {
  // Zoho ZeptoMail — the transactional email service the Fitshield backend already uses for
  // communication@fitshield.in (the fitshield.in domain is verified there). Login is the literal user
  // "emailapikey" with a Send Mail token as the password; any address on a verified domain can send.
  zeptomail: {
    label: 'Zoho ZeptoMail (India)',
    host: 'smtp.zeptomail.in',
    port: 587,
    secure: false,
    requireTLS: true,
    passHint:
      'SMTP_USER must be "emailapikey" and SMTP_PASS a Send Mail token from ZeptoMail (Mail Agents → SMTP/API), and the sender must be on a domain verified in that Mail Agent',
  },
  outlook: {
    label: 'Outlook / Microsoft 365 (SMTP)',
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    requireTLS: true,
    passHint:
      'Authenticated SMTP must be switched on for this mailbox (Microsoft 365 admin center → user → Mail → Manage email apps), and Microsoft may refuse passwords altogether — if so, use MAIL_PROVIDER=microsoft365 (Microsoft Graph) instead',
  },
  zoho: {
    label: 'Zoho Mail (zoho.com)',
    host: 'smtp.zoho.com',
    port: 465,
    secure: true,
    passHint: 'if two-factor sign-in is on, use an app-specific password (Zoho Accounts → Security → App Passwords)',
  },
  'zoho-in': {
    label: 'Zoho Mail India (zoho.in)',
    host: 'smtp.zoho.in',
    port: 465,
    secure: true,
    passHint: 'if two-factor sign-in is on, use an app-specific password (Zoho Accounts → Security → App Passwords)',
  },
  'zoho-eu': {
    label: 'Zoho Mail Europe (zoho.eu)',
    host: 'smtp.zoho.eu',
    port: 465,
    secure: true,
    passHint: 'if two-factor sign-in is on, use an app-specific password (Zoho Accounts → Security → App Passwords)',
  },
  gmail: {
    label: 'Gmail / Google Workspace',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    passHint: 'use a 16-letter App Password (myaccount.google.com/apppasswords), not the normal password',
  },
};
const GRAPH_PROVIDERS = new Set(['microsoft365', 'm365', 'graph']);

const cache = global._mailerCache ?? (global._mailerCache = { key: null, promise: null, graphToken: null });

const TIMEOUTS = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 };
const HTTP_TIMEOUT_MS = 20_000;
// Shown as the sender when MAIL_FROM doesn't name one.
const SENDER_NAME = 'Fitshield Asset Management';

/** An error whose message is already fit to show an admin (e.g. "Email is not set up…"). */
export class MailSetupError extends Error {}

const emailOf = (from) => (from.match(/<([^>]+)>/)?.[1] || from).trim().toLowerCase();
const nameOf = (from) => from.match(/^\s*"?([^"<]+?)"?\s*</)?.[1]?.trim() || null;
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const providerOf = (env) => env.MAIL_PROVIDER?.trim().toLowerCase() || null;

// ---------------------------------------------------------------- settings

/**
 * Microsoft Graph settings from the environment, checked; null unless MAIL_PROVIDER=microsoft365.
 * Throws MailSetupError (with a message an admin can act on) when something is missing.
 */
export function graphSettings(env = process.env) {
  if (!GRAPH_PROVIDERS.has(providerOf(env))) return null;
  const tenant = env.MS_TENANT_ID?.trim();
  const clientId = env.MS_CLIENT_ID?.trim();
  const secret = env.MS_CLIENT_SECRET?.trim();
  const missing = [!tenant && 'MS_TENANT_ID', !clientId && 'MS_CLIENT_ID', !secret && 'MS_CLIENT_SECRET'].filter(Boolean);
  if (missing.length) {
    throw new MailSetupError(`Microsoft 365 email isn't finished: ${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} missing (from the app registration in Microsoft Entra)`);
  }
  const from = env.MAIL_FROM?.trim() || env.SMTP_USER?.trim();
  if (!from) throw new MailSetupError('MAIL_FROM is missing — the Microsoft 365 mailbox to send from, e.g. "Fitshield Asset Management <jeel.borda@fitshield.in>"');
  const sender = emailOf(from);
  if (!isEmail(sender)) throw new MailSetupError(`MAIL_FROM "${from}" doesn't contain a valid email address`);
  return { kind: 'graph', providerKey: 'microsoft365', label: 'Microsoft 365 (Microsoft Graph)', tenant, clientId, secret, sender, name: nameOf(from), from };
}

/**
 * The SMTP settings from the environment, checked; null when SMTP isn't configured.
 * Throws MailSetupError (with a message an admin can act on) when it's configured wrongly.
 */
export function smtpSettings(env = process.env) {
  const providerKey = providerOf(env);
  if (GRAPH_PROVIDERS.has(providerKey)) return null;
  const preset = providerKey ? MAIL_PROVIDERS[providerKey] : null;
  if (providerKey === 'yopmail') {
    throw new MailSetupError(
      "Yopmail can only receive email (it is a test inbox), so it can't send. Send from your company mailbox and use Yopmail addresses as test recipients."
    );
  }
  if (providerKey && !preset) {
    throw new MailSetupError(
      `MAIL_PROVIDER "${env.MAIL_PROVIDER}" isn't known — use one of: microsoft365, ${Object.keys(MAIL_PROVIDERS).join(', ')} (or leave it empty and set SMTP_HOST)`
    );
  }

  const host = env.SMTP_HOST?.trim() || preset?.host;
  if (!host) return null;

  const port = env.SMTP_PORT?.trim() ? Number(env.SMTP_PORT) : preset?.port ?? 587;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new MailSetupError(`SMTP_PORT "${env.SMTP_PORT}" is not a valid port`);
  const secure = env.SMTP_SECURE?.trim() ? env.SMTP_SECURE.trim() === 'true' : preset ? preset.secure : port === 465;

  const user = env.SMTP_USER?.trim() || null;
  // App passwords are often shown in groups ("abcd efgh ijkl mnop"); the spaces aren't part of them.
  const pass = env.SMTP_PASS ? (preset ? env.SMTP_PASS.replace(/\s+/g, '') : env.SMTP_PASS) : null;
  if (preset && !user) throw new MailSetupError(`SMTP_USER is missing — add the ${preset.label} mailbox that sends the emails`);
  if (user && !pass) throw new MailSetupError(`SMTP_PASS is missing for ${user}`);

  // ZeptoMail signs in with an API user ("emailapikey"), not a mailbox, so it always needs MAIL_FROM.
  const from = env.MAIL_FROM?.trim() || (user && isEmail(user) ? `"${SENDER_NAME}" <${user}>` : null);
  if (!from) throw new MailSetupError('MAIL_FROM is missing — the address emails come from, e.g. "Fitshield Asset Management <communication@fitshield.in>"');
  const fromAddress = emailOf(from);
  if (!isEmail(fromAddress)) throw new MailSetupError(`MAIL_FROM "${env.MAIL_FROM}" doesn't contain a valid email address`);

  return {
    kind: 'smtp',
    providerKey,
    preset,
    label: preset?.label || host,
    host,
    port,
    secure,
    requireTLS: preset?.requireTLS ?? false,
    user,
    pass,
    from,
    fromAddress,
    // Mailbox providers send only as the signed-in mailbox (or its aliases): Zoho refuses, Gmail rewrites the
    // sender. (Not a concern when the login isn't a mailbox, as with ZeptoMail's "emailapikey".)
    fromDiffersFromUser: Boolean(user && isEmail(user) && fromAddress !== user.toLowerCase()),
  };
}

/** Whichever way email is configured: Graph settings, SMTP settings, or null (not set up). */
export const mailSettings = (env = process.env) => graphSettings(env) || smtpSettings(env);

// ---------------------------------------------------------------- SMTP

/** A nodemailer transport for these SMTP settings. */
export const transportFor = (s) =>
  nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.secure,
    requireTLS: s.requireTLS,
    auth: s.user ? { user: s.user, pass: s.pass } : undefined,
    ...TIMEOUTS,
  });

// ---------------------------------------------------------------- Microsoft Graph

/** A failed Microsoft call, with what describeMailError needs to explain it. */
class GraphError extends Error {
  constructor(stage, status, graphCode, detail) {
    super(`${graphCode || status}: ${detail || 'no details'}`);
    this.code = 'EGRAPH';
    this.stage = stage; // 'token' (signing in as the app) | 'send'
    this.status = status;
    this.graphCode = graphCode;
    this.detail = detail;
  }
}

async function httpJson(url, init, stage) {
  let res;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    throw Object.assign(new Error(`${timedOut ? 'Timed out' : 'Network error'} calling Microsoft (${err?.cause?.code || err?.message})`), {
      code: timedOut ? 'ETIMEDOUT' : 'ECONNECTION',
      stage,
    });
  }
  let data = null;
  try {
    data = res.status === 202 ? null : await res.json();
  } catch {
    // no JSON body
  }
  return { res, data };
}

/** An app-only access token for Microsoft Graph (client credentials), cached until shortly before it expires. */
async function graphToken(s) {
  const key = `${s.tenant}|${s.clientId}|${crypto.createHash('sha256').update(s.secret).digest('hex')}`;
  const cached = cache.graphToken;
  if (cached?.key === key && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const { res, data } = await httpJson(
    `https://login.microsoftonline.com/${encodeURIComponent(s.tenant)}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: s.clientId,
        client_secret: s.secret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    },
    'token'
  );
  if (!res.ok || !data?.access_token) {
    throw new GraphError('token', res.status, data?.error, String(data?.error_description || '').split('\r\n')[0]);
  }
  cache.graphToken = { key, token: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
  return data.access_token;
}

const graphAttachment = (a) => ({
  '@odata.type': '#microsoft.graph.fileAttachment',
  name: a.filename,
  contentType: a.contentType,
  contentBytes: a.encoding === 'base64' ? a.content : Buffer.from(a.content).toString('base64'),
  ...(a.cid ? { isInline: true, contentId: a.cid } : {}),
});

/** Sends one message through Microsoft Graph as the configured mailbox. */
export async function graphSend(s, { to, subject, html, text, attachments = [], replyTo }) {
  const token = await graphToken(s);
  const message = {
    subject,
    body: html ? { contentType: 'HTML', content: html } : { contentType: 'Text', content: text || '' },
    toRecipients: [{ emailAddress: { address: to } }],
    ...(s.name ? { from: { emailAddress: { address: s.sender, name: s.name } } } : {}),
    ...(replyTo ? { replyTo: [{ emailAddress: { address: replyTo } }] } : {}),
    ...(attachments.length ? { attachments: attachments.map(graphAttachment) } : {}),
  };
  const { res, data } = await httpJson(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(s.sender)}/sendMail`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ message, saveToSentItems: true }),
    },
    'send'
  );
  if (res.status === 202) return { messageId: res.headers.get('request-id') || undefined };
  if (res.status === 401) cache.graphToken = null; // a fresh token next time
  throw new GraphError('send', res.status, data?.error?.code, data?.error?.message);
}

// ---------------------------------------------------------------- the app's mail sender

async function createSender() {
  const settings = mailSettings();
  if (settings?.kind === 'graph') {
    return { test: false, settings, send: (m) => graphSend(settings, m) };
  }
  if (settings) {
    if (settings.fromDiffersFromUser) {
      console.warn(`[mail] MAIL_FROM (${settings.fromAddress}) isn't the SMTP_USER mailbox (${settings.user}); this only works if it's an alias of that mailbox`);
    }
    const transport = transportFor(settings);
    return { test: false, settings, send: (m) => transport.sendMail({ ...m, from: settings.from }) };
  }
  if (process.env.NODE_ENV === 'production') {
    throw new MailSetupError('Email is not set up on the server (add MAIL_PROVIDER and its settings — see .env.example)');
  }
  let account;
  try {
    account = await nodemailer.createTestAccount();
  } catch (err) {
    throw new MailSetupError(`Email is not set up, and the development test inbox couldn't be reached (${err?.message || err})`);
  }
  const transport = transportFor({ host: account.smtp.host, port: account.smtp.port, secure: account.smtp.secure, user: account.user, pass: account.pass });
  return { test: true, settings: null, send: (m) => transport.sendMail({ ...m, from: `"${SENDER_NAME} (test)" <${account.user}>` }) };
}

// One sender per configuration (rebuilt whenever a mail setting changes); a failed setup is retried next time.
const SETTING_KEYS = ['MAIL_PROVIDER', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM', 'MS_TENANT_ID', 'MS_CLIENT_ID', 'MS_CLIENT_SECRET'];
function getSender() {
  const key = crypto.createHash('sha256').update([SENDER_NAME, ...SETTING_KEYS.map((k) => process.env[k])].join('\u0000')).digest('hex');
  if (cache.key !== key || !cache.promise) {
    cache.key = key;
    cache.promise = createSender().catch((err) => {
      cache.promise = null;
      throw err;
    });
  }
  return cache.promise;
}

// Network hiccups and busy servers are worth one more try; anything else (bad login, rejected address…) won't fix itself.
const TRANSIENT = new Set(['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'ECONNRESET', 'EDNS', 'ECONNREFUSED']);
const isTransient = (err) =>
  TRANSIENT.has(err?.code) ||
  (err?.responseCode >= 421 && err?.responseCode < 500) ||
  (err?.code === 'EGRAPH' && (err.status === 429 || err.status >= 500));
const RETRY_DELAY_MS = 1500;

function currentSettings() {
  try {
    return mailSettings();
  } catch {
    return null;
  }
}

/** Explains a Microsoft Graph failure in terms of what the Microsoft 365 admin has to fix. */
function describeGraphError(err, s) {
  const code = String(err.graphCode || '');
  const detail = String(err.detail || '').slice(0, 160);
  const aadsts = detail.match(/AADSTS\d+/)?.[0] || '';
  if (err.stage === 'token') {
    if (aadsts === 'AADSTS90002' || code === 'invalid_tenant' || /tenant/i.test(detail) && err.status === 400 && /not found/i.test(detail)) {
      return `Microsoft can't find the tenant MS_TENANT_ID — copy the Directory (tenant) ID from the app registration (${aadsts || code})`;
    }
    if (aadsts === 'AADSTS700016' || code === 'unauthorized_client') {
      return `Microsoft doesn't know the app MS_CLIENT_ID in this tenant — copy the Application (client) ID from the app registration (${aadsts || code})`;
    }
    if (aadsts === 'AADSTS7000215' || aadsts === 'AADSTS7000222' || code === 'invalid_client') {
      return `Microsoft rejected the app's client secret — MS_CLIENT_SECRET is wrong or has expired; create a new secret and copy its Value (${aadsts || code})`;
    }
    return `Microsoft wouldn't sign the app in (${aadsts || code || err.status}: ${detail})`;
  }
  if (err.status === 403 || /AccessDenied|Authorization_RequestDenied/i.test(code)) {
    return `Microsoft says the app may not send as ${s?.sender || 'this mailbox'} — give the app the Mail.Send application permission and grant admin consent (and, if mail sending is restricted to certain mailboxes, include this one) (${code || err.status})`;
  }
  if (err.status === 404 || /ErrorInvalidUser|MailboxNotEnabledForRESTAPI|ResourceNotFound|MailboxNotFound/i.test(code)) {
    return `${s?.sender || 'The sending address'} isn't a Microsoft 365 mailbox in this tenant — check MAIL_FROM (${code || err.status})`;
  }
  if (/ErrorInvalidRecipients|InvalidRecipients/i.test(code)) return `Microsoft refused the recipient address (${detail})`;
  if (err.status === 429) return `Microsoft is limiting how fast emails can be sent — try again in a minute (${code})`;
  if (err.status === 401) return `Microsoft rejected the app's access — check the app registration and its Mail.Send permission (${code || 401})`;
  return `Microsoft couldn't send the email (${code || err.status}: ${detail})`;
}

/** Turns a mail error into a short reason an admin can act on (with provider-specific hints). */
export function describeMailError(err, settings = currentSettings()) {
  if (err instanceof MailSetupError) return err.message;
  if (err?.code === 'EGRAPH') return describeGraphError(err, settings);
  const detail = String(err?.response || err?.message || err).slice(0, 160);
  const preset = settings?.preset;
  const host = settings?.host || process.env.SMTP_HOST || (settings?.kind === 'graph' ? 'Microsoft 365' : '');

  // Microsoft: password sign-in for SMTP switched off (tenant / mailbox, or retired altogether).
  if (/5\.7\.139|basic authentication is disabled|SmtpClientAuthentication is disabled/i.test(detail)) {
    return `Microsoft 365 won't accept a password for SMTP on this mailbox (password sign-in for SMTP is switched off) — use MAIL_PROVIDER=microsoft365 (Microsoft Graph) instead (${detail})`;
  }
  // Sending as an address the mailbox isn't allowed to use (e.g. Zoho "553 Sender is not allowed to relay").
  if (err?.responseCode === 553 || /relay|not allowed to send|sender address|not owned|SendAsDenied/i.test(detail)) {
    return `The mail server won't send as ${settings?.fromAddress || 'MAIL_FROM'} — MAIL_FROM must be the SMTP_USER mailbox${settings?.user ? ` (${settings.user})` : ''} or one of its aliases (${detail})`;
  }

  switch (err?.code) {
    case 'EAUTH': {
      const hint = preset?.passHint || 'check SMTP_USER and SMTP_PASS';
      const region = settings?.providerKey?.startsWith('zoho')
        ? ', and that MAIL_PROVIDER matches where the account lives (zoho = zoho.com, zoho-in = zoho.in, zoho-eu = zoho.eu)'
        : '';
      return `The mail server rejected the login${settings?.user ? ` for ${settings.user}` : ''} — ${hint}${region} (${detail})`;
    }
    case 'EENVELOPE':
      return `The mail server refused the address (${detail})`;
    case 'ETIMEDOUT':
    case 'ECONNECTION':
    case 'ESOCKET':
    case 'ECONNRESET':
    case 'ECONNREFUSED':
    case 'EDNS':
      return `Couldn't reach the mail server ${host} (${detail})`.replace('  ', ' ');
    case 'EMESSAGE':
      return `The email couldn't be built (${detail})`;
    default:
      if (err?.responseCode >= 500) return `The mail server rejected the email (${detail})`;
      if (err?.responseCode >= 400) return `The mail server is temporarily refusing email (${detail})`;
      return `The email couldn't be sent (${detail})`;
  }
}

/**
 * Sends one email (retrying once on a temporary network/server problem).
 * Resolves { messageId, previewUrl? }; rejects with the last error (see describeMailError).
 */
export async function sendMail({ to, subject, html, text, attachments }) {
  const sender = await getSender();
  const message = { to, replyTo: process.env.MAIL_REPLY_TO || undefined, subject, html, text, attachments };
  let info;
  try {
    info = await sender.send(message);
  } catch (err) {
    if (!isTransient(err)) throw err;
    console.warn(`[mail] temporary failure sending to ${to} (${err.code}${err.responseCode || err.status ? ` ${err.responseCode || err.status}` : ''}); retrying once`);
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    info = await sender.send(message);
  }
  if (info?.rejected?.length) {
    throw Object.assign(new Error(`Rejected: ${info.rejected.join(', ')}`), { code: 'EENVELOPE' });
  }
  return { messageId: info?.messageId, previewUrl: sender.test ? nodemailer.getTestMessageUrl(info) || undefined : undefined };
}
