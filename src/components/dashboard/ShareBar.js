'use client';

import { memo } from 'react';
import { Tooltip } from 'antd';
import { formatCount, formatPercent } from '@/lib/format';

/**
 * One 100% stacked bar (part-to-whole) with 2px gaps between parts, plus a legend that lists
 * each part's icon, name, count and share — so the state never rests on colour alone.
 *
 * parts — [{ key, name, count, color, icon? }]
 */
function ShareBar({ parts, total, onSelect, activeKey, isSelectable = () => true }) {
  return (
    <div className="share">
      <div className="share-bar" role="img" aria-label={parts.map((p) => `${p.name} ${p.count}`).join(', ')}>
        {parts
          .filter((p) => p.count > 0)
          .map((p) => (
            <Tooltip key={p.key} title={`${p.name}: ${formatCount(p.count)} (${formatPercent(p.count / total)})`}>
              <span className="share-seg" style={{ flexGrow: p.count, background: p.color }} />
            </Tooltip>
          ))}
      </div>
      <ul className="share-legend">
        {parts.map((p) => {
          const clickable = onSelect && isSelectable(p) && (p.count > 0 || activeKey === p.key);
          const Tag = clickable ? 'button' : 'div';
          return (
            <li key={p.key}>
              <Tag
                type={clickable ? 'button' : undefined}
                className={`share-row${clickable ? ' clickable' : ''}${activeKey === p.key ? ' active' : ''}`}
                onClick={clickable ? () => onSelect(p) : undefined}
                aria-pressed={clickable ? activeKey === p.key : undefined}
              >
                <span className="share-swatch" style={{ background: p.color }} />
                {p.icon && <span className="share-icon">{p.icon}</span>}
                <span className="share-name">{p.name}</span>
                <span className="share-count">{formatCount(p.count)}</span>
                <span className="share-pct">{formatPercent(total ? p.count / total : 0)}</span>
              </Tag>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default memo(ShareBar);
