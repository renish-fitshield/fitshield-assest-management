'use client';

import { usePathname } from 'next/navigation';
import { Button, Card, Result } from 'antd';
import DashboardView from '@/views/DashboardView';
import AssetsView from '@/views/AssetsView';
import PeopleView from '@/views/PeopleView';
import { NavLink } from '@/lib/navigation';

const VIEWS = {
  '/dashboard': DashboardView,
  '/assets': AssetsView,
  '/people': PeopleView,
};

/**
 * Single route for every in-app page. The view is picked from the pathname, which changes
 * via history.pushState (see lib/navigation.js) — so moving between pages makes no
 * `?_rsc=` request; only the JSON APIs are called.
 */
export default function AppViews() {
  const pathname = usePathname();
  const path = pathname === '/' ? '/dashboard' : pathname.replace(/\/+$/, '');
  const View = VIEWS[path];

  if (!View) {
    return (
      <Card>
        <Result
          status="404"
          title="Page not found"
          subTitle="The page you are looking for doesn't exist."
          extra={
            <NavLink href="/dashboard">
              <Button type="primary">Go to dashboard</Button>
            </NavLink>
          }
        />
      </Card>
    );
  }
  return <View />;
}
