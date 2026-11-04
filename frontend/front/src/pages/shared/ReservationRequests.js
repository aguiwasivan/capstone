import { useEffect, useState } from "react";
import api from "../../api";
import { ConfirmModal, EmptyState, LoadingSpinner, PageHeader, StatusBadge, Toast } from "../../components/ui/UI";
import "./ReservationRequests.css";

export default function ReservationRequests({ reviewerRole = "Staff", canReview = true }) {
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [requestToDecline, setRequestToDecline] = useState(null);
  const [agents, setAgents] = useState([]);
  const [assigning, setAssigning] = useState(null);

  useEffect(() => {
    if (!canReview) return;
    let active = true;
    api.get("reservation-agents/").then(({ data }) => {
      if (active) setAgents(data);
    }).catch(() => {
      if (active) setToast({ type: "error", message: "Unable to load agents for assignment." });
    });
    return () => { active = false; };
  }, [canReview]);

  const assignAgent = async (request, value) => {
    setAssigning(request.id);
    try {
      const { data } = await api.patch(`reservation-requests/${request.id}/agent/`, {
        assigned_agent: value ? Number(value) : null,
      });
      setRequests((current) => current.map((item) => item.id === request.id ? data : item));
      setToast({ type: "success", message: "Agent assignment updated." });
    } catch (error) {
      setToast({ type: "error", message: error.response?.data?.detail || "Unable to assign this agent." });
    } finally {
      setAssigning(null);
    }
  };

  useEffect(() => {
    const fetchReservationRequests = async () => {
      setIsLoading(true);
      try {
        const res = await api.get("reservation-requests/");
        setRequests(res.data);
        setToast(null);
      } catch {
        setToast({ type: "error", message: "Unable to load reservation requests. Please try again." });
      } finally {
        setIsLoading(false);
      }
    };

    fetchReservationRequests();
  }, []);

  const approveRequest = async (request) => {
    setToast(null);

    try {
      const res = await api.post(`reservation-requests/${request.id}/approve/`);

      setRequests((prev) =>
        prev.map((item) => (item.id === request.id ? res.data : item))
      );
      setToast({ type: "success", message: "Reservation approved. The lot is now reserved." });
    } catch {
      setToast({ type: "error", message: "Unable to approve this reservation. The lot may no longer be available." });
    }
  };

  const declineRequest = async (request) => {
    setToast(null);

    try {
      const res = await api.post(`reservation-requests/${request.id}/decline/`);

      setRequests((prev) =>
        prev.map((item) => (item.id === request.id ? res.data : item))
      );
      setToast({ type: "success", message: "Reservation request declined." });
    } catch {
      setToast({ type: "error", message: "Unable to decline this reservation. Please try again." });
    } finally {
      setRequestToDecline(null);
    }
  };

  return (
    <div className="reservation-requests">
      <PageHeader
        title="Reservation Requests"
        subtitle={
          canReview
            ? "Review client lot reservation requests, approve available lots, or decline requests that cannot move forward."
            : "View client lot reservation requests and monitor their current status."
        }
      />

      <Toast type={toast?.type} message={toast?.message} onClose={() => setToast(null)} />

      {isLoading ? (
        <LoadingSpinner label="Loading reservation requests..." />
      ) : requests.length === 0 ? (
        <EmptyState
          title="No reservation requests"
          message="When a client clicks Reserve This Lot, the request will appear here for review."
        />
      ) : (
        <div className="request-list">
          {requests.map((request) => (
            <article key={request.id} className="request-card">
              <div>
                <StatusBadge status={request.status} />

                <h2>
                  {request.lot?.block || "Lot"}, Lot {request.lot?.lot_number || "-"}
                </h2>

                <p>
                  {request.client_username || "A client"} requested {request.lot?.area || "-"} sqm on{" "}
                  {request.created_at
                    ? new Date(request.created_at).toLocaleString()
                    : "unknown date"}.
                </p>

                {reviewerRole === "Agent" && (
                  <div className="request-client-contact">
                    <p className="request-contact-title">Client contact</p>
                    <div className="request-contact-links">
                      {request.client_email ? (
                        <a href={`mailto:${request.client_email}`}>
                          Email: {request.client_email}
                        </a>
                      ) : (
                        <span>Email: Not provided</span>
                      )}
                      {request.client_phone_number ? (
                        <a href={`tel:${request.client_phone_number}`}>
                          Phone: {request.client_phone_number}
                        </a>
                      ) : (
                        <span>Phone: Not provided</span>
                      )}
                    </div>
                  </div>
                )}

                {request.reviewed_by_username && (
                  <p className="request-approved">
                    Reviewed by {request.reviewed_by_username} on{" "}
                    {request.reviewed_at
                      ? new Date(request.reviewed_at).toLocaleString()
                      : "unknown date"}
                  </p>
                )}
                {canReview ? (
                  <label>
                    Assigned agent{" "}
                    <select aria-label={`Assigned agent for reservation ${request.id}`}
                      value={request.assigned_agent || ""}
                      disabled={assigning !== null}
                      onChange={(event) => assignAgent(request, event.target.value)}>
                      <option value="">Unassigned</option>
                      {request.assigned_agent && !agents.some((agent) => agent.id === request.assigned_agent) &&
                        <option value={request.assigned_agent}>{request.assigned_agent_name || "Inactive agent"}</option>}
                      {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                    </select>
                  </label>
                ) : <p>Assigned agent: {request.assigned_agent_name || "Unassigned"}</p>}
              </div>

              {canReview ? (
                <div className="request-actions">
                  <button
                    type="button"
                    className="request-accept-button"
                    onClick={() => approveRequest(request)}
                    disabled={request.status !== "pending"}
                  >
                    {request.status === "approved"
                      ? "Approved"
                      : "Accept Reservation"}
                  </button>
                  <button
                    type="button"
                    className="request-decline-button"
                    onClick={() => setRequestToDecline(request)}
                    disabled={request.status !== "pending"}
                  >
                    {["declined", "rejected"].includes(request.status) ? "Declined" : "Decline"}
                  </button>
                </div>
              ) : (
                <p className="request-view-only">View only</p>
              )}
            </article>
          ))}
        </div>
      )}

      <ConfirmModal
        open={Boolean(requestToDecline)}
        title="Decline reservation?"
        message="This will mark the client's request as declined. The client will see that the reservation did not move forward."
        confirmLabel="Decline Request"
        tone="danger"
        onCancel={() => setRequestToDecline(null)}
        onConfirm={() => declineRequest(requestToDecline)}
      />
    </div>
  );
}
