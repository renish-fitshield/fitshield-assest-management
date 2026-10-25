'use client';

import { memo, useMemo } from 'react';
import { Bar, BarChart, BarStack, Rectangle, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCount } from '@/lib/format';
import ChartTooltip from './ChartTooltip';
import ChartLegend from './ChartLegend';
import { AXIS_TICK, BAR_RADIUS_RIGHT, BAR_SIZE, CURSOR, INK, SURFACE } from './chartTheme';

const CHAR_PX = 6.6; // average glyph width at 12px

/** Category label on the left axis, shortened to fit (full name on hover). */
function CategoryTick({ x, y, payload, width }) {
  const text = String(payload.value ?? '');
  const max = Math.max(4, Math.floor((width - 10) / CHAR_PX));
  const shown = text.length > max ? `${text.slice(0, max - 1)}…` : text;
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fill={INK.secondary} fontSize={12}>
      <title>{text}</title>
      {shown}
    </text>
  );
}

/**
 * Horizontal bars, one row per category — the form for long or many category names.
 * The row total sits in a right-hand column (aligned figures), so the value axis is omitted
 * (grouped bars leave it out; the tooltip and the card's table view carry their values).
 *
 * series   — [{ key, name, color }]; several + `stacked` draws a stacked bar with a legend,
 *            several without `stacked` draws grouped bars
 * colorFor — single series only: colour each bar by its row
 * totalFor — the number in the right column (default: sum of the series)
 */
function HBarChart({
  data,
  categoryKey = 'name',
  series,
  stacked = false,
  colorFor,
  valueFormat = formatCount,
  totalFor,
  totalFormat = valueFormat,
  rowHeight,
  categoryWidth = 120,
  tooltipFooter,
  onSelect,
}) {
  const grouped = series.length > 1 && !stacked;
  const perRow = rowHeight || (grouped ? 46 : 34);
  const rows = useMemo(
    () =>
      data.map((row) => ({
        ...row,
        __total: totalFor ? totalFor(row) : series.reduce((n, s) => n + (row[s.key] || 0), 0),
      })),
    [data, series, totalFor]
  );

  // The whole row band is the hit target (not just the painted bar), via the chart's hovered index.
  const handleClick = onSelect
    ? (state) => {
        const row = rows[Number(state?.activeTooltipIndex)];
        if (row) onSelect(row);
      }
    : undefined;
  const colored = colorFor
    ? ({ key, ...props }) => <Rectangle key={key} {...props} fill={colorFor(props.payload)} fillOpacity={props.isActive ? 0.82 : 1} />
    : undefined;

  const bars = series.map((s) => (
    <Bar
      key={s.key}
      dataKey={s.key}
      name={s.name}
      fill={s.color}
      maxBarSize={grouped ? 14 : BAR_SIZE}
      radius={stacked ? 0 : BAR_RADIUS_RIGHT}
      stroke={stacked || grouped ? SURFACE : undefined}
      strokeWidth={stacked || grouped ? 2 : 0}
      shape={colored}
      activeBar={colored ? undefined : { fillOpacity: 0.82 }}
      animationDuration={450}
    />
  ));

  return (
    <div className="dash-chart">
      {(stacked || series.length > 1) && <ChartLegend items={series.map((s) => ({ key: s.key, name: s.name, color: s.color }))} />}
      <ResponsiveContainer width="100%" height={rows.length * perRow + 4}>
        <BarChart
          layout="vertical"
          data={rows}
          margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
          barCategoryGap={grouped ? '18%' : '26%'}
          barGap={0}
          onClick={handleClick}
          style={onSelect ? { cursor: 'pointer' } : undefined}
        >
          <XAxis type="number" hide domain={[0, 'dataMax']} />
          <YAxis
            type="category"
            dataKey={categoryKey}
            width={categoryWidth}
            interval={0}
            tickLine={false}
            axisLine={{ stroke: INK.axis }}
            tick={<CategoryTick width={categoryWidth} />}
          />
          {/* Grouped bars have no single total; their values are in the tooltip and table view. */}
          {!grouped && (
            <YAxis
              yAxisId="total"
              orientation="right"
              type="category"
              dataKey="__total"
              width="auto"
              interval={0}
              tickLine={false}
              axisLine={false}
              tick={{ ...AXIS_TICK, fill: INK.primary, fontWeight: 600 }}
              tickFormatter={totalFormat}
            />
          )}
          <Tooltip cursor={CURSOR} content={<ChartTooltip valueFormat={valueFormat} colorFor={colorFor} footer={tooltipFooter} />} />
          {stacked ? <BarStack radius={BAR_RADIUS_RIGHT}>{bars}</BarStack> : bars}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default memo(HBarChart);
