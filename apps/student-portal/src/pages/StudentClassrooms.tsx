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
      setClassrooms(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load enrolled classes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClassrooms();
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
        <Loader2 className="w-8 h-8 animate-spin text-[#D97706]" />
        <p className="text-xs text-stone-500 font-medium">Fetching course enrollments...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            My Courses & Classrooms
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Your connected academic cohorts. Enter a course PIN to join a new division.
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#D97706] hover:bg-[#B45309] text-white font-bold text-xs rounded-xl h-9 px-4 shadow-xs flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> Join Classroom
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md rounded-3xl bg-white">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-slate-900">Enroll with Course PIN</DialogTitle>
              <DialogDescription className="text-xs text-stone-500">
                Enter the join PIN provided by your professor or course instructor.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleJoin} className="space-y-4 pt-2">
              <div>
                <Label htmlFor="pin" className="text-xs font-semibold text-slate-700">Classroom Join Code *</Label>
                <div className="relative mt-1">
                  <KeyRound className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                  <Input
                    id="pin"
                    placeholder="e.g. A8F9B2"
                    className="pl-9 font-mono tracking-widest uppercase font-bold rounded-xl h-10 text-sm"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
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
                {joining ? "Enrolling..." : "Join Course"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {classrooms.length === 0 ? (
        <div className="rounded-3xl bg-white border border-stone-200/80 p-12 text-center text-stone-400">
          <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-30 text-stone-400" />
          <h3 className="text-sm font-bold text-slate-800">No Enrolled Courses</h3>
          <p className="text-xs text-stone-400 mt-1 max-w-sm mx-auto">
            You haven't joined any classrooms yet. Click "Join Classroom" to enter your professor's PIN.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {classrooms.map((c) => (
            <div
              key={c.id}
              className="rounded-2xl bg-white border border-stone-200/80 hover:border-amber-300 hover:shadow-md transition-all flex flex-col justify-between p-5 shadow-xs"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    {c.subject_code && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#D97706] bg-[#FFF2E5] px-2 py-0.5 rounded-md font-mono">
                        {c.subject_code}
                      </span>
                    )}
                    <h3 className="text-base font-bold text-slate-900 mt-2">{c.title}</h3>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Enrolled
                  </span>
                </div>
                {c.description && (
                  <p className="text-xs text-stone-500 line-clamp-2 mt-1">{c.description}</p>
                )}
              </div>

              <div className="space-y-3 pt-4">
                <div className="flex items-center justify-between text-xs text-stone-500 pt-2 border-t border-stone-100">
                  <span className="font-mono text-[11px] text-[#D97706] bg-[#FFF9F2] px-2 py-0.5 rounded">
                    Code: {c.join_code}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 font-semibold text-slate-700">
                      <Users className="w-3.5 h-3.5 text-stone-400" /> {c.enrolled_count || 1} Peers
                    </span>
                    <button
                      onClick={() => setClassroomToLeave(c)}
                      className="text-xs text-stone-400 hover:text-rose-600 transition-colors"
                      title="Leave Course"
                    >
                      Leave
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Leave Classroom Confirmation Dialog */}
      <Dialog open={!!classroomToLeave} onOpenChange={() => setClassroomToLeave(null)}>
        <DialogContent className="max-w-md rounded-3xl bg-white">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-rose-600 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" /> Leave Classroom Confirmation
            </DialogTitle>
            <DialogDescription className="text-xs text-stone-500 pt-1">
              Are you sure you want to unenroll from <strong>{classroomToLeave?.title}</strong>? You will lose access to active exams in this class.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-2 border-t border-stone-100">
            <Button variant="outline" size="sm" onClick={() => setClassroomToLeave(null)} className="rounded-xl text-xs">
              Cancel
            </Button>
            <Button size="sm" variant="destructive" onClick={handleConfirmLeave} className="rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700">
              Confirm Leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
export default StudentClassrooms;
