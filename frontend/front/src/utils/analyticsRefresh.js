export const ANALYTICS_UPDATED = "analytics-updated";
let refreshTimer;

// Coalesce consecutive writes, including rows in a CSV import.
export function notifyAnalyticsUpdated() {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    window.dispatchEvent(new Event(ANALYTICS_UPDATED));
  }, 500);
}
