import { lazy, Suspense, useState } from "react";
import "../../components/RoleDashboard.css";
import { PageHeader } from "../../components/ui/UI";
import AnalyticsSkeleton from "./AnalyticsSkeleton";
import "./AnalyticsDashboard.css";

const SalesDashboard = lazy(() => import("../../components/SalesDashboard"));
const ReservationAnalytics = lazy(() => import("./ReservationAnalytics"));
const LotDemandPrediction = lazy(() => import("./LotDemandPrediction"));
const TopPerformingAgentsAnalytics = lazy(() => import("./TopPerformingAgentsAnalytics"));

const loadingLabels = {
  sales: "Loading sales analytics...",
  reservations: "Loading reservation analytics...",
  "lot-demand": "Loading zone demand analytics...",
  agents: "Loading agent performance...",
};

export default function AnalyticsDashboard() {
  const [activeSection, setActiveSection] = useState("sales");

  return (
    <div className="role-dashboard analytics-dashboard">
      <PageHeader
        title="Analytics Dashboard"
        subtitle="Review sales, reservation, and agent performance analytics in one workspace."
      />

      <section className="role-panel analytics-tabs-panel" aria-label="Analytics dashboard sections">
        <div className="analytics-tabs" role="tablist" aria-label="Analytics sections">
          <button
            type="button"
            role="tab"
            aria-selected={activeSection === "sales"}
            className={activeSection === "sales" ? "active" : ""}
            onClick={() => setActiveSection("sales")}
          >
            Sales Analytics
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSection === "reservations"}
            className={activeSection === "reservations" ? "active" : ""}
            onClick={() => setActiveSection("reservations")}
          >
            Reservation Analytics
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSection === "lot-demand"}
            className={activeSection === "lot-demand" ? "active" : ""}
            onClick={() => setActiveSection("lot-demand")}
          >
            Zone Demand
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSection === "agents"}
            className={activeSection === "agents" ? "active" : ""}
            onClick={() => setActiveSection("agents")}
          >
            Top Performing Agents
          </button>
        </div>
      </section>

      <Suspense fallback={<AnalyticsSkeleton label={loadingLabels[activeSection]} />}>
      {activeSection === "sales" && (
        <section className="analytics-section" aria-labelledby="sales-analytics-heading">
          <div className="analytics-section-heading">
            <span>01</span>
            <div>
              <h2 id="sales-analytics-heading">Sales Analytics</h2>
              <p>Sales totals, forecasts, commissions, and monthly and yearly trends.</p>
            </div>
          </div>
          <SalesDashboard roleName="Sales" embedded />
        </section>
      )}

      {activeSection === "reservations" && (
        <section className="analytics-section" aria-labelledby="reservation-analytics-heading">
          <div className="analytics-section-heading">
            <span>02</span>
            <div>
              <h2 id="reservation-analytics-heading">Reservation Analytics</h2>
              <p>Reservation demand, request statuses, conversion, and top reserved lots.</p>
            </div>
          </div>
          <ReservationAnalytics embedded />
        </section>
      )}

      {activeSection === "lot-demand" && (
        <section className="analytics-section" aria-labelledby="lot-demand-heading">
          <div className="analytics-section-heading">
            <span>03</span>
            <div>
              <h2 id="lot-demand-heading">Zone Demand</h2>
              <p>Compare Front, Central, and Rear zones using demand scores and available predictions.</p>
            </div>
          </div>
          <LotDemandPrediction embedded />
        </section>
      )}

      {activeSection === "agents" && (
        <section className="analytics-section" aria-labelledby="top-agents-heading">
          <div className="analytics-section-heading">
            <span>04</span>
            <div>
              <h2 id="top-agents-heading">Top Performing Agents</h2>
              <p>Agent rankings, sales conversion, monthly performance, and pipeline forecasts.</p>
            </div>
          </div>
          <TopPerformingAgentsAnalytics embedded />
        </section>
      )}
      </Suspense>
    </div>
  );
}
