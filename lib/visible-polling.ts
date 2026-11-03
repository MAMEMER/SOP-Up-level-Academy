/**
 * setInterval that skips ticks while the tab is hidden, and refreshes once as soon as the
 * tab becomes visible again — so a board left open in a background tab stops hitting
 * Firestore but is fresh the moment someone looks at it. Returns the cleanup function.
 */
export function startVisiblePolling(refresh: () => void, intervalMs: number): () => void {
  const timer = setInterval(() => {
    if (typeof document !== "undefined" && document.hidden) return;
    refresh();
  }, intervalMs);
  const onVisibility = () => {
    if (!document.hidden) refresh();
  };
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
