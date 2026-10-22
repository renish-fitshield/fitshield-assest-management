'use client';

import { memo } from 'react';
import { Empty, Tooltip, theme } from 'antd';

/**
 * Single-series horizontal bars (magnitude by category). Labels and values are text,
 * so identity never depends on colour; each row has a hover tooltip and can be clickable.
 *
 * items: [{ key, label, count, tooltip?, active? }]
 */
function BarList({ items, onSelect, emptyText = 'No data', hideZero = false }) {
  const { token } = theme.useToken();
  const rows = hideZero ? items.filter((i) => i.count > 0) : items;
  const max = Math.max(1, ...rows.map((i) => i.count));

  if (!rows.length || rows.every((i) => i.count === 0)) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />;
  }

  return (
    <ul className="bar-list">
      {rows.map((item) => {
        const pct = (item.count / max) * 100;
        const row = (
          <li
            key={item.key}
            className={`bar-row${onSelect ? ' clickable' : ''}${item.active ? ' active' : ''}`}
            onClick={onSelect ? () => onSelect(item) : undefined}
            role={onSelect ? 'button' : undefined}
            tabIndex={onSelect ? 0 : undefined}
            onKeyDown={onSelect ? (e) => (e.key === 'Enter' || e.key === ' ') && onSelect(item) : undefined}
          >
            <div className="bar-row-head">
              <span className="bar-label">{item.label}</span>
              <span className="bar-value">{item.count}</span>
            </div>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{ width: item.count ? `max(${pct}%, 4px)` : 0, background: token.colorPrimary }}
              />
            </div>
          </li>
        );
        return item.tooltip ? (
          <Tooltip key={item.key} title={item.tooltip} placement="topLeft">
            {row}
          </Tooltip>
        ) : (
          row
        );
      })}
    </ul>
  );
}

export default memo(BarList);
