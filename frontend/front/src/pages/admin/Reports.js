import { summarizeSales as summarizeTransactions } from "../../utils/salesAnalytics";
import "../../components/RoleDashboard.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import useAnalyticsRefresh from "../../hooks/useAnalyticsRefresh";
import api from "../../api";
import { TablePagination } from "../../components/ui/UI";
import AnalyticsSkeleton from "../shared/AnalyticsSkeleton";

const SALES_PER_PAGE = 20;

function formatCurrency(value) {
  return `PHP ${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatCsvValue(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function formatMonthLabel(month) {
  const [year, monthNumber] = month.split("-").map(Number);

  return new Intl.DateTimeFormat("en-PH", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, monthNumber - 1, 1));
}


export function buildSalesReportCsv(reportData) {
  const summary = reportData?.summary || {};
  const transactions = reportData?.transactions || [];
  const generatedAt = new Date().toLocaleString("en-PH");

  const rows = [
    ["Sales & Commission Report"],
    ["Generated", generatedAt],
    [],
    ["Summary"],
    ["Total Sales", summary.total_sales || 0],
    ["Total Contract Price", summary.total_contract_price || 0],
    ["Agent Commission", summary.agent_commission || 0],
    ["Manager Commission", summary.manager_commission || 0],
    ["Broker Commission", summary.broker_commission || 0],
    [],
    ["Transactions"],
    ["Project", "Date", "TCP", "Agent Commission", "Manager Commission", "Broker Commission"],
    ...transactions.map((sale) => [
      sale.project,
      sale.sale_date,
      sale.total_contract_price,
      sale.agent_commission,
      sale.manager_commission,
      sale.broker_commission,
    ]),
  ];

  return rows.map((row) => row.map(formatCsvValue).join(",")).join("\r\n");
}

function downloadSalesReportCsv(reportData, selectedMonth) {
  const csv = buildSalesReportCsv(reportData);
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const periodStamp = selectedMonth === "all" ? "all-months" : selectedMonth;

  link.href = url;
  link.download = `sales-commission-report-${periodStamp}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

export default function Reports() {
  const refreshVersion = useAnalyticsRefresh();
  const [report, setReport] = useState(null);
  const [message, setMessage] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api
      .get("sales-report/")
      .then((res) => {
        if (!active) return;
        setReport(res.data);
      })
      .catch(() => { if (active) { setReport(null); setError("Unable to generate report."); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshVersion, retryVersion]);

  const transactions = useMemo(() => report?.transactions || [], [report]);
  const transactionMonths = useMemo(
    () =>
      [...new Set(
        transactions
          .map((sale) => String(sale.sale_date || "").slice(0, 7))
          .filter((month) => /^\d{4}-\d{2}$/.test(month))
      )].sort((left, right) => right.localeCompare(left)),
    [transactions]
  );
  const filteredTransactions = useMemo(
    () =>
      selectedMonth === "all"
        ? transactions
        : transactions.filter(
            (sale) => String(sale.sale_date || "").slice(0, 7) === selectedMonth
          ),
    [selectedMonth, transactions]
  );
  const filteredReport = useMemo(
    () => ({
      summary: summarizeTransactions(filteredTransactions),
      transactions: filteredTransactions,
    }),
    [filteredTransactions]
  );
  const pageCount = Math.max(1, Math.ceil(filteredTransactions.length / SALES_PER_PAGE));
  const visibleTransactions = useMemo(
    () => filteredTransactions.slice((page - 1) * SALES_PER_PAGE, page * SALES_PER_PAGE),
    [filteredTransactions, page]
  );

  useEffect(() => {
    setPage(1);
  }, [selectedMonth]);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);
  const summary = filteredReport.summary;
  const generateCsvReport = useCallback(() => {
    setMessage("Generating CSV report...");

    try {
      downloadSalesReportCsv(filteredReport, selectedMonth);
      setMessage(
        selectedMonth === "all"
          ? "CSV report downloaded for all months."
          : `CSV report downloaded for ${formatMonthLabel(selectedMonth)}.`
      );
    } catch {
      setMessage("Unable to generate CSV report.");
    }
  }, [filteredReport, selectedMonth]);

  if (loading) return <div className="role-dashboard"><AnalyticsSkeleton label="Loading sales reports..." cards={5} charts={0} /></div>;
  if (error) return <div className="role-dashboard"><div className="analytics-section-error" role="alert"><p>{error}</p><button className="analytics-retry-button" type="button" onClick={() => setRetryVersion((value) => value + 1)}>Retry sales reports</button></div></div>;

  return (
    <div className="role-dashboard">
      <div className="role-dashboard-header">
        <div>
          <h1>Sales & Commission Reports</h1>
          <p>Sales performance and recorded commissions for your authorized transactions.</p>
        </div>
      </div>

      {message && <p>{message}</p>}

      <div className="role-stat-grid">
        <section className="role-stat-card"><p>Total Sales</p><strong>{summary.total_sales || 0}</strong><span>Transactions</span></section>
        <section className="role-stat-card"><p>Total Contract Price</p><strong>{formatCurrency(summary.total_contract_price)}</strong><span>Closed value</span></section>
        <section className="role-stat-card"><p>Agent Commission</p><strong>{formatCurrency(summary.agent_commission)}</strong><span>Total payout</span></section>
        <section className="role-stat-card"><p>Manager Commission</p><strong>{formatCurrency(summary.manager_commission)}</strong><span>Recorded amount</span></section>
        <section className="role-stat-card"><p>Broker Commission</p><strong>{formatCurrency(summary.broker_commission)}</strong><span>Total payout</span></section>
      </div>

      <section className="role-panel properties-panel">
        <div className="properties-panel-header">
          <div>
            <h2>Transactions</h2>
            <p>{filteredTransactions.length} transaction{filteredTransactions.length === 1 ? "" : "s"}</p>
          </div>
          <div className="report-transaction-actions">
            <label className="report-month-filter">
              <span>Month</span>
              <select
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
              >
                <option value="all">All months</option>
                {transactionMonths.map((month) => (
                  <option key={month} value={month}>
                    {formatMonthLabel(month)}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={generateCsvReport}>
              Generate CSV Report
            </button>
          </div>
        </div>
        <div className="properties-table-wrap">
          <table className="properties-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Date</th>
                <th>TCP</th>
                <th>Agent Commission</th>
                <th>Manager Commission</th>
                <th>Broker Commission</th>
              </tr>
            </thead>
            <tbody>
              {visibleTransactions.map((sale) => (
                <tr key={sale.id}>
                  <td>{sale.project}</td>
                  <td>{sale.sale_date}</td>
                  <td>{formatCurrency(sale.total_contract_price)}</td>
                  <td>{formatCurrency(sale.agent_commission)}</td>
                  <td>{formatCurrency(sale.manager_commission)}</td>
                  <td>{formatCurrency(sale.broker_commission)}</td>
                </tr>
              ))}
              {!filteredTransactions.length && (
                <tr>
                  <td colSpan="6">No transactions found for this month.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <TablePagination
          page={page}
          pageCount={pageCount}
          onPrevious={() => setPage((current) => Math.max(1, current - 1))}
          onNext={() => setPage((current) => Math.min(pageCount, current + 1))}
        />
      </section>
    </div>
  );
}

