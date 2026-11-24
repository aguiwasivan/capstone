/* eslint testing-library/no-unnecessary-act: "off" */
import { act } from "react";
import { createRoot } from "react-dom/client";
import api from "../../api";
import TopPerformingAgentsAnalytics from "./TopPerformingAgentsAnalytics";
import { buildSalesReportCsv } from "../admin/Reports";

jest.mock("../../api", () => ({ get: jest.fn() }));
jest.mock("../../hooks/useAnalyticsRefresh", () => () => 0);
jest.mock("recharts", () => {
  const Container = ({ children }) => <div>{children}</div>;
  const Chart = ({ children, data }) => <div data-chart-count={data?.length}>{children}</div>;
  const Empty = () => null;
  return { ResponsiveContainer: Container, BarChart: Chart, LineChart: Chart, CartesianGrid: Empty,
    XAxis: Empty, YAxis: Empty, Tooltip: Empty, Bar: Container, Cell: Empty, Line: Empty, Legend: Empty };
});

test("all agents including zero sales are charted and details load on demand", async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div"); document.body.appendChild(host); const root = createRoot(host);
  const rows = Array.from({ length: 12 }, (_, i) => ({ user_id: i + 1, name: `Agent ${i + 1}`,
    rank: i + 1, total_sales_amount: i === 0 ? 1000 : 0, completed_sales: i === 0 ? 1 : 0,
    reservations_handled: 0, status: "active" }));
  api.get.mockImplementation((url) => Promise.resolve({ data: url === "subdivisions/" ? [] :
    url.includes("details=1") ? { transactions: [{ id: 99, agent_name: "Agent 1", manager_name: "Manager One",
      broker_name: "Broker One", client_name: "Buyer One", subdivision_name: "Village", block_number: "A",
      lot_number: 5, lot_area: 120, total_contract_price: 1000, sale_date: "2026-01-02", transaction_status: "Completed" }] } :
    url.startsWith("analytics/top-performing-agents/") ? { summary: {}, performance_data: rows } : { summary: {}, agent_pipeline_forecasts: [] } }));
  await act(async () => root.render(<TopPerformingAgentsAnalytics embedded />));
  expect(host.querySelector('[data-chart-count="12"]')).not.toBeNull();
  expect(host.textContent).toContain("Agent 12");
  expect(host.textContent).not.toContain("Buyer One");
  const button = [...host.querySelectorAll("button")].find((element) => element.textContent === "View Details");
  await act(async () => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  expect(api.get.mock.calls.some(([url]) => url.includes("user_id=1") && url.includes("details=1"))).toBe(true);
  expect(host.textContent).toContain("Buyer One");
  expect(host.textContent).toContain("Village, Block A, Lot 5");
  await act(async () => root.unmount()); host.remove(); delete global.IS_REACT_ACT_ENVIRONMENT;
});

test("report CSV includes recorded transaction details", () => {
  const csv = buildSalesReportCsv({ transactions: [{ agent_name: "Agent One", manager_name: "Manager One",
    broker_name: "Broker One", client_name: "Buyer One", project: "Project", subdivision_name: "Village",
    block_number: "A", lot_number: 5, lot_area: 120, sale_date: "2026-01-02", transaction_status: "Completed",
    total_contract_price: 1000 }] });
  expect(csv).toContain("Agent,Manager,Broker,Buyer,Project,Subdivision,Block,Lot,Lot Area (sqm),Date,Status,Selling Price");
  expect(csv).toContain("Agent One,Manager One,Broker One,Buyer One,Project,Village,A,5,120,2026-01-02,Completed,1000");
});
