'use client';

import { memo } from 'react';

/**
 * HTML legend: a swatch beside ink-coloured text (text never wears the series colour).
 * items: [{ key, name, color, value? }]. With onSelect, each item is a button (click-to-filter);
 * `activeKey` marks the selected one.
 */
function ChartLegend({ items, onSelect, activeKey, layout = 'row' }) {
  return (
    <ul className={`chart-legend ${layout}`}>
      {items.map((item) => {
        const content = (
          <>
            <span className="chart-legend-swatch" style={{ background: item.color }} />
            <span className="chart-legend-name">{item.name}</span>
            {item.value != null && <span className="chart-legend-value">{item.value}</span>}
          </>
        );
        return (
          <li key={item.key}>
            {onSelect && !item.disabled ? (
              <button
                type="button"
                className={`chart-legend-item clickable${activeKey === item.key ? ' active' : ''}`}
                aria-pressed={activeKey === item.key}
                onClick={() => onSelect(item)}
              >
                {content}
              </button>
            ) : (
              <span className="chart-legend-item">{content}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default memo(ChartLegend);
