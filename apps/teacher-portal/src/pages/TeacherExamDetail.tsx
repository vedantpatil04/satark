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
  Database
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

  // WebRTC Live Screen Viewer State
  const { isConnected, lastMessage, send } = useRealtimeSocket({
    channel: "teacher",
  });

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
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [qText, setQText] = useState("");
  const [qOptionA, setQOptionA] = useState("");
  const [qOptionB, setQOptionB] = useState("");
  const [qOptionC, setQOptionC] = useState("");
  const [qOptionD, setQOptionD] = useState("");
  const [qCorrectIdx, setQCorrectIdx] = useState<number>(0);
  const [qMarks, setQMarks] = useState<number>(1);
  const [savingQuestion, setSavingQuestion] = useState(false);

  // Preview State
  const [previewOpen, setPreviewOpen] = useState(false);

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
    } catch {
      toast.error("Failed to load examination details");
      navigate("/teacher/exams");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExamDetails();
    const interval = setInterval(loadExamDetails, 6000); // Poll telemetry every 6s
    return () => clearInterval(interval);
  }, [effectiveExamId]);

  const handleOpenAddQuestion = () => {
    setEditingQuestionId(null);
    setQText("");
    setQOptionA("");
    setQOptionB("");
    setQOptionC("");
    setQOptionD("");
    setQCorrectIdx(0);
    setQMarks(1);
    setQDialogOpen(true);
  };

  const handleOpenEditQuestion = (q: ExamQuestion) => {
    setEditingQuestionId(q.id);
    setQText(q.question_text);
    setQOptionA(q.options[0] || "");
    setQOptionB(q.options[1] || "");
    setQOptionC(q.options[2] || "");
    setQOptionD(q.options[3] || "");
    setQCorrectIdx(q.correct_option_index ?? 0);
    setQMarks(q.marks);
    setQDialogOpen(true);
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveExamId) return;
    if (!qText.trim()) {
      toast.error("Please enter question text");
      return;
    }
    const options = [qOptionA.trim(), qOptionB.trim(), qOptionC.trim(), qOptionD.trim()].filter(Boolean);
    if (options.length < 2) {
      toast.error("Please enter at least 2 options");
      return;
    }
    if (qCorrectIdx < 0 || qCorrectIdx >= options.length) {
      toast.error("Please select a valid correct answer option");
      return;
    }

    setSavingQuestion(true);
    try {
      if (editingQuestionId) {
        await examsApi.updateQuestion(effectiveExamId, editingQuestionId, {
          question_text: qText.trim(),
          options,
          correct_option_index: qCorrectIdx,
          marks: qMarks,
        });
        toast.success("Question updated successfully");
      } else {
        await examsApi.createQuestion(effectiveExamId, {
          question_text: qText.trim(),
          options,
          correct_option_index: qCorrectIdx,
          marks: qMarks,
          order_num: questions.length + 1,
        });
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
        <p className="text-sm text-muted-foreground font-medium">Connecting to live proctoring stream...</p>
      </div>
    );
  }

  const isEditable = exam.status === "draft" || exam.status === "scheduled";

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Back button */}
      <Button variant="outline" size="sm" onClick={() => navigate("/teacher/exams")}>
        <ArrowLeft className="w-4 h-4 mr-1" /> All Examinations
      </Button>

      {/* Hero Header Card */}
      <div className="glass-card p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 border-l-4 border-l-primary">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge
              variant={exam.status === "active" ? "default" : exam.status === "paused" ? "secondary" : "outline"}
              className="text-xs uppercase font-bold"
            >
              {exam.status}
            </Badge>
            <span className="text-xs text-muted-foreground">• Duration: {exam.duration_minutes} mins</span>
            <span className="text-xs text-muted-foreground">• Questions: {questions.length}</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">{exam.title}</h1>
          <p className="text-xs text-muted-foreground mt-1 max-w-xl">
            {exam.description || "Live proctored candidate workstation supervision"}
          </p>
        </div>

        {/* PIN Box & Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="p-3 rounded-xl bg-muted/60 border border-border/50 flex items-center justify-between gap-4">
            <div>
              <span className="text-[10px] uppercase font-bold text-muted-foreground block">Student Exam PIN</span>
              <span className="font-mono text-xl font-bold text-primary tracking-widest">{exam.exam_code}</span>
            </div>
            <Button size="sm" variant="ghost" onClick={handleCopyPin} className="h-8 w-8 p-0">
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Link to={`/teacher/exams/${exam.id}/live`}>
              <Button className="font-bold gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm">
                <Radio className="w-4 h-4 text-rose-500 animate-pulse" /> Live Monitoring
              </Button>
            </Link>

            {(exam.status === "draft" || exam.status === "scheduled") && (
              <Button onClick={handleStart} className="font-bold gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                <Play className="w-4 h-4" /> Start Exam
              </Button>
            )}

            {exam.status === "active" && (
              <>
                <Button variant="outline" onClick={() => handleGrantTime(15)} className="font-semibold gap-1.5 border-primary/30 text-primary hover:bg-primary/10">
                  <Clock className="w-4 h-4" /> +15 min
                </Button>
                <Button variant="secondary" onClick={handlePause} className="font-semibold gap-1.5">
                  <Pause className="w-4 h-4" /> Pause
                </Button>
                <Button variant="destructive" onClick={handleEnd} className="font-semibold gap-1.5">
                  <Square className="w-4 h-4" /> End Exam
                </Button>
              </>
            )}

            {exam.status === "paused" && (
              <>
                <Button variant="outline" onClick={() => handleGrantTime(15)} className="font-semibold gap-1.5 border-primary/30 text-primary hover:bg-primary/10">
                  <Clock className="w-4 h-4" /> +15 min
                </Button>
                <Button onClick={handleResume} className="font-bold gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                  <RotateCcw className="w-4 h-4" /> Resume
                </Button>
                <Button variant="destructive" onClick={handleEnd} className="font-semibold gap-1.5">
                  <Square className="w-4 h-4" /> End Exam
                </Button>
              </>
            )}

            {exam.status === "ended" && (
              <Badge variant="outline" className="px-3 py-2 text-xs font-bold">
                Session Finalized
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Tabs View */}
      <Tabs defaultValue="questions" className="space-y-4">
        <TabsList className="bg-muted/60 flex flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="questions" className="font-semibold text-xs flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5" />
            Questions ({questions.length})
          </TabsTrigger>
          <TabsTrigger value="submissions" className="font-semibold text-xs flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            Submissions ({submissions.length})
          </TabsTrigger>
          <TabsTrigger value="alerts" className="font-semibold text-xs flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Integrity Alerts ({alerts.filter((a) => !a.is_acknowledged).length})
          </TabsTrigger>
          <TabsTrigger value="devices" className="font-semibold text-xs flex items-center gap-1.5">
            <Monitor className="w-3.5 h-3.5" />
            Registered Devices ({devices.length})
          </TabsTrigger>
          <TabsTrigger value="policy" className="font-semibold text-xs flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            Rules
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Questions Management (Feature 1) */}
        <TabsContent value="questions" className="space-y-4">
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-border/40">
              <div>
                <CardTitle className="text-base font-bold text-foreground">
                  Multiple-Choice Questions ({questions.length})
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Total Exam Marks: {questions.reduce((sum, q) => sum + q.marks, 0)} • {isEditable ? "Editing enabled (Draft/Scheduled)" : "Locked (Exam in progress or ended)"}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {questions.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPreviewOpen(true)}
                    className="text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5" /> Preview Exam
                  </Button>
                )}

                {isEditable && (
                  <>
                    <Link to="/teacher/question-bank">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs font-semibold flex items-center gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                      >
                        <Database className="w-3.5 h-3.5" /> Import from Bank
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
                    <Button size="sm" onClick={handleOpenAddQuestion} className="font-semibold text-xs">
                      <Plus className="w-3.5 h-3.5 mr-1" /> Add Your First Question
                    </Button>
                  )}
                </div>
              ) : (
                questions.map((q, idx) => (
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
                          <Badge variant="secondary" className="text-[10px] font-semibold">
                            {q.marks} {q.marks === 1 ? "Mark" : "Marks"}
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

                    {/* Options Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {q.options.map((opt, optIdx) => {
                        const isCorrect = q.correct_option_index === optIdx;
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
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Candidate Submissions */}
        <TabsContent value="submissions" className="space-y-4">
          <Card className="glass-card">
            <CardHeader className="pb-4 border-b border-border/40">
              <CardTitle className="text-base font-bold text-foreground">
                Candidate Submissions ({submissions.length})
              </CardTitle>
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
                        <th className="pb-3">Submitted At</th>
                        <th className="pb-3 text-right pr-2">Proctor Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {submissions.map((s) => (
                        <tr key={s.id} className="hover:bg-muted/30">
                          <td className="py-3 pl-2 font-medium text-foreground">
                            {s.student_name || (s.student_id ? s.student_id.substring(0, 8) : "Student")}
                          </td>
                          <td className="py-3">
                            <Badge variant="outline" className="text-[10px] capitalize">
                              {s.status}
                            </Badge>
                          </td>
                          <td className="py-3 font-mono font-bold text-foreground">
                            {s.score !== null && s.score !== undefined ? `${s.score} / ${s.total_marks}` : "Pending Evaluation"}
                          </td>
                          <td className="py-3">
                            <span className="font-mono font-bold text-primary">
                              {s.percentage !== null && s.percentage !== undefined ? `${s.percentage}%` : "—"}
                            </span>
                          </td>
                          <td className="py-3 text-muted-foreground">
                            {new Date(s.submitted_at).toLocaleTimeString()}
                          </td>
                          <td className="py-3 text-right pr-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => requestScreenShare(s.student_id, exam?.id)}
                              className="h-7 text-[11px] font-semibold gap-1 hover:bg-primary/10 hover:text-primary"
                            >
                              <Monitor className="w-3.5 h-3.5" /> Request Screen
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
          <Card className="glass-card">
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
          <Card className="glass-card">
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
          <Card className="glass-card">
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

      {/* Add/Edit Question Dialog */}
      <Dialog open={qDialogOpen} onOpenChange={setQDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingQuestionId ? "Edit Examination Question" : "Add Multiple-Choice Question"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveQuestion} className="space-y-4 pt-2">
            <div>
              <Label htmlFor="qText" className="text-xs font-bold">Question Text *</Label>
              <Textarea
                id="qText"
                placeholder="e.g. Which layer of the OSI model handles end-to-end reliability?"
                value={qText}
                onChange={(e) => setQText(e.target.value)}
                required
                className="mt-1 text-xs"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold">Answer Options (Select the radio of the correct answer) *</Label>
              {[
                { label: "Option A", val: qOptionA, set: setQOptionA, idx: 0 },
                { label: "Option B", val: qOptionB, set: setQOptionB, idx: 1 },
                { label: "Option C", val: qOptionC, set: setQOptionC, idx: 2 },
                { label: "Option D", val: qOptionD, set: setQOptionD, idx: 3 },
              ].map((opt) => (
                <div key={opt.idx} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correct_option"
                    id={`opt_radio_${opt.idx}`}
                    checked={qCorrectIdx === opt.idx}
                    onChange={() => setQCorrectIdx(opt.idx)}
                    className="w-4 h-4 text-primary cursor-pointer"
                  />
                  <Label htmlFor={`opt_radio_${opt.idx}`} className="text-xs font-mono font-bold w-16 cursor-pointer">
                    {opt.label}:
                  </Label>
                  <Input
                    type="text"
                    value={opt.val}
                    onChange={(e) => opt.set(e.target.value)}
                    placeholder={`Enter option ${String.fromCharCode(65 + opt.idx)} text...`}
                    required={opt.idx < 2}
                    className="h-8 text-xs flex-1"
                  />
                </div>
              ))}
            </div>

            <div className="w-32">
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

            <div className="flex justify-end gap-2 pt-2">
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
                  <span className="font-bold text-xs text-primary font-mono">Question {idx + 1} of {questions.length}</span>
                  <Badge variant="secondary" className="text-[10px] font-semibold">{q.marks} Mark(s)</Badge>
                </div>
                <p className="text-sm font-semibold text-foreground">{q.question_text}</p>
                <div className="space-y-2">
                  {q.options.map((opt, optIdx) => (
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
