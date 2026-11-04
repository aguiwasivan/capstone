import { useContext, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import "./RoleLayout.css";

function SidebarIcon({ name }) {
  const commonProps = {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };

  const icons = {
    LayoutDashboard: (
      <>
        <rect x="3" y="3" width="7" height="9" rx="1" />
        <rect x="14" y="3" width="7" height="5" rx="1" />
        <rect x="14" y="12" width="7" height="9" rx="1" />
        <rect x="3" y="16" width="7" height="5" rx="1" />
      </>
    ),
    Building2: (
      <>
        <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18" />
        <path d="M6 12H4a2 2 0 0 0-2 2v8" />
        <path d="M18 9h2a2 2 0 0 1 2 2v11" />
        <path d="M10 6h4M10 10h4M10 14h4M10 18h4" />
      </>
    ),
    Map: (
      <>
        <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6z" />
        <path d="M9 3v15M15 6v15" />
      </>
    ),
    Users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    BarChart3: (
      <>
        <path d="M3 3v18h18" />
        <path d="M8 17V9M13 17V5M18 17v-3" />
      </>
    ),
    Inbox: (
      <>
        <path d="M22 12h-6l-2 3h-4l-2-3H2" />
        <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      </>
    ),
    BadgeDollarSign: (
      <>
        <path d="M3.85 8.62a4 4 0 0 1 4.77-4.77 4 4 0 0 1 6.76 0 4 4 0 0 1 4.77 4.77 4 4 0 0 1 0 6.76 4 4 0 0 1-4.77 4.77 4 4 0 0 1-6.76 0 4 4 0 0 1-4.77-4.77 4 4 0 0 1 0-6.76z" />
        <path d="M12 7v10M15 9.5c-.5-.8-1.5-1.2-3-1.2-1.7 0-2.8.7-2.8 1.8 0 1.2 1 1.7 3 2 2 .3 3 .9 3 2.1 0 1.1-1.1 1.9-3.1 1.9-1.5 0-2.7-.4-3.5-1.3" />
      </>
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
    UserCog: (
      <>
        <circle cx="9" cy="7" r="4" />
        <path d="M2 21v-2a4 4 0 0 1 4-4h4" />
        <circle cx="17" cy="17" r="3" />
        <path d="M17 13v1M17 20v1M13 17h1M20 17h1" />
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

  if (!name || !icons[name]) return null;
  return <svg className="role-sidebar-icon" {...commonProps}>{icons[name]}</svg>;
}

export default function RoleLayout({ roleName, basePath, links }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { user, logout } = useContext(AuthContext);
  const displayName =
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
    user?.username ||
    roleName;
  const dashboardPath = `${basePath}/dashboard`;

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
        <SidebarIcon name={isSidebarOpen ? "X" : "Menu"} />
      </button>
      <button
        type="button"
        className="role-sidebar-backdrop"
        aria-label="Close navigation"
        onClick={() => setIsSidebarOpen(false)}
      />

      <aside className="role-sidebar" aria-label={`${roleName} sidebar`}>
        <div className="role-sidebar-body">
          <div className="role-sidebar-top">
            <div className="role-sidebar-header">
              <span className="role-logo-mark" />
              <div>
                <h2>CityFavor</h2>
                <p>{roleName} Panel</p>
              </div>
            </div>

            <div className="role-user-card">
              <span className="role-user-avatar">{displayName.charAt(0).toUpperCase()}</span>
              <div>
                <strong>{displayName}</strong>
                <small>{user?.email || `${roleName} account`}</small>
              </div>
            </div>
          </div>

          <nav className="role-sidebar-nav" aria-label={`${roleName} navigation`}>
            {links.map((link, index) => {
              const previousGroup = links[index - 1]?.group;
              const showGroup = link.group && link.group !== previousGroup;

              return (
                <div key={link.to} className="role-sidebar-nav-item">
                  {showGroup && <span className="role-sidebar-group">{link.group}</span>}
                  <NavLink
                    to={link.to}
                    end={link.to === basePath}
                    className={({ isActive }) => {
                      const isDashboardAtIndex =
                        link.to === dashboardPath && location.pathname === basePath;

                      return `role-sidebar-link${isActive || isDashboardAtIndex ? " active" : ""}`;
                    }}
                  >
                    <SidebarIcon name={link.icon} />
                    <span>{link.label}</span>
                  </NavLink>
                </div>
              );
            })}
          </nav>
        </div>

        <div className="role-sidebar-footer">
          <button type="button" className="role-logout-button" onClick={handleLogout}>
            <SidebarIcon name="LogOut" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="role-main-content">
        <Outlet />
      </main>
    </div>
  );
}
