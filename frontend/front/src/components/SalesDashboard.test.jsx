/* eslint testing-library/no-unnecessary-act: "off" -- Raw React createRoot requires explicit act; these tests do not use Testing Library. */
import { act } from "react";
import { createRoot } from "react-dom/client";
import api from "../api";
import { AuthContext } from "../context/AuthContext";
import SalesDashboard from "./SalesDashboard";

let mockRefreshVersion = 0;
jest.mock("../api", () => ({ get: jest.fn() }));
jest.mock("../hooks/useAnalyticsRefresh", () => () => mockRefreshVersion);
jest.mock("./SalesModelComparison", () => () => <p>Forecast ready</p>);
jest.mock("recharts", () => {
  const Container = ({ children }) => <div>{children}</div>;
  const Empty = () => null;
  return { ResponsiveContainer: Container, LineChart: Container, CartesianGrid: Empty,
    XAxis: Empty, YAxis: Empty, Tooltip: Empty, Line: Empty };
});

test("totals render before the forecast and remain visible during refresh", async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  const root = createRoot(host);
  let resolveForecast;
  const forecast = new Promise((resolve) => { resolveForecast = resolve; });
  api.get.mockImplementation((url) => url.startsWith("sales-predictions/") ? forecast : Promise.resolve({
    data: url === "sales-transactions/" ? [] : { summary: { total_sales: 27 }, as_of_date: "2026-10-29" },
  }));
  const render = () => root.render(<AuthContext.Provider value={{ user: { id: 1, role: "admin" } }}><SalesDashboard /></AuthContext.Provider>);
  try {
    await act(async () => render());
    expect(host.textContent).toContain("Total Sales27");
    expect(host.textContent).toContain("Calculating sales forecast...");
    expect(host.textContent).not.toContain("Loading sales analytics...");
    await act(async () => resolveForecast({ data: {} }));
    expect(host.textContent).toContain("Forecast ready");
    api.get.mockImplementation(() => new Promise(() => {}));
    mockRefreshVersion = 1;
    await act(async () => render());
    expect(host.textContent).toContain("Total Sales27");
    expect(host.textContent).toContain("Forecast ready");
    expect(host.textContent).toContain("Updating sales forecast...");
  } finally {
    await act(async () => root.unmount());
    mockRefreshVersion = 0;
    delete global.IS_REACT_ACT_ENVIRONMENT;
  }
});

test("Strict Mode shares in-flight requests and refresh starts fresh requests", async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const React = require("react");
  const host = document.createElement("div");
  const root = createRoot(host);
  api.get.mockClear();
  api.get.mockImplementation(() => new Promise(() => {}));
  const render = () => root.render(<React.StrictMode><AuthContext.Provider value={{ user: { id: 1, role: "admin" } }}><SalesDashboard /></AuthContext.Provider></React.StrictMode>);
  try {
    await act(async () => render());
    expect(api.get).toHaveBeenCalledTimes(3);
    mockRefreshVersion = 1;
    await act(async () => render());
    expect(api.get).toHaveBeenCalledTimes(6);
  } finally {
    await act(async () => root.unmount());
    mockRefreshVersion = 0;
    delete global.IS_REACT_ACT_ENVIRONMENT;
  }
});