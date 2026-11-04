import "./AnalyticsSkeleton.css";

export default function AnalyticsSkeleton({ label = "Loading analytics...", cards = 5, charts = 2, table = true }) {
  return (
    <div className="analytics-skeleton" role="status" aria-live="polite" aria-label={label}>
      <p className="analytics-skeleton-message">{label}</p>
      <div className="analytics-skeleton-cards" aria-hidden="true">
        {Array.from({ length: cards }, (_, index) => (
          <div className="analytics-skeleton-card" key={index}>
            <span className="analytics-skeleton-line short" />
            <span className="analytics-skeleton-line value" />
            <span className="analytics-skeleton-line" />
          </div>
        ))}
      </div>
      {!!charts && (
        <div className="analytics-skeleton-charts" aria-hidden="true">
          {Array.from({ length: charts }, (_, index) => (
            <div className="analytics-skeleton-chart" key={index}>
              <span className="analytics-skeleton-line short" />
              <span className="analytics-skeleton-chart-body" />
            </div>
          ))}
        </div>
      )}
      {table && (
        <div className="analytics-skeleton-table" aria-hidden="true">
          {Array.from({ length: 5 }, (_, index) => <span key={index} />)}
        </div>
      )}
    </div>
  );
}
