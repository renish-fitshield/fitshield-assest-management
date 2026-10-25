import { memo } from 'react';

const TONES = {
  accent: { fill: '#2a78d6', track: '#dbe9fb' },
  good: { fill: '#0ca30c', track: '#dcf2da' },
  warning: { fill: '#fab219', track: '#fdf0cf' },
  critical: { fill: '#d03b3b', track: '#f8dede' },
};

/** A single ratio against its whole. The track is a light step of the fill's own hue. */
function Meter({ value, tone = 'accent', label }) {
  const pct = Math.max(0, Math.min(1, value || 0)) * 100;
  const { fill, track } = TONES[tone] || TONES.accent;
  return (
    <div className="meter" style={{ background: track }} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label}>
      <span className="meter-fill" style={{ width: `${pct}%`, background: fill }} />
    </div>
  );
}

export default memo(Meter);
