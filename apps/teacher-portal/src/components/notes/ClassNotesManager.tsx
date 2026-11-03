import React, { useState, useEffect, useRef } from "react";
import {
  FileText,
  Upload,
  Plus,
  Search,
  Filter,
  Download,
  Eye,
  Trash2,
  Edit3,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Image as ImageIcon,
  FileCode,
  Calendar,
  Layers,
  ArrowDownToLine,
  MoreVertical,
  Check,
  X,
  Loader2,
  Sparkles,
  Share2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { ClassNote } from "@satark/shared-types";
import { notesApi } from "@/api/notes";
import { DocumentPreviewModal } from "./DocumentPreviewModal";
import { toast } from "sonner";

interface ClassNotesManagerProps {
  classroomId: string;
  classroomTitle: string;
  subjectCode?: string;
}

const CATEGORIES = [
  "All",
  "Lecture Notes",
  "Syllabus",
  "Reference",
  "Assignment",
  "Worksheet",
  "Cheatsheet"
];

export const ClassNotesManager: React.FC<ClassNotesManagerProps> = ({
  classroomId,
  classroomTitle,
  subjectCode
}) => {
  const [notes, setNotes] = useState<ClassNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  // Preview Modal
  const [previewNote, setPreviewNote] = useState<ClassNote | null>(null);

  // Single Upload Modal State
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadSubject, setUploadSubject] = useState(subjectCode || "");
  const [uploadCategory, setUploadCategory] = useState("Lecture Notes");
  const [uploadIsPublished, setUploadIsPublished] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Batch Upload Modal State
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchCategory, setBatchCategory] = useState("Lecture Notes");
  const [batchSubject, setBatchSubject] = useState(subjectCode || "");
  const [batchIsPublished, setBatchIsPublished] = useState(true);
  const [batchUploading, setBatchUploading] = useState(false);
  const batchFileInputRef = useRef<HTMLInputElement>(null);

  // Edit Modal State
  const [editNote, setEditNote] = useState<ClassNote | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editIsPublished, setEditIsPublished] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);

  // Replace File Modal State
  const [replaceNote, setReplaceNote] = useState<ClassNote | null>(null);
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [replacing, setReplacing] = useState(false);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);

  // Delete State
  const [noteToDelete, setNoteToDelete] = useState<ClassNote | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchNotes = async () => {
    try {
      setLoading(true);
      const data = await notesApi.listClassroomNotes(classroomId, {
        search: searchQuery || undefined,
        category: selectedCategory !== "All" ? selectedCategory : undefined
      });
      setNotes(data);
    } catch (err: any) {
      toast.error("Failed to load class notes", { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotes();
  }, [classroomId, selectedCategory]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchNotes();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      if (!uploadTitle.trim()) {
        const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
        setUploadTitle(cleanName);
      }
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      toast.error("Please select a document file to upload");
      return;
    }
    if (!uploadTitle.trim()) {
      toast.error("Please provide a note title");
      return;
    }

    try {
      setUploading(true);
      setUploadProgress(35);
      await notesApi.uploadNote(classroomId, {
        title: uploadTitle.trim(),
        description: uploadDescription.trim() || undefined,
        subject: uploadSubject.trim() || undefined,
        category: uploadCategory,
        is_published: uploadIsPublished,
        file: selectedFile
      });
      setUploadProgress(100);
      toast.success("Study material uploaded successfully!");
      setUploadModalOpen(false);
      resetUploadForm();
      fetchNotes();
    } catch (err: any) {
      toast.error("Upload failed", { description: err.message });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const resetUploadForm = () => {
    setUploadTitle("");
    setUploadDescription("");
    setUploadSubject(subjectCode || "");
    setUploadCategory("Lecture Notes");
    setUploadIsPublished(true);
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleBatchFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setBatchFiles(Array.from(e.target.files));
    }
  };

  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (batchFiles.length === 0) {
      toast.error("Please select at least one file");
      return;
    }

    try {
      setBatchUploading(true);
      const res = await notesApi.uploadBatchNotes(classroomId, batchFiles, {
        category: batchCategory,
        subject: batchSubject.trim() || undefined,
        is_published: batchIsPublished
      });
      toast.success(`Uploaded ${res.length} study materials in batch!`);
      setBatchModalOpen(false);
      setBatchFiles([]);
      fetchNotes();
    } catch (err: any) {
      toast.error("Batch upload failed", { description: err.message });
    } finally {
      setBatchUploading(false);
    }
  };

  const handleTogglePublish = async (note: ClassNote) => {
    try {
      const updated = await notesApi.updateNote(note.id, {
        is_published: !note.is_published
      });
      setNotes((prev) => prev.map((n) => (n.id === note.id ? updated : n)));
      toast.success(
        updated.is_published
          ? `Published: "${note.title}" is now visible to students`
          : `Unpublished: "${note.title}" hidden from candidates`
      );
    } catch (err: any) {
      toast.error("Failed to update status", { description: err.message });
    }
  };

  const handleOpenEdit = (note: ClassNote) => {
    setEditNote(note);
    setEditTitle(note.title);
    setEditDescription(note.description || "");
    setEditSubject(note.subject || "");
    setEditCategory(note.category);
    setEditIsPublished(note.is_published);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editNote) return;
    try {
      setSavingEdit(true);
      const updated = await notesApi.updateNote(editNote.id, {
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
        subject: editSubject.trim() || undefined,
        category: editCategory,
        is_published: editIsPublished
      });
      setNotes((prev) => prev.map((n) => (n.id === editNote.id ? updated : n)));
      toast.success("Note details updated");
      setEditNote(null);
    } catch (err: any) {
      toast.error("Failed to update note", { description: err.message });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleReplaceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replaceNote || !replacementFile) return;

    try {
      setReplacing(true);
      const updated = await notesApi.replaceNoteFile(replaceNote.id, replacementFile);
      setNotes((prev) => prev.map((n) => (n.id === replaceNote.id ? updated : n)));
      toast.success("Document file replaced successfully");
      setReplaceNote(null);
      setReplacementFile(null);
    } catch (err: any) {
      toast.error("Failed to replace document", { description: err.message });
    } finally {
      setReplacing(false);
    }
  };

  const handleDelete = async () => {
    if (!noteToDelete) return;
    try {
      setDeleting(true);
      await notesApi.deleteNote(noteToDelete.id);
      setNotes((prev) => prev.filter((n) => n.id !== noteToDelete.id));
      toast.success("Study material deleted");
      setNoteToDelete(null);
    } catch (err: any) {
      toast.error("Failed to delete note", { description: err.message });
    } finally {
      setDeleting(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
    <div className="space-y-6">
      {/* Action Header Card */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 sm:p-6 rounded-3xl bg-white border border-stone-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#D97706] bg-[#FFF2E5] px-2.5 py-0.5 rounded-full font-mono">
              Course Repository
            </span>
            <span className="text-xs text-stone-400 font-mono">
              {notes.length} {notes.length === 1 ? "document" : "documents"}
            </span>
          </div>
          <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 mt-1">
            Class Notes & Study Materials
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Upload lecture notes, assignment sheets, and reference materials directly to the local SATARK host.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Button
            variant="outline"
            onClick={() => setBatchModalOpen(true)}
            className="h-10 rounded-xl border-stone-200 bg-white hover:bg-stone-50 text-xs font-semibold text-slate-700 gap-1.5 shadow-xs"
          >
            <Layers className="w-4 h-4 text-[#D97706]" />
            <span>Batch Upload</span>
          </Button>

          <Button
            onClick={() => {
              resetUploadForm();
              setUploadModalOpen(true);
            }}
            className="h-10 rounded-xl bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-bold gap-1.5 shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Upload Material</span>
          </Button>
        </div>
      </div>

      {/* Search & Category Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <Input
            placeholder="Search notes by title, keyword, or file..."
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
        <div className="py-16 text-center flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#D97706]" />
          <p className="text-xs text-stone-500 font-medium">Loading study materials...</p>
        </div>
      ) : notes.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-white border border-stone-200/80 shadow-xs flex flex-col items-center max-w-xl mx-auto">
          <div className="w-16 h-16 rounded-3xl bg-[#FFF2E5] border border-amber-200 flex items-center justify-center text-[#D97706] mb-3">
            <Upload className="w-8 h-8" />
          </div>
          <h3 className="font-extrabold text-base text-slate-900">No Study Materials Yet</h3>
          <p className="text-xs text-stone-500 mt-1 max-w-sm leading-relaxed">
            Upload course slides, syllabus, reference textbooks, or practice worksheets for students in this class.
          </p>
          <div className="flex items-center gap-3 mt-5">
            <Button
              onClick={() => {
                resetUploadForm();
                setUploadModalOpen(true);
              }}
              className="rounded-xl bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-bold gap-1.5"
            >
              <Plus className="w-4 h-4" /> Upload First Note
            </Button>
            <Button
              variant="outline"
              onClick={() => setBatchModalOpen(true)}
              className="rounded-xl border-stone-200 bg-white text-xs font-semibold text-stone-700"
            >
              Batch Upload
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {notes.map((note) => {
            const badge = getFileBadge(note.file_extension);
            const Icon = badge.icon;

            return (
              <div
                key={note.id}
                className="rounded-3xl bg-white border border-stone-200/80 p-5 shadow-xs flex flex-col justify-between hover:shadow-md transition-all group"
              >
                <div>
                  {/* Top Card Info & Actions */}
                  <div className="flex items-start justify-between gap-2 pb-3 border-b border-stone-100">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${badge.bg}`}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${badge.bg}`}
                          >
                            {badge.label}
                          </span>
                          <span className="text-[10px] font-bold text-stone-500 bg-stone-100 px-2 py-0.5 rounded-md">
                            {note.category}
                          </span>
                        </div>
                        <span className="text-[11px] text-stone-400 block mt-0.5 font-mono">
                          {formatFileSize(note.file_size_bytes)}
                        </span>
                      </div>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1.5 rounded-xl hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-colors">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44 rounded-2xl p-1.5 shadow-lg border-stone-200">
                        <DropdownMenuItem
                          onClick={() => setPreviewNote(note)}
                          className="gap-2 text-xs font-semibold rounded-xl cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5 text-stone-500" /> Preview File
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => notesApi.downloadNoteBlob(note.id, note.original_filename)}
                          className="gap-2 text-xs font-semibold rounded-xl cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5 text-[#D97706]" /> Download
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleOpenEdit(note)}
                          className="gap-2 text-xs font-semibold rounded-xl cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-blue-600" /> Edit Details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setReplaceNote(note);
                            setReplacementFile(null);
                          }}
                          className="gap-2 text-xs font-semibold rounded-xl cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5 text-indigo-600" /> Replace Document
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="my-1 bg-stone-100" />
                        <DropdownMenuItem
                          onClick={() => setNoteToDelete(note)}
                          className="gap-2 text-xs font-semibold text-rose-600 focus:text-rose-700 rounded-xl cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete Note
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Title & Description */}
                  <div className="mt-3.5">
                    <h3 className="font-extrabold text-sm text-slate-900 group-hover:text-[#D97706] transition-colors line-clamp-1">
                      {note.title}
                    </h3>
                    <p className="text-xs text-stone-500 mt-1 line-clamp-2 leading-relaxed">
                      {note.description || "No description provided."}
                    </p>
                  </div>
                </div>

                {/* Bottom Metadata & Controls */}
                <div className="mt-4 pt-3 border-t border-stone-100 space-y-3">
                  <div className="flex items-center justify-between text-[11px] text-stone-400">
                    <span className="flex items-center gap-1 font-mono">
                      <Calendar className="w-3 h-3 text-stone-400" />
                      {new Date(note.created_at).toLocaleDateString()}
                    </span>
                    <span className="flex items-center gap-1 font-mono text-[#D97706] bg-[#FFF2E5] px-2 py-0.5 rounded-md font-bold">
                      <ArrowDownToLine className="w-3 h-3" />
                      {note.download_count} {note.download_count === 1 ? "download" : "downloads"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    {/* Publication Toggle */}
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={note.is_published}
                        onCheckedChange={() => handleTogglePublish(note)}
                        className="data-[state=checked]:bg-emerald-600"
                      />
                      <span className={`text-[11px] font-bold ${note.is_published ? "text-emerald-700" : "text-stone-400"}`}>
                        {note.is_published ? "Published" : "Draft"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setPreviewNote(note)}
                        className="h-8 px-2.5 rounded-xl text-xs font-bold text-stone-600 hover:text-slate-900 hover:bg-stone-100 gap-1"
                      >
                        <Eye className="w-3.5 h-3.5 text-stone-500" /> Preview
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => notesApi.downloadNoteBlob(note.id, note.original_filename)}
                        className="h-8 px-3 rounded-xl bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-bold gap-1 shadow-xs"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload Single Note Modal */}
      <Dialog open={uploadModalOpen} onOpenChange={setUploadModalOpen}>
        <DialogContent className="max-w-lg w-[95vw] rounded-3xl p-6 bg-white border-stone-200/80 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
              <Upload className="w-5 h-5 text-[#D97706]" /> Upload Study Material
            </DialogTitle>
            <DialogDescription className="text-xs text-stone-500">
              Upload notes or documents to <strong>{classroomTitle}</strong>. Supported: PDF, DOCX, PPTX, TXT, PNG, JPG (up to 50MB).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUploadSubmit} className="space-y-4 mt-3">
            {/* File Drag Drop Zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`p-6 border-2 border-dashed rounded-2xl text-center cursor-pointer transition-all ${
                selectedFile
                  ? "border-[#D97706] bg-[#FFF9F2]"
                  : "border-stone-200 hover:border-amber-300 bg-stone-50/50 hover:bg-stone-50"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.docx,.doc,.pptx,.ppt,.txt,.png,.jpg,.jpeg"
                onChange={handleFileSelect}
              />
              {selectedFile ? (
                <div className="flex items-center justify-between gap-3 text-left">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-10 h-10 rounded-xl bg-[#FFF2E5] border border-amber-200 flex items-center justify-center text-[#D97706] shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="truncate">
                      <p className="text-xs font-bold text-slate-900 truncate">{selectedFile.name}</p>
                      <p className="text-[10px] text-stone-400 font-mono mt-0.5">
                        {formatFileSize(selectedFile.size)} • Ready to upload
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="h-8 px-2 text-stone-400 hover:text-stone-700"
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <Upload className="w-8 h-8 text-stone-400 mb-2" />
                  <p className="text-xs font-bold text-slate-800">
                    Click or drag & drop document here
                  </p>
                  <p className="text-[11px] text-stone-400 mt-0.5">
                    PDF, Word (.docx), PowerPoint (.pptx), Text, or Image
                  </p>
                </div>
              )}
            </div>

            {/* Note Title */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Note Title <span className="text-rose-500">*</span>
              </label>
              <Input
                placeholder="e.g. Unit 3 - Cache Memory & Virtual Addressing"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                required
                className="h-10 rounded-xl text-xs border-stone-200/80"
              />
            </div>

            {/* Category & Subject Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Category</label>
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value)}
                  className="w-full h-10 rounded-xl border border-stone-200/80 bg-white px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D97706]/20 focus:border-[#D97706]"
                >
                  <option value="Lecture Notes">Lecture Notes</option>
                  <option value="Syllabus">Syllabus</option>
                  <option value="Reference">Reference</option>
                  <option value="Assignment">Assignment</option>
                  <option value="Worksheet">Worksheet</option>
                  <option value="Cheatsheet">Cheatsheet</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Subject Code / Tag</label>
                <Input
                  placeholder="e.g. CS-301"
                  value={uploadSubject}
                  onChange={(e) => setUploadSubject(e.target.value)}
                  className="h-10 rounded-xl text-xs border-stone-200/80"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Description / Instructions <span className="text-stone-400 text-[10px] font-normal">(Optional)</span>
              </label>
              <Textarea
                placeholder="Add notes for candidates regarding recommended reading, chapters covered, etc..."
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
                rows={2}
                className="rounded-xl text-xs border-stone-200/80 resize-none"
              />
            </div>

            {/* Published Switch */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-stone-50 border border-stone-200/80">
              <div>
                <span className="text-xs font-bold text-slate-800 block">Publish Immediately</span>
                <span className="text-[11px] text-stone-400">
                  When enabled, all enrolled students can instantly view and download this note.
                </span>
              </div>
              <Switch
                checked={uploadIsPublished}
                onCheckedChange={setUploadIsPublished}
                className="data-[state=checked]:bg-[#D97706]"
              />
            </div>

            {/* Upload Progress */}
            {uploading && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs font-semibold text-stone-500">
                  <span>Uploading to local host...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-stone-100 overflow-hidden">
                  <div
                    className="h-full bg-[#D97706] transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            <DialogFooter className="pt-2 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setUploadModalOpen(false)}
                disabled={uploading}
                className="h-10 rounded-xl border-stone-200 text-xs font-semibold"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={uploading || !selectedFile || !uploadTitle.trim()}
                className="h-10 rounded-xl bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-bold gap-2 shadow-xs"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Publish Study Material
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Batch Upload Modal */}
      <Dialog open={batchModalOpen} onOpenChange={setBatchModalOpen}>
        <DialogContent className="max-w-lg w-[95vw] rounded-3xl p-6 bg-white border-stone-200/80 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#D97706]" /> Batch Upload Study Materials
            </DialogTitle>
            <DialogDescription className="text-xs text-stone-500">
              Select multiple documents simultaneously. Titles will be automatically derived from the file names.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleBatchSubmit} className="space-y-4 mt-3">
            <div
              onClick={() => batchFileInputRef.current?.click()}
              className="p-6 border-2 border-dashed border-stone-200 hover:border-amber-300 rounded-2xl text-center cursor-pointer bg-stone-50/50 hover:bg-stone-50 transition-all"
            >
              <input
                ref={batchFileInputRef}
                type="file"
                multiple
                className="hidden"
                accept=".pdf,.docx,.doc,.pptx,.ppt,.txt,.png,.jpg,.jpeg"
                onChange={handleBatchFileSelect}
              />
              <Upload className="w-8 h-8 text-stone-400 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-800">
                Click to select multiple files
              </p>
              <p className="text-[11px] text-stone-400 mt-0.5">
                PDF, Word (.docx), PowerPoint (.pptx), Text, Images
              </p>
            </div>

            {/* Selected files list */}
            {batchFiles.length > 0 && (
              <div className="max-h-40 overflow-y-auto space-y-1.5 p-2 bg-stone-50 rounded-2xl border border-stone-200">
                <p className="text-[10px] font-bold text-stone-500 px-2 uppercase">
                  {batchFiles.length} {batchFiles.length === 1 ? "file" : "files"} selected
                </p>
                {batchFiles.map((f, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-xs bg-white p-2 rounded-xl border border-stone-200/60"
                  >
                    <span className="truncate font-medium text-slate-800 max-w-[260px]">{f.name}</span>
                    <span className="text-[10px] text-stone-400 font-mono">{formatFileSize(f.size)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Category</label>
                <select
                  value={batchCategory}
                  onChange={(e) => setBatchCategory(e.target.value)}
                  className="w-full h-10 rounded-xl border border-stone-200/80 bg-white px-3 text-xs text-slate-800"
                >
                  <option value="Lecture Notes">Lecture Notes</option>
                  <option value="Syllabus">Syllabus</option>
                  <option value="Reference">Reference</option>
                  <option value="Assignment">Assignment</option>
                  <option value="Worksheet">Worksheet</option>
                  <option value="Cheatsheet">Cheatsheet</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Subject Tag</label>
                <Input
                  placeholder="e.g. CS-301"
                  value={batchSubject}
                  onChange={(e) => setBatchSubject(e.target.value)}
                  className="h-10 rounded-xl text-xs border-stone-200/80"
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-stone-50 border border-stone-200/80">
              <div>
                <span className="text-xs font-bold text-slate-800 block">Publish All Immediately</span>
                <span className="text-[11px] text-stone-400">Make all uploaded documents visible to candidates</span>
              </div>
              <Switch
                checked={batchIsPublished}
                onCheckedChange={setBatchIsPublished}
                className="data-[state=checked]:bg-[#D97706]"
              />
            </div>

            <DialogFooter className="pt-2 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setBatchModalOpen(false)}
                disabled={batchUploading}
                className="h-10 rounded-xl border-stone-200 text-xs font-semibold"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={batchUploading || batchFiles.length === 0}
                className="h-10 rounded-xl bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-bold gap-2 shadow-xs"
              >
                {batchUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Upload {batchFiles.length} Files
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Note Modal */}
      <Dialog open={!!editNote} onOpenChange={(open) => !open && setEditNote(null)}>
        <DialogContent className="max-w-md w-[95vw] rounded-3xl p-6 bg-white border-stone-200/80 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-blue-600" /> Edit Study Material Details
            </DialogTitle>
          </DialogHeader>

          {editNote && (
            <form onSubmit={handleSaveEdit} className="space-y-4 mt-2">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Title</label>
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                  className="h-10 rounded-xl text-xs border-stone-200/80"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Category</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full h-10 rounded-xl border border-stone-200/80 bg-white px-3 text-xs text-slate-800"
                  >
                    <option value="Lecture Notes">Lecture Notes</option>
                    <option value="Syllabus">Syllabus</option>
                    <option value="Reference">Reference</option>
                    <option value="Assignment">Assignment</option>
                    <option value="Worksheet">Worksheet</option>
                    <option value="Cheatsheet">Cheatsheet</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Subject</label>
                  <Input
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value)}
                    className="h-10 rounded-xl text-xs border-stone-200/80"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Description</label>
                <Textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={2}
                  className="rounded-xl text-xs border-stone-200/80 resize-none"
                />
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-stone-50 border border-stone-200/80">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">Published Status</span>
                  <span className="text-[11px] text-stone-400">Control student visibility</span>
                </div>
                <Switch
                  checked={editIsPublished}
                  onCheckedChange={setEditIsPublished}
                  className="data-[state=checked]:bg-[#D97706]"
                />
              </div>

              <DialogFooter className="pt-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditNote(null)}
                  disabled={savingEdit}
                  className="h-10 rounded-xl border-stone-200 text-xs font-semibold"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={savingEdit || !editTitle.trim()}
                  className="h-10 rounded-xl bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-bold gap-2 shadow-xs"
                >
                  {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Replace File Modal */}
      <Dialog open={!!replaceNote} onOpenChange={(open) => !open && setReplaceNote(null)}>
        <DialogContent className="max-w-md w-[95vw] rounded-3xl p-6 bg-white border-stone-200/80 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-indigo-600" /> Replace Document File
            </DialogTitle>
            <DialogDescription className="text-xs text-stone-500">
              Upload a new file version to replace <strong>{replaceNote?.original_filename}</strong>. The note title and description will be preserved.
            </DialogDescription>
          </DialogHeader>

          {replaceNote && (
            <form onSubmit={handleReplaceSubmit} className="space-y-4 mt-2">
              <div
                onClick={() => replaceFileInputRef.current?.click()}
                className={`p-6 border-2 border-dashed rounded-2xl text-center cursor-pointer transition-all ${
                  replacementFile
                    ? "border-indigo-500 bg-indigo-50/30"
                    : "border-stone-200 hover:border-indigo-300 bg-stone-50/50"
                }`}
              >
                <input
                  ref={replaceFileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.docx,.doc,.pptx,.ppt,.txt,.png,.jpg,.jpeg"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setReplacementFile(e.target.files[0]);
                    }
                  }}
                />
                {replacementFile ? (
                  <div>
                    <FileText className="w-8 h-8 text-indigo-600 mx-auto mb-1" />
                    <p className="text-xs font-bold text-slate-900 truncate">{replacementFile.name}</p>
                    <p className="text-[10px] text-stone-400 font-mono mt-0.5">
                      {formatFileSize(replacementFile.size)} • Click to change
                    </p>
                  </div>
                ) : (
                  <div>
                    <Upload className="w-8 h-8 text-stone-400 mx-auto mb-1" />
                    <p className="text-xs font-bold text-slate-800">Select replacement document</p>
                    <p className="text-[10px] text-stone-400 mt-0.5">PDF, Word, PPTX, Text, Image</p>
                  </div>
                )}
              </div>

              <DialogFooter className="pt-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setReplaceNote(null)}
                  disabled={replacing}
                  className="h-10 rounded-xl border-stone-200 text-xs font-semibold"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={replacing || !replacementFile}
                  className="h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold gap-2 shadow-xs"
                >
                  {replacing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Replace File"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!noteToDelete} onOpenChange={(open) => !open && setNoteToDelete(null)}>
        <DialogContent className="max-w-md w-[95vw] rounded-3xl p-6 bg-white border-stone-200/80 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2 text-rose-600">
              <Trash2 className="w-4 h-4" /> Delete Study Material
            </DialogTitle>
            <DialogDescription className="text-xs text-stone-500 mt-1 leading-relaxed">
              Are you sure you want to delete <strong>"{noteToDelete?.title}"</strong>? This will permanently delete the document from the host storage and students will no longer be able to access it.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="pt-3 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setNoteToDelete(null)}
              disabled={deleting}
              className="h-10 rounded-xl border-stone-200 text-xs font-semibold"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="h-10 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold gap-2 shadow-xs"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Yes, Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Document Preview Modal */}
      <DocumentPreviewModal
        note={previewNote}
        isOpen={!!previewNote}
        onClose={() => setPreviewNote(null)}
      />
    </div>
  );
};
