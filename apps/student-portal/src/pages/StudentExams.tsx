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
      setExams(data);
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
      navigate(`/student/exams/${selectedExam.id}`);
    } catch (err: any) {
      toast.error(err.message || "Invalid exam PIN. Please verify with your proctor.");
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-medium">Loading assigned examinations...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Examinations Portal</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Assessments scheduled for your enrolled classrooms. Enter your proctor's PIN to sit for an exam.
        </p>
      </div>

      {exams.length === 0 ? (
        <Card className="glass-card text-center py-16">
          <CardContent className="flex flex-col items-center gap-3">
            <FileText className="w-10 h-10 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-bold text-foreground">No Examinations Scheduled</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              When instructors create or activate examinations for your classes, they will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {exams.map((ex) => {
            const isActive = ex.status === "active";
            const isEnded = ex.status === "ended";

            return (
              <Card
                key={ex.id}
                className={`glass-card flex flex-col justify-between transition-all ${
                  isActive ? "border-primary/50 shadow-md" : "border-border/40"
                }`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <Badge
                      variant={isActive ? "default" : isEnded ? "outline" : "secondary"}
                      className="capitalize font-bold text-[10px]"
                    >
                      {ex.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
                      <Clock className="w-3.5 h-3.5 text-primary" /> {ex.duration_minutes} mins
                    </span>
                  </div>
                  <CardTitle className="text-lg font-bold text-foreground mt-2">{ex.title}</CardTitle>
                  {ex.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{ex.description}</p>
                  )}
                </CardHeader>

                <CardContent className="space-y-3 pt-0">
                  <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40 text-xs text-muted-foreground flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Integrity policy enforced: visible window telemetry active.</span>
                  </div>

                  <Button
                    onClick={() => {
                      setSelectedExam(ex);
                      setPin("");
                    }}
                    disabled={isEnded}
                    className={`w-full font-bold text-xs gap-1.5 ${
                      isActive ? "bg-primary hover:bg-primary/90" : "bg-muted text-foreground hover:bg-muted/80"
                    }`}
                  >
                    {isEnded ? "Assessment Concluded" : "Enter Exam Room"} <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Enter Exam PIN Dialog */}
      <Dialog open={!!selectedExam} onOpenChange={(open) => !open && setSelectedExam(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enter Examination Room</DialogTitle>
          </DialogHeader>
          {selectedExam && (
            <form onSubmit={handleJoinExam} className="space-y-4 pt-2">
              <div className="p-3 rounded-lg bg-muted/50 border border-border/50 text-xs space-y-1">
                <p className="font-semibold text-foreground">{selectedExam.title}</p>
                <p className="text-muted-foreground">Duration: {selectedExam.duration_minutes} minutes</p>
                <p className="text-[11px] text-amber-500 font-medium pt-1">
                  Notice: By entering this exam, you agree to transparent workstation activity attestation.
                </p>
              </div>

              <div>
                <Label htmlFor="examPin">Proctor PIN Code *</Label>
                <div className="relative mt-1">
                  <KeyRound className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
                  <Input
                    id="examPin"
                    placeholder="Enter exam PIN provided by teacher"
                    className="pl-9 font-mono tracking-widest uppercase font-bold"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.toUpperCase())}
                    maxLength={10}
                    required
                  />
                </div>
              </div>

              <Button type="submit" disabled={joining} className="w-full font-bold">
                {joining ? "Verifying PIN..." : "Confirm & Enter Exam"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

