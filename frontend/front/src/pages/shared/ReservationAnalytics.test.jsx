/* eslint testing-library/no-unnecessary-act: "off" -- Raw React createRoot requires explicit act; these tests do not use Testing Library. */
import { act } from "react";
import { createRoot } from "react-dom/client";
import api from "../../api";
import ReservationAnalytics from "./ReservationAnalytics";

jest.mock("../../api", () => ({ get: jest.fn() }));
let mockRefreshVersion = 0;
jest.mock("../../hooks/useAnalyticsRefresh", () => () => mockRefreshVersion);
jest.mock("recharts", () => {
  const Empty = () => null;
  const components = Object.fromEntries(["Bar", "BarChart", "CartesianGrid", "Cell", "Legend", "Line", "LineChart", "Pie", "PieChart", "ResponsiveContainer", "Tooltip", "XAxis", "YAxis"].map((name) => [name, Empty]));
  components.ResponsiveContainer = ({ children }) => <div>{children}</div>;
  components.BarChart = ({ data }) => <div data-testid="subdivision-chart" data-rows={JSON.stringify(data)} />;
  return components;
});

test("map-selectable options preserve All Subdivisions, block filters and reset", async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  sessionStorage.setItem("selectedBlueprintId", "map-b");
  api.get.mockImplementation((url) => Promise.resolve({ data:
    url === "subdivisions/" ? [{ id: 2, name: "B" }] :
    url === "blueprints/" ? [{ id: "map-a", title: "A" }, { id: "map-b", title: "B" }] :
    { summary: {}, monthly_reservations: [] }
  }));
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => root.render(<ReservationAnalytics />));
    const subdivisionSelects = [...host.querySelectorAll("select")].filter((select) => select.name !== "status");
    expect(subdivisionSelects).toHaveLength(2);
    subdivisionSelects.forEach((select) => {
      expect([...select.options].map((option) => option.text)).toEqual(["All Subdivisions", "B"]);
      expect(select.value).toBe("");
    });
    expect(api.get).toHaveBeenCalledWith("analytics/reservations/", undefined);
    expect(host.textContent).toContain("All Subdivisions retains historical records in the other analytics sections.");
    expect(api.get).not.toHaveBeenCalledWith("blueprints/");
    expect(host.textContent).not.toContain("Reservation-to-Sale Conversion");
    expect(host.textContent).toContain("No reservations recorded for map-eligible subdivisions within these filters.");
    expect(host.querySelector('[data-testid="subdivision-chart"]')).toBeNull();
    await act(async () => {
      const select = host.querySelector('select[name="subdivision_id"]');
      select.value = "2";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(api.get).toHaveBeenCalledWith("analytics/reservations/?subdivision_id=2", undefined);
    expect(host.textContent).toContain("Most Reserved Subdivision");
    expect(api.get).toHaveBeenCalledWith("subdivisions/", { params: { compact: "true", map_selectable: "true" } });
    await act(async () => host.querySelector("button").click());
    expect(host.querySelector('select[name="subdivision_id"]').value).toBe("");
  } finally {
    await act(async () => root.unmount());
    sessionStorage.clear();
    delete global.IS_REACT_ACT_ENVIRONMENT;
  }
});


test("subdivision chart shares eligible IDs, preserves actual counts and refreshes with filters", async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  let eligible = [{ id: 15, name: "COTTA" }, { id: 15, name: "COTTA" }];
  let count = 7;
  api.get.mockImplementation((url) => Promise.resolve({ data: url === "subdivisions/" ? eligible : {
    summary: { total_reservations: 107 },
    reservation_by_subdivision: [
      { subdivision_id: 99, subdivision: "Historical", reservation_count: 100 },
      { subdivision_id: 15, subdivision: "COTTA", reservation_count: count },
      { subdivision_id: 18, subdivision: "New map", reservation_count: 3 },
    ], monthly_reservations: [{ month: "January", reservation_count: 107 }],
    most_reserved_lots: [{ lot_id: 1, subdivision: "Historical", reservation_count: 100 }],
  } }));
  const host = document.createElement("div");
  const root = createRoot(host);
  const chart = () => JSON.parse(host.querySelector('[data-testid="subdivision-chart"]').dataset.rows);
  try {
    await act(async () => root.render(<ReservationAnalytics />));
    expect(chart()).toEqual([{ subdivision_id: 15, label: "COTTA", reservation_count: 7 }]);
    expect([...host.querySelector('select[name="subdivision_id"]').options].map((option) => option.text)).toEqual(["All Subdivisions", "COTTA"]);
    // Historical data still reaches the other sections; no response-wide filtering.
    expect(host.querySelector(".reservation-summary-grid").textContent).toContain("107");
    expect(host.querySelector(".reservation-lots-panel").textContent).toContain("Historical");
    count = 2;
    await act(async () => {
      const input = host.querySelector('input[name="start_date"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(input, "2025-01-01");
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(api.get).toHaveBeenCalledWith("analytics/reservations/?start_date=2025-01-01", undefined);
    expect(chart()[0].reservation_count).toBe(2);
    eligible = [{ id: 15, name: "COTTA" }, { id: 18, name: "New map" }];
    mockRefreshVersion += 1;
    await act(async () => root.render(<ReservationAnalytics />));
    expect(chart().map((row) => row.subdivision_id)).toEqual([15, 18]);
    await act(async () => {
      const select = host.querySelector('select[name="subdivision_id"]');
      select.value = "18";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(chart()).toEqual([{ subdivision_id: 18, label: "New map", reservation_count: 3 }]);
  } finally {
    await act(async () => root.unmount());
    mockRefreshVersion = 0;
    delete global.IS_REACT_ACT_ENVIRONMENT;
  }
});
