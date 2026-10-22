// FitShield logomark + wordmark, taken from the fitshieldWebsite2.0 brand assets (src/app/icon.svg).
// The charcoal/grey parts of the mark disappear on dark surfaces, so tone="dark" lightens them.

const TONES = {
  light: { charcoal: '#383838', grey: '#777777', text: 'var(--fs-ink)' },
  dark: { charcoal: '#FFFFFF', grey: '#C9CDD3', text: '#FFFFFF' },
};

export function ShieldMark({ size = 32, tone = 'light' }) {
  const { charcoal, grey } = TONES[tone];
  return (
    <svg viewBox="142 220 165 172" width={size} height={size} fill="none" aria-hidden focusable="false">
      <path fill="#8FFC86" d="M248.04,272.43l-3.24,4.2l-4.76,6.16l-16.29,21.11l-2.09,2.72l-5.9,7.64l-2.8,3.62l-7.82,10.14 c-12.41,6.81-24.01,11.38-33.02,14.33l17.87-23.14l5.89-7.63l5.92-7.67l16.29-21.11l8-10.36H248.04z" />
      <path fill="#8FFC86" d="M265.21,272.43c-2.48,3.95-5.08,7.7-7.79,11.26H217.7l8.59-11.26H265.21z" />
      <path fill="#00C600" d="M205.14,328.01l-39.3,50.91l-2.87,3.72c-1.71,2.24-4.31,3.4-6.93,3.4c-1.85,0-3.72-0.58-5.29-1.78 c-3.83-2.89-4.56-8.31-1.63-12.1l2.89-3.75l20.11-26.07C181.14,339.39,192.73,334.82,205.14,328.01z" />
      <path fill="#00C600" d="M299.02,283.68h-41.6c2.72-3.56,5.32-7.31,7.79-11.26h29.76C296.55,276.06,297.91,279.82,299.02,283.68z" />
      <path fill="#00C600" d="M302.61,309.32c0,2.88-0.13,5.73-0.39,8.55h-80.75c4.83-3.38,9.68-7.11,14.43-11.26h66.68 C302.6,307.51,302.61,308.41,302.61,309.32z" />
      <path fill="#8FFC86" d="M235.89,306.62c-4.75,4.14-9.59,7.88-14.43,11.26h-22.73c-1.76,0-3.33-0.81-4.35-2.08 c-0.23-0.26-0.42-0.54-0.58-0.83l6.38-8.34H235.89z" />
      <path fill={grey} d="M299.02,333.37l-0.11,0.54c-19.23,1.95-33.65,8.16-44.42,15.91h-30.57c-4.54,0-8.22-3.68-8.22-8.22 c0-4.54,3.68-8.22,8.22-8.22H299.02z" />
      <path fill={charcoal} d="M298.91,333.91l-1.9,9.32c-0.18,0.89-3.86,18.16-18.99,33.5c-3.49,3.53-7.57,6.96-12.36,10.06 c-1.38,0.89-2.93,1.32-4.46,1.32c-2.6,0-5.14-1.24-6.73-3.51c-0.07-0.09-0.12-0.16-0.18-0.25c-2.47-3.8-1.37-8.89,2.43-11.36 c10.8-6.99,17.02-16.23,20.44-23.17h-22.68C265.26,342.07,279.68,335.86,298.91,333.91z" />
      <circle fill={charcoal} cx="242.44" cy="244" r="20.43" />
    </svg>
  );
}

export function BrandWordmark({ tone = 'light' }) {
  return (
    <span className="wordmark" style={{ color: TONES[tone].text }} aria-label="Fitshield">
      <span style={{ color: 'var(--fs-green)' }} aria-hidden>
        F
      </span>
      <span aria-hidden>itshield</span>
    </span>
  );
}

/** Mark + wordmark, with an optional product label underneath. */
export default function Logo({ tone = 'light', size = 32, subtitle, collapsed = false }) {
  return (
    <span className="logo">
      <ShieldMark size={size} tone={tone} />
      {!collapsed && (
        <span className="logo-text">
          <BrandWordmark tone={tone} />
          {subtitle && <span className={`logo-subtitle ${tone}`}>{subtitle}</span>}
        </span>
      )}
    </span>
  );
}
