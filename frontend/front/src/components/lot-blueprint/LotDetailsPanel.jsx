import { canRequestReservation, formatCurrency, lotStatusClass } from "./lotBlueprintUtils";
import "./LotBlueprint.css";

function getLocationHref(value) {
  const location = String(value || "").trim();
  if (!location) return "";
  if (/^https?:\/\//i.test(location)) return location;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

export default function LotDetailsPanel({
  lot,
  role,
  isRequesting,
  requestMessage,
  onRequestReservation,
  onEditDetails,
}) {
  const legend = (
    <div className="lot-details-legend">
      <p className="lot-panel-eyebrow">Legend</p>
      <div className="lot-details-legend-grid">
        <span className="legend-row"><i className="legend-swatch available" />Available</span>
        <span className="legend-row"><i className="legend-swatch pending" />Pending</span>
        <span className="legend-row"><i className="legend-swatch reserved" />Reserved</span>
        <span className="legend-row"><i className="legend-swatch sold" />Sold</span>
        <span className="legend-row"><i className="legend-swatch open-space" />Open Space</span>
      </div>
    </div>
  );

  if (!lot) {
    return (
      <aside className="lot-details-panel">
        {legend}
        <p className="lot-panel-eyebrow">Lot Details</p>
        <h3>No lot selected</h3>
        <p className="lot-panel-muted">Select a polygon on the blueprint to view details.</p>
      </aside>
    );
  }

  const statusClass = lotStatusClass(lot.status);
  const canReserve = canRequestReservation(role) && statusClass === "available";
  const locationHref = getLocationHref(lot.location_url);

  return (
    <aside className="lot-details-panel">
      {legend}
      <div className="lot-details-heading">
        <div>
          <p className="lot-panel-eyebrow">Lot Details</p>
          <h3>
            Block {lot.block_number || "Not yet provided"}, Lot {lot.lot_number || "Not yet provided"}
          </h3>
        </div>
        <span className={`lot-status-badge ${statusClass}`}>{lot.status || "available"}</span>
      </div>

      <dl className="lot-detail-list">
        <div>
          <dt>Subdivision</dt>
          <dd>{lot.subdivision || "Not yet provided"}</dd>
        </div>
        <div>
          <dt>Phase</dt>
          <dd>{lot.phase || "Not yet provided"}</dd>
        </div>
        <div>
          <dt>Block Number</dt>
          <dd>{lot.block_number || "Not yet provided"}</dd>
        </div>
        <div>
          <dt>Lot Number</dt>
          <dd>{lot.lot_number || "Not yet provided"}</dd>
        </div>
        <div>
          <dt>Area/sqm</dt>
          <dd>{lot.area_sqm != null ? `${Number(lot.area_sqm).toLocaleString()} sqm` : "Not yet provided"}</dd>
        </div>
        <div>
          <dt>Price</dt>
          <dd>{lot.price == null ? "Not yet provided" : lot.price === 0 ? "₱0" : formatCurrency(lot.price)}</dd>
        </div>
        <div><dt>Classification</dt><dd>{lot.category || "Not yet provided"}</dd></div>
        <div><dt>Location Zone</dt><dd>{lot.location_zone || "unassigned"}</dd></div>
        <div><dt>Description</dt><dd>{lot.description || "Not yet provided"}</dd></div>
      </dl>
      {onEditDetails && <button type="button" onClick={onEditDetails}>Edit Details</button>}

      <div className="lot-location-card">
        <div>
          <p className="lot-panel-eyebrow">Location</p>
          <p className="lot-panel-muted">
            {lot.location_url ? "Open the saved map location for this lot." : "Not yet provided"}
          </p>
        </div>

        {locationHref ? (
          <a className="lot-location-link" href={locationHref} target="_blank" rel="noreferrer">
            View Location
          </a>
        ) : null}
      </div>

      {canRequestReservation(role) && (
        <div className="lot-reservation-actions">
          <button type="button" onClick={() => onRequestReservation(lot)} disabled={!canReserve || isRequesting}>
            {isRequesting ? "Sending Request..." : "Request Reservation"}
          </button>
          {requestMessage && <p>{requestMessage}</p>}
        </div>
      )}
    </aside>
  );
}
