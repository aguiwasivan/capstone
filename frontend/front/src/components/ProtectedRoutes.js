import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children, role, user }) {
  const userRole = String(user?.role || "").toLowerCase();

  if (!user) return <Navigate to="/login" replace />;
  if (role && userRole !== role) return <Navigate to="/" replace />;
  return children;
}
