export function salesValue(value) {
  if (value == null || typeof value === "boolean" || String(value).trim() === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}
export function monthLabel(period) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period || "")) return period || "Unavailable";
  const [year, month] = period.split("-").map(Number);
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1]} ${year}`;
}
export function peso(value, compact = false) {
  const number = salesValue(value);
  if (number === null) return "Unavailable";
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", currencyDisplay: "narrowSymbol",
    notation: compact ? "compact" : "standard", maximumFractionDigits: compact ? 1 : 2 }).format(number);
}
// Preserve explicit API zeros. Missing months/values are gaps, not invented sales.
export function forecastRows(input = []) {
  const byMonth = new Map(input.filter((row) => /^\d{4}-(0[1-9]|1[0-2])$/.test(row.period))
    .map((row) => [row.period, { period: row.period, actual: salesValue(row.actual), random_forest: salesValue(row.random_forest) }]));
  const periods = [...byMonth.keys()].sort();
  if (!periods.length) return [];
  const rows = [];
  let period = periods[0];
  while (period <= periods[periods.length - 1]) {
    rows.push({ ...(byMonth.get(period) || { period, actual: null, random_forest: null }) });
    const [year, month] = period.split("-").map(Number);
    period = month === 12 ? `${String(year + 1).padStart(4, "0")}-01` : `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}`;
  }
  rows.forEach((row) => { row.forecastLine = row.random_forest; });
  const first = rows.findIndex((row) => row.random_forest !== null);
  // Bridge only an adjacent actual month; never report this anchor as a prediction.
  if (first > 0 && rows[first - 1].actual !== null) rows[first - 1].forecastLine = rows[first - 1].actual;
  return rows;
}
export function forecastSummary(rows, comparison) {
  const latest = [...rows].reverse().find((row) => row.actual !== null);
  const predicted = salesValue(comparison.next_month_predicted_sales);
  const difference = latest && latest.actual !== 0 && predicted !== null
    ? (predicted - latest.actual) / Math.abs(latest.actual) * 100 : null;
  return { latest, predicted, difference };
}
