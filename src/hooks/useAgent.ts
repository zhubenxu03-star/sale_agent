"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";
import type {
  AgentConfig,
  AgentServiceStatus,
  Generation,
  Message,
  SalesAgent,
} from "@/types/api";

export function useDefaultAgent() {
  return useQuery({
    queryKey: ["agent", "default"],
    queryFn: () => apiRequest<SalesAgent>("/api/agents/default"),
  });
}

export function useAgentStatus() {
  return useQuery({
    queryKey: ["agent", "status"],
    queryFn: () => apiRequest<AgentServiceStatus>("/api/agent/status"),
    refetchInterval: 30_000,
  });
}

export function useLatestGeneration(conversationId?: string) {
  return useQuery({
    queryKey: ["agent", "generations", conversationId],
    queryFn: () =>
      apiRequest<{ items: Generation[]; total: number; page: number; page_size: number }>(
        `/api/agent/generations?conversation_id=${conversationId}&page_size=1`,
      ),
    enabled: Boolean(conversationId),
  });
}

export function useAgentConfig(agentId?: string) {
  return useQuery({
    queryKey: ["agent", agentId, "config"],
    queryFn: () => apiRequest<AgentConfig>(`/api/agents/${agentId}/config`),
    enabled: Boolean(agentId),
  });
}

export function useUpdateAgentConfig(agentId?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<AgentConfig>) =>
      apiRequest<AgentConfig>(`/api/agents/${agentId}/config`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["agent", agentId, "config"] }),
  });
}

export async function streamGeneration(
  body: Record<string, unknown>,
  onEvent: (event: string, data: unknown) => void,
  signal?: AbortSignal,
): Promise<Generation> {
  const response = await fetch("/api/agent/generate-stream", {
    method: "POST",
    headers: { Accept: "text/event-stream", "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal,
  });
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message || "生成服务暂时不可用");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed: Generation | undefined;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() || "";
    for (const frame of frames) {
      const event = frame.match(/^event: (.+)$/m)?.[1] || "message";
      const raw = frame.match(/^data: (.+)$/m)?.[1];
      if (!raw) continue;
      const data = JSON.parse(raw);
      onEvent(event, data);
      if (event === "error") throw new Error(data.message || "生成失败");
      if (event === "completed") completed = data as Generation;
    }
  }
  if (!completed) throw new Error("生成连接已中断，可刷新后恢复生成记录");
  return completed;
}

export function useSaveGeneration(conversationId?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reply_text, confirmed_human_review }: { id: string; reply_text: string; confirmed_human_review: boolean }) =>
      apiRequest<Message>(`/api/agent/generations/${id}/save-message`, {
        method: "POST",
        body: JSON.stringify({ reply_text, confirmed_human_review }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["messages", conversationId] }),
  });
}

export function useGenerationFeedback() {
  return useMutation({
    mutationFn: ({ id, rating, adopted, edited_before_save }: { id: string; rating: "helpful" | "not_helpful"; adopted: boolean; edited_before_save: boolean }) =>
      apiRequest(`/api/agent/generations/${id}/feedback`, {
        method: "POST",
        body: JSON.stringify({ rating, adopted, edited_before_save }),
      }),
  });
}
