import "../../components/RoleDashboard.css";
import "./SalesTransactions.css";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import useAnalyticsRefresh from "../../hooks/useAnalyticsRefresh";
import { summarizeSales } from "../../utils/salesAnalytics";
import api from "../../api";
import { AuthContext } from "../../context/AuthContext";
import {
  EmptyState,
  FilterBar,
  LoadingSpinner,
  PageHeader,
  SummaryCard,
  TablePagination,
  Toast,
} from "../../components/ui/UI";

const emptySale = {
  reservation: "",
  client: "",
  lot: "",
  agent: "",
  manager: "",
  broker: "",
  project: "",
  developer: "",
  sale_date: "",
  total_contract_price: "",
  agent_commission_percent: "",
  manager_commission_percent: "",
  broker_commission_percent: "",
};

const csvColumnAliases = {
  reservation: ["reservation", "reservation_id"],
  client: ["client", "client_id"],
  lot: ["lot", "lot_id"],
  agent: ["agent", "agent_id", "agent_email", "agent_name"],
  manager: ["manager", "manager_id", "manager_email", "manager_name"],
  broker: ["broker", "broker_id", "broker_email", "broker_name"],
  project: ["project", "subdivision"],
  developer: ["developer"],
  sale_date: ["sale_date", "date", "sales_date", "transaction_date"],
  total_contract_price: ["total_contract_price", "tcp", "contract_price", "price"],
  agent_commission_percent: ["agent_commission_percent", "agent_commission_pct", "agent_percent"],
  manager_commission_percent: ["manager_commission_percent", "manager_commission_pct", "manager_percent"],
  broker_commission_percent: ["broker_commission_percent", "broker_commission_pct", "broker_percent"],
};

function getUserName(user) {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");
  return fullName || user.username || user.email;
}

function normalizeCsvHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === "\"" && inQuotes && nextCharacter === "\"") {
      current += "\"";
      index += 1;
    } else if (character === "\"") {
      inQuotes = !inQuotes;
    } else if (character === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }

  values.push(current.trim());
  return values;
}

function parseCsv(text) {
  const lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim());

  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map(normalizeCsvHeader);

  return lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    const rawRow = headers.reduce((row, header, headerIndex) => {
      row[header] = values[headerIndex] || "";
      return row;
    }, {});

    return { rowNumber: index + 2, rawRow };
  });
}

function getCsvValue(rawRow, field) {
  const aliases = csvColumnAliases[field] || [field];
  const alias = aliases.find((key) => rawRow[key] !== undefined && rawRow[key] !== "");
  return alias ? rawRow[alias] : "";
}

function cleanNumber(value) {
  return String(value || "").replace(/[,\s]/g, "");
}

function formatPeso(value) {
  return Number(value || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  });
}

function formatApiError(errorData) {
  if (!errorData) return "Could not save this sales row.";
  if (typeof errorData === "string") return errorData;
  if (errorData.detail) return String(errorData.detail);

  return Object.entries(errorData)
    .map(([field, messages]) => {
      const messageText = Array.isArray(messages) ? messages.join(", ") : String(messages);
      return `${field}: ${messageText}`;
    })
    .join("; ") || "Could not save this sales row.";
}

