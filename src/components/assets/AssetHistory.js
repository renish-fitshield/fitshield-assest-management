'use client';

import { Button, Empty, Tag, Timeline, Tooltip } from 'antd';
import {
  CameraOutlined,
  CheckCircleOutlined,
  EditOutlined,
  MailOutlined,
  PlusCircleOutlined,
  RollbackOutlined,
  SwapOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import StatusTag from '@/components/StatusTag';
import CompactCurrency from '@/components/CompactCurrency';
import { ASSET_DATE_FIELDS, ASSET_FIELD_LABELS } from '@/lib/constants';
import { formatDate, formatDateTime } from '@/lib/format';

const holderText = (h) => (h ? `${h.fullName}${h.employeeId ? ` (${h.employeeId})` : ''}` : 'Unknown employee');
const recorded = (entry) => `${entry.by?.name || 'Unknown user'} · ${formatDateTime(entry.at)}`;
const empty = (text) => <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={text} />;

const ACTION_DOT = {
  Created: { color: 'green', dot: <PlusCircleOutlined /> },
  Updated: { color: 'blue', dot: <EditOutlined /> },
  Assigned: { color: 'green', dot: <UserAddOutlined /> },
  Transferred: { color: 'blue', dot: <SwapOutlined /> },
  Returned: { color: 'orange', dot: <RollbackOutlined /> },
  Acknowledged: { color: 'green', dot: <CheckCircleOutlined /> },
};

function Value({ field, value }) {
  if (value === null || value === undefined || value === '') return '—';
  if (field === 'cost') return <CompactCurrency value={value} />;
  if (ASSET_DATE_FIELDS.includes(field)) return formatDate(value);
  return String(value);
}

function Change({ change }) {
  const { field, before, after } = change;
  if (field === 'image') {
    const text = before && after ? 'Photo replaced' : after ? 'Photo added' : 'Photo removed';
    return (
      <li>
        <CameraOutlined /> {text}
      </li>
    );
  }
  return (
    <li>
      <span className="field">{ASSET_FIELD_LABELS[field] || field}:</span>{' '}
      {before !== null && before !== undefined && before !== '' && (
        <>
          <span className="before">
            <Value field={field} value={before} />
          </span>{' '}
          →{' '}
        </>
      )}
      <span className="after">
        <Value field={field} value={after} />
      </span>
    </li>
  );
}

const ACTIVITY_TITLE = { Created: 'Asset added', Updated: 'Details updated' };

/** Every change to the asset, newest first: who, when, and each field's before → after. */
export function ActivityTimeline({ items, createdAt }) {
  // Assets added before activity tracking started have no "Created" entry; show when they were added.
  const tracked = items.some((a) => a.action === 'Created');
  const entries = items.map((a) => ({
    key: a._id,
    ...ACTION_DOT[a.action],
    children: (
      <div>
        <div className="history-entry-title">{ACTIVITY_TITLE[a.action] || a.note || a.action}</div>
        <div className="history-meta">{recorded(a)}</div>
        {a.action === 'Created' && a.note && <div className="history-note">{a.note}</div>}
        {a.changes?.length > 0 && (
          <ul className="history-changes">
            {a.changes.map((c) => (
              <Change key={c.field} change={c} />
            ))}
          </ul>
        )}
      </div>
    ),
  }));
  if (!tracked && createdAt) {
    entries.push({
      key: 'created',
      color: 'gray',
      dot: <PlusCircleOutlined />,
      children: (
        <div>
          <div className="history-entry-title">Asset added</div>
          <div className="history-meta">{formatDateTime(createdAt)} · before activity tracking started</div>
        </div>
      ),
    });
  }
  return entries.length ? <Timeline items={entries} /> : empty('No activity yet');
}

function AssignmentTitle({ event }) {
  if (event.action === 'Assigned') {
    return (
      <>
        Assigned to <strong>{holderText(event.to)}</strong>
      </>
    );
  }
  if (event.action === 'Transferred') {
    return (
      <>
        Transferred from <strong>{holderText(event.from)}</strong> to <strong>{holderText(event.to)}</strong>
      </>
    );
  }
  return (
    <>
      Returned by <strong>{holderText(event.from)}</strong>
    </>
  );
}

/**
 * One employee's acknowledgement of a hand-over: status, email delivery, and "Resend email" while pending.
 * `compact` (for tables) keeps it to one short line; the delivery details move into a tooltip.
 */
export function AckLine({ label, ack, onResend, resending, compact = false }) {
  if (!ack) return null;
  const done = ack.status === 'Acknowledged';
  const email = ack.email;
  const notDelivered = email && (email.status === 'Failed' || email.testOnly);
  if (compact) {
    const detail = done
      ? `Acknowledged on ${formatDateTime(ack.acknowledgedAt)}`
      : !email
        ? 'Email not sent yet'
        : email.status !== 'Sent'
          ? `Email failed: ${email.error}`
          : email.testOnly
            ? `Not delivered to ${email.to}: email isn't set up yet, so it went to a test inbox`
            : `Email sent to ${email.to} · ${formatDateTime(email.sentAt)}`;
    return (
      <div className="ack-line">
        <Tooltip title={detail}>
          <span className="ack-line">
            <span>{label}</span> <StatusTag value={ack.status} />
            {!done && notDelivered && <MailOutlined className="overdue-text" />}
          </span>
        </Tooltip>
        {!done && onResend && (
          <Button size="small" type="link" icon={<MailOutlined />} loading={resending} onClick={onResend} style={{ paddingInline: 2 }}>
            Resend
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="ack-line">
      <span>{label}</span> <StatusTag value={ack.status} />
      {done ? (
        <span className="muted">on {formatDateTime(ack.acknowledgedAt)}</span>
      ) : !email ? (
        <span className="muted">email not sent yet</span>
      ) : email.status === 'Sent' && email.testOnly ? (
        <Tooltip title="Email isn't set up yet (no SMTP settings), so this went to a test inbox instead of the employee. Add the SMTP settings, then resend.">
          <span className="overdue-text">
            <MailOutlined /> not delivered to {email.to} — email isn&apos;t set up
          </span>
        </Tooltip>
      ) : email.status === 'Sent' ? (
        <span className="muted">
          <MailOutlined /> sent to {email.to} · {formatDateTime(email.sentAt)}
          {ack.emailAttempts > 1 ? ` (${ack.emailAttempts} times)` : ''}
        </span>
      ) : (
        <Tooltip title={email.error}>
          <span className="overdue-text">
            <MailOutlined /> email failed{email.to ? ` to ${email.to}` : ''}
          </span>
        </Tooltip>
      )}
      {!done && onResend && (
        <Button size="small" type="link" icon={<MailOutlined />} loading={resending} onClick={onResend} style={{ paddingInline: 4 }}>
          Resend email
        </Button>
      )}
      {email?.previewUrl && (
        <a href={email.previewUrl} target="_blank" rel="noreferrer" className="muted" style={{ marginLeft: 4 }}>
          (test inbox)
        </a>
      )}
    </div>
  );
}

/**
 * Every hand-over, newest first. `currentHolderId` marks the entry that's still in effect.
 * `onResend(eventId, side)` resends an acknowledgement email; `resending` is "eventId:side" while it runs.
 */
export function AssignmentTimeline({ items, currentHolderId, onResend, resending }) {
  if (!items.length) return empty('Never assigned');
  return (
    <Timeline
      items={items.map((e, i) => {
        const current = i === 0 && e.action !== 'Returned' && currentHolderId && String(e.to?.employee) === String(currentHolderId);
        return {
          key: e._id,
          ...ACTION_DOT[e.action],
          children: (
            <div>
              <div className="history-entry-title">
                <AssignmentTitle event={e} />
                {current && (
                  <Tag color="green" style={{ marginLeft: 8 }}>
                    Current
                  </Tag>
                )}
              </div>
              <div style={{ fontSize: 13, marginTop: 4 }}>
                On {formatDate(e.date)}
                {e.condition && (
                  <>
                    {' · '}condition <StatusTag value={e.condition} />
                  </>
                )}
                {e.action === 'Returned' && e.statusAfter && (
                  <>
                    {' · '}now <StatusTag value={e.statusAfter} />
                  </>
                )}
                {e.expectedReturnAt && <> · due back {formatDate(e.expectedReturnAt)}</>}
              </div>
              {e.notes && <div className="history-note">“{e.notes}”</div>}
              {(e.toAck || e.fromAck) && (
                <div className="ack-lines">
                  <AckLine
                    label={`${e.from?.fullName || 'Previous holder'} — ${e.action === 'Transferred' ? 'hand-over' : 'return'}`}
                    ack={e.fromAck}
                    onResend={onResend && (() => onResend(e._id, 'from'))}
                    resending={resending === `${e._id}:from`}
                  />
                  <AckLine
                    label={`${e.to?.fullName || 'New holder'} — receipt`}
                    ack={e.toAck}
                    onResend={onResend && (() => onResend(e._id, 'to'))}
                    resending={resending === `${e._id}:to`}
                  />
                </div>
              )}
              <div className="history-meta">Recorded by {recorded(e)}</div>
            </div>
          ),
        };
      })}
    />
  );
}
