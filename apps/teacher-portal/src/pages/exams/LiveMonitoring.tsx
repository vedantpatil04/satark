import React, { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Monitor,
  Camera,
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
  ArrowLeft,
  RefreshCw,
  SlidersHorizontal,
  ShieldAlert,
  UserCheck,
  Laptop,
  Check,
  X,
  Layers,
  Smartphone
} from "lucide-react";
import { toast } from "sonner";
import { examsApi, mediaApi, alertsApi, type ExamSession } from "@satark/shared-api";
import { useRealtimeSocket } from "@/hooks/useRealtimeSocket";
import type {
  MonitoringOverview,
  StudentMonitoringCard
} from "@satark/shared-types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface StudentStreamBundle {
  screen?: MediaStream;
  camera?: MediaStream;
  activeMode: "screen" | "camera" | "pip";
}

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
  const pendingCandidates = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const offerMetadata = useRef<Map<string, any>>(new Map());
  const [studentStreams, setStudentStreams] = useState<Record<string, StudentStreamBundle>>({});
  const [streamHealth, setStreamHealth] = useState<Record<string, { screenPlaying?: boolean; cameraPlaying?: boolean }>>({});
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const cameraVideoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const tileRefs = useRef<Record<string, HTMLDivElement | null>>({});

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
    const interval = setInterval(fetchOverview, 8000); // Polling sync fallback
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

  // Attach MediaStreams to video elements (Screen is strictly primary)
  useEffect(() => {
    Object.entries(studentStreams).forEach(([identity, bundle]) => {
      // Main video element: Always student screen stream when available
      const mainEl = videoRefs.current[identity];
      const activeStream = bundle.screen || bundle.camera;

      if (mainEl && activeStream && mainEl.srcObject !== activeStream) {
        mainEl.srcObject = activeStream;
        mainEl.play().catch((err) => console.warn("Auto-play main video stream caught:", err));
      }

      // Optional webcam PiP inset: only when camera is active alongside screen
      const camEl = cameraVideoRefs.current[identity];
      if (camEl && bundle.camera && camEl.srcObject !== bundle.camera) {
        camEl.srcObject = bundle.camera;
        camEl.play().catch((err) => console.warn("Auto-play webcam PiP stream caught:", err));
      }
    });
  }, [studentStreams, overview?.students, expandedStudentId]);

  // 4. Real-time WebSocket Listeners & WebRTC Signaling
  const { send: sendSocketMessage } = useRealtimeSocket({
    channel: "teacher",
    onMessage: async (msg) => {
      if (msg.exam_id && msg.exam_id !== activeExamId) return;

      // WebRTC Offer from Student Screen/Camera Sharing
      if (msg.type === "webrtc_offer") {
        const studentId = msg.student_id || msg.sender_id;
        const streamType = msg.stream_type || "screen";
        if (!studentId) return;

        try {
          // Store offer metadata for accurate track demuxing
          offerMetadata.current.set(studentId, msg);

          if (peerConnections.current.has(studentId)) {
            peerConnections.current.get(studentId)?.close();
          }

          const pc = new RTCPeerConnection({
            iceServers: [
              { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
            ],
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
            const meta = offerMetadata.current.get(studentId) || {};
            const track = event.track;
            const trackId = track.id;
            const streamId = event.streams && event.streams[0] ? event.streams[0].id : "";
            const contentHint = track.contentHint;
            const trackLabel = (track.label || "").toLowerCase();

            // Create dedicated MediaStream with this single track to prevent stream contamination
            const incomingStream = new MediaStream([track]);

            setStudentStreams((prev) => {
              const current = prev[studentId] || { activeMode: "pip" };

              // Disambiguate Camera vs Screen
              let isCamera = false;
              if (meta.camera_track_id && trackId === meta.camera_track_id) {
                isCamera = true;
              } else if (meta.screen_track_id && trackId === meta.screen_track_id) {
                isCamera = false;
              } else if (meta.camera_stream_id && streamId === meta.camera_stream_id) {
                isCamera = true;
              } else if (meta.screen_stream_id && streamId === meta.screen_stream_id) {
                isCamera = false;
              } else if (contentHint === "motion" || streamType === "camera") {
                isCamera = true;
              } else if (contentHint === "detail" || streamType === "screen") {
                isCamera = false;
              } else if (
                trackLabel.includes("camera") ||
                trackLabel.includes("webcam") ||
                trackLabel.includes("user") ||
                trackLabel.includes("front") ||
                trackLabel.includes("integrated")
              ) {
                isCamera = true;
              } else if (current.screen && !current.camera) {
                // Screen already set, subsequent track is camera
                isCamera = true;
              } else if (current.camera && !current.screen) {
                // Camera already set, subsequent track is screen
                isCamera = false;
              }

              if (isCamera) {
                return {
                  ...prev,
                  [studentId]: {
                    ...current,
                    camera: incomingStream,
                    activeMode: "pip",
                  },
                };
              } else {
                return {
                  ...prev,
                  [studentId]: {
                    ...current,
                    screen: incomingStream,
                    activeMode: current.camera ? "pip" : "screen",
                  },
                };
              }
            });
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
              setStreamHealth((prev) => {
                const updated = { ...prev };
                delete updated[studentId];
                return updated;
              });
              peerConnections.current.delete(studentId);
            }
          };

          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));

          // Drain queued ICE candidates
          const queued = pendingCandidates.current.get(studentId) || [];
          for (const cand of queued) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            } catch (err) {
              console.warn("Error adding queued ICE candidate:", err);
            }
          }
          pendingCandidates.current.delete(studentId);

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
        if (!studentId || !msg.candidate) return;
        const pc = peerConnections.current.get(studentId);
        if (pc && pc.remoteDescription && pc.remoteDescription.type) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
          } catch (e) {
            console.warn("ICE candidate add notice:", e);
          }
        } else {
          const list = pendingCandidates.current.get(studentId) || [];
          list.push(msg.candidate);
          pendingCandidates.current.set(studentId, list);
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
        setStreamHealth((prev) => {
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
                is_camera_streaming: msg.is_camera_streaming ?? st.is_camera_streaming,
                share_status: (msg.is_sharing_screen ? "sharing" : "stopped") as "sharing" | "stopped",
              };
            }
            return st;
          });
          const streamers = updated.filter((s) => s.is_sharing_screen || s.is_camera_streaming).length;
          return { ...prev, students: updated, active_streamers: streamers };
        });

        if (msg.is_sharing_screen || msg.is_camera_streaming) {
          toast.success(`${msg.student_name} approved and started live streaming`);
        } else {
          toast.info(`${msg.student_name} stopped live stream`);
        }
      } else if (msg.type === "screen_share_consent_response") {
        toast[msg.approved ? "success" : "warning"](
          `${msg.student_name} ${msg.approved ? "accepted" : "declined"} media stream request`
        );
        fetchOverview();
      } else if (msg.type === "integrity_alert") {
        toast.error(`ALERT: ${msg.alert?.alert_type || "Integrity Violation"}`, {
          description: msg.alert?.description,
        });
        fetchOverview();
      } else if (msg.type === "student_submission") {
        toast.info(`Candidate submission received: ${msg.student_name}`);
        fetchOverview();
      }
    },
  });

  // Action Handlers
  const handleRequestAllShare = async () => {
    try {
      await mediaApi.requestShare(activeExamId);
      sendSocketMessage({
        type: "screen_share_request",
        exam_id: activeExamId,
      });
      toast.success("Broadcasted stream request to all participating students");
      fetchOverview();
    } catch (err: any) {
      toast.error(err?.message || "Failed to request screen sharing");
    }
  };

  const handleRequestIndividualShare = async (studentId: string, studentName: string) => {
    try {
      await mediaApi.requestShare(activeExamId, studentId);
      sendSocketMessage({
        type: "screen_share_request",
        student_id: studentId,
        exam_id: activeExamId,
      });
      toast.success(`Screen share request sent to ${studentName}`);
      fetchOverview();
    } catch (err: any) {
      toast.error(err?.message || "Failed to request screen sharing");
    }
  };

  const handleToggleStreamMode = (studentId: string) => {
    setStudentStreams((prev) => {
      const bundle = prev[studentId];
      if (!bundle) return prev;
      const modes: Array<"screen" | "camera" | "pip"> = [];
      if (bundle.screen) modes.push("screen");
      if (bundle.camera) modes.push("camera");
      if (bundle.screen && bundle.camera) modes.push("pip");

      if (modes.length <= 1) return prev;
      const currIdx = modes.indexOf(bundle.activeMode);
      const nextMode = modes[(currIdx + 1) % modes.length];

      return {
        ...prev,
        [studentId]: {
          ...bundle,
          activeMode: nextMode,
        },
      };
    });
  };

  const handleTileFullscreen = (studentId: string) => {
    const tileEl = tileRefs.current[studentId];
    if (tileEl) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        tileEl.requestFullscreen().catch(() => {});
      }
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
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = st.student_name.toLowerCase().includes(q);
          const matchRoll = st.roll_number.toLowerCase().includes(q);
          const matchEmail = st.email.toLowerCase().includes(q);
          if (!matchName && !matchRoll && !matchEmail) return false;
        }
        if (statusFilter === "connected" && st.connection_status !== "connected") return false;
        if (statusFilter === "offline" && st.connection_status === "connected") return false;

        if (sharingFilter === "sharing" && !st.is_sharing_screen && !st.is_camera_streaming) return false;
        if (sharingFilter === "not_sharing" && (st.is_sharing_screen || st.is_camera_streaming)) return false;

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

  // Adaptive Grid Column Count Calculator (Optimized for up to 5 concurrent streams)
  const gridColsClass = useMemo(() => {
    const count = displayedStudents.length;
    if (count <= 1) return "grid-cols-1";
    if (count === 2) return "grid-cols-1 sm:grid-cols-2";
    if (count <= 4) return "grid-cols-1 sm:grid-cols-2";
    if (count <= 6) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
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
    <div className="p-6 max-w-7xl mx-auto space-y-6 pb-8">
      {/* Top Header & Exam Status Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white border border-stone-200/80 p-5 rounded-3xl shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link to="/teacher/exams" className="text-stone-400 hover:text-slate-800 p-1">
              <ArrowLeft className="w-5 h-5 text-[#D97706]" />
            </Link>
            <div className="w-10 h-10 rounded-xl bg-[#FFF2E5] text-[#D97706] flex items-center justify-center font-black shrink-0">
              <Radio className="w-5 h-5 animate-pulse text-[#D97706]" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-extrabold tracking-tight text-slate-900">{overview?.title || "Live Examination"}</h1>
                <Badge
                  variant={
                    exam?.status === "active"
                      ? "default"
                      : exam?.status === "paused"
                      ? "secondary"
                      : "outline"
                  }
                  className={`text-xs uppercase font-bold rounded-lg ${
                    exam?.status === "active" ? "bg-emerald-600 hover:bg-emerald-600 text-white" : ""
                  }`}
                >
                  {exam?.status || "Live"}
                </Badge>
              </div>
              <p className="text-xs text-stone-500">
                Room: <span className="font-mono text-[#D97706] font-semibold">{overview?.room_name || "satark-room"}</span> • PIN:{" "}
                <span className="font-mono font-bold text-slate-900">{overview?.exam_code}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Live Countdown, LAN Hub Badge & Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Native WebRTC LAN Status Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#EAF8F0] border border-[#D5F2E2] text-[#1E7E51] text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <span>Native WebRTC LAN</span>
            <Badge variant="outline" className="text-[10px] uppercase font-bold border-emerald-300 ml-1 bg-white">
              Offline P2P
            </Badge>
          </div>

          {/* Countdown timer pill */}
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#FFF9F2] border border-amber-200 text-[#D97706]">
            <Clock className="w-3.5 h-3.5" />
            <span className="text-[11px] font-semibold">Remaining:</span>
            <span className="font-mono font-black text-sm tracking-wide">
              {formatTimer(remainingSeconds)}
            </span>
          </div>

          <Button variant="outline" size="sm" onClick={() => setShowBroadcastModal(true)} className="gap-1.5 text-xs rounded-xl bg-white border-stone-200 hover:bg-stone-50 h-8 font-medium">
            <Megaphone className="w-3.5 h-3.5 text-[#D97706]" /> Broadcast
          </Button>

          <Button variant="outline" size="sm" onClick={() => setShowGrantTimeModal(true)} className="gap-1.5 text-xs rounded-xl bg-white border-stone-200 hover:bg-stone-50 h-8 font-medium">
            <PlusCircle className="w-3.5 h-3.5 text-emerald-600" /> Grant Time
          </Button>

          {exam?.status === "active" ? (
            <Button variant="outline" size="sm" onClick={handlePauseResume} className="gap-1.5 text-xs rounded-xl bg-white border-stone-200 hover:bg-stone-50 h-8 text-amber-600 font-medium">
              <Pause className="w-3.5 h-3.5" /> Pause
            </Button>
          ) : exam?.status === "paused" ? (
            <Button variant="outline" size="sm" onClick={handlePauseResume} className="gap-1.5 text-xs rounded-xl bg-white border-stone-200 hover:bg-stone-50 h-8 text-emerald-600 font-medium">
              <Play className="w-3.5 h-3.5" /> Resume
            </Button>
          ) : null}

          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowEndExamConfirm(true)}
            className="gap-1.5 text-xs rounded-xl h-8 font-semibold bg-rose-600 hover:bg-rose-700 shadow-xs"
          >
            <StopCircle className="w-3.5 h-3.5" /> End Exam
          </Button>
        </div>
      </div>

      {/* Signature Pastel Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="rounded-2xl bg-[#EAF8F0] border border-[#D5F2E2] p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white text-emerald-700 flex items-center justify-center shadow-xs shrink-0">
            <UserCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xl font-extrabold text-slate-900">{overview?.total_enrolled || 0}</div>
            <div className="text-[11px] text-emerald-800 font-medium">Total Enrolled</div>
          </div>
        </div>

        <div className="rounded-2xl bg-[#FEF3E8] border border-[#FDE5CC] p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white text-[#D97706] flex items-center justify-center shadow-xs shrink-0">
            <Monitor className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xl font-extrabold text-slate-900">
              {overview?.active_streamers || Object.values(studentStreams).filter((s) => s.screen).length}
            </div>
            <div className="text-[11px] text-amber-800 font-medium">Screens Live (Max 5)</div>
          </div>
        </div>

        <div className="rounded-2xl bg-[#EEF2FC] border border-[#DDE6F8] p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white text-blue-700 flex items-center justify-center shadow-xs shrink-0">
            <Wifi className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xl font-extrabold text-slate-900">{overview?.connected_count || 0}</div>
            <div className="text-[11px] text-blue-800 font-medium">Connected</div>
          </div>
        </div>

        <div className="rounded-2xl bg-[#F6F5F2] border border-stone-200 p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white text-stone-600 flex items-center justify-center shadow-xs shrink-0">
            <WifiOff className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xl font-extrabold text-slate-900">
              {Math.max(0, (overview?.total_enrolled || 0) - (overview?.connected_count || 0))}
            </div>
            <div className="text-[11px] text-stone-600 font-medium">Offline / Idle</div>
          </div>
        </div>

        <div className="rounded-2xl bg-[#FDF2F2] border border-rose-200 p-4 flex items-center gap-3 col-span-2 sm:col-span-1">
          <div className="w-9 h-9 rounded-xl bg-white text-rose-600 flex items-center justify-center shadow-xs shrink-0">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xl font-extrabold text-slate-900">{overview?.total_alerts || 0}</div>
            <div className="text-[11px] text-rose-800 font-medium">Integrity Alerts</div>
          </div>
        </div>
      </div>

      {/* Control & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white border border-stone-200/80 p-3 rounded-2xl shadow-xs">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative w-full sm:w-60">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-stone-400" />
            <input
              placeholder="Search candidate or roll..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 h-8.5 text-xs bg-[#F4F4F2] border-0 rounded-full text-slate-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#D97706]/40"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="h-8.5 px-3 rounded-xl border border-stone-200 bg-stone-50 text-xs text-slate-700 outline-none"
          >
            <option value="all">All Devices</option>
            <option value="connected">Connected Online</option>
            <option value="offline">Offline</option>
          </select>

          <select
            value={sharingFilter}
            onChange={(e) => setSharingFilter(e.target.value as any)}
            className="h-8.5 px-3 rounded-xl border border-stone-200 bg-stone-50 text-xs text-slate-700 outline-none"
          >
            <option value="all">All Stream States</option>
            <option value="sharing">Live Streaming</option>
            <option value="not_sharing">Not Streaming</option>
          </select>

          <select
            value={alertFilter}
            onChange={(e) => setAlertFilter(e.target.value as any)}
            className="h-8.5 px-3 rounded-xl border border-stone-200 bg-stone-50 text-xs text-slate-700 outline-none"
          >
            <option value="all">All Integrity Status</option>
            <option value="alerts_only">Flagged with Alerts</option>
            <option value="clean">Clean (No Alerts)</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="h-8.5 px-3 rounded-xl border border-stone-200 bg-stone-50 text-xs text-slate-700 outline-none"
          >
            <option value="alerts">Sort: Alert Count</option>
            <option value="status">Sort: Stream State</option>
            <option value="name">Sort: Candidate Name</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleRequestAllShare}
            className="h-8.5 text-xs gap-1.5 bg-[#D97706] hover:bg-[#B45309] text-white font-semibold rounded-xl shadow-xs"
          >
            <Radio className="w-3.5 h-3.5" /> Request All Screens
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setViewMode(viewMode === "grid" ? "compact" : "grid")}
            className="h-8.5 text-xs rounded-xl border-stone-200 bg-white hover:bg-stone-50 text-stone-700"
          >
            {viewMode === "grid" ? "Compact" : "Grid"}
          </Button>
        </div>
      </div>

      {/* Adaptive Student Monitoring Grid (Supports up to 5 concurrent WebRTC streams) */}
      {displayedStudents.length === 0 ? (
        <div className="rounded-3xl border border-stone-200/80 bg-white p-12 text-center text-stone-400">
          <Monitor className="w-12 h-12 mx-auto mb-3 opacity-25" />
          <p className="text-base font-semibold text-slate-800">No student workstations matched filters</p>
          <p className="text-xs text-stone-400 mt-1">Adjust search query or filter selectors above.</p>
        </div>
      ) : (
        <div className={`grid ${gridColsClass} gap-4`}>
          {displayedStudents.map((student) => {
            const bundle = studentStreams[student.student_id];
            const hasActiveStream = Boolean(bundle?.screen || bundle?.camera);
            const isOnline = student.connection_status === "connected";
            const hasAlerts = student.alert_count > 0;
            const isAndroid = (student.os_type || "").toLowerCase().includes("android") || (student.device_hostname || "").toLowerCase().includes("android");

            return (
              <Card
                key={student.student_id}
                ref={(el) => (tileRefs.current[student.student_id] = el)}
                className={`overflow-hidden rounded-2xl bg-white border transition-all flex flex-col justify-between shadow-xs hover:shadow-md ${
                  hasAlerts
                    ? "border-rose-400/80 ring-1 ring-rose-400/30"
                    : isOnline
                    ? "border-stone-200/90 hover:border-amber-400"
                    : "border-stone-200/60 opacity-80"
                }`}
              >
                {/* Tile Header */}
                <div className="p-3 border-b border-stone-100 bg-[#FCFBF8] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        isOnline ? "bg-emerald-500" : "bg-stone-300"
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="font-bold text-xs truncate text-slate-900">{student.student_name}</div>
                      <div className="text-[10px] text-stone-400 truncate font-mono">
                        Roll: {student.roll_number}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {hasAlerts && (
                      <Badge variant="destructive" className="text-[10px] h-5 px-1.5 font-bold gap-1 bg-rose-50 text-rose-700 border-rose-200">
                        <AlertTriangle className="w-3 h-3 text-rose-600" /> {student.alert_count}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-mono capitalize bg-white text-stone-600 border-stone-200">
                      {isAndroid ? <Smartphone className="w-2.5 h-2.5 text-emerald-500" /> : <Laptop className="w-2.5 h-2.5" />}
                      {student.os_type || "browser"}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTileFullscreen(student.student_id)}
                      className="h-6 w-6 p-0 text-stone-400 hover:text-slate-800"
                      title="Fullscreen Stream Tile"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedStudentId(student.student_id)}
                      className="h-6 w-6 p-0 text-stone-400 hover:text-slate-800"
                      title="Expand Details"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Video / Stream Preview Area (Screen, Camera, or PiP) */}
                <div className="relative aspect-video bg-black/90 flex items-center justify-center overflow-hidden group">
                  {hasActiveStream ? (
                    <>
                      {/* Main Video Element */}
                      <video
                        ref={(el) => {
                          videoRefs.current[student.student_id] = el;
                          const activeStream =
                            bundle?.activeMode === "camera" && bundle?.camera
                              ? bundle.camera
                              : bundle?.screen || bundle?.camera;
                          if (el && activeStream && el.srcObject !== activeStream) {
                            el.srcObject = activeStream;
                            el.play().catch(() => {});
                          }
                        }}
                        autoPlay
                        playsInline
                        muted
                        onPlaying={() => {
                          setStreamHealth((prev) => ({
                            ...prev,
                            [student.student_id]: {
                              ...(prev[student.student_id] || {}),
                              screenPlaying: true,
                            },
                          }));
                        }}
                        onLoadedMetadata={(e) => (e.target as HTMLVideoElement).play().catch(() => {})}
                        className="w-full h-full object-contain"
                      />

                      {/* Picture-in-Picture Inset (If camera exists) */}
                      {bundle?.camera && (
                        <div className="absolute bottom-2 right-2 w-28 sm:w-36 aspect-video rounded-lg overflow-hidden border-2 border-primary/80 shadow-lg bg-black z-10 transition-all hover:scale-105">
                          <video
                            ref={(el) => {
                              cameraVideoRefs.current[student.student_id] = el;
                              if (el && bundle?.camera && el.srcObject !== bundle.camera) {
                                el.srcObject = bundle.camera;
                                el.play().catch(() => {});
                              }
                            }}
                            autoPlay
                            playsInline
                            muted
                            onPlaying={() => {
                              setStreamHealth((prev) => ({
                                ...prev,
                                [student.student_id]: {
                                  ...(prev[student.student_id] || {}),
                                  cameraPlaying: true,
                                },
                              }));
                            }}
                            onLoadedMetadata={(e) => (e.target as HTMLVideoElement).play().catch(() => {})}
                            className="w-full h-full object-cover"
                          />
                          <span className="absolute top-1 left-1 px-1 py-0.2 bg-black/70 text-[8px] font-mono font-bold text-white rounded">
                            CAM
                          </span>
                        </div>
                      )}

                      {/* Stream Status Overlay Badges */}
                      <div className="absolute top-2 left-2 flex items-center gap-1.5">
                        {bundle?.screen ? (
                          <div
                            className={`px-2 py-0.5 rounded text-white text-[10px] font-bold tracking-wider uppercase flex items-center gap-1 shadow-sm ${
                              streamHealth[student.student_id]?.screenPlaying
                                ? "bg-emerald-600/95"
                                : "bg-amber-600/90"
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full bg-white ${
                                streamHealth[student.student_id]?.screenPlaying
                                  ? "animate-ping"
                                  : "animate-pulse"
                              }`}
                            />
                            <Monitor className="w-3 h-3" />
                            <span>
                              {streamHealth[student.student_id]?.screenPlaying
                                ? "Live Screen"
                                : "Connecting..."}
                            </span>
                          </div>
                        ) : (
                          <div className="px-2 py-0.5 rounded bg-amber-500/95 text-white text-[10px] font-bold tracking-wider uppercase flex items-center gap-1 shadow-sm">
                            <Camera className="w-3 h-3" />
                            <span>Webcam Only (Screen Required)</span>
                          </div>
                        )}

                        {bundle?.camera && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-white/90 text-[9px] font-mono border ${
                              streamHealth[student.student_id]?.cameraPlaying
                                ? "bg-black/60 border-emerald-500/50"
                                : "bg-black/60 border-white/20"
                            }`}
                          >
                            + Webcam (PiP){streamHealth[student.student_id]?.cameraPlaying ? " ✓" : ""}
                          </span>
                        )}

                        {/* Stream Mode Switcher Button */}
                        {(bundle?.camera && bundle?.screen) && (
                          <button
                            type="button"
                            onClick={() => handleToggleStreamMode(student.student_id)}
                            className="px-2 py-0.5 rounded bg-black/70 hover:bg-black/90 text-white text-[10px] font-bold flex items-center gap-1 shadow-sm border border-white/20"
                            title="Toggle Screen / Camera / PiP view"
                          >
                            <Layers className="w-3 h-3" />
                            <span className="uppercase">{bundle.activeMode}</span>
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    /* Clear Offline / Pending Placeholder */
                    <div className="text-center p-4 text-muted-foreground/60 space-y-1.5">
                      {isAndroid ? (
                        <Smartphone className="w-8 h-8 mx-auto opacity-40 text-emerald-500" />
                      ) : (
                        <Monitor className="w-8 h-8 mx-auto opacity-30" />
                      )}
                      <div className="text-xs font-semibold text-foreground/70">
                        {student.share_status === "pending"
                          ? "Screen Share Consent Pending..."
                          : student.share_status === "rejected"
                          ? "Screen Share Declined by Student"
                          : !isOnline
                          ? "Workstation Offline"
                          : isAndroid
                          ? "Awaiting Android MediaProjection Screen Share"
                          : "Screen share not transmitting"}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {isOnline
                          ? isAndroid
                            ? "Awaiting student Android MediaProjection consent"
                            : "Awaiting student screen selection"
                          : "No active workstation session"}
                      </p>

                      {isOnline && (
                        <div className="flex items-center justify-center gap-1.5 pt-1">
                          <Button
                            size="sm"
                            onClick={() => handleRequestIndividualShare(student.student_id, student.student_name)}
                            className="h-6 text-[10px] bg-[#D97706] hover:bg-[#B45309] text-white font-semibold rounded-lg"
                          >
                            <Monitor className="w-3 h-3 mr-1" /> Request Stream
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Tile Footer */}
                <div className="p-2.5 px-3 border-t border-stone-100 bg-[#FCFBF8] flex items-center justify-between text-[11px] text-stone-500">
                  <span className="truncate">
                    {student.last_activity_at ? (
                      <>Active: {new Date(student.last_activity_at).toLocaleTimeString()}</>
                    ) : (
                      "No activity recorded"
                    )}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleTileFullscreen(student.student_id)}
                      className="text-stone-400 hover:text-slate-800 text-xs"
                      title="Fullscreen"
                    >
                      <Maximize2 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => setExpandedStudentId(student.student_id)}
                      className="text-[#D97706] hover:underline font-semibold text-xs flex items-center gap-1"
                    >
                      Telemetry
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* EXPANDED STUDENT LIVE VIEW MODAL */}
      {expandedStudent && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white border border-stone-200/80 rounded-3xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="p-4 px-6 border-b border-stone-100 flex items-center justify-between bg-[#FCFBF8]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#FFF2E5] text-[#D97706] flex items-center justify-center font-black shrink-0">
                  <Monitor className="w-4 h-4 text-[#D97706]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-base text-slate-900">{expandedStudent.student_name}</h3>
                    <Badge variant="outline" className="font-mono text-xs bg-white text-stone-600 border-stone-200">
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
                  <p className="text-xs text-stone-500">{expandedStudent.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => handleRequestIndividualShare(expandedStudent.student_id, expandedStudent.student_name)}
                  className="text-xs h-8 gap-1.5 bg-[#D97706] hover:bg-[#B45309] text-white font-semibold rounded-xl shadow-xs"
                >
                  <Monitor className="w-3.5 h-3.5" /> Request Stream
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpandedStudentId(null)}
                  className="h-8 w-8 p-0 text-stone-400 hover:text-slate-800 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* Modal Body: Left Expanded Video + Right Telemetry */}
            <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-y-auto">
              {/* Video Player Area */}
              <div className="lg:col-span-8 bg-black/95 flex items-center justify-center p-4 relative min-h-[360px]">
                {studentStreams[expandedStudent.student_id] ? (
                  <div className="relative w-full h-full max-h-[500px] flex items-center justify-center">
                    <video
                      ref={(el) => {
                        const b = studentStreams[expandedStudent.student_id];
                        const s =
                          b?.activeMode === "camera" && b?.camera
                            ? b.camera
                            : b?.screen || b?.camera;
                        if (el && s && el.srcObject !== s) {
                          el.srcObject = s;
                          el.play().catch(() => {});
                        }
                      }}
                      autoPlay
                      playsInline
                      muted
                      controls
                      className="w-full h-full object-contain rounded-lg"
                    />

                    {/* PiP Camera Inset in Modal */}
                    {studentStreams[expandedStudent.student_id]?.camera && (
                      <div className="absolute bottom-4 right-4 w-40 aspect-video rounded-lg overflow-hidden border-2 border-primary shadow-xl bg-black">
                        <video
                          ref={(el) => {
                            const c = studentStreams[expandedStudent.student_id]?.camera;
                            if (el && c && el.srcObject !== c) {
                              el.srcObject = c;
                              el.play().catch(() => {});
                            }
                          }}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute top-1 left-1 px-1 py-0.2 bg-black/70 text-[8px] font-mono font-bold text-white rounded">
                          CAM
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground/60 space-y-2">
                    <Monitor className="w-12 h-12 mx-auto opacity-30" />
                    <p className="text-sm font-semibold text-foreground/80">Candidate screen not currently transmitting</p>
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
                      <span className="text-muted-foreground">Stream Status:</span>
                      <span
                        className={`font-semibold capitalize ${
                          expandedStudent.is_sharing_screen || expandedStudent.is_camera_streaming
                            ? "text-emerald-500"
                            : "text-muted-foreground"
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