export default function SalesTransactions({ embedded = false }) {
  const refreshVersion = useAnalyticsRefresh();
  const salesRequest = useRef(0);
  const { user } = useContext(AuthContext);
  const [sales, setSales] = useState([]);
  const [staffUsers, setStaffUsers] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [salesError, setSalesError] = useState("");
  const [form, setForm] = useState(emptySale);
  const [toast, setToast] = useState(null);
  const [isLoadingSales, setIsLoadingSales] = useState(true);
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [csvProgress, setCsvProgress] = useState({ processed: 0, total: 0 });
  const [csvImportResult, setCsvImportResult] = useState(null);
  const [saleSearch, setSaleSearch] = useState("");
  const [salesPage, setSalesPage] = useState(1);
  const userRole = String(user?.role || "").toLowerCase();
  const isAdmin = userRole === "admin";
  const staffByRole = useMemo(
    () => ({
      agent: staffUsers.filter((staff) => staff.role === "agent"),
      manager: staffUsers.filter((staff) => staff.role === "manager"),
      broker: staffUsers.filter((staff) => staff.role === "broker"),
    }),
    [staffUsers]
  );

  const commissionFields = useMemo(() => {
    const fields = {
      agent: {
        name: "agent_commission_percent",
        amountName: "agent_commission",
        label: "Agent Commission",
        placeholder: "Agent commission percentage",
      },
      manager: {
        name: "manager_commission_percent",
        amountName: "manager_commission",
        label: "Manager Commission",
        placeholder: "Manager commission percentage",
      },
      broker: {
        name: "broker_commission_percent",
        amountName: "broker_commission",
        label: "Broker Commission",
        placeholder: "Broker commission percentage",
      },
    };

    if (["admin", "agent", "manager", "broker"].includes(userRole)) {
      return [fields.agent, fields.manager, fields.broker];
    }

    return [];
  }, [userRole]);

  const loadData = useCallback(() => {
    const requestId = ++salesRequest.current;
    setIsLoadingSales(true);
    setSalesError("");
    return api
      .get("sales-transactions/")
      .then((res) => { if (requestId === salesRequest.current) setSales(res.data); })
      .catch(() => {
        if (requestId !== salesRequest.current) return;
        setSales([]);
        setSalesError("Unable to load sales records. Please refresh and try again.");
        setToast({ type: "error", message: "Unable to load sales records. Please refresh and try again." });
      })
      .finally(() => { if (requestId === salesRequest.current) setIsLoadingSales(false); });
  }, []);

  const loadAvailableReservations = () => {
    Promise.all([
      api.get("reservation-requests/"),
      api.get("sales-transactions/"),
    ])
      .then(([reservationRes, salesRes]) => {
        const convertedReservationIds = new Set(
          (salesRes.data || [])
            .map((sale) => sale.reservation)
            .filter(Boolean)
            .map(String)
        );

        setReservations(
          (reservationRes.data || []).filter(
            (item) => item.status === "approved" && !convertedReservationIds.has(String(item.id))
          )
        );
      })
      .catch(() => setReservations([]));
  };

  useEffect(() => {
    loadData();
    return () => { salesRequest.current += 1; };
  }, [loadData, refreshVersion, user?.id]);

  useEffect(() => {
    setSalesPage(1);
  }, [saleSearch]);

  useEffect(() => {
    if (!isAdmin) return;

    api
      .get("users/")
      .then((res) => setStaffUsers(res.data.filter((item) => ["agent", "manager", "broker"].includes(item.role))))
      .catch(() => setStaffUsers([]));

    loadAvailableReservations();
  }, [isAdmin]);

  const handleChange = (event) => {
    setForm({ ...form, [event.target.name]: event.target.value });
  };

  const resolveStaffId = (value, role) => {
    const search = String(value || "").trim().toLowerCase();
    if (!search) return "";

    const match = staffByRole[role].find((staff) => {
      const staffName = getUserName(staff).toLowerCase();
      return (
        String(staff.id) === search ||
        String(staff.email || "").toLowerCase() === search ||
        String(staff.username || "").toLowerCase() === search ||
        staffName === search
      );
    });

    return match?.id || "";
  };

  const buildCsvPayload = (rawRow) => {
    const payload = {
      reservation: getCsvValue(rawRow, "reservation"),
      client: getCsvValue(rawRow, "client"),
      lot: getCsvValue(rawRow, "lot"),
      agent: resolveStaffId(getCsvValue(rawRow, "agent"), "agent"),
      manager: resolveStaffId(getCsvValue(rawRow, "manager"), "manager"),
      broker: resolveStaffId(getCsvValue(rawRow, "broker"), "broker"),
      project: getCsvValue(rawRow, "project"),
      developer: getCsvValue(rawRow, "developer"),
      sale_date: getCsvValue(rawRow, "sale_date"),
      total_contract_price: cleanNumber(getCsvValue(rawRow, "total_contract_price")),
      agent_commission_percent: cleanNumber(getCsvValue(rawRow, "agent_commission_percent")),
      manager_commission_percent: cleanNumber(getCsvValue(rawRow, "manager_commission_percent")),
      broker_commission_percent: cleanNumber(getCsvValue(rawRow, "broker_commission_percent")),
    };

    ["reservation", "client", "lot", "agent", "manager", "broker"].forEach((field) => {
      if (payload[field]) {
        payload[field] = Number(payload[field]);
      } else {
        delete payload[field];
      }
    });

    [
      "agent_commission_percent",
      "manager_commission_percent",
      "broker_commission_percent",
    ].forEach((field) => {
      if (!payload[field]) {
        delete payload[field];
      }
    });

    Object.keys(payload).forEach((field) => {
      if (payload[field] === "") {
        delete payload[field];
      }
    });

    return payload;
  };

  const importCsv = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsImportingCsv(true);
    setCsvProgress({ processed: 0, total: 0 });
    setCsvImportResult(null);
    setToast(null);

    try {
      const csvText = await file.text();
      const rows = parseCsv(csvText);
      setCsvProgress({ processed: 0, total: rows.length });
      const failures = [];
      let imported = 0;

      if (rows.length === 0) {
        setCsvImportResult({
          type: "error",
          message: "CSV must include a header row and at least one sales row.",
          failures: [],
        });
        return;
      }

      for (const { rowNumber, rawRow } of rows) {
        const payload = buildCsvPayload(rawRow);

        if (!payload.project || !payload.sale_date || !payload.total_contract_price) {
          failures.push({
            rowNumber,
            reason: "Missing required project, sale_date, or total_contract_price.",
          });
          setCsvProgress((current) => ({ ...current, processed: current.processed + 1 }));
          continue;
        }

        try {
          await api.post("sales-transactions/", payload);
          imported += 1;
        } catch (error) {
          failures.push({
            rowNumber,
            reason: formatApiError(error.response?.data),
          });
        } finally {
          setCsvProgress((current) => ({ ...current, processed: current.processed + 1 }));
        }
      }

      setCsvImportResult({
        type: failures.length ? "warning" : "success",
        message: `${imported} sales transaction${imported === 1 ? "" : "s"} imported.${failures.length ? ` ${failures.length} row${failures.length === 1 ? "" : "s"} failed.` : ""}`,
        failures,
      });

      if (imported > 0) {
        loadData();
        loadAvailableReservations();
      }
    } catch {
      setCsvImportResult({
        type: "error",
        message: "Unable to read the CSV file. Please check the file format and try again.",
        failures: [],
      });
    } finally {
      setIsImportingCsv(false);
    }
  };

  const handleReservationChange = (event) => {
    const reservationId = event.target.value;
    const reservation = reservations.find((item) => String(item.id) === reservationId);

    setForm((current) => ({
      ...current,
      reservation: reservationId,
      client: reservation?.client || "",
      lot: reservation?.lot?.id || "",
      project: current.project || reservation?.lot?.subdivision_name || "",
    }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setToast(null);
    const payload = { ...form };

    ["reservation", "client", "lot", "agent", "manager", "broker"].forEach((field) => {
      if (payload[field]) {
        payload[field] = Number(payload[field]);
      } else {
        delete payload[field];
      }
    });

    [
      "agent_commission_percent",
      "manager_commission_percent",
      "broker_commission_percent",
    ].forEach((field) => {
      if (payload[field] === "") {
        delete payload[field];
      }
    });

    try {
      await api.post("sales-transactions/", payload);
      setForm(emptySale);
      setToast({ type: "success", message: "Sales transaction saved. Linked lots are updated automatically." });
      loadData();
      loadAvailableReservations();
    } catch {
      setToast({ type: "error", message: "Unable to save sales transaction. Please check required fields and reservation status." });
    }
  };

  const tcp = Number(form.total_contract_price || 0);
  const selectedReservation = reservations.find((item) => String(item.id) === String(form.reservation));
  const selectedReservationLot = selectedReservation?.lot || null;
  const commissionAmounts = commissionFields.reduce((amounts, field) => {
    amounts[field.amountName] = tcp && form[field.name]
      ? (tcp * Number(form[field.name])) / 100
      : 0;
    return amounts;
  }, {});
  const totalCommissionPayout = commissionFields.reduce(
    (total, field) => total + Number(commissionAmounts[field.amountName] || 0),
    0
  );
  const filteredSales = sales.filter((sale) => {
    const searchText = saleSearch.trim().toLowerCase();
    if (!searchText) return true;

    return [
      sale.project,
      sale.developer,
      sale.sale_date,
      sale.agent_name,
      sale.manager_name,
      sale.broker_name,
      sale.total_contract_price,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(searchText));
  });
  const pageSize = 8;
  const salesPageCount = Math.max(1, Math.ceil(filteredSales.length / pageSize));
  const currentSalesPage = Math.min(salesPage, salesPageCount);
  const pagedSales = filteredSales.slice((currentSalesPage - 1) * pageSize, currentSalesPage * pageSize);
  const summary = summarizeSales(filteredSales);

  useEffect(() => {
    setSalesPage((page) => Math.min(page, salesPageCount));
  }, [salesPageCount]);

  return (
    <div className={`role-dashboard${embedded ? " dashboard-sales-content" : ""}`}>
      <PageHeader
        title="Sales Transactions"
        subtitle="Create completed sales, link approved reservations, and review contract prices and commissions."
      />

      {!isLoadingSales && !salesError && <div className="role-stat-grid">
        <SummaryCard label="Total Sales" value={summary.total_sales || 0} helper="Matching completed transactions" icon="#" />
        <SummaryCard label="Total Contract Price" value={`PHP ${summary.total_contract_price || 0}`} helper="Closed value" icon="P" />
        {commissionFields.map((field) => (
          <SummaryCard
            key={field.name}
            label={field.label}
            value={`PHP ${summary[field.amountName] || 0}`}
            helper="Calculated payout"
            icon="%"
          />
        ))}
      </div>}

      <Toast type={toast?.type} message={toast?.message} onClose={() => setToast(null)} />

      {isAdmin && (
        <section className="role-panel sales-form-panel">
          <div className="sales-section-heading">
            <div>
              <h2>Add Sales Transaction</h2>
              <p>Record closed deals and assign commissions to registered staff.</p>
            </div>
            <div className="sales-csv-import">
              <label className={`sales-csv-button${isImportingCsv ? " disabled" : ""}`}>
                {isImportingCsv ? "Importing CSV..." : "Import CSV"}
                <input type="file" accept=".csv,text/csv" onChange={importCsv} disabled={isImportingCsv} />
              </label>
              <details className="sales-csv-help">
                <summary>CSV format</summary>
                <p>Use: project, sale_date, total_contract_price, agent, manager, broker, commission percents.</p>
              </details>
            </div>
          </div>

          {isImportingCsv && (
            <div className="sales-csv-progress">
              <LoadingSpinner label={csvProgress.total
                ? `Importing sales: ${csvProgress.processed} of ${csvProgress.total} rows processed...`
                : "Reading CSV file..."} />
              {csvProgress.total > 0 && (
                <progress
                  aria-label="CSV import progress"
                  value={csvProgress.processed}
                  max={csvProgress.total}
                />
              )}
            </div>
          )}

          {csvImportResult && (
            <div className={`sales-csv-result ${csvImportResult.type}`}>
              <strong>{csvImportResult.message}</strong>
              {csvImportResult.failures.length > 0 && (
                <ul>
                  {csvImportResult.failures.slice(0, 5).map((failure) => (
                    <li key={failure.rowNumber}>
                      Row {failure.rowNumber}: {failure.reason}
                    </li>
                  ))}
                  {csvImportResult.failures.length > 5 && (
                    <li>{csvImportResult.failures.length - 5} more failed rows hidden.</li>
                  )}
                </ul>
              )}
            </div>
          )}

          <form onSubmit={submit} className="sales-form">
            <section className="sales-form-section">
              <div className="sales-form-section-heading">
                <h3>Reservation & Sale Details</h3>
                <p>Link an approved reservation or record an older sale manually.</p>
              </div>

              <label className="sales-field sales-field-full">
                <span>Reservation</span>
                <select name="reservation" value={form.reservation} onChange={handleReservationChange}>
                  <option value="">No linked reservation</option>
                  {reservations.map((reservation) => (
                    <option key={reservation.id} value={reservation.id}>
                      {reservation.client_username || "Client"} - {reservation.lot?.block || "Block"}, Lot {reservation.lot?.lot_number || "-"}
                    </option>
                  ))}
                </select>
                <small>Choose an approved reservation to automatically connect the client and lot.</small>
              </label>

              {selectedReservation && selectedReservationLot && (
                <div className="reservation-summary-card">
                  <div>
                    <span>Client</span>
                    <strong>{selectedReservation.client_username || selectedReservation.client_name || "-"}</strong>
                  </div>
                  <div>
                    <span>Lot</span>
                    <strong>Lot {selectedReservationLot.lot_number || "-"}</strong>
                  </div>
                  <div>
                    <span>Block / Phase</span>
                    <strong>{selectedReservationLot.block || selectedReservationLot.block_number || "-"} / {selectedReservationLot.phase || "-"}</strong>
                  </div>
                  <div>
                    <span>Subdivision</span>
                    <strong>{selectedReservationLot.subdivision_name || selectedReservationLot.subdivision || "-"}</strong>
                  </div>
                </div>
              )}

              <div className="sales-form-grid">
                <label className="sales-field">
                  <span>Project <i>*</i></span>
                  <input name="project" value={form.project} onChange={handleChange} placeholder="e.g. Calmar Subdivision" required />
                  <small>Use the project or subdivision name shown on the reservation.</small>
                </label>
                <label className="sales-field">
                  <span>Developer</span>
                  <input name="developer" value={form.developer} onChange={handleChange} placeholder="Developer name" />
                  <small>Optional. Enter the developer or company name for this sale.</small>
                </label>
                <label className="sales-field">
                  <span>Sale Date <i>*</i></span>
                  <input name="sale_date" type="date" value={form.sale_date} onChange={handleChange} required />
                  <small>This date is used for monthly analytics and forecasting.</small>
                </label>
                <label className="sales-field">
                  <span>Total Contract Price <i>*</i></span>
                  <input name="total_contract_price" type="number" value={form.total_contract_price} onChange={handleChange} placeholder="Total contract price" required />
                  <small>Enter the final contract amount for the completed sale.</small>
                </label>
              </div>
            </section>

            <section className="sales-form-section">
              <div className="sales-form-section-heading">
                <h3>Assigned Staff</h3>
                <p>Select the staff members assigned to this sale.</p>
              </div>

              <div className="sales-staff-grid">
                <label className="sales-field">
                  <span>Agent</span>
                  <select name="agent" value={form.agent} onChange={handleChange}>
                    <option value="">Select agent</option>
                    {staffByRole.agent.map((staff) => (
                      <option key={staff.id} value={staff.id}>
                        {getUserName(staff)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="sales-field">
                  <span>Manager</span>
                  <select name="manager" value={form.manager} onChange={handleChange}>
                    <option value="">Select manager</option>
                    {staffByRole.manager.map((staff) => (
                      <option key={staff.id} value={staff.id}>
                        {getUserName(staff)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="sales-field">
                  <span>Broker</span>
                  <select name="broker" value={form.broker} onChange={handleChange}>
                    <option value="">Select broker</option>
                    {staffByRole.broker.map((staff) => (
                      <option key={staff.id} value={staff.id}>
                        {getUserName(staff)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            <section className="sales-form-section">
              <div className="sales-form-section-heading">
                <h3>Commission Details</h3>
                <p>Percentages are calculated from the total contract price.</p>
              </div>

              <div className="sales-commission-grid">
                {commissionFields.map((field) => {
                  const payout = commissionAmounts[field.amountName] || 0;
                  return (
                    <label className="sales-field" key={field.name}>
                      <span>{field.label} Percentage</span>
                      <input
                        name={field.name}
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={form[field.name]}
                        onChange={handleChange}
                        placeholder={field.placeholder}
                      />
                      <small className={payout ? "commission-estimate active" : "commission-estimate"}>
                        Estimated payout: {formatPeso(payout)}
                      </small>
                    </label>
                  );
                })}
              </div>

              <div className="commission-summary-card">
                <div>
                  <span>Total Contract Price</span>
                  <strong>{formatPeso(tcp)}</strong>
                </div>
                <div>
                  <span>Agent Commission</span>
                  <strong>{formatPeso(commissionAmounts.agent_commission)}</strong>
                </div>
                <div>
                  <span>Manager Commission</span>
                  <strong>{formatPeso(commissionAmounts.manager_commission)}</strong>
                </div>
                <div>
                  <span>Broker Commission</span>
                  <strong>{formatPeso(commissionAmounts.broker_commission)}</strong>
                </div>
                <div className="commission-summary-total">
                  <span>Total Commission Payout</span>
                  <strong>{formatPeso(totalCommissionPayout)}</strong>
                </div>
              </div>
            </section>

            <div className="sales-action-bar">
              <button type="button" className="btn-secondary sales-cancel-button" onClick={() => setForm(emptySale)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary sales-save-button">Save Sales Transaction</button>
            </div>
          </form>
        </section>
      )}

      <section className="role-panel properties-panel">
        <div className="properties-panel-header">
          <div>
            <h2>Sales Records</h2>
            <p>Search and review completed transaction records.</p>
          </div>
        </div>

        <FilterBar>
          <label className="sales-search-field">
            Search records
            <input
              value={saleSearch}
              onChange={(event) => setSaleSearch(event.target.value)}
              placeholder="Search by project, date, staff, or amount"
            />
          </label>
        </FilterBar>

        {isLoadingSales ? (
          <LoadingSpinner label="Loading sales records..." />
        ) : salesError ? <p role="alert">{salesError}</p> : filteredSales.length === 0 ? (
          <EmptyState
            title={sales.length === 0 ? "No sales records yet" : "No matching sales records"}
            message={
              sales.length === 0
                ? "Completed sales will appear here after an admin saves a sales transaction."
                : "Try a different project, staff name, date, or amount."
            }
          />
        ) : (
          <>
            <div className="properties-table-wrap">
              <table className="properties-table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Date</th>
                    <th>Agent</th>
                    <th>Manager</th>
                    <th>Broker</th>
                    <th>TCP</th>
                    <th>Agent Comm.</th>
                    <th>Manager Comm.</th>
                    <th>Broker Comm.</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedSales.map((sale) => (
                    <tr key={sale.id}>
                      <td>{sale.project}</td>
                      <td>{sale.sale_date}</td>
                      <td>{sale.agent_name || "-"}</td>
                      <td>{sale.manager_name || "-"}</td>
                      <td>{sale.broker_name || "-"}</td>
                      <td>PHP {sale.total_contract_price}</td>
                      <td>PHP {sale.agent_commission}</td>
                      <td>PHP {sale.manager_commission}</td>
                      <td>PHP {sale.broker_commission}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination
              page={currentSalesPage}
              pageCount={salesPageCount}
              onPrevious={() => setSalesPage((page) => Math.max(1, page - 1))}
              onNext={() => setSalesPage((page) => Math.min(salesPageCount, page + 1))}
            />
          </>
        )}
      </section>

    </div>
  );
}

