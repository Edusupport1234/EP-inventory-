/**
 * Authentication and authorization warning utility
 * Coordinates Viewer mode restrictions and triggers a beautiful in-system modal.
 */

export function triggerUnauthorizedAlert(actionName: string) {
  window.dispatchEvent(new CustomEvent('show-unauthorized-modal', {
    detail: { action: actionName }
  }));
}

/**
 * Checks if the current logged-in user is in 'viewer' role.
 * If yes, triggers the beautiful unauthorized modal and returns true.
 * If no, returns false (allowing the action to continue).
 *
 * @param actionName A human-readable description of the attempted action (e.g., "Delete Item")
 */
export function checkViewerAndAlert(actionName: string): boolean {
  const role = localStorage.getItem('epedu_role');
  if (role === 'viewer') {
    triggerUnauthorizedAlert(actionName);
    return true; // Restricted!
  }
  return false; // Not restricted, proceed.
}
