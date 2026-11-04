import { useCallback, useRef } from "react";
import api from "../api";

// Only share unsettled GETs in this component and refresh generation.
// Effect cleanup remains responsible for ignoring stale subscribers.
export default function useAnalyticsGet(generation) {
  const pending = useRef(new Map());
  return useCallback((url, config) => {
    const key = JSON.stringify([localStorage.getItem("access"), generation, url, config]);
    if (!pending.current.has(key)) {
      const request = api.get(url, config).finally(() => pending.current.delete(key));
      pending.current.set(key, request);
    }
    return pending.current.get(key);
  }, [generation]);
}
