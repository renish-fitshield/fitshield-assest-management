'use client';

import { memo, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Segmented, Tooltip, theme } from 'antd';
import { formatCurrency } from '@/lib/format';

const compactInr = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });

function niceMax(value) {
  if (value <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * pow >= value);
  return step * pow;
}

/** Purchases per month — one measure at a time (spend or count), never a dual axis. */
function MonthlyChart({ data }) {
  const { token } = theme.useToken();
  const [measure, setMeasure] = useState('value');

  const { max, ticks, empty } = useMemo(() => {
    const values = data.map((d) => d[measure]);
    const top = niceMax(Math.max(0, ...values));
    return { max: top, ticks: [top, top / 2, 0], empty: values.every((v) => v === 0) };
  }, [data, measure]);
  const fmt = (v) => (measure === 'value' ? `₹${compactInr.format(v)}` : compactInr.format(v));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Segmented
          size="small"
          value={measure}
          onChange={setMeasure}
          options={[
            { label: 'Spend (₹)', value: 'value' },
            { label: 'Assets bought', value: 'count' },
          ]}
        />
      </div>
      <div className="month-chart">
        <div className="month-axis">
          {ticks.map((t) => (
            <span key={t} style={{ bottom: `${(t / max) * 100}%` }}>
              {fmt(t)}
            </span>
          ))}
        </div>
        <div className="month-plot">
          <div className="month-grid-layer">
            {ticks.map((t) => (
              <div key={t} className="month-grid" style={{ bottom: `${(t / max) * 100}%` }} />
            ))}
          </div>
          {empty && <div className="month-empty">No purchases in this period</div>}
          {data.map((d) => {
            const label = dayjs(`${d.month}-01`).format('MMM YYYY');
            return (
              <Tooltip
                key={d.month}
                title={
                  <div>
                    <div style={{ fontWeight: 600 }}>{label}</div>
                    <div>Spend: {formatCurrency(d.value)}</div>
                    <div>Assets bought: {d.count}</div>
                  </div>
                }
              >
                <div className="month-col" aria-label={`${label}: ${formatCurrency(d.value)}, ${d.count} assets`}>
                  <div
                    className="month-bar"
                    style={{
                      height: d[measure] ? `max(${(d[measure] / max) * 100}%, 3px)` : 0,
                      background: token.colorPrimary,
                    }}
                  />
                  <span className="month-label">{dayjs(`${d.month}-01`).format('MMM')}</span>
                </div>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default memo(MonthlyChart);
