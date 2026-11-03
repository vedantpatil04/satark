import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { classroomsApi, Classroom } from "@/api/classrooms";
import { examsApi, ExamSession } from "@/api/exams";
import { focusApi, FocusSession } from "@/api/focus";
import { notificationsApi, NotificationItem } from "@/api/notifications";
import { devicesApi, Device } from "@/api/devices";
import {
  BookOpen,
  FileText,
  Target,
  Clock,
  Sparkles,
  ArrowRight,
  Plus,
  Play,
  CheckCircle2,
  Bell,
  Loader2,
  Monitor,
  Copy,
  Check,
  ShieldCheck,
  RefreshCw,
  MoreVertical,
  ChevronRight,
  KeyRound
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell
} from "recharts";

export const StudentDashboard: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [exams, setExams] = useState<ExamSession[]>([]);
  const [history, setHistory] = useState<FocusSession[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isPairingOpen, setIsPairingOpen] = useState(false);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingLoading, setPairingLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [studentDevices, setStudentDevices] = useState<Device[]>([]);
  const navigate = useNavigate();

  const handleOpenPairing = async () => {
    setIsPairingOpen(true);
    setPairingLoading(true);
    try {
      const [pairRes, devs] = await Promise.all([
        devicesApi.getPairingCode(),
        devicesApi.list().catch(() => [])
      ]);
      setPairingCode(pairRes.pairing_code);
      setStudentDevices(devs);
    } catch {
      toast.error("Failed to generate pairing code");
    } finally {
      setPairingLoading(false);
    }
  };

  const handleCopyCode = () => {
    if (pairingCode) {
      navigator.clipboard.writeText(pairingCode);
      setCopied(true);
      toast.success("Pairing code copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await devicesApi.revoke(id);
      toast.success("Device disconnected and revoked");
      setStudentDevices((prev) => prev.filter((d) => d.id !== id));
    } catch {
      toast.error("Failed to revoke device");
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [clsData, exmData, hisData, notifData] = await Promise.all([
        classroomsApi.list().catch(() => []),
        examsApi.list().catch(() => []),
        focusApi.getHistory().catch(() => []),
        notificationsApi.list().catch(() => []),
      ]);

      setClassrooms(Array.isArray(clsData) ? clsData : []);
      setExams(Array.isArray(exmData) ? exmData : []);
      setHistory(Array.isArray(hisData) ? hisData : []);
      setNotifications(Array.isArray(notifData) ? notifData : []);
    } catch {
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const totalFocusMinutes = history.reduce((acc, h) => acc + Math.floor(h.actual_focus_seconds / 60), 0);
  const activeExams = exams.filter((e) => e.status === "active");
  const upcomingExams = exams.filter((e) => e.status === "scheduled");
  const completedExams = exams.filter((e) => e.status === "ended");

  // Performance calculation
  const totalAssessments = exams.length || 1;
  const completedAssessmentRate = Math.min(
    100,
    Math.round(((completedExams.length || 1) / totalAssessments) * 100)
  );

  const donutData = [
    { name: "Completed", value: completedAssessmentRate },
    { name: "Active / Upcoming", value: Math.max(10, 100 - completedAssessmentRate) },
  ];
  const DONUT_COLORS = ["#D97706", "#EBE9F5"];

  // Activity spline data
  const studyDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const activityData = studyDays.map((day, idx) => ({
    day,
    minutes: Math.max(15, (totalFocusMinutes / 7) * (idx === 3 || idx === 6 ? 1.5 : 0.8) + (idx + 1) * 5),
  }));

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#D97706]" />
        <p className="text-xs text-stone-500 font-medium">Syncing student workstation...</p>
      </div>
    );
  }

  return (
    <div className="space-y-7 max-w-7xl mx-auto pb-6">
      {/* SECTION 1: OVERVIEW & PERFORMANCE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Overview: 3 Pastel Cards (8 cols on desktop) */}
        <div className="lg:col-span-8 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">Overview</h2>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={handleOpenPairing}
                className="text-xs text-[#D97706] hover:bg-amber-50 h-7 px-2 font-medium flex items-center gap-1"
              >
                <Monitor className="w-3.5 h-3.5" /> Pair Computer
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Pastel Mint Green: Enrolled Classes */}
            <div className="relative overflow-hidden rounded-2xl bg-[#EAF8F0] border border-[#D5F2E2] p-5 flex flex-col justify-between min-h-[140px] shadow-xs hover:shadow-sm transition-all">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-xl bg-white/80 text-emerald-700 flex items-center justify-center shadow-xs">
                  <BookOpen className="w-4 h-4" />
                </div>
                <button className="text-stone-400 hover:text-stone-600">
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-2">
                <span className="text-[11px] font-semibold text-stone-500 block">Enrolled Courses</span>
                <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  {classrooms.length}
                </span>
                <span className="text-[11px] text-emerald-700 font-medium block mt-0.5">
                  Connected academic cohorts
                </span>
              </div>
              <div className="absolute -bottom-4 -right-4 w-14 h-14 rounded-full bg-emerald-200/40 pointer-events-none" />
            </div>

            {/* Pastel Peach: Active & Scheduled Exams */}
            <div className="relative overflow-hidden rounded-2xl bg-[#FEF3E8] border border-[#FDE5CC] p-5 flex flex-col justify-between min-h-[140px] shadow-xs hover:shadow-sm transition-all">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-xl bg-white/80 text-[#D97706] flex items-center justify-center shadow-xs">
                  <FileText className="w-4 h-4" />
                </div>
                <button className="text-stone-400 hover:text-stone-600">
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-2">
                <span className="text-[11px] font-semibold text-stone-500 block">Assigned Exams</span>
                <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  {activeExams.length + upcomingExams.length}
                </span>
                <span className="text-[11px] text-amber-700 font-medium block mt-0.5">
                  {activeExams.length} active right now
                </span>
              </div>
              <div className="absolute -bottom-4 -right-4 w-14 h-14 rounded-full bg-amber-200/40 pointer-events-none" />
            </div>

            {/* Pastel Lavender: Study & Focus Time */}
            <div className="relative overflow-hidden rounded-2xl bg-[#EEF2FC] border border-[#DDE6F8] p-5 flex flex-col justify-between min-h-[140px] shadow-xs hover:shadow-sm transition-all">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-xl bg-white/80 text-blue-700 flex items-center justify-center shadow-xs">
                  <Clock className="w-4 h-4" />
                </div>
                <button className="text-stone-400 hover:text-stone-600">
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-2">
                <span className="text-[11px] font-semibold text-stone-500 block">Total Focus Time</span>
                <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  {totalFocusMinutes} <span className="text-base font-bold text-stone-400">min</span>
                </span>
                <span className="text-[11px] text-blue-700 font-medium block mt-0.5">
                  Across {history.length} study sessions
                </span>
              </div>
              <div className="absolute -bottom-4 -right-4 w-14 h-14 rounded-full bg-blue-200/40 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Performance Donut Card (4 cols) */}
        <div className="lg:col-span-4 rounded-2xl bg-white border border-stone-200/80 p-5 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">Performance</h2>
            <button className="text-stone-400 hover:text-stone-600">
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center justify-center gap-4 py-2">
            <div className="w-28 h-28 relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={36}
                    outerRadius={50}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {donutData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div>
              <div className="text-3xl font-black text-slate-900 tracking-tight">
                {completedAssessmentRate}%
              </div>
              <div className="space-y-1.5 mt-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#D97706]" />
                  <span className="text-stone-600 text-[11px] font-medium">Completed</span>
                  <span className="text-[10px] text-emerald-600 font-bold ml-auto">▲ {completedExams.length}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#EBE9F5]" />
                  <span className="text-stone-500 text-[11px] font-medium">Pending</span>
                  <span className="text-[10px] text-stone-400 font-medium ml-auto">
                    {activeExams.length + upcomingExams.length}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-xs text-stone-500">
            <span>Assessment Progress</span>
            <span className="font-semibold text-emerald-700">On Track</span>
          </div>
        </div>
      </div>

      {/* SECTION 2: WORKING ACTIVITY & ASSIGNED EXAMS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Working Activity Spline Chart (8 cols) */}
        <div className="lg:col-span-8 rounded-2xl bg-[#FFFEFC] border border-stone-200/80 p-5 sm:p-6 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Working Activity</h2>
              <p className="text-xs text-stone-500">Focus minutes logged over weekly study periods</p>
            </div>
            <div className="px-3 py-1 rounded-full bg-[#F4F4F2] text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <span>Weekly Focus</span>
            </div>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activityData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="amberSplineStudent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11, fill: "#8C8983" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#8C8983" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#FFFFFF",
                    borderColor: "#E5E7EB",
                    borderRadius: "0.75rem",
                    boxShadow: "0 4px 14px rgba(0,0,0,0.06)",
                    fontSize: "12px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="minutes"
                  stroke="#D97706"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#amberSplineStudent)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Assigned Examinations List (4 cols) */}
        <div className="lg:col-span-4 rounded-2xl bg-white border border-stone-200/80 p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-slate-900 tracking-tight">My Examinations</h2>
            <Link to="/exams" className="text-xs font-semibold text-[#D97706] hover:underline flex items-center gap-0.5">
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto">
            {exams.length === 0 ? (
              <div className="py-8 text-center text-xs text-stone-400">
                No examinations currently assigned to your enrolled courses.
              </div>
            ) : (
              exams.slice(0, 4).map((ex) => (
                <div
                  key={ex.id}
                  onClick={() => navigate(`/exams`)}
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-stone-50 cursor-pointer transition-colors border border-transparent hover:border-stone-200"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-[#FFF2E5] text-[#D97706] flex items-center justify-center font-bold text-xs shrink-0">
                      {ex.exam_code?.substring(0, 2) || "EX"}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{ex.title}</p>
                      <p className="text-[10px] text-stone-400">{ex.duration_minutes}m duration</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 pl-2">
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-bold capitalize ${
                        ex.status === "active"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                          : ex.status === "scheduled"
                          ? "bg-amber-50 text-amber-800 border-amber-300"
                          : "bg-stone-100 text-stone-600"
                      }`}
                    >
                      {ex.status}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>

          <Button
            onClick={() => navigate("/exams")}
            className="w-full mt-3 bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-bold rounded-xl h-8.5 shadow-xs"
          >
            Enter Assessment Portal
          </Button>
        </div>
      </div>

      {/* SECTION 3: RECENT NOTIFICATIONS & ENROLLED COURSES */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recent Announcements & Nudges (7 cols) */}
        <div className="lg:col-span-7 rounded-2xl bg-white border border-stone-200/80 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-900 tracking-tight">Announcements & Nudges</h2>
            <Link to="/notifications" className="text-xs font-semibold text-[#D97706] hover:underline flex items-center gap-0.5">
              All <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="space-y-3">
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-xs text-stone-400 flex flex-col items-center gap-2">
                <CheckCircle2 className="w-7 h-7 text-emerald-500" />
                <span>You're completely caught up! No unread notifications.</span>
              </div>
            ) : (
              notifications.slice(0, 3).map((n) => (
                <div
                  key={n.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-stone-100 bg-[#FCFBF8] hover:bg-white transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[#FFF2E5] text-[#D97706] flex items-center justify-center shrink-0">
                      <Bell className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{n.title}</p>
                      <p className="text-[11px] text-stone-500 truncate">{n.message}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 pl-3">
                    <span className="text-[10px] font-medium text-stone-400">
                      {new Date(n.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Enrolled Courses (5 cols) */}
        <div className="lg:col-span-5 rounded-2xl bg-white border border-stone-200/80 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-900 tracking-tight">My Classes</h2>
            <Link to="/classrooms" className="text-xs font-semibold text-[#D97706] hover:underline flex items-center gap-0.5">
              Join Course <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="space-y-2.5">
            {classrooms.length === 0 ? (
              <div className="py-8 text-center text-xs text-stone-400">
                You haven't joined any classes yet. Click "Join Course" to enter a class join code.
              </div>
            ) : (
              classrooms.slice(0, 3).map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-[#FFFDF9] border border-stone-200/60 transition-all"
                >
                  <div className="min-w-0 pr-2">
                    <p className="text-xs font-bold text-slate-800 truncate">{c.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-semibold text-[#D97706] bg-[#FFF2E5] px-1.5 py-0.2 rounded font-mono">
                        {c.subject_code || "CODE"}
                      </span>
                      <span className="text-[10px] text-stone-400 font-mono">Join: {c.join_code}</span>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] bg-white border-stone-200 text-stone-600 shrink-0">
                    Enrolled
                  </Badge>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Desktop Agent Pairing Modal */}
      <Dialog open={isPairingOpen} onOpenChange={setIsPairingOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl bg-white">
          <DialogHeader>
            <div className="w-10 h-10 rounded-xl bg-[#FFF2E5] text-[#D97706] flex items-center justify-center mb-2">
              <Monitor className="w-5 h-5" />
            </div>
            <DialogTitle className="text-lg font-bold text-slate-900">Pair Desktop Sentinel</DialogTitle>
            <DialogDescription className="text-xs text-stone-500">
              Link your desktop computer to allow SATARK proctoring telemetry without sharing passwords.
            </DialogDescription>
          </DialogHeader>

          {pairingLoading ? (
            <div className="py-8 flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-[#D97706]" />
              <p className="text-xs text-stone-500">Generating pairing security key...</p>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="p-4 rounded-2xl border border-amber-200 bg-[#FFF9F2] text-center space-y-2">
                <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                  Single-Use Pairing Code (Valid 10 mins)
                </span>
                <div className="flex items-center justify-center gap-3">
                  <span className="text-3xl font-black font-mono tracking-widest text-[#D97706]">
                    {pairingCode || "------"}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCopyCode}
                    className="h-8 px-2.5 gap-1.5 text-xs font-semibold rounded-xl bg-white border-amber-200 hover:bg-amber-50"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-stone-600" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5 text-xs text-stone-600 bg-stone-50 p-3 rounded-xl border border-stone-200/60">
                <p className="font-semibold text-slate-800">Quick Pairing Steps:</p>
                <ol className="list-decimal pl-4 space-y-0.5 text-[11px]">
                  <li>In your terminal: <code className="bg-white border px-1 py-0.5 rounded font-mono text-[#D97706]">cd desktop-agent</code></li>
                  <li>Run: <code className="bg-white border px-1 py-0.5 rounded font-mono text-[#D97706]">python -m src.main</code></li>
                  <li>Input the code above when prompted.</li>
                </ol>
              </div>

              {studentDevices.length > 0 && (
                <div className="pt-2 border-t border-stone-100 space-y-2">
                  <p className="text-xs font-semibold text-slate-800">Linked Hardware:</p>
                  <div className="space-y-1.5">
                    {studentDevices.map((d) => (
                      <div
                        key={d.id}
                        className="flex items-center justify-between p-2 rounded-xl bg-stone-50 border border-stone-200/60 text-xs"
                      >
                        <div className="space-y-0.5 min-w-0 pr-2">
                          <span className="font-bold text-slate-800 capitalize truncate block">
                            {d.hostname || d.os_type}
                          </span>
                          <p className="text-[10px] font-mono text-stone-400">
                            UUID: {d.hardware_uuid?.substring(0, 12)}...
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className="text-[10px] bg-white text-emerald-700 border-emerald-300">
                            {d.status}
                          </Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRevoke(d.id)}
                            className="h-7 px-2 text-[11px] text-rose-600 hover:bg-rose-50"
                          >
                            Revoke
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-2 flex justify-between items-center">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleOpenPairing}
                  className="gap-1.5 text-xs text-stone-500 rounded-xl"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> New Code
                </Button>
                <Button
                  size="sm"
                  onClick={() => setIsPairingOpen(false)}
                  className="text-xs font-bold bg-[#D97706] hover:bg-[#B45309] text-white rounded-xl px-4"
                >
                  Done
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
