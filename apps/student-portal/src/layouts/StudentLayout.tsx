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
  Search,
  Sparkles,
  ChevronDown,
  GraduationCap,
  Terminal,
  BookMarked
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const StudentLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Real-time WebSocket connection to /ws/student
  const { isConnected } = useRealtimeSocket({
    channel: "student",
    onMessage: (msg) => {
      if (msg.type === "focus_nudge") {
        toast.info("Study Nudge", {
          description: msg.message || "Stay focused on your exam preparation!",
        });
      } else if (msg.type === "teacher_announcement") {
        toast.warning("Exam Announcement", {
          description: msg.announcement,
        });
      } else if (msg.type === "session_state_change") {
        toast.info(`Assessment State Updated: ${msg.status}`);
      }
    },
  });

  const navItems = [
    { label: "Dashboard", path: "/dashboard", icon: Home },
    { label: "Compiler", path: "/compiler", icon: Terminal },
    { label: "Class Notes", path: "/notes", icon: BookMarked },
    { label: "My Classes", path: "/classrooms", icon: BookOpen },
    { label: "Examinations", path: "/exams", icon: FileText },
    { label: "Focus Workstation", path: "/focus", icon: Target },
    { label: "Exam History", path: "/history", icon: History },
    { label: "Notifications", path: "/notifications", icon: Bell },
  ];

  const handleLogout = () => {
    logout();
    navigate("/login");
    toast.info("Logged out successfully");
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const firstName = user?.full_name ? user.full_name.split(" ")[0] : "Student";
  const userInitials = user?.full_name
    ? user.full_name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "ST";

  return (
    <div className="min-h-screen bg-[#F6F5F2] flex flex-col md:flex-row text-slate-800 antialiased font-sans">
      {/* Mobile Top Bar */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-stone-200/80 bg-white sticky top-0 z-50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#FFF2E5] text-[#D97706] flex items-center justify-center font-black">
            <GraduationCap className="w-4 h-4 text-[#D97706]" />
          </div>
          <span className="font-bold text-slate-900 tracking-tight text-sm">SATARK</span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded-xl border border-stone-200 hover:bg-stone-100 text-slate-700 transition-colors"
          aria-label="Toggle Navigation"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Left Vertical Sidebar */}
      <aside
        className={`fixed md:sticky top-0 left-0 z-40 w-64 h-screen bg-[#FAF9F5] border-r border-stone-200/80 flex flex-col justify-between transition-all duration-200 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="flex flex-col h-full overflow-y-auto px-4 py-6 justify-between">
          <div>
            {/* Logo Brand Header */}
            <div className="flex items-center gap-3 px-2 mb-8">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#F59E0B] to-[#D97706] text-white flex items-center justify-center shadow-sm shadow-amber-500/20 shrink-0">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h1 className="font-bold text-slate-900 text-lg tracking-tight leading-tight">SATARK</h1>
                <p className="text-[11px] text-stone-500 font-medium">Candidate Suite</p>
              </div>
            </div>

            {/* Navigation Links */}
            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  location.pathname === item.path ||
                  (item.path !== "/dashboard" && location.pathname.startsWith(`${item.path}`));
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                      isActive
                        ? "bg-[#FFF2E5] text-[#D97706] shadow-xs"
                        : "text-slate-600 hover:text-slate-900 hover:bg-stone-200/50"
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-[#D97706]" : "text-slate-500"}`} />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Sidebar Bottom Banner Widget */}
          <div className="mt-6 pt-4">
            <div className="rounded-2xl bg-[#FFF6ED] border border-[#FFE7D1] p-4 text-center space-y-2.5">
              <div className="w-10 h-10 rounded-full bg-white mx-auto flex items-center justify-center text-[#D97706] shadow-xs">
                <Sparkles className="w-5 h-5 text-[#D97706]" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">Study Session</h4>
                <p className="text-[11px] text-stone-600 mt-0.5 leading-tight">
                  {isConnected ? "Proctor connection active" : "Preparing session socket..."}
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => navigate("/focus")}
                className="w-full bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-semibold rounded-xl h-8 shadow-xs"
              >
                Launch Focus
              </Button>
            </div>

            {/* User profile & Sign out */}
            <div className="mt-3 flex items-center justify-between px-2 pt-2 border-t border-stone-200/60">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full bg-[#FFF2E5] text-[#D97706] font-bold text-xs flex items-center justify-center shrink-0">
                  {userInitials}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-800 truncate">{user?.full_name || "Student"}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Container Area */}
      <div className="flex-1 flex flex-col min-w-0 p-3 sm:p-5 lg:p-7">
        {/* Rounded Canvas Container (Matching reference screenshot) */}
        <div className="flex-1 bg-white rounded-3xl border border-stone-200/80 shadow-[0_4px_24px_rgba(0,0,0,0.03)] flex flex-col min-w-0 overflow-hidden">
          {/* Top Header */}
          <header className="px-6 lg:px-8 py-5 border-b border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Personalized Greeting */}
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                {getGreeting()}, {firstName}
              </h1>
              <p className="text-xs text-stone-500 mt-0.5">
                Glad to see you again • SATARK Candidate Workstation
              </p>
            </div>

            {/* Header Right Controls */}
            <div className="flex items-center gap-3 self-end sm:self-auto">
              {/* Search Pill */}
              <div className="relative w-48 sm:w-60">
                <input
                  type="text"
                  placeholder="Search courses, exams..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-4 pr-9 py-2 text-xs bg-[#F4F4F2] border-0 rounded-full text-slate-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#D97706]/40 transition-all"
                />
                <Search className="w-3.5 h-3.5 text-stone-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
              </div>

              {/* Notification Bell Circle */}
              <Link
                to="/notifications"
                className="w-9 h-9 rounded-full bg-[#F4F4F2] hover:bg-amber-50 text-slate-600 flex items-center justify-center transition-colors relative"
                title="Notifications"
              >
                <Bell className="w-4 h-4" />
                <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#D97706]" />
              </Link>

              {/* Profile Pill with Avatar & Name */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full hover:bg-stone-100 transition-colors outline-none cursor-pointer">
                    <span className="text-xs font-semibold text-slate-800 hidden sm:inline max-w-[120px] truncate">
                      {user?.full_name || "Student"}
                    </span>
                    <div className="w-8 h-8 rounded-full bg-[#E58A1F] text-white font-bold text-xs flex items-center justify-center shadow-xs">
                      {userInitials}
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 p-1.5 rounded-2xl shadow-lg border-stone-200">
                  <DropdownMenuLabel className="text-xs font-bold px-2 py-1.5">
                    <div>{user?.full_name}</div>
                    <div className="text-[11px] font-normal text-stone-500 truncate">{user?.email}</div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/dashboard")} className="text-xs rounded-xl cursor-pointer">
                    <Home className="w-3.5 h-3.5 mr-2 text-[#D97706]" /> Dashboard
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/compiler")} className="text-xs rounded-xl cursor-pointer">
                    <Terminal className="w-3.5 h-3.5 mr-2 text-[#D97706]" /> Compiler
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/exams")} className="text-xs rounded-xl cursor-pointer">
                    <FileText className="w-3.5 h-3.5 mr-2 text-[#D97706]" /> Examinations
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/classrooms")} className="text-xs rounded-xl cursor-pointer">
                    <BookOpen className="w-3.5 h-3.5 mr-2 text-[#D97706]" /> My Classes
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-xs rounded-xl text-rose-600 focus:text-rose-600 cursor-pointer">
                    <LogOut className="w-3.5 h-3.5 mr-2" /> Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {/* Content Viewport */}
          <main className="flex-1 overflow-y-auto p-5 sm:p-7 lg:p-8 bg-[#FBFBFA]/60">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
};
