'use client';

import '@ant-design/v5-patch-for-react-19';
import { useState } from 'react';
import { Provider } from 'react-redux';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { App, ConfigProvider } from 'antd';
import { getStore } from '@/store';

// FitShield brand palette (from fitshieldWebsite2.0 src/app/globals.css).
const BRAND = {
  green: '#33A02C',
  greenDark: '#1E7A1B',
  greenSoft: '#E8F6E6',
  ink: '#141414',
  inkSoft: '#1D2939',
  background: '#F7F9F7',
  muted: '#6B7280',
  line: '#E5E7EB',
  amber: '#F5A623',
  alert: '#E5484D',
  info: '#2E7DD1',
};

const theme = {
  token: {
    colorPrimary: BRAND.green,
    colorPrimaryHover: BRAND.greenDark,
    colorPrimaryActive: BRAND.greenDark,
    colorLink: BRAND.greenDark,
    colorLinkHover: BRAND.green,
    colorSuccess: BRAND.green,
    colorWarning: BRAND.amber,
    colorError: BRAND.alert,
    colorInfo: BRAND.info,
    colorText: BRAND.ink,
    colorTextSecondary: BRAND.muted,
    colorBorder: BRAND.line,
    colorBorderSecondary: '#EEF0F2',
    colorBgLayout: BRAND.background,
    borderRadius: 10,
    borderRadiusLG: 16,
    fontFamily: "var(--font-roboto), Roboto, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
  },
  components: {
    Layout: { siderBg: BRAND.ink, headerBg: '#FFFFFF', bodyBg: BRAND.background },
    Menu: {
      darkItemBg: BRAND.ink,
      darkSubMenuItemBg: BRAND.ink,
      darkItemSelectedBg: BRAND.green,
      darkItemHoverBg: 'rgba(255,255,255,0.08)',
      itemBorderRadius: 999,
    },
    Button: {
      borderRadius: 999,
      borderRadiusLG: 999,
      borderRadiusSM: 999,
      fontWeight: 500,
      primaryShadow: '0 8px 20px -8px rgba(51,160,44,0.7)',
    },
    Card: { boxShadowTertiary: '0 1px 2px rgba(16,24,40,0.04), 0 24px 60px -30px rgba(16,24,40,0.14)' },
    Table: { headerBg: '#FAFBFA', rowHoverBg: BRAND.greenSoft },
    Segmented: { itemSelectedBg: '#FFFFFF' },
  },
};

export default function Providers({ children }) {
  const [store] = useState(getStore);

  return (
    <Provider store={store}>
      <AntdRegistry>
        <ConfigProvider theme={theme}>
          <App>{children}</App>
        </ConfigProvider>
      </AntdRegistry>
    </Provider>
  );
}
