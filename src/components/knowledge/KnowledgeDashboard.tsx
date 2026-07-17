"use client";

import { useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/customers/ConfirmDialog";
import { Header } from "@/components/Header";
import {
  ChunkDrawer,
  DocumentDetailDrawer,
} from "@/components/knowledge/KnowledgeDrawers";
import { DocumentTable } from "@/components/knowledge/DocumentTable";
import { KnowledgeBaseDialog } from "@/components/knowledge/KnowledgeBaseDialog";
import { KnowledgeSearchPanel } from "@/components/knowledge/KnowledgeSearchPanel";
import { UploadZone } from "@/components/knowledge/UploadZone";
import { StatusBadge } from "@/components/knowledge/StatusBadge";
import { useToast } from "@/components/providers/AppProviders";
import { Sidebar } from "@/components/Sidebar";
import { useCurrentUser } from "@/hooks/useAuth";
import {
  useCreateKnowledgeBase,
  useDeleteKnowledgeBase,
  useKnowledgeBases,
  useKnowledgeConfig,
  useKnowledgeDocumentAction,
  useKnowledgeDocuments,
  useUpdateKnowledgeBase,
} from "@/hooks/use-knowledge";
import type { KnowledgeDocument } from "@/types/knowledge";

export function KnowledgeDashboard() {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedBase, setSelectedBase] = useState("");
  const [baseDialog, setBaseDialog] = useState<"create" | "edit" | null>(null);
  const [detail, setDetail] = useState<KnowledgeDocument>();
  const [chunkDocument, setChunkDocument] = useState<KnowledgeDocument>();
  const [chunkPage, setChunkPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "base" | "document";
    id: string;
    name: string;
  }>();
  const identity = useCurrentUser();
  const basesQuery = useKnowledgeBases();
  const configQuery = useKnowledgeConfig();
  const bases = useMemo(() => basesQuery.data || [], [basesQuery.data]);
  const selectedBaseId = bases.some((item) => item.id === selectedBase)
    ? selectedBase
    : bases[0]?.id;
  const currentBase = bases.find((item) => item.id === selectedBaseId);
  const allDocumentsQuery = useKnowledgeDocuments();
  const documentsQuery = useKnowledgeDocuments(
    selectedBaseId,
    Boolean(selectedBaseId),
  );
  const documents = useMemo(
    () => documentsQuery.data?.items || [],
    [documentsQuery.data],
  );
  const allDocuments = useMemo(
    () => allDocumentsQuery.data?.items || [],
    [allDocumentsQuery.data],
  );
  const createBase = useCreateKnowledgeBase();
  const updateBase = useUpdateKnowledgeBase(selectedBaseId);
  const deleteBase = useDeleteKnowledgeBase();
  const documentAction = useKnowledgeDocumentAction(selectedBaseId);
  const { showToast } = useToast();
  const stats = useMemo(
    () => ({
      files: bases.reduce((sum, item) => sum + item.document_count, 0),
      ready: allDocuments.filter((item) => item.status === "ready").length,
      processing: allDocuments.filter((item) =>
        ["uploaded", "processing"].includes(item.status),
      ).length,
      failed: allDocuments.filter((item) => item.status === "failed").length,
      chunks: bases.reduce((sum, item) => sum + item.chunk_count, 0),
    }),
    [allDocuments, bases],
  );
  if (!identity.data) return null;
  const role = identity.data.user.role;
  const handleBase = async (values: { name: string; description?: string }) => {
    try {
      const saved =
        baseDialog === "edit"
          ? await updateBase.mutateAsync(values)
          : await createBase.mutateAsync(values);
      setSelectedBase(saved.id);
      setBaseDialog(null);
      showToast("知识库已保存", "success");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "知识库保存失败",
        "error",
      );
    }
  };
  const handleAction = async (
    item: KnowledgeDocument,
    action: "reprocess" | "disable" | "enable",
  ) => {
    try {
      await documentAction.mutateAsync({ id: item.id, action });
      showToast(
        action === "reprocess" ? "已提交重新处理任务" : "文件状态已更新",
        "success",
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : "操作失败", "error");
    }
  };
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === "base") {
        await deleteBase.mutateAsync(deleteTarget.id);
        setSelectedBase("");
      } else {
        await documentAction.mutateAsync({
          id: deleteTarget.id,
          action: "delete",
        });
      }
      setDeleteTarget(undefined);
      showToast("删除成功", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "删除失败", "error");
    }
  };
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Sidebar
        identity={identity.data}
        customers={[]}
        collapsed={collapsed}
        activeLabel="知识库管理"
      />
      <Header
        identity={identity.data}
        collapsed={collapsed}
        onToggleSidebar={() => setCollapsed((value) => !value)}
        title="企业知识库"
        subtitle="企业资料上传、解析与智能检索"
      />
      <main
        className={`mt-16 min-h-[calc(100vh-64px)] p-[18px] transition-[margin] 2xl:p-6 ${collapsed ? "ml-[72px]" : "ml-[220px]"}`}
      >
        <div className="mx-auto min-w-[1000px] max-w-[1800px] space-y-4">
          <header className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-semibold text-[var(--navy)]">
                企业知识库
              </h1>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                集中管理企业产品、服务、价格、案例、交付和常见问题资料。
              </p>
            </div>
            {configQuery.data?.embedding_mode === "test" && (
              <span className="rounded-lg border border-[#E4C99F] bg-[var(--gold-soft)] px-3 py-2 text-[9px] text-[var(--gold-deep)]">
                当前使用测试向量模式，仅用于验证系统流程，不能代表正式语义检索质量。
              </span>
            )}
          </header>
          <section className="grid grid-cols-6 gap-3">
            {[
              ["知识库数量", bases.length],
              ["文件数量", stats.files],
              ["已完成文件", stats.ready],
              ["处理中", stats.processing],
              ["处理失败", stats.failed],
              ["知识片段数量", stats.chunks],
            ].map(([label, value]) => (
              <article key={label} className="panel-card p-4">
                <p className="text-[9px] text-[var(--text-muted)]">{label}</p>
                <p className="mt-2 text-xl font-semibold text-[var(--navy)]">
                  {value}
                </p>
              </article>
            ))}
          </section>
          <div className="grid grid-cols-[280px_minmax(0,1fr)] gap-4">
            <aside className="panel-card overflow-hidden">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                <h2 className="text-xs font-semibold text-[var(--navy)]">
                  知识库列表
                </h2>
                {role === "admin" && (
                  <button
                    onClick={() => setBaseDialog("create")}
                    className="rounded-lg bg-[var(--gold-soft)] px-2.5 py-1.5 text-[9px] text-[var(--gold-deep)]"
                  >
                    + 新建
                  </button>
                )}
              </div>
              {basesQuery.isPending ? (
                <div className="m-4 h-24 animate-pulse rounded-xl bg-[var(--surface-muted)]" />
              ) : basesQuery.isError ? (
                <div className="m-4 rounded-xl border border-[#E7C8C4] bg-[#FFF7F6] p-3 text-[10px] text-[#9A463D]">
                  {basesQuery.error.message}
                  <button
                    onClick={() => basesQuery.refetch()}
                    className="ml-2 underline"
                  >
                    重试
                  </button>
                </div>
              ) : (
                <div className="space-y-1 p-2">
                  {bases.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setSelectedBase(item.id)}
                      className={`w-full rounded-xl p-3 text-left ${item.id === selectedBaseId ? "bg-[var(--navy-soft)]" : "hover:bg-[var(--surface-muted)]"}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-[var(--navy)]">
                          {item.name}
                        </span>
                        <span className="text-[9px] text-[var(--text-muted)]">
                          {item.status === "active" ? "启用" : "停用"}
                        </span>
                      </div>
                      <p className="mt-1 text-[9px] text-[var(--text-light)]">
                        {item.document_count} 个文件 ·{" "}
                        {new Date(item.created_at).toLocaleDateString("zh-CN")}
                      </p>
                      {role === "admin" && item.id === selectedBaseId && (
                        <span className="mt-2 flex gap-2">
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(event) => {
                              event.stopPropagation();
                              setBaseDialog("edit");
                            }}
                            className="text-[9px] text-[var(--gold-deep)]"
                          >
                            编辑
                          </span>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(event) => {
                              event.stopPropagation();
                              void updateBase.mutateAsync({
                                status:
                                  item.status === "active"
                                    ? "disabled"
                                    : "active",
                              });
                            }}
                            className="text-[9px] text-[var(--gold-deep)]"
                          >
                            {item.status === "active" ? "停用" : "启用"}
                          </span>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(event) => {
                              event.stopPropagation();
                              setDeleteTarget({
                                type: "base",
                                id: item.id,
                                name: item.name,
                              });
                            }}
                            className="text-[9px] text-[#9A463D]"
                          >
                            删除
                          </span>
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </aside>
            <section className="space-y-4">
              <div className="panel-card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-[var(--navy)]">
                      文件管理 · {currentBase?.name || "暂无知识库"}
                    </h2>
                    <p className="mt-1 text-[9px] text-[var(--text-muted)]">
                      文件通过异步任务解析、切片并写入pgvector
                    </p>
                  </div>
                  {currentBase && (
                    <StatusBadge
                      status={
                        currentBase.status === "active" ? "ready" : "disabled"
                      }
                    />
                  )}
                </div>
                {role === "sales" ? (
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-[10px] text-[var(--text-muted)]">
                    销售角色可查看已完成文件、下载和检索；上传与切片管理仅向管理员和经理开放。
                  </div>
                ) : (
                  <UploadZone
                    baseId={selectedBaseId}
                    disabled={!currentBase || currentBase.status !== "active"}
                    onUploaded={() => void documentsQuery.refetch()}
                  />
                )}
              </div>
              <div className="panel-card overflow-hidden">
                <DocumentTable
                  documents={documents}
                  loading={documentsQuery.isPending}
                  role={role}
                  onDetail={setDetail}
                  onChunks={(item) => {
                    setChunkPage(1);
                    setChunkDocument(item);
                  }}
                  onAction={(item, action) => void handleAction(item, action)}
                  onDelete={(item) =>
                    setDeleteTarget({
                      type: "document",
                      id: item.id,
                      name: item.original_filename,
                    })
                  }
                />
                {documentsQuery.isError && (
                  <div className="m-4 rounded-xl border border-[#E7C8C4] bg-[#FFF7F6] p-3 text-[10px] text-[#9A463D]">
                    {documentsQuery.error.message}
                    <button
                      onClick={() => documentsQuery.refetch()}
                      className="ml-2 underline"
                    >
                      重试
                    </button>
                  </div>
                )}
              </div>
            </section>
          </div>
          <KnowledgeSearchPanel bases={bases} />
        </div>
      </main>
      <KnowledgeBaseDialog
        key={`${baseDialog || "closed"}-${currentBase?.id || "new"}`}
        open={Boolean(baseDialog)}
        item={baseDialog === "edit" ? currentBase : undefined}
        pending={createBase.isPending || updateBase.isPending}
        onClose={() => setBaseDialog(null)}
        onSubmit={handleBase}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`确认删除${deleteTarget?.type === "base" ? "知识库" : "文件"}？`}
        description={`“${deleteTarget?.name || ""}”删除后，其文件、切片、向量和任务记录将无法恢复。`}
        pending={deleteBase.isPending || documentAction.isPending}
        onClose={() => setDeleteTarget(undefined)}
        onConfirm={() => void confirmDelete()}
      />
      <DocumentDetailDrawer
        document={detail}
        onClose={() => setDetail(undefined)}
      />
      <ChunkDrawer
        document={chunkDocument}
        page={chunkPage}
        onPage={setChunkPage}
        onClose={() => setChunkDocument(undefined)}
      />
    </div>
  );
}
