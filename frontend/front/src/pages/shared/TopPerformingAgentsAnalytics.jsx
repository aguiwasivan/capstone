import useAnalyticsRefresh from "../../hooks/useAnalyticsRefresh";
import "../../components/RoleDashboard.css";
import "./TopPerformingAgentsAnalytics.css";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import api from "../../api";
import AnalyticsSkeleton from "./AnalyticsSkeleton";

const emptyFilters = {
  start_date: "",
  end_date: "",
  year: "",
  subdivision_id: "",
  user_id: "",
  reservation_status: "",
  sales_status: "",
};
const sortableColumns = [
  ["total_sales_amount", "Sales Amount"],
  ["completed_sales", "Completed Sales"],
  ["reservations_handled", "Reservations Handled"],
  ["conversion_rate", "Conversion Rate"],
  ["commission_earned", "Commission Earned"],
];
const pipelineStatusClass = {
  "High Potential": "high",
  "Moderate Potential": "moderate",
  "Needs Follow-Up": "follow-up",
};

function buildQuery(filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params.toString();
}

function titleCase(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatCurrency(value) {
  if (value == null) return "Unavailable";
  return `PHP ${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPercent(value) {
  if (value == null) return "Unavailable";
  return `${Number(value || 0).toFixed(2)}%`;
}

export default function TopPerformingAgentsAnalytics({ embedded = false }) {
  const refreshVersion = useAnalyticsRefresh();
  const [filters, setFilters] = useState(emptyFilters);
  const [analytics, setAnalytics] = useState(null);
  const [pipelineForecast, setPipelineForecast] = useState(null);
  const [isLoadingPipeline, setIsLoadingPipeline] = useState(true);
  const [pipelineError, setPipelineError] = useState("");
  const [subdivisions, setSubdivisions] = useState([]);
  const [subdivisionError, setSubdivisionError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState("total_sales_amount");
  const [sortDirection, setSortDirection] = useState("desc");
  const [retryVersion, setRetryVersion] = useState(0);
  const [pipelineRetryVersion, setPipelineRetryVersion] = useState(0);

  const query = useMemo(() => buildQuery(filters), [filters]);
  const summary = analytics?.summary || {};
  const performanceData = useMemo(() => analytics?.performance_data || [], [analytics]);
  const topSalesPerformers = useMemo(() => analytics?.top_sales_performers || [], [analytics]);
  const topConversionPerformers = useMemo(() => analytics?.top_conversion_performers || [], [analytics]);
  const commissionPerformance = useMemo(() => analytics?.commission_performance || [], [analytics]);
  const monthlySalesPerformance = useMemo(() => analytics?.monthly_sales_performance || [], [analytics]);
  const pipelineRows = useMemo(() => pipelineForecast?.agent_pipeline_forecasts || [], [pipelineForecast]);
  const validPipelineChartRows = useMemo(
    () => pipelineRows.filter((row) => Number(row.projected_sales_value || 0) > 0),
    [pipelineRows]
  );
  const pipelineSummary = pipelineForecast?.summary || {};
  const predictedTopAgent = pipelineSummary.predicted_top_agent || {};
  const hasPipelineData = pipelineRows.length > 0;
  const hasPipelineCommission = pipelineRows.some((row) => row.projected_commission !== null && row.projected_commission !== undefined);
  const userOptions = analytics?.agent_options || [];
  const sortedRows = useMemo(() => {
    return [...performanceData].sort((left, right) => {
      const leftValue = Number(left[sortKey] || 0);
      const rightValue = Number(right[sortKey] || 0);
      const direction = sortDirection === "asc" ? 1 : -1;
      return (leftValue - rightValue) * direction;
    });
  }, [performanceData, sortDirection, sortKey]);
  const monthlyChartData = useMemo(() => {
    const rowsByMonth = {};
    monthlySalesPerformance.forEach((item) => {
      if (!rowsByMonth[item.month]) {
        rowsByMonth[item.month] = { month: item.month, month_key: item.month_key };
      }
      rowsByMonth[item.month][`agent_${item.user_id}`] = Number(item.sales_amount || 0);
    });
    return Object.values(rowsByMonth).sort((left, right) => String(left.month_key).localeCompare(String(right.month_key)));
  }, [monthlySalesPerformance]);
  const monthlyLineNames = useMemo(
    () => Array.from(new Map(monthlySalesPerformance.map((item) => [item.user_id, { id: item.user_id, name: item.name }])).values()).slice(0, 6),
    [monthlySalesPerformance]
  );
  const hasData =
    performanceData.some((item) => item.total_sales_amount || item.reservations_handled || item.completed_sales) ||
    monthlySalesPerformance.length;

  useEffect(() => {
    let active = true;
    api.get("subdivisions/").then((res) => {
      if (active) { setSubdivisions(res.data); setSubdivisionError(""); }
    }).catch(() => { if (active) setSubdivisionError("Subdivision filters could not be loaded."); });
    return () => { active = false; };
  }, [refreshVersion]);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError("");

    api
      .get(`analytics/top-performing-agents/${query ? `?${query}` : ""}`)
      .then((res) => {
        if (!isMounted) return;
        setAnalytics(res.data);
      })
      .catch((apiError) => {
        if (!isMounted) return;
        setAnalytics(null);
        setError(apiError.response?.data?.detail || "Unable to load top performing agents analytics.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [query, refreshVersion, retryVersion]);

  useEffect(() => {
    let isMounted = true;
    setIsLoadingPipeline(true);
    setPipelineError("");

    api
      .get(`analytics/agent-sales-pipeline-forecast/${query ? `?${query}` : ""}`)
      .then((res) => {
        if (!isMounted) return;
        setPipelineForecast(res.data);
      })
      .catch((apiError) => {
        if (!isMounted) return;
        setPipelineForecast(null);
        setPipelineError(
          apiError.response?.data?.detail ||
          apiError.response?.data?.message ||
          "Agent sales pipeline forecast is unavailable right now."
        );
      })
      .finally(() => {
        if (isMounted) setIsLoadingPipeline(false);
      });

    return () => {
      isMounted = false;
    };
  }, [query, refreshVersion, pipelineRetryVersion]);

  const updateFilter = (event) => {
    const { name, value } = event.target;
    setFilters((current) => ({ ...current, [name]: value }));
  };

  const resetFilters = () => {
    setFilters(emptyFilters);
  };

  const changeSort = (nextSortKey) => {
    if (nextSortKey === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(nextSortKey);
      setSortDirection("desc");
    }
  };

  return (
    <div className="role-dashboard top-agents-analytics">
      {!embedded && (
        <div className="role-dashboard-header">
          <div>
            <h1>Top Performing Agents Analytics</h1>
            <p>Compare agent sales volume, handled reservations, commissions, and conversion performance.</p>
          </div>
        </div>
      )}

      <section className="role-panel performance-filter-panel" aria-label="Top performing agents filters">
        <div className="performance-filter-grid">
          <label>
            Start Date
            <input name="start_date" type="date" value={filters.start_date} onChange={updateFilter} />
          </label>
          <label>
            End Date
            <input name="end_date" type="date" value={filters.end_date} onChange={updateFilter} />
          </label>
          <label>
            Year
            <input name="year" type="number" min="2000" max="2100" value={filters.year} onChange={updateFilter} placeholder="All years" />
          </label>
          <label>
            Subdivision
            <select name="subdivision_id" value={filters.subdivision_id} onChange={updateFilter}>
              <option value="">All subdivisions</option>
              {subdivisions.map((subdivision) => (
                <option key={subdivision.id} value={subdivision.id}>{subdivision.name}</option>
              ))}
            </select>
          </label>
          <label>
            Agent
            <select name="user_id" value={filters.user_id} onChange={updateFilter}>
              <option value="">All agents</option>
              {userOptions.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Reservation Status
            <select name="reservation_status" value={filters.reservation_status} onChange={updateFilter}>
              <option value="">All reservation statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="declined">Declined</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <label>
            Sales Status
            <select name="sales_status" value={filters.sales_status} onChange={updateFilter}>
              <option value="">Completed sales</option>
            </select>
          </label>
          <button type="button" onClick={resetFilters}>Reset Filters</button>
        </div>
      </section>

      {subdivisionError && <p role="alert">{subdivisionError}</p>}
      {error && <div className="analytics-section-error" role="alert"><p>{error}</p><button className="analytics-retry-button" type="button" onClick={() => setRetryVersion((value) => value + 1)}>Retry agent performance</button></div>}
      {isLoading && <AnalyticsSkeleton label="Loading agent performance..." cards={5} charts={5} />}
      {!isLoading && !error && !hasData && (
        <p className="performance-state">No performance activity found for the selected filters.</p>
      )}

      {!isLoading && !error && analytics && <div className="analytics-section-content">
      <p className="performance-state">{analytics.data_limitation_message}</p>
      <p>Date boundaries use {analytics.time_zone || "the server timezone"}; sales filters use sale dates.</p>
      <div className="role-stat-grid performance-summary-grid">
        <section className="role-stat-card"><p>Active Agents</p><strong>{summary.total_agents || 0}</strong><span>Available agent accounts</span></section>
        <section className="role-stat-card"><p>Agent Sales Amount</p><strong>{formatCurrency(summary.total_sales_amount)}</strong><span>Generated by agents</span></section>
        <section className="role-stat-card"><p>Agent Reservations</p><strong>{summary.total_reservations_handled ?? "Unavailable"}</strong><span>Handled by agents</span></section>
        <section className="role-stat-card"><p>Agent Completed Sales</p><strong>{summary.total_completed_sales || 0}</strong><span>Recorded agent transactions</span></section>
        <section className="role-stat-card"><p>Agent Conversion Rate</p><strong>{formatPercent(summary.overall_conversion_rate)}</strong><span>Sales per handled reservation</span></section>
      </div>

      <section className="role-panel top-performer-card">
        <div>
          <p className="performance-eyebrow">Top Performing Agent</p>
          <h2>{summary.top_performer?.name || "No top performing agent yet"}</h2>
          <p>
            Ranked by highest sales amount, then completed sales.
          </p>
        </div>
        {summary.top_performer && (
          <div className="top-performer-metrics">
            <span>Agent</span>
            <strong>{formatCurrency(summary.top_performer.sales_amount)}</strong>
            <small>{summary.top_performer.completed_sales} sales | {formatPercent(summary.top_performer.conversion_rate)}</small>
          </div>
        )}
      </section>

      <section className="performance-chart-grid">
        <article className="role-panel performance-chart-card">
          <div className="performance-chart-heading">
            <h2>Top Agents by Sales Amount</h2>
            <p>Top 10 by total sales amount.</p>
          </div>
          <div className="performance-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topSalesPerformers}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Bar dataKey="total_sales_amount" name="Sales Amount" fill="#15803D" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="role-panel performance-chart-card">
          <div className="performance-chart-heading">
            <h2>Reservations Handled vs Completed Sales per Agent</h2>
            <p>Assigned reservations and recorded completed sales for each agent.</p>
          </div>
          <div className="performance-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={performanceData.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="reservations_handled" name="Reservations" fill="#2563eb" radius={[6, 6, 0, 0]} />
                <Bar dataKey="completed_sales" name="Completed Sales" fill="#15803D" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="role-panel performance-chart-card">
          <div className="performance-chart-heading">
            <h2>Conversion Rate per Agent</h2>
            <p>Percentage of assigned reservations that resulted in a completed sale. Direct sales are excluded from this rate.</p>
          </div>
          <div className="performance-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topConversionPerformers}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(value) => `${value}%`} />
                <Tooltip formatter={(value) => formatPercent(value)} />
                <Bar dataKey="conversion_rate" name="Conversion Rate" fill="#7c3aed" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="role-panel performance-chart-card">
          <div className="performance-chart-heading">
            <h2>Monthly Sales Performance</h2>
            <p>Monthly sales amount by agent.</p>
          </div>
          <div className="performance-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend />
                {monthlyLineNames.map((person, index) => (
                  <Line
                    key={person.id}
                    type="monotone"
                    dataKey={`agent_${person.id}`}
                    name={`${person.name} (#${person.id})`}
                    stroke={["#15803D", "#2563eb", "#dc2626", "#7c3aed", "#f59e0b", "#0f766e"][index % 6]}
                    strokeWidth={3}
                    dot={{ r: 3 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="role-panel performance-chart-card">
          <div className="performance-chart-heading">
            <h2>Agent Commission Performance</h2>
            <p>Recorded commission amounts by agent. Pending payment amounts are not recorded.</p>
          </div>
          <div className="performance-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={commissionPerformance}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend />
                <Bar dataKey="commission_earned" name="Earned Commission" fill="#15803D" radius={[6, 6, 0, 0]} />
                <Bar dataKey="pending_commission" name="Pending Commission" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </section>

      <section className="role-panel properties-panel performance-table-panel">
        <div className="properties-panel-header">
          <div>
            <h2>Performance Ranking</h2>
            <p>Sortable agent details. Rank remains the overall sales rank when sorting another column.</p>
          </div>
          <div className="performance-sort-controls">
            {sortableColumns.map(([key, label]) => (
              <button key={key} type="button" className={sortKey === key ? "active" : ""} onClick={() => changeSort(key)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="properties-table-wrap">
          <table className="properties-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Name</th>
                <th>Sales Amount</th>
                <th>Reservations</th>
                <th>Completed Sales</th>
                <th>Conversion</th>
                <th>Commission Earned</th>
                <th>Pending Commission</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <tr key={`${row.role}-${row.user_id}`}>
                  <td>{row.rank}</td>
                  <td>{row.name}</td>
                  <td>{formatCurrency(row.total_sales_amount)}</td>
                  <td>{row.reservations_handled ?? "Unavailable"}</td>
                  <td>{row.completed_sales}</td>
                  <td>{formatPercent(row.conversion_rate)}</td>
                  <td>{formatCurrency(row.commission_earned)}</td>
                  <td>{formatCurrency(row.pending_commission)}</td>
                  <td><span className={`performance-status ${row.status}`}>{titleCase(row.status)}</span></td>
                </tr>
              ))}
              {!sortedRows.length && (
                <tr>
                  <td colSpan="9">No top performing agent rows found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <section className="agent-pipeline-forecast" aria-label="Agent sales pipeline forecast">
          <div className="performance-chart-heading">
            <h2>Agent Sales Pipeline Forecast</h2>
            <p>Projected sales potential based on active approved reservations and conversion probability.</p>
          </div>

          {isLoadingPipeline ? (
            <AnalyticsSkeleton label="Loading agent sales pipeline forecast..." cards={4} charts={1} />
          ) : pipelineError ? (
            <div className="analytics-section-error" role="alert"><p>{pipelineError}</p><button className="analytics-retry-button" type="button" onClick={() => setPipelineRetryVersion((value) => value + 1)}>Retry pipeline forecast</button></div>
          ) : !hasPipelineData ? (
            <p className="performance-state">No active approved reservations match these filters.</p>
          ) : (
            <>
              <p className="agent-pipeline-note">{pipelineForecast?.message}</p>
              <div className="role-stat-grid agent-pipeline-summary-grid">
                <section className="role-stat-card">
                  <p>Predicted Top Agent</p>
                  <strong>{predictedTopAgent.agent_name || "-"}</strong>
                  <span>Highest projected pipeline</span>
                </section>
                <section className="role-stat-card">
                  <p>Projected Sales Value</p>
                  <strong>{formatCurrency(pipelineSummary.total_projected_pipeline_value)}</strong>
                  <span>Weighted by conversion probability</span>
                </section>
                <section className="role-stat-card">
                  <p>Expected Conversions</p>
                  <strong>{predictedTopAgent.expected_converted_reservations == null ? "Unavailable" : Number(predictedTopAgent.expected_converted_reservations).toFixed(2)}</strong>
                  <span>Predicted top agent</span>
                </section>
                <section className="role-stat-card">
                  <p>Active Approved Reservations</p>
                  <strong>{pipelineSummary.total_active_approved_reservations || 0}</strong>
                  <span>{pipelineSummary.unassigned_reservations || 0} unassigned; assign from Reservation Requests</span>
                </section>
                {hasPipelineCommission && (
                  <section className="role-stat-card">
                    <p>Projected Commission</p>
                    <strong>{formatCurrency(predictedTopAgent.projected_commission)}</strong>
                    <span>When commission data is available</span>
                  </section>
                )}
              </div>

              <article className="role-panel performance-chart-card agent-pipeline-chart-card">
                <div className="performance-chart-heading">
                  <h2>Projected Sales Value per Agent</h2>
                  <p>Agents with valid active approved reservation pipeline data.</p>
                </div>
                <div className="performance-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={validPipelineChartRows}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="agent_name" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(value) => `PHP ${Number(value || 0).toLocaleString("en-PH")}`} />
                      <Tooltip formatter={(value) => formatCurrency(value)} />
                      <Bar dataKey="projected_sales_value" name="Projected Sales Value" fill="#2563eb" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </article>

              <div className="properties-table-wrap">
                <table className="properties-table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Agent</th>
                      <th>Approved Reservations</th>
                      <th>Expected Conversions</th>
                      <th>Projected Sales Value</th>
                      {hasPipelineCommission && <th>Projected Commission</th>}
                      <th>Pipeline Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pipelineRows.map((row) => (
                      <tr key={row.agent_id ?? "unassigned"}>
                        <td>{row.rank}</td>
                        <td>{row.agent_name}</td>
                        <td>{row.active_approved_reservations}</td>
                        <td>{row.expected_converted_reservations == null ? "Unavailable" : Number(row.expected_converted_reservations).toFixed(2)}</td>
                        <td>{formatCurrency(row.projected_sales_value)}</td>
                        {hasPipelineCommission && (
                          <td>
                            {row.projected_commission === null || row.projected_commission === undefined
                              ? "-"
                              : formatCurrency(row.projected_commission)}
                          </td>
                        )}
                        <td>
                          <span className={`pipeline-status ${pipelineStatusClass[row.pipeline_label] || "moderate"}`}>
                            {row.pipeline_label || "Moderate Potential"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="agent-pipeline-note">
                This forecast is a decision-support tool based on active approved reservations and predicted conversion probabilities. It does not guarantee completed sales.
              </p>
            </>
          )}
        </section>
      </section>
      </div>}
    </div>
  );
}
