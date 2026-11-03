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
  AlertCircle,
  Copy,
  Check,
  Radio,
  Eye,
  Calendar,
  Layers
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

export const TeacherExams: React.FC = () => {
  const [exams, setExams] = useState<ExamSession[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "active" | "scheduled" | "ended">("all");

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
      setExams(Array.isArray(exmData) ? exmData : []);
      setClassrooms(Array.isArray(clsData) ? clsData : []);
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

  const handleCopy = (code: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success(`PIN ${code} copied to clipboard`);
    setTimeout(() => setCopiedCode(null), 2000);
  };

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
      toast.success("Exam started! Candidates can now sit for the assessment.");
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
    if (!window.confirm("Are you sure you want to end this examination? This will finalize candidate submissions.")) return;
    try {
      await examsApi.end(id);
      toast.success("Examination finalized and sealed.");
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to end exam");
    }
  };

  const filteredExams = exams.filter((ex) => {
    if (activeTab === "all") return true;
    return ex.status === activeTab;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#D97706]" />
        <p className="text-xs text-stone-500 font-medium">Loading examination schedules...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-8">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Examinations
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Create assessment sessions, supervise candidate live streams, and enforce integrity policies.
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
            <Button className="bg-[#D97706] hover:bg-[#B45309] text-white font-bold text-xs rounded-xl h-9 px-4 shadow-xs flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> Create Examination
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg rounded-3xl bg-white">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-slate-900">Configure Examination</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 pt-2">
              <div>
                <Label htmlFor="classroom" className="block text-xs font-semibold text-slate-700 mb-1">
                  Target Classroom Cohort *
                </Label>
                {classrooms.length === 0 ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                      <span>No classroom cohorts found. Please create a class first.</span>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setDialogOpen(false);
                        navigate("/classrooms");
                      }}
                      className="text-xs h-7 px-2 border-amber-300 rounded-lg"
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
                      className="w-full h-9 rounded-xl border border-stone-200 bg-stone-50 px-3 text-xs text-slate-800 outline-none focus:ring-1 focus:ring-[#D97706]"
                    >
                      <option value="" disabled>Select enrolled classroom</option>
                      {classrooms.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title} ({c.join_code})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="examTitle" className="text-xs font-semibold text-slate-700">Exam Title *</Label>
                <Input
                  id="examTitle"
                  placeholder="e.g. Midterm Algorithms Assessment"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  className="rounded-xl h-9 text-xs mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="duration" className="text-xs font-semibold text-slate-700">Duration (Minutes)</Label>
                  <Input
                    id="duration"
                    type="number"
                    min={5}
                    max={360}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    required
                    className="rounded-xl h-9 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="pin" className="text-xs font-semibold text-slate-700">Custom PIN (Optional)</Label>
                  <Input
                    id="pin"
                    placeholder="Auto-generated if empty"
                    value={examPin}
                    onChange={(e) => setExamPin(e.target.value)}
                    className="rounded-xl h-9 text-xs mt-1 font-mono uppercase"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="examDesc" className="text-xs font-semibold text-slate-700">Instructions / Notes</Label>
                <Textarea
                  id="examDesc"
                  placeholder="Closed-book guidelines, permitted references..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="rounded-xl text-xs mt-1"
                  rows={2}
                />
              </div>

              {/* Policy Settings */}
              <div className="p-3.5 rounded-2xl bg-[#FFF9F2] border border-amber-200/80 space-y-2">
                <span className="text-xs font-bold text-slate-800 block">Proctoring Rules</span>
                <label className="flex items-center gap-2 text-xs text-stone-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={disallowBlur}
                    onChange={(e) => setDisallowBlur(e.target.checked)}
                    className="rounded text-[#D97706]"
                  />
                  <span>Trigger Alert on Window Switch / Focus Loss</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-stone-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={disallowMultiDisplay}
                    onChange={(e) => setDisallowMultiDisplay(e.target.checked)}
                    className="rounded text-[#D97706]"
                  />
                  <span>Flag Multi-Monitor / Secondary Display Connections</span>
                </label>
              </div>

              <Button
                type="submit"
                disabled={creating}
                className="w-full bg-[#D97706] hover:bg-[#B45309] text-white font-bold text-xs rounded-xl h-9"
              >
                {creating ? "Scheduling Exam..." : "Create & Launch Assessment"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabs Filter Bar */}
      <div className="flex items-center gap-2 border-b border-stone-200/80 pb-3">
        {[
          { key: "all", label: `All (${exams.length})` },
          { key: "active", label: `Active (${exams.filter((e) => e.status === "active").length})` },
          { key: "scheduled", label: `Scheduled (${exams.filter((e) => e.status === "scheduled").length})` },
          { key: "ended", label: `Ended (${exams.filter((e) => e.status === "ended").length})` },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
              activeTab === tab.key
                ? "bg-[#D97706] text-white shadow-xs"
                : "text-stone-500 hover:text-slate-800 hover:bg-stone-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Examinations Cards Grid */}
      {filteredExams.length === 0 ? (
        <div className="rounded-3xl bg-white border border-stone-200/80 p-12 text-center text-stone-400">
          <FileCheck className="w-10 h-10 mx-auto mb-2 opacity-30 text-stone-400" />
          <h3 className="text-sm font-bold text-slate-800">No Examinations Found</h3>
          <p className="text-xs text-stone-400 mt-1 max-w-sm mx-auto">
            Create an examination to distribute security PINs and conduct live proctoring.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredExams.map((ex) => (
            <div
              key={ex.id}
              onClick={() => navigate(`/exams/${ex.id}`)}
              className="rounded-2xl bg-white border border-stone-200/80 hover:border-amber-300 hover:shadow-md cursor-pointer transition-all flex flex-col justify-between p-5 shadow-xs"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <Badge
                    variant="outline"
                    className={`capitalize font-bold text-[10px] ${
                      ex.status === "active"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                        : ex.status === "scheduled"
                        ? "bg-amber-50 text-amber-800 border-amber-300"
                        : "bg-stone-100 text-stone-600"
                    }`}
                  >
                    {ex.status}
                  </Badge>

                  {/* 1-click copy PIN */}
                  <button
                    onClick={(e) => handleCopy(ex.exam_code, e)}
                    className="flex items-center gap-1 font-mono text-xs font-bold text-[#D97706] bg-[#FFF2E5] px-2.5 py-0.5 rounded-lg hover:bg-amber-100 transition-colors"
                    title="Click to copy exam PIN"
                  >
                    <span>PIN: {ex.exam_code}</span>
                    {copiedCode === ex.exam_code ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Copy className="w-3 h-3 opacity-60" />
                    )}
                  </button>
                </div>

                <h3 className="text-base font-bold text-slate-900 mt-3 truncate">{ex.title}</h3>
                {ex.description && (
                  <p className="text-xs text-stone-500 line-clamp-2 mt-1">{ex.description}</p>
                )}

                <div className="flex items-center gap-3 text-xs text-stone-500 border-y border-stone-100 py-2.5 my-3">
                  <span className="flex items-center gap-1 font-medium">
                    <Clock className="w-3.5 h-3.5 text-[#D97706]" /> {ex.duration_minutes}m duration
                  </span>
                  <span className="flex items-center gap-1 font-medium">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> AI Monitored
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-1">
                {(ex.status === "draft" || ex.status === "scheduled") && (
                  <Button
                    size="sm"
                    onClick={(e) => handleStart(ex.id, e)}
                    className="w-full font-bold gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-8"
                  >
                    <Play className="w-3 h-3" /> Start Exam
                  </Button>
                )}

                {ex.status === "active" && (
                  <>
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/exams/${ex.id}/live`);
                      }}
                      className="flex-1 font-bold gap-1 text-xs bg-[#D97706] hover:bg-[#B45309] text-white rounded-xl h-8"
                    >
                      <Eye className="w-3 h-3" /> Live Grid
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => handlePause(ex.id, e)}
                      className="font-medium gap-1 text-xs rounded-xl h-8 border-stone-200"
                    >
                      <Pause className="w-3 h-3" /> Pause
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={(e) => handleEnd(ex.id, e)}
                      className="font-semibold gap-1 text-xs rounded-xl h-8 bg-rose-600 hover:bg-rose-700"
                    >
                      <Square className="w-3 h-3" /> End
                    </Button>
                  </>
                )}

                {ex.status === "paused" && (
                  <>
                    <Button
                      size="sm"
                      onClick={(e) => handleResume(ex.id, e)}
                      className="flex-1 font-bold gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-8"
                    >
                      <RotateCcw className="w-3 h-3" /> Resume
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={(e) => handleEnd(ex.id, e)}
                      className="font-semibold gap-1 text-xs rounded-xl h-8 bg-rose-600 hover:bg-rose-700"
                    >
                      <Square className="w-3 h-3" /> End
                    </Button>
                  </>
                )}

                {ex.status === "ended" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/exams/${ex.id}`);
                    }}
                    className="w-full text-xs font-semibold rounded-xl h-8 border-stone-200 bg-stone-50"
                  >
                    View Audit Dossier
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
export default TeacherExams;
