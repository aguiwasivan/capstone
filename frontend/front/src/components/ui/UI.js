import "./UI.css";

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="ui-page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="ui-page-actions">{actions}</div>}
    </div>
  );
}

export function SummaryCard({ label, value, helper, icon }) {
  return (
    <section className="ui-summary-card">
      {icon && <span className="ui-summary-icon">{icon}</span>}
      <p>{label}</p>
      <strong>{value}</strong>
      {helper && <span>{helper}</span>}
    </section>
  );
}

const statusLabels = {
  available: "Available",
  reserved: "Reserved",
  sold: "Sold",
  pending: "Pending",
  approved: "Approved",
  declined: "Declined",
  rejected: "Declined",
  cancelled: "Cancelled",
  canceled: "Cancelled",
  completed: "Completed",
  closed: "Completed",
  paid: "Paid",
  unpaid: "Unpaid",
};

export function StatusBadge({ status }) {
  const normalizedStatus = String(status || "pending").toLowerCase();
  const label = statusLabels[normalizedStatus] || normalizedStatus.replace(/_/g, " ");

  return (
    <span className={`ui-status-badge status-${normalizedStatus}`}>
      {label}
    </span>
  );
}

export function EmptyState({ title = "No records found", message, action }) {
  return (
    <section className="ui-empty-state">
      <div className="ui-empty-icon" aria-hidden="true">i</div>
      <h2>{title}</h2>
      {message && <p>{message}</p>}
      {action && <div className="ui-empty-action">{action}</div>}
    </section>
  );
}

export function LoadingSpinner({ label = "Loading..." }) {
  return (
    <div className="ui-loading-state" role="status" aria-live="polite">
      <span className="ui-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function Toast({ type = "success", message, onClose }) {
  if (!message) return null;

  return (
    <div className={`ui-toast ui-toast-${type}`} role="status" aria-live="polite">
      <span>{message}</span>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Dismiss notification">
          Close
        </button>
      )}
    </div>
  );
}

export function ConfirmModal({
  open,
  title = "Confirm action",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  return (
    <div className="ui-modal-backdrop" role="presentation">
      <section className="ui-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title">{title}</h2>
        {message && <p>{message}</p>}
        <div className="ui-modal-actions">
          <button type="button" className="ui-button ui-button-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className={`ui-button ui-button-${tone}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

export function FilterBar({ children }) {
  return <div className="ui-filter-bar">{children}</div>;
}

export function TablePagination({ page, pageCount, onPrevious, onNext }) {
  if (pageCount <= 1) return null;

  return (
    <div className="ui-table-pagination">
      <button type="button" onClick={onPrevious} disabled={page <= 1}>
        Previous
      </button>
      <span>Page {page} of {pageCount}</span>
      <button type="button" onClick={onNext} disabled={page >= pageCount}>
        Next
      </button>
    </div>
  );
}
