import { act } from "react";
import { createRoot } from "react-dom/client";
import api from "../../api";
import ReservationAnalytics from "./ReservationAnalytics";

jest.mock("../../api", () => ({ get: jest.fn() }));
jest.mock("../../hooks/useAnalyticsRefresh", () => () => 0);
jest.mock("recharts", () => {
  const Empty = () => null;
  return Object.fromEntries(["Bar", "BarChart", "CartesianGrid", "Cell", "Legend", "Line", "LineChart", "Pie", "PieChart", "ResponsiveContainer", "Tooltip", "XAxis", "YAxis"].map((name) => [name, Empty]));
});

test("only the selected blueprint subdivision is offered and reset preserves its scope", async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  sessionStorage.setItem("selectedBlueprintId", "map-b");
  api.get.mockImplementation((url) => Promise.resolve({ data:
    url === "subdivisions/" ? [{ id: 1, name: "A" }, { id: 2, name: "B" }, { id: 3, name: "Legacy" }] :
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
      expect([...select.options].map((option) => option.text)).toEqual(["B"]);
      expect(select.value).toBe("2");
    });
    expect(api.get).toHaveBeenCalledWith("analytics/reservations/?subdivision_id=2");
    expect(api.get).toHaveBeenCalledWith("subdivisions/", { params: { compact: "true" } });
    expect(api.get).not.toHaveBeenCalledWith("analytics/reservations/");
    await act(async () => host.querySelector("button").click());
    expect(host.querySelector('select[name="subdivision_id"]').value).toBe("2");
  } finally {
    await act(async () => root.unmount());
    sessionStorage.clear();
    delete global.IS_REACT_ACT_ENVIRONMENT;
  }
});
