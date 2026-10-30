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
  AlertCircle
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
  DialogFooter
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useRealtimeSocket } from "@/hooks/useRealtimeSocket";

export const StudentExamView: React.FC = () => {
  const { id, examId } = useParams<{ id?: string; examId?: string }>();
  const effectiveExamId = examId || id;
  const navigate = useNavigate();

  const [exam, setExam] = useState<ExamSession | null>(null);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const [currentIdx, setCurrentIdx] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number>(3600);

  // Submission State
  const [submission, setSubmission] = useState<ExamSubmission | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);

  // Tab-Switch Monitoring State (Feature 2)
  const [tabSwitchCount, setTabSwitchCount] = useState<number>(0);
  const [showTabWarning, setShowTabWarning] = useState<boolean>(false);
  const lastTabSwitchTime = useRef<number>(0);

  // Fetch initial exam, questions, existing answers & submission status
  const loadExamWorkspace = useCallback(async () => {
    if (!effectiveExamId) return;
    try {
      const [exmData, qData, ansData, subData] = await Promise.all([
        examsApi.get(effectiveExamId),
        examsApi.getQuestions(effectiveExamId).catch(() => []),
        examsApi.getAnswers(effectiveExamId).catch(() => []),
        examsApi.getSubmissions(effectiveExamId).catch(() => []),
      ]);

      setExam(exmData);
      setQuestions(qData);
      setTimeLeftSeconds(exmData.duration_minutes * 60);

      // Populate previously saved answers
      const ansMap: Record<string, number | null> = {};
      ansData.forEach((a) => {
        ansMap[a.question_id] = a.selected_option_index;
      });
      setAnswers(ansMap);

      // Check if student already submitted
      if (subData && subData.length > 0) {
        setSubmission(subData[0]);
      }
    } catch (err: any) {
      toast.error("Failed to load examination workspace");
      navigate("/student/exams");
    } finally {
      setLoading(false);
    }
  }, [effectiveExamId, navigate]);

  useEffect(() => {
    loadExamWorkspace();
  }, [loadExamWorkspace]);

  // Real-time socket for proctor time extensions
  useRealtimeSocket({
    channel: "student",
    onMessage: (msg) => {
      if (msg.type === "exam_time_granted" && msg.exam_id === effectiveExamId) {
        const addedMins = msg.additional_minutes || 0;
        setTimeLeftSeconds((prev) => prev + addedMins * 60);
        toast.info(`Time Extended: Proctor granted +${addedMins} additional minutes!`, {
          duration: 6000,
        });
      }
    },
  });

  // Exam countdown timer
  useEffect(() => {
    if (!exam || exam.status !== "active" || submission) return;
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
  }, [exam, submission]);

  // FEATURE 2: Browser Tab-Switch Detection via Page Visibility API
  useEffect(() => {
    if (!effectiveExamId || !exam || exam.status !== "active" || submission) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        const now = Date.now();
        // 3-second debounce to avoid event storms on rapid focus flips
        if (now - lastTabSwitchTime.current > 3000) {
          lastTabSwitchTime.current = now;
          setTabSwitchCount((prev) => {
            const nextCount = prev + 1;
            setShowTabWarning(true);

            // Generate unique event ID
            const eventId = "tab_evt_" + Math.random().toString(36).substring(2, 10) + "_" + now;

            // Dispatch to backend (gracefully handled if offline/slow)
            examsApi.sendTabSwitch(effectiveExamId, {
              event_id: eventId,
              occurred_at: new Date().toISOString(),
              details: {
                reason: "visibility_hidden",
                tab_switch_number: nextCount,
                question_viewed: currentIdx + 1,
              },
            }).catch(() => {});

            return nextCount;
          });
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [effectiveExamId, exam, submission, currentIdx]);

  // Answer selection handler (Optimistic local update + async persistence)
  const handleSelectOption = (questionId: string, optionIdx: number) => {
    if (submission || exam?.status !== "active") return;

    // Optimistically update local state
    setAnswers((prev) => ({
      ...prev,
      [questionId]: optionIdx,
    }));

    // Persist to backend
    if (effectiveExamId) {
      examsApi.saveAnswer(effectiveExamId, {
        question_id: questionId,
        selected_option_index: optionIdx,
      }).catch((err) => {
        console.warn("Failed to auto-save answer:", err);
      });
    }
  };

  // Final Exam Submission Handler
  const handleFinalSubmit = async () => {
    if (!effectiveExamId) return;
    setIsSubmitting(true);
    try {
      const payloadAnswers = Object.entries(answers).map(([qId, optIdx]) => ({
        question_id: qId,
        selected_option_index: optIdx,
      }));

      const subRes = await examsApi.submitExam(effectiveExamId, {
        answers: payloadAnswers,
      });

      setSubmission(subRes);
      setSubmitDialogOpen(false);
      toast.success("Examination submitted successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to submit examination");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTimer = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
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
  const answeredCount = questions.filter((q) => answers[q.id] !== undefined && answers[q.id] !== null).length;
  const unansweredCount = totalQuestions - answeredCount;
  const currentQ = questions[currentIdx];

  // SUBMITTED STATE VIEW
  if (submission) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 pt-6">
        <div className="glass-card p-8 border-t-4 border-t-emerald-500 text-center space-y-4">
          <div className="p-4 w-fit mx-auto rounded-full bg-emerald-500/10 text-emerald-500">
            <CheckCircle2 className="w-12 h-12" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Examination Submitted Successfully</h1>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Your candidate assessment has been recorded and sealed in the academic audit ledger.
          </p>

          <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto p-4 rounded-xl bg-muted/40 border border-border/50 text-left text-xs">
            <div>
              <span className="text-muted-foreground block">Exam:</span>
              <span className="font-semibold text-foreground">{exam.title}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Status:</span>
              <Badge variant="outline" className="text-[10px] uppercase font-bold text-emerald-500 border-emerald-500/40">
                {submission.status}
              </Badge>
            </div>
            <div>
              <span className="text-muted-foreground block">Questions Answered:</span>
              <span className="font-semibold text-foreground">{answeredCount} of {totalQuestions}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Submitted At:</span>
              <span className="font-semibold text-foreground">{new Date(submission.submitted_at).toLocaleTimeString()}</span>
            </div>
          </div>

          <div className="pt-4">
            <Button onClick={() => navigate("/student/exams")} className="font-bold">
              Return to Examinations
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Bar Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => navigate("/student/exams")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Exit Exam Room
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

      {/* Header Info Card */}
      <div className="glass-card p-6 border-l-4 border-l-primary flex flex-col md:flex-row md:items-center justify-between gap-4">
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
          <span className="font-bold">Integrity Supervision Active:</span> Switching tabs or applications is recorded and reported to your invigilator in real time. All selections auto-save immediately.
        </div>
      </div>

      {/* Main Question Interface */}
      {questions.length === 0 ? (
        <Card className="glass-card py-16 text-center">
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
            <Card className="glass-card">
              <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-xs font-bold text-primary border-primary/40">
                    Question {currentIdx + 1} of {totalQuestions}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    {currentQ.marks} {currentQ.marks === 1 ? "Mark" : "Marks"}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground font-medium">
                  {answers[currentQ.id] !== undefined && answers[currentQ.id] !== null ? (
                    <span className="text-emerald-500 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Answer Saved
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

                {/* 4 MCQ Answer Options */}
                <div className="space-y-3">
                  {currentQ.options.map((optText, optIdx) => {
                    const isSelected = answers[currentQ.id] === optIdx;
                    return (
                      <div
                        key={optIdx}
                        onClick={() => handleSelectOption(currentQ.id, optIdx)}
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
            <Card className="glass-card">
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
                    const isAnswered = answers[q.id] !== undefined && answers[q.id] !== null;
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
                          isAnswered
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
    </div>
  );
};
