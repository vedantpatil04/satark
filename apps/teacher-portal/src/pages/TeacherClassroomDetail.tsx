import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import { classroomsApi, Classroom, EnrolledStudent } from "@/api/classrooms";
import {
  ArrowLeft,
  Users,
  Copy,
  Check,
  Calendar,
  Mail,
  Loader2,
  UserCheck,
  QrCode,
  Megaphone,
  UserMinus,
  Send,
  AlertCircle
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const TeacherClassroomDetail: React.FC = () => {
  const { id, classroomId } = useParams<{ id?: string; classroomId?: string }>();
  const effectiveClassroomId = classroomId || id;
  const [classroom, setClassroom] = useState<Classroom | null>(null);
  const [students, setStudents] = useState<EnrolledStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();

  // QR Code Modal State
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  // Announcement Modal State
  const [annModalOpen, setAnnModalOpen] = useState(false);
  const [annTitle, setAnnTitle] = useState("");
  const [annMessage, setAnnMessage] = useState("");
  const [annSending, setAnnSending] = useState(false);

  // Student Removal Confirmation
  const [studentToRemove, setStudentToRemove] = useState<EnrolledStudent | null>(null);

  const fetchDetails = async () => {
    if (!effectiveClassroomId) return;
    try {
      const [cls, stuList] = await Promise.all([
        classroomsApi.get(effectiveClassroomId),
        classroomsApi.getEnrolledStudents(effectiveClassroomId),
      ]);
      setClassroom(cls);
      setStudents(stuList);
    } catch (err: any) {
      toast.error("Failed to load classroom roster");
      navigate("/teacher/classrooms");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [effectiveClassroomId]);

  const handleCopy = () => {
    if (classroom) {
      navigator.clipboard.writeText(classroom.join_code);
      setCopied(true);
      toast.success("Join code copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpenQR = async () => {
    if (!classroom) return;
    try {
      const joinUrl = `${window.location.origin}/student/classes?code=${classroom.join_code}`;
      const url = await QRCode.toDataURL(joinUrl, {
        width: 280,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      });
      setQrDataUrl(url);
      setQrModalOpen(true);
    } catch (err) {
      toast.error("Failed to generate QR code");
    }
  };

  const handleSendAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveClassroomId || !annTitle.trim() || !annMessage.trim()) return;
    setAnnSending(true);
    try {
      await classroomsApi.sendAnnouncement(effectiveClassroomId, {
        title: annTitle.trim(),
        message: annMessage.trim(),
      });
      toast.success("Classroom announcement broadcasted to all enrolled students!");
      setAnnModalOpen(false);
      setAnnTitle("");
      setAnnMessage("");
    } catch (err: any) {
      toast.error(err.message || "Failed to broadcast announcement");
    } finally {
      setAnnSending(false);
    }
  };

  const handleConfirmRemoveStudent = async () => {
    if (!effectiveClassroomId || !studentToRemove) return;
    try {
      await classroomsApi.removeStudent(effectiveClassroomId, studentToRemove.student_id);
      toast.success(`Removed ${studentToRemove.full_name} from classroom`);
      setStudentToRemove(null);
      fetchDetails();
    } catch (err: any) {
      toast.error(err.message || "Failed to remove student");
    }
  };

  if (loading || !classroom) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-medium">Fetching enrolled students...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Back button & Title */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate("/teacher/classrooms")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Classrooms
        </Button>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 glass-card">
        <div>
          {classroom.subject_code && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded">
              {classroom.subject_code}
            </span>
          )}
          <h1 className="text-2xl font-bold text-foreground mt-1">{classroom.title}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{classroom.description || "Active division"}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* PIN Card */}
          <div className="flex items-center gap-3 bg-muted/60 p-3 rounded-xl border border-border/50">
            <div>
              <span className="text-[10px] uppercase font-bold text-muted-foreground block">Join PIN Code</span>
              <span className="font-mono text-lg font-bold text-primary tracking-widest">{classroom.join_code}</span>
            </div>
            <Button size="sm" variant="outline" onClick={handleCopy} className="gap-1.5 text-xs">
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>

          {/* QR Code Action */}
          <Button variant="outline" onClick={handleOpenQR} className="gap-1.5 font-semibold text-xs h-11">
            <QrCode className="w-4 h-4 text-primary" /> Show QR
          </Button>

          {/* Broadcast Announcement Action */}
          <Button onClick={() => setAnnModalOpen(true)} className="gap-1.5 font-semibold text-xs h-11 bg-primary hover:bg-primary/90">
            <Megaphone className="w-4 h-4" /> Announcement
          </Button>
        </div>
      </div>

      {/* Enrolled Students Table */}
      <Card className="glass-card">
        <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-border/40">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <CardTitle className="text-base font-bold text-foreground">
              Enrolled Candidates ({students.length})
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {students.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
              <UserCheck className="w-8 h-8 opacity-40" />
              <span>No students enrolled in this cohort yet.</span>
              <p className="text-xs">
                Provide the Join PIN <code className="font-bold text-primary">{classroom.join_code}</code> or display the QR code for students to enroll.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student Name</TableHead>
                    <TableHead>Email Address</TableHead>
                    <TableHead>Student ID</TableHead>
                    <TableHead>Enrolled Date</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((stu) => (
                    <TableRow key={stu.student_id}>
                      <TableCell className="font-semibold text-foreground">{stu.full_name}</TableCell>
                      <TableCell className="text-muted-foreground flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-muted-foreground/70" /> {stu.email}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{stu.student_id ? `${stu.student_id.substring(0, 12)}...` : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(stu.enrolled_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setStudentToRemove(stu)}
                          className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive gap-1"
                        >
                          <UserMinus className="w-3.5 h-3.5" /> Remove
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* QR Code Dialog */}
      <Dialog open={qrModalOpen} onOpenChange={setQrModalOpen}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Classroom QR Code</DialogTitle>
            <DialogDescription className="text-xs">
              Students can scan this QR code with their mobile camera to join immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 flex flex-col items-center justify-center">
            {qrDataUrl && (
              <div className="p-3 bg-white rounded-2xl shadow-md border">
                <img src={qrDataUrl} alt="Classroom Join QR Code" className="w-60 h-60" />
              </div>
            )}
            <div className="mt-4 p-2 bg-muted/60 rounded-lg font-mono text-sm font-bold text-primary">
              PIN: {classroom.join_code}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQrModalOpen(false)} className="w-full">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Broadcast Announcement Dialog */}
      <Dialog open={annModalOpen} onOpenChange={setAnnModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-primary" /> Send Classroom Announcement
            </DialogTitle>
            <DialogDescription className="text-xs">
              This message will be instantly sent to all {students.length} enrolled student(s) via real-time notifications.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSendAnnouncement} className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">Announcement Title</label>
              <Input
                placeholder="e.g. Exam Room Update / Schedule Change"
                value={annTitle}
                onChange={(e) => setAnnTitle(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">Message Content</label>
              <Textarea
                rows={4}
                placeholder="Type your message to the class..."
                value={annMessage}
                onChange={(e) => setAnnMessage(e.target.value)}
                required
              />
            </div>
            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setAnnModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={annSending} className="gap-1.5 font-bold">
                {annSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Broadcast
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Remove Student Confirmation Dialog */}
      <Dialog open={!!studentToRemove} onOpenChange={() => setStudentToRemove(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5" /> Remove Student Confirmation
            </DialogTitle>
            <DialogDescription className="text-xs">
              Are you sure you want to remove <strong>{studentToRemove?.full_name}</strong> ({studentToRemove?.email}) from this classroom cohort?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setStudentToRemove(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmRemoveStudent}>
              Confirm Removal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
