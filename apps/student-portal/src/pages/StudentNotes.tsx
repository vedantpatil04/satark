import React, { useState, useEffect } from "react";
import {
  BookOpen,
  Search,
  Filter,
  Download,
  Eye,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  FileCode,
  Calendar,
  Layers,
  Sparkles,
  ArrowDownToLine,
  X,
  Loader2,
  FolderOpen,
  GraduationCap,
  ExternalLink,
  BookMarked
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ClassNote, Classroom } from "@satark/shared-types";
import { notesApi } from "@/api/notes";
import { classroomsApi } from "@/api/classrooms";
import { DocumentPreviewModal } from "@/components/notes/DocumentPreviewModal";
import { toast } from "sonner";

const CATEGORIES = [
  "All",
  "Lecture Notes",
  "Syllabus",
  "Reference",
  "Assignment",
  "Worksheet",
  "Cheatsheet"
];

export const StudentNotes: React.FC = () => {
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("all");
  const [notes, setNotes] = useState<ClassNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  // Preview Modal
  const [previewNote, setPreviewNote] = useState<ClassNote | null>(null);

  // Fetch enrolled classrooms
  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const clsList = await classroomsApi.list();
        setClasses(clsList);
      } catch (err: any) {
        toast.error("Failed to load enrolled classes", { description: err.message });
      }
    };
    fetchClasses();
  }, []);

  // Fetch published notes
  const fetchNotes = async () => {
    try {
      setLoading(true);
      const data = await notesApi.listStudentEnrolledNotes({
        search: searchQuery || undefined,
        category: selectedCategory !== "All" ? selectedCategory : undefined,
        classroom_id: selectedClassId !== "all" ? selectedClassId : undefined
      });
      setNotes(data);
    } catch (err: any) {
      toast.error("Failed to load study notes", { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotes();
  }, [selectedClassId, selectedCategory]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchNotes();
  };

  const handleDownload = async (note: ClassNote) => {
    try {
      await notesApi.downloadNoteBlob(note.id, note.original_filename);
      toast.success("Download started", { description: note.original_filename });
      // Update local download count
      setNotes((prev) =>
        prev.map((n) => (n.id === note.id ? { ...n, download_count: n.download_count + 1 } : n))
      );
    } catch (err: any) {
      toast.error("Download failed", { description: err.message });
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isRecent = (dateStr: string): boolean => {
    const noteDate = new Date(dateStr).getTime();
    const now = Date.now();
    return now - noteDate < 48 * 60 * 60 * 1000; // 48 hours
  };

  const getFileBadge = (ext: string) => {
    const cleanExt = ext.toLowerCase();
    if (cleanExt === ".pdf") {
      return { icon: FileText, bg: "bg-rose-50 text-rose-700 border-rose-200", label: "PDF" };
    }
    if ([".docx", ".doc"].includes(cleanExt)) {
      return { icon: FileText, bg: "bg-blue-50 text-blue-700 border-blue-200", label: "DOCX" };
    }
    if ([".pptx", ".ppt"].includes(cleanExt)) {
      return { icon: FileSpreadsheet, bg: "bg-orange-50 text-orange-700 border-orange-200", label: "PPTX" };
    }
    if (cleanExt === ".txt") {
      return { icon: FileCode, bg: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "TXT" };
    }
    if ([".png", ".jpg", ".jpeg"].includes(cleanExt)) {
      return { icon: ImageIcon, bg: "bg-purple-50 text-purple-700 border-purple-200", label: "IMG" };
    }
    return { icon: FileText, bg: "bg-stone-50 text-stone-700 border-stone-200", label: "DOC" };
  };

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="p-6 sm:p-7 rounded-3xl bg-white border border-stone-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#D97706] bg-[#FFF2E5] px-2.5 py-0.5 rounded-full font-mono">
              Academic Hub
            </span>
            <span className="text-xs text-stone-400 font-mono">
              Offline Host Storage • LAN Verified
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">
            Class Notes & Study Materials
          </h1>
          <p className="text-xs text-stone-500 mt-0.5 max-w-xl">
            Browse, search, preview, and download official course slides, syllabus, and reference documents published by your instructors.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-[#FFFDF9] border border-stone-200/80 p-3 rounded-2xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FFF2E5] text-[#D97706] flex items-center justify-center font-bold">
              <BookMarked className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-stone-400 block">Available Notes</span>
              <span className="text-sm font-extrabold text-slate-900 font-mono">
                {notes.length} Materials
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Classroom Selector Pills */}
      {classes.length > 0 && (
        <div className="space-y-2">
          <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block">
            Filter by Enrolled Cohort
          </span>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setSelectedClassId("all")}
              className={`px-4 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all ${
                selectedClassId === "all"
                  ? "bg-[#D97706] text-white shadow-xs"
                  : "bg-white text-stone-600 border border-stone-200/80 hover:bg-stone-50"
              }`}
            >
              All Enrolled Classes ({classes.length})
            </button>
            {classes.map((cls) => (
              <button
                key={cls.id}
                onClick={() => setSelectedClassId(cls.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all ${
                  selectedClassId === cls.id
                    ? "bg-[#D97706] text-white shadow-xs"
                    : "bg-white text-stone-600 border border-stone-200/80 hover:bg-stone-50"
                }`}
              >
                {cls.subject_code && (
                  <span className="text-[9px] font-black uppercase font-mono px-1.5 py-0.5 rounded bg-black/10">
                    {cls.subject_code}
                  </span>
                )}
                <span>{cls.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search & Category Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <Input
            placeholder="Search by topic, keyword, or document name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-8 h-10 rounded-2xl bg-white border-stone-200/80 text-xs shadow-xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setTimeout(fetchNotes, 0);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </form>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? "bg-[#D97706] text-white shadow-xs"
                  : "bg-white text-stone-600 border border-stone-200/80 hover:bg-stone-50"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Notes Grid */}
      {loading ? (
        <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#D97706]" />
          <p className="text-xs text-stone-500 font-medium">Fetching published study notes...</p>
        </div>
      ) : notes.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-white border border-stone-200/80 shadow-xs flex flex-col items-center max-w-md mx-auto">
          <div className="w-16 h-16 rounded-3xl bg-[#FFF2E5] border border-amber-200 flex items-center justify-center text-[#D97706] mb-3">
            <BookOpen className="w-8 h-8" />
          </div>
          <h3 className="font-extrabold text-base text-slate-900">No Materials Found</h3>
          <p className="text-xs text-stone-500 mt-1 leading-relaxed">
            {classes.length === 0
              ? "You are not currently enrolled in any classes. Join a class with a PIN code to view its materials."
              : "No study materials match your current category or search criteria."}
          </p>
          {searchQuery && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("All");
                setTimeout(fetchNotes, 0);
              }}
              className="mt-4 rounded-xl text-xs border-stone-200 font-semibold"
            >
              Clear Search Filter
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {notes.map((note) => {
            const badge = getFileBadge(note.file_extension);
            const Icon = badge.icon;
            const recent = isRecent(note.created_at);

            return (
              <div
                key={note.id}
                className="rounded-3xl bg-white border border-stone-200/80 p-5 shadow-xs flex flex-col justify-between hover:shadow-md transition-all group relative"
              >
                <div>
                  {/* Top Card Info */}
                  <div className="flex items-start justify-between gap-2 pb-3 border-b border-stone-100">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${badge.bg}`}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${badge.bg}`}
                          >
                            {badge.label}
                          </span>
                          <span className="text-[10px] font-bold text-stone-500 bg-stone-100 px-2 py-0.5 rounded-md">
                            {note.category}
                          </span>
                          {recent && (
                            <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-emerald-500 text-white font-mono animate-pulse">
                              NEW
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-stone-400 block mt-0.5 font-mono">
                          {formatFileSize(note.file_size_bytes)}
                        </span>
                      </div>
                    </div>

                    {note.classroom_title && (
                      <span className="text-[10px] font-bold text-[#D97706] bg-[#FFF2E5] px-2 py-0.5 rounded-lg font-mono truncate max-w-[120px]">
                        {note.classroom_subject_code || note.classroom_title}
                      </span>
                    )}
                  </div>

                  {/* Title & Description */}
                  <div className="mt-3.5">
                    <h3 className="font-extrabold text-sm text-slate-900 group-hover:text-[#D97706] transition-colors line-clamp-1">
                      {note.title}
                    </h3>
                    <p className="text-xs text-stone-500 mt-1 line-clamp-2 leading-relaxed">
                      {note.description || "Official class material published by instructor."}
                    </p>
                  </div>
                </div>

                {/* Bottom Metadata & Actions */}
                <div className="mt-4 pt-3 border-t border-stone-100 space-y-3">
                  <div className="flex items-center justify-between text-[11px] text-stone-400">
                    <span className="flex items-center gap-1 font-mono">
                      <Calendar className="w-3 h-3 text-stone-400" />
                      {new Date(note.created_at).toLocaleDateString()}
                    </span>
                    <span className="font-mono text-stone-400 text-[10px]">
                      {note.download_count} {note.download_count === 1 ? "download" : "downloads"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPreviewNote(note)}
                      className="h-9 rounded-xl border-stone-200 bg-white hover:bg-stone-50 text-xs font-bold text-slate-800 gap-1.5 shadow-xs"
                    >
                      <Eye className="w-3.5 h-3.5 text-stone-500" /> Preview
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleDownload(note)}
                      className="h-9 rounded-xl bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-bold gap-1.5 shadow-xs"
                    >
                      <Download className="w-3.5 h-3.5" /> Download
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Document Preview Modal */}
      <DocumentPreviewModal
        note={previewNote}
        isOpen={!!previewNote}
        onClose={() => setPreviewNote(null)}
        onDownloaded={fetchNotes}
      />
    </div>
  );
};
export default StudentNotes;
