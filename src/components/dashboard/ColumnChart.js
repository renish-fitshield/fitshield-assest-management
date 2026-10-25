'use client';

import { memo, useMemo } from 'react';
import { Bar, BarChart, BarStack, CartesianGrid, LabelList, Rectangle, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCount, formatCompactCount } from '@/lib/format';
import ChartTooltip from './ChartTooltip';
import ChartLegend from './ChartLegend';
import { AXIS_TICK, BAR_RADIUS_UP, BAR_SIZE, CURSOR, GRID, INK, SURFACE, axisProps, valueAxisProps } from './chartTheme';

const NICE_STEPS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

/** Smallest "round" number ≥ value (92,000 → 1,00,000; 8.1L → 10L), so axis ticks stay clean. */
function niceCeil(value) {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return NICE_STEPS.find((step) => step * magnitude >= value) * magnitude;
}

/**
 * Vertical columns over a category/time axis.
 *
 * data     — rows, one per column ({ [xKey]: 'Oct 26', [series.key]: number, … })
 * series   — [{ key, name, color }]; more than one + `stacked` draws a stacked column with a legend
 * colorFor — single series only: colour each column by its row (ordinal buckets)
 * labelPeak — write the value on the tallest column (the rest live on the axis, tooltip and table)
 */
function ColumnChart({
  data,
  xKey = 'label',
  series,
  stacked = false,
  colorFor,
  height = 240,
  valueFormat = formatCount,
  tickFormat = formatCompactCount,
  tooltipFooter,
  tooltipTitle,
  labelPeak = false,
  onSelect,
}) {
  // The tallest column's value (0 = nothing to label). Labels are matched by value, not index:
  // Recharts skips zero-height bars, so label indexes don't line up with the data.
  const peak = useMemo(() => {
    if (!labelPeak || stacked) return 0;
    return Math.max(0, ...data.map((row) => row[series[0].key] || 0));
  }, [labelPeak, stacked, series, data]);

  // The whole row band is the hit target (not just the painted bar), via the chart's hovered index.
  const handleClick = onSelect
    ? (state) => {
        const row = data[Number(state?.activeTooltipIndex)];
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
      maxBarSize={BAR_SIZE}
      radius={stacked ? 0 : BAR_RADIUS_UP}
      // A surface-coloured edge keeps a 2px gap between stacked segments.
      stroke={stacked ? SURFACE : undefined}
      strokeWidth={stacked ? 2 : 0}
      shape={colored}
      activeBar={colored ? undefined : { fillOpacity: 0.82 }}
      animationDuration={450}
    >
      {peak > 0 && (
        <LabelList
          dataKey={s.key}
          content={({ viewBox, value }) =>
            value === peak && viewBox ? (
              <text
                x={viewBox.x + (viewBox.width ?? viewBox.upperWidth ?? 0) / 2}
                y={viewBox.y - 6}
                textAnchor="middle"
                fill={INK.primary}
                fontSize={12}
                fontWeight={600}
              >
                {valueFormat(value)}
              </text>
            ) : null
          }
        />
      )}
    </Bar>
  ));

  return (
    <div className="dash-chart">
      {(stacked || series.length > 1) && <ChartLegend items={series.map((s) => ({ key: s.key, name: s.name, color: s.color }))} />}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          margin={{ top: 22, right: 4, bottom: 0, left: 0 }}
          barCategoryGap="24%"
          onClick={handleClick}
          style={onSelect ? { cursor: 'pointer' } : undefined}
        >
          <CartesianGrid vertical={false} {...GRID} />
          <XAxis dataKey={xKey} {...axisProps} interval="preserveStartEnd" minTickGap={6} />
          <YAxis
            {...valueAxisProps}
            width="auto"
            tick={AXIS_TICK}
            tickFormatter={tickFormat}
            allowDecimals={false}
            // Headroom so the peak's label isn't clipped when the peak sits on the top gridline.
            domain={peak > 0 ? [0, niceCeil(peak * 1.12)] : undefined}
          />
          <Tooltip
            cursor={CURSOR}
            content={<ChartTooltip valueFormat={valueFormat} colorFor={colorFor} footer={tooltipFooter} title={tooltipTitle} />}
          />
          {stacked ? <BarStack radius={BAR_RADIUS_UP}>{bars}</BarStack> : bars}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default memo(ColumnChart);
