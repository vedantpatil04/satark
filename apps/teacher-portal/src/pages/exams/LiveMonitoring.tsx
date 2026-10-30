import React, { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Monitor,
  Maximize2,
  Minimize2,
  AlertTriangle,
  Clock,
  Wifi,
  WifiOff,
  Radio,
  Play,
  Pause,
  StopCircle,
  Megaphone,
  PlusCircle,
  Search,
  Filter,
  CheckCircle,
  Eye,
  EyeOff,
  ArrowLeft,
  RefreshCw,
  SlidersHorizontal,
  ShieldAlert,
  UserCheck,
  Laptop,
  Check,
  X,
  Volume2
} from "lucide-react";
import { toast } from "sonner";
import { examsApi, mediaApi, alertsApi } from "@satark/shared-api";
import { useRealtimeSocket } from "@/hooks/useRealtimeSocket";
import type {
  MonitoringOverview,
  StudentMonitoringCard,
  ExamSession
} from "@satark/shared-types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const LiveMonitoring: React.FC = () => {
  const { examId, id } = useParams<{ examId?: string; id?: string }>();
  const activeExamId = examId || id || "";
  const navigate = useNavigate();

  const [overview, setOverview] = useState<MonitoringOverview | null>(null);
  const [exam, setExam] = useState<ExamSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Search, Filters & View Mode
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "connected" | "offline">("all");
  const [alertFilter, setAlertFilter] = useState<"all" | "alerts_only" | "clean">("all");
  const [sharingFilter, setSharingFilter] = useState<"all" | "sharing" | "not_sharing">("all");
  const [sortBy, setSortBy] = useState<"name" | "alerts" | "status">("alerts");
  const [viewMode, setViewMode] = useState<"grid" | "compact">("grid");

  // Expanded Student Modal
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
  const [proctorNote, setProctorNote] = useState("");

  // Control Modals
  const [showGrantTimeModal, setShowGrantTimeModal] = useState(false);
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [showEndExamConfirm, setShowEndExamConfirm] = useState(false);
  const [additionalMinutes, setAdditionalMinutes] = useState(15);
  const [announcementText, setAnnouncementText] = useState("");
  const [announcementPriority, setAnnouncementPriority] = useState<"normal" | "urgent">("normal");

  // Remaining Exam Time
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  // Native WebRTC Peer Connections & Video Streams (Up to 5 concurrent streams)
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const [studentStreams, setStudentStreams] = useState<Record<string, MediaStream>>({});
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  // 1. Fetch initial overview & exam metadata
  const fetchOverview = async () => {
    if (!activeExamId) return;
    try {
      const [ovData, exData] = await Promise.all([
        mediaApi.getOverview(activeExamId),
        examsApi.get(activeExamId),
      ]);
      setOverview(ovData);
      setExam(exData);

      // Calculate countdown timer
      if (exData.actual_start && exData.status === "active") {
        const start = new Date(exData.actual_start).getTime();
        const durationMs = exData.duration_minutes * 60 * 1000;
        const now = Date.now();
        const remaining = Math.max(0, Math.floor((start + durationMs - now) / 1000));
        setRemainingSeconds(remaining);
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to load examination monitoring data");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
    const interval = setInterval(fetchOverview, 10000); // Polling sync fallback
    return () => clearInterval(interval);
  }, [activeExamId]);

  // Countdown timer tick
  useEffect(() => {
    if (remainingSeconds === null || remainingSeconds <= 0 || exam?.status !== "active") return;
    const timer = setInterval(() => {
      setRemainingSeconds((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [remainingSeconds, exam?.status]);

  // Cleanup peer connections on unmount
  useEffect(() => {
    return () => {
      peerConnections.current.forEach((pc) => pc.close());
      peerConnections.current.clear();
      setStudentStreams({});
    };
  }, [activeExamId]);

  // Attach MediaStreams to video elements
  useEffect(() => {
    Object.entries(studentStreams).forEach(([identity, stream]) => {
      const el = videoRefs.current[identity];
      if (el && el.srcObject !== stream) {
        el.srcObject = stream;
      }
    });
  }, [studentStreams, overview?.students, expandedStudentId]);

  // 4. Real-time WebSocket Listeners & WebRTC Signaling
  const { send: sendSocketMessage } = useRealtimeSocket({
    channel: "teacher",
    onMessage: async (msg) => {
      if (msg.exam_id && msg.exam_id !== activeExamId) return;

      // WebRTC Offer from Student Screen Sharing
      if (msg.type === "webrtc_offer") {
        const studentId = msg.student_id || msg.sender_id;
        if (!studentId) return;

        try {
          if (peerConnections.current.has(studentId)) {
            peerConnections.current.get(studentId)?.close();
          }

          const pc = new RTCPeerConnection({
            iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
          });
          peerConnections.current.set(studentId, pc);

          pc.onicecandidate = (event) => {
            if (event.candidate) {
              sendSocketMessage({
                type: "ice_candidate",
                target_user_id: studentId,
                candidate: event.candidate,
                exam_id: activeExamId,
              });
            }
          };

          pc.ontrack = (event) => {
            if (event.streams && event.streams[0]) {
              setStudentStreams((prev) => ({
                ...prev,
                [studentId]: event.streams[0],
              }));
            }
          };

          pc.onconnectionstatechange = () => {
            if (
              pc.connectionState === "disconnected" ||
              pc.connectionState === "failed" ||
              pc.connectionState === "closed"
            ) {
              setStudentStreams((prev) => {
                const updated = { ...prev };
                delete updated[studentId];
                return updated;
              });
              peerConnections.current.delete(studentId);
            }
          };

          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          sendSocketMessage({
            type: "webrtc_answer",
            target_user_id: studentId,
            sdp: answer,
            exam_id: activeExamId,
          });
        } catch (err) {
          console.error("Error negotiating WebRTC answer for student:", studentId, err);
        }
      } else if (msg.type === "ice_candidate") {
        const studentId = msg.student_id || msg.sender_id;
        const pc = peerConnections.current.get(studentId);
        if (pc && msg.candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
          } catch (e) {
            console.warn("ICE candidate add notice:", e);
          }
        }
      } else if (msg.type === "screen_share_stopped") {
        const studentId = msg.student_id || msg.sender_id;
        if (studentId && peerConnections.current.has(studentId)) {
          peerConnections.current.get(studentId)?.close();
          peerConnections.current.delete(studentId);
        }
        setStudentStreams((prev) => {
          const updated = { ...prev };
          delete updated[studentId];
          return updated;
        });
      } else if (msg.type === "student_stream_state") {
        setOverview((prev) => {
          if (!prev) return prev;
          const updated = prev.students.map((st) => {
            if (st.student_id === msg.student_id) {
              return {
                ...st,
                is_sharing_screen: msg.is_sharing_screen,
                share_status: msg.is_sharing_screen ? "sharing" : "stopped",
              };
            }
            return st;
          });
          const streamers = updated.filter((s) => s.is_sharing_screen).length;
          return { ...prev, students: updated, active_streamers: streamers };
        });

        if (msg.is_sharing_screen) {
          toast.success(`${msg.student_name} approved and started screen sharing`);
        } else {
          toast.info(`${msg.student_name} stopped screen sharing`);
        }
      } else if (msg.type === "screen_share_consent_response") {
        toast[msg.approved ? "success" : "warning"](
          `${msg.student_name} ${msg.approved ? "accepted" : "declined"} screen sharing request`
        );
        fetchOverview();
      } else if (msg.type === "integrity_alert") {
        toast.error(`ALERT: ${msg.alert?.alert_type || "Integrity Violation"}`, {
          description: msg.alert?.description,
        });
        fetchOverview();
      } else if (msg.type === "student_submission") {
        toast.info(`Student submission received: ${msg.student_name}`);
        fetchOverview();
      }
    },
  });

  // Action Handlers
  const handleRequestAllShare = async () => {
    try {
      await mediaApi.requestShare(activeExamId);
      toast.success("Broadcasted screen-sharing request to all enrolled students");
      fetchOverview();
    } catch (err: any) {
      toast.error(err?.message || "Failed to request screen sharing");
    }
  };

  const handleRequestIndividualShare = async (studentId: string, studentName: string) => {
    try {
      await mediaApi.requestShare(activeExamId, studentId);
      toast.success(`Screen share request sent to ${studentName}`);
      fetchOverview();
    } catch (err: any) {
      toast.error(err?.message || "Failed to request screen sharing");
    }
  };

  const handlePauseResume = async () => {
    if (!exam) return;
    try {
      if (exam.status === "active") {
        await examsApi.pause(exam.id);
        toast.warning("Examination paused");
      } else if (exam.status === "paused") {
        await examsApi.resume(exam.id);
        toast.success("Examination resumed");
      }
      fetchOverview();
    } catch (err: any) {
      toast.error(err?.message || "Action failed");
    }
  };

  const handleGrantTime = async () => {
    if (!activeExamId) return;
    try {
      await examsApi.grantTime(activeExamId, additionalMinutes);
      toast.success(`Granted ${additionalMinutes} additional minutes`);
      setShowGrantTimeModal(false);
      fetchOverview();
    } catch (err: any) {
      toast.error(err?.message || "Failed to extend time");
    }
  };

  const handleSendAnnouncement = async () => {
    if (!announcementText.trim() || !activeExamId) return;
    try {
      await mediaApi.broadcastAnnouncement(activeExamId, announcementText.trim(), announcementPriority);
      toast.success("Announcement broadcasted to examination workspace");
      setShowBroadcastModal(false);
      setAnnouncementText("");
    } catch (err: any) {
      toast.error(err?.message || "Failed to broadcast");
    }
  };

  const handleEndExam = async () => {
    if (!activeExamId) return;
    try {
      await examsApi.end(activeExamId);
      toast.info("Examination finalized and closed");
      setShowEndExamConfirm(false);
      fetchOverview();
    } catch (err: any) {
      toast.error(err?.message || "Failed to end exam");
    }
  };

  const handleAcknowledgeAlert = async (alertId: string) => {
    try {
      await alertsApi.acknowledge(alertId, proctorNote || "Acknowledged during live monitoring");
      toast.success("Alert acknowledged");
      setProctorNote("");
      fetchOverview();
    } catch (err: any) {
      toast.error("Failed to acknowledge alert");
    }
  };

  // Filtered & Sorted Student Cards
  const displayedStudents = useMemo(() => {
    if (!overview?.students) return [];
    return overview.students
      .filter((st) => {
        // Search filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = st.student_name.toLowerCase().includes(q);
          const matchRoll = st.roll_number.toLowerCase().includes(q);
          const matchEmail = st.email.toLowerCase().includes(q);
          if (!matchName && !matchRoll && !matchEmail) return false;
        }
        // Status filter
        if (statusFilter === "connected" && st.connection_status !== "connected") return false;
        if (statusFilter === "offline" && st.connection_status === "connected") return false;

        // Sharing filter
        if (sharingFilter === "sharing" && !st.is_sharing_screen) return false;
        if (sharingFilter === "not_sharing" && st.is_sharing_screen) return false;

        // Alert filter
        if (alertFilter === "alerts_only" && st.alert_count === 0) return false;
        if (alertFilter === "clean" && st.alert_count > 0) return false;

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "alerts") return b.alert_count - a.alert_count;
        if (sortBy === "status") return (b.is_sharing_screen ? 1 : 0) - (a.is_sharing_screen ? 1 : 0);
        return a.student_name.localeCompare(b.student_name);
      });
  }, [overview?.students, searchQuery, statusFilter, sharingFilter, alertFilter, sortBy]);

  // Adaptive Grid Column Count Calculator
  const gridColsClass = useMemo(() => {
    const count = displayedStudents.length;
    if (count <= 1) return "grid-cols-1";
    if (count === 2) return "grid-cols-1 sm:grid-cols-2";
    if (count <= 4) return "grid-cols-1 sm:grid-cols-2";
    if (count <= 9) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
    return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
  }, [displayedStudents.length]);

  const expandedStudent = useMemo(() => {
    if (!expandedStudentId || !overview?.students) return null;
    return overview.students.find((s) => s.student_id === expandedStudentId) || null;
  }, [expandedStudentId, overview?.students]);

  const formatTimer = (sec: number | null) => {
    if (sec === null) return "--:--";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      {/* Top Header & Exam Status Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-card border border-border p-5 rounded-2xl shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link to="/teacher/exams" className="text-muted-foreground hover:text-foreground p-1">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="p-2 bg-primary/10 text-primary rounded-xl">
              <Radio className="w-5 h-5 animate-pulse text-rose-500" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold tracking-tight text-foreground">{overview?.title || "Live Examination"}</h1>
                <Badge
                  variant={
                    exam?.status === "active"
                      ? "default"
                      : exam?.status === "paused"
                      ? "secondary"
                      : "outline"
                  }
                  className={`text-xs uppercase font-bold ${
                    exam?.status === "active" ? "bg-emerald-600 hover:bg-emerald-600 text-white" : ""
                  }`}
                >
                  {exam?.status || "Live"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Room: <span className="font-mono text-primary font-semibold">{overview?.room_name || "satark-room"}</span> • Code:{" "}
                <span className="font-mono font-bold text-foreground">{overview?.exam_code}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Live Countdown & Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Countdown timer pill */}
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted/50 border border-border">
            <Clock className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground font-medium">Time Remaining:</span>
            <span className="font-mono font-bold text-base text-foreground tracking-wide">
              {formatTimer(remainingSeconds)}
            </span>
          </div>

          <Button variant="outline" size="sm" onClick={() => setShowBroadcastModal(true)} className="gap-1.5 text-xs">
            <Megaphone className="w-4 h-4 text-primary" /> Broadcast
          </Button>

          <Button variant="outline" size="sm" onClick={() => setShowGrantTimeModal(true)} className="gap-1.5 text-xs">
            <PlusCircle className="w-4 h-4 text-emerald-500" /> Grant Time
          </Button>

          {exam?.status === "active" ? (
            <Button variant="outline" size="sm" onClick={handlePauseResume} className="gap-1.5 text-xs text-amber-500 hover:text-amber-600">
              <Pause className="w-4 h-4" /> Pause
            </Button>
          ) : exam?.status === "paused" ? (
            <Button variant="outline" size="sm" onClick={handlePauseResume} className="gap-1.5 text-xs text-emerald-500 hover:text-emerald-600">
              <Play className="w-4 h-4" /> Resume
            </Button>
          ) : null}

          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowEndExamConfirm(true)}
            className="gap-1.5 text-xs"
          >
            <StopCircle className="w-4 h-4" /> End Exam
          </Button>
        </div>
      </div>

      {/* SFU Configuration Notice Banner (if unconfigured) */}
      {overview && !overview.is_livekit_configured && (
        <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between gap-3 text-xs text-amber-600 dark:text-amber-400">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              LiveKit SFU not configured: Set <code>LIVEKIT_URL</code>, <code>LIVEKIT_API_KEY</code>, and <code>LIVEKIT_API_SECRET</code> in the backend environment to enable live WebRTC video streams.
            </span>
          </div>
          <Badge variant="outline" className="text-[10px] uppercase font-bold shrink-0 border-amber-500/40">
            Setup Required
          </Badge>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <Card className="border-border p-3.5 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-foreground">{overview?.total_enrolled || 0}</div>
            <div className="text-[11px] text-muted-foreground font-medium">Total Enrolled</div>
          </div>
        </Card>

        <Card className="border-border p-3.5 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500">
            <Monitor className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-foreground">{overview?.active_streamers || 0}</div>
            <div className="text-[11px] text-muted-foreground font-medium">Screens Streaming</div>
          </div>
        </Card>

        <Card className="border-border p-3.5 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500">
            <Wifi className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-foreground">{overview?.connected_count || 0}</div>
            <div className="text-[11px] text-muted-foreground font-medium">Devices Connected</div>
          </div>
        </Card>

        <Card className="border-border p-3.5 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-muted text-muted-foreground">
            <WifiOff className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-foreground">
              {Math.max(0, (overview?.total_enrolled || 0) - (overview?.connected_count || 0))}
            </div>
            <div className="text-[11px] text-muted-foreground font-medium">Offline / Pending</div>
          </div>
        </Card>

        <Card className="border-border p-3.5 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-foreground">{overview?.total_alerts || 0}</div>
            <div className="text-[11px] text-muted-foreground font-medium">Integrity Alerts</div>
          </div>
        </Card>
      </div>

      {/* Control & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card border border-border p-3 rounded-xl">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
            <Input
              placeholder="Search by student or roll..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="h-9 px-3 rounded-lg border border-border bg-background text-xs outline-none"
          >
            <option value="all">All Devices</option>
            <option value="connected">Connected Online</option>
            <option value="offline">Offline</option>
          </select>

          <select
            value={sharingFilter}
            onChange={(e) => setSharingFilter(e.target.value as any)}
            className="h-9 px-3 rounded-lg border border-border bg-background text-xs outline-none"
          >
            <option value="all">All Screen States</option>
            <option value="sharing">Live Streaming</option>
            <option value="not_sharing">Not Streaming</option>
          </select>

          <select
            value={alertFilter}
            onChange={(e) => setAlertFilter(e.target.value as any)}
            className="h-9 px-3 rounded-lg border border-border bg-background text-xs outline-none"
          >
            <option value="all">All Integrity Status</option>
            <option value="alerts_only">Flagged with Alerts</option>
            <option value="clean">Clean (No Alerts)</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="h-9 px-3 rounded-lg border border-border bg-background text-xs outline-none"
          >
            <option value="alerts">Sort by: Alert Count</option>
            <option value="status">Sort by: Stream State</option>
            <option value="name">Sort by: Name</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="default"
            onClick={handleRequestAllShare}
            className="h-9 text-xs gap-1.5 bg-primary text-primary-foreground font-semibold"
          >
            <Radio className="w-3.5 h-3.5" /> Request All Screens
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setViewMode(viewMode === "grid" ? "compact" : "grid")}
            className="h-9 text-xs"
          >
            {viewMode === "grid" ? "Compact View" : "Grid View"}
          </Button>
        </div>
      </div>

      {/* Adaptive Student Monitoring Grid */}
      {displayedStudents.length === 0 ? (
        <Card className="border-border p-12 text-center text-muted-foreground">
          <Monitor className="w-12 h-12 mx-auto mb-3 opacity-25" />
          <p className="text-base font-semibold">No student workstations matched filters</p>
          <p className="text-xs text-muted-foreground mt-1">Adjust search query or filter selectors above.</p>
        </Card>
      ) : (
        <div className={`grid ${gridColsClass} gap-4`}>
          {displayedStudents.map((student) => {
            const hasActiveStream = Boolean(studentStreams[student.student_id]);
            const isOnline = student.connection_status === "connected";
            const hasAlerts = student.alert_count > 0;

            return (
              <Card
                key={student.student_id}
                className={`overflow-hidden border transition-all flex flex-col justify-between ${
                  hasAlerts
                    ? "border-rose-500/60 shadow-sm"
                    : isOnline
                    ? "border-border hover:border-primary/50"
                    : "border-border/60 opacity-80"
                }`}
              >
                {/* Tile Header */}
                <div className="p-3 border-b border-border bg-card/60 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        isOnline ? "bg-emerald-500" : "bg-muted-foreground/50"
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="font-bold text-xs truncate text-foreground">{student.student_name}</div>
                      <div className="text-[10px] text-muted-foreground truncate font-mono">
                        Roll: {student.roll_number}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {hasAlerts && (
                      <Badge variant="destructive" className="text-[10px] h-5 px-1.5 font-bold gap-1">
                        <AlertTriangle className="w-3 h-3" /> {student.alert_count}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-mono capitalize">
                      {student.os_type || "browser"}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedStudentId(student.student_id)}
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                      title="Expand Live View"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Video / Screen Preview Area */}
                <div className="relative aspect-video bg-black/90 flex items-center justify-center overflow-hidden">
                  {student.is_sharing_screen ? (
                    <>
                      {/* Attached video element */}
                      <video
                        ref={(el) => (videoRefs.current[student.student_id] = el)}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-contain"
                      />
                      <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-emerald-600/90 text-white text-[10px] font-bold tracking-wider uppercase flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" /> Live Screen
                      </div>
                    </>
                  ) : (
                    /* Clear Offline / Pending Placeholder */
                    <div className="text-center p-4 text-muted-foreground/60 space-y-1.5">
                      <Laptop className="w-8 h-8 mx-auto opacity-30" />
                      <div className="text-xs font-semibold text-foreground/70">
                        {student.share_status === "pending"
                          ? "Consent Pending..."
                          : student.share_status === "rejected"
                          ? "Consent Declined"
                          : !isOnline
                          ? "Device Offline"
                          : "Screen sharing not started"}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {isOnline ? "Awaiting student browser approval" : "No active session"}
                      </p>

                      {isOnline && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRequestIndividualShare(student.student_id, student.student_name)}
                          className="h-6 text-[10px] mt-1 border-border/80"
                        >
                          Request Share
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Tile Footer */}
                <div className="p-2.5 px-3 border-t border-border bg-card/40 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="truncate">
                    {student.last_activity_at ? (
                      <>Active: {new Date(student.last_activity_at).toLocaleTimeString()}</>
                    ) : (
                      "No activity yet"
                    )}
                  </span>

                  <button
                    onClick={() => setExpandedStudentId(student.student_id)}
                    className="text-primary hover:underline font-medium text-xs flex items-center gap-1"
                  >
                    View Details
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* EXPANDED STUDENT LIVE VIEW MODAL */}
      {expandedStudent && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="p-4 px-6 border-b border-border flex items-center justify-between bg-card/60">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 text-primary rounded-xl">
                  <Monitor className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-base text-foreground">{expandedStudent.student_name}</h3>
                    <Badge variant="outline" className="font-mono text-xs">
                      Roll: {expandedStudent.roll_number}
                    </Badge>
                    <Badge
                      variant={expandedStudent.connection_status === "connected" ? "default" : "secondary"}
                      className={`text-[10px] capitalize ${
                        expandedStudent.connection_status === "connected" ? "bg-emerald-600 text-white" : ""
                      }`}
                    >
                      {expandedStudent.connection_status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{expandedStudent.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRequestIndividualShare(expandedStudent.student_id, expandedStudent.student_name)}
                  className="text-xs h-8 gap-1.5"
                >
                  <Radio className="w-3.5 h-3.5" /> Request Share
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpandedStudentId(null)}
                  className="h-8 w-8 p-0"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* Modal Body: Left Expanded Video + Right Telemetry */}
            <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-y-auto">
              {/* Video Player Area */}
              <div className="lg:col-span-8 bg-black/95 flex items-center justify-center p-4 relative min-h-[360px]">
                {expandedStudent.is_sharing_screen ? (
                  <video
                    ref={(el) => {
                      if (el && studentStreams[expandedStudent.student_id]) {
                        el.srcObject = studentStreams[expandedStudent.student_id];
                      }
                    }}
                    autoPlay
                    playsInline
                    controls
                    className="w-full h-full max-h-[500px] object-contain rounded-lg"
                  />
                ) : (
                  <div className="text-center text-muted-foreground/60 space-y-2">
                    <Laptop className="w-12 h-12 mx-auto opacity-30" />
                    <p className="text-sm font-semibold text-foreground/80">Screen stream not currently transmitting</p>
                    <p className="text-xs text-muted-foreground">
                      Status: <strong>{expandedStudent.share_status}</strong>
                    </p>
                  </div>
                )}
              </div>

              {/* Telemetry & Alerts Sidebar */}
              <div className="lg:col-span-4 border-l border-border p-5 space-y-5 bg-card/30 overflow-y-auto max-h-[600px]">
                {/* Device Info */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Device Telemetry</h4>
                  <div className="p-3 rounded-xl bg-muted/40 border border-border text-xs space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">OS Platform:</span>
                      <span className="font-semibold capitalize text-foreground">{expandedStudent.os_type || "Web Browser"}</span>
                    </div>
                    {expandedStudent.device_hostname && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Hostname:</span>
                        <span className="font-mono text-foreground">{expandedStudent.device_hostname}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Screen Share:</span>
                      <span
                        className={`font-semibold capitalize ${
                          expandedStudent.is_sharing_screen ? "text-emerald-500" : "text-muted-foreground"
                        }`}
                      >
                        {expandedStudent.share_status}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Integrity Alerts Timeline */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase text-muted-foreground tracking-wider">
                      Integrity Alerts ({expandedStudent.recent_alerts?.length || 0})
                    </h4>
                  </div>

                  {expandedStudent.recent_alerts && expandedStudent.recent_alerts.length > 0 ? (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {expandedStudent.recent_alerts.map((al) => (
                        <div
                          key={al.id}
                          className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/5 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-rose-500 capitalize">{al.alert_type}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(al.created_at).toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="text-[11px] text-foreground">{al.description}</p>
                          {!al.is_acknowledged && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAcknowledgeAlert(al.id)}
                              className="mt-1 h-6 text-[10px] text-primary border-primary/30"
                            >
                              Acknowledge
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl border border-border/80 text-center text-xs text-muted-foreground">
                      <CheckCircle className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
                      No integrity violations recorded for this student.
                    </div>
                  )}
                </div>

                {/* Proctor Notes */}
                <div className="space-y-2 pt-2 border-t border-border">
                  <Label className="text-xs font-semibold">Proctor Notes</Label>
                  <textarea
                    rows={2}
                    placeholder="Enter observation notes for audit trail..."
                    value={proctorNote}
                    onChange={(e) => setProctorNote(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 px-6 border-t border-border flex justify-end bg-card/60">
              <Button size="sm" variant="ghost" onClick={() => setExpandedStudentId(null)}>
                Return to Monitoring Grid
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Grant Time */}
      {showGrantTimeModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <h3 className="font-bold text-base text-foreground flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-emerald-500" /> Extend Examination Time
            </h3>
            <p className="text-xs text-muted-foreground">
              Grant extra time to all enrolled students currently writing this examination.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Additional Minutes</Label>
              <div className="grid grid-cols-4 gap-2">
                {[5, 10, 15, 30].map((m) => (
                  <Button
                    key={m}
                    type="button"
                    variant={additionalMinutes === m ? "default" : "outline"}
                    size="sm"
                    onClick={() => setAdditionalMinutes(m)}
                    className="text-xs"
                  >
                    +{m}m
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button size="sm" variant="ghost" onClick={() => setShowGrantTimeModal(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleGrantTime}>
                Confirm Extension
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Broadcast Announcement */}
      {showBroadcastModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <h3 className="font-bold text-base text-foreground flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-primary" /> Broadcast Announcement
            </h3>
            <p className="text-xs text-muted-foreground">
              Send an instant announcement banner to all participating student workstations.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Message</Label>
              <textarea
                required
                rows={3}
                placeholder="e.g. Please review questions 15 to 20 carefully..."
                value={announcementText}
                onChange={(e) => setAnnouncementText(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button size="sm" variant="ghost" onClick={() => setShowBroadcastModal(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSendAnnouncement}>
                Broadcast to Students
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: End Exam Confirmation */}
      {showEndExamConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <h3 className="font-bold text-base text-rose-500 flex items-center gap-2">
              <StopCircle className="w-5 h-5" /> Finalize & End Examination?
            </h3>
            <p className="text-xs text-muted-foreground">
              This will close all student submissions, finalize scoring, and shut down the WebRTC streaming room. This action cannot be reversed.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button size="sm" variant="ghost" onClick={() => setShowEndExamConfirm(false)}>
                Cancel
              </Button>
              <Button size="sm" variant="destructive" onClick={handleEndExam}>
                Yes, End Examination
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default LiveMonitoring;
