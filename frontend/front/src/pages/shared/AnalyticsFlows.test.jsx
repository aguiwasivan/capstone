import { act } from "react";
import { createRoot } from "react-dom/client";
import api from "../../api";
import TopPerformingAgentsAnalytics from "./TopPerformingAgentsAnalytics";
import ReservationRequests from "./ReservationRequests";

jest.mock("../../api", () => ({ get: jest.fn(), patch: jest.fn() }));
jest.mock("../../hooks/useAnalyticsRefresh", () => () => 0);
jest.mock("recharts", () => {
  const Container = ({ children }) => <div>{children}</div>;
  const Empty = () => null;
  return { ResponsiveContainer: Container, BarChart: Container, LineChart: Container,
    CartesianGrid: Empty, XAxis: Empty, YAxis: Empty, Tooltip: Empty, Bar: Empty, Line: Empty, Legend: Empty };
});

let host;
let root;
beforeEach(() => {
  jest.clearAllMocks();
  global.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  delete global.IS_REACT_ACT_ENVIRONMENT;
});

test("pipeline shows unassigned counts even before conversion history exists", async () => {
  api.get.mockImplementation((url) => Promise.resolve({ data: url === "subdivisions/" ? [] :
    url.startsWith("analytics/top-performing-agents/") ? { summary: {}, performance_data: [] } : {
      model_available: false, message: "No resolved outcomes yet.",
      summary: { total_active_approved_reservations: 2, unassigned_reservations: 2, total_projected_pipeline_value: null },
      agent_pipeline_forecasts: [{ agent_id: null, agent_name: "Unassigned", active_approved_reservations: 2,
        expected_converted_reservations: null, projected_sales_value: null, pipeline_label: "Insufficient history" }],
    } }));
  await act(async () => root.render(<TopPerformingAgentsAnalytics embedded />));
  expect(host.textContent).toContain("No resolved outcomes yet.");
  expect(host.textContent).toContain("2 unassigned");
  expect(host.textContent).toContain("Insufficient history");
  expect(host.querySelector(".agent-pipeline-forecast table").textContent).toContain("Unavailable");
});

test("reviewer assigns a reservation and sees the saved selection", async () => {
  const request = { id: 7, status: "approved", lot: { lot_number: 1 }, assigned_agent: null };
  api.get.mockImplementation((url) => Promise.resolve({ data: url === "reservation-agents/" ? [{ id: 9, name: "Agent Nine" }] : [request] }));
  api.patch.mockResolvedValue({ data: { ...request, assigned_agent: 9, assigned_agent_name: "Agent Nine" } });
  await act(async () => root.render(<ReservationRequests />));
  const select = host.querySelector("select");
  await act(async () => {
    select.value = "9";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(api.patch).toHaveBeenCalledWith("reservation-requests/7/agent/", { assigned_agent: 9 });
  expect(host.querySelector("select").value).toBe("9");
  expect(host.textContent).toContain("Agent assignment updated.");
});
