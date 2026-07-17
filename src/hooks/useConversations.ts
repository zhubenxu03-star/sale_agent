"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import type {
  Conversation,
  Message,
  PageData,
  SenderType,
} from "@/types/api";

export function useConversations(customerId?: string) {
  const params = new URLSearchParams({ page_size: "100" });
  if (customerId) params.set("customer_id", customerId);
  return useQuery({
    queryKey: queryKeys.conversations(customerId),
    queryFn: () => apiRequest<PageData<Conversation>>(`/api/conversations?${params}`),
    enabled: Boolean(customerId),
  });
}

export function useCreateConversation(customerId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (title: string) =>
      apiRequest<Conversation>("/api/conversations", {
        method: "POST",
        body: JSON.stringify({ customer_id: customerId, title }),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations(customerId) }),
  });
}

export function useArchiveConversation(customerId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) =>
      apiRequest<Conversation>(`/api/conversations/${conversationId}/archive`, {
        method: "PATCH",
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations(customerId) }),
  });
}

export function useMessages(conversationId?: string) {
  return useQuery({
    queryKey: queryKeys.messages(conversationId),
    queryFn: () =>
      apiRequest<Message[]>(`/api/conversations/${conversationId}/messages`),
    enabled: Boolean(conversationId),
  });
}

export function useCreateMessage(conversationId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sender_type, content }: { sender_type: SenderType; content: string }) =>
      apiRequest<Message>(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          sender_type,
          content,
          metadata_json:
            sender_type === "assistant" ? { generation_mode: "local_mock" } : null,
        }),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.messages(conversationId) }),
  });
}
