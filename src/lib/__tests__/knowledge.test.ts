import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import {
  proxyKnowledgeDownload,
  proxyKnowledgeUpload,
} from "@/lib/bff/knowledge";
import {
  shouldPollKnowledgeDocuments,
  shouldPollKnowledgeStatus,
  uploadKnowledgeFile,
} from "@/hooks/use-knowledge";
import { ApiError } from "@/lib/api/client";
import type {
  KnowledgeDocument,
  KnowledgeDocumentPage,
} from "@/types/knowledge";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));

const cookiesMock = vi.mocked(cookies);

function authenticate(token = "opaque-token") {
  cookiesMock.mockResolvedValue({
    get: () => ({ value: token }),
  } as Awaited<ReturnType<typeof cookies>>);
}

function uploadRequest(formData: FormData) {
  return new NextRequest("http://localhost/api/knowledge/documents/upload", {
    method: "POST",
    body: formData,
  });
}

class FakeXMLHttpRequest {
  static instances: FakeXMLHttpRequest[] = [];
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  responseText = "";
  status = 0;
  method = "";
  url = "";
  body: FormData | null = null;

  constructor() {
    FakeXMLHttpRequest.instances.push(this);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  send(body: FormData) {
    this.body = body;
  }
}

function documentPayload(
  overrides: Partial<KnowledgeDocument> = {},
): KnowledgeDocument {
  return {
    id: "document-1",
    knowledge_base_id: "base-1",
    original_filename: "guide.txt",
    display_name: "guide",
    file_extension: "txt",
    mime_type: "text/plain",
    size_bytes: 128,
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
    ...overrides,
  };
}

beforeEach(() => {
  cookiesMock.mockReset();
  FakeXMLHttpRequest.instances = [];
  vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest);
});

afterEach(() => vi.unstubAllGlobals());

describe("knowledge BFF", () => {
  it("rejects an upload without an auth cookie", async () => {
    cookiesMock.mockResolvedValue({ get: () => undefined } as Awaited<
      ReturnType<typeof cookies>
    >);
    const response = await proxyKnowledgeUpload(uploadRequest(new FormData()));
    expect(response.status).toBe(401);
  });

  it("rejects tenant_id in multipart form data", async () => {
    authenticate();
    const form = new FormData();
    form.append("tenant_id", "unsafe");
    const response = await proxyKnowledgeUpload(uploadRequest(form));
    expect(response.status).toBe(422);
    expect(await response.text()).toContain("TENANT_ID_FORBIDDEN");
  });

  it("forwards multipart upload with authorization and no manual content type", async () => {
    authenticate();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: {}, message: "ok" }), {
        status: 202,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const form = new FormData();
    form.append("knowledge_base_id", "base-1");
    form.append(
      "file",
      new File(["safe"], "guide.txt", { type: "text/plain" }),
    );
    const response = await proxyKnowledgeUpload(uploadRequest(form));
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(response.status).toBe(202);
    expect(url).toContain("/api/v1/knowledge/documents/upload");
    expect(options.headers).toEqual({ Authorization: "Bearer opaque-token" });
    expect(options.body).toBeInstanceOf(FormData);
  });

  it("preserves backend upload errors", async () => {
    authenticate();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            data: null,
            message: "格式错误",
            error_code: "INVALID_PDF_FORMAT",
          }),
          { status: 415 },
        ),
      ),
    );
    const response = await proxyKnowledgeUpload(uploadRequest(new FormData()));
    expect(response.status).toBe(415);
    expect(await response.text()).toContain("INVALID_PDF_FORMAT");
  });

  it("returns a clear 503 when upload backend is unavailable", async () => {
    authenticate();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const response = await proxyKnowledgeUpload(uploadRequest(new FormData()));
    expect(response.status).toBe(503);
    expect(await response.text()).toContain("KNOWLEDGE_BACKEND_UNAVAILABLE");
  });

  it("rejects a download without an auth cookie", async () => {
    cookiesMock.mockResolvedValue({ get: () => undefined } as Awaited<
      ReturnType<typeof cookies>
    >);
    expect((await proxyKnowledgeDownload("document-1")).status).toBe(401);
  });

  it("streams downloads with safe response headers", async () => {
    authenticate();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("file-content", {
        status: 200,
        headers: {
          "content-type": "text/plain",
          "content-disposition": "attachment; filename=guide.txt",
          "content-length": "12",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const response = await proxyKnowledgeDownload("folder/document 1");
    expect(response.status).toBe(200);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-disposition")).toContain("guide.txt");
    expect(fetchMock.mock.calls[0][0]).toContain(
      "folder%2Fdocument%201/download",
    );
  });

  it("preserves backend download errors", async () => {
    authenticate();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            data: null,
            message: "不存在",
            error_code: "KNOWLEDGE_DOCUMENT_NOT_FOUND",
          }),
          { status: 404 },
        ),
      ),
    );
    const response = await proxyKnowledgeDownload("missing");
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("KNOWLEDGE_DOCUMENT_NOT_FOUND");
  });
});

