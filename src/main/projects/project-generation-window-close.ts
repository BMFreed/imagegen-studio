/** Native close owns only its own temporary fences; an interrupted Add retains its fence. */
export function releaseCanceledWindowCloseFences(
  tabIds: readonly string[],
  hasPendingHandoff: (tabId: string) => boolean,
  releaseFence: (tabId: string) => void,
): void {
  for (const tabId of tabIds) {
    if (!hasPendingHandoff(tabId)) {
      releaseFence(tabId)
    }
  }
}
