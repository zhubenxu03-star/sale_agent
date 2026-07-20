// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentTable } from "@/components/knowledge/DocumentTable";
import { KnowledgeSearchPanel } from "@/components/knowledge/KnowledgeSearchPanel";
import { StatusBadge } from "@/components/knowledge/StatusBadge";
import { KnowledgePanel } from "@/components/KnowledgePanel";
import type {
  KnowledgeBase,
  KnowledgeDocument,
  KnowledgeSearchData,
} from "@/types/knowledge";

const hookMocks = vi.hoisted(() => ({
  bases: vi.fn(),
  documents: vi.fn(),
  search: vi.fn(),
}));

vi.mock("@/hooks/use-knowledge", () => ({
  useKnowledgeBases: hookMocks.bases,
  useKnowledgeDocuments: hookMocks.documents,
  useKnowledgeSearch: hookMocks.search,
}));

const base: KnowledgeBase = {
  id: "base-1",
  name: "企业知识库",
  description: "产品资料",
  knowledge_type: "company",
  status: "active",
  created_by_user_id: "user-1",
  created_at: "2026-07-17T00:00:00Z",
  updated_at: "2026-07-17T00:00:00Z",
  document_count: 1,
  ready_document_count: 1,
  chunk_count: 2,
};

const document: KnowledgeDocument = {
  id: "document-1",
  knowledge_base_id: "base-1",
  original_filename: "ERP对接方案.pdf",
  display_name: "ERP对接方案",
  file_extension: "pdf",
  mime_type: "application/pdf",
  size_bytes: 2048,
  sha256: "a".repeat(64),
  status: "ready",
  processing_stage: "completed",
  progress: 100,
  chunk_count: 2,
  error_code: null,
  error_message: null,
  uploaded_by_user_id: "user-1",
  uploaded_by_name: "管理员",
  created_at: "2026-07-17T00:00:00Z",
  updated_at: "2026-07-17T00:00:00Z",
  processed_at: "2026-07-17T00:00:00Z",
};

function searchState(data?: KnowledgeSearchData) {
  return {
    data,
    isPending: false,
    isError: false,
    error: null,
    mutate: vi.fn(),
  };
}

beforeEach(() => {
  hookMocks.bases.mockReturnValue({
    data: [base],
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  });
  hookMocks.documents.mockReturnValue({
    data: {
      items: [document],
      page: 1,
      page_size: 20,
      total: 1,
      total_pages: 1,
    },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  });
  hookMocks.search.mockReturnValue(searchState());
});

afterEach(cleanup);

describe("knowledge status and role presentation", () => {
  it("shows text and an icon for each document status", () => {
    render(
      <div>
        <StatusBadge status="processing" stage="embedding" />
        <StatusBadge status="failed" />
        <StatusBadge status="disabled" />
      </div>,
    );
    expect(screen.getByText("正在生成向量")).toBeInTheDocument();
    expect(screen.getByText("处理失败")).toBeInTheDocument();
    expect(screen.getByText("已停用")).toBeInTheDocument();
  });

  it("hides management actions from sales while keeping download", () => {
    render(
      <DocumentTable
        documents={[document]}
        loading={false}
        role="sales"
        onDetail={vi.fn()}
        onChunks={vi.fn()}
        onAction={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "切片" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "重处理" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "删除" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "下载" })).toHaveAttribute(
      "href",
      "/api/knowledge/documents/document-1/download",
    );
  });

  it("shows failed document details without relying on color", () => {
    render(
      <DocumentTable
        documents={[
          {
            ...document,
            status: "failed",
            processing_stage: "failed",
            progress: 55,
            error_message: "该PDF可能是扫描文件，当前版本暂不支持OCR识别。",
          },
        ]}
        loading={false}
        role="admin"
        onDetail={vi.fn()}
        onChunks={vi.fn()}
        onAction={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getAllByText("处理失败").length).toBeGreaterThan(0);
    expect(screen.getByTitle(/扫描文件/)).toBeInTheDocument();
  });
});

describe("knowledge retrieval presentation", () => {
  it("shows the real empty state without mock results", () => {
    hookMocks.search.mockReturnValue(
      searchState({
        query: "无结果",
        results: [],
        embedding_mode: "production",
        duration_ms: 8,
      }),
    );
    render(<KnowledgeSearchPanel bases={[base]} />);
    expect(
      screen.getByText("没有检索到达到当前相关度要求的企业资料。"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Mock/i)).not.toBeInTheDocument();
  });

  it("renders citation, source and relevance from the API result", () => {
    hookMocks.search.mockReturnValue(
      searchState({
        query: "U8 Cloud",
        embedding_mode: "production",
        duration_ms: 12,
        results: [
          {
            chunk_id: "chunk-1",
            document_id: "document-1",
            document_name: "ERP对接方案.pdf",
            content: "系统支持与用友 U8 Cloud 进行标准接口对接。",
            score: 0.89,
            page_number: 8,
            sheet_name: null,
            row_start: null,
            row_end: null,
            section_title: "U8 Cloud对接能力",
            citation_label: "ERP对接方案.pdf，第8页",
          },
        ],
      }),
    );
    render(<KnowledgeSearchPanel bases={[base]} />);
    expect(screen.getByText("相关度 89.0%")).toBeInTheDocument();
    expect(screen.getByText("ERP对接方案.pdf，第8页")).toBeInTheDocument();
    expect(screen.getByText(/U8 Cloud对接能力/)).toBeInTheDocument();
  });

  it("shows the test embedding warning", () => {
    hookMocks.search.mockReturnValue(
      searchState({
        query: "test",
        results: [],
        embedding_mode: "test",
        duration_ms: 2,
      }),
    );
    render(<KnowledgeSearchPanel bases={[base]} />);
    expect(screen.getByText(/测试向量模式/)).toBeInTheDocument();
    expect(screen.getByText(/不代表正式语义检索质量/)).toBeInTheDocument();
  });
});

describe("workbench knowledge integration", () => {
  it("uses the latest customer message as the search query", () => {
    const mutate = vi.fn();
    hookMocks.search.mockReturnValue({ ...searchState(), mutate });
    render(<KnowledgePanel latestCustomerMessage="系统支持U8 Cloud对接吗？" />);
    fireEvent.click(
      screen.getByRole("button", { name: "按最新客户消息检索" }),
    );
    expect(mutate).toHaveBeenCalledWith({
      query: "系统支持U8 Cloud对接吗？",
      top_k: 4,
      min_score: 0.2,
    });
  });

  it("disables workbench retrieval when there is no customer message", () => {
    render(<KnowledgePanel />);
    const button = screen.getByRole("button", { name: "按最新客户消息检索" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "当前会话还没有客户消息");
  });
});
