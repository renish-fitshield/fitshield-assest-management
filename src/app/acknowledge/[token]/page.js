import { connectDB } from '@/lib/db';
import { ackErrorView, getAcknowledgement } from '@/lib/acknowledgements';
import AcknowledgeView from './AcknowledgeView';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Asset acknowledgement · Fitshield',
  robots: { index: false, follow: false },
  // The link itself is the proof, so it's never sent on to other sites.
  referrer: 'no-referrer',
};

/**
 * Public page (no login) opened from the acknowledgement email.
 * Every check — the link, the asset, the employee, the hand-over and the current status — runs on the
 * server before the page is sent, so it opens straight on the right screen: acknowledge, already
 * acknowledged, or why it can't be acknowledged. Opening it never changes anything (email link
 * scanners may open it too); only the button does.
 */
export default async function AcknowledgePage({ params }) {
  const { token } = await params;
  let initial;
  try {
    await connectDB();
    // Plain JSON, exactly what GET /api/acknowledgements/:token returns.
    initial = { data: JSON.parse(JSON.stringify(await getAcknowledgement(token))) };
  } catch (err) {
    initial = { error: ackErrorView(err) };
  }
  return <AcknowledgeView token={token} initial={initial} />;
}
