import React, { useState, useEffect, useRef } from "react";
import {
  Database,
  Plus,
  Upload,
  Download,
  Search,
  BookOpen,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  FileText,
  Send,
  X,
  ChevronDown,
  ChevronUp,
  Tag,
  Check,
  Layers,
  ArrowRight
} from "lucide-react";
import { toast } from "sonner";
import { questionBanksApi, examsApi, classroomsApi } from "@satark/shared-api";
import type {
  QuestionBank,
  QuestionBankItem,
  QuestionValidationSummary,
  QuestionBankDataset,
} from "@satark/shared-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export const TeacherQuestionBank: React.FC = () => {
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<string | null>(null);
  const [selectedBank, setSelectedBank] = useState<(QuestionBank & { items: QuestionBankItem[] }) | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");

  // Modals state
  const [showCreateBankModal, setShowCreateBankModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddQuestionModal, setShowAddQuestionModal] = useState(false);
  const [showSendToExamModal, setShowSendToExamModal] = useState(false);
  const [editingItem, setEditingItem] = useState<QuestionBankItem | null>(null);

  // New Bank Form
  const [newBankTitle, setNewBankTitle] = useState("");
  const [newBankSubject, setNewBankSubject] = useState("");
  const [newBankTopic, setNewBankTopic] = useState("");
  const [newBankDesc, setNewBankDesc] = useState("");

  // Manual Question Form
  const [qText, setQText] = useState("");
  const [qOptions, setQOptions] = useState(["", "", "", ""]);
  const [qCorrectIdx, setQCorrectIdx] = useState(0);
  const [qMarks, setQMarks] = useState(2);
  const [qNegMarks, setQNegMarks] = useState(0);
  const [qDifficulty, setQDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [qTopic, setQTopic] = useState("");
  const [qExplanation, setQExplanation] = useState("");
  const [qExtId, setQExtId] = useState("");

  // JSON Import & Validation State
  const [uploadedJsonContent, setUploadedJsonContent] = useState<any | null>(null);
  const [validationResult, setValidationResult] = useState<QuestionValidationSummary | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [importTargetOption, setImportTargetOption] = useState<"new" | "current">("new");
  const [expandedPreviewItem, setExpandedPreviewItem] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Send to Exam state
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [availableExams, setAvailableExams] = useState<any[]>([]);
  const [targetExamId, setTargetExamId] = useState<string>("");

  const loadBanks = async () => {
    setIsLoading(true);
    try {
      const data = await questionBanksApi.list({
        search: searchQuery || undefined,
        subject: subjectFilter || undefined,
      });
      setBanks(data);
      if (data.length > 0 && !selectedBankId) {
        setSelectedBankId(data[0].id);
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to load question banks");
    } finally {
      setIsLoading(false);
    }
  };

  const loadBankDetail = async (id: string) => {
    try {
      const detail = await questionBanksApi.get(id);
      setSelectedBank(detail);
      setSelectedItemIds([]);
    } catch (err: any) {
      toast.error("Failed to load question bank items");
    }
  };

  useEffect(() => {
    loadBanks();
  }, [searchQuery, subjectFilter]);

  useEffect(() => {
    if (selectedBankId) {
      loadBankDetail(selectedBankId);
    } else {
      setSelectedBank(null);
    }
  }, [selectedBankId]);

  const handleCreateBank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBankTitle.trim() || !newBankSubject.trim()) {
      toast.error("Title and Subject are required");
      return;
    }
    try {
      const created = await questionBanksApi.create({
        title: newBankTitle.trim(),
        subject: newBankSubject.trim(),
        topic: newBankTopic.trim() || undefined,
        description: newBankDesc.trim() || undefined,
      });
      toast.success("Question bank created!");
      setShowCreateBankModal(false);
      setNewBankTitle("");
      setNewBankSubject("");
      setNewBankTopic("");
      setNewBankDesc("");
      await loadBanks();
      setSelectedBankId(created.id);
    } catch (err: any) {
      toast.error(err?.message || "Failed to create question bank");
    }
  };

  const handleDeleteBank = async (id: string) => {
    if (!confirm("Are you sure you want to delete this question bank and all its questions?")) return;
    try {
      await questionBanksApi.delete(id);
      toast.success("Question bank deleted");
      setSelectedBankId(null);
      await loadBanks();
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete question bank");
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const template = await questionBanksApi.getTemplate();
      const blob = new Blob([JSON.stringify(template, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "satark-question-bank-template.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Canonical JSON template downloaded!");
    } catch (err: any) {
      toast.error("Failed to fetch template");
    }
  };

  const handleExportJson = async (bankId: string) => {
    try {
      const data = await questionBanksApi.exportJson(bankId);
      const filename = `${selectedBank?.title || "question-bank"}-dataset.json`.replace(/\s+/g, "-").toLowerCase();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Question bank exported as JSON!");
    } catch (err: any) {
      toast.error("Export failed");
    }
  };

  // Handle JSON file selection and validation
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("File is too large. Maximum size is 5MB.");
      return;
    }

    try {
      setIsValidating(true);
      const text = await file.text();
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch (parseErr) {
        toast.error("Invalid JSON syntax. Please check file format.");
        setValidationResult(null);
        setUploadedJsonContent(null);
        return;
      }

      setUploadedJsonContent(parsed);
      const validation = await questionBanksApi.validateJson(parsed);
      setValidationResult(validation);
      if (validation.valid) {
        toast.success(`Validated ${validation.valid_count} questions successfully!`);
      } else {
        toast.warning(`Validation issues found: ${validation.invalid_count} error(s)`);
      }
    } catch (err: any) {
      toast.error("Validation error: " + (err?.message || "Unknown"));
    } finally {
      setIsValidating(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!uploadedJsonContent || !validationResult?.valid) {
      toast.error("Cannot import an invalid or empty dataset");
      return;
    }

    try {
      const targetBankId = importTargetOption === "current" && selectedBankId ? selectedBankId : undefined;
      const imported = await questionBanksApi.importJson({
        bank_id: targetBankId,
        dataset: uploadedJsonContent,
      });

      toast.success(`Successfully imported ${imported.item_count} questions into "${imported.title}"!`);
      setShowImportModal(false);
      setUploadedJsonContent(null);
      setValidationResult(null);
      await loadBanks();
      setSelectedBankId(imported.id);
    } catch (err: any) {
      toast.error(err?.message || "Import failed");
    }
  };

  // Save manual question
  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBankId) return;

    if (!qText.trim()) {
      toast.error("Question text is required");
      return;
    }
    const cleanOpts = qOptions.map((o) => o.trim()).filter(Boolean);
    if (cleanOpts.length < 2) {
      toast.error("At least 2 options are required");
      return;
    }
    if (qCorrectIdx < 0 || qCorrectIdx >= cleanOpts.length) {
      toast.error("Please pick a valid correct answer");
      return;
    }

    try {
      if (editingItem) {
        await questionBanksApi.updateItem(selectedBankId, editingItem.id, {
          external_id: qExtId.trim() || undefined,
          question_text: qText.trim(),
          options: cleanOpts,
          correct_option_index: qCorrectIdx,
          marks: qMarks,
          negative_marks: qNegMarks,
          difficulty: qDifficulty,
          topic: qTopic.trim() || undefined,
          explanation: qExplanation.trim() || undefined,
        });
        toast.success("Question updated!");
      } else {
        await questionBanksApi.addItem(selectedBankId, {
          external_id: qExtId.trim() || undefined,
          question_text: qText.trim(),
          options: cleanOpts,
          correct_option_index: qCorrectIdx,
          marks: qMarks,
          negative_marks: qNegMarks,
          difficulty: qDifficulty,
          topic: qTopic.trim() || undefined,
          explanation: qExplanation.trim() || undefined,
        });
        toast.success("Question added to bank!");
      }

      setShowAddQuestionModal(false);
      setEditingItem(null);
      resetQuestionForm();
      await loadBankDetail(selectedBankId);
      await loadBanks();
    } catch (err: any) {
      toast.error(err?.message || "Failed to save question");
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!selectedBankId) return;
    if (!confirm("Delete this question from bank?")) return;
    try {
      await questionBanksApi.deleteItem(selectedBankId, itemId);
      toast.success("Question deleted");
      await loadBankDetail(selectedBankId);
      await loadBanks();
    } catch (err: any) {
      toast.error("Failed to delete question");
    }
  };

  const resetQuestionForm = () => {
    setQText("");
    setQOptions(["", "", "", ""]);
    setQCorrectIdx(0);
    setQMarks(2);
    setQNegMarks(0);
    setQDifficulty("medium");
    setQTopic("");
    setQExplanation("");
    setQExtId("");
  };

  const openEditModal = (item: QuestionBankItem) => {
    setEditingItem(item);
    setQText(item.question_text);
    const opts = [...item.options];
    while (opts.length < 4) opts.push("");
    setQOptions(opts);
    setQCorrectIdx(item.correct_option_index);
    setQMarks(item.marks);
    setQNegMarks(item.negative_marks || 0);
    setQDifficulty(item.difficulty as any);
    setQTopic(item.topic || "");
    setQExplanation(item.explanation || "");
    setQExtId(item.external_id || "");
    setShowAddQuestionModal(true);
  };

  // Send selected questions to Exam
  const handleOpenSendToExam = async () => {
    if (selectedItemIds.length === 0) {
      toast.error("Please select at least one question using checkboxes");
      return;
    }
    try {
      const exams = await examsApi.list();
      // Only draft or scheduled exams can receive questions
      const editable = exams.filter((e) => e.status === "draft" || e.status === "scheduled");
      setAvailableExams(editable);
      if (editable.length > 0) {
        setTargetExamId(editable[0].id);
      }
      setShowSendToExamModal(true);
    } catch (err: any) {
      toast.error("Failed to fetch examinations");
    }
  };

  const handleConfirmSendToExam = async () => {
    if (!targetExamId) {
      toast.error("Please select a target examination");
      return;
    }
    try {
      await examsApi.importFromBank(targetExamId, selectedItemIds);
      toast.success(`Successfully imported ${selectedItemIds.length} question(s) into examination snapshot!`);
      setShowSendToExamModal(false);
      setSelectedItemIds([]);
    } catch (err: any) {
      toast.error(err?.message || "Failed to import into exam");
    }
  };

  const toggleSelectAll = () => {
    if (!selectedBank?.items) return;
    if (selectedItemIds.length === selectedBank.items.length) {
      setSelectedItemIds([]);
    } else {
      setSelectedItemIds(selectedBank.items.map((i) => i.id));
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 text-primary rounded-xl">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Question Banks & Datasets</h1>
              <p className="text-sm text-muted-foreground">
                Author, curate, and upload standardized JSON datasets to deploy verified examination questions.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleDownloadTemplate} className="gap-2">
            <Download className="w-4 h-4 text-primary" /> Download JSON Template
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowImportModal(true)} className="gap-2">
            <Upload className="w-4 h-4 text-emerald-500" /> Upload JSON Dataset
          </Button>
          <Button size="sm" onClick={() => setShowCreateBankModal(true)} className="gap-2">
            <Plus className="w-4 h-4" /> New Question Bank
          </Button>
        </div>
      </div>

      {/* Main Layout: Left Sidebar (Banks list) + Right Content (Bank Questions) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Bank Cards */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="border-border">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold uppercase text-muted-foreground tracking-wider">
                  Question Banks ({banks.length})
                </CardTitle>
              </div>
              <div className="mt-3 relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                <Input
                  placeholder="Search title, subject, topic..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-xs"
                />
              </div>
            </CardHeader>
            <CardContent className="p-2 space-y-1.5 max-h-[600px] overflow-y-auto">
              {banks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-xs">
                  <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No question banks found. Click "New Question Bank" or "Upload JSON Dataset".
                </div>
              ) : (
                banks.map((b) => {
                  const isSelected = selectedBankId === b.id;
                  return (
                    <div
                      key={b.id}
                      onClick={() => setSelectedBankId(b.id)}
                      className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                        isSelected
                          ? "bg-primary/10 border-primary text-foreground shadow-sm"
                          : "border-border hover:bg-muted/50 text-foreground"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold text-sm truncate">{b.title}</div>
                        <Badge variant="outline" className="text-[10px] shrink-0 font-medium">
                          {b.item_count || 0} Qs
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                        <span className="font-medium text-primary">{b.subject}</span>
                        {b.topic && <span>• {b.topic}</span>}
                      </div>
                      {b.description && (
                        <p className="text-[11px] text-muted-foreground line-clamp-1 mt-1">{b.description}</p>
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Active Bank Questions Detail */}
        <div className="lg:col-span-8 space-y-4">
          {selectedBank ? (
            <Card className="border-border">
              <CardHeader className="p-5 border-b border-border bg-card/60">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg font-bold">{selectedBank.title}</CardTitle>
                      <Badge variant="secondary" className="text-xs">
                        {selectedBank.subject}
                      </Badge>
                      {selectedBank.topic && (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          {selectedBank.topic}
                        </Badge>
                      )}
                    </div>
                    {selectedBank.description && (
                      <p className="text-xs text-muted-foreground mt-1">{selectedBank.description}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleExportJson(selectedBank.id)}
                      className="text-xs h-8 gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" /> Export JSON
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => {
                        setEditingItem(null);
                        resetQuestionForm();
                        setShowAddQuestionModal(true);
                      }}
                      className="text-xs h-8 gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Question
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteBank(selectedBank.id)}
                      className="text-xs h-8 p-2"
                      title="Delete Question Bank"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Sub-bar: Selection and Stats */}
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50 text-xs">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={toggleSelectAll}
                      className="text-primary hover:underline font-medium text-xs flex items-center gap-1"
                    >
                      {selectedItemIds.length === selectedBank.items.length && selectedBank.items.length > 0
                        ? "Deselect All"
                        : "Select All Questions"}
                    </button>
                    <span className="text-muted-foreground">
                      Selected: <strong>{selectedItemIds.length}</strong> of {selectedBank.items.length}
                    </span>
                  </div>

                  {selectedItemIds.length > 0 && (
                    <Button
                      size="sm"
                      onClick={handleOpenSendToExam}
                      className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                    >
                      <Send className="w-3 h-3" /> Add {selectedItemIds.length} to Exam
                    </Button>
                  )}
                </div>
              </CardHeader>

              <CardContent className="p-4 space-y-3">
                {selectedBank.items.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <HelpCircle className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-medium">This question bank has no questions yet.</p>
                    <p className="text-xs mt-1">Upload a canonical JSON dataset or click "Add Question" to begin.</p>
                  </div>
                ) : (
                  selectedBank.items.map((item, idx) => {
                    const isSelected = selectedItemIds.includes(item.id);
                    return (
                      <div
                        key={item.id}
                        className={`p-4 rounded-xl border transition-all ${
                          isSelected ? "border-primary/60 bg-primary/5" : "border-border bg-card hover:border-border/80"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedItemIds([...selectedItemIds, item.id]);
                              } else {
                                setSelectedItemIds(selectedItemIds.filter((id) => id !== item.id));
                              }
                            }}
                            className="mt-1 h-4 w-4 rounded border-border text-primary cursor-pointer"
                          />

                          <div className="flex-1 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-xs text-muted-foreground">Q{idx + 1}.</span>
                                {item.external_id && (
                                  <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground">
                                    {item.external_id}
                                  </Badge>
                                )}
                                <Badge
                                  variant="secondary"
                                  className={`text-[10px] capitalize ${
                                    item.difficulty === "easy"
                                      ? "text-emerald-500"
                                      : item.difficulty === "hard"
                                      ? "text-rose-500"
                                      : "text-amber-500"
                                  }`}
                                >
                                  {item.difficulty}
                                </Badge>
                                <span className="text-[11px] text-muted-foreground">
                                  <strong>{item.marks}</strong> {item.marks === 1 ? "mark" : "marks"}
                                </span>
                                {item.negative_marks > 0 && (
                                  <span className="text-[11px] text-rose-500">
                                    (-{item.negative_marks} neg)
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openEditModal(item)}
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteItem(item.id)}
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-500"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </div>

                            <p className="text-sm font-medium text-foreground whitespace-pre-wrap">{item.question_text}</p>

                            {/* Options Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                              {item.options.map((opt, optIdx) => {
                                const isCorrect = optIdx === item.correct_option_index;
                                return (
                                  <div
                                    key={optIdx}
                                    className={`px-3 py-1.5 rounded-lg text-xs flex items-center justify-between border ${
                                      isCorrect
                                        ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-semibold"
                                        : "bg-muted/40 border-border text-foreground/80"
                                    }`}
                                  >
                                    <span className="truncate">
                                      <strong className="mr-1.5">{String.fromCharCode(65 + optIdx)}.</strong>
                                      {opt}
                                    </span>
                                    {isCorrect && <Check className="w-3.5 h-3.5 shrink-0 text-emerald-500" />}
                                  </div>
                                );
                              })}
                            </div>

                            {item.explanation && (
                              <p className="text-[11px] text-muted-foreground italic pt-1 border-t border-border/40">
                                Explanation: {item.explanation}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border p-12 text-center text-muted-foreground">
              <Database className="w-12 h-12 mx-auto mb-3 opacity-25" />
              <p className="text-base font-semibold">Select a Question Bank</p>
              <p className="text-xs text-muted-foreground mt-1">
                Choose a question bank from the left or create a new one to start managing questions.
              </p>
            </Card>
          )}
        </div>
      </div>

      {/* MODAL 1: Create Question Bank */}
      {showCreateBankModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                <Database className="w-5 h-5 text-primary" /> Create Question Bank
              </h3>
              <button
                onClick={() => setShowCreateBankModal(false)}
                className="text-muted-foreground hover:text-foreground p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBank} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Question Bank Title *</Label>
                <Input
                  required
                  placeholder="e.g. Operating Systems Final Exam Bank"
                  value={newBankTitle}
                  onChange={(e) => setNewBankTitle(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Subject *</Label>
                  <Input
                    required
                    placeholder="e.g. Computer Science"
                    value={newBankSubject}
                    onChange={(e) => setNewBankSubject(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Topic (Optional)</Label>
                  <Input
                    placeholder="e.g. Process Scheduling"
                    value={newBankTopic}
                    onChange={(e) => setNewBankTopic(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Description</Label>
                <textarea
                  className="w-full h-20 px-3 py-2 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary outline-none"
                  placeholder="Notes or semester cohort instructions..."
                  value={newBankDesc}
                  onChange={(e) => setNewBankDesc(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <Button type="button" variant="ghost" onClick={() => setShowCreateBankModal(false)}>
                  Cancel
                </Button>
                <Button type="submit">Create Bank</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Upload & Validate JSON Dataset */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-emerald-500" />
                <h3 className="font-bold text-lg text-foreground">Import Canonical JSON Dataset</h3>
              </div>
              <button onClick={() => setShowImportModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-4">
              {/* File upload drag drop zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border hover:border-primary rounded-xl p-6 text-center cursor-pointer bg-muted/20 hover:bg-muted/40 transition-all"
              >
                <FileText className="w-10 h-10 text-primary mx-auto mb-2 opacity-60" />
                <p className="text-sm font-semibold text-foreground">Click to upload or drag & drop JSON file</p>
                <p className="text-xs text-muted-foreground mt-1">Accepts canonical .json format (Schema v1.0, max 500 questions, 5MB)</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {/* Validation Summary Display */}
              {isValidating && (
                <div className="p-4 rounded-xl border border-border bg-muted/30 text-center text-xs animate-pulse">
                  Validating dataset against SATARK schema rules...
                </div>
              )}

              {validationResult && (
                <div className="space-y-3">
                  <div
                    className={`p-4 rounded-xl border flex items-center justify-between ${
                      validationResult.valid
                        ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                        : "bg-rose-500/10 border-rose-500/40 text-rose-700 dark:text-rose-400"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      {validationResult.valid ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-rose-500" />
                      )}
                      <div>
                        <div className="font-bold text-sm">
                          {validationResult.valid ? "Dataset Verified Clean" : "Validation Errors Detected"}
                        </div>
                        <div className="text-xs opacity-90">
                          {validationResult.valid_count} valid of {validationResult.total_questions} questions verified.
                        </div>
                      </div>
                    </div>
                    <Badge variant="outline" className="font-mono text-xs">
                      v{validationResult.schema_version}
                    </Badge>
                  </div>

                  {/* Errors List if any */}
                  {validationResult.errors.length > 0 && (
                    <div className="p-3 bg-rose-500/5 border border-rose-500/20 rounded-xl space-y-1.5">
                      <div className="text-xs font-bold text-rose-600 dark:text-rose-400">
                        Diagnostics ({validationResult.errors.length}):
                      </div>
                      <div className="max-h-36 overflow-y-auto space-y-1 text-xs text-rose-700 dark:text-rose-300">
                        {validationResult.errors.map((err, i) => (
                          <div key={i} className="flex items-start gap-1.5 font-mono text-[11px]">
                            <span>•</span>
                            <span>{err.message}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Target Bank Destination */}
                  {validationResult.valid && (
                    <div className="p-4 border border-border rounded-xl space-y-2 bg-muted/10">
                      <Label className="text-xs font-bold text-foreground">Import Destination</Label>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <label
                          className={`p-3 rounded-lg border cursor-pointer flex items-center gap-2 ${
                            importTargetOption === "new" ? "border-primary bg-primary/10 font-bold" : "border-border"
                          }`}
                        >
                          <input
                            type="radio"
                            name="importTarget"
                            checked={importTargetOption === "new"}
                            onChange={() => setImportTargetOption("new")}
                            className="text-primary"
                          />
                          <span>Create New Bank from Dataset</span>
                        </label>

                        <label
                          className={`p-3 rounded-lg border cursor-pointer flex items-center gap-2 ${
                            importTargetOption === "current" ? "border-primary bg-primary/10 font-bold" : "border-border"
                          } ${!selectedBankId ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                          <input
                            type="radio"
                            name="importTarget"
                            disabled={!selectedBankId}
                            checked={importTargetOption === "current"}
                            onChange={() => setImportTargetOption("current")}
                            className="text-primary"
                          />
                          <span>Append into "{selectedBank?.title || "Current Bank"}"</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Valid Questions Preview */}
                  {validationResult.valid_questions.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-muted-foreground uppercase">
                        Question Preview ({validationResult.valid_questions.length})
                      </div>
                      <div className="max-h-48 overflow-y-auto space-y-2">
                        {validationResult.valid_questions.map((vq, i) => (
                          <div key={i} className="p-2.5 rounded-lg border border-border/80 text-xs bg-card/60">
                            <div className="flex items-center justify-between font-semibold">
                              <span className="truncate text-foreground">
                                {i + 1}. {vq.question}
                              </span>
                              <Badge variant="outline" className="text-[10px] shrink-0 font-mono">
                                {vq.externalId}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                              <span>{vq.options.length} options</span>
                              <span>•</span>
                              <span className="text-emerald-500">Correct: Choice {String.fromCharCode(65 + vq.correctOptionIndex)}</span>
                              <span>•</span>
                              <span>{vq.marks} marks</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-border pt-4">
              <Button type="button" variant="ghost" onClick={() => setShowImportModal(false)}>
                Cancel
              </Button>
              <Button
                disabled={!validationResult?.valid}
                onClick={handleConfirmImport}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              >
                <Check className="w-4 h-4" /> Confirm & Import to Database
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Add / Edit Question Manually */}
      {showAddQuestionModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-primary" />
                {editingItem ? "Edit Question" : "Add Question to Bank"}
              </h3>
              <button
                onClick={() => {
                  setShowAddQuestionModal(false);
                  setEditingItem(null);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuestion} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">External ID (Optional)</Label>
                  <Input
                    placeholder="e.g. OS-Q001"
                    value={qExtId}
                    onChange={(e) => setQExtId(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Topic (Optional)</Label>
                  <Input
                    placeholder="e.g. Memory Management"
                    value={qTopic}
                    onChange={(e) => setQTopic(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Question Text *</Label>
                <textarea
                  required
                  rows={3}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary outline-none"
                  placeholder="Type the examination question..."
                  value={qText}
                  onChange={(e) => setQText(e.target.value)}
                />
              </div>

              {/* Options */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">Answer Choices (Pick Correct Answer) *</Label>
                  <span className="text-[11px] text-muted-foreground">Select the radio button for the correct key</span>
                </div>

                {qOptions.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="correctOption"
                      checked={qCorrectIdx === i}
                      onChange={() => setQCorrectIdx(i)}
                      className="h-4 w-4 text-emerald-500 cursor-pointer"
                    />
                    <span className="w-5 font-bold text-xs text-muted-foreground">{String.fromCharCode(65 + i)}.</span>
                    <Input
                      placeholder={`Option ${String.fromCharCode(65 + i)}`}
                      value={opt}
                      onChange={(e) => {
                        const copy = [...qOptions];
                        copy[i] = e.target.value;
                        setQOptions(copy);
                      }}
                      className="text-xs h-9"
                    />
                  </div>
                ))}
              </div>

              {/* Marks & Difficulty */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Marks *</Label>
                  <Input
                    type="number"
                    min={1}
                    value={qMarks}
                    onChange={(e) => setQMarks(parseInt(e.target.value) || 1)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Negative Marks</Label>
                  <Input
                    type="number"
                    min={0}
                    value={qNegMarks}
                    onChange={(e) => setQNegMarks(parseInt(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Difficulty</Label>
                  <select
                    value={qDifficulty}
                    onChange={(e) => setQDifficulty(e.target.value as any)}
                    className="w-full h-9 px-3 rounded-lg border border-border bg-background text-xs outline-none"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Answer Explanation (Optional)</Label>
                <textarea
                  rows={2}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary outline-none"
                  placeholder="Explain why the marked option is correct..."
                  value={qExplanation}
                  onChange={(e) => setQExplanation(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setShowAddQuestionModal(false);
                    setEditingItem(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit">{editingItem ? "Update Question" : "Save Question"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Send to Examination */}
      {showSendToExamModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                <Send className="w-5 h-5 text-emerald-500" /> Add to Examination
              </h3>
              <button onClick={() => setShowSendToExamModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              You are importing <strong>{selectedItemIds.length}</strong> question(s) into an examination. Questions are copied as an independent examination snapshot.
            </p>

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Target Examination *</Label>
              {availableExams.length === 0 ? (
                <div className="p-3 rounded-lg border border-border text-center text-xs text-muted-foreground">
                  No draft or scheduled exams available. Please create an examination first.
                </div>
              ) : (
                <select
                  value={targetExamId}
                  onChange={(e) => setTargetExamId(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-border bg-background text-xs font-medium outline-none"
                >
                  {availableExams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.title} ({ex.exam_code}) - Status: {ex.status}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="ghost" onClick={() => setShowSendToExamModal(false)}>
                Cancel
              </Button>
              <Button
                disabled={!targetExamId || availableExams.length === 0}
                onClick={handleConfirmSendToExam}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Confirm Import to Exam
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default TeacherQuestionBank;
