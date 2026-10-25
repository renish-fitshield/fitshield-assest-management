/**
 * One look for every "are you sure?" step: a warning with a plain message (no item details),
 * Yes / Cancel buttons and a close (×) button. Cancel, × and Esc do nothing but close it.
 */

export const CONFIRM_MESSAGES = {
  delete: 'Are you sure you want to delete?',
  assign: 'Are you sure you want to assign this asset?',
  assignMany: 'Are you sure you want to assign these assets?',
  transfer: 'Are you sure you want to transfer this asset?',
  return: 'Are you sure you want to return this asset?',
};

/**
 * Shows the confirmation through antd's `modal` (from App.useApp()).
 * `onYes` runs when Yes is clicked; if it returns a promise, Yes shows a spinner until it settles.
 * `danger` makes Yes red (deletes).
 */
export function confirmAction(modal, { title, onYes, danger = false }) {
  return modal.confirm({
    title,
    className: 'confirm-action',
    width: 460,
    okText: 'Yes',
    cancelText: 'Cancel',
    okButtonProps: danger ? { danger: true } : undefined,
    closable: true,
    maskClosable: false,
    centered: true,
    onOk: onYes,
  });
}
