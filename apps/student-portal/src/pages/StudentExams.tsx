import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { examsApi, ExamSession } from "@/api/exams";
import { FileText, KeyRound, Clock, ShieldCheck, Loader2, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

export const StudentExams: React.FC = () => {
  const [exams, setExams] = useState<ExamSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExam, setSelectedExam] = useState<ExamSession | null>(null);
  const [pin, setPin] = useState("");
  const [joining, setJoining] = useState(false);
  const navigate = useNavigate();

  const loadExams = async () => {
    try {
      const data = await examsApi.list();
      setExams(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load examinations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExams();
  }, []);

  const handleJoinExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExam || !pin.trim()) return;
    setJoining(true);

    try {
      await examsApi.join(selectedExam.id, pin.trim().toUpperCase());
      toast.success("Exam PIN verified! Entering assessment environment...");
      setSelectedExam(null);
      navigate(`/exams/${selectedExam.id}`);
    } catch (err: any) {
      toast.error(err.message || "Invalid exam PIN. Please verify with your proctor.");
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#D97706]" />
        <p className="text-xs text-stone-500 font-medium">Loading assigned examinations...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-8">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
          Examinations Portal
        </h1>
        <p className="text-xs text-stone-500 mt-0.5">
          Assessments scheduled for your enrolled classrooms. Enter your proctor's PIN to sit for an exam.
        </p>
      </div>

      {exams.length === 0 ? (
        <div className="rounded-3xl bg-white border border-stone-200/80 p-12 text-center text-stone-400">
          <FileText className="w-10 h-10 mx-auto mb-2 opacity-30 text-stone-400" />
          <h3 className="text-sm font-bold text-slate-800">No Examinations Scheduled</h3>
          <p className="text-xs text-stone-400 mt-1 max-w-sm mx-auto">
            When instructors create or activate examinations for your classes, they will appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {exams.map((ex) => {
            const isActive = ex.status === "active";
            const isEnded = ex.status === "ended";

            return (
              <div
                key={ex.id}
                className={`rounded-2xl bg-white border transition-all flex flex-col justify-between p-5 shadow-xs ${
                  isActive
                    ? "border-amber-300 ring-1 ring-amber-300/40 hover:shadow-md"
                    : "border-stone-200/80 hover:border-stone-300"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <Badge
                      variant="outline"
                      className={`capitalize font-bold text-[10px] ${
                        isActive
                          ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                          : isEnded
                          ? "bg-stone-100 text-stone-500 border-stone-200"
                          : "bg-amber-50 text-amber-800 border-amber-300"
                      }`}
                    >
                      {ex.status}
                    </Badge>
                    <span className="text-xs text-stone-500 flex items-center gap-1 font-medium">
                      <Clock className="w-3.5 h-3.5 text-[#D97706]" /> {ex.duration_minutes} mins
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-slate-900 mt-3 truncate">{ex.title}</h3>
                  {ex.description && (
                    <p className="text-xs text-stone-500 line-clamp-2 mt-1">{ex.description}</p>
                  )}
                </div>

                <div className="space-y-3 pt-4">
                  <div className="p-2.5 rounded-xl bg-[#FFF9F2] border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="text-[11px]">Proctored assessment: active tab supervision enabled.</span>
                  </div>

                  {ex.is_results_published ? (
                    <Button
                      onClick={() => navigate(`/exams/${ex.id}`)}
                      className="w-full font-bold text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-9 shadow-xs"
                    >
                      <FileText className="w-3.5 h-3.5" /> View Results & Download PDF
                    </Button>
                  ) : isEnded ? (
                    <Button
                      onClick={() => navigate(`/exams/${ex.id}`)}
                      variant="outline"
                      className="w-full font-bold text-xs gap-1.5 text-stone-600 hover:text-slate-900 border-stone-200 rounded-xl h-9"
                    >
                      View Submission (Results Pending)
                    </Button>
                  ) : (
                    <Button
                      onClick={() => {
                        setSelectedExam(ex);
                        setPin("");
                      }}
                      className={`w-full font-bold text-xs gap-1.5 rounded-xl h-9 shadow-xs ${
                        isActive
                          ? "bg-[#D97706] hover:bg-[#B45309] text-white"
                          : "bg-stone-100 text-slate-700 hover:bg-stone-200"
                      }`}
                    >
                      Enter Exam Room <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Enter Exam PIN Dialog */}
      <Dialog open={!!selectedExam} onOpenChange={(open) => !open && setSelectedExam(null)}>
        <DialogContent className="sm:max-w-md rounded-3xl bg-white">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">Enter Examination Room</DialogTitle>
          </DialogHeader>
          {selectedExam && (
            <form onSubmit={handleJoinExam} className="space-y-4 pt-2">
              <div className="p-3 rounded-2xl bg-[#FAF9F5] border border-stone-200/60 text-xs space-y-1">
                <p className="font-bold text-slate-800">{selectedExam.title}</p>
                <p className="text-stone-500">Duration: {selectedExam.duration_minutes} minutes</p>
                <p className="text-[11px] text-[#D97706] font-medium pt-1">
                  Notice: By entering this exam, you agree to transparent workstation activity attestation.
                </p>
              </div>

              <div>
                <Label htmlFor="examPin" className="text-xs font-semibold text-slate-700">Proctor PIN Code *</Label>
                <div className="relative mt-1">
                  <KeyRound className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                  <Input
                    id="examPin"
                    placeholder="Enter exam PIN provided by teacher"
                    className="pl-9 font-mono tracking-widest uppercase font-bold rounded-xl h-10 text-sm"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.toUpperCase())}
                    maxLength={10}
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={joining}
                className="w-full bg-[#D97706] hover:bg-[#B45309] text-white font-bold text-xs rounded-xl h-10"
              >
                {joining ? "Verifying PIN..." : "Confirm & Enter Exam"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StudentExams;
