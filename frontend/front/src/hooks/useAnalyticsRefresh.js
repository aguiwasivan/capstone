import { useEffect, useState } from "react";
import { ANALYTICS_UPDATED } from "../utils/analyticsRefresh";

export const ANALYTICS_REFRESH_INTERVAL_MS = 60_000;

export default function useAnalyticsRefresh() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "hidden") setVersion((value) => value + 1);
    };
    const timer = window.setInterval(refresh, ANALYTICS_REFRESH_INTERVAL_MS);
    window.addEventListener("focus", refresh);
    window.addEventListener(ANALYTICS_UPDATED, refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(ANALYTICS_UPDATED, refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return version;
}
