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
import useAnalyticsGet from "../../hooks/useAnalyticsGet";
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

  const get = useAnalyticsGet(`${refreshVersion}:${retryVersion}`);
  const [subdivisionsLoaded, setSubdivisionsLoaded] = useState(false);

  const query = useMemo(() => buildQuery(filters), [filters]);
  const summary = analytics?.summary || {};
  const monthlyReservations = analytics?.monthly_reservations || [];
  const statusDistribution = analytics?.status_distribution || [];
  const mostReservedLots = useMemo(() => analytics?.most_reserved_lots || [], [analytics?.most_reserved_lots]);
  const mostReservedBlocksPhases = analytics?.most_reserved_blocks_phases || [];
  const filteredMostReservedLots = mostReservedLots;
  const subdivisionDemandRows = useMemo(() => {
    const eligible = new Map(subdivisions.map((item) => [String(item.id), item.name]));
    return (analytics?.reservation_by_subdivision || [])
      .filter((row) => eligible.has(String(row.subdivision_id)) &&
        (!filters.subdivision_id || String(row.subdivision_id) === filters.subdivision_id))
      .map((row) => ({
        subdivision_id: row.subdivision_id,
        label: eligible.get(String(row.subdivision_id)),
        reservation_count: row.reservation_count,
      }));
  }, [analytics?.reservation_by_subdivision, subdivisions, filters.subdivision_id]);
  const hasSubdivisionDemand = subdivisionDemandRows.some((row) => Number(row.reservation_count) > 0);
  const hasAnalyticsRows =
    monthlyReservations.length ||
    statusDistribution.some((item) => item.count) ||
    mostReservedLots.length ||
    mostReservedBlocksPhases.length;

  useEffect(() => {
    let active = true;
    get("subdivisions/", { params: { compact: "true", map_selectable: "true" } }).then((res) => {
      if (!active) return;
      setSubdivisions([...new Map(res.data.map((item) => [String(item.id), item])).values()]);
      setFilters((current) => current.subdivision_id && !res.data.some((item) => String(item.id) === current.subdivision_id)
        ? { ...current, subdivision_id: "" } : current);
      setSubdivisionError("");
      setSubdivisionsLoaded(true);
    }).catch(() => {
      if (active) {
        setSubdivisionError("Subdivision filters could not be loaded. You can still view all reservations.");
        setSubdivisionsLoaded(true);
      }
    });
    return () => { active = false; };
  }, [get]);

  useEffect(() => {
    if (!subdivisionsLoaded) return;
    let isMounted = true;
    setIsLoading(true);
    setError("");

    get(`analytics/reservations/${query ? `?${query}` : ""}`)
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
  }, [query, get, subdivisionsLoaded]);

  const updateFilter = (event) => {
    const { name, value } = event.target;
    setFilters((current) => ({ ...current, [name]: value }));
  };

  const resetFilters = () => {
    setFilters({ ...emptyFilters });
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
              <option value="">All Subdivisions</option>
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

      <p className="reservation-state">The subdivision selector and Most Reserved Subdivision chart use Interactive Lot Map subdivisions. All Subdivisions retains historical records in the other analytics sections.</p>
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
        <section className="role-stat-card"><p>Conversion Rate</p><strong>{formatPercent(summary.conversion_rate)}</strong><span>{summary.completed_sales_from_reservations || 0} of {summary.total_reservations || 0} reservations</span></section>
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
                <Line isAnimationActive={false} type="monotone" dataKey="reservation_count" name="Reservations" stroke="#15803D" strokeWidth={3} dot={{ r: 4 }} />
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
                <Pie isAnimationActive={false} data={statusDistribution} dataKey="count" nameKey="status" innerRadius={55} outerRadius={90} paddingAngle={4}>
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

        <article className="role-panel reservation-chart-card">
          <div className="reservation-chart-heading">
            <h2>Most Reserved Subdivision</h2>
            <p>Recorded reservations for map-eligible subdivisions within the selected filters.</p>
          </div>
          {!hasSubdivisionDemand && <p className="reservation-state">No reservations recorded for map-eligible subdivisions within these filters.</p>}
          {hasSubdivisionDemand && <div className="reservation-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={subdivisionDemandRows}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar isAnimationActive={false} dataKey="reservation_count" name="Reservations" radius={[6, 6, 0, 0]}>
                  {subdivisionDemandRows.map((entry, index) => (
                    <Cell
                      key={entry.subdivision_id}
                      fill={subdivisionChartColors[index % subdivisionChartColors.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>}
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
              <option value="">All Subdivisions</option>
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
