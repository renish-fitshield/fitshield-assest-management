'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Checkbox, Descriptions, Modal, Result, Spin, Tag, Typography } from 'antd';
import { CheckCircleFilled, ClockCircleOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import Logo from '@/components/brand/Logo';
import StatusTag from '@/components/StatusTag';
import { formatDate, formatDateTime } from '@/lib/format';
import { COMPANY_NAME, QUERY_CONTACT_NAME, QUERY_CONTACT_PHONE, QUERY_CONTACT_PHONE_LINK } from '@/lib/constants';

const person = (p) => (p ? `${p.fullName}${p.employeeId ? ` (${p.employeeId})` : ''}` : null);
const isRetryable = (status) => status === 0 || status === 429 || status >= 500;

const TIMEOUT_MS = 30_000;

/**
 * Calls the public acknowledgement API (`path` '' for details, '/status' for the status check).
 * Always rejects with an Error carrying `status` (0 when no answer came back), the API's `code`, and
 * `retry` (true when trying again may help: no connection, timeout, server trouble).
 */
async function request(method, token, path = '') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`/api/acknowledgements/${encodeURIComponent(token || '')}${path}`, {
      method,
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (err) {
    const timedOut = err?.name === 'AbortError';
    throw Object.assign(
      new Error(
        timedOut
          ? 'The server is taking too long to respond. Please try again.'
          : "Couldn't reach the server. Check your internet connection and try again."
      ),
      { status: 0, retry: true }
    );
  } finally {
    clearTimeout(timer);
  }

  let data = {};
  try {
    data = await res.json();
  } catch {
    // Not JSON (e.g. a proxy error page): handled by the status checks below.
  }
  if (!res.ok) {
    const retry = isRetryable(res.status);
    const fallback = retry ? 'Something went wrong on our side. Please try again in a moment.' : 'Something went wrong.';
    throw Object.assign(new Error(data.message || fallback), { status: res.status, code: data.code, retry });
  }
  return data;
}

// What each failed check looks like (codes from lib/acknowledgements.js).
const ERROR_SCREENS = {
  LINK_INVALID: { status: 'error', title: "This link can't be used" },
  LINK_EXPIRED: {
    status: 'warning',
    title: 'This link has expired',
    subTitle: 'Acknowledgement links work for 30 days. Please ask the asset team to send you a new one.',
  },
  ASSET_NOT_FOUND: { status: 'error', title: 'Asset not found' },
  EMPLOYEE_NOT_FOUND: { status: 'error', title: 'Employee not found' },
  HANDOVER_NOT_FOUND: { status: 'error', title: 'Hand-over not found' },
};

function errorScreen(error) {
  const known = ERROR_SCREENS[error.code];
  if (known) return { subTitle: error.message, ...known, retry: false };
  const retry = error.retry ?? isRetryable(error.status);
  return {
    status: retry ? 'warning' : 'error',
    title: retry ? "We couldn't load this right now" : "This link can't be used",
    subTitle: error.message,
    retry,
  };
}

/** "receipt" | "hand-over" | "return" — what the employee is confirming. */
const whatOf = (data) => (data.kind === 'receipt' ? 'receipt' : data.handOver.action === 'Transferred' ? 'hand-over' : 'return');

function Contact() {
  return (
    <p className="ack-contact">
      In case of any query, contact <strong>{QUERY_CONTACT_NAME}</strong> on{' '}
      <a href={QUERY_CONTACT_PHONE_LINK} style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
        {QUERY_CONTACT_PHONE}
      </a>
      .
    </p>
  );
}

function Details({ data }) {
  const { asset, handOver, kind } = data;
  const receipt = kind === 'receipt';
  const transferred = handOver.action === 'Transferred';
  const done = data.status === 'Acknowledged';
  const items = [
    ['Status', <StatusTag key="s" value={data.status} />],
    [done ? 'Acknowledged on' : null, formatDateTime(data.acknowledgedAt)],
    ['Asset ID', asset.assetId],
    ['Item', asset.itemName],
    ['Category', asset.category],
    ['Brand / Model', [asset.brand, asset.modelName].filter(Boolean).join(' · ')],
    ['Serial number', asset.serialNumber],
    [receipt ? (transferred ? 'Handed over on' : 'Assigned on') : transferred ? 'Handed over on' : 'Returned on', formatDate(handOver.date)],
    [receipt ? (transferred ? 'Received from' : null) : transferred ? 'Handed over to' : null, person(handOver.counterpart)],
    ['Condition', handOver.condition ? <StatusTag key="c" value={handOver.condition} /> : null],
    [receipt ? 'Expected return' : null, handOver.expectedReturnAt ? formatDate(handOver.expectedReturnAt) : null],
    ['Notes', handOver.notes],
    [receipt ? 'Assigned by' : 'Recorded by', handOver.by],
  ]
    .filter(([label, value]) => label && value)
    .map(([label, value]) => ({ key: label, label, children: value }));
  return <Descriptions column={1} size="small" bordered items={items} />;
}

function PendingScreen({ data, agreed, onAgree, submitting, submitError, onSubmit }) {
  const receipt = data.kind === 'receipt';
  const transferred = data.handOver.action === 'Transferred';
  const what = whatOf(data);
  return (
    <>
      <div className="ack-head">
        <div className="eyebrow">
          <SafetyCertificateOutlined /> Asset acknowledgement
        </div>
        <Tag icon={<ClockCircleOutlined />} color="gold" className="ack-status">
          Pending
        </Tag>
      </div>
      <Typography.Title level={3} style={{ marginTop: 4 }}>
        {receipt ? 'Please acknowledge receipt' : `Please acknowledge the ${what}`}
      </Typography.Title>
      <Typography.Paragraph>
        Hi {data.employee.fullName.split(' ')[0]},{' '}
        {receipt
          ? transferred
            ? `the asset below has been handed over to you from ${person(data.handOver.counterpart)}.`
            : 'the asset below has been assigned to you.'
          : transferred
            ? `we've recorded that you handed the asset below over to ${person(data.handOver.counterpart)}.`
            : "we've recorded that you returned the asset below."}{' '}
        Please check the details and confirm.
      </Typography.Paragraph>
      <Details data={data} />
      <Checkbox className="ack-agree" checked={agreed} onChange={(e) => onAgree(e.target.checked)} disabled={submitting}>
        {receipt
          ? 'I confirm that I have received this asset in the condition stated above, that I will take good care of it, and that I will return it when asked.'
          : 'I confirm that I no longer have this asset and handed it over as stated above.'}
      </Checkbox>
      {submitError && (
        <Typography.Paragraph type="danger" style={{ marginTop: 12 }}>
          {submitError}
        </Typography.Paragraph>
      )}
      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <Button type="primary" size="large" loading={submitting} disabled={!agreed} onClick={onSubmit} style={{ minWidth: 260 }}>
          {receipt ? 'Acknowledge receipt' : `Acknowledge ${what}`}
        </Button>
        {!agreed && <div className="ack-hint">Tick the box above to continue.</div>}
      </div>
      {data.linkExpiresAt && <p className="ack-hint">This personal link works until {formatDate(data.linkExpiresAt)}.</p>}
      <Contact />
    </>
  );
}

function DoneScreen({ data, justNow }) {
  const what = whatOf(data);
  const asset = `${data.asset.itemName} (${data.asset.assetId})`;
  return (
    <>
      <Result
        status={justNow ? 'success' : undefined}
        icon={justNow ? undefined : <CheckCircleFilled style={{ color: 'var(--fs-green)' }} />}
        title={justNow ? 'Thank you — acknowledged!' : 'Already acknowledged'}
        subTitle={
          justNow
            ? `You acknowledged the ${what} of ${asset} on ${formatDateTime(data.acknowledgedAt)}. It has been recorded, so you can close this page.`
            : `${person(data.employee)} acknowledged the ${what} of ${asset} on ${formatDateTime(data.acknowledgedAt)}. There's nothing more to do.`
        }
      />
      <Details data={data} />
      <Contact />
    </>
  );
}

/**
 * The acknowledgement page, starting from what the server already checked (`initial`):
 *   { data } — every check passed; Pending shows the acknowledge screen, Acknowledged the done screen
 *              (with an "Already acknowledged" dialog when it was done before this visit)
 *   { error } — { status, code, message }: why it can't be acknowledged
 * The button runs every check again on the server right before recording it.
 */
export default function AcknowledgeView({ token, initial }) {
  const [data, setData] = useState(initial.data || null);
  const [error, setError] = useState(initial.error || null);
  const [reloading, setReloading] = useState(false);
  const [justNow, setJustNow] = useState(false); // acknowledged during this visit
  const [alreadyOpen, setAlreadyOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Opened after the first render: the dialog only exists in the browser, so rendering it open on the
  // server pass would make the page's HTML differ from the browser's.
  const openedAcknowledged = initial.data?.status === 'Acknowledged';
  useEffect(() => {
    if (openedAcknowledged) setAlreadyOpen(true);
  }, [openedAcknowledged]);

  const show = useCallback((next) => {
    setError(null);
    setData(next);
  }, []);
  const showError = useCallback((err) => {
    setData(null);
    setError(err);
    setAlreadyOpen(false);
  }, []);

  const reload = useCallback(async () => {
    setReloading(true);
    try {
      const next = await request('GET', token);
      show(next);
      setAlreadyOpen(next.status === 'Acknowledged');
    } catch (err) {
      showError(err);
    } finally {
      setReloading(false);
    }
  }, [token, show, showError]);

  // While it's pending, re-check the status each time the page comes back into view: it may have been
  // acknowledged from another tab or device, or the asset/employee removed, in the meantime.
  const pending = data?.status === 'Pending';
  useEffect(() => {
    if (!pending) return undefined;
    const onVisible = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const status = await request('GET', token, '/status');
        if (status.status === 'Acknowledged') await reload();
      } catch (err) {
        if (!err.retry) showError(err);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [pending, token, reload, showError]);

  const submit = useCallback(async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const next = await request('POST', token);
      show(next);
      if (next.alreadyAcknowledged) setAlreadyOpen(true);
      else setJustNow(true);
    } catch (err) {
      // A check failed meanwhile (link expired, asset or employee removed): show why instead of the form.
      if (!err.retry) showError(err);
      else setSubmitError(`${err.message} It's safe to press the button again.`);
    } finally {
      setSubmitting(false);
    }
  }, [token, show, showError]);

  let body;
  if (reloading) {
    body = (
      <div style={{ padding: '48px 0', textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  } else if (error) {
    const screen = errorScreen(error);
    body = (
      <Result
        status={screen.status}
        title={screen.title}
        subTitle={screen.subTitle}
        extra={
          <>
            {screen.retry && (
              <Button type="primary" onClick={reload}>
                Try again
              </Button>
            )}
            <Contact />
          </>
        }
      />
    );
  } else if (data.status === 'Acknowledged') {
    body = <DoneScreen data={data} justNow={justNow} />;
  } else {
    body = (
      <PendingScreen
        data={data}
        agreed={agreed}
        onAgree={setAgreed}
        submitting={submitting}
        submitError={submitError}
        onSubmit={submit}
      />
    );
  }

  return (
    <main className="ack-page">
      <div className="ack-card">
        <div className="ack-brand">
          <Logo size={36} subtitle="Asset Management" />
        </div>
        {body}
      </div>
      <p className="ack-foot">© {new Date().getFullYear()} {COMPANY_NAME}</p>

      <Modal
        open={alreadyOpen && data?.status === 'Acknowledged'}
        onCancel={() => setAlreadyOpen(false)}
        footer={
          <Button type="primary" onClick={() => setAlreadyOpen(false)}>
            OK
          </Button>
        }
        centered
        width={420}
      >
        {data && (
          <div className="ack-modal">
            <CheckCircleFilled className="ack-modal-icon" />
            <h3>Already acknowledged</h3>
            <p>
              You already acknowledged the {whatOf(data)} of this asset on {formatDateTime(data.acknowledgedAt)}. There&apos;s
              nothing more you need to do.
            </p>
          </div>
        )}
      </Modal>
    </main>
  );
}
