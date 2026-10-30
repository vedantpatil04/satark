import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { classroomsApi, Classroom } from "@/api/classrooms";
import { BookOpen, Plus, Users, KeyRound, Loader2, CheckCircle2, LogOut, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger
} from "@/components/ui/dialog";
import { toast } from "sonner";

export const StudentClassrooms: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [classroomToLeave, setClassroomToLeave] = useState<Classroom | null>(null);

  const loadClassrooms = async () => {
    try {
      const data = await classroomsApi.list();
      setClassrooms(data);
    } catch {
      toast.error("Failed to load enrolled classes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClassrooms();
    // Check if join code passed in URL from QR scanner
    const urlCode = searchParams.get("code");
    if (urlCode) {
      setJoinCode(urlCode.toUpperCase());
      setDialogOpen(true);
    }
  }, [searchParams]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setJoining(true);

    try {
      const joined = await classroomsApi.join(joinCode.trim().toUpperCase());
      toast.success(`Successfully enrolled in "${joined.title}"!`);
      setJoinCode("");
      setDialogOpen(false);
      loadClassrooms();
    } catch (err: any) {
      toast.error(err.message || "Failed to join classroom. Check the code.");
    } finally {
      setJoining(false);
    }
  };

  const handleConfirmLeave = async () => {
    if (!classroomToLeave) return;
    try {
      await classroomsApi.leave(classroomToLeave.id);
      toast.success(`Unenrolled from "${classroomToLeave.title}"`);
      setClassroomToLeave(null);
      loadClassrooms();
    } catch (err: any) {
      toast.error(err.message || "Failed to leave classroom");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        <p className="text-sm text-muted-foreground font-medium">Fetching course enrollments...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Enrolled Classrooms</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Your connected academic cohorts. Enter a course PIN or scan a QR code to join a new division.
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2 font-bold bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4" /> Join Classroom
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Enroll via Course Code or QR</DialogTitle>
              <DialogDescription className="text-xs">
                Enter the 6-character PIN provided by your professor or scanned from a classroom QR code.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleJoin} className="space-y-4 pt-2">
              <div>
                <Label htmlFor="pin">Classroom Join Code *</Label>
                <div className="relative mt-1">
                  <KeyRound className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
                  <Input
                    id="pin"
                    placeholder="e.g. A8F9B2"
                    className="pl-9 font-mono tracking-widest uppercase font-bold"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    maxLength={10}
                    required
                  />
                </div>
              </div>

              <Button type="submit" disabled={joining} className="w-full font-bold bg-emerald-600 hover:bg-emerald-700">
                {joining ? "Enrolling..." : "Join Course"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {classrooms.length === 0 ? (
        <Card className="glass-card text-center py-16">
          <CardContent className="flex flex-col items-center gap-3">
            <div className="p-3.5 rounded-full bg-emerald-500/10 text-emerald-500">
              <BookOpen className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-foreground">No Enrolled Courses</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              You haven't joined any classrooms yet. Click "Join Classroom" to enter your professor's invite PIN.
            </p>
            <Button onClick={() => setDialogOpen(true)} className="mt-2 font-bold bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4 mr-1" /> Enter Join PIN
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {classrooms.map((c) => (
            <Card key={c.id} className="glass-card hover:border-emerald-500/40 transition-all flex flex-col justify-between">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    {c.subject_code && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded">
                        {c.subject_code}
                      </span>
                    )}
                    <CardTitle className="text-lg font-bold text-foreground mt-1.5">{c.title}</CardTitle>
                  </div>
                  <span className="text-[10px] uppercase font-bold text-emerald-500 flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded">
                    <CheckCircle2 className="w-3 h-3" /> Enrolled
                  </span>
                </div>
                {c.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{c.description}</p>
                )}
              </CardHeader>

              <CardContent className="space-y-3 pt-0">
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/40">
                  <span className="font-mono text-[11px]">PIN: {c.join_code}</span>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" /> {c.enrolled_count || 1} Peers
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setClassroomToLeave(c)}
                      className="h-7 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 px-2"
                    >
                      <LogOut className="w-3 h-3 mr-1" /> Leave
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Leave Classroom Confirmation Dialog */}
      <Dialog open={!!classroomToLeave} onOpenChange={() => setClassroomToLeave(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5" /> Leave Classroom Confirmation
            </DialogTitle>
            <DialogDescription className="text-xs">
              Are you sure you want to unenroll from <strong>{classroomToLeave?.title}</strong>? You will lose access to active exams scheduled under this cohort until re-enrolled.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setClassroomToLeave(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmLeave}>
              Confirm Leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
