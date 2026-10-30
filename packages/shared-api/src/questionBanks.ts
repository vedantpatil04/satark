import { apiClient } from "./client";
import type {
  QuestionBank,
  QuestionBankItem,
  QuestionValidationSummary,
  QuestionBankDataset,
} from "@satark/shared-types";

export const questionBanksApi = {
  list: (params?: { search?: string; subject?: string }) => {
    const sp = new URLSearchParams();
    if (params?.search) sp.set("search", params.search);
    if (params?.subject) sp.set("subject", params.subject);
    const qs = sp.toString() ? `?${sp.toString()}` : "";
    return apiClient<QuestionBank[]>(`/question-banks${qs}`);
  },

  get: (bankId: string) =>
    apiClient<QuestionBank & { items: QuestionBankItem[] }>(`/question-banks/${bankId}`),

  create: (payload: {
    title: string;
    subject: string;
    topic?: string;
    description?: string;
  }) =>
    apiClient<QuestionBank>("/question-banks", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  update: (
    bankId: string,
    payload: {
      title?: string;
      subject?: string;
      topic?: string;
      description?: string;
    }
  ) =>
    apiClient<QuestionBank>(`/question-banks/${bankId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  delete: (bankId: string) =>
    apiClient<{ message: string }>(`/question-banks/${bankId}`, {
      method: "DELETE",
    }),

  getTemplate: () =>
    apiClient<QuestionBankDataset>("/question-banks/template"),

  validateJson: (dataset: any) =>
    apiClient<QuestionValidationSummary>("/question-banks/validate-json", {
      method: "POST",
      body: JSON.stringify(dataset),
    }),

  importJson: (payload: {
    bank_id?: string;
    title?: string;
    subject?: string;
    topic?: string;
    description?: string;
    dataset: QuestionBankDataset;
  }) =>
    apiClient<QuestionBank & { items: QuestionBankItem[] }>("/question-banks/import-json", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  exportJson: (bankId: string) =>
    apiClient<QuestionBankDataset>(`/question-banks/${bankId}/export`),

  // Item APIs
  addItem: (
    bankId: string,
    payload: {
      external_id?: string;
      question_type?: string;
      question_text: string;
      options: string[];
      correct_option_index: number;
      marks?: number;
      negative_marks?: number;
      difficulty?: "easy" | "medium" | "hard";
      topic?: string;
      explanation?: string;
    }
  ) =>
    apiClient<QuestionBankItem>(`/question-banks/${bankId}/items`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateItem: (
    bankId: string,
    itemId: string,
    payload: {
      external_id?: string;
      question_text?: string;
      options?: string[];
      correct_option_index?: number;
      marks?: number;
      negative_marks?: number;
      difficulty?: "easy" | "medium" | "hard";
      topic?: string;
      explanation?: string;
    }
  ) =>
    apiClient<QuestionBankItem>(`/question-banks/${bankId}/items/${itemId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  deleteItem: (bankId: string, itemId: string) =>
    apiClient<{ message: string }>(`/question-banks/${bankId}/items/${itemId}`, {
      method: "DELETE",
    }),
};

