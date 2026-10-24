import { nextSequence } from '@/models/Counter';

// Asset IDs: FITSHIELD-<first 4 letters/digits of the item name>-<2-digit year added>-<number>,
// e.g. "Dell 23 inch" added in 2026 → FITSHIELD-DELL-26-001. The number counts up separately for each
// code + year, and the ID never changes afterwards (even if the item is renamed).
// scripts/migrate-asset-ids.mjs builds the same format — keep the two in sync.

const PREFIX = 'FITSHIELD';
const yearFormat = new Intl.DateTimeFormat('en-IN', { year: '2-digit', timeZone: 'Asia/Kolkata' });

export const assetIdCode = (itemName) =>
  (itemName || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'ITEM';

export async function nextAssetId(itemName, date = new Date()) {
  const code = assetIdCode(itemName);
  const yy = yearFormat.format(date);
  const seq = await nextSequence(`asset:${code}:${yy}`);
  return `${PREFIX}-${code}-${yy}-${String(seq).padStart(3, '0')}`;
}
