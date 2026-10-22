'use client';

import { Card, Skeleton } from 'antd';

/** Shown during route transitions between dashboard pages. */
export default function DashboardLoading() {
  return (
    <Card>
      <Skeleton active title={{ width: 220 }} paragraph={{ rows: 10 }} />
    </Card>
  );
}
