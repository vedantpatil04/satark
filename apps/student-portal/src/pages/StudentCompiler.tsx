import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  compilerApi,
  SupportedLanguage,
  CompilerStatus,
  PracticeFile,
  ExecuteCodeResponse,
  SampleProgram,
  RuntimeInfo,
} from "@/api/compiler";
import { CodeMirrorEditor } from "../components/compiler/CodeMirrorEditor";
import {
  Play,
  RotateCcw,
  Save,
  Maximize2,
  Minimize2,
  Columns2,
  Rows2,
  FileCode,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Clock,
  Cpu,
  WifiOff,
  ShieldCheck,
  Terminal,
  Copy,
  ChevronDown,
  Loader2,
  HelpCircle,
  Check,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

const LANGUAGES: { id: SupportedLanguage; label: string; ext: string; color: string }[] = [
  { id: "c", label: "C (GCC)", ext: ".c", color: "from-blue-600 to-indigo-600" },
  { id: "cpp", label: "C++ (G++)", ext: ".cpp", color: "from-indigo-600 to-violet-600" },
  { id: "java", label: "Java (OpenJDK)", ext: ".java", color: "from-amber-600 to-orange-600" },
  { id: "python", label: "Python 3", ext: ".py", color: "from-emerald-600 to-teal-600" },
];

export const StudentCompiler: React.FC = () => {
  // Active workspace state
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedLanguage>("python");
  const [files, setFiles] = useState<PracticeFile[]>([]);
  const [activeFile, setActiveFile] = useState<PracticeFile | null>(null);
  const [code, setCode] = useState<string>("");
  const [stdin, setStdin] = useState<string>("");
  const [samples, setSamples] = useState<SampleProgram[]>([]);

  // Execution state
  const [executing, setExecuting] = useState(false);
  const [execResult, setExecResult] = useState<ExecuteCodeResponse | null>(null);
  const [activeIoTab, setActiveIoTab] = useState<"stdout" | "stdin" | "errors">("stdout");

  // Health and System status
  const [statusLoading, setStatusLoading] = useState(true);
  const [compilerStatus, setCompilerStatus] = useState<CompilerStatus | null>(null);
  const [healthModalOpen, setHealthModalOpen] = useState(false);
  const [selectedRuntimeGuide, setSelectedRuntimeGuide] = useState<RuntimeInfo | null>(null);

  // File management dialogs
  const [newFileDialogOpen, setNewFileDialogOpen] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameFileName, setRenameFileName] = useState("");
  const [fileToDelete, setFileToDelete] = useState<PracticeFile | null>(null);

  // Workspace layout and autosave state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [layoutMode, setLayoutMode] = useState<"horizontal" | "vertical">("horizontal");
  const [splitRatio, setSplitRatio] = useState<number>(55); // Editor % width
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [copiedStdout, setCopiedStdout] = useState(false);
  const [securityModalOpen, setSecurityModalOpen] = useState(false);

  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedCodeRef = useRef<string>("");
  const lastSavedStdinRef = useRef<string>("");

  // 1. Fetch compiler health status on load
  const loadCompilerStatus = async () => {
    try {
      setStatusLoading(true);
      const data = await compilerApi.getStatus();
      setCompilerStatus(data);
    } catch {
      toast.error("Failed to connect to backend compiler service");
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    loadCompilerStatus();
  }, []);

  // 2. Load practice files whenever selectedLanguage changes
  const loadWorkspaceFiles = useCallback(async (lang: SupportedLanguage) => {
    try {
      const fetchedFiles = await compilerApi.getFiles(lang);
      const safeFiles = Array.isArray(fetchedFiles) ? fetchedFiles : [];
      setFiles(safeFiles);

      // Find active file or default to the first one
      const active = safeFiles.find((f) => f.is_active) || safeFiles[0] || null;
      setActiveFile(active);

      if (active) {
        setCode(active.code ?? "");
        setStdin(active.stdin ?? "");
        lastSavedCodeRef.current = active.code ?? "";
        lastSavedStdinRef.current = active.stdin ?? "";
      } else {
        setCode("");
        setStdin("");
      }
      setSaveStatus("saved");
    } catch (err: any) {
      console.warn(`Could not load ${lang} workspace files:`, err);
      // Gracefully present an empty workspace so student can still code
      setCode("");
      setStdin("");
      setFiles([]);
      setActiveFile(null);
      setSaveStatus("saved");
      toast.error(`Failed to load ${lang.toUpperCase()} workspace files`, {
        description: err?.message || "Could not retrieve files from server.",
      });
    }
  }, []);

  // Load sample programs for current language
  const loadSamples = useCallback(async (lang: SupportedLanguage) => {
    try {
      const s = await compilerApi.getSamples(lang);
      setSamples(Array.isArray(s) ? s : []);
    } catch {
      setSamples([]);
    }
  }, []);

  useEffect(() => {
    loadWorkspaceFiles(selectedLanguage);
    loadSamples(selectedLanguage);
    setExecResult(null);
  }, [selectedLanguage, loadWorkspaceFiles, loadSamples]);

  // 3. Debounced Autosave
  const triggerAutosave = useCallback(
    (newCode: string, newStdin: string) => {
      if (newCode === lastSavedCodeRef.current && newStdin === lastSavedStdinRef.current) {
        return;
      }

      setSaveStatus("unsaved");
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }

      autosaveTimerRef.current = setTimeout(async () => {
        try {
          setSaveStatus("saving");
          if (activeFile) {
            await compilerApi.updateFile(activeFile.id, {
              code: newCode,
              stdin: newStdin,
            });
          } else {
            const defaultFilename =
              selectedLanguage === "java"
                ? "Main.java"
                : selectedLanguage === "python"
                ? "main.py"
                : selectedLanguage === "cpp"
                ? "main.cpp"
                : "main.c";
            const created = await compilerApi.createFile({
              language: selectedLanguage,
              filename: defaultFilename,
              code: newCode,
              stdin: newStdin,
            });
            setFiles([created]);
            setActiveFile(created);
          }
          lastSavedCodeRef.current = newCode;
          lastSavedStdinRef.current = newStdin;
          setSaveStatus("saved");
        } catch {
          setSaveStatus("unsaved");
        }
      }, 1500);
    },
    [activeFile, selectedLanguage]
  );

  const handleCodeChange = (val: string) => {
    setCode(val);
    triggerAutosave(val, stdin);
  };

  const handleStdinChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setStdin(val);
    triggerAutosave(code, val);
  };

  // Manual explicit save
  const handleManualSave = async () => {
    try {
      setSaveStatus("saving");
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);

      if (activeFile) {
        await compilerApi.updateFile(activeFile.id, { code, stdin });
      } else {
        const defaultFilename =
          selectedLanguage === "java"
            ? "Main.java"
            : selectedLanguage === "python"
            ? "main.py"
            : selectedLanguage === "cpp"
            ? "main.cpp"
            : "main.c";
        const created = await compilerApi.createFile({
          language: selectedLanguage,
          filename: defaultFilename,
          code,
          stdin,
        });
        setFiles([created]);
        setActiveFile(created);
      }

      lastSavedCodeRef.current = code;
      lastSavedStdinRef.current = stdin;
      setSaveStatus("saved");
      toast.success("Practice file saved successfully");
    } catch (err: any) {
      setSaveStatus("unsaved");
      toast.error(err?.message || "Failed to save practice file");
    }
  };

  // 4. Run Code Execution
  const handleExecuteCode = async () => {
    if (!code.trim()) {
      toast.warning("Cannot execute empty code");
      return;
    }

    // Check if runtime is available
    const rt = compilerStatus?.runtimes[selectedLanguage];
    if (rt && !rt.is_available) {
      toast.error(`${rt.name} is not installed on the server host`, {
        description: "Click Compiler Health in the toolbar to view installation instructions.",
      });
      setSelectedRuntimeGuide(rt);
      setHealthModalOpen(true);
      return;
    }

    try {
      setExecuting(true);
      // Ensure current changes are persisted
      if (activeFile && (code !== lastSavedCodeRef.current || stdin !== lastSavedStdinRef.current)) {
        await compilerApi.updateFile(activeFile.id, { code, stdin });
        lastSavedCodeRef.current = code;
        lastSavedStdinRef.current = stdin;
        setSaveStatus("saved");
      }

      const res = await compilerApi.execute({
        language: selectedLanguage,
        code,
        stdin,
        filename: activeFile?.filename,
      });

      setExecResult(res);

      if (res.status === "success") {
        setActiveIoTab("stdout");
      } else if (res.status === "compilation_error" || res.status === "runtime_error" || res.status === "unavailable") {
        setActiveIoTab("errors");
      } else if (res.status === "timed_out") {
        setActiveIoTab("errors");
        toast.warning("Execution timed out (5s limit)");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to execute code");
    } finally {
      setExecuting(false);
    }
  };

  // 5. Switch active file
  const handleSelectFile = async (file: PracticeFile) => {
    try {
      // Save current file first if needed
      if (activeFile && (code !== lastSavedCodeRef.current || stdin !== lastSavedStdinRef.current)) {
        await compilerApi.updateFile(activeFile.id, { code, stdin });
      }
      await compilerApi.updateFile(file.id, { is_active: true });
      setActiveFile(file);
      setCode(file.code);
      setStdin(file.stdin || "");
      lastSavedCodeRef.current = file.code;
      lastSavedStdinRef.current = file.stdin || "";
      setSaveStatus("saved");
      setExecResult(null);

      // Update files active indicator locally
      setFiles((prev) =>
        prev.map((f) => ({ ...f, is_active: f.id === file.id }))
      );
    } catch {
      toast.error("Failed to switch file");
    }
  };

  // 6. Create new file
  const handleCreateFile = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newFileName.trim();
    if (!cleanName) return;

    const ext = LANGUAGES.find((l) => l.id === selectedLanguage)?.ext || "";
    const finalName = cleanName.endsWith(ext) ? cleanName : `${cleanName}${ext}`;

    try {
      const created = await compilerApi.createFile({
        language: selectedLanguage,
        filename: finalName,
        code: `// ${finalName}\n// Write your ${selectedLanguage.toUpperCase()} code here\n`,
        stdin: "",
      });

      setFiles((prev) => [...prev.map((f) => ({ ...f, is_active: false })), created]);
      setActiveFile(created);
      setCode(created.code);
      setStdin("");
      lastSavedCodeRef.current = created.code;
      lastSavedStdinRef.current = "";
      setSaveStatus("saved");
      setNewFileDialogOpen(false);
      setNewFileName("");
      toast.success(`Created ${finalName}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create file");
    }
  };

  // 7. Rename file
  const handleRenameFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeFile) return;
    const cleanName = renameFileName.trim();
    if (!cleanName || cleanName === activeFile.filename) {
      setRenameDialogOpen(false);
      return;
    }

    try {
      const updated = await compilerApi.updateFile(activeFile.id, {
        filename: cleanName,
      });
      setFiles((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      setActiveFile(updated);
      setRenameDialogOpen(false);
      toast.success(`Renamed to ${cleanName}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to rename file");
    }
  };

  // 8. Delete file
  const handleDeleteFile = async () => {
    if (!fileToDelete) return;
    try {
      await compilerApi.deleteFile(fileToDelete.id);
      const remaining = files.filter((f) => f.id !== fileToDelete.id);
      setFiles(remaining);

      if (activeFile?.id === fileToDelete.id) {
        if (remaining.length > 0) {
          const nextActive = remaining[0];
          setActiveFile(nextActive);
          setCode(nextActive.code);
          setStdin(nextActive.stdin || "");
          lastSavedCodeRef.current = nextActive.code;
          lastSavedStdinRef.current = nextActive.stdin || "";
        } else {
          setActiveFile(null);
          setCode("");
          setStdin("");
        }
      }
      toast.success(`Deleted ${fileToDelete.filename}`);
      setFileToDelete(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete file");
    }
  };

  // 9. Reset file to default template or sample
  const handleResetFile = () => {
    const defaultSample = samples[0];
    if (defaultSample) {
      setCode(defaultSample.code);
      setStdin(defaultSample.stdin || "");
      triggerAutosave(defaultSample.code, defaultSample.stdin || "");
      toast.info(`Reset to sample '${defaultSample.title}'`);
    } else {
      setCode("");
      setStdin("");
      triggerAutosave("", "");
      toast.info("Cleared workspace");
    }
    setExecResult(null);
  };

  // 10. Load a specific sample program
  const handleLoadSample = (sample: SampleProgram) => {
    setCode(sample.code);
    setStdin(sample.stdin || "");
    triggerAutosave(sample.code, sample.stdin || "");
    toast.success(`Loaded sample: ${sample.title}`);
  };

  // Copy stdout
  const handleCopyStdout = () => {
    if (!execResult?.stdout) return;
    navigator.clipboard.writeText(execResult.stdout);
    setCopiedStdout(true);
    setTimeout(() => setCopiedStdout(false), 2000);
  };

  // Keyboard Shortcuts (Ctrl+Enter to Run, Ctrl+S to Save)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleExecuteCode();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleManualSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [code, stdin, activeFile, selectedLanguage, compilerStatus]);

  // Active language info
  const currentLangObj = LANGUAGES.find((l) => l.id === selectedLanguage)!;
  const currentRuntime = compilerStatus?.runtimes[selectedLanguage];

  return (
    <div
      className={`flex flex-col min-h-0 ${
        isFullscreen
          ? "fixed inset-0 z-50 bg-[#0F172A] p-4"
          : "h-[calc(100vh-140px)] w-full"
      }`}
    >
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 bg-white border border-stone-200/90 rounded-2xl p-3 shadow-xs">
        {/* Left: Language Tabs */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {LANGUAGES.map((lang) => {
            const isSelected = selectedLanguage === lang.id;
            const rt = compilerStatus?.runtimes[lang.id];
            const isAvailable = rt?.is_available ?? false;

            return (
              <button
                key={lang.id}
                onClick={() => setSelectedLanguage(lang.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  isSelected
                    ? "bg-[#D97706] text-white shadow-xs"
                    : "bg-stone-100/80 hover:bg-stone-200/70 text-slate-700"
                }`}
              >
                <span>{lang.label}</span>
                <span
                  className={`w-2 h-2 rounded-full ${
                    isAvailable ? "bg-emerald-400" : "bg-amber-400 animate-pulse"
                  }`}
                  title={isAvailable ? "Compiler Available" : "Installation Required"}
                />
              </button>
            );
          })}
        </div>

        {/* Center: File Selection & File Operations */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* File Picker Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-stone-200 bg-stone-50 hover:bg-stone-100 text-xs font-semibold text-slate-800 transition-colors">
                <FileCode className="w-3.5 h-3.5 text-[#D97706]" />
                <span className="truncate max-w-[130px]">
                  {activeFile?.filename || "Select File"}
                </span>
                <ChevronDown className="w-3 h-3 text-stone-400" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 p-1.5 rounded-xl">
              <DropdownMenuLabel className="text-[11px] font-bold text-stone-500 uppercase px-2 py-1">
                {selectedLanguage.toUpperCase()} Practice Files
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {files.map((file) => (
                <DropdownMenuItem
                  key={file.id}
                  onClick={() => handleSelectFile(file)}
                  className={`flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg cursor-pointer ${
                    activeFile?.id === file.id
                      ? "bg-amber-50 text-[#D97706] font-bold"
                      : "text-slate-700"
                  }`}
                >
                  <span className="truncate">{file.filename}</span>
                  {activeFile?.id === file.id && (
                    <Check className="w-3.5 h-3.5 text-[#D97706] shrink-0" />
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  setNewFileName(`practice_${files.length + 1}${currentLangObj.ext}`);
                  setNewFileDialogOpen(true);
                }}
                className="text-xs text-[#D97706] font-semibold flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> New File
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* New File Button */}
          <button
            onClick={() => {
              setNewFileName(`practice_${files.length + 1}${currentLangObj.ext}`);
              setNewFileDialogOpen(true);
            }}
            title="Create New File"
            className="p-1.5 rounded-xl border border-stone-200 hover:bg-stone-100 text-slate-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>

          {/* Rename File Button */}
          {activeFile && (
            <button
              onClick={() => {
                setRenameFileName(activeFile.filename);
                setRenameDialogOpen(true);
              }}
              title="Rename Current File"
              className="p-1.5 rounded-xl border border-stone-200 hover:bg-stone-100 text-slate-600 transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Delete File Button */}
          {activeFile && files.length > 1 && (
            <button
              onClick={() => setFileToDelete(activeFile)}
              title="Delete File"
              className="p-1.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Samples Dropdown */}
          {samples.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-stone-200 bg-stone-50 hover:bg-stone-100 text-xs font-medium text-slate-700 transition-colors">
                  <BookOpen className="w-3.5 h-3.5 text-stone-500" />
                  <span className="hidden sm:inline">Samples</span>
                  <ChevronDown className="w-3 h-3 text-stone-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 p-1.5 rounded-xl">
                <DropdownMenuLabel className="text-[11px] font-bold text-stone-500 uppercase px-2 py-1">
                  Sample Programs
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {samples.map((s) => (
                  <DropdownMenuItem
                    key={s.id}
                    onClick={() => handleLoadSample(s)}
                    className="flex flex-col items-start px-2.5 py-2 rounded-lg cursor-pointer hover:bg-stone-100"
                  >
                    <span className="text-xs font-bold text-slate-900">{s.title}</span>
                    <span className="text-[11px] text-stone-500 line-clamp-1">
                      {s.description}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Right: Run, Save, Reset, Status Pills, Fullscreen */}
        <div className="flex items-center gap-2">
          {/* Autosave Status Indicator */}
          <div className="hidden lg:flex items-center gap-1.5 px-2 text-[11px] font-medium text-stone-500">
            {saveStatus === "saving" && (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-[#D97706]" />
                <span>Saving...</span>
              </>
            )}
            {saveStatus === "saved" && (
              <>
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span>Saved</span>
              </>
            )}
            {saveStatus === "unsaved" && (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span>Unsaved changes</span>
              </>
            )}
          </div>

          {/* Compiler Health Status Pill */}
          <button
            onClick={() => setHealthModalOpen(true)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              compilerStatus?.all_available
                ? "bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100"
                : "bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100"
            }`}
            title="View Compiler Health & Setup Instructions"
          >
            {compilerStatus?.all_available ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            )}
            <span className="hidden sm:inline">
              {compilerStatus?.all_available ? "Compilers Ready" : "Compiler Setup"}
            </span>
          </button>

          {/* Security & Sandbox Info Button */}
          <button
            onClick={() => setSecurityModalOpen(true)}
            className="p-1.5 rounded-xl border border-stone-200 hover:bg-stone-100 text-stone-600 transition-colors"
            title="Execution Isolation & Security Details"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </button>

          {/* Layout Orientation Toggle */}
          <button
            onClick={() =>
              setLayoutMode((prev) => (prev === "horizontal" ? "vertical" : "horizontal"))
            }
            className="hidden sm:flex p-1.5 rounded-xl border border-stone-200 hover:bg-stone-100 text-stone-600 transition-colors"
            title={`Switch to ${layoutMode === "horizontal" ? "Vertical" : "Horizontal"} Split`}
          >
            {layoutMode === "horizontal" ? (
              <Rows2 className="w-4 h-4" />
            ) : (
              <Columns2 className="w-4 h-4" />
            )}
          </button>

          {/* Reset Button */}
          <button
            onClick={handleResetFile}
            className="p-1.5 rounded-xl border border-stone-200 hover:bg-stone-100 text-stone-600 transition-colors"
            title="Reset Workspace / Reload Sample"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Manual Save Button */}
          <Button
            size="sm"
            variant="outline"
            onClick={handleManualSave}
            className="h-8 px-2.5 rounded-xl border-stone-300 text-xs font-semibold gap-1.5"
            title="Save File (Ctrl+S)"
          >
            <Save className="w-3.5 h-3.5 text-stone-600" />
            <span className="hidden md:inline">Save</span>
          </Button>

          {/* Run Code Button */}
          <Button
            size="sm"
            onClick={handleExecuteCode}
            disabled={executing}
            className="h-8 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold gap-1.5 shadow-xs transition-all"
            title="Run Code (Ctrl+Enter)"
          >
            {executing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>{executing ? "Running..." : "Run"}</span>
          </Button>

          {/* Fullscreen Toggle */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded-xl border border-stone-200 hover:bg-stone-100 text-stone-600 transition-colors"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Workspace"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Workspace (Split View) */}
      <div
        className={`flex-1 flex ${
          layoutMode === "horizontal" ? "flex-col md:flex-row" : "flex-col"
        } gap-3 min-h-0 overflow-hidden`}
      >
        {/* Left / Top: Code Editor Workspace */}
        <div
          style={{
            flex: layoutMode === "horizontal" ? `0 0 ${splitRatio}%` : "1 1 55%",
          }}
          className="flex flex-col min-h-[300px] bg-[#1E293B] rounded-2xl border border-slate-700/80 shadow-md overflow-hidden"
        >
          {/* Editor Header Status Tab */}
          <div className="flex items-center justify-between px-4 py-2 bg-[#0F172A] border-b border-slate-700/80 text-xs font-mono text-slate-300">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-[#D97706]" />
              <span className="font-semibold text-slate-100 truncate">
                {activeFile?.filename || `solution${currentLangObj.ext}`}
              </span>
              <span className="text-[11px] text-slate-500 hidden sm:inline">
                ({currentLangObj.label})
              </span>
            </div>

            <div className="flex items-center gap-3 text-[11px] text-slate-400">
              {/* Split presets on large screens */}
              {layoutMode === "horizontal" && (
                <div className="hidden lg:flex items-center gap-1 border-r border-slate-700 pr-3">
                  <button
                    onClick={() => setSplitRatio(50)}
                    className={`px-1.5 py-0.5 rounded text-[10px] ${
                      splitRatio === 50 ? "bg-slate-700 text-white font-bold" : "hover:text-white"
                    }`}
                  >
                    50%
                  </button>
                  <button
                    onClick={() => setSplitRatio(60)}
                    className={`px-1.5 py-0.5 rounded text-[10px] ${
                      splitRatio === 60 ? "bg-slate-700 text-white font-bold" : "hover:text-white"
                    }`}
                  >
                    60%
                  </button>
                  <button
                    onClick={() => setSplitRatio(70)}
                    className={`px-1.5 py-0.5 rounded text-[10px] ${
                      splitRatio === 70 ? "bg-slate-700 text-white font-bold" : "hover:text-white"
                    }`}
                  >
                    70%
                  </button>
                </div>
              )}
              <span>UTF-8</span>
              <span>Tab: 4 spaces</span>
            </div>
          </div>

          {/* CodeMirror 6 Editor Container */}
          <div className="flex-1 min-h-0 overflow-hidden relative">
            <CodeMirrorEditor
              value={code}
              language={selectedLanguage}
              onChange={handleCodeChange}
            />
          </div>

          {/* Editor Bottom Bar */}
          <div className="flex items-center justify-between px-3 py-1 bg-[#0F172A]/90 border-t border-slate-800 text-[11px] font-mono text-slate-400">
            <span>{code.split("\n").length} lines</span>
            <div className="flex items-center gap-3">
              <span>{code.length} chars</span>
              <span className="text-emerald-400">Ctrl+Enter: Run</span>
              <span className="text-amber-400">Ctrl+S: Save</span>
            </div>
          </div>
        </div>

        {/* Right / Bottom: Terminal & Output / Input Panel */}
        <div className="flex-1 flex flex-col min-h-[250px] bg-[#090D16] rounded-2xl border border-slate-800 shadow-md overflow-hidden">
          {/* Terminal Tabs */}
          <div className="flex items-center justify-between px-3 py-2 bg-[#0F172A] border-b border-slate-800">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveIoTab("stdout")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  activeIoTab === "stdout"
                    ? "bg-slate-800 text-emerald-400 shadow-xs"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Console Output</span>
                {execResult?.status === "success" && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                )}
              </button>

              <button
                onClick={() => setActiveIoTab("stdin")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  activeIoTab === "stdin"
                    ? "bg-slate-800 text-amber-400 shadow-xs"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Rows2 className="w-3.5 h-3.5" />
                <span>Input (STDIN)</span>
                {stdin.trim().length > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                )}
              </button>

              <button
                onClick={() => setActiveIoTab("errors")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  activeIoTab === "errors"
                    ? "bg-slate-800 text-rose-400 shadow-xs"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Diagnostics & Errors</span>
                {execResult &&
                  execResult.status !== "success" && (
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                  )}
              </button>
            </div>

            {/* Performance Metrics Pill */}
            {execResult && (
              <div className="flex items-center gap-2 text-[11px] font-mono">
                <span
                  className={`px-2 py-0.5 rounded-full font-bold ${
                    execResult.status === "success"
                      ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800/60"
                      : "bg-rose-950/80 text-rose-400 border border-rose-800/60"
                  }`}
                >
                  {execResult.status === "success"
                    ? `Exit 0`
                    : execResult.status.replace("_", " ").toUpperCase()}
                </span>
                <span className="text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-stone-500" />
                  {execResult.execution_time_ms} ms
                </span>
                {execResult.memory_kb && (
                  <span className="text-slate-400 flex items-center gap-1 hidden sm:flex">
                    <Cpu className="w-3 h-3 text-stone-500" />
                    {(execResult.memory_kb / 1024).toFixed(1)} MB
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Terminal Body */}
          <div className="flex-1 p-3 overflow-auto font-mono text-xs text-slate-200">
            {/* Tab 1: STDOUT Console */}
            {activeIoTab === "stdout" && (
              <div className="h-full flex flex-col justify-between">
                {execResult?.stdout ? (
                  <div className="relative">
                    <button
                      onClick={handleCopyStdout}
                      className="absolute right-1 top-1 p-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 text-[11px] flex items-center gap-1 px-2 transition-colors"
                      title="Copy Output"
                    >
                      {copiedStdout ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                    <pre className="whitespace-pre-wrap break-words text-emerald-300 leading-relaxed pr-16">
                      {execResult.stdout}
                    </pre>
                  </div>
                ) : execResult && execResult.status === "success" ? (
                  <div className="text-slate-500 italic p-3">
                    [Program finished with exit code 0. No STDOUT output was produced.]
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                    <Terminal className="w-8 h-8 text-slate-600 mb-2" />
                    <p className="text-xs font-semibold text-slate-400">
                      Terminal is ready
                    </p>
                    <p className="text-[11px] text-slate-600 mt-1">
                      Press <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">Run</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">Ctrl+Enter</kbd> to execute your code.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Custom Input (STDIN) */}
            {activeIoTab === "stdin" && (
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between mb-2 text-stone-400 text-[11px]">
                  <span>Provide inputs line-by-line for scanf, cin, Scanner, or sys.stdin:</span>
                  <span className="text-amber-500 font-semibold">Autosaved with file</span>
                </div>
                <textarea
                  value={stdin}
                  onChange={handleStdinChange}
                  placeholder="Enter STDIN values here... (e.g. numbers, strings, test cases)"
                  className="w-full flex-1 min-h-[160px] bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-amber-200 placeholder:text-slate-600 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
                />
              </div>
            )}

            {/* Tab 3: Errors & Diagnostics */}
            {activeIoTab === "errors" && (
              <div className="h-full overflow-auto space-y-3">
                {execResult?.compilation_error ? (
                  <div className="rounded-xl bg-rose-950/40 border border-rose-800/80 p-3">
                    <div className="flex items-center gap-2 text-rose-400 font-bold mb-1.5">
                      <AlertCircle className="w-4 h-4" />
                      <span>Compilation Error</span>
                    </div>
                    <pre className="text-xs text-rose-300 whitespace-pre-wrap font-mono leading-relaxed">
                      {execResult.compilation_error}
                    </pre>
                  </div>
                ) : execResult?.status === "runtime_error" ? (
                  <div className="rounded-xl bg-rose-950/40 border border-rose-800/80 p-3">
                    <div className="flex items-center gap-2 text-rose-400 font-bold mb-1.5">
                      <AlertCircle className="w-4 h-4" />
                      <span>Runtime Error (Exit Code {execResult.exit_code})</span>
                    </div>
                    <pre className="text-xs text-rose-300 whitespace-pre-wrap font-mono leading-relaxed">
                      {execResult.stderr || "Program terminated with an error."}
                    </pre>
                  </div>
                ) : execResult?.status === "timed_out" ? (
                  <div className="rounded-xl bg-amber-950/40 border border-amber-800/80 p-3">
                    <div className="flex items-center gap-2 text-amber-400 font-bold mb-1.5">
                      <Clock className="w-4 h-4" />
                      <span>Execution Timed Out</span>
                    </div>
                    <p className="text-xs text-amber-300">
                      The execution exceeded the 5.0-second limit and was safely terminated.
                    </p>
                    <p className="text-[11px] text-amber-400/80 mt-1">
                      Tip: Check for infinite loops (e.g. <code className="bg-amber-950 px-1 rounded">while(true)</code>) or missing STDIN input calls.
                    </p>
                  </div>
                ) : execResult?.status === "unavailable" ? (
                  <div className="rounded-xl bg-amber-950/40 border border-amber-800/80 p-3">
                    <div className="flex items-center gap-2 text-amber-400 font-bold mb-1.5">
                      <AlertTriangle className="w-4 h-4" />
                      <span>Compiler / Runtime Missing</span>
                    </div>
                    <p className="text-xs text-amber-300 leading-relaxed mb-2">
                      {execResult.stderr}
                    </p>
                    <Button
                      size="sm"
                      onClick={() => setHealthModalOpen(true)}
                      className="bg-amber-600 hover:bg-amber-700 text-white text-xs rounded-lg"
                    >
                      View Windows Setup Guide
                    </Button>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 p-6">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600 mb-2" />
                    <p className="text-xs font-semibold text-slate-400">
                      No errors or diagnostics reported.
                    </p>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      Syntax errors and runtime exceptions will be highlighted here.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* MODAL 1: Compiler Health & Windows Installation Guide     */}
      {/* ========================================================= */}
      <Dialog open={healthModalOpen} onOpenChange={setHealthModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto rounded-3xl p-6">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-3 h-3 rounded-full bg-[#D97706]" />
              <DialogTitle className="text-lg font-bold text-slate-900">
                Compiler Health & Windows Setup Guide
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-stone-500">
              Students access this compiler over the local LAN without installing any tools. Compilers and runtimes are hosted on this server machine.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-2">
            {compilerStatus &&
              Object.values(compilerStatus.runtimes).map((rt) => (
                <div
                  key={rt.language}
                  className={`p-4 rounded-2xl border transition-all ${
                    rt.is_available
                      ? "bg-emerald-50/50 border-emerald-200/80"
                      : "bg-amber-50/60 border-amber-200"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {rt.is_available ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                      )}
                      <h4 className="text-sm font-bold text-slate-900">{rt.name}</h4>
                    </div>
                    <Badge
                      variant={rt.is_available ? "default" : "destructive"}
                      className={`text-[11px] font-semibold ${
                        rt.is_available
                          ? "bg-emerald-600 hover:bg-emerald-600 text-white"
                          : "bg-amber-600 hover:bg-amber-600 text-white"
                      }`}
                    >
                      {rt.is_available ? "Operational" : "Not Found on Host"}
                    </Badge>
                  </div>

                  {rt.is_available ? (
                    <div className="space-y-1 text-xs text-stone-600 font-mono">
                      <p>
                        <span className="text-stone-400">Version:</span> {rt.version}
                      </p>
                      <p className="truncate text-[11px] text-stone-400">
                        {rt.binary_path}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-2 space-y-2 text-xs">
                      <p className="text-amber-800 font-medium">
                        {rt.error_message || "Compiler not detected in Windows System PATH."}
                      </p>
                      {rt.setup_guide && (
                        <div className="bg-white/90 border border-amber-200 rounded-xl p-3 space-y-2">
                          <p className="font-bold text-slate-800 text-xs">
                            Quick One-Line Install (PowerShell):
                          </p>
                          <div className="flex items-center justify-between bg-slate-900 text-emerald-400 p-2 rounded-lg font-mono text-[11px]">
                            <code>{rt.setup_guide.quick_command}</code>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(rt.setup_guide!.quick_command);
                                toast.success("Copied install command!");
                              }}
                              className="text-slate-400 hover:text-white ml-2 text-xs"
                            >
                              Copy
                            </button>
                          </div>
                          <ul className="list-disc list-inside space-y-1 text-stone-600 text-[11px]">
                            {rt.setup_guide.steps.map((st, i) => (
                              <li key={i}>{st}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={loadCompilerStatus}
              disabled={statusLoading}
              className="text-xs rounded-xl"
            >
              {statusLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
              Re-scan Host Compilers
            </Button>
            <Button
              size="sm"
              onClick={() => setHealthModalOpen(false)}
              className="bg-[#D97706] hover:bg-[#B45309] text-white text-xs rounded-xl"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================= */}
      {/* MODAL 2: Genuine Security & Isolation Disclosure           */}
      {/* ========================================================= */}
      <Dialog open={securityModalOpen} onOpenChange={setSecurityModalOpen}>
        <DialogContent className="max-w-lg rounded-3xl p-6">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <DialogTitle className="text-lg font-bold text-slate-900">
                Execution Isolation & Resource Limits
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-stone-500">
              Verified security isolation parameters enforced on student code executions.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 my-2 text-xs">
            <div className="p-3 rounded-2xl bg-stone-50 border border-stone-200/80 space-y-1.5">
              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-emerald-600" />
                <span>Process & Architecture Isolation</span>
              </div>
              <p className="text-stone-600 leading-relaxed text-[11px]">
                Student code is <strong>never executed inside FastAPI</strong> or the web server runtime. All executions spawn isolated worker child processes via OS process separation.
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-stone-50 border border-stone-200/80 space-y-1.5">
              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-[#D97706]" />
                <span>Hardware Resource Caps</span>
              </div>
              <ul className="list-disc list-inside text-stone-600 text-[11px] space-y-0.5">
                <li><strong>CPU / Wall Timeout:</strong> Hard 5.0-second timeout with automated process tree kill via psutil.</li>
                <li><strong>Memory Limit:</strong> 256 MB hard ceiling enforced via native Windows Job Objects / JVM heap caps.</li>
                <li><strong>Fork-Bomb Guard:</strong> Maximum active process limit enforced per execution.</li>
              </ul>
            </div>

            <div className="p-3 rounded-2xl bg-stone-50 border border-stone-200/80 space-y-1.5">
              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                <WifiOff className="w-4 h-4 text-indigo-600" />
                <span>Filesystem & Network Restrictions</span>
              </div>
              <ul className="list-disc list-inside text-stone-600 text-[11px] space-y-0.5">
                <li><strong>Ephemeral Sandbox:</strong> Dedicated scratch directory per run, wiped upon process exit.</li>
                <li><strong>Environment Sanitized:</strong> Database URLs, secrets, and tokens stripped from process environment.</li>
                <li><strong>Network Sockets:</strong> Intercepted and blocked; network egress disabled.</li>
              </ul>
            </div>

            <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] leading-relaxed">
              <strong>Transparency Disclosure:</strong> Native Windows Job Objects and OS process limits are strictly enforced. Container hypervisor isolation (e.g. Docker/gVisor) is not claimed or assumed on this local bare-metal workstation.
            </div>
          </div>

          <DialogFooter>
            <Button
              size="sm"
              onClick={() => setSecurityModalOpen(false)}
              className="w-full bg-[#D97706] hover:bg-[#B45309] text-white text-xs rounded-xl"
            >
              Understood
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================= */}
      {/* MODAL 3: Create Practice File                             */}
      {/* ========================================================= */}
      <Dialog open={newFileDialogOpen} onOpenChange={setNewFileDialogOpen}>
        <DialogContent className="max-w-md rounded-3xl p-6">
          <form onSubmit={handleCreateFile}>
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-slate-900">
                Create {selectedLanguage.toUpperCase()} Practice File
              </DialogTitle>
              <DialogDescription className="text-xs text-stone-500">
                Add a new file to your practice workspace.
              </DialogDescription>
            </DialogHeader>

            <div className="my-4">
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                Filename
              </label>
              <Input
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                placeholder={`example${currentLangObj.ext}`}
                autoFocus
                className="text-xs rounded-xl"
              />
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setNewFileDialogOpen(false)}
                className="rounded-xl text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-[#D97706] hover:bg-[#B45309] text-white rounded-xl text-xs"
              >
                Create File
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========================================================= */}
      {/* MODAL 4: Rename Practice File                             */}
      {/* ========================================================= */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="max-w-md rounded-3xl p-6">
          <form onSubmit={handleRenameFile}>
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-slate-900">
                Rename File
              </DialogTitle>
              <DialogDescription className="text-xs text-stone-500">
                Enter a new name for '{activeFile?.filename}'.
              </DialogDescription>
            </DialogHeader>

            <div className="my-4">
              <Input
                value={renameFileName}
                onChange={(e) => setRenameFileName(e.target.value)}
                autoFocus
                className="text-xs rounded-xl"
              />
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRenameDialogOpen(false)}
                className="rounded-xl text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-[#D97706] hover:bg-[#B45309] text-white rounded-xl text-xs"
              >
                Rename
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========================================================= */}
      {/* MODAL 5: Confirm Delete File                              */}
      {/* ========================================================= */}
      <Dialog open={!!fileToDelete} onOpenChange={() => setFileToDelete(null)}>
        <DialogContent className="max-w-md rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              Delete Practice File
            </DialogTitle>
            <DialogDescription className="text-xs text-stone-500">
              Are you sure you want to delete '{fileToDelete?.filename}'? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 mt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFileToDelete(null)}
              className="rounded-xl text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleDeleteFile}
              className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

