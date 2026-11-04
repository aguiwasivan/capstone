import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useContext, useEffect, useState } from "react";
import { AuthContext } from "../../context/AuthContext";
import { clientRoutes } from "../../routes";
import "../../components/RoleLayout.css";
import "./ClientLayout.css";

function ClientSidebarIcon({ name }) {
  const commonProps = {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    ariaHidden: "true",
  };
  const icons = {
    Home: (
      <>
        <path d="M3 11l9-8 9 8" />
        <path d="M5 10v11h14V10" />
        <path d="M9 21v-6h6v6" />
      </>
    ),
    Building: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2" />
      </>
    ),
    Map: (
      <>
        <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6z" />
        <path d="M9 3v15M15 6v15" />
      </>
    ),
    Heart: (
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
    ),
    Bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),
    User: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    LogOut: (
      <>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path d="M16 17l5-5-5-5" />
        <path d="M21 12H9" />
      </>
    ),
    Menu: (
      <>
        <path d="M4 6h16" />
        <path d="M4 12h16" />
        <path d="M4 18h16" />
      </>
    ),
    X: (
      <>
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </>
    ),
  };

  if (!icons[name]) return null;
  return <svg className="role-sidebar-icon" {...commonProps}>{icons[name]}</svg>;
}

function ClientNavLink({ to, label, icon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `role-sidebar-link${isActive ? " active" : ""}`}
    >
      <ClientSidebarIcon name={icon} />
      <span>{label}</span>
    </NavLink>
  );
}

export default function ClientLayout() {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const clientName =
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
    user?.username ||
    "Client";

  const handleLogout = () => {
    setIsSidebarOpen(false);
    logout();
    navigate("/login", { replace: true });
  };

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className={`role-layout${isSidebarOpen ? " sidebar-open" : ""}`}>
      <button
        type="button"
        className="role-sidebar-toggle"
        aria-label={isSidebarOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={isSidebarOpen}
        onClick={() => setIsSidebarOpen((open) => !open)}
      >
        <ClientSidebarIcon name={isSidebarOpen ? "X" : "Menu"} />
      </button>
      <button
        type="button"
        className="role-sidebar-backdrop"
        aria-label="Close navigation"
        onClick={() => setIsSidebarOpen(false)}
      />

      <aside className="role-sidebar" aria-label="Client sidebar">
        <div>
          <div className="role-sidebar-header">
            <span className="role-logo-mark" />
            <div>
              <h2>CityFavor</h2>
            </div>
          </div>

          <div className="role-user-card">
            <span className="role-user-avatar">{clientName.charAt(0).toUpperCase()}</span>
            <div>
              <strong>{clientName}</strong>
              <small>{user?.email || "Client account"}</small>
            </div>
          </div>

          <nav className="role-sidebar-nav" aria-label="Client navigation">
            <div className="role-sidebar-nav-item">
              <span className="role-sidebar-group">Properties</span>
              <ClientNavLink to="/client/property-listings/sale" label="For Sale" icon="Home" />
              <ClientNavLink to="/client/property-listings/rent" label="For Rent" icon="Building" />
              <ClientNavLink to={clientRoutes.lot} label="Lots" icon="Map" />
            </div>

            <div className="role-sidebar-nav-item">
              <span className="role-sidebar-group">My Activity</span>
              <ClientNavLink to={clientRoutes.favorites} label="Favorites" icon="Heart" />
              <ClientNavLink to={clientRoutes.reservations} label="Notifications" icon="Bell" />
            </div>

            <div className="role-sidebar-nav-item">
              <span className="role-sidebar-group">Account</span>
              <ClientNavLink to={clientRoutes.profile} label="Profile" icon="User" />
            </div>
          </nav>
        </div>

        <div className="role-sidebar-footer">
          <button type="button" onClick={handleLogout} className="role-logout-button">
            <ClientSidebarIcon name="LogOut" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <div className="client-shell">
        <header className="client-topbar">
          <h3>Client Portal</h3>
        </header>

        <main className="client-main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
