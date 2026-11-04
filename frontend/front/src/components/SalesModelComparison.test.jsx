import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react";
import { createRoot } from "react-dom/client";
import SalesModelComparison, { ForecastTooltip } from "./SalesModelComparison";

// SSR has no layout observer. Supply dimensions while retaining real chart components.
let mockChartWidth = 800;
jest.mock("recharts", () => {
  const actual = jest.requireActual("recharts");
  const React = jest.requireActual("react");
  return { ...actual, ResponsiveContainer: ({ children }) => React.cloneElement(children, { width: mockChartWidth, height: 340 }) };
});

test("46 monthly labels are thinned at mobile, tablet, and desktop chart widths", async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  // JSDOM cannot measure fonts; use conservative 7px character widths.
  const bounds = jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
    return { width: this.tagName === "SPAN" ? this.textContent.length * 7 : mockChartWidth,
      height: this.tagName === "SPAN" ? 14 : 340, x: 0, y: 0, top: 0, left: 0, right: mockChartWidth, bottom: 340 };
  });
  const rows = Array.from({ length: 46 }, (_, index) => ({
    period: `${2023 + Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`,
    actual: index === 45 ? null : index * 1000, random_forest: index === 45 ? 45000 : null,
  }));
  const tickCounts = [];
  try {
    for (const width of [320, 768, 1200]) {
      mockChartWidth = width;
      await act(async () => root.render(<SalesModelComparison predictions={{ model_comparison: { line_chart: rows } }} />));
      const ticks = [...host.querySelectorAll(".recharts-xAxis .recharts-cartesian-axis-tick-value")];
      if (!ticks.length) console.log(host.querySelector('.sales-forecast-chart').innerHTML.slice(0, 6000));
      expect(ticks.length).toBeGreaterThan(1);
      expect(ticks.length).toBeLessThan(46);
      expect(ticks[0].textContent).toBe("Jan 2023");
      expect(ticks[ticks.length - 1].textContent).toBe("Oct 2026");
      for (let i = 1; i < ticks.length; i += 1) {
        expect(Number(ticks[i].getAttribute("x")) - Number(ticks[i - 1].getAttribute("x"))).toBeGreaterThanOrEqual(56);
      }
      expect(host.querySelector("circle[fill='#ea580c']")).not.toBeNull();
      tickCounts.push(ticks.length);
    }
    expect(tickCounts[2]).toBeGreaterThan(tickCounts[0]);
  } finally {
    await act(async () => root.unmount());
    bounds.mockRestore();
    host.remove();
    mockChartWidth = 800;
    delete global.IS_REACT_ACT_ENVIRONMENT;
  }
});

test("summary renders readable currency, a zero baseline explanation, and validation zeros", () => {
  const html = renderToStaticMarkup(<SalesModelComparison predictions={{ model_comparison: {
    selected_model: "random_forest", selected_model_label: "Random Forest", next_period: "2026-02", next_month_predicted_sales: "1200",
    metrics: { random_forest: { rmse: "0", mae: "0", mape: "0" } },
    line_chart: [{ period: "2026-01", actual: "0" }, { period: "2026-02", random_forest: "1200" }],
  } }} />);
  expect(html).toContain("Feb 2026");
  expect(html).toContain("₱1,200.00");
  expect(html).toContain("Cannot calculate a percentage from a ₱0 baseline");
  expect(html).toContain("0.00%");
  expect(html).not.toContain("Infinity");
});
test("tooltip identifies the forecast and never labels its historical anchor as a prediction", () => {
  const forecast = renderToStaticMarkup(<ForecastTooltip active payload={[{ payload: { period: "2026-02", actual: null, random_forest: 1500 } }]} />);
  expect(forecast).toContain("Feb 2026");
  expect(forecast).toContain("Random Forest forecast");
  expect(forecast).toContain("₱1,500.00");
  const anchor = renderToStaticMarkup(<ForecastTooltip active payload={[{ payload: { period: "2026-01", actual: 0, random_forest: null, forecastLine: 0 } }]} />);
  expect(anchor).toContain("Actual sales");
  expect(anchor).not.toContain("Random Forest forecast");
});
