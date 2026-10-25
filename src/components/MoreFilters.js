'use client';

import { memo, useCallback, useMemo, useState } from 'react';
import { Badge, Button, Popover, Select, Tag } from 'antd';
import { FilterOutlined } from '@ant-design/icons';

/**
 * "More filters" button + popup for the less-used filters of a list.
 * The popup edits a draft: nothing is applied (and nothing is fetched) until Apply, which calls
 * `onApply(patch)` once with every field. Close, or a click outside, throws the draft away; reopening
 * starts from the filters currently applied. The badge counts the applied ones.
 *
 * fields — [{ key, label, options, placeholder?, showSearch?, loading?, notFoundContent? }]
 * values — the applied filters ({ [key]: value | null })
 */
function MoreFilters({ fields, values, onApply, title = 'Apply more filters', buttonText = 'More filters' }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({});
  const applied = useMemo(() => Object.fromEntries(fields.map((f) => [f.key, values[f.key] ?? null])), [fields, values]);
  const appliedCount = Object.values(applied).filter((v) => v !== null).length;
  const changed = fields.some((f) => (draft[f.key] ?? null) !== applied[f.key]);

  const onOpenChange = useCallback(
    (next) => {
      setDraft(applied);
      setOpen(next);
    },
    [applied]
  );
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const apply = useCallback(() => {
    onApply(Object.fromEntries(fields.map((f) => [f.key, draft[f.key] ?? null])));
    setOpen(false);
  }, [onApply, fields, draft]);

  const panel = (
    <div className="more-filters">
      {fields.map((f) => (
        <label key={f.key} className="more-filters-field">
          <span>{f.label}</span>
          <Select
            placeholder={f.placeholder || `Any ${f.label.toLowerCase()}`}
            allowClear
            showSearch={f.showSearch}
            optionFilterProp="label"
            loading={f.loading}
            value={draft[f.key] ?? null}
            options={f.options}
            notFoundContent={f.notFoundContent}
            onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v ?? null }))}
          />
        </label>
      ))}
      <div className="more-filters-actions">
        <Button onClick={close}>Close</Button>
        <Button type="primary" onClick={apply} disabled={!changed}>
          Apply
        </Button>
      </div>
    </div>
  );

  return (
    <Popover trigger="click" placement="bottomLeft" content={panel} title={title} arrow={false} open={open} onOpenChange={onOpenChange}>
      <Badge count={appliedCount} size="small" color="#1e7a1b">
        <Button icon={<FilterOutlined />}>{buttonText}</Button>
      </Badge>
    </Popover>
  );
}

/**
 * The applied filters as removable chips (so filters tucked behind "More filters" stay visible).
 * chips — [{ key, label, onClose }]
 */
export const FilterChips = memo(function FilterChips({ chips }) {
  if (!chips.length) return null;
  return (
    <div className="filter-chips" aria-label="Active filters">
      {chips.map((c) => (
        <Tag
          key={c.key}
          closable
          className="filter-chip"
          onClose={(e) => {
            e.preventDefault(); // the chip goes away with the filter, not via Tag's own state
            c.onClose();
          }}
        >
          {c.label}
        </Tag>
      ))}
    </div>
  );
});

export default memo(MoreFilters);