describe("knowledge upload client", () => {
  it("reports upload progress and resolves a successful response", async () => {
    const progress = vi.fn();
    const promise = uploadKnowledgeFile(
      new File(["safe"], "guide.txt"),
      "base-1",
      progress,
    );
    const request = FakeXMLHttpRequest.instances[0];
    request.upload.onprogress?.({
      lengthComputable: true,
      loaded: 5,
      total: 10,
    } as ProgressEvent);
    request.status = 202;
    request.responseText = JSON.stringify({
      success: true,
      data: documentPayload(),
      message: "ok",
    });
    request.onload?.();
    await expect(promise).resolves.toMatchObject({ id: "document-1" });
    expect(progress).toHaveBeenCalledWith(50);
  });

  it("sends the base id and file in multipart form data", () => {
    void uploadKnowledgeFile(
      new File(["safe"], "guide.txt"),
      "base-9",
      vi.fn(),
    );
    const request = FakeXMLHttpRequest.instances[0];
    expect(request.method).toBe("POST");
    expect(request.url).toBe("/api/knowledge/documents/upload");
    expect(request.body?.get("knowledge_base_id")).toBe("base-9");
    expect((request.body?.get("file") as File).name).toBe("guide.txt");
  });

  it("preserves upload error codes from the BFF", async () => {
    const promise = uploadKnowledgeFile(
      new File(["bad"], "fake.pdf"),
      "base-1",
      vi.fn(),
    );
    const request = FakeXMLHttpRequest.instances[0];
    request.status = 415;
    request.responseText = JSON.stringify({
      message: "格式错误",
      error_code: "INVALID_PDF_FORMAT",
    });
    request.onload?.();
    await expect(promise).rejects.toEqual(
      new ApiError("格式错误", 415, "INVALID_PDF_FORMAT"),
    );
  });

  it("maps malformed upload responses to a readable error", async () => {
    const promise = uploadKnowledgeFile(
      new File(["safe"], "guide.txt"),
      "base-1",
      vi.fn(),
    );
    const request = FakeXMLHttpRequest.instances[0];
    request.status = 502;
    request.responseText = "not-json";
    request.onload?.();
    await expect(promise).rejects.toMatchObject({
      status: 502,
      errorCode: "INVALID_RESPONSE",
    });
  });

  it("maps network failures to a clear 503", async () => {
    const promise = uploadKnowledgeFile(
      new File(["safe"], "guide.txt"),
      "base-1",
      vi.fn(),
    );
    FakeXMLHttpRequest.instances[0].onerror?.();
    await expect(promise).rejects.toMatchObject({
      status: 503,
      errorCode: "KNOWLEDGE_BACKEND_UNAVAILABLE",
    });
  });
});

describe("knowledge polling", () => {
  it.each(["uploaded", "processing"] as const)(
    "polls while status is %s",
    (status) => {
      expect(shouldPollKnowledgeStatus(status)).toBe(2_000);
    },
  );

  it.each(["ready", "failed", "disabled"] as const)(
    "stops polling at %s",
    (status) => {
      expect(shouldPollKnowledgeStatus(status)).toBe(false);
    },
  );

  it("polls a page when any document is still processing", () => {
    const page = {
      items: [documentPayload(), documentPayload({ status: "processing" })],
    } as KnowledgeDocumentPage;
    expect(shouldPollKnowledgeDocuments(page)).toBe(2_000);
  });

  it("stops polling an empty or settled page", () => {
    expect(shouldPollKnowledgeDocuments(undefined)).toBe(false);
    expect(
      shouldPollKnowledgeDocuments({
        items: [documentPayload()],
      } as KnowledgeDocumentPage),
    ).toBe(false);
  });
});
