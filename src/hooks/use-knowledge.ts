"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiRequest } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import type { ApiResponse } from "@/types/api";
import type {
  KnowledgeBase,
  KnowledgeChunkPage,
  KnowledgeDocument,
  KnowledgeDocumentPage,
  KnowledgeSearchData,
  KnowledgeSearchInput,
} from "@/types/knowledge";

export function shouldPollKnowledgeStatus(
  status: KnowledgeDocument["status"] | undefined,
): number | false {
  return status && ["uploaded", "processing"].includes(status) ? 2_000 : false;
}

export function shouldPollKnowledgeDocuments(
  page: KnowledgeDocumentPage | undefined,
): number | false {
  return page?.items.some((item) => shouldPollKnowledgeStatus(item.status))
    ? 2_000
    : false;
}

export function useKnowledgeBases(enabled = true) {
  return useQuery({
    queryKey: queryKeys.knowledgeBases,
    queryFn: () => apiRequest<KnowledgeBase[]>("/api/knowledge/bases"),
    enabled,
  });
}

export function useKnowledgeConfig() {
  return useQuery({
    queryKey: queryKeys.knowledgeConfig,
    queryFn: () =>
      apiRequest<{ embedding_mode: "test" | "production" }>(
        "/api/knowledge/config",
      ),
  });
}

export function useKnowledgeDocuments(baseId?: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.knowledgeDocuments(baseId),
    queryFn: () =>
      apiRequest<KnowledgeDocumentPage>(
        `/api/knowledge/documents?page_size=100${baseId ? `&knowledge_base_id=${baseId}` : ""}`,
      ),
    enabled,
    refetchInterval: (query) => shouldPollKnowledgeDocuments(query.state.data),
  });
}

export function useKnowledgeDocument(documentId?: string) {
  return useQuery({
    queryKey: queryKeys.knowledgeDocument(documentId),
    queryFn: () =>
      apiRequest<KnowledgeDocument>(`/api/knowledge/documents/${documentId}`),
    enabled: Boolean(documentId),
    refetchInterval: (query) =>
      shouldPollKnowledgeStatus(query.state.data?.status),
  });
}

export function useKnowledgeChunks(documentId?: string, page = 1) {
  return useQuery({
    queryKey: queryKeys.knowledgeChunks(documentId, page),
    queryFn: () =>
      apiRequest<KnowledgeChunkPage>(
        `/api/knowledge/documents/${documentId}/chunks?page=${page}&page_size=10`,
      ),
    enabled: Boolean(documentId),
  });
}

export function uploadKnowledgeFile(
  file: File,
  baseId: string,
  onProgress: (progress: number) => void,
): Promise<KnowledgeDocument> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/knowledge/documents/upload");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      let payload:
        | ApiResponse<KnowledgeDocument>
        | { message?: string; error_code?: string };
      try {
        payload = JSON.parse(request.responseText);
      } catch {
        reject(
          new ApiError(
            "上传响应无法解析",
            request.status || 500,
            "INVALID_RESPONSE",
          ),
        );
        return;
      }
      if (request.status >= 200 && request.status < 300 && "data" in payload) {
        resolve(payload.data);
      } else {
        reject(
          new ApiError(
            payload.message || "文件上传失败",
            request.status || 500,
            "error_code" in payload && payload.error_code
              ? payload.error_code
              : "UPLOAD_FAILED",
          ),
        );
      }
    };
    request.onerror = () =>
      reject(
        new ApiError(
          "知识库服务暂时不可用",
          503,
          "KNOWLEDGE_BACKEND_UNAVAILABLE",
        ),
      );
    const formData = new FormData();
    formData.append("knowledge_base_id", baseId);
    formData.append("file", file);
    request.send(formData);
  });
}

export function useCreateKnowledgeBase() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string; description?: string }) =>
      apiRequest<KnowledgeBase>("/api/knowledge/bases", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: queryKeys.knowledgeBases }),
  });
}

export function useUpdateKnowledgeBase(baseId?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      name?: string;
      description?: string;
      status?: "active" | "disabled";
    }) =>
      apiRequest<KnowledgeBase>(`/api/knowledge/bases/${baseId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: queryKeys.knowledgeBases }),
  });
}

export function useDeleteKnowledgeBase() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (baseId: string) =>
      apiRequest<{ id: string }>(`/api/knowledge/bases/${baseId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: queryKeys.knowledgeBases });
      client.invalidateQueries({ queryKey: ["knowledge", "documents"] });
    },
  });
}

export function useKnowledgeDocumentAction(baseId?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: "reprocess" | "disable" | "enable" | "delete";
    }) => {
      if (action === "delete") {
        return apiRequest(`/api/knowledge/documents/${id}`, {
          method: "DELETE",
        });
      }
      return apiRequest(`/api/knowledge/documents/${id}/${action}`, {
        method: action === "reprocess" ? "POST" : "PATCH",
      });
    },
    onSuccess: () => {
      client.invalidateQueries({
        queryKey: queryKeys.knowledgeDocuments(baseId),
      });
      client.invalidateQueries({ queryKey: queryKeys.knowledgeBases });
    },
  });
}

export function useKnowledgeSearch() {
  return useMutation({
    mutationFn: (payload: KnowledgeSearchInput) =>
      apiRequest<KnowledgeSearchData>("/api/knowledge/search", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  });
}
