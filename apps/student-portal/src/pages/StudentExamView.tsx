import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { examsApi, ExamSession, ExamQuestion, StudentAnswer, ExamSubmission } from "@/api/exams";
import {
  ArrowLeft,
  Clock,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Send,
  HelpCircle,
  AlertCircle,
  Megaphone,
  Camera,
  Video,
  VideoOff,
  Wifi,
  WifiOff,
  RefreshCw,
  CheckSquare,
  Square as SquareIcon,
  Monitor,
  Download,
  Check,
  XCircle,
  FileText,
  Lock
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useRealtimeSocket } from "@/hooks/useRealtimeSocket";
import { useWebRTCStream } from "@/hooks/useWebRTCStream";
import { StudentScreenShareModal } from "@/components/webrtc/StudentScreenShareModal";

interface StudentAnswerState {
  selected_option_index?: number | null;
  selected_options?: number[];
  text_answer?: string | null;
}

export const StudentExamView: React.FC = () => {
  const { id, examId } = useParams<{ id?: string; examId?: string }>();
  const effectiveExamId = examId || id || "";
  const navigate = useNavigate();

  const [exam, setExam] = useState<ExamSession | null>(null);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, StudentAnswerState>>({});
  const [currentIdx, setCurrentIdx] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number>(3600);
  const [saveStatus, setSaveStatus] = useState<"synced" | "saving" | "offline">("synced");

  // Submission & Results State
  const [submission, setSubmission] = useState<ExamSubmission | null>(null);
  const [submissionReview, setSubmissionReview] = useState<any | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);

  // Mandatory Hardware & Screen Streams State
  const [hasEnteredExam, setHasEnteredExam] = useState(false);
  const [isAuthorizingStreams, setIsAuthorizingStreams] = useState(false);

  // Tab-Switch Monitoring State (Feature 2)
  const [tabSwitchCount, setTabSwitchCount] = useState<number>(0);
  const [showTabWarning, setShowTabWarning] = useState<boolean>(false);
  const [tabWarningLevel, setTabWarningLevel] = useState<1 | 2 | null>(null);
  const [isExamLocked, setIsExamLocked] = useState<boolean>(false);
  const [lockReason, setLockReason] = useState<string>("");
  const [isRequestingUnlock, setIsRequestingUnlock] = useState<boolean>(false);
  const [unlockRequestSent, setUnlockRequestSent] = useState<boolean>(false);
  const lastTabSwitchTime = useRef<number>(0);

  // Proctor Announcement State
  const [announcement, setAnnouncement] = useState<{
    message: string;
    teacherName?: string;
    priority: "normal" | "urgent";
    timestamp: string;
  } | null>(null);

  // Storage key for resilient answer recovery across refreshes & offline interruptions
  const storageKey = `satark_exam_answers_${effectiveExamId}`;

  // Real-time socket for proctor time extensions, announcements & WebRTC signaling
  const { isConnected, lastMessage, send } = useRealtimeSocket({
    channel: "student",
    onMessage: (msg) => {
      if (msg.type === "exam_time_granted" && msg.exam_id === effectiveExamId) {
        const addedMins = msg.additional_minutes || 0;
        setTimeLeftSeconds((prev) => prev + addedMins * 60);
        toast.info(`Time Extended: Proctor granted +${addedMins} additional minutes!`, {
          duration: 6000,
        });
      } else if (msg.type === "exam_announcement" && msg.exam_id === effectiveExamId) {
        setAnnouncement({
          message: msg.message,
          teacherName: msg.teacher_name,
          priority: msg.priority || "normal",
          timestamp: msg.timestamp || new Date().toISOString(),
        });
        if (msg.priority === "urgent") {
          toast.error(`URGENT ANNOUNCEMENT: ${msg.message}`, { duration: 10000 });
        } else {
          toast.info(`Instructor Announcement: ${msg.message}`, { duration: 8000 });
        }
      } else if (msg.type === "exam_state_changed" && msg.exam_id === effectiveExamId) {
        if (msg.status === "ended") {
          toast.warning("The examination has been concluded by the instructor.");
          loadExamWorkspace();
        }
      } else if (msg.type === "exam_results_published" && msg.exam_id === effectiveExamId) {
        toast.success("Exam results have been published by your instructor!");
        loadExamWorkspace();
      } else if (msg.type === "exam_unlocked") {
        setIsExamLocked(false);
        setTabSwitchCount(0);
        setUnlockRequestSent(false);
        setTabWarningLevel(null);
        setShowTabWarning(false);
        toast.success(msg.message || "Permission granted by instructor! You may now resume your exam.", {
          duration: 8000,
        });
      }
    },
  });

  const {
    incomingRequest,
    isSharing,
    isCameraActive,
    startDualStream,
    startScreenShare,
    acceptScreenShare,
    rejectScreenShare,
    stopScreenShare,
    startCameraStream,
    stopCameraShare,
    isMobile,
  } = useWebRTCStream({
    role: "student",
    sendMessage: send,
    lastMessage,
    examId: effectiveExamId,
  });

  // Fetch initial exam, questions, existing answers & submission status
  const loadExamWorkspace = useCallback(async () => {
    if (!effectiveExamId) return;
    try {
      // 1. Check local storage cache for answers preserved through previous refresh
      let localCachedAnswers: Record<string, StudentAnswerState> = {};
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          localCachedAnswers = JSON.parse(raw);
        }
      } catch (e) {
        console.warn("Failed reading local answer cache:", e);
      }

      const [exmData, qData, ansData, subData] = await Promise.all([
        examsApi.get(effectiveExamId),
        examsApi.getQuestions(effectiveExamId).catch(() => []),
        examsApi.getAnswers(effectiveExamId).catch(() => []),
        examsApi.getSubmissions(effectiveExamId).catch(() => []),
      ]);

      setExam(exmData);
      setQuestions(qData);
      setTimeLeftSeconds(exmData.duration_minutes * 60);

      // Merge backend answers with local cache (local takes precedence if more recent)
      const mergedAnswers: Record<string, StudentAnswerState> = { ...localCachedAnswers };
      ansData.forEach((a) => {
        if (!mergedAnswers[a.question_id]) {
          mergedAnswers[a.question_id] = {
            selected_option_index: a.selected_option_index,
            selected_options: (a as any).selected_options || [],
            text_answer: (a as any).text_answer || "",
          };
        }
      });
      setAnswers(mergedAnswers);
      localStorage.setItem(storageKey, JSON.stringify(mergedAnswers));

      // Check if student already submitted
      if (subData && subData.length > 0) {
        const sub = subData[0];
        setSubmission(sub);
        if (exmData.is_results_published) {
          examsApi.getSubmissionReview(effectiveExamId, sub.id)
            .then((rev) => setSubmissionReview(rev))
            .catch(() => {});
        }
      }
    } catch (err: any) {
      toast.error("Failed to load examination workspace");
      navigate("/student/exams");
    } finally {
      setLoading(false);
    }
  }, [effectiveExamId, navigate, storageKey]);

  useEffect(() => {
    loadExamWorkspace();
  }, [loadExamWorkspace]);

  // Exam countdown timer (runs only when active, not submitted, hardware streams active, and not locked)
  useEffect(() => {
    if (!exam || exam.status !== "active" || submission || !isSharing || !isCameraActive || isExamLocked) return;
    const timer = setInterval(() => {
      setTimeLeftSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          toast.warning("Time limit reached for this assessment.");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [exam, submission, isSharing, isCameraActive, isExamLocked]);

  // Generic answer update & autosave with offline preservation
  const persistAnswer = useCallback(
    (questionId: string, updatedState: StudentAnswerState) => {
      if (submission || exam?.status !== "active") return;

      // 1. Update React state & localStorage immediately
      setAnswers((prev) => {
        const next = { ...prev, [questionId]: updatedState };
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch (e) {}
        return next;
      });

      // 2. Persist to FastAPI backend
      setSaveStatus("saving");
      examsApi
        .saveAnswer(effectiveExamId, {
          question_id: questionId,
          selected_option_index: updatedState.selected_option_index,
          selected_options: updatedState.selected_options,
          text_answer: updatedState.text_answer,
        })
        .then(() => {
          setSaveStatus("synced");
        })
        .catch((err) => {
          console.warn("Offline/Network issue while autosaving:", err);
          setSaveStatus("offline");
        });
    },
    [effectiveExamId, exam?.status, submission, storageKey]
  );

  // FEATURE 2: Browser Tab-Switch Detection via Page Visibility API (Enforces 3-strike lock & teacher re-admission)
  useEffect(() => {
    if (!effectiveExamId || !exam || exam.status !== "active" || submission || isExamLocked) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        const now = Date.now();
        // 3-second debounce to avoid event storms on rapid focus flips
        if (now - lastTabSwitchTime.current > 3000) {
          lastTabSwitchTime.current = now;
          setTabSwitchCount((prev) => {
            const nextCount = prev + 1;
            const eventId = "tab_evt_" + Math.random().toString(36).substring(2, 10) + "_" + now;

            if (nextCount === 1) {
              setTabWarningLevel(1);
              setShowTabWarning(true);
              examsApi.sendTabSwitch(effectiveExamId, {
                event_id: eventId,
                occurred_at: new Date().toISOString(),
                details: {
                  reason: "visibility_hidden",
                  tab_switch_number: 1,
                  question_viewed: currentIdx + 1,
                  is_locked: false,
                },
              }).catch(() => {});

              send({
                type: "tab_switch_alert",
                exam_id: effectiveExamId,
                tab_switch_number: 1,
                is_locked: false,
              });
            } else if (nextCount === 2) {
              setTabWarningLevel(2);
              setShowTabWarning(true);
              examsApi.sendTabSwitch(effectiveExamId, {
                event_id: eventId,
                occurred_at: new Date().toISOString(),
                details: {
                  reason: "visibility_hidden",
                  tab_switch_number: 2,
                  question_viewed: currentIdx + 1,
                  is_locked: false,
                },
              }).catch(() => {});

              send({
                type: "tab_switch_alert",
                exam_id: effectiveExamId,
                tab_switch_number: 2,
                is_locked: false,
              });
            } else if (nextCount >= 3) {
              setTabWarningLevel(null);
              setShowTabWarning(false);
              setIsExamLocked(true);
              setLockReason("Maximum allowed tab switches exceeded (3/3). Exam session stopped.");

              // Auto-persist all answers immediately
              if (questions[currentIdx]) {
                const curQId = questions[currentIdx].id;
                if (answers[curQId]) {
                  persistAnswer(curQId, answers[curQId]);
                }
              }

              examsApi.sendTabSwitch(effectiveExamId, {
                event_id: eventId,
                occurred_at: new Date().toISOString(),
                details: {
                  reason: "visibility_hidden",
                  tab_switch_number: nextCount,
                  question_viewed: currentIdx + 1,
                  is_locked: true,
                },
              }).catch(() => {});

              send({
                type: "student_locked",
                exam_id: effectiveExamId,
                reason: "tab_switch_limit_exceeded",
                tab_switch_number: nextCount,
              });
            }

            return nextCount;
          });
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [effectiveExamId, exam, submission, currentIdx, isExamLocked, questions, answers, persistAnswer, send]);

  // Handlers for all 4 question types
  const handleSelectMCQ = (questionId: string, optionIdx: number) => {
    persistAnswer(questionId, { selected_option_index: optionIdx });
  };

  const handleSelectTrueFalse = (questionId: string, isTrue: boolean) => {
    persistAnswer(questionId, { selected_option_index: isTrue ? 0 : 1 });
  };

  const handleToggleMultiSelect = (questionId: string, optionIdx: number) => {
    const currentList = answers[questionId]?.selected_options || [];
    let nextList: number[];
    if (currentList.includes(optionIdx)) {
      nextList = currentList.filter((idx) => idx !== optionIdx);
    } else {
      nextList = [...currentList, optionIdx].sort((a, b) => a - b);
    }
    persistAnswer(questionId, { selected_options: nextList });
  };

  const handleTextAnswerChange = (questionId: string, text: string) => {
    persistAnswer(questionId, { text_answer: text });
  };

  // Re-Admission Permission Request to Teacher
  const handleRequestUnlock = async () => {
    if (!effectiveExamId || isRequestingUnlock) return;
    setIsRequestingUnlock(true);
    try {
      await examsApi.requestUnlock(effectiveExamId, {
        tab_switch_number: tabSwitchCount,
        reason: "Student requested re-admission after exceeding maximum tab switches (3/3).",
      });

      send({
        type: "request_exam_unlock",
        exam_id: effectiveExamId,
        tab_switch_number: tabSwitchCount,
      });

      setUnlockRequestSent(true);
      toast.success("Permission request sent to instructor dashboard. Please wait for authorization.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to submit re-admission request. Please retry.");
    } finally {
      setIsRequestingUnlock(false);
    }
  };

  // Final Exam Submission Handler
  const handleFinalSubmit = async () => {
    if (!effectiveExamId) return;
    setIsSubmitting(true);
    try {
      const payloadAnswers = Object.entries(answers).map(([qId, st]) => ({
        question_id: qId,
        selected_option_index: st.selected_option_index,
        selected_options: st.selected_options,
        text_answer: st.text_answer,
      }));

      const subRes = await examsApi.submitExam(effectiveExamId, {
        answers: payloadAnswers,
      });

      if (isSharing) {
        stopScreenShare();
      }
      if (isCameraActive) {
        stopCameraShare();
      }

      setSubmission(subRes);
      setSubmitDialogOpen(false);
      localStorage.removeItem(storageKey);
      toast.success("Examination submitted successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to submit examination");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAuthorizeHardwareStreams = async () => {
    setIsAuthorizingStreams(true);
    try {
      const res = await startDualStream(exam?.teacher_id);
      if (res && res.screenStream && res.cameraStream) {
        setHasEnteredExam(true);
        toast.success("Webcam and Screen sharing verified. You may now begin the assessment.");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to start camera and screen monitoring.");
    } finally {
      setIsAuthorizingStreams(false);
    }
  };

  const handleAcceptIncomingStreamRequest = async () => {
    const res = await acceptScreenShare();
    if (res && res.cameraStream && res.screenStream) {
      setHasEnteredExam(true);
    }
  };

  const handleDownloadResultPdf = async () => {
    if (!effectiveExamId || !submission) return;
    setDownloadingPdf(true);
    try {
      await examsApi.downloadPdf(effectiveExamId, submission.id, `SATARK_Result_${exam?.exam_code || "Exam"}.pdf`);
      toast.success("Result PDF downloaded successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to download Result PDF");
    } finally {
      setDownloadingPdf(false);
    }
  };

  const formatTimer = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const isQuestionAnswered = (qId: string) => {
    const ans = answers[qId];
    if (!ans) return false;
    if (ans.selected_option_index !== undefined && ans.selected_option_index !== null) return true;
    if (ans.selected_options && ans.selected_options.length > 0) return true;
    if (ans.text_answer && ans.text_answer.trim().length > 0) return true;
    return false;
  };

  if (loading || !exam) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-medium">Entering secure examination environment...</p>
      </div>
    );
  }

  // Answered count calculation
  const totalQuestions = questions.length;
  const answeredCount = questions.filter((q) => isQuestionAnswered(q.id)).length;
  const unansweredCount = totalQuestions - answeredCount;
  const currentQ = questions[currentIdx];

  // SUBMITTED STATE VIEW (Shows official published results + PDF download, or pending status)
  if (submission) {
    const isResultsPublished = Boolean(exam.is_results_published);
    const passThreshold = exam.passing_percentage ?? 40;
    const isPassed = submission.is_passed !== null && submission.is_passed !== undefined
      ? submission.is_passed
      : (submission.percentage ?? 0) >= passThreshold;

    return (
      <div className="max-w-3xl mx-auto space-y-6 pt-6">
        <div className={`rounded-3xl bg-white border border-stone-200/80 shadow-xs p-8 border-t-4 text-center space-y-6 ${
          isResultsPublished
            ? isPassed
              ? "border-t-emerald-500"
              : "border-t-rose-500"
            : "border-t-[#D97706]"
        }`}>
          <div className={`p-4 w-fit mx-auto rounded-full ${
            isResultsPublished
              ? isPassed
                ? "bg-emerald-50 text-emerald-600"
                : "bg-rose-50 text-rose-600"
              : "bg-[#FFF2E5] text-[#D97706]"
          }`}>
            {isResultsPublished ? (
              isPassed ? <CheckCircle2 className="w-12 h-12" /> : <XCircle className="w-12 h-12" />
            ) : (
              <CheckCircle2 className="w-12 h-12" />
            )}
          </div>

          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">
              {isResultsPublished ? "Official Examination Result" : "Examination Submitted Successfully"}
            </h1>
            <p className="text-xs text-stone-500 max-w-md mx-auto mt-1">
              {isResultsPublished
                ? "Your assessment has been graded and certified by your instructor."
                : "Your candidate assessment has been sealed in the academic audit ledger. Results will appear once published."}
            </p>
          </div>

          {/* Published Results Summary Box */}
          {isResultsPublished ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-xl mx-auto p-4 rounded-2xl bg-[#FCFBF8] border border-stone-200/70 text-center">
              <div className="p-2">
                <span className="text-[10px] uppercase font-bold text-stone-400 block">Obtained Score</span>
                <span className="text-xl font-bold font-mono text-slate-900">
                  {submission.score} / {submission.total_marks}
                </span>
              </div>
              <div className="p-2">
                <span className="text-[10px] uppercase font-bold text-stone-400 block">Percentage</span>
                <span className="text-xl font-bold font-mono text-[#D97706]">
                  {submission.percentage}%
                </span>
              </div>
              <div className="p-2">
                <span className="text-[10px] uppercase font-bold text-stone-400 block">Benchmark</span>
                <span className="text-xl font-bold font-mono text-stone-500">
                  {passThreshold}%
                </span>
              </div>
              <div className="p-2">
                <span className="text-[10px] uppercase font-bold text-stone-400 block">Result</span>
                <Badge
                  className={`text-xs uppercase font-extrabold px-2.5 py-1 rounded-lg ${
                    isPassed
                      ? "bg-emerald-600 text-white"
                      : "bg-rose-600 text-white"
                  }`}
                >
                  {isPassed ? "PASS" : "FAIL"}
                </Badge>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto p-4 rounded-2xl bg-[#FCFBF8] border border-stone-200/70 text-left text-xs">
              <div>
                <span className="text-stone-400 block">Exam:</span>
                <span className="font-semibold text-slate-800">{exam.title}</span>
              </div>
              <div>
                <span className="text-stone-400 block">Status:</span>
                <Badge variant="outline" className="text-[10px] uppercase font-bold text-[#D97706] border-amber-300 bg-amber-50 rounded-lg">
                  {submission.status}
                </Badge>
              </div>
              <div>
                <span className="text-stone-400 block">Questions Attempted:</span>
                <span className="font-semibold text-slate-800">{answeredCount} of {totalQuestions}</span>
              </div>
              <div>
                <span className="text-stone-400 block">Submitted At:</span>
                <span className="font-semibold text-slate-800">{new Date(submission.submitted_at).toLocaleTimeString()}</span>
              </div>
            </div>
          )}

          {/* Action CTAs */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {isResultsPublished && (
              <Button
                onClick={handleDownloadResultPdf}
                disabled={downloadingPdf}
                className="font-bold bg-[#D97706] hover:bg-[#B45309] text-white gap-2 rounded-xl shadow-xs"
              >
                {downloadingPdf ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Download Result PDF
              </Button>
            )}

            <Button
              variant={isResultsPublished ? "outline" : "default"}
              onClick={() => navigate("/exams")}
              className={`font-bold rounded-xl ${
                !isResultsPublished ? "bg-[#D97706] hover:bg-[#B45309] text-white shadow-xs" : "border-stone-200/80"
              }`}
            >
              Return to Examinations
            </Button>
          </div>
        </div>

        {/* Detailed Question Review Breakdown (Only visible after results publication) */}
        {isResultsPublished && submissionReview && (
          <Card className="rounded-3xl bg-white border border-stone-200/80 shadow-xs">
            <CardHeader className="pb-3 border-b border-stone-100">
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#D97706]" /> Question-by-Question Evaluation & Feedback
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {(submissionReview.questions || []).map((rq: any, qIdx: number) => {
                const isCorrect = rq.is_correct === true;
                const isIncorrect = rq.is_correct === false;

                return (
                  <div
                    key={rq.question_id || qIdx}
                    className={`p-4 rounded-xl border space-y-2 text-xs transition-all ${
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
                          <Badge variant="outline" className="text-[9px] uppercase font-bold">
                            {rq.question_type?.replace("_", " ")}
                          </Badge>
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
                              Not Attempted
                            </Badge>
                          )}
                        </div>
                        <p className="font-semibold text-foreground pt-0.5">{rq.question_text}</p>
                      </div>
                      <span className="font-mono font-bold text-foreground shrink-0">
                        {rq.marks_awarded || 0} / {rq.marks} Marks
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <div className="p-2.5 rounded-lg bg-background/80 border border-border/40">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground block mb-0.5">
                          Your Submitted Answer
                        </span>
                        <span className="font-medium text-foreground">
                          {rq.question_type === "mcq" ? (
                            rq.selected_option_index !== null && rq.selected_option_index !== undefined ? (
                              `${String.fromCharCode(65 + rq.selected_option_index)}. ${rq.options?.[rq.selected_option_index] || ""}`
                            ) : (
                              <span className="text-muted-foreground italic">No option selected</span>
                            )
                          ) : rq.question_type === "multiple_select" ? (
                            Array.isArray(rq.selected_options) && rq.selected_options.length > 0 ? (
                              rq.selected_options.map((i: number) => String.fromCharCode(65 + i)).join(", ")
                            ) : (
                              <span className="text-muted-foreground italic">No options selected</span>
                            )
                          ) : rq.question_type === "true_false" ? (
                            rq.selected_option_index !== null && rq.selected_option_index !== undefined ? (
                              rq.options?.[rq.selected_option_index] || (rq.selected_option_index === 0 ? "True" : "False")
                            ) : (
                              <span className="text-muted-foreground italic">No option selected</span>
                            )
                          ) : (
                            rq.text_answer || <span className="text-muted-foreground italic">No answer written</span>
                          )}
                        </span>
                      </div>

                      <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                        <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block mb-0.5">
                          Official Key / Reference
                        </span>
                        <span className="font-medium text-emerald-700 dark:text-emerald-300">
                          {rq.question_type === "mcq" ? (
                            rq.correct_option_index !== null && rq.correct_option_index !== undefined ? (
                              `${String.fromCharCode(65 + rq.correct_option_index)}. ${rq.options?.[rq.correct_option_index] || ""}`
                            ) : (
                              "Reference Key"
                            )
                          ) : rq.question_type === "multiple_select" ? (
                            Array.isArray(rq.correct_answers)
                              ? rq.correct_answers.map((i: any) => String.fromCharCode(65 + Number(i))).join(", ")
                              : "Reference Key"
                          ) : rq.question_type === "true_false" ? (
                            rq.options?.[rq.correct_option_index ?? 0] || "True"
                          ) : (
                            Array.isArray(rq.correct_answers) && rq.correct_answers.length > 0
                              ? String(rq.correct_answers[0])
                              : rq.explanation || "Subjective Evaluation"
                          )}
                        </span>
                      </div>
                    </div>

                    {(rq.feedback || rq.explanation) && (
                      <div className="p-2 rounded bg-muted/30 border border-border/30 text-[11px] text-muted-foreground">
                        {rq.feedback && (
                          <p><span className="font-semibold text-primary">Instructor Feedback:</span> {rq.feedback}</p>
                        )}
                        {rq.explanation && (
                          <p className="mt-0.5"><span className="font-semibold">Explanation:</span> {rq.explanation}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // MANDATORY PRE-EXAM GATE & DISCONNECTION INTERRUPTION BLOCKER
  const hasActiveDualStream = isSharing && isCameraActive;

  if (!hasActiveDualStream) {
    return (
      <div className="max-w-xl mx-auto space-y-6 pt-10">
        <Card className={`rounded-3xl bg-white border border-stone-200/80 shadow-xs p-8 text-center border-t-4 ${
          hasEnteredExam ? "border-t-amber-500" : "border-t-[#D97706]"
        }`}>
          <div className={`p-4 w-fit mx-auto rounded-full mb-4 ${
            hasEnteredExam ? "bg-amber-50 text-amber-600" : "bg-[#FFF2E5] text-[#D97706]"
          }`}>
            {hasEnteredExam ? <AlertTriangle className="w-12 h-12" /> : <ShieldAlert className="w-12 h-12" />}
          </div>

          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900">
            {hasEnteredExam ? "Exam Paused: Stream Interrupted" : "Mandatory Equipment & Stream Verification"}
          </h2>

          <p className="text-xs text-stone-500 mt-2 max-w-md mx-auto">
            {hasEnteredExam
              ? "Your camera or screen sharing was disconnected. SATARK academic integrity policy requires continuous active monitoring. All your previous answers are preserved safely in offline storage."
              : "To sit for this examination, SATARK requires active simultaneous Webcam and Full-Screen monitoring. The assessment remains locked until both streams are verified."}
          </p>

          {/* Live Status Indicators */}
          <div className="grid grid-cols-2 gap-3 my-6 text-left">
            <div className={`p-3.5 rounded-2xl border flex items-center gap-3 ${
              isCameraActive
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-stone-200 bg-stone-50 text-stone-500"
            }`}>
              <Camera className="w-5 h-5 shrink-0 text-[#D97706]" />
              <div>
                <span className="font-bold text-xs block text-slate-800">Webcam Stream</span>
                <span className="text-[11px] font-medium">
                  {isCameraActive ? "Active & Streaming" : "Permission Required"}
                </span>
              </div>
            </div>

            <div className={`p-3.5 rounded-2xl border flex items-center gap-3 ${
              isSharing
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-stone-200 bg-stone-50 text-stone-500"
            }`}>
              <Monitor className="w-5 h-5 shrink-0 text-[#D97706]" />
              <div>
                <span className="font-bold text-xs block text-slate-800">Screen Capture</span>
                <span className="text-[11px] font-medium">
                  {isSharing ? "Active & Transmitting" : "Entire Screen Required"}
                </span>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="space-y-3 pt-2">
            <Button
              size="lg"
              onClick={handleAuthorizeHardwareStreams}
              disabled={isAuthorizingStreams}
              className={`w-full font-bold gap-2 text-xs rounded-xl h-11 shadow-xs ${
                hasEnteredExam
                  ? "bg-amber-600 hover:bg-amber-700 text-white"
                  : "bg-[#D97706] hover:bg-[#B45309] text-white"
              }`}
            >
              {isAuthorizingStreams ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : hasEnteredExam ? (
                <RefreshCw className="w-4 h-4" />
              ) : (
                <Video className="w-4 h-4" />
              )}
              {isAuthorizingStreams
                ? "Connecting Media Streams..."
                : hasEnteredExam
                ? "Re-authorize Camera & Screen to Resume"
                : "Authorize Camera & Screen to Start Exam"}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/exams")}
              className="text-xs text-stone-500 hover:text-slate-800 rounded-xl"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Exit Exam Room
            </Button>
          </div>
        </Card>

        {/* WebRTC Live Screen & Camera Sharing Consent & Indicator (Pre-Exam & Paused) */}
        <StudentScreenShareModal
          incomingRequest={incomingRequest}
          isSharing={isSharing}
          isCameraActive={isCameraActive}
          onAccept={handleAcceptIncomingStreamRequest}
          onReject={rejectScreenShare}
          onStop={() => {
            stopScreenShare();
            stopCameraShare();
          }}
          onToggleCamera={() => {
            if (isCameraActive) {
              stopCameraShare();
            } else {
              startCameraStream();
            }
          }}
          isMobile={isMobile}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Bar Navigation & Stream Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate("/student/exams")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Exit Exam Room
        </Button>

        <div className="flex items-center gap-2.5">
          {/* Autosave Status Pill */}
          <div className="px-3 py-1.5 rounded-xl bg-card border border-border/50 flex items-center gap-2 text-xs">
            {saveStatus === "synced" ? (
              <span className="text-emerald-500 flex items-center gap-1 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> Answers Autosaved
              </span>
            ) : saveStatus === "saving" ? (
              <span className="text-primary flex items-center gap-1 font-medium">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving...
              </span>
            ) : (
              <span className="text-amber-500 flex items-center gap-1 font-medium">
                <WifiOff className="w-3.5 h-3.5" /> Saved Offline
              </span>
            )}
          </div>

          {/* Primary Screen Sharing Action */}
          {isSharing ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => stopScreenShare()}
              className="text-xs font-bold gap-1.5 border-emerald-500 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20"
            >
              <Monitor className="w-3.5 h-3.5 text-emerald-500" />
              Screen Sharing Active
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={() => startScreenShare()}
              className="text-xs font-bold gap-1.5 bg-primary text-primary-foreground shadow-sm"
            >
              <Monitor className="w-3.5 h-3.5" />
              Share Screen
            </Button>
          )}

          {/* Optional Webcam Stream Toggle (Never replaces screen share) */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (isCameraActive) {
                stopCameraShare();
              } else {
                startCameraStream();
              }
            }}
            className={`text-xs gap-1.5 ${isCameraActive ? "border border-primary/40 text-primary bg-primary/5" : "text-muted-foreground hover:text-foreground"}`}
            title="Webcam is optional and supplementary"
          >
            {isCameraActive ? <Video className="w-3.5 h-3.5 text-primary" /> : <VideoOff className="w-3.5 h-3.5" />}
            {isCameraActive ? "Webcam: Active" : "Webcam (Optional)"}
          </Button>

          {/* Live Timer Pill */}
          <div className="px-4 py-2 rounded-xl bg-card border border-border/50 flex items-center gap-2 shadow-sm">
            <Clock className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground font-medium">Time Remaining:</span>
            <span className="font-mono text-base font-extrabold text-primary tracking-wider">
              {formatTimer(timeLeftSeconds)}
            </span>
          </div>
        </div>
      </div>

      {/* Header Info Card */}
      <div className="rounded-3xl bg-white border border-stone-200/80 shadow-xs p-6 border-l-4 border-l-[#D97706] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Badge
              variant={exam.status === "active" ? "default" : exam.status === "paused" ? "secondary" : "outline"}
              className="capitalize font-bold text-xs"
            >
              Status: {exam.status}
            </Badge>
            <span className="text-xs text-muted-foreground font-mono">Exam Code: {exam.exam_code}</span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">{exam.title}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {exam.description || "Official proctored examination"}
          </p>
        </div>

        <Button
          onClick={() => setSubmitDialogOpen(true)}
          className="font-bold bg-primary hover:bg-primary/90 flex items-center gap-1.5 self-start md:self-auto"
        >
          <Send className="w-4 h-4" /> Submit Exam
        </Button>
      </div>

      {/* Teacher Proctor Announcement Banner */}
      {announcement && (
        <aside
          aria-label="Proctor announcement"
          className={`p-4 rounded-xl border flex items-start justify-between gap-3 text-xs shadow-md animate-in fade-in slide-in-from-top-2 duration-200 ${
            announcement.priority === "urgent"
              ? "bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-400"
              : "bg-blue-500/15 border-blue-500/40 text-blue-600 dark:text-blue-400"
          }`}
        >
          <div className="flex items-start gap-2.5">
            <Megaphone className="w-5 h-5 shrink-0 mt-0.5 animate-bounce" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">
                  {announcement.priority === "urgent" ? "Urgent Proctor Announcement" : "Proctor Announcement"}
                </span>
                {announcement.teacherName && (
                  <Badge variant="outline" className="text-[10px] uppercase font-semibold">
                    From: {announcement.teacherName}
                  </Badge>
                )}
                <span className="text-[10px] text-muted-foreground font-mono">
                  {new Date(announcement.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-foreground mt-1 text-sm font-medium leading-relaxed">
                {announcement.message}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setAnnouncement(null)}
            className="text-xs h-7 px-2 shrink-0 hover:bg-muted/50"
          >
            Dismiss
          </Button>
        </aside>
      )}

      {/* Feature 2: Tab-Switch Warning Banner when triggered */}
      {showTabWarning && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/30 flex items-start justify-between gap-3 text-xs text-destructive animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Tab-Switch Activity Recorded (Incident #{tabSwitchCount})</p>
              <p className="text-muted-foreground mt-0.5">
                Notice: Focus left this window. This event has been securely timestamped and transmitted to your teacher's proctoring dossier. Please keep this examination window active.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowTabWarning(false)}
            className="text-[11px] h-7 px-2 hover:bg-destructive/20 text-destructive shrink-0"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Policy Notice Banner */}
      <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 flex items-start gap-2.5 text-xs text-primary">
        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">Integrity Supervision Active:</span> Answers auto-save to local memory and central database. Tab switches and screen activity are monitored.
        </div>
      </div>

      {/* EXAM TERMINATED & LOCKED VIEW (Triggered on 3rd Tab Switch) */}
      {isExamLocked ? (
        <Card className="rounded-3xl bg-white border-2 border-destructive/40 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-destructive/10 border-b border-destructive/20 p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-destructive/15 text-destructive flex items-center justify-center mx-auto mb-3 shadow-inner">
              <Lock className="w-8 h-8 text-destructive animate-pulse" />
            </div>
            <h2 className="text-xl font-bold text-destructive tracking-tight">
              Examination Terminated & Session Locked
            </h2>
            <p className="text-xs text-destructive/90 font-medium mt-1">
              Violation: Maximum Tab Switches Exceeded (3/3 Incidents Recorded)
            </p>
          </div>

          <CardContent className="p-8 max-w-xl mx-auto space-y-6 text-center">
            <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 text-left space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                <ShieldAlert className="w-4 h-4 text-destructive shrink-0" />
                <span>Integrity Supervision Enforcement</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Your examination window lost focus 3 times. In compliance with institutional examination integrity policy, your session has been stopped and access to active questions is locked.
              </p>
              <div className="pt-2 border-t border-stone-200 flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Recorded Tab Switches:</span>
                <span className="font-bold text-destructive font-mono">3 of 3 Allowed</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Saved Responses:</span>
                <span className="font-bold text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> All answers securely saved in database
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-stone-600">
                To continue your examination, you must ask permission from your instructor's proctoring dashboard.
              </p>

              {!unlockRequestSent ? (
                <Button
                  size="lg"
                  onClick={handleRequestUnlock}
                  disabled={isRequestingUnlock}
                  className="w-full font-bold bg-primary hover:bg-primary/90 text-primary-foreground h-12 rounded-xl text-sm shadow-md gap-2"
                >
                  {isRequestingUnlock ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Contacting Teacher Dashboard...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Ask Permission from Teacher's Dashboard
                    </>
                  )}
                </Button>
              ) : (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-800 space-y-2 text-xs text-center">
                  <div className="flex items-center justify-center gap-2 font-bold text-sm text-amber-700">
                    <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                    Permission Requested
                  </div>
                  <p className="text-[11px] text-amber-800">
                    Your re-admission request has been delivered to your teacher's dashboard. When your instructor grants permission, this screen will automatically unlock and your examination will resume.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : questions.length === 0 ? (
        <Card className="rounded-3xl bg-white border border-stone-200/80 shadow-xs py-16 text-center">
          <CardContent className="space-y-3">
            <HelpCircle className="w-10 h-10 text-muted-foreground mx-auto" />
            <h3 className="text-base font-bold text-foreground">No Questions Published</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Your instructor has not added questions to this examination yet. Please stand by or contact your invigilator.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Question Viewer (Left 3 columns) */}
          <div className="lg:col-span-3 space-y-4">
            <Card className="rounded-3xl bg-white border border-stone-200/80 shadow-xs">
              <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-xs font-bold text-primary border-primary/40">
                    Question {currentIdx + 1} of {totalQuestions}
                  </Badge>
                  <Badge variant="secondary" className="text-xs capitalize">
                    {currentQ.question_type ? currentQ.question_type.replace("_", " ") : "MCQ"}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    {currentQ.marks} {currentQ.marks === 1 ? "Mark" : "Marks"}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground font-medium">
                  {isQuestionAnswered(currentQ.id) ? (
                    <span className="text-emerald-500 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Saved
                    </span>
                  ) : (
                    <span className="text-amber-500 font-semibold flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> Not Answered
                    </span>
                  )}
                </span>
              </CardHeader>

              <CardContent className="pt-6 space-y-6">
                <h3 className="text-base md:text-lg font-semibold text-foreground leading-relaxed">
                  {currentQ.question_text}
                </h3>

                {/* Question Type 1: MCQ (Single Select) */}
                {(!currentQ.question_type || currentQ.question_type === "mcq") && (
                  <div className="space-y-3">
                    {currentQ.options.map((optText, optIdx) => {
                      const isSelected = answers[currentQ.id]?.selected_option_index === optIdx;
                      return (
                        <div
                          key={optIdx}
                          onClick={() => handleSelectMCQ(currentQ.id, optIdx)}
                          className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center gap-3.5 ${
                            isSelected
                              ? "border-primary bg-primary/10 shadow-sm"
                              : "border-border/60 hover:border-primary/40 hover:bg-muted/30"
                          }`}
                        >
                          <div
                            className={`w-6 h-6 rounded-full border flex items-center justify-center font-mono font-bold text-xs shrink-0 transition-all ${
                              isSelected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border text-muted-foreground bg-card"
                            }`}
                          >
                            {String.fromCharCode(65 + optIdx)}
                          </div>
                          <span className={`text-sm ${isSelected ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                            {optText}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Question Type 2: True / False */}
                {currentQ.question_type === "true_false" && (
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: "True", val: true, idx: 0 },
                      { label: "False", val: false, idx: 1 },
                    ].map((item) => {
                      const isSelected = answers[currentQ.id]?.selected_option_index === item.idx;
                      return (
                        <div
                          key={item.label}
                          onClick={() => handleSelectTrueFalse(currentQ.id, item.val)}
                          className={`p-6 rounded-xl border text-center cursor-pointer transition-all ${
                            isSelected
                              ? "border-primary bg-primary/10 font-bold text-primary shadow-sm"
                              : "border-border/60 hover:border-primary/40 hover:bg-muted/30 text-foreground font-medium"
                          }`}
                        >
                          <span className="text-lg">{item.label}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Question Type 3: Multiple Select (Checkboxes) */}
                {currentQ.question_type === "multiple_select" && (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground italic">
                      Select all options that apply (multiple answers allowed):
                    </p>
                    {currentQ.options.map((optText, optIdx) => {
                      const selectedList = answers[currentQ.id]?.selected_options || [];
                      const isChecked = selectedList.includes(optIdx);
                      return (
                        <div
                          key={optIdx}
                          onClick={() => handleToggleMultiSelect(currentQ.id, optIdx)}
                          className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center gap-3.5 ${
                            isChecked
                              ? "border-primary bg-primary/10 shadow-sm"
                              : "border-border/60 hover:border-primary/40 hover:bg-muted/30"
                          }`}
                        >
                          <div
                            className={`w-6 h-6 rounded-md border flex items-center justify-center font-bold text-xs shrink-0 transition-all ${
                              isChecked
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border text-muted-foreground bg-card"
                            }`}
                          >
                            {isChecked ? <CheckSquare className="w-4 h-4" /> : <SquareIcon className="w-4 h-4 opacity-40" />}
                          </div>
                          <span className={`text-sm ${isChecked ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                            {optText}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Question Type 4: Short Answer */}
                {currentQ.question_type === "short_answer" && (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground italic">
                      Type your short answer below:
                    </p>
                    <Textarea
                      rows={3}
                      placeholder="Enter your concise answer..."
                      value={answers[currentQ.id]?.text_answer || ""}
                      onChange={(e) => handleTextAnswerChange(currentQ.id, e.target.value)}
                      className="text-sm rounded-xl p-3"
                    />
                  </div>
                )}

                {/* Navigation Buttons */}
                <div className="flex items-center justify-between pt-4 border-t border-border/40">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentIdx === 0}
                    onClick={() => setCurrentIdx((prev) => Math.max(0, prev - 1))}
                    className="font-semibold text-xs flex items-center gap-1"
                  >
                    <ChevronLeft className="w-4 h-4" /> Previous
                  </Button>

                  <span className="text-xs text-muted-foreground font-mono">
                    {currentIdx + 1} / {totalQuestions}
                  </span>

                  {currentIdx < totalQuestions - 1 ? (
                    <Button
                      size="sm"
                      onClick={() => setCurrentIdx((prev) => Math.min(totalQuestions - 1, prev + 1))}
                      className="font-semibold text-xs flex items-center gap-1"
                    >
                      Next <ChevronRight className="w-4 h-4" />
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => setSubmitDialogOpen(true)}
                      className="font-bold text-xs flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700"
                    >
                      Finish & Submit <Send className="w-3.5 h-3.5 ml-1" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Question Palette Sidebar (Right column) */}
          <div className="space-y-4">
            <Card className="rounded-3xl bg-white border border-stone-200/80 shadow-xs">
              <CardHeader className="pb-3 border-b border-border/40">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Question Palette
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                {/* Stats Summary */}
                <div className="grid grid-cols-2 gap-2 text-center text-xs">
                  <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <span className="font-mono text-base font-bold text-emerald-500 block">{answeredCount}</span>
                    <span className="text-[10px] text-muted-foreground">Answered</span>
                  </div>
                  <div className="p-2 rounded-lg bg-muted border border-border/40">
                    <span className="font-mono text-base font-bold text-muted-foreground block">{unansweredCount}</span>
                    <span className="text-[10px] text-muted-foreground">Unanswered</span>
                  </div>
                </div>

                {/* Grid of Question Numbers */}
                <div className="grid grid-cols-5 gap-2 pt-1">
                  {questions.map((q, idx) => {
                    const answered = isQuestionAnswered(q.id);
                    const isCurrent = idx === currentIdx;
                    return (
                      <button
                        key={q.id}
                        onClick={() => setCurrentIdx(idx)}
                        className={`h-9 rounded-lg font-mono text-xs font-bold transition-all border ${
                          isCurrent
                            ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                            : ""
                        } ${
                          answered
                            ? "bg-emerald-500 text-white border-emerald-600 shadow-sm"
                            : "bg-muted/40 text-muted-foreground border-border/60 hover:bg-muted"
                        }`}
                      >
                        {idx + 1}
                      </button>
                    );
                  })}
                </div>

                <div className="pt-2">
                  <Button
                    onClick={() => setSubmitDialogOpen(true)}
                    className="w-full text-xs font-bold py-5"
                  >
                    Submit Examination
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Feature: Tab-Switch Warning Modal (Warnings 1 & 2) */}
      <Dialog open={tabWarningLevel !== null} onOpenChange={() => setTabWarningLevel(null)}>
        <DialogContent className="sm:max-w-md bg-white border border-stone-200 shadow-xl">
          <DialogHeader>
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-2 mx-auto ${
              tabWarningLevel === 2 ? "bg-destructive/15 text-destructive" : "bg-amber-500/15 text-amber-600"
            }`}>
              <AlertTriangle className="w-6 h-6 animate-pulse" />
            </div>
            <DialogTitle className="text-center font-bold text-base text-foreground">
              {tabWarningLevel === 1
                ? "Warning (1/3): Tab Switch Detected"
                : "🚨 FINAL WARNING (2/3): Tab Switch Detected"}
            </DialogTitle>
            <DialogDescription className="text-center text-xs text-muted-foreground pt-1.5 leading-relaxed">
              {tabWarningLevel === 1 ? (
                <>
                  Focus left this examination window (Incident 1 of 3).
                  <br />
                  <span className="text-foreground font-semibold">
                    If you open or switch tabs 2 times, you will get a final warning. On the 3rd tab switch, the exam will stop immediately.
                  </span>
                </>
              ) : (
                <>
                  <span className="text-destructive font-bold">
                    You have switched tabs 2 times! This is your FINAL warning.
                  </span>
                  <br />
                  If you open tabs or navigate away one more time (3rd incident), your examination will immediately stop and lock! You will be required to request permission from your instructor's dashboard to continue.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              className={tabWarningLevel === 2 ? "w-full bg-destructive hover:bg-destructive/90 text-white font-bold h-10" : "w-full font-bold h-10"}
              onClick={() => setTabWarningLevel(null)}
            >
              {tabWarningLevel === 1 ? "I Understand & Return to Exam" : "I Understand (Final Warning) - Return to Exam"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Submit Confirmation Dialog */}
      <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Final Examination Submission</DialogTitle>
            <DialogDescription className="text-xs pt-1">
              Please review your assessment summary before finalizing your submission. Once submitted, answers are permanently sealed.
            </DialogDescription>
          </DialogHeader>

          <div className="p-4 rounded-xl bg-muted/40 border border-border/50 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Questions:</span>
              <span className="font-bold text-foreground">{totalQuestions}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Answered Questions:</span>
              <span className="font-bold text-emerald-500">{answeredCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Unanswered Questions:</span>
              <span className="font-bold text-amber-500">{unansweredCount}</span>
            </div>
            {unansweredCount > 0 && (
              <p className="text-[11px] text-amber-500 pt-1">
                ⚠️ You have {unansweredCount} unanswered question(s). You can still return to complete them before submitting.
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSubmitDialogOpen(false)}
              disabled={isSubmitting}
            >
              Return to Exam
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleFinalSubmit}
              disabled={isSubmitting}
              className="font-bold bg-emerald-600 hover:bg-emerald-700"
            >
              {isSubmitting ? "Sealing Answers..." : "Yes, Submit Exam"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WebRTC Live Screen & Camera Sharing Consent & Indicator */}
      <StudentScreenShareModal
        incomingRequest={incomingRequest}
        isSharing={isSharing}
        isCameraActive={isCameraActive}
        onAccept={handleAcceptIncomingStreamRequest}
        onReject={rejectScreenShare}
        onStop={() => {
          stopScreenShare();
          stopCameraShare();
        }}
        onToggleCamera={() => {
          if (isCameraActive) {
            stopCameraShare();
          } else {
            startCameraStream();
          }
        }}
        isMobile={isMobile}
      />
    </div>
  );
};

export default StudentExamView;
