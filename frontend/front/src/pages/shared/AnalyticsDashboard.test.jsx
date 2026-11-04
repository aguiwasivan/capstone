/* eslint testing-library/no-unnecessary-act: "off" -- Raw React createRoot requires explicit act; these tests do not use Testing Library. */
import { act } from "react";
import { createRoot } from "react-dom/client";
import AnalyticsDashboard from "./AnalyticsDashboard";

const mockMounted = jest.fn();
jest.mock("../../components/SalesDashboard", () => function Sales(props) {
  const { useEffect } = require("react");
  useEffect(() => { mockMounted("sales", props); }, [props]);
  return <p>Sales tab content</p>;
});
jest.mock("./ReservationAnalytics", () => function Reservations() {
  const { useEffect } = require("react");
  useEffect(() => { mockMounted("reservations"); }, []);
  return <p>Reservation tab content</p>;
});
jest.mock("./LotDemandPrediction", () => function Demand() {
  const { useEffect } = require("react");
  useEffect(() => { mockMounted("demand"); }, []);
  return <p>Demand tab content</p>;
});
jest.mock("./TopPerformingAgentsAnalytics", () => function Agents() {
  const { useEffect } = require("react");
  useEffect(() => { mockMounted("agents"); }, []);
  return <p>Agent tab content</p>;
});

test("only active tabs mount; analytics omits its duplicate transactions table", async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockMounted.mockClear();
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => root.render(<AnalyticsDashboard />));
    expect(mockMounted.mock.calls.map(([tab]) => tab)).toEqual(["sales"]);
    expect(mockMounted.mock.calls[0][1].showRecentSalesTable).toBeUndefined();
    for (const [index, label] of [[1, "Reservation tab content"], [2, "Demand tab content"], [3, "Agent tab content"]]) {
      await act(async () => host.querySelectorAll('[role="tab"]')[index].click());
      expect(host.textContent).toContain(label);
      expect(host.textContent).not.toContain("Sales tab content");
    }
    expect(mockMounted.mock.calls.map(([tab]) => tab)).toEqual(["sales", "reservations", "demand", "agents"]);
  } finally {
    await act(async () => root.unmount());
    delete global.IS_REACT_ACT_ENVIRONMENT;
  }
});
