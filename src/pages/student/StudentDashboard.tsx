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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

      setClassrooms(clsData);
      setExams(exmData);
      setHistory(hisData);
      setNotifications(notifData);
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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        <p className="text-sm text-muted-foreground font-medium">Syncing your student profile...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Welcome Banner */}
      <div className="glass-card p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 border-l-4 border-l-emerald-500">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-xs font-bold uppercase tracking-wider mb-2">
            <Sparkles className="w-3.5 h-3.5" /> Student Workstation
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            Welcome back, <span className="gradient-text">{user?.full_name}</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            Join courses, take proctored examinations, or lock into a deep Pomodoro study block.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={handleOpenPairing}
            variant="outline"
            className="flex items-center gap-2 font-semibold text-xs border-primary/40 text-primary hover:bg-primary/10"
          >
            <Monitor className="w-3.5 h-3.5" /> Pair Desktop Agent
          </Button>
          <Button
            onClick={() => navigate("/student/classrooms")}
            variant="outline"
            className="flex items-center gap-2 font-semibold text-xs"
          >
            <Plus className="w-3.5 h-3.5" /> Join Course
          </Button>
          <Button
            onClick={() => navigate("/student/focus")}
            className="flex items-center gap-2 font-bold text-xs bg-emerald-600 hover:bg-emerald-700"
          >
            <Play className="w-3.5 h-3.5" /> Launch Focus Timer
          </Button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs uppercase font-bold text-muted-foreground">My Courses</CardTitle>
            <BookOpen className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{classrooms.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Active enrolled classrooms
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs uppercase font-bold text-muted-foreground">Active Exams</CardTitle>
            <FileText className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{activeExams.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {exams.length} total scheduled assessments
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs uppercase font-bold text-muted-foreground">Total Focus Time</CardTitle>
            <Target className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{totalFocusMinutes} mins</div>
            <p className="text-xs text-muted-foreground mt-1">
              {history.length} completed Pomodoro sessions
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Courses & Exams Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Enrolled Courses */}
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-border/40">
            <div>
              <CardTitle className="text-base font-bold text-foreground">Enrolled Courses</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Your connected academic cohorts</p>
            </div>
            <Link to="/student/classrooms" className="text-xs text-primary hover:underline flex items-center gap-1 font-semibold">
              Manage <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {classrooms.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
                <BookOpen className="w-8 h-8 opacity-40" />
                <span>You are not enrolled in any classrooms yet.</span>
                <Button size="sm" onClick={() => navigate("/student/classrooms")} className="mt-1 font-semibold text-xs">
                  Enter Join Code
                </Button>
              </div>
            ) : (
              classrooms.map((c) => (
                <div
                  key={c.id}
                  className="p-3.5 rounded-lg border border-border/40 bg-card/60 flex items-center justify-between"
                >
                  <div>
                    {c.subject_code && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded">
                        {c.subject_code}
                      </span>
                    )}
                    <h4 className="font-semibold text-sm text-foreground mt-1">{c.title}</h4>
                    <span className="text-[11px] text-muted-foreground block font-mono">Code: {c.join_code}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    Enrolled
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Available Exams */}
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-border/40">
            <div>
              <CardTitle className="text-base font-bold text-foreground">Assigned Examinations</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Assessment schedules and active portals</p>
            </div>
            <Link to="/student/exams" className="text-xs text-primary hover:underline flex items-center gap-1 font-semibold">
              Exams <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {exams.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                No active or scheduled examinations in your enrolled courses.
              </div>
            ) : (
              exams.map((ex) => (
                <div
                  key={ex.id}
                  onClick={() => navigate(`/student/exams/${ex.id}`)}
                  className="p-3.5 rounded-lg border border-border/40 bg-card/60 hover:bg-muted/50 cursor-pointer flex items-center justify-between transition-colors"
                >
                  <div>
                    <h4 className="font-semibold text-sm text-foreground">{ex.title}</h4>
                    <p className="text-xs text-muted-foreground">Duration: {ex.duration_minutes} mins • PIN required to enter</p>
                  </div>
                  <Badge
                    variant={ex.status === "active" ? "default" : "outline"}
                    className="capitalize text-xs font-semibold"
                  >
                    {ex.status}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Notifications Row */}
      {notifications.length > 0 && (
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border/40">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" />
              <CardTitle className="text-sm font-bold text-foreground">Recent Announcements & Focus Nudges</CardTitle>
            </div>
            <Link to="/student/notifications" className="text-xs text-primary hover:underline font-semibold">
              View All
            </Link>
          </CardHeader>
          <CardContent className="pt-3 space-y-2">
            {notifications.slice(0, 3).map((n) => (
              <div key={n.id} className="p-2.5 rounded-lg bg-muted/30 border border-border/30 text-xs flex items-center justify-between">
                <div>
                  <span className="font-bold text-foreground">{n.title}: </span>
                  <span className="text-muted-foreground">{n.message}</span>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                  {new Date(n.created_at).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {/* Desktop Agent Pairing Modal */}
      <Dialog open={isPairingOpen} onOpenChange={setIsPairingOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-2">
              <Monitor className="w-5 h-5" />
            </div>
            <DialogTitle className="text-xl font-bold">Pair Desktop Computer</DialogTitle>
            <DialogDescription className="text-xs">
              Connect this computer's Python monitoring agent securely without storing passwords or permanent tokens.
            </DialogDescription>
          </DialogHeader>

          {pairingLoading ? (
            <div className="py-8 flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">Generating single-use pairing code...</p>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              {/* Pairing Code Card */}
              <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 text-center space-y-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Single-Use Pairing Code (Valid 10 mins)
                </span>
                <div className="flex items-center justify-center gap-3">
                  <span className="text-3xl font-black font-mono tracking-widest text-primary">
                    {pairingCode || "------"}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCopyCode}
                    className="h-8 px-2.5 gap-1.5 text-xs font-semibold"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>

              {/* Instructions */}
              <div className="space-y-2 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">Quick Setup Instructions:</p>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>In your terminal, navigate to the <code className="text-primary font-mono bg-muted px-1 py-0.5 rounded">desktop-agent/</code> directory.</li>
                  <li>Run: <code className="text-primary font-mono bg-muted px-1 py-0.5 rounded">python -m src.main</code></li>
                  <li>Enter the code above when prompted to establish hardware pairing.</li>
                </ol>
              </div>

              {/* Connected Devices */}
              {studentDevices.length > 0 && (
                <div className="pt-2 border-t border-border/40 space-y-2">
                  <p className="text-xs font-semibold text-foreground">Linked Computers:</p>
                  <div className="space-y-1.5">
                    {studentDevices.map((d) => (
                      <div
                        key={d.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-muted/40 border border-border/40 text-xs"
                      >
                        <div className="space-y-0.5">
                          <span className="font-bold text-foreground capitalize">{d.hostname || d.os_type}</span>
                          <p className="text-[10px] font-mono text-muted-foreground">UUID: {d.hardware_uuid.substring(0, 12)}...</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={d.status === "connected" ? "default" : "secondary"} className="text-[10px]">
                            {d.status}
                          </Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRevoke(d.id)}
                            className="h-7 px-2 text-[11px] text-destructive hover:bg-destructive/10"
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
                  className="gap-1.5 text-xs text-muted-foreground"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> New Code
                </Button>
                <Button size="sm" onClick={() => setIsPairingOpen(false)} className="text-xs font-bold">
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
