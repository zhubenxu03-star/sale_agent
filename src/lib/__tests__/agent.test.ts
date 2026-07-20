import { afterEach, describe, expect, it, vi } from "vitest";
import { streamGeneration } from "@/hooks/useAgent";

const completed = {
  id: "generation-1",
  request_id: "request-1",
  status: "completed",
  agent_id: "agent-1",
  customer_id: "customer-1",
  conversation_id: "conversation-1",
  source_message_id: "message-1",
  provider: "test",
  model_name: "deterministic-test-v1",
  embedding_mode: "test",
  prompt_version: "sales-agent-v1",
  config_version: 1,
  result: null,
  reply_text: "建议回复",
  need_human: false,
  human_reason: null,
  confidence: 0.8,
  prompt_tokens: 10,
  completion_tokens: 10,
  total_tokens: 20,
  duration_ms: 5,
  error_code: null,
  error_message: null,
  sources: [],
  created_at: "2026-07-17T00:00:00Z",
  completed_at: "2026-07-17T00:00:01Z",
};

afterEach(() => vi.unstubAllGlobals());

describe("agent SSE client", () => {
  it("uses the same-origin BFF and reports ordered progress", async () => {
    const body = [
      'event: analyzing\ndata: {"message":"正在分析"}\n\n',
      'event: retrieving\ndata: {"message":"正在检索"}\n\n',
      `event: completed\ndata: ${JSON.stringify(completed)}\n\n`,
    ].join("");
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetchMock);
    const events: string[] = [];
    const result = await streamGeneration({ request_id: "request-1" }, (event) => events.push(event));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/agent/generate-stream");
    expect(events).toEqual(["analyzing", "retrieving", "completed"]);
    expect(result.id).toBe("generation-1");
  });

  it("surfaces a server-side SSE error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('event: error\ndata: {"message":"并发请求过多","error_code":"GENERATION_LIMIT_EXCEEDED"}\n\n')));
    await expect(streamGeneration({}, () => undefined)).rejects.toThrow("并发请求过多");
  });

  it("reports an interrupted stream that has no completed event", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('event: generating\ndata: {"message":"生成中"}\n\n')));
    await expect(streamGeneration({}, () => undefined)).rejects.toThrow("生成连接已中断");
  });

  it("never requires a browser-side model credential", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(`event: completed\ndata: ${JSON.stringify(completed)}\n\n`));
    vi.stubGlobal("fetch", fetchMock);
    await streamGeneration({ request_id: "request-1" }, () => undefined);
    const options = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.stringify(options)).not.toMatch(/api[_-]?key|bearer/i);
  });
});
