// Checks the email settings exactly as the app reads them: signs in (to the mail server, or to Microsoft
// as the app) and sends one short test email. Usage: npm run mail:test -- someone@yopmail.com   (reads .env.local)
import {
  MAIL_PROVIDERS,
  MailSetupError,
  describeMailError,
  graphSend,
  mailSettings,
  transportFor,
} from '../src/lib/mailer.js';

const to = process.argv[2];
const stop = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};
const TEST = {
  subject: 'Fitshield Asset Management: email test',
  text: 'This is a test email from Fitshield Asset Management. If you can read it, asset acknowledgement emails will be delivered too.',
};

if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) stop('Give the address to send the test to: npm run mail:test -- someone@yopmail.com');

let s;
try {
  s = mailSettings();
} catch (err) {
  stop(err instanceof MailSetupError ? err.message : String(err));
}
if (!s) {
  stop(
    `Email isn't set up. In .env.local set MAIL_PROVIDER (microsoft365 | ${Object.keys(MAIL_PROVIDERS).join(' | ')}) and its settings — see .env.example.`
  );
}

if (s.kind === 'graph') {
  console.log(`Provider: ${s.label}`);
  console.log(`Sends as: ${s.from}`);
  try {
    const { messageId } = await graphSend(s, { to, ...TEST, replyTo: process.env.MAIL_REPLY_TO || undefined });
    console.log('✓ Signed in to Microsoft as the app, and it is allowed to send as this mailbox');
    console.log(`✓ Test email sent to ${to}${messageId ? ` (request ${messageId})` : ''}`);
    console.log("  It's also saved in the mailbox's Sent Items. Check the recipient's inbox (and spam folder).");
  } catch (err) {
    stop(describeMailError(err, s));
  }
  process.exit(0);
}

console.log(`Provider: ${s.label} — ${s.host}:${s.port} (${s.secure ? 'SSL' : s.requireTLS ? 'STARTTLS' : 'plain/STARTTLS if offered'})`);
console.log(`Mailbox:  ${s.user || '(no login)'}`);
console.log(`Sender:   ${s.from}`);
if (s.fromDiffersFromUser) console.warn(`! MAIL_FROM isn't the mailbox itself — this only works if ${s.fromAddress} is an alias of ${s.user}.`);

const transport = transportFor(s);
try {
  await transport.verify();
  console.log('✓ Signed in to the mail server');
} catch (err) {
  stop(describeMailError(err, s));
}

try {
  const info = await transport.sendMail({ from: s.from, to, replyTo: process.env.MAIL_REPLY_TO || undefined, ...TEST });
  if (info.rejected?.length) stop(`The mail server refused ${info.rejected.join(', ')}.`);
  console.log(`✓ Test email sent to ${to} (${info.messageId})`);
  console.log('  Check that inbox (and its spam folder). If it arrived, acknowledgement emails will be delivered too.');
} catch (err) {
  stop(describeMailError(err, s));
}
