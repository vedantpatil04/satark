import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Download,
  ExternalLink,
  Eye,
  Loader2,
  AlertCircle,
  FileSpreadsheet,
  Image as ImageIcon,
  FileCode,
  ArrowDownToLine
} from "lucide-react";
import { ClassNote } from "@satark/shared-types";
import { notesApi } from "@/api/notes";
import { toast } from "sonner";

interface DocumentPreviewModalProps {
  note: ClassNote | null;
  isOpen: boolean;
  onClose: () => void;
  onDownloaded?: () => void;
}

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  note,
  isOpen,
  onClose,
  onDownloaded
}) => {
  const [loading, setLoading] = useState(true);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewUrl = note ? notesApi.getPreviewUrl(note.id) : "";

  useEffect(() => {
    if (!isOpen || !note) {
      setTextContent(null);
      setError(null);
      setLoading(true);
      return;
    }

    setLoading(true);
    setError(null);

    // If text file, fetch content to render in formatted code container
    if (note.file_extension === ".txt" || note.mime_type.startsWith("text/")) {
      const token = localStorage.getItem("auth_token");
      fetch(previewUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then((res) => {
          if (!res.ok) throw new Error("Failed to load text document");
          return res.text();
        })
        .then((txt) => {
          setTextContent(txt);
          setLoading(false);
        })
        .catch((err) => {
          setError(err.message);
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [isOpen, note, previewUrl]);

  if (!note) return null;

  const handleDownload = async () => {
    try {
      setDownloading(true);
      await notesApi.downloadNoteBlob(note.id, note.original_filename);
      toast.success("Download started", { description: note.original_filename });
      if (onDownloaded) onDownloaded();
    } catch (err: any) {
      toast.error("Download failed", { description: err.message });
    } finally {
      setDownloading(false);
    }
  };

  const isPdf = note.file_extension === ".pdf";
  const isImage = [".png", ".jpg", ".jpeg"].includes(note.file_extension);
  const isText = note.file_extension === ".txt" || note.mime_type.startsWith("text/");
  const isOffice = [".docx", ".doc", ".pptx", ".ppt"].includes(note.file_extension);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl w-[95vw] h-[85vh] p-0 flex flex-col rounded-3xl overflow-hidden border-stone-200/80 bg-[#FAF9F6] shadow-2xl">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-white border-b border-stone-200/80 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-10 h-10 rounded-2xl bg-[#FFF2E5] border border-amber-200 flex items-center justify-center shrink-0 text-[#D97706]">
              {isPdf && <FileText className="w-5 h-5 text-rose-600" />}
              {isImage && <ImageIcon className="w-5 h-5 text-indigo-600" />}
              {isText && <FileCode className="w-5 h-5 text-emerald-600" />}
              {isOffice && <FileSpreadsheet className="w-5 h-5 text-blue-600" />}
            </div>
            <div className="truncate">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-sm sm:text-base font-extrabold text-slate-900 truncate">
                  {note.title}
                </DialogTitle>
                <Badge
                  variant="outline"
                  className="text-[10px] uppercase font-bold bg-[#FFF2E5] text-[#D97706] border-amber-200 shrink-0"
                >
                  {note.category}
                </Badge>
              </div>
              <p className="text-xs text-stone-400 truncate mt-0.5 font-mono">
                {note.original_filename} • {formatFileSize(note.file_size_bytes)}
                {note.classroom_title ? ` • ${note.classroom_title}` : ""}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              onClick={handleDownload}
              disabled={downloading}
              className="h-9 px-3.5 rounded-xl bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-bold gap-1.5 shadow-xs"
            >
              {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowDownToLine className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Download</span>
            </Button>
            {isPdf && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(previewUrl, "_blank")}
                className="h-9 px-3 rounded-xl border-stone-200 bg-white text-xs text-stone-700 hover:bg-stone-50 gap-1 hidden md:flex"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>New Tab</span>
              </Button>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-auto p-4 sm:p-6 bg-[#FAF9F6] flex flex-col items-center justify-center">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-[#D97706]" />
              <p className="text-xs text-stone-500 font-medium">Loading document preview...</p>
            </div>
          ) : error ? (
            <div className="p-8 text-center max-w-md bg-white rounded-2xl border border-stone-200 shadow-xs">
              <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-2" />
              <h4 className="font-bold text-sm text-slate-800">Preview Unavailable</h4>
              <p className="text-xs text-stone-500 mt-1">{error}</p>
              <Button onClick={handleDownload} className="mt-4 rounded-xl bg-[#D97706] text-white text-xs font-bold">
                Download Instead
              </Button>
            </div>
          ) : isPdf ? (
            <div className="w-full h-full rounded-2xl overflow-hidden border border-stone-200 shadow-sm bg-white">
              <iframe
                src={`${previewUrl}#toolbar=1`}
                className="w-full h-full border-0"
                title={note.title}
              />
            </div>
          ) : isImage ? (
            <div className="max-w-full max-h-full flex items-center justify-center p-2 bg-white rounded-2xl border border-stone-200 shadow-xs overflow-auto">
              <img
                src={previewUrl}
                alt={note.title}
                className="max-h-[70vh] max-w-full object-contain rounded-xl"
              />
            </div>
          ) : isText && textContent !== null ? (
            <div className="w-full h-full max-h-[70vh] overflow-auto bg-white p-6 rounded-2xl border border-stone-200 shadow-xs font-mono text-xs text-slate-800 leading-relaxed whitespace-pre-wrap select-text">
              {textContent}
            </div>
          ) : (
            /* Office & other formats */
            <div className="max-w-md w-full bg-white p-8 rounded-3xl border border-stone-200/80 shadow-sm text-center flex flex-col items-center">
              <div className="w-16 h-16 rounded-3xl bg-[#FFF2E5] border border-amber-200 flex items-center justify-center text-[#D97706] mb-4 shadow-xs">
                {note.file_extension.includes("doc") ? (
                  <FileText className="w-8 h-8 text-blue-600" />
                ) : (
                  <FileSpreadsheet className="w-8 h-8 text-orange-600" />
                )}
              </div>
              <h3 className="font-extrabold text-base text-slate-900">{note.original_filename}</h3>
              <p className="text-xs text-stone-500 mt-1.5 leading-relaxed">
                This document is formatted for <strong>{note.file_extension.toUpperCase().replace(".", "")}</strong>. Office documents are downloaded directly for local reading in Word / PowerPoint.
              </p>
              <div className="flex items-center gap-3 mt-4 text-xs text-stone-400 font-mono">
                <span>Size: {formatFileSize(note.file_size_bytes)}</span>
              </div>
              <Button
                onClick={handleDownload}
                disabled={downloading}
                className="mt-6 w-full h-11 rounded-xl bg-[#D97706] hover:bg-[#B45309] text-white font-bold text-xs gap-2 shadow-xs"
              >
                {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Download {note.file_extension.toUpperCase().replace(".", "")} Document
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
