/* eslint testing-library/no-unnecessary-act: "off" -- Raw React createRoot requires explicit act; these tests do not use Testing Library. */
import { act, StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import api from "../api";
import useAnalyticsGet from "./useAnalyticsGet";

jest.mock("../api", () => ({ get: jest.fn() }));

test("Strict Mode reuses pending GETs, ignores stale filters, and refreshes settled results", async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  const root = createRoot(host);
  const requests = [];
  const received = [];
  api.get.mockClear();
  api.get.mockImplementation(() => new Promise((resolve, reject) => requests.push({ resolve, reject })));
  function Section({ filter, generation }) {
    const get = useAnalyticsGet(generation);
    useEffect(() => {
      let active = true;
      get(`analytics/?filter=${filter}`).then(({ data }) => { if (active) received.push(data); });
      return () => { active = false; };
    }, [filter, get]);
    return null;
  }
  const render = (filter, generation = 0) => root.render(<StrictMode><Section filter={filter} generation={generation} /></StrictMode>);
  try {
    await act(async () => render("a"));
    expect(api.get).toHaveBeenCalledTimes(1);
    await act(async () => render("b"));
    expect(api.get).toHaveBeenCalledTimes(2);
    await act(async () => requests[0].resolve({ data: "stale a" }));
    expect(received).toEqual([]);
    await act(async () => requests[1].resolve({ data: "current b" }));
    expect(received).toEqual(["current b"]);
    await act(async () => render("b", 1));
    expect(api.get).toHaveBeenCalledTimes(3);
    await act(async () => requests[2].resolve({ data: "refreshed b" }));
    expect(received).toEqual(["current b", "refreshed b"]);
  } finally {
    await act(async () => root.unmount());
    delete global.IS_REACT_ACT_ENVIRONMENT;
  }
});
