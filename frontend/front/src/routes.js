export const dashboardRoutes = {
  admin: "/admin/dashboard",
  client: "/client/dashboard",
  manager: "/manager/dashboard",
  broker: "/broker/dashboard",
  agent: "/agent/dashboard",
};

export const clientRoutes = {
  lot: "/client/lot",
  favorites: "/client/favorites",
  reservations: "/client/reservations",
  profile: "/client/profile",
};

export function getDashboardRoute(role) {
  return dashboardRoutes[String(role || "").toLowerCase()] || "/";
}
