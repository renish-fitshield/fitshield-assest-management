'use client';

import { memo, useState } from 'react';
import { Card, Empty, Segmented, Table } from 'antd';
import { BarChartOutlined, TableOutlined } from '@ant-design/icons';

const VIEW_OPTIONS = [
  { value: 'chart', icon: <BarChartOutlined />, title: 'Chart view' },
  { value: 'table', icon: <TableOutlined />, title: 'Table view' },
];

/**
 * A dashboard card: title, one-line subtitle, optional controls and — when `table` is given — a
 * Chart/Table switch, so every plotted value can be read without hovering.
 *
 * table: { columns, dataSource, rowKey }
 * empty: true shows `emptyText` instead of the chart (and the switch is hidden).
 */
function ChartCard({ title, subtitle, controls, table, empty, emptyText = 'Nothing matches these filters', footer, className = '', id, children }) {
  const [view, setView] = useState('chart');
  const showTable = Boolean(table) && view === 'table' && !empty;

  return (
    <Card className={`dash-card ${className}`} id={id} styles={{ body: { padding: 0 } }}>
      <div className="dash-card-head">
        <div className="dash-card-heading">
          <h3 className="dash-card-title">{title}</h3>
          {subtitle && <div className="dash-card-sub">{subtitle}</div>}
        </div>
        {(controls || (table && !empty)) && (
          <div className="dash-card-controls">
            {controls}
            {table && !empty && <Segmented size="small" value={view} options={VIEW_OPTIONS} onChange={setView} aria-label={`${title}: chart or table`} />}
          </div>
        )}
      </div>
      <div className="dash-card-body">
        {empty ? (
          <Empty className="dash-empty" image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />
        ) : showTable ? (
          <Table
            className="dash-table"
            size="small"
            pagination={false}
            scroll={{ x: 'max-content', y: 320 }}
            columns={table.columns}
            dataSource={table.dataSource}
            rowKey={table.rowKey}
          />
        ) : (
          children
        )}
      </div>
      {footer && <div className="dash-card-foot">{footer}</div>}
    </Card>
  );
}

export default memo(ChartCard);
