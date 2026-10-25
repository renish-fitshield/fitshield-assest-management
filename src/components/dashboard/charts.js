'use client';

import dynamic from 'next/dynamic';

/*
 * The chart components, loaded on demand: every in-app page shares one bundle (app/(dashboard)/[[...slug]]),
 * so importing Recharts directly would make the Assets, People… pages download it too.
 * DashboardView calls preloadCharts() on mount, so the chunk loads while the dashboard data is fetched.
 */

const ChartPlaceholder = () => <div className="chart-placeholder" />;

export const ColumnChart = dynamic(() => import('./ColumnChart'), { ssr: false, loading: ChartPlaceholder });
export const HBarChart = dynamic(() => import('./HBarChart'), { ssr: false, loading: ChartPlaceholder });
export const DonutChart = dynamic(() => import('./DonutChart'), { ssr: false, loading: ChartPlaceholder });

export function preloadCharts() {
  // Same specifiers as above, so these resolve to the chunks next/dynamic loads.
  Promise.all([import('./ColumnChart'), import('./HBarChart'), import('./DonutChart')]).catch(() => {
    // A failed preload is retried by next/dynamic when the chart renders.
  });
}
