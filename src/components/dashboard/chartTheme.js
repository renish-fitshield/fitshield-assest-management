/*
 * Colour roles and shared chart chrome for the dashboard. Every chart reads its colours from here,
 * so adding a status, bucket or series means adding one entry, not touching chart code.
 *
 * Palettes were checked with the dataviz palette validator against the white card surface:
 * - SERIES: categorical slots in their fixed order (blue → orange → aqua). Aqua is under 3:1, so
 *   every chart that uses it also has a table view.
 * - Asset status / warranty use the reserved status colours and always show a text label beside them.
 * - CONDITION_COLORS and AGE_COLORS are one-hue ordinal ramps (monotone lightness, light end ≥ 2:1).
 */

export const SURFACE = '#ffffff';

export const INK = {
  primary: '#141414',
  secondary: '#52514e',
  muted: '#6b7280',
  grid: '#eef0ee',
  axis: '#d9dcd9',
};

const STATUS = { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b', neutral: '#898781', none: '#c3c2b7' };

export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a'];

export const ASSET_STATUS_COLORS = {
  Available: STATUS.good,
  Assigned: SERIES[0],
  'Under Repair': STATUS.serious,
  Retired: STATUS.neutral,
  Lost: STATUS.critical,
};

export const WARRANTY_COLORS = {
  Active: STATUS.good,
  'Expiring soon': STATUS.warning,
  Expired: STATUS.critical,
  'Not Applicable': STATUS.none,
};

// Hand-over actions take categorical slots 1, 3, 2 so Assigned/Returned keep the strongest pair.
export const HAND_OVER_COLORS = { Assigned: SERIES[0], Transferred: SERIES[2], Returned: SERIES[1] };

// Best condition darkest.
export const CONDITION_COLORS = { New: '#104281', Good: '#1c5cab', Fair: '#2a78d6', Poor: '#5598e7', Damaged: '#86b6ef' };

// Older assets darkest; assets without a purchase date stay neutral.
export const AGE_COLORS = { lt1: '#78ba6e', '1to2': '#33a02c', '2to3': '#1e7a1b', '3plus': '#0e540e', unknown: STATUS.none };

export const STATUS_TONES = STATUS;

// Shared axis/grid props (hairline, solid, recessive).
export const AXIS_TICK = { fill: INK.muted, fontSize: 12 };
export const axisProps = {
  tick: AXIS_TICK,
  tickLine: false,
  axisLine: { stroke: INK.axis },
};
export const valueAxisProps = {
  tick: AXIS_TICK,
  tickLine: false,
  axisLine: false,
};
export const GRID = { stroke: INK.grid, strokeDasharray: undefined };
export const CURSOR = { fill: 'rgba(16, 24, 40, 0.04)' };

export const BAR_SIZE = 24;
export const BAR_RADIUS_UP = [4, 4, 0, 0];
export const BAR_RADIUS_RIGHT = [0, 4, 4, 0];
