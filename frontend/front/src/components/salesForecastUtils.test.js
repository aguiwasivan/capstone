import { forecastRows, forecastSummary, monthLabel, peso, salesValue } from "./salesForecastUtils";

test("keeps API zeros and inserts null gaps for missing or invalid months", () => {
  const input = [{ period: "2026-04", actual: null, random_forest: "250" },
    { period: "2026-01", actual: "0.00" }, { period: "2026-03", actual: "" }];
  const result = forecastRows(input);
  expect(result.map((row) => row.actual)).toEqual([0, null, null, null]);
  expect(result.map((row) => row.forecastLine)).toEqual([null, null, null, 250]);
  expect(input[0]).not.toHaveProperty("forecastLine");
  [null, undefined, "", "  ", "broken", Infinity, false].forEach((value) => expect(salesValue(value)).toBeNull());
});
test("only bridges adjacent actual to forecast without inventing an actual forecast-month sale", () => {
  const rows = forecastRows([{ period: "2025-12", actual: "100" }, { period: "2026-01", random_forest: "125" }]);
  expect(rows[0]).toMatchObject({ actual: 100, random_forest: null, forecastLine: 100 });
  expect(rows[1]).toMatchObject({ actual: null, random_forest: 125, forecastLine: 125 });
  expect(forecastSummary(rows, { next_month_predicted_sales: "125" }).difference).toBe(25);
});
test("zero baseline and unavailable forecast never produce Infinity or a fake percentage", () => {
  const rows = forecastRows([{ period: "2026-01", actual: "0" }]);
  expect(forecastSummary(rows, { next_month_predicted_sales: "100" }).difference).toBeNull();
  expect(forecastSummary(rows, {}).predicted).toBeNull();
  expect(forecastSummary([], {}).latest).toBeUndefined();
});
test("month and peso labels stay readable and preserve zero", () => {
  expect(monthLabel("2026-01")).toBe("Jan 2026");
  expect(monthLabel("2026-12")).toBe("Dec 2026");
  expect(peso(0)).toContain("₱0");
  expect(peso(1250000, true)).toContain("₱1.3M");
  expect(peso(null)).toBe("Unavailable");
});
