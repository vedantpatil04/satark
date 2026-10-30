import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { classroomsApi, Classroom } from "@/api/classrooms";
import { examsApi, ExamSession } from "@/api/exams";
import { devicesApi, Device } from "@/api/devices";
import { focusApi, FocusSession } from "@/api/focus";
import { alertsApi, Alert } from "@/api/alerts";
import {
  Users,
  FileCheck,
  Clock,
  Monitor,
  ShieldAlert,
  ArrowRight,
  Plus,
  Play,
  CheckCircle2,
  AlertTriangle,
  Loader2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const TeacherDashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [exams, setExams] = useState<ExamSession[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [focusSessions, setFocusSessions] = useState<FocusSession[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const navigate = useNavigate();

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [clsData, exmData, devData, focData, alrtData] = await Promise.all([
        classroomsApi.list().catch(() => []),
        examsApi.list().catch(() => []),
        devicesApi.list().catch(() => []),
        focusApi.list().catch(() => []),
        alertsApi.list().catch(() => []),
      ]);

      setClassrooms(clsData);
      setExams(exmData);
      setDevices(devData);
      setFocusSessions(focData);
      setAlerts(alrtData);
    } catch (err: any) {
      toast.error("Failed to load dashboard metrics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const totalEnrolled = classrooms.reduce((acc, c) => acc + (c.enrolled_count || 0), 0);
  const activeExams = exams.filter((e) => e.status === "active");
  const onlineDevices = devices.filter((d) => d.status === "connected");
  const unacknowledgedAlerts = alerts.filter((a) => !a.is_acknowledged);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-medium">Aggregating live classroom telemetry...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Teacher Overview</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time proctoring status, active student sessions, and hardware telemetry.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => navigate("/teacher/classrooms")} variant="outline" className="flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Classroom
          </Button>
          <Button onClick={() => navigate("/teacher/exams")} className="flex items-center gap-2 font-bold">
            <Play className="w-4 h-4" /> Launch Exam
          </Button>
        </div>
      </div>

      {/* Real Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs uppercase font-bold text-muted-foreground">Classrooms</CardTitle>
            <Users className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{classrooms.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {totalEnrolled} total enrolled {totalEnrolled === 1 ? "student" : "students"}
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs uppercase font-bold text-muted-foreground">Active Exams</CardTitle>
            <FileCheck className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{activeExams.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {exams.length} total scheduled or concluded
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs uppercase font-bold text-muted-foreground">Device Grid</CardTitle>
            <Monitor className="w-4 h-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{onlineDevices.length} / {devices.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {onlineDevices.length} online • {devices.length - onlineDevices.length} offline
            </p>
          </CardContent>
        </Card>

        <Card className={`glass-card ${unacknowledgedAlerts.length > 0 ? "border-destructive/40" : ""}`}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs uppercase font-bold text-muted-foreground">Integrity Alerts</CardTitle>
            <ShieldAlert className={`w-4 h-4 ${unacknowledgedAlerts.length > 0 ? "text-destructive" : "text-emerald-500"}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{unacknowledgedAlerts.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {unacknowledgedAlerts.length > 0 ? "Action required: review violations" : "All alerts acknowledged"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Active Exams & Recent Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Exam Section */}
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-border/40">
            <div>
              <CardTitle className="text-base font-bold text-foreground">Active & Scheduled Exams</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Live examination lifecycle controls</p>
            </div>
            <Link to="/teacher/exams" className="text-xs text-primary hover:underline flex items-center gap-1 font-semibold">
              View All <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {exams.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                No examinations created yet. Click "Launch Exam" to schedule an assessment.
              </div>
            ) : (
              exams.slice(0, 4).map((ex) => (
                <div
                  key={ex.id}
                  onClick={() => navigate(`/teacher/exams/${ex.id}`)}
                  className="p-3.5 rounded-lg border border-border/40 bg-card/60 hover:bg-muted/50 cursor-pointer flex items-center justify-between transition-colors"
                >
                  <div>
                    <h4 className="font-semibold text-sm text-foreground">{ex.title}</h4>
                    <p className="text-xs text-muted-foreground">PIN: <span className="font-mono font-bold text-primary">{ex.exam_code}</span> • {ex.duration_minutes} mins</p>
                  </div>
                  <Badge
                    variant={ex.status === "active" ? "default" : ex.status === "paused" ? "secondary" : "outline"}
                    className="capitalize text-xs font-semibold"
                  >
                    {ex.status}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Live Integrity Alerts Section */}
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-border/40">
            <div>
              <CardTitle className="text-base font-bold text-foreground">Recent Integrity Alerts</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Policy triggers requiring proctor verification</p>
            </div>
            <Link to="/teacher/reports" className="text-xs text-primary hover:underline flex items-center gap-1 font-semibold">
              Review Center <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {alerts.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
                <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                <span>Zero integrity anomalies recorded. All candidate sessions clean.</span>
              </div>
            ) : (
              alerts.slice(0, 4).map((alt) => (
                <div
                  key={alt.id}
                  className="p-3 rounded-lg border border-border/40 bg-card/60 flex items-start justify-between gap-3 text-xs"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className={`w-4 h-4 mt-0.5 ${alt.severity === "critical" ? "text-destructive" : "text-amber-500"}`} />
                    <div>
                      <p className="font-semibold text-foreground">{alt.description}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {new Date(alt.created_at).toLocaleTimeString()} • Device: {alt.device_id.substring(0, 8)}...
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={alt.is_acknowledged ? "outline" : "destructive"}
                    className="text-[10px] uppercase font-bold shrink-0"
                  >
                    {alt.is_acknowledged ? "Reviewed" : alt.severity}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Focus Mode Supervision Section */}
      <Card className="glass-card">
        <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-border/40">
          <div>
            <CardTitle className="text-base font-bold text-foreground">Active Focus Mode Sessions</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Student self-directed Pomodoro activity across divisions</p>
          </div>
          <Link to="/teacher/focus" className="text-xs text-primary hover:underline flex items-center gap-1 font-semibold">
            Cohort View <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </CardHeader>
        <CardContent className="pt-4">
          {focusSessions.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground text-sm">
              No active student study sessions at this moment.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {focusSessions.slice(0, 6).map((fs) => (
                <div key={fs.id} className="p-3 rounded-lg border border-border/40 bg-card/40 flex items-center justify-between">
                  <div>
                    <h5 className="font-semibold text-xs text-foreground truncate max-w-[180px]">{fs.goal_title}</h5>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Target: {fs.planned_duration_minutes}m • Logged: {Math.floor(fs.actual_focus_seconds / 60)}m
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-[10px] capitalize">
                    {fs.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
