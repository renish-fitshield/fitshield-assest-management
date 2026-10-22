'use client';

import { useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { App, Alert, Button, Form, Input, Typography } from 'antd';
import { AppstoreOutlined, LockOutlined, MailOutlined, TeamOutlined } from '@ant-design/icons';
import Logo from '@/components/brand/Logo';
import { clearAuthError, login } from '@/store/authSlice';
import { consumeNotice } from '@/lib/notice';

const FEATURES = [
  { icon: <AppstoreOutlined />, title: 'Every asset, by category', text: 'Laptops, monitors, phones, furniture and more.' },
  { icon: <TeamOutlined />, title: 'People in one place', text: 'Employee records with department and work type.' },
  { icon: <LockOutlined />, title: 'Restricted access', text: 'Only Admin, CTO and HR can sign in.' },
];

function LoginForm() {
  const dispatch = useDispatch();
  const { message } = App.useApp();
  const { status, error } = useSelector((s) => s.auth);

  useEffect(() => {
    try {
      if (consumeNotice() === 'session-expired') message.warning('Your session has expired. Please log in again.');
    } catch (err) {
      console.error('Could not read login notice', err);
    }
  }, [message]);

  const onFinish = useCallback(
    async (values) => {
      try {
        const session = await dispatch(login({ email: values.email.trim().toLowerCase(), pin: values.pin })).unwrap();
        message.success(`Welcome, ${session.user.name}`);
        // Full page load into the app route (no ?_rsc= request); the session is restored from the cookie.
        window.location.replace('/dashboard');
      } catch (err) {
        // The error is also shown in the Alert above the form (from the auth slice).
        if (!err?.message) message.error('Login failed. Please try again.');
      }
    },
    [dispatch, message]
  );

  const onValuesChange = useCallback(() => {
    if (error) dispatch(clearAuthError());
  }, [error, dispatch]);

  return (
    <div className="login-shell">
      <aside className="login-aside">
        <Logo tone="dark" size={40} subtitle="Asset Management" />
        <div>
          <h1 className="login-aside-title">
            Every asset, <em>accounted for.</em>
          </h1>
          <p className="login-aside-text">Track company assets and the people who use them.</p>
          <ul className="login-features">
            {FEATURES.map((f) => (
              <li key={f.title}>
                <span className="login-feature-icon">{f.icon}</span>
                <span>
                  <strong>{f.title}</strong>
                  <span>{f.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <span className="login-aside-foot">© {new Date().getFullYear()} Fitshield</span>
      </aside>

      <section className="login-main">
        <div className="login-mobile-brand">
          <Logo size={36} subtitle="Asset Management" />
        </div>

        <div className="eyebrow">Admin · CTO · HR</div>
        <Typography.Title level={3} style={{ margin: '6px 0 0', letterSpacing: '-0.02em' }}>
          Welcome back
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ margin: '4px 0 28px' }}>
          Sign in with your work email and 4-digit PIN.
        </Typography.Paragraph>

        {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 20 }} />}

        <Form
          layout="vertical"
          onFinish={onFinish}
          onValuesChange={onValuesChange}
          requiredMark={false}
          autoComplete="off"
          size="large"
          disabled={status === 'loading'}
        >
          <Form.Item
            label="Email"
            name="email"
            normalize={(v) => (typeof v === 'string' ? v.trim() : v)}
            rules={[
              { required: true, message: 'Please enter your email' },
              { type: 'email', message: 'Please enter a valid email' },
              { max: 254, message: 'Email is too long' },
            ]}
          >
            <Input prefix={<MailOutlined className="muted" />} placeholder="name@company.com" autoFocus />
          </Form.Item>
          <Form.Item
            className="pin-field"
            label="PIN"
            name="pin"
            rules={[
              { required: true, message: 'Please enter your PIN' },
              { pattern: /^\d{4}$/, message: 'PIN must be 4 digits' },
            ]}
          >
            <Input.OTP length={4} mask="•" formatter={(v) => v.replace(/\D/g, '')} />
          </Form.Item>
          {/* disabled={false}: keep the spinner in brand colour while the form itself is disabled */}
          <Button type="primary" htmlType="submit" block loading={status === 'loading'} disabled={false} style={{ marginTop: 8 }}>
            {status === 'loading' ? 'Signing in…' : 'Sign in'}
          </Button>
        </Form>
      </section>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="login-page">
      <LoginForm />
    </main>
  );
}
