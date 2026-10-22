import dayjs from 'dayjs';

/**
 * Put server-side validation messages (`err.fields`) under the matching form inputs.
 * Returns true when at least one field error was applied.
 */
export function applyServerErrors(form, err) {
  const fields = err?.fields;
  if (!fields || typeof fields !== 'object') return false;
  // getFieldsError() lists every registered field, even ones that are still empty.
  const known = new Set(form.getFieldsError().map((f) => f.name.join('.')));
  const entries = Object.entries(fields).filter(([name]) => known.has(name));
  if (!entries.length) return false;
  form.setFields(entries.map(([name, msg]) => ({ name, errors: [String(msg)] })));
  form.scrollToField(entries[0][0], { behavior: 'smooth', block: 'center' });
  return true;
}

/**
 * Validate the form; on failure scroll to the first invalid field and return null.
 * Never throws, so callers can `if (!values) return;`.
 */
export async function validateOrScroll(form) {
  try {
    return await form.validateFields();
  } catch (err) {
    const first = err?.errorFields?.[0]?.name;
    if (first) form.scrollToField(first, { behavior: 'smooth', block: 'center' });
    return null;
  }
}

/** Trim a string input as the user types leading spaces; keeps inner spaces. */
export const trimStart = (value) => (typeof value === 'string' ? value.replace(/^\s+/, '') : value);

export const requiredText = (label) => ({ required: true, whitespace: true, message: `${label} is required` });

export const maxLen = (n) => ({ max: n, message: `Must be at most ${n} characters` });

export const disableFutureDates = (current) => current && current.isAfter(dayjs().endOf('day'));
