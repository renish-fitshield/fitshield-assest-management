import { BrandWordmark, ShieldMark } from './Logo';

/**
 * The Fitshield loading screen: the animated shield mark, the wordmark and a running bar.
 * It always sits inside the page — the sidebar and header stay on screen around it.
 *   variant "page"    — fills the content area (signing in / out, route changes)
 *   variant "section" — fills a page's data area while it loads (see components/DataLoader.js)
 * Motion stops for people who ask for reduced motion.
 */
export default function SplashScreen({ variant = 'page', caption, style }) {
  return (
    <div className={`splash splash-${variant}`} style={style} role="status" aria-live="polite">
      <div className="splash-mark">
        <span className="splash-glow" aria-hidden />
        <ShieldMark size={variant === 'page' ? 88 : 72} animated />
      </div>
      <div className="splash-brand">
        <BrandWordmark />
        <span className="splash-sub">Asset Management</span>
      </div>
      <div className="splash-bar" aria-hidden>
        <span />
      </div>
      <span className={caption ? 'splash-caption' : 'splash-sr'}>{caption || 'Loading…'}</span>
    </div>
  );
}
