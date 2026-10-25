'use client';

import { memo } from 'react';
import { Empty } from 'antd';

/**
 * Compact list for the dashboard's "latest / soonest" panels.
 * items: [{ key, title, meta?, aside?, asideMeta?, lead?, onClick? }]
 */
function DashList({ items, emptyText }) {
  if (!items.length) return <Empty className="dash-empty" image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />;
  return (
    <ul className="dash-list">
      {items.map((item) => {
        const body = (
          <>
            {item.lead && <span className="dash-list-lead">{item.lead}</span>}
            <span className="dash-list-main">
              <span className="dash-list-title">{item.title}</span>
              {item.meta && <span className="dash-list-meta">{item.meta}</span>}
            </span>
            {(item.aside || item.asideMeta) && (
              <span className="dash-list-aside">
                {item.aside}
                {item.asideMeta && <span className="dash-list-meta">{item.asideMeta}</span>}
              </span>
            )}
          </>
        );
        return (
          <li key={item.key}>
            {item.onClick ? (
              <button type="button" className="dash-list-row clickable" onClick={item.onClick}>
                {body}
              </button>
            ) : (
              <div className="dash-list-row">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default memo(DashList);
