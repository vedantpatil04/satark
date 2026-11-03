import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { classroomsApi, Classroom } from "@/api/classrooms";
import { Plus, Users, Copy, Check, BookOpen, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

export const TeacherClassrooms: React.FC = () => {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [subjectCode, setSubjectCode] = useState("");
  const [description, setDescription] = useState("");

  const navigate = useNavigate();

  const loadClassrooms = async () => {
    try {
      const data = await classroomsApi.list();
      setClassrooms(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load classrooms");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClassrooms();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);

    try {
      const created = await classroomsApi.create({
        title: title.trim(),
        subject_code: subjectCode.trim() || undefined,
        description: description.trim() || undefined,
      });
      toast.success(`Classroom created! Join Code: ${created.join_code}`);
      setDialogOpen(false);
      setTitle("");
      setSubjectCode("");
      setDescription("");
      loadClassrooms();
    } catch (err: any) {
      toast.error(err.message || "Failed to create classroom");
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success(`Copied join code: ${code}`);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#D97706]" />
        <p className="text-xs text-stone-500 font-medium">Loading classrooms...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">Classroom Cohorts</h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Manage course divisions, student rosters, and distribute student join codes.
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#D97706] hover:bg-[#B45309] text-white font-bold text-xs rounded-xl h-9 px-4 shadow-xs flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> Create Classroom
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md rounded-3xl bg-white">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-slate-900">Create New Classroom</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 pt-2">
              <div>
                <Label htmlFor="title" className="text-xs font-semibold text-slate-700">Class Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g. Distributed Systems Lab"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  className="rounded-xl h-9 text-xs mt-1"
                />
              </div>
              <div>
                <Label htmlFor="code" className="text-xs font-semibold text-slate-700">Subject / Course Code</Label>
                <Input
                  id="code"
                  placeholder="e.g. CS-402"
                  value={subjectCode}
                  onChange={(e) => setSubjectCode(e.target.value)}
                  className="rounded-xl h-9 text-xs mt-1 font-mono uppercase"
                />
              </div>
              <div>
                <Label htmlFor="desc" className="text-xs font-semibold text-slate-700">Description</Label>
                <Textarea
                  id="desc"
                  placeholder="Optional section details or lab room..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="rounded-xl text-xs mt-1"
                  rows={2}
                />
              </div>
              <Button type="submit" disabled={creating} className="w-full bg-[#D97706] hover:bg-[#B45309] text-white font-bold text-xs rounded-xl h-9">
                {creating ? "Creating..." : "Save & Generate Join Code"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {classrooms.length === 0 ? (
        <div className="rounded-3xl bg-white border border-stone-200/80 p-12 text-center text-stone-400">
          <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-30 text-stone-400" />
          <h3 className="text-sm font-bold text-slate-800">No Classrooms Yet</h3>
          <p className="text-xs text-stone-400 mt-1 max-w-sm mx-auto">
            Create your first classroom cohort to invite students, administer proctored exams, and supervise sessions.
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
                </div>
                {c.description && (
                  <p className="text-xs text-stone-500 line-clamp-2 mt-1">{c.description}</p>
                )}
              </div>

              <div className="space-y-3 pt-4">
                {/* Join Code Box */}
                <div className="p-3 rounded-xl bg-[#FFF9F2] border border-amber-200 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-stone-500 block">Student Join PIN</span>
                    <span className="font-mono text-base font-black text-[#D97706] tracking-widest">{c.join_code}</span>
                  </div>
                  <button
                    onClick={() => handleCopy(c.join_code)}
                    className="p-1.5 rounded-lg hover:bg-amber-100 text-[#D97706] transition-colors"
                    title="Copy Join Code"
                  >
                    {copiedCode === c.join_code ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs text-stone-500 pt-1">
                  <span className="flex items-center gap-1 font-semibold text-slate-700">
                    <Users className="w-3.5 h-3.5 text-[#D97706]" /> {c.enrolled_count || 0} Enrolled
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/classrooms/${c.id}`)}
                    className="text-xs font-semibold rounded-xl h-8 border-stone-200 hover:bg-stone-50"
                  >
                    View Roster
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
export default TeacherClassrooms;
