'use client';

import { memo, useMemo, useState } from 'react';
import { Pie, PieChart, ResponsiveContainer, Sector } from 'recharts';
import { formatCount, formatPercent } from '@/lib/format';
import ChartLegend from './ChartLegend';
import { SURFACE } from './chartTheme';

/**
 * Part-to-whole at a glance (≤ 6 parts). The centre shows the total, or the hovered part's count and
 * share; the legend beside it lists every part's name, count and share, so nothing depends on reading
 * slice angles or colour alone.
 *
 * data — [{ key, name, count, color }]
 */
function DonutChart({ data, total, totalLabel, size = 184, onSelect, activeKey }) {
  const [hovered, setHovered] = useState(null);
  const slices = useMemo(() => data.filter((d) => d.count > 0), [data]);
  const legend = useMemo(
    () =>
      data.map((d) => ({
        key: d.key,
        name: d.name,
        color: d.color,
        value: `${formatCount(d.count)} · ${formatPercent(total ? d.count / total : 0)}`,
        disabled: !d.count && activeKey !== d.key,
      })),
    [data, total, activeKey]
  );

  return (
    <div className="donut">
      <div className="donut-plot" style={{ width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="count"
              nameKey="name"
              innerRadius="66%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              stroke={SURFACE}
              strokeWidth={2}
              cornerRadius={2}
              shape={({ key, ...props }) => (
                <Sector
                  key={key}
                  {...props}
                  fill={props.payload?.color ?? props.fill}
                  fillOpacity={hovered && props.payload?.key !== hovered.key ? 0.4 : 1}
                />
              )}
              cursor={onSelect ? 'pointer' : undefined}
              onClick={onSelect ? (slice) => onSelect(slice?.payload ?? slice) : undefined}
              onMouseEnter={(slice) => setHovered(slice?.payload ?? slice)}
              onMouseLeave={() => setHovered(null)}
              animationDuration={450}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center" aria-live="polite">
          {hovered ? (
            <>
              <div className="donut-total">{formatCount(hovered.count)}</div>
              <div className="donut-label">
                {hovered.name} · {formatPercent(total ? hovered.count / total : 0)}
              </div>
            </>
          ) : (
            <>
              <div className="donut-total">{formatCount(total)}</div>
              <div className="donut-label">{totalLabel}</div>
            </>
          )}
        </div>
      </div>
      <ChartLegend layout="column" items={legend} onSelect={onSelect} activeKey={activeKey} />
    </div>
  );
}

export default memo(DonutChart);
