'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { NavLink, navigate } from '@/lib/navigation';
import { useDispatch, useSelector } from 'react-redux';
import { App, Avatar, Button, Dropdown, Grid, Layout, Menu, Spin, Typography } from 'antd';
import {
  AppstoreOutlined,
  DashboardOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SwapOutlined,
  TagsOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import Logo from '@/components/brand/Logo';
import ErrorState from '@/components/ErrorState';
import { logout, restoreSession } from '@/store/authSlice';

const { Sider, Header, Content } = Layout;

const NAV_ITEMS = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: <NavLink href="/dashboard">Dashboard</NavLink> },
  { key: '/assets', icon: <AppstoreOutlined />, label: <NavLink href="/assets">Assets</NavLink> },
  { key: '/assignments', icon: <SwapOutlined />, label: <NavLink href="/assignments">Assignments</NavLink> },
  { key: '/categories', icon: <TagsOutlined />, label: <NavLink href="/categories">Categories</NavLink> },
  { key: '/people', icon: <TeamOutlined />, label: <NavLink href="/people">People</NavLink> },
];

export default function DashboardLayout({ children }) {
  const pathname = usePathname();
  const dispatch = useDispatch();
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();
  const { user, status, error } = useSelector((s) => s.auth);
  const [collapsed, setCollapsed] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const endingSession = useRef(false);

  const retryRestore = useCallback(() => dispatch(restoreSession()), [dispatch]);

  // After a page reload the access token is gone (memory only) — restore it from the refresh cookie.
  useEffect(() => {
    if (status === 'idle') retryRestore();
  }, [status, retryRestore]);

  // Session ended (expired / rejected) → clear the cookie and go to login.
  useEffect(() => {
    if ((status !== 'unauthenticated' && status !== 'expired') || endingSession.current) return;
    endingSession.current = true;
    if (status === 'expired') message.warning('Your session has expired. Please log in again.');
    (async () => {
      try {
        // Clear the cookie too, otherwise middleware would bounce /login back here.
        await dispatch(logout());
      } catch (err) {
        console.error('Logout cleanup failed', err);
      } finally {
        navigate('/login', { replace: true });
      }
    })();
  }, [status, dispatch, message]);

  const handleLogout = useCallback(async () => {
    if (loggingOut) return;
    endingSession.current = true;
    setLoggingOut(true);
    try {
      await dispatch(logout());
      message.success('Logged out');
    } catch (err) {
      // Local state is cleared regardless; the cookie expires on its own.
      message.warning('Logged out locally. The server could not be reached.');
    } finally {
      navigate('/login', { replace: true });
    }
  }, [loggingOut, dispatch, message]);

  const selectedKey = useMemo(() => NAV_ITEMS.find((item) => pathname.startsWith(item.key))?.key, [pathname]);

  const userMenu = useMemo(
    () => ({
      items: [
        {
          key: 'info',
          disabled: true,
          label: (
            <div>
              <div style={{ fontWeight: 600, color: 'rgba(0,0,0,0.88)' }}>{user?.name}</div>
              <div className="muted">{user?.email}</div>
            </div>
          ),
        },
        { type: 'divider' },
        { key: 'logout', icon: <LogoutOutlined />, label: 'Logout', danger: true, disabled: loggingOut },
      ],
      onClick: ({ key }) => key === 'logout' && handleLogout(),
    }),
    [user, loggingOut, handleLogout]
  );

  if (status === 'restoreFailed') {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
        <ErrorState variant="page" title="Couldn't connect" message={error} onRetry={retryRestore} />
      </div>
    );
  }

  if (status !== 'authenticated' || loggingOut) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Spin size="large" tip={loggingOut ? 'Signing out…' : 'Loading your workspace…'}>
          <div style={{ width: 200, height: 60 }} />
        </Spin>
      </div>
    );
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        width={220}
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        breakpoint="lg"
        collapsedWidth={screens.md ? 80 : 0}
        trigger={null}
        style={{ position: 'sticky', top: 0, height: '100vh' }}
      >
        <div className="sider-logo">
          <Logo tone="dark" size={34} subtitle="Asset Management" collapsed={collapsed} />
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={selectedKey ? [selectedKey] : []}
          items={NAV_ITEMS}
          style={{ padding: '12px 8px', borderInlineEnd: 0 }}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            padding: '0 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #eef0f4',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            aria-label="Toggle sidebar"
          />
          <Dropdown menu={userMenu} trigger={['click']} placement="bottomRight">
            <Button type="text" style={{ height: 48, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar size="small" icon={<UserOutlined />} style={{ background: 'var(--fs-green)' }} />
              <span style={{ textAlign: 'left', lineHeight: 1.2 }}>
                <Typography.Text strong style={{ display: 'block' }}>
                  {user.name}
                </Typography.Text>
                <span className="muted">{user.role}</span>
              </span>
            </Button>
          </Dropdown>
        </Header>
        <Content style={{ padding: 24, maxWidth: 1440, width: '100%', margin: '0 auto' }}>{children}</Content>
      </Layout>
    </Layout>
  );
}
