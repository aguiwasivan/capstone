import useAnalyticsRefresh from "../../hooks/useAnalyticsRefresh";
import "../../components/RoleDashboard.css";
import "./ReservationAnalytics.css";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
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
  block: "",
  status: "",
};
const statusColors = {
  pending: "#f59e0b",
  approved: "#15803D",
  declined: "#dc2626",
  cancelled: "#64748b",
};
const subdivisionChartColors = [
  "#2563eb",
  "#15803D",
  "#f59e0b",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#be123c",
  "#4f46e5",
];

function titleCase(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildQuery(filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params.toString();
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

export default function ReservationAnalytics({ embedded = false }) {
  const refreshVersion = useAnalyticsRefresh();
  const [filters, setFilters] = useState(emptyFilters);
  const [analytics, setAnalytics] = useState(null);
  const [subdivisions, setSubdivisions] = useState([]);
  const [subdivisionError, setSubdivisionError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryVersion, setRetryVersion] = useState(0);

  const query = useMemo(() => buildQuery(filters), [filters]);
  const summary = analytics?.summary || {};
  const monthlyReservations = analytics?.monthly_reservations || [];
  const statusDistribution = analytics?.status_distribution || [];
  const mostReservedLots = useMemo(() => analytics?.most_reserved_lots || [], [analytics?.most_reserved_lots]);
  const mostReservedBlocksPhases = analytics?.most_reserved_blocks_phases || [];
  const filteredMostReservedLots = mostReservedLots;
  const conversionRows = useMemo(() => {
    const total = Number(summary.total_reservations || 0);
    const converted = Number(summary.completed_sales_from_reservations || 0);
    return [
      { name: "Converted", value: converted },
      { name: "Not Converted", value: Math.max(total - converted, 0) },
    ];
  }, [summary.completed_sales_from_reservations, summary.total_reservations]);
  const subdivisionDemandRows = useMemo(() => {
    if (analytics?.reservation_by_subdivision) {
      return analytics.reservation_by_subdivision.map((row) => ({
        label: row.subdivision || "No subdivision",
        reservation_count: row.reservation_count,
      }));
    }
    return [];
  }, [analytics]);
  const hasAnalyticsRows =
    monthlyReservations.length ||
    statusDistribution.some((item) => item.count) ||
    mostReservedLots.length ||
    mostReservedBlocksPhases.length;

  useEffect(() => {
    let active = true;
    Promise.all([api.get("subdivisions/", { params: { compact: "true" } }), api.get("blueprints/")]).then(([res, blueprintRes]) => {
      if (!active) return;
      const savedId = sessionStorage.getItem("selectedBlueprintId");
      const blueprint = blueprintRes.data.find((item) => String(item.id) === savedId) || blueprintRes.data[0];
      const current = blueprint
        ? res.data.filter((item) => item.name === (blueprint.title || "Subdivision Blueprint"))
        : [];
      setSubdivisions(current);
      setFilters((previous) => ({ ...previous, subdivision_id: current[0] ? String(current[0].id) : "" }));
      setSubdivisionError(current.length ? "" : "No analytics subdivision is available for the current blueprint.");
      if (!current.length) { setAnalytics(null); setIsLoading(false); }
    }).catch(() => {
      if (active) {
        setSubdivisions([]);
        setAnalytics(null);
        setIsLoading(false);
        setSubdivisionError("The current blueprint subdivision could not be loaded.");
      }
    });
    return () => { active = false; };
  }, [refreshVersion]);

  useEffect(() => {
    if (!filters.subdivision_id || !subdivisions.length) return;
    let isMounted = true;
    setIsLoading(true);
    setError("");

    api
      .get(`analytics/reservations/${query ? `?${query}` : ""}`)
      .then((res) => {
        if (!isMounted) return;
        setAnalytics(res.data);
      })
      .catch((apiError) => {
        if (!isMounted) return;
        setAnalytics(null);
        setError(apiError.response?.data?.detail || "Unable to load reservation analytics.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [query, refreshVersion, filters.subdivision_id, subdivisions.length, retryVersion]);

  const updateFilter = (event) => {
    const { name, value } = event.target;
    setFilters((current) => ({ ...current, [name]: value }));
  };

  const resetFilters = () => {
    setFilters({ ...emptyFilters, subdivision_id: subdivisions[0] ? String(subdivisions[0].id) : "" });
  };

  return (
    <div className="role-dashboard reservation-analytics">
      {!embedded && (
        <div className="role-dashboard-header">
          <div>
            <h1>Reservation Analytics</h1>
            <p>Analyze reservation demand, status movement, and sales conversion.</p>
          </div>
        </div>
      )}

      <section className="role-panel reservation-filter-panel" aria-label="Reservation analytics filters">
        <div className="reservation-filter-grid">
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
              {!subdivisions.length && <option value="">No blueprint subdivision available</option>}
              {subdivisions.map((subdivision) => (
                <option key={subdivision.id} value={subdivision.id}>
                  {subdivision.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Block
            <input name="block" value={filters.block} onChange={updateFilter} placeholder="All blocks" />
          </label>
          <label>
            Status
            <select name="status" value={filters.status} onChange={updateFilter}>
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="declined">Declined</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <button type="button" onClick={resetFilters}>
            Reset Filters
          </button>
        </div>
      </section>

      {subdivisionError && <p role="alert">{subdivisionError}</p>}
      {error && <div className="analytics-section-error" role="alert"><p>{error}</p><button className="analytics-retry-button" type="button" onClick={() => setRetryVersion((value) => value + 1)}>Retry reservation analytics</button></div>}
      {isLoading && <AnalyticsSkeleton label="Loading reservation analytics..." cards={7} charts={4} />}
      {!isLoading && !error && !hasAnalyticsRows && (
        <p className="reservation-state">No reservation analytics found for the selected filters.</p>
      )}

      {!isLoading && !error && analytics && <div className="analytics-section-content">
      <p>Reservation date boundaries use {analytics.time_zone || "the server timezone"}.</p>
      <div className="role-stat-grid reservation-summary-grid">
        <section className="role-stat-card"><p>Total Reservations</p><strong>{summary.total_reservations || 0}</strong><span>Filtered requests</span></section>
        <section className="role-stat-card"><p>Pending</p><strong>{summary.pending_reservations || 0}</strong><span>Awaiting review</span></section>
        <section className="role-stat-card"><p>Approved</p><strong>{summary.approved_reservations || 0}</strong><span>Accepted requests</span></section>
        <section className="role-stat-card"><p>Declined</p><strong>{summary.declined_reservations || 0}</strong><span>Not accepted</span></section>
        <section className="role-stat-card"><p>Cancelled</p><strong>{summary.cancelled_reservations || 0}</strong><span>Cancelled requests</span></section>
        <section className="role-stat-card"><p>Completed Sales</p><strong>{summary.completed_sales_from_reservations || 0}</strong><span>Linked conversions</span></section>
        <section className="role-stat-card"><p>Conversion Rate</p><strong>{formatPercent(summary.conversion_rate)}</strong><span>Reservations to sales</span></section>
      </div>

      <section className="reservation-chart-grid">
        <article className="role-panel reservation-chart-card">
          <div className="reservation-chart-heading">
            <h2>Monthly Reservations Trend</h2>
            <p>Total reservations grouped by month.</p>
          </div>
          <div className="reservation-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyReservations}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="reservation_count" name="Reservations" stroke="#15803D" strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="role-panel reservation-chart-card">
          <div className="reservation-chart-heading">
            <h2>Status Distribution</h2>
            <p>Pending, approved, declined, and cancelled requests.</p>
          </div>
          <div className="reservation-chart">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusDistribution} dataKey="count" nameKey="status" innerRadius={55} outerRadius={90} paddingAngle={4}>
                  {statusDistribution.map((entry) => (
                    <Cell key={entry.status} fill={statusColors[entry.status] || "#64748b"} />
                  ))}
                </Pie>
                <Tooltip formatter={(value, name) => [value, titleCase(name)]} />
                <Legend formatter={titleCase} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="role-panel reservation-chart-card conversion-card">
          <div className="reservation-chart-heading">
            <h2>Reservation-to-Sale Conversion</h2>
            <p>{formatPercent(summary.conversion_rate)} of filtered reservations converted to completed sales.</p>
          </div>
          <div className="reservation-conversion-layout">
            <div className="reservation-conversion-rate">
              <strong>{formatPercent(summary.conversion_rate)}</strong>
              <span>{summary.completed_sales_from_reservations || 0} of {summary.total_reservations || 0} reservations</span>
            </div>
            <div className="reservation-chart compact">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={conversionRows} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78}>
                    <Cell fill="#15803D" />
                    <Cell fill="#e2e8f0" />
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </article>

        <article className="role-panel reservation-chart-card">
          <div className="reservation-chart-heading">
            <h2>Most Reserved Subdivision</h2>
            <p>Reservation demand grouped by subdivision.</p>
          </div>
          <div className="reservation-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={subdivisionDemandRows}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="reservation_count" name="Reservations" radius={[6, 6, 0, 0]}>
                  {subdivisionDemandRows.map((entry, index) => (
                    <Cell
                      key={entry.label}
                      fill={subdivisionChartColors[index % subdivisionChartColors.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </section>

      <section className="role-panel properties-panel reservation-lots-panel">
        <div className="properties-panel-header">
          <div>
            <h2>Top Reserved Lots</h2>
            <p>Lots with the highest reservation counts in the selected period.</p>
          </div>
          <label className="reservation-lots-filter">
            Subdivision
            <select value={filters.subdivision_id} onChange={(event) => setFilters((current) => ({ ...current, subdivision_id: event.target.value }))}>
              {!subdivisions.length && <option value="">No blueprint subdivision available</option>}
              {subdivisions.map((subdivision) => (
                <option key={subdivision.id} value={subdivision.id}>
                  {subdivision.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="properties-table-wrap">
          <table className="properties-table">
            <thead>
              <tr>
                <th>Lot</th>
                <th>Block</th>
                <th>Phase</th>
                <th>Subdivision</th>
                <th>Reservations</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredMostReservedLots.map((lot) => (
                <tr key={lot.lot_id}>
                  <td>{lot.lot_number || "-"}</td>
                  <td>{lot.block || "-"}</td>
                  <td>{lot.phase || "-"}</td>
                  <td>{lot.subdivision || "-"}</td>
                  <td>{lot.reservation_count}</td>
                  <td><span className={`property-status ${lot.lot_status}`}>{titleCase(lot.lot_status || "unknown")}</span></td>
                </tr>
              ))}
              {!filteredMostReservedLots.length && (
                <tr>
                  <td colSpan="6">No reserved lot data found for the selected filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      </div>}
    </div>
  );
}
