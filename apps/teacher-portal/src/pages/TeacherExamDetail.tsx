import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { examsApi, ExamSession, ExamQuestion, ExamSubmission } from "@/api/exams";
import { alertsApi, Alert } from "@/api/alerts";
import { devicesApi, Device } from "@/api/devices";
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  Square,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Monitor,
  CheckCircle,
  XCircle,
  Loader2,
  Copy,
  Check,
  Plus,
  Trash2,
  Edit,
  Eye,
  HelpCircle,
  Users,
  Radio,
  Database,
  Download,
  Upload,
  FileSpreadsheet,
  FileText,
  ListChecks,
  ToggleLeft,
  MessageSquare,
  Lock,
  Volume2,
  ShieldAlert,
  UserCheck,
  Bell
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useRealtimeSocket } from "@/hooks/useRealtimeSocket";
import { useWebRTCStream } from "@/hooks/useWebRTCStream";
import { TeacherScreenViewerModal } from "@/components/webrtc/TeacherScreenViewerModal";

export const TeacherExamDetail: React.FC = () => {
  const { id, examId } = useParams<{ id?: string; examId?: string }>();
  const effectiveExamId = examId || id;
  const [exam, setExam] = useState<ExamSession | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [submissions, setSubmissions] = useState<ExamSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();

  // Question Form State
  const [qDialogOpen, setQDialogOpen] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [qType, setQType] = useState<"mcq" | "multiple_select" | "true_false" | "short_answer">("mcq");
  const [qText, setQText] = useState("");
  const [qOptions, setQOptions] = useState<string[]>(["", "", "", ""]);
  const [qCorrectIdx, setQCorrectIdx] = useState<number>(0);
  const [qCorrectOptions, setQCorrectOptions] = useState<number[]>([0]);
  const [qTrueFalseAns, setQTrueFalseAns] = useState<boolean>(true);
  const [qShortAnswerKey, setQShortAnswerKey] = useState<string>("");
  const [qExplanation, setQExplanation] = useState<string>("");
  const [qMarks, setQMarks] = useState<number>(1);
  const [savingQuestion, setSavingQuestion] = useState(false);

  // JSON Import & Export State
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importJsonText, setImportJsonText] = useState("");
  const [importPreviewData, setImportPreviewData] = useState<any | null>(null);
  const [validatingImport, setValidatingImport] = useState(false);
  const [importing, setImporting] = useState(false);

  // Submissions Review State
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [selectedReview, setSelectedReview] = useState<any | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [gradingScores, setGradingScores] = useState<Record<string, number>>({});
  const [gradingFeedbacks, setGradingFeedbacks] = useState<Record<string, string>>({});
  const [savingGradeFor, setSavingGradeFor] = useState<string | null>(null);

  // Preview State
  const [previewOpen, setPreviewOpen] = useState(false);

  // Re-Admission & Lockout Tracking (Feature: 3 Tab Switch Lockout & Teacher Approval)
  interface LockedStudent {
    student_id: string;
    student_name: string;
    student_email?: string;
    tab_switch_number: number;
    reason?: string;
    requested_unlock: boolean;
    locked_at: string;
  }
  const [lockedStudents, setLockedStudents] = useState<LockedStudent[]>([]);
  const [unlockingStudentId, setUnlockingStudentId] = useState<string | null>(null);

  // Native Web Audio Synthesizer: Crisp Proctored Notification Beep (Zero audio asset dependencies)
  const playAlertBeep = (critical = false) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === "suspended") {
        ctx.resume();
      }
      const now = ctx.currentTime;

      // Pulse 1
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.type = critical ? "sawtooth" : "sine";
      osc1.frequency.setValueAtTime(critical ? 880 : 587.33, now); // A5 or D5
      gain1.gain.setValueAtTime(0.3, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc1.start(now);
      osc1.stop(now + 0.2);

      // Pulse 2 (higher tone after 120ms gap)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.type = critical ? "sawtooth" : "sine";
      osc2.frequency.setValueAtTime(critical ? 1046.5 : 783.99, now + 0.12); // C6 or G5
      gain2.gain.setValueAtTime(0.001, now);
      gain2.gain.setValueAtTime(0.3, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.35);
    } catch (err) {
      console.warn("Could not play notification audio beep:", err);
    }
  };

  // WebRTC Live Screen Viewer State & Real-time Alerts
  const { isConnected, lastMessage, send } = useRealtimeSocket({
    channel: "teacher",
    onMessage: (msg) => {
      if (msg.type === "integrity_alert") {
        playAlertBeep(msg.alert?.severity === "critical" || msg.alert?.severity === "high");
        toast.warning(`Integrity Alert: ${msg.alert?.description || "Suspicious student behavior detected"}`);
        loadExamDetails();
      } else if (msg.type === "tab_switch_alert") {
        playAlertBeep(msg.is_locked || (msg.tab_switch_number && msg.tab_switch_number >= 2));
        if (msg.is_locked) {
          toast.error(`Exam Terminated: Student ${msg.student_name || msg.student_id} reached 3/3 tab switches!`);
          setLockedStudents((prev) => {
            if (prev.some((s) => s.student_id === msg.student_id)) return prev;
            return [
              ...prev,
              {
                student_id: msg.student_id,
                student_name: msg.student_name || "Student",
                student_email: msg.student_email,
                tab_switch_number: msg.tab_switch_number || 3,
                reason: "3 Tab Switches Exceeded",
                requested_unlock: false,
                locked_at: msg.timestamp || new Date().toISOString(),
              },
            ];
          });
        } else {
          toast.info(`Tab Switch Alert: ${msg.student_name || "Student"} switched tabs (${msg.tab_switch_number}/3)`);
        }
        loadExamDetails();
      } else if (msg.type === "student_locked") {
        playAlertBeep(true);
        toast.error(`Lockout: Student ${msg.student_name || msg.student_id} exam locked (3 Tab Switches).`);
        setLockedStudents((prev) => {
          if (prev.some((s) => s.student_id === msg.student_id)) return prev;
          return [
            ...prev,
            {
              student_id: msg.student_id,
              student_name: msg.student_name || "Student",
              student_email: msg.student_email,
              tab_switch_number: msg.tab_switch_number || 3,
              reason: "3 Tab Switches Exceeded",
              requested_unlock: false,
              locked_at: msg.timestamp || new Date().toISOString(),
            },
          ];
        });
        loadExamDetails();
      } else if (msg.type === "student_unlock_requested" || msg.type === "request_exam_unlock") {
        playAlertBeep(true);
        toast.warning(
          `Re-Admission Request: ${msg.student_name || "Student"} is asking permission to resume exam!`,
          { duration: 10000 }
        );
        setLockedStudents((prev) => {
          const existing = prev.find((s) => s.student_id === msg.student_id);
          if (existing) {
            return prev.map((s) => (s.student_id === msg.student_id ? { ...s, requested_unlock: true } : s));
          }
          return [
            ...prev,
            {
              student_id: msg.student_id,
              student_name: msg.student_name || "Student",
              student_email: msg.student_email,
              tab_switch_number: msg.tab_switch_number || 3,
              reason: msg.reason || "3 Tab Switches Exceeded",
              requested_unlock: true,
              locked_at: msg.requested_at || new Date().toISOString(),
            },
          ];
        });
      } else if (msg.type === "student_unlocked_confirmed") {
        setLockedStudents((prev) => prev.filter((s) => s.student_id !== msg.student_id));
      }
    },
  });

  const handleUnlockStudent = async (studentId: string) => {
    if (!effectiveExamId || unlockingStudentId) return;
    setUnlockingStudentId(studentId);
    try {
      await examsApi.unlockStudent(effectiveExamId, studentId);
      send({
        type: "unlock_student",
        exam_id: effectiveExamId,
        student_id: studentId,
      });
      setLockedStudents((prev) => prev.filter((s) => s.student_id !== studentId));
      toast.success("Permission granted! Student examination session unlocked.");
      loadExamDetails();
    } catch (err: any) {
      toast.error(err?.message || "Failed to unlock student session.");
    } finally {
      setUnlockingStudentId(null);
    }
  };

  const {
    isViewing,
    remoteStream,
    activePeerId,
    requestScreenShare,
    stopScreenShare,
  } = useWebRTCStream({
    role: "teacher",
    sendMessage: send,
    lastMessage,
  });

  const loadExamDetails = async () => {
    if (!effectiveExamId) return;
    try {
      const [exmData, altData, devData, qData, subData] = await Promise.all([
        examsApi.get(effectiveExamId),
        alertsApi.list(effectiveExamId),
        devicesApi.list(),
        examsApi.getQuestions(effectiveExamId).catch(() => []),
        examsApi.getSubmissions(effectiveExamId).catch(() => []),
      ]);
      setExam(exmData);
      setAlerts(altData);
      setDevices(devData);
      setQuestions(qData);
      setSubmissions(subData);

      // Populate locked students from unacknowledged alerts on refresh
      if (altData && altData.length > 0) {
        try {
          const foundLocked: LockedStudent[] = [];
          for (const a of altData) {
            const evSummary = typeof a.evidence_summary === "string"
              ? a.evidence_summary
              : JSON.stringify(a.evidence_summary || {});
            const evObj = typeof a.evidence_summary === "object" && a.evidence_summary !== null
              ? a.evidence_summary
              : {};
            const evDetails = (evObj as any).details || (a as any).details || {};

            const isLocked =
              a.severity === "critical" ||
              evSummary.includes("3/3") ||
              evSummary.includes("locked") ||
              evSummary.includes("limit_exceeded") ||
              Boolean(evDetails?.is_locked) ||
              Number(evDetails?.tab_switch_number) >= 3;

            if (a.alert_type === "tab_switch" && !a.is_acknowledged && a.student_id && isLocked) {
              if (!foundLocked.some((s) => s.student_id === a.student_id)) {
                foundLocked.push({
                  student_id: a.student_id,
                  student_name: evDetails?.student_name || (a as any).details?.student_name || "Student",
                  student_email: evDetails?.student_email || (a as any).details?.student_email,
                  tab_switch_number: Number(evDetails?.tab_switch_number || (a as any).details?.tab_switch_number || 3),
                  reason: "3 Tab Switches Exceeded",
                  requested_unlock: false,
                  locked_at: a.created_at,
                });
              }
            }
          }
          if (foundLocked.length > 0) {
            setLockedStudents((prev) => {
              const merged = [...prev];
              for (const f of foundLocked) {
                const idx = merged.findIndex((m) => m.student_id === f.student_id);
                if (idx === -1) {
                  merged.push(f);
                }
              }
              return merged;
            });
          }
        } catch (parseErr) {
          console.warn("Could not parse locked student alerts:", parseErr);
        }
      }
    } catch (err: any) {
      console.error("Failed to load examination details:", err);
      toast.error("Failed to load examination details");
      navigate("/teacher/exams");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExamDetails();
    const interval = setInterval(loadExamDetails, 6000);
    return () => clearInterval(interval);
  }, [effectiveExamId]);

  const handleOpenAddQuestion = () => {
    setEditingQuestionId(null);
    setQType("mcq");
    setQText("");
    setQOptions(["", "", "", ""]);
    setQCorrectIdx(0);
    setQCorrectOptions([0]);
    setQTrueFalseAns(true);
    setQShortAnswerKey("");
    setQExplanation("");
    setQMarks(1);
    setQDialogOpen(true);
  };

  const handleOpenEditQuestion = (q: ExamQuestion) => {
    setEditingQuestionId(q.id);
    const type = (q.question_type as any) || "mcq";
    setQType(type);
    setQText(q.question_text);
    setQMarks(q.marks || 1);
    setQExplanation(q.explanation || "");

    if (type === "mcq") {
      setQOptions(q.options && q.options.length ? [...q.options] : ["", "", "", ""]);
      setQCorrectIdx(q.correct_option_index ?? 0);
    } else if (type === "multiple_select") {
      setQOptions(q.options && q.options.length ? [...q.options] : ["", "", "", ""]);
      const indices = Array.isArray(q.correct_answers)
        ? q.correct_answers.map((v) => Number(v)).filter((n) => !isNaN(n))
        : [0];
      setQCorrectOptions(indices.length ? indices : [0]);
    } else if (type === "true_false") {
      setQOptions(["True", "False"]);
      const isTrue = Array.isArray(q.correct_answers)
        ? String(q.correct_answers[0]).toLowerCase() === "true"
        : q.correct_option_index === 0;
      setQTrueFalseAns(isTrue);
    } else if (type === "short_answer") {
      setQOptions([]);
      const key = Array.isArray(q.correct_answers) && q.correct_answers.length
        ? String(q.correct_answers[0])
        : q.explanation || "";
      setQShortAnswerKey(key);
    }
    setQDialogOpen(true);
  };

  const handleOptionChange = (idx: number, val: string) => {
    const updated = [...qOptions];
    updated[idx] = val;
    setQOptions(updated);
  };

  const handleAddOptionField = () => {
    if (qOptions.length >= 6) {
      toast.warning("Maximum 6 options supported");
      return;
    }
    setQOptions([...qOptions, ""]);
  };

  const handleRemoveOptionField = (idx: number) => {
    if (qOptions.length <= 2) {
      toast.warning("Minimum 2 options required");
      return;
    }
    const updated = qOptions.filter((_, i) => i !== idx);
    setQOptions(updated);
    if (qCorrectIdx >= updated.length) setQCorrectIdx(0);
    setQCorrectOptions(qCorrectOptions.filter((i) => i !== idx).map((i) => (i > idx ? i - 1 : i)));
  };

  const toggleMultiSelectOption = (idx: number) => {
    if (qCorrectOptions.includes(idx)) {
      if (qCorrectOptions.length === 1) {
        toast.warning("Select at least one correct option");
        return;
      }
      setQCorrectOptions(qCorrectOptions.filter((i) => i !== idx));
    } else {
      setQCorrectOptions([...qCorrectOptions, idx]);
    }
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveExamId) return;
    if (!qText.trim()) {
      toast.error("Please enter question text");
      return;
    }

    let payload: any = {
      question_text: qText.trim(),
      question_type: qType,
      marks: qMarks,
      explanation: qExplanation.trim() || null,
      order_num: editingQuestionId ? undefined : questions.length + 1,
    };

    if (qType === "mcq") {
      const trimmedOptions = qOptions.map((o) => o.trim()).filter(Boolean);
      if (trimmedOptions.length < 2) {
        toast.error("Please provide at least 2 options for Multiple-Choice Question");
        return;
      }
      if (qCorrectIdx < 0 || qCorrectIdx >= trimmedOptions.length) {
        toast.error("Please select a valid correct answer");
        return;
      }
      payload.options = trimmedOptions;
      payload.correct_option_index = qCorrectIdx;
      payload.correct_answers = [trimmedOptions[qCorrectIdx]];
    } else if (qType === "multiple_select") {
      const trimmedOptions = qOptions.map((o) => o.trim()).filter(Boolean);
      if (trimmedOptions.length < 2) {
        toast.error("Please provide at least 2 options for Multiple-Select Question");
        return;
      }
      if (qCorrectOptions.length === 0) {
        toast.error("Please select at least one correct option");
        return;
      }
      payload.options = trimmedOptions;
      payload.correct_answers = qCorrectOptions;
      payload.correct_option_index = null;
    } else if (qType === "true_false") {
      payload.options = ["True", "False"];
      payload.correct_option_index = qTrueFalseAns ? 0 : 1;
      payload.correct_answers = [qTrueFalseAns ? "True" : "False"];
    } else if (qType === "short_answer") {
      if (!qShortAnswerKey.trim()) {
        toast.error("Please provide expected answer key for short-answer question");
        return;
      }
      payload.options = [];
      payload.correct_option_index = null;
      payload.correct_answers = [qShortAnswerKey.trim()];
    }

    setSavingQuestion(true);
    try {
      if (editingQuestionId) {
        await examsApi.updateQuestion(effectiveExamId, editingQuestionId, payload);
        toast.success("Question updated successfully");
      } else {
        await examsApi.createQuestion(effectiveExamId, payload);
        toast.success("Question added successfully");
      }
      setQDialogOpen(false);
      loadExamDetails();
    } catch (err: any) {
      toast.error(err.message || "Failed to save question");
    } finally {
      setSavingQuestion(false);
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (!effectiveExamId) return;
    if (!window.confirm("Are you sure you want to delete this question?")) return;
    try {
      await examsApi.deleteQuestion(effectiveExamId, questionId);
      toast.success("Question removed");
      loadExamDetails();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete question");
    }
  };

  // JSON Import & Export Handlers
  const handleDownloadTemplate = async () => {
    try {
      const template = await examsApi.getQuestionsTemplate();
      const blob = new Blob([JSON.stringify(template, null, 2)], { type: "application/json" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "exam_questions_template.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success("JSON template downloaded!");
    } catch (err: any) {
      toast.error(err.message || "Failed to download template");
    }
  };

  const handleExportJson = async () => {
    if (!effectiveExamId) return;
    try {
      const data = await examsApi.exportQuestionsJson(effectiveExamId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `exam_${exam?.exam_code || effectiveExamId}_questions.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success("Exam questions dataset exported!");
    } catch (err: any) {
      toast.error(err.message || "Failed to export JSON dataset");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        setImportJsonText(text);
        setImportPreviewData(null);
      } catch {
        toast.error("Failed to read file");
      }
    };
    reader.readAsText(file);
  };

  const handleValidateImport = async () => {
    if (!effectiveExamId || !importJsonText.trim()) {
      toast.error("Please paste or upload JSON content first");
      return;
    }
    let parsed: any;
    try {
      parsed = JSON.parse(importJsonText.trim());
    } catch {
      toast.error("Invalid JSON syntax: Please check brackets, quotes and formatting.");
      return;
    }

    setValidatingImport(true);
    try {
      const res = await examsApi.importQuestionsJson(effectiveExamId, parsed, true);
      setImportPreviewData(res);
      toast.success(`Validation passed: ${res.total_valid} question(s) ready to import.`);
    } catch (err: any) {
      toast.error(err.message || "Validation failed");
    } finally {
      setValidatingImport(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!effectiveExamId || !importJsonText.trim()) return;
    let parsed: any;
    try {
      parsed = JSON.parse(importJsonText.trim());
    } catch {
      toast.error("Invalid JSON syntax");
      return;
    }

    setImporting(true);
    try {
      const res = await examsApi.importQuestionsJson(effectiveExamId, parsed, false);
      toast.success(`Successfully imported ${res.imported_count} question(s)!`);
      setImportDialogOpen(false);
      setImportJsonText("");
      setImportPreviewData(null);
      loadExamDetails();
    } catch (err: any) {
      toast.error(err.message || "Import execution failed");
    } finally {
      setImporting(false);
    }
  };

  // Submissions Review Handler
  const handleOpenSubmissionReview = async (submissionId: string) => {
    if (!effectiveExamId) return;
    setReviewLoading(true);
    setReviewDialogOpen(true);
    try {
      const data = await examsApi.getSubmissionReview(effectiveExamId, submissionId);
      setSelectedReview(data);
      const scoresMap: Record<string, number> = {};
      const fbMap: Record<string, string> = {};
      (data.questions || []).forEach((q: any) => {
        scoresMap[q.question_id] = q.manual_score !== null && q.manual_score !== undefined ? q.manual_score : (q.marks_awarded || 0);
        fbMap[q.question_id] = q.feedback || "";
      });
      setGradingScores(scoresMap);
      setGradingFeedbacks(fbMap);
    } catch (err: any) {
      toast.error(err.message || "Failed to load candidate submission details");
      setReviewDialogOpen(false);
    } finally {
      setReviewLoading(false);
    }
  };

  const handlePublishResults = async () => {
    if (!effectiveExamId) return;
    if (!window.confirm("Publish results for this examination? Enrolled students will be able to view their final scores, pass/fail status, answer keys, and download their certified PDF transcripts.")) return;
    setIsPublishing(true);
    try {
      await examsApi.publishResults(effectiveExamId);
      toast.success("Examination results published to students!");
      loadExamDetails();
    } catch (err: any) {
      toast.error(err.message || "Failed to publish results");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDownloadPdf = async (submissionId: string, studentName?: string) => {
    if (!effectiveExamId) return;
    try {
      const cleanName = (studentName || "Student").replace(/[^a-zA-Z0-9_-]/g, "_");
      await examsApi.downloadPdf(effectiveExamId, submissionId, `SATARK_Result_${cleanName}_${exam?.exam_code || "Exam"}.pdf`);
      toast.success("Certified Result PDF downloaded!");
    } catch (err: any) {
      toast.error(err.message || "Failed to download PDF transcript");
    }
  };

  const handleSaveGrade = async (questionId: string) => {
    if (!effectiveExamId || !selectedReview) return;
    setSavingGradeFor(questionId);
    const score = gradingScores[questionId] ?? 0;
    const fb = gradingFeedbacks[questionId] || "";
    try {
      const updated = await examsApi.gradeAnswer(effectiveExamId, selectedReview.submission_id, questionId, score, fb);
      setSelectedReview(updated);
      toast.success("Question score and feedback saved!");
      loadExamDetails();
    } catch (err: any) {
      toast.error(err.message || "Failed to save question evaluation");
    } finally {
      setSavingGradeFor(null);
    }
  };

  const handleExportCsv = async () => {
    if (!effectiveExamId) return;
    try {
      const token = localStorage.getItem("satark_token");
      const res = await fetch(`/api/v1/reports/exams/${effectiveExamId}/export-csv`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to generate CSV report");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `exam_${exam?.exam_code || effectiveExamId}_submissions.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success("Submissions CSV report downloaded!");
    } catch (err: any) {
      toast.error(err.message || "Failed to export CSV report");
    }
  };

  const handleCopyPin = () => {
    if (exam) {
      navigator.clipboard.writeText(exam.exam_code);
      setCopied(true);
      toast.success("Exam PIN copied!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleAcknowledge = async (alertId: string) => {
    try {
      await alertsApi.acknowledge(alertId, "Acknowledged and resolved by proctor");
      toast.success("Alert acknowledged");
      loadExamDetails();
    } catch {
      toast.error("Failed to acknowledge alert");
    }
  };

  const handleStart = async () => {
    if (!effectiveExamId) return;
    try {
      await examsApi.start(effectiveExamId);
      toast.success("Exam session activated! Candidates can now join and view questions.");
      loadExamDetails();
    } catch (err: any) {
      toast.error(err.message || "Failed to start exam");
    }
  };

  const handlePause = async () => {
    if (!effectiveExamId) return;
    try {
      await examsApi.pause(effectiveExamId);
      toast.info("Exam session paused");
      loadExamDetails();
    } catch (err: any) {
      toast.error(err.message || "Failed to pause exam");
    }
  };

  const handleResume = async () => {
    if (!effectiveExamId) return;
    try {
      await examsApi.resume(effectiveExamId);
      toast.success("Exam session resumed");
      loadExamDetails();
    } catch (err: any) {
      toast.error(err.message || "Failed to resume exam");
    }
  };

  const handleEnd = async () => {
    if (!effectiveExamId) return;
    if (!window.confirm("Are you sure you want to finalize and end this examination? This will calculate grades and lock candidate submissions.")) return;
    try {
      await examsApi.end(effectiveExamId);
      toast.success("Examination finalized and sealed");
      loadExamDetails();
    } catch (err: any) {
      toast.error(err.message || "Failed to end exam");
    }
  };

  const handleGrantTime = async (minutes: number) => {
    if (!effectiveExamId) return;
    try {
      const res = await examsApi.grantTime(effectiveExamId, minutes);
      toast.success(`Granted +${minutes} minutes! New duration: ${res.duration_minutes}m`);
      loadExamDetails();
    } catch (err: any) {
      toast.error(err.message || "Failed to grant extra time");
    }
  };

  if (loading || !exam) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-medium">Connecting to exam workspace...</p>
      </div>
    );
  }

  const isEditable = exam.status === "draft" || exam.status === "scheduled";

  const getQuestionTypeBadge = (type?: string) => {
    switch (type) {
      case "multiple_select":
        return <Badge variant="secondary" className="text-[10px] bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30">Multiple-Select</Badge>;
      case "true_false":
        return <Badge variant="secondary" className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30">True/False</Badge>;
      case "short_answer":
        return <Badge variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30">Short Answer</Badge>;
      case "mcq":
      default:
        return <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">MCQ Single</Badge>;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Back button */}
      <Button variant="outline" size="sm" onClick={() => navigate("/teacher/exams")} className="rounded-xl border-stone-200/80 text-xs">
        <ArrowLeft className="w-4 h-4 mr-1 text-[#D97706]" /> All Examinations
      </Button>

      {/* Hero Header Card */}
      <div className="rounded-3xl bg-white border border-stone-200/80 p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 border-l-4 border-l-[#D97706] shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge
              variant={exam.status === "active" ? "default" : exam.status === "paused" ? "secondary" : "outline"}
              className={`text-xs uppercase font-bold rounded-lg ${
                exam.status === "active" ? "bg-emerald-600 text-white" : ""
              }`}
            >
              {exam.status}
            </Badge>
            <span className="text-xs text-stone-500">• Duration: {exam.duration_minutes} mins</span>
            <span className="text-xs text-stone-500">• Questions: {questions.length}</span>
            <span className="text-xs text-stone-500">• Total Marks: {questions.reduce((sum, q) => sum + (q.marks || 1), 0)}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">{exam.title}</h1>
          <p className="text-xs text-stone-500 mt-1 max-w-xl">
            {exam.description || "Live proctored candidate workstation supervision"}
          </p>
        </div>

        {/* PIN Box & Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="p-3 rounded-2xl bg-[#FFF9F2] border border-amber-200 flex items-center justify-between gap-4">
            <div>
              <span className="text-[10px] uppercase font-bold text-amber-800/80 block">Student Exam PIN</span>
              <span className="font-mono text-xl font-bold text-[#D97706] tracking-widest">{exam.exam_code}</span>
            </div>
            <Button size="sm" variant="ghost" onClick={handleCopyPin} className="h-8 w-8 p-0 hover:bg-amber-100 text-amber-900">
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-stone-400" />}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Link to={`/teacher/exams/${exam.id}/live`}>
              <Button className="font-bold gap-1.5 bg-[#D97706] hover:bg-[#B45309] text-white shadow-xs rounded-xl">
                <Radio className="w-4 h-4 text-rose-300 animate-pulse" /> Live Monitoring
              </Button>
            </Link>

            {(exam.status === "draft" || exam.status === "scheduled") && (
              <Button onClick={handleStart} className="font-bold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl">
                <Play className="w-4 h-4" /> Start Exam
              </Button>
            )}

            {exam.status === "active" && (
              <>
                <Button variant="outline" onClick={() => handleGrantTime(15)} className="font-semibold gap-1.5 border-amber-300 text-[#D97706] hover:bg-amber-50 rounded-xl">
                  <Clock className="w-4 h-4" /> +15 min
                </Button>
                <Button variant="secondary" onClick={handlePause} className="font-semibold gap-1.5 rounded-xl">
                  <Pause className="w-4 h-4" /> Pause
                </Button>
                <Button variant="destructive" onClick={handleEnd} className="font-semibold gap-1.5 rounded-xl">
                  <Square className="w-4 h-4" /> End Exam
                </Button>
              </>
            )}

            {exam.status === "paused" && (
              <>
                <Button variant="outline" onClick={() => handleGrantTime(15)} className="font-semibold gap-1.5 border-amber-300 text-[#D97706] hover:bg-amber-50 rounded-xl">
                  <Clock className="w-4 h-4" /> +15 min
                </Button>
                <Button onClick={handleResume} className="font-bold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl">
                  <RotateCcw className="w-4 h-4" /> Resume
                </Button>
                <Button variant="destructive" onClick={handleEnd} className="font-semibold gap-1.5 rounded-xl">
                  <Square className="w-4 h-4" /> End Exam
                </Button>
              </>
            )}

            {exam.status === "ended" && (
              <Badge variant="outline" className="px-3 py-2 text-xs font-bold bg-stone-100 text-stone-600 border-stone-200 rounded-xl">
                Session Finalized
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Feature: Student Display Monitoring — Lockout & Re-Admission Control Queue */}
      {lockedStudents.length > 0 && (
        <Card className="rounded-2xl border-2 border-destructive/40 bg-destructive/5 shadow-md overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="bg-destructive/10 px-4 py-3 border-b border-destructive/20 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-destructive text-white flex items-center justify-center">
                <Lock className="w-4 h-4 animate-pulse" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-destructive uppercase tracking-wider flex items-center gap-1.5">
                  Student Display Monitoring — Lockout & Re-Admission Queue ({lockedStudents.length})
                  <span className="w-2 h-2 rounded-full bg-destructive animate-ping" />
                </h3>
                <p className="text-[11px] text-destructive/85">
                  Candidate exams were stopped after exceeding 3 tab switches. Review and grant permission to restore exam access.
                </p>
              </div>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={() => playAlertBeep(true)}
              className="h-7 text-[11px] gap-1 font-semibold border-destructive/30 text-destructive hover:bg-destructive/10"
            >
              <Volume2 className="w-3.5 h-3.5" /> Test Audio Beep
            </Button>
          </div>

          <div className="p-4 space-y-2.5">
            {lockedStudents.map((ls) => (
              <div
                key={ls.student_id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-white border border-destructive/20 shadow-xs"
              >
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                    ls.requested_unlock ? "bg-amber-500/15 text-amber-600 animate-pulse" : "bg-destructive/15 text-destructive"
                  }`}>
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-foreground">{ls.student_name}</span>
                      {ls.student_email && (
                        <span className="text-[11px] text-muted-foreground font-mono">({ls.student_email})</span>
                      )}
                      <Badge variant="destructive" className="text-[10px] font-mono h-5">
                        {ls.tab_switch_number}/3 Tab Switches
                      </Badge>
                      {ls.requested_unlock ? (
                        <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-[10px] h-5 animate-pulse">
                          Re-Admission Requested
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30 h-5">
                          Exam Stopped & Locked
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {ls.requested_unlock
                        ? "Candidate asked permission to re-take/continue their exam from their locked dashboard."
                        : "Candidate's exam session is terminated and locked due to 3 tab switch violations."}
                      {" • "}<span className="font-mono">{new Date(ls.locked_at).toLocaleTimeString()}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    onClick={() => handleUnlockStudent(ls.student_id)}
                    disabled={unlockingStudentId === ls.student_id}
                    className="h-8 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-sm"
                  >
                    {unlockingStudentId === ls.student_id ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Unlocking...
                      </>
                    ) : (
                      <>
                        <UserCheck className="w-3.5 h-3.5" /> Grant Permission & Unlock
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Tabs View */}
      <Tabs defaultValue="questions" className="space-y-4">
        <TabsList className="bg-white p-1 rounded-2xl flex flex-wrap h-auto gap-1 border border-stone-200/80 shadow-xs">
          <TabsTrigger value="questions" className="font-semibold text-xs flex items-center gap-1.5 rounded-xl data-[state=active]:bg-[#FFF2E5] data-[state=active]:text-[#D97706]">
            <HelpCircle className="w-3.5 h-3.5" />
            Questions ({questions.length})
          </TabsTrigger>
          <TabsTrigger value="submissions" className="font-semibold text-xs flex items-center gap-1.5 rounded-xl data-[state=active]:bg-[#FFF2E5] data-[state=active]:text-[#D97706]">
            <Users className="w-3.5 h-3.5" />
            Submissions ({submissions.length})
          </TabsTrigger>
          <TabsTrigger value="alerts" className="font-semibold text-xs flex items-center gap-1.5 rounded-xl data-[state=active]:bg-[#FFF2E5] data-[state=active]:text-[#D97706]">
            <AlertTriangle className="w-3.5 h-3.5" />
            Integrity Alerts ({alerts.filter((a) => !a.is_acknowledged).length})
          </TabsTrigger>
          <TabsTrigger value="devices" className="font-semibold text-xs flex items-center gap-1.5 rounded-xl data-[state=active]:bg-[#FFF2E5] data-[state=active]:text-[#D97706]">
            <Monitor className="w-3.5 h-3.5" />
            Registered Devices ({devices.length})
          </TabsTrigger>
          <TabsTrigger value="policy" className="font-semibold text-xs flex items-center gap-1.5 rounded-xl data-[state=active]:bg-[#FFF2E5] data-[state=active]:text-[#D97706]">
            <ShieldCheck className="w-3.5 h-3.5" />
            Rules
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Questions Management */}
        <TabsContent value="questions" className="space-y-4">
          <Card className="rounded-2xl bg-white border border-stone-200/80 shadow-xs">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-border/40 gap-3">
              <div>
                <CardTitle className="text-base font-bold text-foreground">
                  Exam Questions ({questions.length})
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Total Exam Marks: {questions.reduce((sum, q) => sum + (q.marks || 1), 0)} • {isEditable ? "Editing enabled (Draft/Scheduled)" : "Locked (Exam in progress or ended)"}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {questions.length > 0 && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPreviewOpen(true)}
                      className="text-xs font-semibold flex items-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5" /> Preview Exam
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleExportJson}
                      className="text-xs font-semibold flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" /> Export JSON
                    </Button>
                  </>
                )}

                {isEditable && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setImportJsonText("");
                        setImportPreviewData(null);
                        setImportDialogOpen(true);
                      }}
                      className="text-xs font-semibold flex items-center gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                    >
                      <Upload className="w-3.5 h-3.5" /> Import JSON
                    </Button>
                    <Link to="/teacher/question-bank">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs font-semibold flex items-center gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                      >
                        <Database className="w-3.5 h-3.5" /> Question Bank
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      onClick={handleOpenAddQuestion}
                      className="text-xs font-semibold flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Question
                    </Button>
                  </>
                )}
              </div>
            </CardHeader>

            <CardContent className="pt-4 space-y-4">
              {questions.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm flex flex-col items-center gap-3">
                  <HelpCircle className="w-8 h-8 text-primary/50" />
                  <p>No questions added to this examination yet.</p>
                  {isEditable && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleOpenAddQuestion} className="font-semibold text-xs">
                        <Plus className="w-3.5 h-3.5 mr-1" /> Add Your First Question
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setImportJsonText("");
                          setImportPreviewData(null);
                          setImportDialogOpen(true);
                        }}
                        className="font-semibold text-xs"
                      >
                        <Upload className="w-3.5 h-3.5 mr-1" /> Import JSON Dataset
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                questions.map((q, idx) => {
                  const qtype = q.question_type || "mcq";
                  return (
                    <div
                      key={q.id}
                      className="p-4 rounded-xl border border-border/50 bg-card/60 space-y-3 transition-all hover:border-primary/40"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px] font-mono">
                              Q{idx + 1}
                            </Badge>
                            {getQuestionTypeBadge(qtype)}
                            <Badge variant="secondary" className="text-[10px] font-semibold">
                              {q.marks || 1} {(q.marks || 1) === 1 ? "Mark" : "Marks"}
                            </Badge>
                          </div>
                          <h4 className="font-semibold text-sm text-foreground pt-1">{q.question_text}</h4>
                        </div>

                        {isEditable && (
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleOpenEditQuestion(q)}
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteQuestion(q.id)}
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* Options / Answer Display based on Question Type */}
                      {qtype === "short_answer" ? (
                        <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 text-xs space-y-1">
                          <div className="font-semibold text-amber-700 dark:text-amber-400">
                            Expected Key / Solution:
                          </div>
                          <div className="font-mono text-foreground">
                            {Array.isArray(q.correct_answers) && q.correct_answers.length > 0
                              ? String(q.correct_answers[0])
                              : q.explanation || "Open text response (manual or keyword grading)"}
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          {(q.options || []).map((opt, optIdx) => {
                            let isCorrect = false;
                            if (qtype === "mcq") {
                              isCorrect = q.correct_option_index === optIdx;
                            } else if (qtype === "multiple_select") {
                              isCorrect = Array.isArray(q.correct_answers)
                                ? q.correct_answers.includes(optIdx) || q.correct_answers.includes(String(optIdx))
                                : false;
                            } else if (qtype === "true_false") {
                              isCorrect = q.correct_option_index === optIdx || (Array.isArray(q.correct_answers) && q.correct_answers[0] === opt);
                            }

                            return (
                              <div
                                key={optIdx}
                                className={`p-2.5 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                                  isCorrect
                                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 font-semibold dark:text-emerald-400"
                                    : "border-border/40 bg-muted/30 text-muted-foreground"
                                }`}
                              >
                                <span>
                                  <span className="font-mono font-bold mr-1.5">{String.fromCharCode(65 + optIdx)}.</span>
                                  {opt}
                                </span>
                                {isCorrect && (
                                  <Badge variant="outline" className="text-[9px] uppercase border-emerald-500/40 text-emerald-500 shrink-0">
                                    Correct Answer
                                  </Badge>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {q.explanation && (
                        <p className="text-[11px] text-muted-foreground bg-muted/20 p-2 rounded border border-border/30">
                          <span className="font-semibold">Explanation:</span> {q.explanation}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Candidate Submissions */}
        <TabsContent value="submissions" className="space-y-4">
          <Card className="rounded-2xl bg-white border border-stone-200/80 shadow-xs">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-border/40 gap-3">
              <div>
                <CardTitle className="text-base font-bold text-foreground">
                  Candidate Submissions ({submissions.length})
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Automated grading breakdown, percentage calculation, and exportable audit trail.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {exam?.is_results_published ? (
                  <Badge className="bg-emerald-600 text-white text-xs gap-1 py-1 px-2.5">
                    <CheckCircle className="w-3.5 h-3.5" /> Results Published
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    onClick={handlePublishResults}
                    disabled={isPublishing || submissions.length === 0}
                    className="text-xs font-bold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                  >
                    {isPublishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                    Publish Results
                  </Button>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExportCsv}
                  className="text-xs font-semibold gap-1.5"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" /> Export CSV Report
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {submissions.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
                  <Users className="w-8 h-8 text-primary/50" />
                  <span>No submissions received yet. Submissions will appear as candidates complete the exam.</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border/50 text-muted-foreground font-semibold">
                        <th className="pb-3 pl-2">Candidate</th>
                        <th className="pb-3">Status</th>
                        <th className="pb-3">Score</th>
                        <th className="pb-3">Percentage</th>
                        <th className="pb-3">Result</th>
                        <th className="pb-3">Submitted At</th>
                        <th className="pb-3 text-right pr-2">Proctor Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {submissions.map((s) => (
                        <tr key={s.id} className="hover:bg-muted/30">
                          <td className="py-3 pl-2 font-medium text-foreground">
                            {s.student_name || (s.student_id ? s.student_id.substring(0, 8) : "Student")}
                          </td>
                          <td className="py-3">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge variant="outline" className="text-[10px] capitalize">
                                {s.status}
                              </Badge>
                              {lockedStudents.some((ls) => ls.student_id === s.student_id) && (
                                <Badge variant="destructive" className="text-[10px] animate-pulse">
                                  Locked (3/3 Switches)
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="py-3 font-mono font-bold text-foreground">
                            {s.score !== null && s.score !== undefined ? `${s.score} / ${s.total_marks}` : "Pending Evaluation"}
                          </td>
                          <td className="py-3">
                            <span className="font-mono font-bold text-primary">
                              {s.percentage !== null && s.percentage !== undefined ? `${s.percentage}%` : "—"}
                            </span>
                          </td>
                          <td className="py-3">
                            {s.is_passed === true ? (
                              <Badge className="bg-emerald-600 text-white text-[10px] font-extrabold">PASS</Badge>
                            ) : s.is_passed === false ? (
                              <Badge variant="destructive" className="text-[10px] font-extrabold">FAIL</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] text-muted-foreground">Pending</Badge>
                            )}
                          </td>
                          <td className="py-3 text-muted-foreground">
                            {new Date(s.submitted_at).toLocaleTimeString()}
                          </td>
                          <td className="py-3 text-right pr-2 space-x-1.5">
                            {lockedStudents.some((ls) => ls.student_id === s.student_id) && (
                              <Button
                                size="sm"
                                onClick={() => handleUnlockStudent(s.student_id)}
                                disabled={unlockingStudentId === s.student_id}
                                className="h-7 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                              >
                                <UserCheck className="w-3 h-3" /> Unlock
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDownloadPdf(s.id, s.student_name)}
                              className="h-7 text-[11px] font-semibold gap-1 hover:bg-primary/10 hover:text-primary"
                              title="Download certified PDF transcript"
                            >
                              <Download className="w-3 h-3" /> PDF
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenSubmissionReview(s.id)}
                              className="h-7 text-[11px] font-semibold gap-1 hover:bg-primary/10 hover:text-primary"
                            >
                              <FileText className="w-3 h-3" /> Review
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => requestScreenShare(s.student_id, exam?.id)}
                              className="h-7 text-[11px] font-semibold gap-1 hover:bg-primary/10 hover:text-primary"
                            >
                              <Monitor className="w-3 h-3" /> Screen
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Alerts */}
        <TabsContent value="alerts" className="space-y-4">
          <Card className="rounded-2xl bg-white border border-stone-200/80 shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-border/40">
              <CardTitle className="text-base font-bold text-foreground">
                Explainable Anomaly Stream ({alerts.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              {alerts.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
                  <CheckCircle className="w-8 h-8 text-emerald-500" />
                  <span>No policy breaches or integrity flags recorded.</span>
                </div>
              ) : (
                alerts.map((alt) => (
                  <div
                    key={alt.id}
                    className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${
                      alt.is_acknowledged
                        ? "border-border/30 bg-card/40 opacity-70"
                        : "border-destructive/40 bg-destructive/5"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <AlertTriangle
                        className={`w-5 h-5 shrink-0 mt-0.5 ${
                          alt.alert_type === "tab_switch"
                            ? "text-amber-500"
                            : alt.severity === "critical"
                            ? "text-destructive"
                            : "text-amber-500"
                        }`}
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm text-foreground">{alt.description}</h4>
                          <Badge
                            variant={alt.is_acknowledged ? "outline" : "destructive"}
                            className="text-[10px] uppercase font-bold"
                          >
                            {alt.alert_type === "tab_switch" ? "Tab Switch" : alt.severity}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Source: <span className="font-mono">{alt.evidence_summary?.source || "agent"}</span> • Student ID: <span className="font-mono">{alt.student_id ? `${alt.student_id.substring(0, 8)}...` : "Student"}</span> • Time: {new Date(alt.created_at).toLocaleTimeString()}
                        </p>
                        {alt.proctor_notes && (
                          <p className="text-xs text-muted-foreground italic mt-1 bg-muted/40 p-1.5 rounded">
                            Reviewer note: "{alt.proctor_notes}"
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {alt.student_id && alt.alert_type === "tab_switch" && (
                        <Button
                          size="sm"
                          onClick={() => handleUnlockStudent(alt.student_id!)}
                          disabled={unlockingStudentId === alt.student_id}
                          className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                        >
                          <UserCheck className="w-3.5 h-3.5" /> Unlock
                        </Button>
                      )}
                      {alt.student_id && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => requestScreenShare(alt.student_id!, exam?.id)}
                          className="text-xs font-semibold gap-1 hover:bg-primary hover:text-primary-foreground"
                        >
                          <Monitor className="w-3.5 h-3.5" /> View Screen
                        </Button>
                      )}
                      {!alt.is_acknowledged && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAcknowledge(alt.id)}
                          className="text-xs font-semibold shrink-0"
                        >
                          Acknowledge Alert
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Devices */}
        <TabsContent value="devices" className="space-y-4">
          <Card className="rounded-2xl bg-white border border-stone-200/80 shadow-xs">
            <CardHeader className="pb-4 border-b border-border/40">
              <CardTitle className="text-base font-bold text-foreground">Active Workstation Grid</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {devices.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  No candidate computers registered yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {devices.map((d) => (
                    <div key={d.id} className="p-3.5 rounded-xl border border-border/40 bg-card/60 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Monitor className="w-4 h-4 text-primary" />
                          <span className="font-bold text-xs text-foreground truncate">{d.hostname || "Candidate PC"}</span>
                        </div>
                        <Badge
                          variant={d.status === "connected" ? "default" : "outline"}
                          className="text-[10px] capitalize font-bold"
                        >
                          {d.status}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground font-mono truncate">
                        UUID: {d.hardware_uuid}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        OS: {d.os_type} {d.os_version || ""} • Agent v{d.agent_version}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 5: Policy Rules */}
        <TabsContent value="policy" className="space-y-4">
          <Card className="rounded-2xl bg-white border border-stone-200/80 shadow-xs">
            <CardHeader className="pb-4 border-b border-border/40">
              <CardTitle className="text-base font-bold text-foreground">Configured Integrity Policies</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              <div className="p-3 rounded-lg border border-border/40 bg-card/40 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-foreground">Browser Tab-Switch & Visibility Oversight</h4>
                  <p className="text-[11px] text-muted-foreground">Flags when candidate hides or navigates away from the active examination tab</p>
                </div>
                <Badge variant="outline" className="text-emerald-500 border-emerald-500/40 text-[10px]">
                  Enforced
                </Badge>
              </div>

              <div className="p-3 rounded-lg border border-border/40 bg-card/40 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-foreground">Desktop Window Blur Detection</h4>
                  <p className="text-[11px] text-muted-foreground">Flags when focus leaves examination interface on candidate OS</p>
                </div>
                <Badge variant="outline" className="text-emerald-500 border-emerald-500/40 text-[10px]">
                  {exam.policy_config?.disallow_window_blur !== false ? "Enforced" : "Disabled"}
                </Badge>
              </div>

              <div className="p-3 rounded-lg border border-border/40 bg-card/40 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-foreground">Secondary Display Lockdown</h4>
                  <p className="text-[11px] text-muted-foreground">Detects external monitors or extended display connections via agent</p>
                </div>
                <Badge variant="outline" className="text-emerald-500 border-emerald-500/40 text-[10px]">
                  {exam.policy_config?.disallow_multi_display !== false ? "Enforced" : "Disabled"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add / Edit Question Dialog (Supports All 4 Types) */}
      <Dialog open={qDialogOpen} onOpenChange={setQDialogOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingQuestionId ? "Edit Examination Question" : "Add Examination Question"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Configure question prompt, answer format, marking scheme, and explanation.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveQuestion} className="space-y-4 pt-2">
            {/* Question Type Selection */}
            <div>
              <Label className="text-xs font-bold">Question Format / Type *</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
                {[
                  { id: "mcq", label: "MCQ (Single)", icon: CheckCircle },
                  { id: "multiple_select", label: "Multi-Select", icon: ListChecks },
                  { id: "true_false", label: "True / False", icon: ToggleLeft },
                  { id: "short_answer", label: "Short Answer", icon: MessageSquare },
                ].map((t) => {
                  const Icon = t.icon;
                  const isSel = qType === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setQType(t.id as any)}
                      className={`p-2.5 rounded-xl border text-left text-xs font-medium flex flex-col items-center gap-1.5 transition-all ${
                        isSel
                          ? "border-primary bg-primary/10 text-primary font-bold shadow-sm"
                          : "border-border/60 hover:bg-muted/40 text-muted-foreground"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Question Text */}
            <div>
              <Label htmlFor="qText" className="text-xs font-bold">Question Text / Prompt *</Label>
              <Textarea
                id="qText"
                placeholder="Enter clear, concise question prompt..."
                value={qText}
                onChange={(e) => setQText(e.target.value)}
                required
                className="mt-1 text-xs"
                rows={3}
              />
            </div>

            {/* Dynamic Options Editor by Question Type */}
            {qType === "mcq" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold">Options (Select radio for correct answer) *</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleAddOptionField}
                    className="h-6 text-[10px] text-primary"
                  >
                    + Add Option
                  </Button>
                </div>
                {qOptions.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="correct_option_mcq"
                      id={`mcq_opt_${idx}`}
                      checked={qCorrectIdx === idx}
                      onChange={() => setQCorrectIdx(idx)}
                      className="w-4 h-4 text-primary cursor-pointer"
                    />
                    <Label htmlFor={`mcq_opt_${idx}`} className="text-xs font-mono font-bold w-14 cursor-pointer">
                      Option {String.fromCharCode(65 + idx)}:
                    </Label>
                    <Input
                      type="text"
                      value={opt}
                      onChange={(e) => handleOptionChange(idx, e.target.value)}
                      placeholder={`Enter text for option ${String.fromCharCode(65 + idx)}...`}
                      required={idx < 2}
                      className="h-8 text-xs flex-1"
                    />
                    {qOptions.length > 2 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveOptionField(idx)}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {qType === "multiple_select" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold">Options (Check all boxes that are correct) *</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleAddOptionField}
                    className="h-6 text-[10px] text-primary"
                  >
                    + Add Option
                  </Button>
                </div>
                {qOptions.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`multi_opt_${idx}`}
                      checked={qCorrectOptions.includes(idx)}
                      onChange={() => toggleMultiSelectOption(idx)}
                      className="w-4 h-4 rounded text-primary cursor-pointer"
                    />
                    <Label htmlFor={`multi_opt_${idx}`} className="text-xs font-mono font-bold w-14 cursor-pointer">
                      Option {String.fromCharCode(65 + idx)}:
                    </Label>
                    <Input
                      type="text"
                      value={opt}
                      onChange={(e) => handleOptionChange(idx, e.target.value)}
                      placeholder={`Enter text for option ${String.fromCharCode(65 + idx)}...`}
                      required={idx < 2}
                      className="h-8 text-xs flex-1"
                    />
                    {qOptions.length > 2 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveOptionField(idx)}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {qType === "true_false" && (
              <div className="space-y-2">
                <Label className="text-xs font-bold">Correct Statement Assessment *</Label>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setQTrueFalseAns(true)}
                    className={`p-3 rounded-xl border text-center font-bold text-xs transition-all ${
                      qTrueFalseAns
                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "border-border/60 hover:bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    True
                  </button>
                  <button
                    type="button"
                    onClick={() => setQTrueFalseAns(false)}
                    className={`p-3 rounded-xl border text-center font-bold text-xs transition-all ${
                      !qTrueFalseAns
                        ? "border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                        : "border-border/60 hover:bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    False
                  </button>
                </div>
              </div>
            )}

            {qType === "short_answer" && (
              <div className="space-y-2">
                <Label htmlFor="qShortKey" className="text-xs font-bold">Expected Answer Key / Accepted Response *</Label>
                <Input
                  id="qShortKey"
                  placeholder="e.g. Transport layer or TCP"
                  value={qShortAnswerKey}
                  onChange={(e) => setQShortAnswerKey(e.target.value)}
                  required
                  className="h-8 text-xs"
                />
                <p className="text-[10px] text-muted-foreground">
                  The automated grading engine matches candidate submissions case-insensitively against this answer key.
                </p>
              </div>
            )}

            {/* Explanation & Marks */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <Label htmlFor="qExplanation" className="text-xs font-bold">Explanation / Model Solution (Optional)</Label>
                <Input
                  id="qExplanation"
                  placeholder="Appears in candidate review after exam completion"
                  value={qExplanation}
                  onChange={(e) => setQExplanation(e.target.value)}
                  className="mt-1 h-8 text-xs"
                />
              </div>

              <div>
                <Label htmlFor="qMarks" className="text-xs font-bold">Marks / Points</Label>
                <Input
                  id="qMarks"
                  type="number"
                  min={1}
                  max={50}
                  value={qMarks}
                  onChange={(e) => setQMarks(Number(e.target.value))}
                  required
                  className="mt-1 h-8 text-xs font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="outline" size="sm" onClick={() => setQDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={savingQuestion} className="font-bold">
                {savingQuestion ? "Saving..." : editingQuestionId ? "Update Question" : "Save Question"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* JSON Import Dialog with Template Download & Schema Preview */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary" /> Import Questions JSON Dataset
            </DialogTitle>
            <DialogDescription className="text-xs">
              Upload or paste a JSON array of questions. Supports MCQ, Multiple-Select, True/False, and Short-Answer formats.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border">
              <div>
                <h5 className="font-bold text-xs text-foreground">Standard Question Template</h5>
                <p className="text-[11px] text-muted-foreground">Download the schema template with examples of all 4 question types.</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownloadTemplate}
                className="text-xs font-semibold gap-1.5"
              >
                <Download className="w-3.5 h-3.5" /> Download Template
              </Button>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs font-bold">Select JSON File or Paste Text Below</Label>
                <label className="text-[11px] text-primary hover:underline cursor-pointer font-semibold">
                  Browse File
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
              <Textarea
                placeholder='[{"question_text": "Sample?", "question_type": "mcq", "options": ["A", "B"], "correct_option_index": 0, "marks": 1}]'
                value={importJsonText}
                onChange={(e) => {
                  setImportJsonText(e.target.value);
                  setImportPreviewData(null);
                }}
                rows={7}
                className="font-mono text-xs"
              />
            </div>

            {/* Validation & Preview Output */}
            {importPreviewData && (
              <div className="p-3.5 rounded-xl border border-primary/30 bg-primary/5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                    <span className="font-bold text-xs text-foreground">Validation Passed</span>
                  </div>
                  <Badge variant="outline" className="font-mono text-xs">
                    {importPreviewData.total_valid} valid questions ready
                  </Badge>
                </div>

                <div className="max-h-36 overflow-y-auto space-y-1.5 pt-1">
                  {(importPreviewData.preview || []).map((p: any, pIdx: number) => (
                    <div key={pIdx} className="p-2 rounded bg-background/80 border border-border/40 text-[11px] flex items-center justify-between">
                      <div className="truncate pr-2">
                        <span className="font-mono font-bold mr-1.5">Q{pIdx + 1}:</span>
                        <span>{p.question_text}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {getQuestionTypeBadge(p.question_type)}
                        <span className="font-mono text-muted-foreground">{p.marks || 1}m</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setImportDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleValidateImport}
                disabled={validatingImport || !importJsonText.trim()}
                className="font-semibold text-xs"
              >
                {validatingImport ? "Validating..." : "Validate & Preview"}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleConfirmImport}
                disabled={importing || !importJsonText.trim() || !importPreviewData}
                className="font-bold text-xs"
              >
                {importing ? "Importing..." : "Confirm & Import Dataset"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Candidate Submission Review Modal */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" /> Candidate Submission Breakdown
            </DialogTitle>
            <DialogDescription className="text-xs">
              Question-by-question scoring and response evaluation.
            </DialogDescription>
          </DialogHeader>

          {reviewLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">Loading evaluation results...</span>
            </div>
          ) : selectedReview ? (
            <div className="space-y-4 pt-2">
              {/* Summary Score Banner */}
              <div className="p-4 rounded-xl bg-muted/40 border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="font-bold text-sm text-foreground">{selectedReview.student_name}</h4>
                  <p className="text-xs text-muted-foreground">
                    Candidate ID: <span className="font-mono">{selectedReview.student_id?.substring(0, 8)}...</span>
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">Final Score</span>
                    <span className="font-mono text-xl font-bold text-foreground">
                      {selectedReview.score} / {selectedReview.total_marks}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">Percentage</span>
                    <span className="font-mono text-xl font-bold text-primary">
                      {selectedReview.percentage}%
                    </span>
                  </div>
                  <Badge variant="outline" className="capitalize text-xs font-bold">
                    {selectedReview.status}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownloadPdf(selectedReview.submission_id, selectedReview.student_name)}
                    className="text-xs gap-1.5 font-bold"
                  >
                    <Download className="w-3.5 h-3.5 text-primary" /> Download PDF
                  </Button>
                </div>
              </div>

              {/* Questions Breakdown List */}
              <div className="space-y-3">
                {(selectedReview.questions || []).map((rq: any, qIdx: number) => {
                  const isCorrect = rq.is_correct === true;
                  const isIncorrect = rq.is_correct === false;

                  return (
                    <div
                      key={rq.question_id || qIdx}
                      className={`p-3.5 rounded-xl border space-y-2 text-xs transition-all ${
                        isCorrect
                          ? "border-emerald-500/30 bg-emerald-500/5"
                          : isIncorrect
                          ? "border-rose-500/30 bg-rose-500/5"
                          : "border-border/50 bg-card/60"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-foreground">Q{qIdx + 1}</span>
                            {getQuestionTypeBadge(rq.question_type)}
                            {isCorrect ? (
                              <Badge className="bg-emerald-600 text-white text-[9px] gap-1">
                                <Check className="w-3 h-3" /> Correct (+{rq.marks_awarded}m)
                              </Badge>
                            ) : isIncorrect ? (
                              <Badge variant="destructive" className="text-[9px] gap-1">
                                <XCircle className="w-3 h-3" /> Incorrect (0m)
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px]">
                                Not Answered (0m)
                              </Badge>
                            )}
                          </div>
                          <p className="font-semibold text-foreground pt-0.5">{rq.question_text}</p>
                        </div>
                        <span className="font-mono font-semibold text-muted-foreground shrink-0">
                          {rq.marks_awarded || 0} / {rq.marks}m
                        </span>
                      </div>

                      {/* Candidate response vs Correct Answer */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        <div className="p-2.5 rounded-lg bg-background/80 border border-border/40">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">
                            Candidate's Response
                          </span>
                          <span className="font-medium text-foreground">
                            {rq.question_type === "mcq" ? (
                              rq.selected_option_index !== null && rq.selected_option_index !== undefined ? (
                                `${String.fromCharCode(65 + rq.selected_option_index)}. ${rq.options?.[rq.selected_option_index] || ""}`
                              ) : (
                                <span className="text-muted-foreground italic">No answer submitted</span>
                              )
                            ) : rq.question_type === "multiple_select" ? (
                              Array.isArray(rq.selected_options) && rq.selected_options.length > 0 ? (
                                rq.selected_options.map((i: number) => String.fromCharCode(65 + i)).join(", ")
                              ) : (
                                <span className="text-muted-foreground italic">No answer submitted</span>
                              )
                            ) : rq.question_type === "true_false" ? (
                              rq.selected_option_index !== null && rq.selected_option_index !== undefined ? (
                                rq.options?.[rq.selected_option_index] || (rq.selected_option_index === 0 ? "True" : "False")
                              ) : (
                                <span className="text-muted-foreground italic">No answer submitted</span>
                              )
                            ) : (
                              rq.text_answer || <span className="text-muted-foreground italic">No answer written</span>
                            )}
                          </span>
                        </div>

                        <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                          <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block mb-1">
                            Correct Answer / Key
                          </span>
                          <span className="font-medium text-emerald-700 dark:text-emerald-300">
                            {rq.question_type === "mcq" ? (
                              rq.correct_option_index !== null && rq.correct_option_index !== undefined ? (
                                `${String.fromCharCode(65 + rq.correct_option_index)}. ${rq.options?.[rq.correct_option_index] || ""}`
                              ) : (
                                "Key defined"
                              )
                            ) : rq.question_type === "multiple_select" ? (
                              Array.isArray(rq.correct_answers)
                                ? rq.correct_answers.map((i: any) => String.fromCharCode(65 + Number(i))).join(", ")
                                : "Key defined"
                            ) : rq.question_type === "true_false" ? (
                              rq.options?.[rq.correct_option_index ?? 0] || "True"
                            ) : (
                              Array.isArray(rq.correct_answers) && rq.correct_answers.length > 0
                                ? String(rq.correct_answers[0])
                                : rq.explanation || "Reference key"
                            )}
                          </span>
                        </div>
                      </div>

                      {rq.explanation && (
                        <p className="text-[11px] text-muted-foreground pt-1">
                          <span className="font-semibold">Solution note:</span> {rq.explanation}
                        </p>
                      )}

                      {/* Teacher Evaluation & Qualitative Feedback */}
                      {rq.question_type === "short_answer" && (
                        <div className="mt-2.5 p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-2">
                          <span className="text-[10px] uppercase font-bold text-primary block">
                            Instructor Subjective Evaluation & Feedback
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div>
                              <span className="text-[10px] text-muted-foreground block mb-0.5">Score Awarded (Max {rq.marks})</span>
                              <Input
                                type="number"
                                min={0}
                                max={rq.marks}
                                value={gradingScores[rq.question_id] ?? (rq.marks_awarded || 0)}
                                onChange={(e) => {
                                  const val = Math.min(rq.marks, Math.max(0, parseInt(e.target.value) || 0));
                                  setGradingScores((prev) => ({ ...prev, [rq.question_id]: val }));
                                }}
                                className="h-8 text-xs font-mono"
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <span className="text-[10px] text-muted-foreground block mb-0.5">Feedback / Comments for Student</span>
                              <Input
                                placeholder="Qualitative remarks for student..."
                                value={gradingFeedbacks[rq.question_id] ?? (rq.feedback || "")}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setGradingFeedbacks((prev) => ({ ...prev, [rq.question_id]: val }));
                                }}
                                className="h-8 text-xs"
                              />
                            </div>
                          </div>
                          <div className="flex justify-end pt-1">
                            <Button
                              size="sm"
                              onClick={() => handleSaveGrade(rq.question_id)}
                              disabled={savingGradeFor === rq.question_id}
                              className="h-7 text-[11px] font-bold bg-primary text-primary-foreground gap-1"
                            >
                              {savingGradeFor === rq.question_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                              Save Evaluation
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Preview Exam Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-primary" /> Candidate Examination Preview
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-xs text-primary flex items-center justify-between">
              <span>This preview renders questions exactly as candidates see them during an active examination.</span>
              <Badge variant="outline" className="text-[10px] uppercase font-bold">
                Student Simulation
              </Badge>
            </div>

            {questions.map((q, idx) => (
              <div key={q.id} className="p-4 rounded-xl border border-border/60 bg-card space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-primary font-mono">Question {idx + 1} of {questions.length}</span>
                    {getQuestionTypeBadge(q.question_type)}
                  </div>
                  <Badge variant="secondary" className="text-[10px] font-semibold">{q.marks || 1} Mark(s)</Badge>
                </div>
                <p className="text-sm font-semibold text-foreground">{q.question_text}</p>

                {q.question_type === "short_answer" ? (
                  <div className="p-3 rounded-lg border border-dashed border-border/60 bg-muted/10 text-xs text-muted-foreground">
                    Candidate text response area (multi-line input)...
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(q.options || []).map((opt, optIdx) => (
                      <div
                        key={optIdx}
                        className="p-3 rounded-lg border border-border/40 bg-muted/20 text-xs flex items-center gap-2.5"
                      >
                        <span className="w-5 h-5 rounded-full border border-border flex items-center justify-center font-mono font-bold text-[10px] bg-background">
                          {String.fromCharCode(65 + optIdx)}
                        </span>
                        <span>{opt}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* WebRTC Candidate Screen Viewer Modal */}
      <TeacherScreenViewerModal
        isOpen={isViewing || !!remoteStream}
        studentId={activePeerId}
        remoteStream={remoteStream}
        onClose={() => stopScreenShare()}
      />
    </div>
  );
};
