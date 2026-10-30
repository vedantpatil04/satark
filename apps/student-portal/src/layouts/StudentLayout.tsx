import React, { useState } from "react";
import { Link, useLocation, useNavigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useRealtimeSocket } from "@/hooks/useRealtimeSocket";
import {
  Home,
  BookOpen,
  FileText,
  Target,
  History,
  Bell,
  LogOut,
  Menu,
  X,
  Wifi,
  Sparkles
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const StudentLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Real-time WebSocket connection to /ws/student
  const { isConnected } = useRealtimeSocket({
    channel: "student",
    onMessage: (msg) => {
      if (msg.type === "focus_nudge") {
        toast.info("Gentle Focus Reminder", {
          description: msg.message || "Keep your focus locked on your study goal!",
        });
      } else if (msg.type === "teacher_announcement") {
        toast.warning("Exam Announcement", {
          description: msg.announcement,
        });
      } else if (msg.type === "session_state_change") {
        toast.info(`Exam State Updated: ${msg.status}`);
      }
    },
  });

  const navItems = [
    { label: "Dashboard", path: "/student/dashboard", icon: Home },
    { label: "My Classes", path: "/student/classrooms", icon: BookOpen },
    { label: "Exams", path: "/student/exams", icon: FileText },
    { label: "Focus Workstation", path: "/student/focus", icon: Target },
    { label: "Study History", path: "/student/history", icon: History },
    { label: "Notifications", path: "/student/notifications", icon: Bell },
  ];

  const handleLogout = () => {
    logout();
    navigate("/student/login");
    toast.info("Logged out successfully");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Mobile Bar */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <span className="font-bold text-foreground">Student Portal</span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded-lg hover:bg-muted text-foreground"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar Navigation */}
      <aside
        className={`fixed md:sticky top-0 left-0 z-40 w-64 h-screen border-r border-border bg-card/95 backdrop-blur flex flex-col justify-between transition-transform duration-200 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div>
          {/* Logo Brand */}
          <div className="p-6 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-bold text-foreground text-sm tracking-tight">Smart Classroom</h2>
                <Badge variant="outline" className="text-[10px] uppercase font-bold text-emerald-500 border-emerald-500/30 mt-0.5">
                  Student Portal
                </Badge>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path || (item.path !== "/student/dashboard" && location.pathname.startsWith(`${item.path}/`));
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer User Info */}
        <div className="p-4 border-t border-border bg-card/50">
          <div className="flex items-center justify-between mb-3">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
              <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
              {isConnected ? "Connected" : "Offline Sync"}
            </span>
            <Badge variant="secondary" className="text-[10px]">
              STUDENT
            </Badge>
          </div>
          <div className="mb-3">
            <p className="text-sm font-semibold text-foreground truncate">{user?.full_name || "Student"}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 text-xs font-semibold text-muted-foreground hover:text-destructive"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 min-w-0">
        <Outlet />
      </main>
    </div>
  );
};
