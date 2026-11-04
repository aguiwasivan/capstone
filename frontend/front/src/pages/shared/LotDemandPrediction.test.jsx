/* eslint testing-library/no-unnecessary-act: "off" -- Raw React createRoot tests require explicit act. */
import { act } from "react";
import { createRoot } from "react-dom/client";
import api from "../../api";
import LotDemandPrediction from "./LotDemandPrediction";

jest.mock("../../api", () => ({ get: jest.fn() }));
let mockRefreshVersion = 0;
jest.mock("../../hooks/useAnalyticsRefresh", () => () => mockRefreshVersion);


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
    const chart = host.querySelector('figure[aria-label="Demand by Zone"]');
    expect(chart).not.toBeNull();
    expect(chart.querySelectorAll(".zone-demand-bar-row")).toHaveLength(3);
    expect(chart.querySelector('[role="meter"]').getAttribute("aria-valuenow")).toBe("75");
    expect(chart.querySelector(".zone-demand-bar-fill").style.width).toBe("75%");
    expect(chart.textContent).toContain("Not scored");
    expect(host.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(host.textContent).toContain("Front Zone");
    expect(host.textContent).toContain("Central Zone");
    expect(host.textContent).toContain("Rear Zone");
    expect(host.textContent).toContain("75.0 / 100");
    expect(host.textContent).toContain("Preliminary Zone Demand Estimate");
    expect(host.textContent).toContain("Rank 1: Front Zone");
    expect(host.textContent).toContain("Not available");
    expect(host.textContent).not.toContain("Top High-Demand Available Lots");
    let resolveSubdivision;
    api.get.mockImplementationOnce(() => new Promise((resolve) => { resolveSubdivision = resolve; }));
    await act(async () => {
      const select = host.querySelector("select");
      select.value = "2";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(api.get).toHaveBeenLastCalledWith("analytics/lot-demand/", { params: { subdivision_id: "2" } });
    expect(host.textContent).not.toContain("75.0 / 100");
    expect(host.textContent).toContain("Loading zone demand analytics...");
    await act(async () => resolveSubdivision({ data: {
      subdivision_id: 2, model_available: false, predictions: [],
      distribution_by_zone: [
        { location_zone: "front", available_lots: 2, scored_lots: 2, average_score: 20 },
        { location_zone: "central", available_lots: 3, scored_lots: 3, average_score: 60 },
        { location_zone: "rear", available_lots: 4, scored_lots: 4, average_score: 90 },
      ],
    } }));
    expect([...host.querySelectorAll('.zone-demand-bars [role="meter"]')].map((bar) => bar.getAttribute("aria-valuenow"))).toEqual(["20", "60", "90"]);
    expect([...host.querySelectorAll(".zone-demand-bar-fill")].map((bar) => bar.style.width)).toEqual(["20%", "60%", "90%"]);
    expect([...host.querySelectorAll(".zone-demand-bar-row")].map((row) => row.style.getPropertyValue("--zone-color"))).toEqual(["#ea580c", "#15803d", "#2563eb"]);
    expect(host.textContent).not.toContain("Loading zone demand analytics...");
  } finally {
    await act(async () => root.unmount());
    delete global.IS_REACT_ACT_ENVIRONMENT;
  }
});


test("empty scores show an empty state and valid zero scores render a chart", async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  let score = null;
  api.get.mockImplementation((url) => Promise.resolve({ data: url === "subdivisions/" ? [{ id: 1, name: "COTTA" }] : {
    subdivision_id: 1, model_available: false, predictions: [],
    distribution_by_zone: [{ location_zone: "front", available_lots: 2, scored_lots: score === null ? 0 : 2, average_score: score }],
  } }));
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => root.render(<LotDemandPrediction embedded />));
    expect(host.textContent).toContain("No scored available lots in the assigned zones.");
    expect(host.querySelector('[role="meter"]')).toBeNull();
    expect(host.textContent).toContain("Update prediction model");
    score = 0;
    mockRefreshVersion += 1;
    await act(async () => root.render(<LotDemandPrediction embedded />));
    expect(host.querySelector('[role="meter"]').getAttribute("aria-valuenow")).toBe("0");
    expect(host.querySelector(".zone-demand-bar-fill").style.width).toBe("0%");
    expect(host.querySelector(".zone-demand-bars").textContent).toContain("0.0 / 100");
  } finally {
    await act(async () => root.unmount());
    mockRefreshVersion = 0;
    delete global.IS_REACT_ACT_ENVIRONMENT;
  }
});
