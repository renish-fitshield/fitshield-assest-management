'use client';

import { useLayoutEffect } from 'react';

/**
 * Put this as the LAST child inside a modal's <Form> (together with `clearOnDestroy` on the Form).
 * Each time the modal opens — or the record shown in it changes — it resets the form to its current
 * `initialValues`, after the form and all its fields have mounted.
 *
 * Why: a modal keeps one form instance for its whole life, and a remounting <Form> merges its new
 * initialValues *under* whatever that instance still holds. Resetting from the modal component itself
 * runs before the form has mounted in production builds, so the previously edited record's values
 * leaked into the next "Add" (or into editing a different record).
 */
export default function ResetFormOnOpen({ form, open, values }) {
  useLayoutEffect(() => {
    if (open) form.resetFields();
  }, [form, open, values]);
  return null;
}
