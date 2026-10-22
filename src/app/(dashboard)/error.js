'use client';

import { useEffect } from 'react';
import { Button, Card, Result, Space } from 'antd';

/** Catches render errors inside dashboard pages; the sidebar and header stay usable. */
export default function DashboardError({ error, reset }) {
  useEffect(() => {
    console.error('[ui] page crashed:', error);
  }, [error]);

  return (
    <Card>
      <Result
        status="error"
        title="This page ran into a problem"
        subTitle="Something unexpected happened while showing this page. You can try again or go back to the dashboard."
        extra={
          <Space>
            <Button type="primary" onClick={() => reset()}>
              Try again
            </Button>
            {/* Full reload: a fresh start is the point after a crash */}
            <Button href="/dashboard">Go to dashboard</Button>
          </Space>
        }
      />
    </Card>
  );
}
