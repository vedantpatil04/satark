import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { examsApi, ExamSession } from "@/api/exams";
import { classroomsApi, Classroom } from "@/api/classrooms";
import {
  FileCheck,
  Plus,
  Play,
  Pause,
  RotateCcw,
  Square,
  Clock,
  ShieldCheck,
  Loader2,
  ExternalLink,
  ChevronDown,
  AlertCircle
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const TeacherExams: React.FC = () => {
  const [exams, setExams] = useState<ExamSession[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedClassroom, setSelectedClassroom] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [examPin, setExamPin] = useState("");
  const [disallowBlur, setDisallowBlur] = useState(true);
  const [disallowMultiDisplay, setDisallowMultiDisplay] = useState(true);

  const navigate = useNavigate();

  const loadData = async () => {
    try {
      const [exmData, clsData] = await Promise.all([
        examsApi.list(),
        classroomsApi.list(),
      ]);
      setExams(exmData);
      setClassrooms(clsData);
      if (clsData.length > 0) {
        setSelectedClassroom((prev) => prev || clsData[0].id);
      }
    } catch {
      toast.error("Failed to load examinations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !selectedClassroom) {
      toast.error("Please provide an exam title and select a classroom cohort");
      return;
    }
    setCreating(true);

    try {
      const created = await examsApi.create({
        classroom_id: selectedClassroom,
        title: title.trim(),
        description: description.trim() || undefined,
        duration_minutes: Number(durationMinutes),
        exam_code: examPin.trim() || undefined,
        policy_config: {
          disallow_window_blur: disallowBlur,
          disallow_multi_display: disallowMultiDisplay,
        },
      });

      toast.success(`Exam created! Entry PIN: ${created.exam_code}`);
      setDialogOpen(false);
      setTitle("");
      setDescription("");
      setExamPin("");
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to create examination");
    } finally {
      setCreating(false);
    }
  };

  const handleStart = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await examsApi.start(id);
      toast.success("Exam started! Candidates can now sit for the exam.");
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to start exam");
    }
  };

  const handlePause = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await examsApi.pause(id);
      toast.info("Exam paused.");
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to pause exam");
    }
  };

  const handleResume = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await examsApi.resume(id);
      toast.success("Exam resumed.");
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to resume exam");
    }
  };

  const handleEnd = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to end this examination? This will seal candidate records.")) return;
    try {
      await examsApi.end(id);
      toast.success("Examination finalized and sealed.");
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to end exam");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-medium">Loading examination schedules...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Examination Sessions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure integrity rules, supervise active candidate sessions, and monitor proctoring timelines.
          </p>
        </div>

        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (open) {
              loadData();
            }
          }}
        >
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2 font-bold">
              <Plus className="w-4 h-4" /> Create Examination
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Configure Examination</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 pt-2">
              <div>
                <Label htmlFor="classroom" className="block text-sm font-medium mb-1.5">
                  Target Classroom Cohort *
                </Label>
                {classrooms.length === 0 ? (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-500 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>No classroom cohorts found. Please create a classroom first.</span>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setDialogOpen(false);
                        navigate("/teacher/classrooms");
                      }}
                      className="text-xs h-7 px-2 border-amber-500/40 hover:bg-amber-500/20"
                    >
                      Create
                    </Button>
                  </div>
                ) : (
                  <div className="relative">
                    <select
                      id="classroom"
                      value={selectedClassroom}
                      onChange={(e) => setSelectedClassroom(e.target.value)}
                      required
                      className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 appearance-none pr-8 cursor-pointer font-medium"
                    >
                      <option value="" disabled>
                        Select enrolled classroom
                      </option>
                      {classrooms.map((c) => (
                        <option key={c.id} value={c.id} className="bg-popover text-popover-foreground py-1">
                          {c.title} ({c.join_code})
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-muted-foreground">
                      <ChevronDown className="h-4 w-4 opacity-60" />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="examTitle">Exam Title *</Label>
                <Input
                  id="examTitle"
                  placeholder="e.g. Midterm Algorithms Assessment"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="duration">Duration (Minutes)</Label>
                  <Input
                    id="duration"
                    type="number"
                    min={5}
                    max={360}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="pin">Custom PIN (Optional)</Label>
                  <Input
                    id="pin"
                    placeholder="Auto-generated if blank"
                    value={examPin}
                    onChange={(e) => setExamPin(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="examDesc">Instructions / Details</Label>
                <Textarea
                  id="examDesc"
                  placeholder="Closed-book rules, permitted scratchpad, etc..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              {/* Policy Settings */}
              <div className="p-3.5 rounded-lg bg-muted/60 border border-border/50 space-y-2">
                <span className="text-xs font-bold text-foreground block">Automated Integrity Rules</span>
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={disallowBlur}
                    onChange={(e) => setDisallowBlur(e.target.checked)}
                    className="rounded text-primary"
                  />
                  <span>Trigger Alert on Window Switch / Focus Loss</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={disallowMultiDisplay}
                    onChange={(e) => setDisallowMultiDisplay(e.target.checked)}
                    className="rounded text-primary"
                  />
                  <span>Flag Multi-Monitor / Secondary Display Connections</span>
                </label>
              </div>

              <Button type="submit" disabled={creating} className="w-full font-bold">
                {creating ? "Scheduling Exam..." : "Create & Launch Exam Session"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {exams.length === 0 ? (
        <Card className="glass-card text-center py-12">
          <CardContent className="flex flex-col items-center gap-3">
            <div className="p-3 rounded-full bg-primary/10 text-primary">
              <FileCheck className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-foreground">No Examinations Scheduled</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Create an examination session to distribute entry PINs and supervise candidate workstations in real time.
            </p>
            <Button onClick={() => setDialogOpen(true)} className="mt-2 font-bold">
              <Plus className="w-4 h-4 mr-1" /> Schedule Exam
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {exams.map((ex) => (
            <Card
              key={ex.id}
              onClick={() => navigate(`/teacher/exams/${ex.id}`)}
              className="glass-card hover:border-primary/50 cursor-pointer transition-all flex flex-col justify-between"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <Badge
                    variant={ex.status === "active" ? "default" : ex.status === "paused" ? "secondary" : "outline"}
                    className="capitalize font-bold text-[10px]"
                  >
                    {ex.status}
                  </Badge>
                  <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2.5 py-1 rounded">
                    PIN: {ex.exam_code}
                  </span>
                </div>
                <CardTitle className="text-lg font-bold text-foreground mt-2">{ex.title}</CardTitle>
                {ex.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{ex.description}</p>
                )}
              </CardHeader>

              <CardContent className="space-y-4 pt-0">
                <div className="flex items-center gap-4 text-xs text-muted-foreground border-y border-border/40 py-2.5">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Clock className="w-3.5 h-3.5 text-primary" /> {ex.duration_minutes} min duration
                  </span>
                  <span className="flex items-center gap-1.5 font-medium">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> Policy Enforced
                  </span>
                </div>

                {/* Session Action Controls */}
                <div className="flex items-center gap-2 pt-1">
                  {(ex.status === "draft" || ex.status === "scheduled") && (
                    <Button
                      size="sm"
                      onClick={(e) => handleStart(ex.id, e)}
                      className="w-full font-bold gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700"
                    >
                      <Play className="w-3.5 h-3.5" /> Start Exam
                    </Button>
                  )}

                  {ex.status === "active" && (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={(e) => handlePause(ex.id, e)}
                        className="flex-1 font-semibold gap-1 text-xs"
                      >
                        <Pause className="w-3.5 h-3.5" /> Pause
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={(e) => handleEnd(ex.id, e)}
                        className="flex-1 font-semibold gap-1 text-xs"
                      >
                        <Square className="w-3.5 h-3.5" /> End
                      </Button>
                    </>
                  )}

                  {ex.status === "paused" && (
                    <>
                      <Button
                        size="sm"
                        onClick={(e) => handleResume(ex.id, e)}
                        className="flex-1 font-bold gap-1 text-xs bg-emerald-600 hover:bg-emerald-700"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Resume
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={(e) => handleEnd(ex.id, e)}
                        className="flex-1 font-semibold gap-1 text-xs"
                      >
                        <Square className="w-3.5 h-3.5" /> End
                      </Button>
                    </>
                  )}

                  {ex.status === "ended" && (
                    <Button size="sm" variant="outline" disabled className="w-full text-xs font-semibold">
                      Exam Concluded & Sealed
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
