'use client';

import { Button, Result } from 'antd';

export default function NotFound() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <Result
        status="404"
        title="Page not found"
        subTitle="The page you are looking for doesn't exist or was moved."
        extra={
          <Button type="primary" href="/dashboard">
            Go to dashboard
          </Button>
        }
      />
    </main>
  );
}
