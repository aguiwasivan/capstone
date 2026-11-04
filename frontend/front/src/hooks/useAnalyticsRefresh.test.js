import { act } from "react";
import { createRoot } from "react-dom/client";
import useAnalyticsRefresh from "./useAnalyticsRefresh";
import { notifyAnalyticsUpdated } from "../utils/analyticsRefresh";

test("data changes refresh all mounted analytics and coalesce CSV writes", async () => {
  jest.useFakeTimers();
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  const root = createRoot(host);
  function Analytics() {
    return <span>{useAnalyticsRefresh()}</span>;
  }
  try {
    await act(async () => root.render(<><Analytics /><Analytics /></>));
    await act(async () => {
      notifyAnalyticsUpdated();
      jest.advanceTimersByTime(200);
      notifyAnalyticsUpdated();
      jest.advanceTimersByTime(499);
    });
    expect(host.textContent).toBe("00");
    await act(async () => jest.advanceTimersByTime(1));
    expect(host.textContent).toBe("11");
    await act(async () => {
      notifyAnalyticsUpdated();
      jest.advanceTimersByTime(500);
    });
    expect(host.textContent).toBe("22");
    await act(async () => jest.advanceTimersByTime(58_799));
    expect(host.textContent).toBe("22");
    await act(async () => jest.advanceTimersByTime(1));
    expect(host.textContent).toBe("33");
  } finally {
    await act(async () => root.unmount());
    jest.clearAllTimers();
    jest.useRealTimers();
    delete global.IS_REACT_ACT_ENVIRONMENT;
  }
});
