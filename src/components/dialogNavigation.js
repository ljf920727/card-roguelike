/** Opens shared dialogs at their reading start without scrolling the page underneath. */

/**
 * Resets a newly opened dialog's scroll containers after placing focus at its entry point.
 * @param {HTMLDialogElement} dialog The modal to open.
 */
export function openDialogAtStart(dialog) {
    dialog.showModal();
    dialog.querySelector('[autofocus]')?.focus({ preventScroll: true });
    dialog.scrollTop = 0;
    dialog.querySelectorAll('.preferences-body').forEach(body => { body.scrollTop = 0; });
}
