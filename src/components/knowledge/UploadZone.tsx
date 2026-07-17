"use client";

import { useRef, useState } from "react";
import { uploadKnowledgeFile } from "@/hooks/use-knowledge";

export interface UploadState {
  name: string;
  progress: number;
  status: "uploading" | "success" | "error";
  message?: string;
}

export function UploadZone({
  baseId,
  disabled,
  onUploaded,
}: {
  baseId?: string;
  disabled: boolean;
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<UploadState[]>([]);

  const upload = async (files: FileList | File[]) => {
    if (!baseId || disabled) return;
    const list = Array.from(files);
    setUploads(
      list.map((file) => ({
        name: file.name,
        progress: 0,
        status: "uploading",
      })),
    );
    await Promise.allSettled(
      list.map(async (file, index) => {
        try {
          await uploadKnowledgeFile(file, baseId, (progress) =>
            setUploads((current) =>
              current.map((item, itemIndex) =>
                itemIndex === index ? { ...item, progress } : item,
              ),
            ),
          );
          setUploads((current) =>
            current.map((item, itemIndex) =>
              itemIndex === index
                ? {
                    ...item,
                    progress: 100,
                    status: "success",
                    message: "上传成功，等待处理",
                  }
                : item,
            ),
          );
        } catch (error) {
          setUploads((current) =>
            current.map((item, itemIndex) =>
              itemIndex === index
                ? {
                    ...item,
                    status: "error",
                    message:
                      error instanceof Error ? error.message : "上传失败",
                  }
                : item,
            ),
          );
        }
      }),
    );
    onUploaded();
  };

  return (
    <div>
      <div
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void upload(event.dataTransfer.files);
        }}
        className={`rounded-[14px] border border-dashed p-5 text-center transition ${dragging ? "border-[var(--gold)] bg-[var(--gold-soft)]" : "border-[var(--border-strong)] bg-[var(--surface-muted)]/55"}`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.md,.xlsx,.csv"
          className="sr-only"
          onChange={(event) =>
            event.target.files && void upload(event.target.files)
          }
        />
        <p className="text-xs font-medium text-[var(--navy)]">
          拖拽文件到此处，或点击选择文件
        </p>
        <p className="mt-1 text-[9px] text-[var(--text-muted)]">
          PDF、DOCX、TXT、MD、XLSX、CSV · 单文件不超过20MB
        </p>
        <button
          type="button"
          disabled={disabled || !baseId}
          onClick={() => inputRef.current?.click()}
          className="mt-3 h-8 rounded-lg bg-[var(--navy)] px-4 text-[10px] text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          选择文件
        </button>
      </div>
      {uploads.length > 0 && (
        <div className="mt-3 space-y-2">
          {uploads.map((item) => (
            <div
              key={item.name}
              className="rounded-lg border border-[var(--border)] bg-white px-3 py-2"
            >
              <div className="flex justify-between text-[9px]">
                <span className="truncate text-[var(--text)]">{item.name}</span>
                <span
                  className={
                    item.status === "error"
                      ? "text-[#9A463D]"
                      : "text-[var(--text-muted)]"
                  }
                >
                  {item.message || `${item.progress}%`}
                </span>
              </div>
              <div className="mt-1.5 h-1 rounded-full bg-[var(--surface-muted)]">
                <div
                  className={`h-full rounded-full ${item.status === "error" ? "bg-[#B66A60]" : "bg-[var(--gold)]"}`}
                  style={{ width: `${item.progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
