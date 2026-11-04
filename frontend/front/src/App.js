// src/App.js
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import { AuthProvider, AuthContext } from "./context/AuthContext";
import { lazy, Suspense, useContext } from "react";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ProtectedRoute from "./components/ProtectedRoutes";
import RoleLayout from "./components/RoleLayout";

// Admin
import Dashboard from "./pages/admin/Dashboard";
import Notifications from "./pages/admin/Notifications";
import Settings from "./pages/admin/Settings";
import Users from "./pages/admin/Users";

// Client
import ClientLayout from "./pages/clients/ClientLayout";
import Properties from "./pages/clients/Properties";
import Favorites from "./pages/clients/Favorites";
import Reservations from "./pages/clients/Reservations";
import Profile from "./pages/clients/Profile";

// Other roles
import ManagerDashboard from "./pages/manager/Dashboard";
import BrokerDashboard from "./pages/broker/Dashboard";
import ReservationRequests from "./pages/shared/ReservationRequests";
import ReservationAnalytics from "./pages/shared/ReservationAnalytics";
import TopPerformingAgentsAnalytics from "./pages/shared/TopPerformingAgentsAnalytics";
import AnalyticsDashboard from "./pages/shared/AnalyticsDashboard";
import SalesTransactions from "./pages/shared/SalesTransactions";
import PropertyListings from "./pages/shared/PropertyListings";
import AccessDenied from "./pages/shared/AccessDenied";
import AgentDashboard from "./pages/agents/Dashboard";

const Reports = lazy(() => import("./pages/admin/Reports"));

function ReportsRoute() {
  return (
    <Suspense fallback={<div className="role-dashboard"><p role="status">Loading sales reports...</p></div>}>
      <Reports />
    </Suspense>
  );
}

function RoleAccess({ user, allowedRoles, children }) {
  const userRole = String(user?.role || "").toLowerCase();
  const normalizedAllowedRoles = allowedRoles.map((role) => role.toLowerCase());

  if (!normalizedAllowedRoles.includes(userRole)) {
    return <AccessDenied />;
  }

  return children;
}

function monitoringLinks(basePath, { includeNotifications = false } = {}) {
  return [
    { label: "Reports", to: `${basePath}/reports`, group: "Main", icon: "BarChart3" },
    ...(includeNotifications
      ? [{ label: "Notifications", to: `${basePath}/notifications`, group: "Monitoring", icon: "Bell" }]
      : []),
  ];
}

