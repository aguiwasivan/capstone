import "../../components/RoleDashboard.css";

export default function AccessDenied() {
  return (
    <div className="role-dashboard">
      <div className="role-dashboard-header">
        <div>
          <h1>Access Denied</h1>
          <p>You do not have permission to access this page.</p>
        </div>
      </div>

      <section className="role-panel">
        <h2>Restricted Area</h2>
        <p>This section is limited based on your CityFavor role permissions.</p>
      </section>
    </div>
  );
}
