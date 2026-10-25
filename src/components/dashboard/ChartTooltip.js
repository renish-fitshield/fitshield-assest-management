'use client';

import { formatCount } from '@/lib/format';

/**
 * Tooltip content for every dashboard chart (pass as `<Tooltip content={<ChartTooltip … />} />`).
 * Lists every series at the hovered position: value first (strong), series name second, keyed by a
 * short line in the series colour. Text is rendered as React text, never HTML.
 *
 * valueFormat(value, entry) — how values read (default: counts)
 * colorFor(datum)           — per-bar colour when the chart colours bars by category
 * footer(datum)             — optional extra line (e.g. total value)
 */
export default function ChartTooltip({ active, payload, label, valueFormat = formatCount, colorFor, footer, title }) {
  if (!active || !payload?.length) return null;
  const datum = payload[0].payload || {};
  const heading = title ? title(datum, label) : label ?? datum.name;

  return (
    <div className="chart-tip" role="status">
      {heading != null && <div className="chart-tip-title">{heading}</div>}
      {payload.map((entry) => (
        <div className="chart-tip-row" key={entry.dataKey ?? entry.name}>
          <span className="chart-tip-key" style={{ background: colorFor?.(datum) ?? entry.payload?.color ?? entry.color ?? entry.fill }} />
          <span className="chart-tip-value">{valueFormat(entry.value, entry)}</span>
          <span className="chart-tip-name">{entry.name}</span>
        </div>
      ))}
      {footer && <div className="chart-tip-foot">{footer(datum)}</div>}
    </div>
  );
}
