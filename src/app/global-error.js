'use client';

import { useEffect } from 'react';

// Last-resort boundary (replaces the root layout), so it cannot rely on antd or app styles.
export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error('[ui] app crashed:', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'Roboto, -apple-system, Segoe UI, Arial, sans-serif',
          background: '#F7F9F7',
          color: '#141414',
        }}
      >
        <div style={{ textAlign: 'center', padding: 24, maxWidth: 420 }}>
          <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>Something went wrong</h1>
          <p style={{ color: '#6B7280', margin: '0 0 20px' }}>
            The app hit an unexpected error. Please try again.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              background: '#33A02C',
              color: '#fff',
              border: 0,
              borderRadius: 999,
              padding: '10px 22px',
              fontSize: 15,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