function AppRoutes() {
  const { user } = useContext(AuthContext);

  return (
    <Routes>
      {/* PUBLIC ROUTES */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* ================= ADMIN ================= */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute user={user} role="admin">
            <RoleLayout
              roleName="Admin"
              basePath="/admin"
              links={[
                { label: "Dashboard", to: "/admin/dashboard", group: "Main", icon: "LayoutDashboard" },
                ...monitoringLinks("/admin", { includeNotifications: true }),
                { label: "Property Listings", to: "/admin/property-listings/sale", group: "Property Management", icon: "Building2" },
                { label: "Lots", to: "/admin/properties", group: "Property Management", icon: "Map" },
                { label: "Sales Transactions", to: "/admin/sales", group: "Property Management", icon: "BadgeDollarSign" },
                { label: "Users", to: "/admin/users", group: "User Management", icon: "Users" },
                { label: "Profile", to: "/admin/profile", group: "Account", icon: "UserCog" },
              ]}
            />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="users" element={<Users />} />
        <Route path="properties" element={<Properties />} />
        <Route path="blueprints" element={<Navigate to="/admin/properties" replace />} />
        <Route path="property-listings" element={<Navigate to="/admin/property-listings/sale" replace />} />
        <Route path="property-listings/:listingType" element={<PropertyListings basePath="/admin/property-listings" />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="sales" element={<SalesTransactions />} />
        <Route path="reports" element={<ReportsRoute />} />
        <Route path="analytics-dashboard" element={<AnalyticsDashboard />} />
        <Route path="reservation-analytics" element={<ReservationAnalytics />} />
        <Route path="top-performing-agents" element={<TopPerformingAgentsAnalytics />} />
        <Route path="profile" element={<Profile />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      {/* ================= CLIENT ================= */}
      <Route
        path="/client"
        element={
          <ProtectedRoute user={user} role="client">
            <ClientLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/client/lot" replace />} />
        <Route path="dashboard" element={<Navigate to="/client/lot" replace />} />
        <Route path="lot" element={<Properties />} />
        <Route path="blueprint" element={<Navigate to="/client/lot" replace />} />
        <Route path="properties" element={<Navigate to="/client/property-listings/sale" replace />} />
        <Route path="property-listings" element={<Navigate to="/client/property-listings/sale" replace />} />
        <Route path="property-listings/:listingType" element={<PropertyListings basePath="/client/property-listings" />} />
        <Route path="favorites" element={<Favorites />} />
        <Route path="reservations" element={<Reservations />} />
        <Route path="profile" element={<Profile />} />
      </Route>

      {/* ================= OTHER ROLES ================= */}
      <Route
        path="/manager"
        element={
          <ProtectedRoute user={user} role="manager">
            <RoleLayout
              roleName="Manager"
              basePath="/manager"
              links={[
                { label: "Dashboard", to: "/manager/dashboard", group: "Main", icon: "LayoutDashboard" },
                ...monitoringLinks("/manager"),
                { label: "Property Listings", to: "/manager/property-listings/sale", group: "Property Management", icon: "Building2" },
                { label: "Lots", to: "/manager/properties", group: "Property Management", icon: "Map" },
                { label: "Sales Transactions", to: "/manager/sales", group: "Property Management", icon: "BadgeDollarSign" },
                { label: "Requests", to: "/manager/requests", group: "Client Management", icon: "Inbox" },
                { label: "Profile", to: "/manager/profile", group: "Account", icon: "User" },
              ]}
            />
          </ProtectedRoute>
        }
      >
        <Route index element={<ManagerDashboard />} />
        <Route path="dashboard" element={<ManagerDashboard />} />
        <Route path="properties" element={<Properties />} />
        <Route path="property-listings" element={<Navigate to="/manager/property-listings/sale" replace />} />
        <Route path="property-listings/:listingType" element={<PropertyListings basePath="/manager/property-listings" />} />
        <Route path="sales" element={<SalesTransactions />} />
        <Route path="requests" element={<ReservationRequests reviewerRole="Manager" />} />
        <Route
          path="reports"
          element={
            <RoleAccess user={user} allowedRoles={["admin", "manager"]}>
              <ReportsRoute />
            </RoleAccess>
          }
        />
        <Route
          path="analytics-dashboard"
          element={
            <RoleAccess user={user} allowedRoles={["admin", "manager"]}>
              <AnalyticsDashboard />
            </RoleAccess>
          }
        />
        <Route
          path="reservation-analytics"
          element={
            <RoleAccess user={user} allowedRoles={["admin", "manager"]}>
              <ReservationAnalytics />
            </RoleAccess>
          }
        />
        <Route
          path="top-performing-agents"
          element={
            <RoleAccess user={user} allowedRoles={["admin", "manager"]}>
              <TopPerformingAgentsAnalytics />
            </RoleAccess>
          }
        />
        <Route path="profile" element={<Profile />} />
      </Route>

      <Route
        path="/broker"
        element={
          <ProtectedRoute user={user} role="broker">
            <RoleLayout
              roleName="Broker"
              basePath="/broker"
              links={[
                { label: "Dashboard", to: "/broker/dashboard", icon: "LayoutDashboard" },
                { label: "Property Listings", to: "/broker/property-listings/sale", group: "Property Management", icon: "Building2" },
                { label: "Lots", to: "/broker/properties", group: "Property Management", icon: "Map" },
                { label: "Sales Transactions", to: "/broker/sales", group: "Property Management", icon: "BadgeDollarSign" },
                { label: "Requests", to: "/broker/requests", group: "Client Management", icon: "Inbox" },
                { label: "Profile", to: "/broker/profile", group: "Account", icon: "User" },
              ]}
            />
          </ProtectedRoute>
        }
      >
        <Route index element={<BrokerDashboard />} />
        <Route path="dashboard" element={<BrokerDashboard />} />
        <Route path="properties" element={<Properties />} />
        <Route path="property-listings" element={<Navigate to="/broker/property-listings/sale" replace />} />
        <Route path="property-listings/:listingType" element={<PropertyListings basePath="/broker/property-listings" />} />
        <Route path="sales" element={<SalesTransactions />} />
        <Route path="requests" element={<ReservationRequests reviewerRole="Broker" />} />
        <Route path="reports" element={<AccessDenied />} />
        <Route path="profile" element={<Profile />} />
      </Route>

      <Route
        path="/agent"
        element={
          <ProtectedRoute user={user} role="agent">
            <RoleLayout
              roleName="Agent"
              basePath="/agent"
              links={[
                { label: "Dashboard", to: "/agent/dashboard", icon: "LayoutDashboard" },
                { label: "Property Listings", to: "/agent/property-listings/sale", group: "Property Management", icon: "Building2" },
                { label: "Lots", to: "/agent/properties", group: "Property Management", icon: "Map" },
                { label: "Sales Transactions", to: "/agent/sales", group: "Property Management", icon: "BadgeDollarSign" },
                { label: "Requests", to: "/agent/requests", group: "Client Management", icon: "Inbox" },
                { label: "Profile", to: "/agent/profile", group: "Account", icon: "User" },
              ]}
            />
          </ProtectedRoute>
        }
      >
        <Route index element={<AgentDashboard />} />
        <Route path="dashboard" element={<AgentDashboard />} />
        <Route path="properties" element={<Properties />} />
        <Route path="property-listings" element={<Navigate to="/agent/property-listings/sale" replace />} />
        <Route path="property-listings/:listingType" element={<PropertyListings basePath="/agent/property-listings" />} />
        <Route path="sales" element={<SalesTransactions />} />
        <Route path="requests" element={<ReservationRequests reviewerRole="Agent" canReview={false} />} />
        <Route path="reports" element={<AccessDenied />} />
        <Route path="profile" element={<Profile />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
