import { act } from "react";
import { createRoot } from "react-dom/client";
import api from "../../api";
import LotDemandPrediction from "./LotDemandPrediction";

jest.mock("../../api", () => ({ get: jest.fn() }));
let mockRefreshVersion = 0;
jest.mock("../../hooks/useAnalyticsRefresh", () => () => mockRefreshVersion);
jest.mock("recharts", () => {
  const Container = ({ children }) => <div>{children}</div>;
  const Empty = () => null;
  return { ResponsiveContainer: Container, BarChart: Container, CartesianGrid: Empty, XAxis: Empty, YAxis: Empty, Tooltip: Empty, Bar: Container, Cell: Empty };
});

test("shows three zone rows and switches subdivision without retaining stale results", async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockImplementation((url, config) => Promise.resolve({ data: url === "subdivisions/"
    ? [{ id: 1, name: "COTTA" }, { id: 2, name: "ST. JUDE" }]
    : { subdivision_id: Number(config.params.subdivision_id), model_available: false,
      distribution_by_zone: config.params.subdivision_id === "1" ? [
        { location_zone: "front", available_lots: 3, scored_lots: 3, average_score: 75 },
        { location_zone: "unassigned", available_lots: 2, scored_lots: 2, average_score: 100 },
      ] : [], predictions: [] } }));
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => root.render(<LotDemandPrediction embedded />));
    expect(host.querySelector("h1")).toBeNull();
    expect(host.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(host.textContent).toContain("Front Zone");
    expect(host.textContent).toContain("Central Zone");
    expect(host.textContent).toContain("Rear Zone");
    expect(host.textContent).toContain("75.0 / 100");
    expect(host.textContent).toContain("Preliminary Zone Demand Estimate");
    expect(host.textContent).toContain("Rank 1: Front Zone");
    expect(host.textContent).toContain("Not available");
    expect(host.textContent).not.toContain("Top High-Demand Available Lots");
    api.get.mockImplementationOnce(() => new Promise(() => {}));
    await act(async () => {
      const select = host.querySelector("select");
      select.value = "2";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(api.get).toHaveBeenLastCalledWith("analytics/lot-demand/", { params: { subdivision_id: "2" } });
    expect(host.textContent).not.toContain("75.0 / 100");
    expect(host.textContent).toContain("Loading zone demand analytics...");
  } finally {
    await act(async () => root.unmount());
    delete global.IS_REACT_ACT_ENVIRONMENT;
  }
});
