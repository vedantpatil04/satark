import React from "react";
import { Navigate, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  allowedRole?: "teacher" | "student";
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allowedRole }) => {
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
    const isTeacherRoute = location.pathname.startsWith("/teacher");
    return <Navigate to={isTeacherRoute ? "/teacher/login" : "/student/login"} state={{ from: location }} replace />;
  }

  if (allowedRole && user.role !== allowedRole) {
    // Redirect to correct dashboard based on actual server-verified role
    return <Navigate to={user.role === "teacher" ? "/teacher/dashboard" : "/student/dashboard"} replace />;
  }

  return <Outlet />;
};
