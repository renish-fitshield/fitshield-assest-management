'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button, Descriptions, Result, Spin, Typography } from 'antd';
import { CheckCircleFilled, SafetyCertificateOutlined } from '@ant-design/icons';
import Logo from '@/components/brand/Logo';
import StatusTag from '@/components/StatusTag';
import { formatDate, formatDateTime } from '@/lib/format';
import { COMPANY_NAME, QUERY_CONTACT_NAME, QUERY_CONTACT_PHONE, QUERY_CONTACT_PHONE_LINK } from '@/lib/constants';

// Public page (no login) opened from the acknowledgement email. The token in the URL identifies the
// asset, the hand-over and the employee; the button records the acknowledgement.

const person = (p) => (p ? `${p.fullName}${p.employeeId ? ` (${p.employeeId})` : ''}` : null);

const TIMEOUT_MS = 30_000;

/**
 * Calls the public acknowledgement API. Always rejects with an Error carrying `status` (0 when no answer
 * came back) and `retry` (true when trying again may help: no connection, timeout, server trouble).
 */
async function request(method, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`/api/acknowledgements/${encodeURIComponent(token || '')}`, {
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
    const retry = res.status >= 500 || res.status === 429;
    const fallback = retry ? 'Something went wrong on our side. Please try again in a moment.' : 'Something went wrong.';
    throw Object.assign(new Error(data.message || fallback), { status: res.status, code: data.code, retry });
  }
  return data;
}

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
  const items = [
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

export default function AcknowledgePage() {
  const { token } = useParams();
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [reloadKey, setReloadKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    (async () => {
      try {
        const data = await request('GET', token);
        if (!cancelled) setState({ loading: false, error: null, data });
      } catch (error) {
        if (!cancelled) setState({ loading: false, error, data: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  const submit = useCallback(async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const data = await request('POST', token);
      setState({ loading: false, error: null, data });
    } catch (err) {
      // The link went bad meanwhile (expired, hand-over removed): show that page instead of the form.
      if (!err.retry) setState({ loading: false, error: err, data: null });
      else setSubmitError(`${err.message} It's safe to press the button again.`);
    } finally {
      setSubmitting(false);
    }
  }, [token]);

  let body;
  if (state.loading) {
    body = (
      <div style={{ padding: '48px 0', textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  } else if (state.error) {
    const { status, retry, message } = state.error;
    const expired = status === 410;
    const gone = status === 404;
    body = (
      <Result
        status={expired || retry ? 'warning' : 'error'}
        title={
          expired
            ? 'This link has expired'
            : gone
              ? 'This hand-over no longer exists'
              : retry
                ? "We couldn't load this right now"
                : "This link can't be used"
        }
        subTitle={
          expired
            ? 'Acknowledgement links work for 30 days. Please ask the asset team to send you a new one.'
            : gone
              ? 'The asset or this hand-over has been removed, so there is nothing to acknowledge.'
              : message
        }
        extra={
          <>
            {retry && (
              <Button type="primary" onClick={() => setReloadKey((k) => k + 1)}>
                Try again
              </Button>
            )}
            <Contact />
          </>
        }
      />
    );
  } else {
    const { data } = state;
    const receipt = data.kind === 'receipt';
    const transferred = data.handOver.action === 'Transferred';
    const what = receipt ? 'receipt' : transferred ? 'hand-over' : 'return';
    if (data.status === 'Acknowledged') {
      body = (
        <>
          <Result
            icon={<CheckCircleFilled style={{ color: 'var(--fs-green)' }} />}
            title="Acknowledged — thank you!"
            subTitle={`${person(data.employee)} acknowledged the ${what} of ${data.asset.itemName} (${data.asset.assetId}) on ${formatDateTime(data.acknowledgedAt)}.`}
          />
          <Details data={data} />
          <Contact />
        </>
      );
    } else {
      body = (
        <>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            <SafetyCertificateOutlined /> Asset acknowledgement
          </div>
          <Typography.Title level={3} style={{ marginTop: 0 }}>
            {receipt ? 'Please acknowledge receipt' : `Please acknowledge the ${what}`}
          </Typography.Title>
          <Typography.Paragraph>
            Hi {data.employee.fullName.split(' ')[0]},{' '}
            {receipt
              ? transferred
                ? `the asset below has been handed over to you from ${person(data.handOver.counterpart)}.`
                : `the asset below has been assigned to you.`
              : transferred
                ? `we've recorded that you handed the asset below over to ${person(data.handOver.counterpart)}.`
                : `we've recorded that you returned the asset below.`}{' '}
            Please check the details and confirm.
          </Typography.Paragraph>
          <Details data={data} />
          <Typography.Paragraph type="secondary" style={{ marginTop: 16, fontSize: 13 }}>
            {receipt
              ? 'By acknowledging, you confirm that you have received this asset in the condition stated above, that you will take good care of it, and that you will return it when asked.'
              : 'By acknowledging, you confirm that you no longer have this asset and handed it over as stated above.'}
          </Typography.Paragraph>
          {submitError && <Typography.Paragraph type="danger">{submitError}</Typography.Paragraph>}
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <Button type="primary" size="large" loading={submitting} onClick={submit} style={{ minWidth: 260 }}>
              {receipt ? 'I acknowledge receipt' : `I acknowledge the ${what}`}
            </Button>
          </div>
          <Contact />
        </>
      );
    }
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
    </main>
  );
}
