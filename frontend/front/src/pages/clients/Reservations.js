import { useEffect, useState } from "react";
import api from "../../api";
import "./Reservations.css";

export default function Reservations() {
  const [reservations, setReservations] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("reservation-requests/")
      .then((res) => setReservations(res.data))
      .catch(() => setError("Unable to load notifications."));
  }, []);

  return (
    <div className="client-reservations">
      <h1>Notifications</h1>

      {error && <p className="reservation-error">{error}</p>}

      {reservations.length === 0 ? (
        <section className="reservation-empty">
          <h2>No notifications yet</h2>
        </section>
      ) : (
        <div className="reservation-list">
          {reservations.map((reservation) => (
            <article key={reservation.id} className="reservation-card">
              <div>
                <p className={`reservation-status ${String(reservation.status || "pending").toLowerCase()}`}>
                  {reservation.status || "pending"}
                </p>
                <h2>
                  {reservation.lot?.block || "Lot"}, Lot {reservation.lot?.lot_number || "-"}
                </h2>
                <p>{reservation.lot?.area || "-"} sqm</p>
                {reservation.status === "approved" && (
                  <p className="reservation-message-text">
                    Approved by {reservation.reviewed_by_username || "Staff"}.
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
