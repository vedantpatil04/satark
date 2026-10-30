import React from "react";
import { Navigate, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { Loader2 } from "lucide-react";

export interface ProtectedRouteProps {
  allowedRole?: "teacher" | "student";
  loginPath?: string;
  unauthorizedPath?: string;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  allowedRole,
  loginPath = "/login",
  unauthorizedPath,
}) => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground font-medium">Verifying authorization...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to={loginPath} state={{ from: location }} replace />;
  }

  if (allowedRole && user.role !== allowedRole) {
    if (unauthorizedPath) {
      return <Navigate to={unauthorizedPath} replace />;
    }
    // Cross-role safety redirect
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md w-full bg-card border border-destructive/30 rounded-xl p-6 text-center space-y-4 shadow-lg">
          <h2 className="text-xl font-bold text-destructive">Unauthorized Portal Access</h2>
          <p className="text-sm text-muted-foreground">
            You are authenticated as a <strong>{user.role}</strong> ({user.email}), which does not have permission to access the <strong>{allowedRole}</strong> portal.
          </p>
          <a
            href={user.role === "teacher" ? "/teacher" : "/student"}
            className="inline-block px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
          >
            Switch to {user.role === "teacher" ? "Teacher" : "Student"} Portal
          </a>
        </div>
      </div>
    );
  }

  return <Outlet />;
};

