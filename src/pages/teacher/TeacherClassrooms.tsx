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
      setClassrooms(data);
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
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-medium">Loading classrooms...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Classroom Cohorts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage course divisions, student rosters, and distribute student join codes.
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2 font-bold">
              <Plus className="w-4 h-4" /> Create Classroom
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Classroom</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 pt-2">
              <div>
                <Label htmlFor="title">Class Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g. Distributed Systems Lab"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="code">Subject / Course Code</Label>
                <Input
                  id="code"
                  placeholder="e.g. CS-402"
                  value={subjectCode}
                  onChange={(e) => setSubjectCode(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="desc">Description</Label>
                <Textarea
                  id="desc"
                  placeholder="Optional section details or lab room..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={creating} className="w-full font-bold">
                {creating ? "Creating..." : "Save & Generate Join Code"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {classrooms.length === 0 ? (
        <Card className="glass-card text-center py-12">
          <CardContent className="flex flex-col items-center gap-3">
            <div className="p-3 rounded-full bg-primary/10 text-primary">
              <BookOpen className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-foreground">No Classrooms Yet</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Create your first classroom cohort to invite students, administer proctored exams, and supervise study sessions.
            </p>
            <Button onClick={() => setDialogOpen(true)} className="mt-2 font-bold">
              <Plus className="w-4 h-4 mr-1" /> Create First Classroom
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {classrooms.map((c) => (
            <Card
              key={c.id}
              className="glass-card hover:border-primary/40 transition-all flex flex-col justify-between"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    {c.subject_code && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded">
                        {c.subject_code}
                      </span>
                    )}
                    <CardTitle className="text-lg font-bold text-foreground mt-1.5">{c.title}</CardTitle>
                  </div>
                </div>
                {c.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{c.description}</p>
                )}
              </CardHeader>

              <CardContent className="space-y-4 pt-0">
                {/* Join Code Box */}
                <div className="p-3 rounded-lg bg-muted/50 border border-border/50 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">Student Join PIN</span>
                    <span className="font-mono text-base font-bold text-primary tracking-widest">{c.join_code}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleCopy(c.join_code)}
                    className="h-8 w-8 p-0"
                    title="Copy Join Code"
                  >
                    {copiedCode === c.join_code ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                  </Button>
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                  <span className="flex items-center gap-1 font-medium">
                    <Users className="w-3.5 h-3.5" /> {c.enrolled_count || 0} Enrolled
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/teacher/classrooms/${c.id}`)}
                    className="text-xs font-semibold"
                  >
                    View Roster
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
