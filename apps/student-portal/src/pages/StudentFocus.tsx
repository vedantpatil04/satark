import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { focusApi, FocusSession } from "@/api/focus";
import { classroomsApi, Classroom } from "@/api/classrooms";
import {
  Brain,
  Play,
  Pause,
  Square,
  Sparkles,
  Camera,
  CheckCircle,
  AlertTriangle,
  History,
  Target,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import FocusDetection from "@/components/FocusDetection";

export const StudentFocus: React.FC = () => {
  const navigate = useNavigate();

  // Active session state
  const [activeSession, setActiveSession] = useState<FocusSession | null>(null);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);

  // Setup form states
  const [goalTitle, setGoalTitle] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(25);
  const [selectedClassroomId, setSelectedClassroomId] = useState<string>("none");
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [enableCamera, setEnableCamera] = useState(true);
  const [audioFeedback, setAudioFeedback] = useState(true);

  // Timer states
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState(25 * 60);
  const [elapsedFocusSeconds, setElapsedFocusSeconds] = useState(0);
  const [elapsedBreakSeconds, setElapsedBreakSeconds] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [distractionCount, setDistractionCount] = useState(0);

  // Completion modal
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [summaryNotes, setSummaryNotes] = useState("");
  const [completedSummary, setCompletedSummary] = useState<{
    goal: string;
    focusMinutes: number;
    score: number;
  } | null>(null);

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load enrolled classrooms and check active session
  useEffect(() => {
    const init = async () => {
      try {
        const [crList, sessions] = await Promise.all([
          classroomsApi.listEnrolled().catch(() => []),
          focusApi.list().catch(() => []),
        ]);
        setClassrooms(crList);

        const current = sessions.find((s) => s.status === "active" || s.status === "paused");
        if (current) {
          setActiveSession(current);
          setIsPaused(current.status === "paused");
          const totalPlannedSec = current.planned_duration_minutes * 60;
          const remaining = Math.max(0, totalPlannedSec - (current.actual_focus_seconds || 0));
          setTimeRemainingSeconds(remaining);
          setElapsedFocusSeconds(current.actual_focus_seconds || 0);
          setElapsedBreakSeconds(current.actual_break_seconds || 0);
          setGoalTitle(current.goal_title);
        }
      } catch (err) {
        console.error("Focus init error:", err);
      } finally {
        setLoadingInitial(false);
      }
    };
    init();
  }, []);

  // Timer loop
  useEffect(() => {
    if (!activeSession) return;

    const timer = setInterval(() => {
      if (!isPaused) {
        setTimeRemainingSeconds((prev) => {
          if (prev <= 1) {
            handleCompleteSession();
            return 0;
          }
          return prev - 1;
        });
        setElapsedFocusSeconds((prev) => prev + 1);
      } else {
        setElapsedBreakSeconds((prev) => prev + 1);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [activeSession, isPaused]);

  // Start a new focus session
  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalTitle.trim()) {
      toast.error("Please enter a focus goal or topic");
      return;
    }

    setStarting(true);
    try {
      const session = await focusApi.start({
        goal_title: goalTitle.trim(),
        planned_duration_minutes: durationMinutes,
        classroom_id: selectedClassroomId === "none" ? undefined : selectedClassroomId,
      });

      setActiveSession(session);
      setIsPaused(false);
      setTimeRemainingSeconds(durationMinutes * 60);
      setElapsedFocusSeconds(0);
      setElapsedBreakSeconds(0);
      setDistractionCount(0);
      toast.success("Focus Mode activated. Stay in the zone!");
    } catch (err: any) {
      toast.error(err.message || "Failed to start focus session");
    } finally {
      setStarting(false);
    }
  };

  // Pause session
  const handlePause = async () => {
    if (!activeSession) return;
    try {
      await focusApi.pause(activeSession.id, 0);
      setIsPaused(true);
      toast.info("Session paused. Take a mindful breath.");
    } catch (err: any) {
      toast.error(err.message || "Failed to pause session");
    }
  };

  // Resume session
  const handleResume = async () => {
    if (!activeSession) return;
    try {
      await focusApi.resume(activeSession.id, 0);
      setIsPaused(false);
      toast.success("Resuming focus. Eyes forward!");
    } catch (err: any) {
      toast.error(err.message || "Failed to resume session");
    }
  };

  // Complete session
  const handleCompleteSession = async () => {
    if (!activeSession || stopping) return;
    setStopping(true);

    try {
      const focusMins = Math.round(elapsedFocusSeconds / 60);
      const calculatedScore = Math.max(40, 100 - distractionCount * 8);

      await focusApi.complete(
        activeSession.id,
        elapsedFocusSeconds,
        elapsedBreakSeconds,
        `Completed: Score ${calculatedScore}% with ${distractionCount} distractions.`
      );

      setCompletedSummary({
        goal: activeSession.goal_title,
        focusMinutes: focusMins || 1,
        score: calculatedScore,
      });
      setShowSummaryModal(true);
      setActiveSession(null);
      toast.success("Outstanding work! Session archived.");
    } catch (err: any) {
      toast.error(err.message || "Failed to finalize focus session");
    } finally {
      setStopping(false);
    }
  };

  // Distraction event from vision detector
  const handleDistractedTooLong = () => {
    setDistractionCount((prev) => prev + 1);
    toast.warning("Distraction detected! Bring your eyes back to your study material.");
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const quickDurations = [15, 25, 45, 60];

  if (loadingInitial) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-medium">Loading Focus Sanctuary...</p>
      </div>
    );
  }

  // -------------------------------------------------------------
  // VIEW: Active Focus Session Running
  // -------------------------------------------------------------
  if (activeSession) {
    const totalPlanned = (activeSession.planned_duration_minutes || 25) * 60;
    const progressPct = Math.min(100, Math.round(((totalPlanned - timeRemainingSeconds) / totalPlanned) * 100));

    return (
      <div ref={containerRef} className="space-y-6 max-w-5xl mx-auto py-2">
        {/* Top Control Bar */}
        <div className="flex items-center justify-between flex-wrap gap-4 p-4 rounded-2xl glass-card border-border/40">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${isPaused ? "bg-amber-500/20 text-amber-400" : "bg-primary/20 text-primary"}`}>
              <Brain className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Focus Session</span>
                <Badge variant={isPaused ? "outline" : "default"} className={isPaused ? "text-amber-400 border-amber-400/40" : "bg-primary/80"}>
                  {isPaused ? "Paused" : "In Flow"}
                </Badge>
              </div>
              <h2 className="text-xl font-bold text-foreground mt-0.5">{activeSession.goal_title}</h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleFullscreen}
              className="gap-1.5 text-xs text-muted-foreground"
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            </Button>

            {isPaused ? (
              <Button size="sm" onClick={handleResume} className="gap-1.5 font-bold bg-emerald-600 hover:bg-emerald-700">
                <Play className="w-4 h-4" />
                Resume Focus
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={handlePause} className="gap-1.5 font-semibold text-amber-500 border-amber-500/30">
                <Pause className="w-4 h-4" />
                Take Break
              </Button>
            )}

            <Button
              size="sm"
              variant="destructive"
              onClick={handleCompleteSession}
              disabled={stopping}
              className="gap-1.5 font-bold"
            >
              {stopping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
              End Session
            </Button>
          </div>
        </div>

        {/* Central Display */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Countdown Display */}
          <Card className="lg:col-span-2 glass-card border-border/40 flex flex-col justify-between p-8 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-purple-500 to-pink-500" />

            <div className="space-y-2">
              <Badge variant="secondary" className="px-3 py-1 font-mono text-xs uppercase tracking-wider">
                {isPaused ? "Break Time Elapsed" : "Time Remaining"}
              </Badge>
              <div className="text-7xl sm:text-8xl font-black font-mono tracking-tight text-foreground py-6">
                {isPaused ? formatTime(elapsedBreakSeconds) : formatTime(timeRemainingSeconds)}
              </div>
              <Progress value={progressPct} className="h-3 rounded-full" />
              <div className="flex justify-between text-xs text-muted-foreground font-mono pt-1">
                <span>Elapsed: {formatTime(elapsedFocusSeconds)}</span>
                <span>{progressPct}% Completed</span>
                <span>Goal: {activeSession.planned_duration_minutes}m</span>
              </div>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-3 gap-4 pt-8 mt-6 border-t border-border/40">
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Distractions</p>
                <p className={`text-2xl font-bold font-mono ${distractionCount > 2 ? "text-amber-500" : "text-emerald-500"}`}>
                  {distractionCount}
                </p>
              </div>
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Focus Score</p>
                <p className="text-2xl font-bold font-mono text-primary">
                  {Math.max(40, 100 - distractionCount * 8)}%
                </p>
              </div>
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Break Time</p>
                <p className="text-2xl font-bold font-mono text-muted-foreground">
                  {formatTime(elapsedBreakSeconds)}
                </p>
              </div>
            </div>
          </Card>

          {/* AI Vision Monitor Preview Card */}
          <Card className="glass-card border-border/40 flex flex-col">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Camera className="w-4 h-4 text-primary" />
                  AI Vision Monitor
                </CardTitle>
                <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-400/30">
                  Active
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Real-time head posture & gaze detection.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0 flex-1 flex flex-col justify-center">
              {enableCamera ? (
                <div className="rounded-xl overflow-hidden border border-border/40 bg-black/40">
                  <FocusDetection onDistractedTooLong={handleDistractedTooLong} />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground space-y-2">
                  <Camera className="w-8 h-8 opacity-40" />
                  <p className="text-xs">Webcam monitor disabled by user setting.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // VIEW: Focus Sanctuary Setup & Launch View
  // -------------------------------------------------------------
  return (
    <div className="space-y-8 max-w-4xl mx-auto py-2">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5" />
          AI-Powered Deep Work Sanctuary
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
          Enter Focus Mode
        </h1>
        <p className="text-sm text-muted-foreground max-w-lg mx-auto">
          Block distractions, train your focus stamina with the Pomodoro technique, and verify your productivity with live computer vision.
        </p>
      </div>

      {/* Setup Form */}
      <Card className="glass-card border-border/50 shadow-xl overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-primary via-purple-500 to-pink-500" />
        <CardContent className="p-6 sm:p-8 space-y-6">
          <form onSubmit={handleStart} className="space-y-6">
            {/* Goal Input */}
            <div className="space-y-2">
              <Label htmlFor="goal" className="text-sm font-semibold flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />
                What is your single focus goal for this session?
              </Label>
              <Input
                id="goal"
                placeholder="e.g. Master Linear Algebra Chapter 3, Finish Chemistry Lab Report"
                value={goalTitle}
                onChange={(e) => setGoalTitle(e.target.value)}
                className="text-base py-5"
                required
              />
            </div>

            {/* Duration Selector */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Planned Session Duration</Label>
              <div className="grid grid-cols-4 gap-3">
                {quickDurations.map((mins) => (
                  <Button
                    key={mins}
                    type="button"
                    variant={durationMinutes === mins ? "default" : "outline"}
                    onClick={() => setDurationMinutes(mins)}
                    className="h-14 font-bold flex flex-col gap-0.5 text-center"
                  >
                    <span className="text-lg">{mins}m</span>
                    <span className="text-[10px] font-normal opacity-70">
                      {mins === 25 ? "Pomodoro" : mins === 45 ? "Deep Work" : mins === 60 ? "Hour Block" : "Sprint"}
                    </span>
                  </Button>
                ))}
              </div>
            </div>

            {/* Optional Classroom Tag */}
            <div className="space-y-2">
              <Label htmlFor="classroom" className="text-sm font-semibold">
                Link to Course (Optional)
              </Label>
              <Select value={selectedClassroomId} onValueChange={setSelectedClassroomId}>
                <SelectTrigger id="classroom">
                  <SelectValue placeholder="Select course..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Independent Study (No Course)</SelectItem>
                  {classrooms.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* AI Vision & Audio Features */}
            <div className="p-4 rounded-xl border border-border/40 bg-muted/20 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="camera-toggle" className="text-sm font-semibold flex items-center gap-2 cursor-pointer">
                    <Camera className="w-4 h-4 text-primary" />
                    AI Vision Distraction Guard
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Uses local camera feed and OpenCV to detect gaze drift and remind you to stay focused.
                  </p>
                </div>
                <Switch
                  id="camera-toggle"
                  checked={enableCamera}
                  onCheckedChange={setEnableCamera}
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border/30">
                <div className="space-y-0.5">
                  <Label htmlFor="audio-toggle" className="text-sm font-semibold flex items-center gap-2 cursor-pointer">
                    {audioFeedback ? <Volume2 className="w-4 h-4 text-primary" /> : <VolumeX className="w-4 h-4 text-muted-foreground" />}
                    Auditory Gentle Nudges
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Gentle chime when drifting from focus for longer than 5 seconds.
                  </p>
                </div>
                <Switch
                  id="audio-toggle"
                  checked={audioFeedback}
                  onCheckedChange={setAudioFeedback}
                />
              </div>
            </div>

            {/* Launch Button */}
            <div className="pt-2 flex flex-col sm:flex-row items-center gap-4">
              <Button
                type="submit"
                size="lg"
                disabled={starting || !goalTitle.trim()}
                className="w-full sm:flex-1 h-12 text-base font-bold gap-2 shadow-lg shadow-primary/25"
              >
                {starting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Initializing Session...
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 fill-current" />
                    Begin {durationMinutes}-Minute Focus Session
                  </>
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => navigate("/student/history")}
                className="w-full sm:w-auto h-12 gap-2 text-sm font-semibold"
              >
                <History className="w-4 h-4" />
                Session History
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Completion Modal */}
      <Dialog open={showSummaryModal} onOpenChange={setShowSummaryModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-center sm:text-left">
            <div className="mx-auto sm:mx-0 w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-2">
              <CheckCircle className="w-6 h-6" />
            </div>
            <DialogTitle className="text-xl font-bold">Focus Session Complete!</DialogTitle>
            <DialogDescription>
              Great achievement! Your focus data has been securely synchronized with your study ledger.
            </DialogDescription>
          </DialogHeader>

          {completedSummary && (
            <div className="p-4 rounded-xl bg-muted/40 border border-border/40 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Goal:</span>
                <span className="font-semibold text-foreground text-right">{completedSummary.goal}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Focus Duration:</span>
                <span className="font-bold font-mono text-foreground">{completedSummary.focusMinutes} Minutes</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Focus Stamina Score:</span>
                <span className="font-bold font-mono text-primary">{completedSummary.score}%</span>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setShowSummaryModal(false);
                navigate("/student/history");
              }}
            >
              View All History
            </Button>
            <Button
              onClick={() => {
                setShowSummaryModal(false);
                setGoalTitle("");
              }}
              className="font-bold"
            >
              Start Another
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
