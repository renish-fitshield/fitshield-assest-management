'use client';

import { memo } from 'react';
import { Button, Card } from 'antd';
import { ArrowDownOutlined, ArrowRightOutlined, ArrowUpOutlined, CheckCircleFilled, RightOutlined } from '@ant-design/icons';
import { formatCompactCurrency, formatCount, formatCurrency, formatPercent } from '@/lib/format';
import Meter from './Meter';

/** The dashboard's one hero figure — total asset value — with the numbers that frame it. */
export const HeroCard = memo(function HeroCard({ kpis, filtered, windowLabel, dateFiltered }) {
  const { spend } = kpis;
  let delta = null;
  if (spend.previousValue != null) {
    if (spend.previousValue > 0) {
      const change = (spend.value - spend.previousValue) / spend.previousValue;
      const Icon = change > 0 ? ArrowUpOutlined : change < 0 ? ArrowDownOutlined : ArrowRightOutlined;
      delta = (
        <span className="hero-delta" title={`Previous 12 months: ${formatCurrency(spend.previousValue)}`}>
          <Icon /> {formatPercent(Math.abs(change))} vs previous 12 months
        </span>
      );
    } else if (spend.value > 0) {
      delta = <span className="hero-delta">Nothing bought in the previous 12 months</span>;
    }
  }

  return (
    <Card className="dash-card dash-hero" styles={{ body: { padding: '20px 24px' } }}>
      <div className="hero-label">Total asset value{filtered ? ' · matching filters' : ''}</div>
      <div className="hero-value" title={formatCurrency(kpis.totalValue)}>
        {formatCompactCurrency(kpis.totalValue)}
      </div>
      <div className="hero-exact">{formatCurrency(kpis.totalValue).replace(/\.00$/, '')} total purchase cost</div>
      <dl className="hero-stats">
        <div>
          <dt>Assets</dt>
          <dd>{formatCount(kpis.totalAssets)}</dd>
        </div>
        <div>
          <dt>Units</dt>
          <dd>{formatCount(kpis.totalUnits)}</dd>
        </div>
        <div>
          <dt>Average cost</dt>
          <dd title={formatCurrency(kpis.averageCost)}>{formatCompactCurrency(Math.round(kpis.averageCost))}</dd>
        </div>
      </dl>
      <div className="hero-foot">
        <span>
          <strong>{formatCompactCurrency(spend.value)}</strong> spent on {formatCount(spend.count)} asset{spend.count === 1 ? '' : 's'}{' '}
          {dateFiltered ? 'in the selected period' : `in the last 12 months (${windowLabel})`}
        </span>
        {delta}
      </div>
    </Card>
  );
});

/** How much of the assignable stock is with people, and how much of that is acknowledged. */
export const UsageCard = memo(function UsageCard({ kpis, onReadyToAssign, onPendingAcks }) {
  const ready = kpis.assignableNow;
  const usable = kpis.assigned + ready;
  const acks = kpis.acknowledged + kpis.pendingAcknowledgements;

  return (
    <Card className="dash-card dash-usage" styles={{ body: { padding: 0 } }}>
      <div className="usage-block">
        <div className="usage-head">
          <span className="usage-label">Assets in use</span>
          <span className="usage-value">{usable ? formatPercent(kpis.utilization) : '—'}</span>
        </div>
        <Meter value={kpis.utilization} label="Assets in use" />
        <div className="usage-note">
          {usable ? (
            <>
              {formatCount(kpis.assigned)} of {formatCount(usable)} assignable assets are with employees
              {ready > 0 && (
                <>
                  {' · '}
                  <Button type="link" size="small" className="inline-link" onClick={onReadyToAssign}>
                    {formatCount(ready)} ready to assign
                  </Button>
                </>
              )}
            </>
          ) : (
            'No single-unit assets available to assign'
          )}
        </div>
      </div>
      <div className="usage-block">
        <div className="usage-head">
          <span className="usage-label">Receipt acknowledged</span>
          <span className="usage-value">{acks ? formatPercent(kpis.acknowledgementRate) : '—'}</span>
        </div>
        <Meter value={kpis.acknowledgementRate} tone="good" label="Receipt acknowledged" />
        <div className="usage-note">
          {acks ? (
            <>
              {formatCount(kpis.acknowledged)} acknowledged
              {kpis.pendingAcknowledgements > 0 && (
                <>
                  {' · '}
                  <Button type="link" size="small" className="inline-link" onClick={onPendingAcks}>
                    {formatCount(kpis.pendingAcknowledgements)} awaiting
                  </Button>
                </>
              )}
            </>
          ) : (
            'No assets are with employees right now'
          )}
        </div>
      </div>
    </Card>
  );
});

/**
 * Everything that needs someone to act, each with its count and a way to it.
 * items: [{ key, label, count, tone: 'critical' | 'serious' | 'warning', icon, onClick }]
 */
export const AttentionCard = memo(function AttentionCard({ items }) {
  const open = items.filter((i) => i.count > 0).length;
  return (
    <Card className="dash-card dash-attention" styles={{ body: { padding: 0 } }}>
      <div className="attention-head">
        <span className="usage-label">Needs attention</span>
        <span className={`attention-total${open ? '' : ' clear'}`}>{open ? `${open} open` : 'All clear'}</span>
      </div>
      <ul className="attention-list">
        {items.map((item) => {
          const clear = item.count === 0;
          return (
            <li key={item.key}>
              <button type="button" className={`attention-row${clear ? ' clear' : ''}`} onClick={item.onClick} disabled={clear}>
                <span className={`attention-icon tone-${clear ? 'good' : item.tone}`}>{clear ? <CheckCircleFilled /> : item.icon}</span>
                <span className="attention-label">{item.label}</span>
                <span className="attention-count">{formatCount(item.count)}</span>
                {!clear && <RightOutlined className="attention-go" />}
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
});
