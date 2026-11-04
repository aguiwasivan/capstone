import { summarizeSales as buildSummary, monthlySalesTotals } from "../utils/salesAnalytics";
import useAnalyticsRefresh from "../hooks/useAnalyticsRefresh";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import api from "../api";
import { AuthContext } from "../context/AuthContext";
import SalesModelComparison from "./SalesModelComparison";
import "./RoleDashboard.css";
import "./SalesAnalytics.css";
import "../pages/shared/SalesTransactions.css";
import AnalyticsSkeleton from "../pages/shared/AnalyticsSkeleton";

const commissionByRole = {
  agent: "agent_commission",
  manager: "manager_commission",
  broker: "broker_commission",
};

function money(value) {
  return Number(value || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  });
}

function saleMonth(sale) {
  return String(sale.sale_date || "").slice(0, 7);
}

function saleYear(sale) {
  return String(sale.sale_date || "").slice(0, 4);
}

function isOwnSale(sale, userRole, userId) {
  if (!["agent", "broker", "manager"].includes(userRole) || !userId) {
    return true;
  }

  return String(sale[userRole]) === String(userId);
}


export default function SalesDashboard({
  roleName = "Sales",
  title,
  description = "Track your sales performance, commissions, and monthly or yearly production.",
  embedded = false,
  showRecentSalesTable = false,
}) {
  const { user } = useContext(AuthContext);
  const refreshVersion = useAnalyticsRefresh();
  const [sales, setSales] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [monthlyPrediction, setMonthlyPrediction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [predictionError, setPredictionError] = useState("");
  const [predictionLoading, setPredictionLoading] = useState(true);
  const [retryVersion, setRetryVersion] = useState(0);
  const loadedScope = useRef(null);
  const pendingRequests = useRef(new Map());
  const userRole = String(user?.role || "").toLowerCase();
  const dashboardRole = userRole || String(roleName || "").toLowerCase();
  const userId = user?.id;
  const commissionField = commissionByRole[dashboardRole] || "agent_commission";

  useEffect(() => {
    let isActive = true;
    const scope = `${dashboardRole}:${userId ?? ""}`;
    if (loadedScope.current !== scope) {
      loadedScope.current = scope;
      setLoading(true);
      setSales([]);
      setAnalytics(null);
      setMonthlyPrediction(null);
    }
    setError("");
    setPredictionError("");
    setPredictionLoading(true);

    // Reuse only in-flight requests for this exact scope and refresh generation.
    // Strict Mode replays effects; each subscriber retains its own cleanup guard.
    const get = (url) => {
      const key = JSON.stringify([scope, refreshVersion, retryVersion, url]);
      const pending = pendingRequests.current;
      if (!pending.has(key)) {
        const request = api.get(url).finally(() => pending.delete(key));
        pending.set(key, request);
      }
      return pending.get(key);
    };

    Promise.allSettled([
      get("sales-transactions/"),
      get("sales-analytics/"),
    ]).then(([salesResult, analyticsResult]) => {
      if (!isActive) return;

      if (salesResult.status === "rejected" || analyticsResult.status === "rejected") {
        setError("Unable to load sales analytics. Please try refreshing.");
      } else {
        setSales(salesResult.value.data);
        setAnalytics(analyticsResult.value.data);
      }
      setLoading(false);
    });

    get("sales-predictions/?period=monthly").then(({ data }) => {
      if (isActive) setMonthlyPrediction(data);
    }).catch(() => {
      if (isActive) setPredictionError("Sales forecast could not be loaded.");
    }).finally(() => {
      if (isActive) setPredictionLoading(false);
    });

    return () => {
      isActive = false;
    };
  }, [refreshVersion, userId, dashboardRole, retryVersion]);

  const scopedSales = useMemo(
    () => sales.filter((sale) => isOwnSale(sale, dashboardRole, userId)),
    [dashboardRole, sales, userId]
  );
  const summary = useMemo(
    () => (["agent", "broker", "manager"].includes(dashboardRole) ? buildSummary(scopedSales) : analytics?.summary || {}),
    [analytics, dashboardRole, scopedSales]
  );
  const scopedMonthlyPrediction = monthlyPrediction;
  const currentMonth = (analytics?.as_of_date || "").slice(0, 7);
  const currentYear = (analytics?.as_of_date || "").slice(0, 4);

  const totals = useMemo(() => {
    const monthlySales = scopedSales.filter((sale) => saleMonth(sale) === currentMonth);
    const yearlySales = scopedSales.filter((sale) => saleYear(sale) === currentYear);

    return {
      monthlyCount: monthlySales.length,
      yearlyCount: yearlySales.length,
      monthlyTcp: monthlySales.reduce((sum, sale) => sum + Number(sale.total_contract_price || 0), 0),
      yearlyTcp: yearlySales.reduce((sum, sale) => sum + Number(sale.total_contract_price || 0), 0),
      monthlyCommission: monthlySales.reduce((sum, sale) => sum + Number(sale[commissionField] || 0), 0),
      yearlyCommission: yearlySales.reduce((sum, sale) => sum + Number(sale[commissionField] || 0), 0),
      myCommission: scopedSales.reduce((sum, sale) => sum + Number(sale[commissionField] || 0), 0),
    };
  }, [commissionField, currentMonth, currentYear, scopedSales]);

  const recentSales = scopedSales.slice(0, 8);
  const monthlyRows = useMemo(() => monthlySalesTotals(scopedSales), [scopedSales]);
  const annualRows = useMemo(() => {
    const totalsByYear = scopedSales.reduce((totalsByPeriod, sale) => {
      const period = saleYear(sale);
      if (!period) return totalsByPeriod;

      if (!totalsByPeriod[period]) {
        totalsByPeriod[period] = {
          period,
          total_sales: 0,
          total_contract_price: 0,
          agent_commission: 0,
          manager_commission: 0,
          broker_commission: 0,
        };
      }

      totalsByPeriod[period].total_sales += 1;
      totalsByPeriod[period].total_contract_price += Number(sale.total_contract_price || 0);
      totalsByPeriod[period].agent_commission += Number(sale.agent_commission || 0);
      totalsByPeriod[period].manager_commission += Number(sale.manager_commission || 0);
      totalsByPeriod[period].broker_commission += Number(sale.broker_commission || 0);

      return totalsByPeriod;
    }, {});

    return Object.values(totalsByYear).sort((left, right) => left.period.localeCompare(right.period));
  }, [scopedSales]);
  const monthlyChartRows = useMemo(
    () =>
      monthlyRows.slice(-6).map((item) => ({
        period: item.period,
        sales_amount: Number(item.total_contract_price || 0),
      })),
    [monthlyRows]
  );

  if (loading) return <AnalyticsSkeleton label="Loading sales analytics..." cards={5} charts={2} />;
  if (error && !analytics) return <div className="analytics-section-error" role="alert"><p>{error}</p><button className="analytics-retry-button" type="button" onClick={() => setRetryVersion((value) => value + 1)}>Retry sales analytics</button></div>;

  return (
    <div className="role-dashboard analytics-section-content">
      {error && <p role="alert">{error} Showing the last loaded data.</p>}
      {!embedded && (
        <div className="role-dashboard-header">
          <div>
            <h1>{title || `${roleName} Sales Dashboard`}</h1>
            <p>{description}</p>
          </div>
        </div>
      )}

      <div className="role-stat-grid">
        <section className="role-stat-card">
          <p>Total Sales</p>
          <strong>{summary.total_sales || 0}</strong>
          <span>Assigned transactions</span>
        </section>
        <section className="role-stat-card">
          <p>Total Contract Price</p>
          <strong>{money(summary.total_contract_price)}</strong>
          <span>Closed value</span>
        </section>
        <section className="role-stat-card">
          <p>{dashboardRole === "admin" ? "Agent Commission Total" : "My Commission"}</p>
          <strong>{money(totals.myCommission)}</strong>
          <span>{dashboardRole === "admin" ? "Recorded agent commissions" : `${dashboardRole} recorded commission`}</span>
        </section>
        <section className="role-stat-card">
          <p>This Month</p>
          <strong>{money(totals.monthlyTcp)}</strong>
          <span>{totals.monthlyCount} sales | {money(totals.monthlyCommission)} commission</span>
        </section>
        <section className="role-stat-card">
          <p>This Year</p>
          <strong>{money(totals.yearlyTcp)}</strong>
          <span>{totals.yearlyCount} sales | {money(totals.yearlyCommission)} commission</span>
        </section>
      </div>

      <div className="role-dashboard-panels">
        {predictionLoading && <p role="status">{monthlyPrediction ? "Updating sales forecast..." : "Calculating sales forecast..."}</p>}
        {predictionError && <div role="alert"><p>{predictionError}</p><button className="analytics-retry-button" type="button" onClick={() => setRetryVersion((value) => value + 1)}>Retry sales forecast</button></div>}
        {monthlyPrediction && <SalesModelComparison predictions={scopedMonthlyPrediction} />}

        <section className="role-panel sales-trends" aria-label="Sales Trends">
          <header><h2>Sales Trends</h2><p>Recorded contract value by month and year.</p></header>
          <div className="sales-trends-grid">
          <section><h3>Monthly Sales</h3>
          {!!monthlyChartRows.length && (
            <div className="monthly-sales-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyChartRows} margin={{ top: 8, right: 14, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={money} width={86} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(value) => money(value)} labelFormatter={(label) => `Month: ${label}`} />
                  <Line
                    type="monotone"
                    dataKey="sales_amount"
                    name="Sales Amount"
                    stroke="#15803D"
                    strokeWidth={3}
                    dot={{ r: 4 }}
                    activeDot={{ r: 5 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="pipeline-list">
            {monthlyRows.slice(-6).map((item) => (
              <div className="pipeline-item" key={item.period}>
                <span>{item.period}</span>
                <strong>{money(item.total_contract_price)}</strong>
              </div>
            ))}
            {!monthlyRows.length && <p className="sales-dashboard-empty">No monthly sales yet.</p>}
          </div>
          </section>

          <section><h3>Yearly Sales</h3>
          <div className="pipeline-list">
            {annualRows.slice(-5).map((item) => (
              <div className="pipeline-item" key={item.period}>
                <span>{item.period}</span>
                <strong>{money(item.total_contract_price)}</strong>
              </div>
            ))}
            {!annualRows.length && <p className="sales-dashboard-empty">No yearly sales yet.</p>}
          </div>
          </section>
          </div>
        </section>
      </div>

      {showRecentSalesTable && (
        <section className="role-panel properties-panel">
          <div className="properties-panel-header">
            <div>
              <h2>Recent Sales Transactions</h2>
              <p>Latest transaction records included in sales analytics.</p>
            </div>
          </div>

          <div className="properties-table-wrap">
            <table className="properties-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Date</th>
                  <th>TCP</th>
                  <th>Commission</th>
                  <th>Agent</th>
                  <th>Manager</th>
                  <th>Broker</th>
                </tr>
              </thead>
              <tbody>
                {recentSales.map((sale) => (
                  <tr key={sale.id}>
                    <td>{sale.project}</td>
                    <td>{sale.sale_date}</td>
                    <td>{money(sale.total_contract_price)}</td>
                    <td>{money(sale[commissionField])}</td>
                    <td>{sale.agent_name || "-"}</td>
                    <td>{sale.manager_name || "-"}</td>
                    <td>{sale.broker_name || "-"}</td>
                  </tr>
                ))}
                {!recentSales.length && (
                  <tr>
                    <td colSpan="7">No sales transactions assigned yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
