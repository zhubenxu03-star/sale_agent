"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";
import type { ChampionCard, ChampionPreview, ChampionSearchResult, ChampionSource, ChampionStats } from "@/types/champion";

const key = ["champion"];

export function useChampionSources() {
  return useQuery({ queryKey: [...key, "sources"], queryFn: () => apiRequest<ChampionSource[]>("/api/champion/sources") });
}

export function useChampionCards(status?: string) {
  return useQuery({ queryKey: [...key, "cards", status], queryFn: () => apiRequest<ChampionCard[]>(`/api/champion/cards${status ? `?status=${encodeURIComponent(status)}` : ""}`) });
}

export function useChampionStats() {
  return useQuery({ queryKey: [...key, "stats"], queryFn: () => apiRequest<ChampionStats>("/api/champion/stats") });
}

export function useChampionPreview(sourceId?: string) {
  return useQuery({ queryKey: [...key, "preview", sourceId], queryFn: () => apiRequest<ChampionPreview>(`/api/champion/sources/${sourceId}/preview`), enabled: Boolean(sourceId) });
}

export function useChampionSearch() {
  return useMutation({ mutationFn: (payload: { query: string; industry?: string; sales_stage?: string; top_k?: number; min_score?: number }) => apiRequest<ChampionSearchResult[]>("/api/champion/search", { method: "POST", body: JSON.stringify(payload) }) });
}

export function useChampionAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reject" | "disable" | "enable" | "delete" }) => apiRequest(`/api/champion/cards/${id}${action === "delete" ? "" : `/${action}`}`, { method: action === "delete" ? "DELETE" : "POST" }),
    onSuccess: () => { void client.invalidateQueries({ queryKey: key }); },
  });
}

export async function uploadChampionFile(file: File, values: { name?: string; source_type: string; retain_original: boolean }, onProgress: (progress: number) => void) {
  return new Promise<ChampionSource>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/champion/sources/upload");
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); };
    xhr.onload = () => { try { const payload = JSON.parse(xhr.responseText); if (xhr.status >= 200 && xhr.status < 300) resolve(payload.data); else reject(new Error(payload.message || "上传失败")); } catch { reject(new Error("上传响应格式无效")); } };
    xhr.onerror = () => reject(new Error("销冠知识库服务暂时不可用"));
    const form = new FormData(); form.append("file", file); if (values.name) form.append("name", values.name); form.append("source_type", values.source_type); form.append("retain_original", String(values.retain_original)); xhr.send(form);
  });
}

export async function setChampionMapping(sourceId: string, mapping: object) {
  return apiRequest<ChampionSource>(`/api/champion/sources/${sourceId}/mapping`, { method: "PUT", body: JSON.stringify(mapping) });
}

export async function processChampionSource(sourceId: string) {
  return apiRequest<ChampionSource>(`/api/champion/sources/${sourceId}/process`, { method: "POST" });
}
