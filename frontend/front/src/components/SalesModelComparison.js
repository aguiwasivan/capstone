import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { forecastRows, forecastSummary, monthLabel, peso, salesValue } from "./salesForecastUtils";
import "./SalesModelComparison.css";

export function ForecastTooltip({ active, payload }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return <div className="sales-forecast-tooltip">
    <strong>{monthLabel(row.period)}</strong>
    {row.actual !== null && <p><span>Actual sales</span><b>{peso(row.actual)}</b></p>}
    {row.random_forest !== null && <p><span>Random Forest forecast</span><b>{peso(row.random_forest)}</b></p>}
    {row.actual === null && row.random_forest === null && <p>No recorded value</p>}
  </div>;
}
function ForecastDot({ cx, cy, payload }) {
  if (payload?.random_forest == null || !Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  return <circle cx={cx} cy={cy} r={6} fill="#ea580c" stroke="#fff" strokeWidth={2}>
    <title>{`${monthLabel(payload.period)} — Random Forest forecast: ${peso(payload.random_forest)}`}</title>
  </circle>;
}
export default function SalesModelComparison({ predictions }) {
  const comparison = predictions?.model_comparison || {};
  const rows = forecastRows(comparison.line_chart);
  const { latest, predicted, difference } = forecastSummary(rows, comparison);
  const metrics = comparison.metrics?.[comparison.selected_model] || {};
  const limitation = comparison.data_limitation_message || predictions?.data_limitation_message;
  const zeroMonths = rows.filter((row) => row.actual === 0).length;
  const hasValues = rows.some((row) => row.actual !== null || row.random_forest !== null);
  const percent = difference === null ? "Unavailable" : `${difference > 0 ? "+" : ""}${difference.toFixed(2)}%`;
  const previous = rows.filter((row) => row.actual !== null).slice(-2)[0];
  return (
    <section className="role-panel sales-model-comparison-panel sales-forecast-panel" aria-label="Random Forest sales forecast">
      <header className="sales-forecast-heading">
        <div><p className="sales-forecast-eyebrow">Sales outlook</p><h2>Random Forest Sales Forecast</h2>
          <p>Monthly total contract value, based on completed calendar months.</p></div>
        <span className="sales-forecast-model">{comparison.selected_model_label || "Model unavailable"}</span>
      </header>
      <div className="sales-forecast-stats">
        <section className="sales-forecast-stat"><p>Latest actual sales</p><strong>{peso(latest?.actual)}</strong><span>{latest ? monthLabel(latest.period) : "No actual sales available"}</span></section>
        <section className="sales-forecast-stat forecast"><p>Predicted next-month sales</p><strong>{peso(predicted)}</strong><span>{comparison.next_period ? monthLabel(comparison.next_period) : "Awaiting forecast"}</span></section>
        <section className="sales-forecast-stat"><p>Forecast difference</p><strong>{percent}</strong><span>{latest?.actual === 0 ? "Cannot calculate a percentage from a ₱0 baseline" : "Compared with the latest actual month"}</span></section>
      </div>
      <div className="sales-forecast-chart-card">
        <div className="sales-forecast-chart-heading"><div><h3>Actual Sales vs Random Forest Forecast</h3><p>Total contract value · Philippine pesos</p></div>
          <div className="sales-forecast-legend" aria-label="Chart legend"><span><i className="actual" />Actual sales</span><span><i className="forecast" />Random Forest forecast</span></div>
        </div>
        {!hasValues ? <p className="sales-forecast-empty">No sales values available for this chart yet.</p> :
          <div className="sales-forecast-chart" role="img" aria-label="Monthly actual sales in solid green and Random Forest forecast in dashed orange. Values are listed below.">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart data={rows} margin={{ top: 18, right: 24, bottom: 12, left: 4 }} accessibilityLayer>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 5" vertical={false} />
                <XAxis dataKey="period" tickFormatter={monthLabel} minTickGap={30} interval="preserveStartEnd" padding={{ left: 12, right: 16 }} height={44} tickMargin={12} tick={{ fontSize: 12, fill: "#64748b" }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={(value) => peso(value, true)} width={76} tickMargin={8} domain={[0, "auto"]} tick={{ fontSize: 12, fill: "#64748b" }} tickLine={false} axisLine={false} />
                <Tooltip content={<ForecastTooltip />} filterNull={false} cursor={{ stroke: "#94a3b8", strokeDasharray: "4 4" }} />
                <Line type="linear" dataKey="actual" name="Actual sales" stroke="#15803d" strokeWidth={2.5} dot={{ r: 3, fill: "#15803d", stroke: "#fff", strokeWidth: 1.5 }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />
                <Line type="linear" dataKey="forecastLine" name="Random Forest forecast" stroke="#ea580c" strokeWidth={3} strokeDasharray="7 5" dot={<ForecastDot />} activeDot={<ForecastDot />} connectNulls={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>}
        <p className="sales-forecast-data-note">{zeroMonths > 0 ? `${zeroMonths} completed month${zeroMonths === 1 ? " has" : "s have"} ₱0 recorded sales in the API, including months without recorded transactions. ` : ""}Missing values appear as gaps. The dashed segment starts at the previous actual month when available; only orange dots are forecasts.</p>
        <details className="sales-forecast-data"><summary>View monthly values</summary><div className="sales-forecast-table-wrap"><table><caption>Values supplied by the sales forecast API</caption>
          <thead><tr><th scope="col">Month</th><th scope="col">Actual sales</th><th scope="col">Forecast</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.period}><th scope="row">{monthLabel(row.period)}</th><td>{peso(row.actual)}</td><td>{peso(row.random_forest)}</td></tr>)}</tbody>
        </table></div></details>
      </div>
      <section className="sales-forecast-summary" aria-label="Sales forecast summary">
        <h3>Forecast Summary</h3>
        <p className="sales-forecast-summary-lead">{predicted === null ? "A forecast is not available yet. Actual sales remain visible above." : `Random Forest projects ${peso(predicted)} in total contract value for ${monthLabel(comparison.next_period)}.`}</p>
        {latest && predicted !== null && <p>The latest actual month, {monthLabel(latest.period)}, recorded {peso(latest.actual)}.{difference === null ? " Percentage difference is unavailable because the latest actual value is zero." : ` The forecast is ${Math.abs(difference).toFixed(2)}% ${difference < 0 ? "below" : difference > 0 ? "above" : "different from"} that month.`}</p>}
        {previous && latest && previous.period !== latest.period && <p>Recent movement: recorded sales moved from {peso(previous.actual)} in {monthLabel(previous.period)} to {peso(latest.actual)} in {monthLabel(latest.period)}.</p>}
        {latest && predicted !== null && <p>Suggested action: {predicted >= latest.actual
          ? "prepare inventory and follow up on reservations for a possible sales increase."
          : "review lead quality, reservation follow-ups, and slow-moving projects."}</p>}
        <dl className="sales-forecast-validation"><div><dt>RMSE</dt><dd>{peso(metrics.rmse)}</dd></div><div><dt>MAE</dt><dd>{peso(metrics.mae)}</dd></div><div><dt>MAPE</dt><dd>{salesValue(metrics.mape) === null ? "Unavailable" : `${Number(metrics.mape).toFixed(2)}%`}</dd></div></dl>
        <p className="sales-forecast-data-note">Errors come from walk-forward validation. Forecasts are estimates, not guaranteed sales.</p>
        <p>{predictions?.forecast_basis || "Forecasts require completed calendar months of sales data."}</p>
        {limitation && <p className="sales-forecast-limitation">{limitation}</p>}
      </section>
    </section>
  );
}
