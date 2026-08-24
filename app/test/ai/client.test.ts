import { describe, expect, it } from "vitest";
import { AiError, chatJson, testConnection } from "../../src/ai/client";
import type { AiSettings } from "../../src/ai/settings";

const settings: AiSettings = {
  baseUrl: "https://api.example.com",
  model: "test-model",
  apiKey: "sk-test",
  persistKey: true,
};

const messages = [{ role: "user" as const, content: "return json" }];

function okResponse(content: string, finishReason = "stop"): Response {
  return new Response(
    JSON.stringify({ choices: [{ finish_reason: finishReason, message: { content } }] }),
    { status: 200 },
  );
}

async function expectKind(promise: Promise<unknown>, kind: string) {
  try {
    await promise;
    expect.fail("expected AiError");
  } catch (err) {
    expect(err).toBeInstanceOf(AiError);
    expect((err as AiError).kind).toBe(kind);
  }
}

describe("chatJson", () => {
  it("parses a clean JSON response", async () => {
    const fetchImpl = async () => okResponse('{"a": 1}');
    expect(await chatJson(settings, messages, fetchImpl)).toEqual({ a: 1 });
  });

  it("strips markdown fences", async () => {
    const fetchImpl = async () => okResponse('```json\n{"a": 2}\n```');
    expect(await chatJson(settings, messages, fetchImpl)).toEqual({ a: 2 });
  });

  it("sends JSON mode, temperature 0, and max_tokens", async () => {
    let body: Record<string, unknown> = {};
    const fetchImpl = async (_url: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(init!.body as string);
      return okResponse("{}");
    };
    await chatJson(settings, messages, fetchImpl);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.temperature).toBe(0);
    expect(body.max_tokens).toBe(8000);
    expect(body.model).toBe("test-model");
  });

  it("refuses to run without a key", async () => {
    await expectKind(chatJson({ ...settings, apiKey: " " }, messages), "no_key");
  });

  it("maps 401 to auth", async () => {
    const fetchImpl = async () => new Response("bad key", { status: 401 });
    await expectKind(chatJson(settings, messages, fetchImpl), "auth");
  });

  it("maps 402 to balance (DeepSeek insufficient funds)", async () => {
    const fetchImpl = async () => new Response("empty wallet", { status: 402 });
    await expectKind(chatJson(settings, messages, fetchImpl), "balance");
  });

  it("maps 429 to rate", async () => {
    const fetchImpl = async () => new Response("slow down", { status: 429 });
    await expectKind(chatJson(settings, messages, fetchImpl), "rate");
  });

  it("maps 500 to server", async () => {
    const fetchImpl = async () => new Response("boom", { status: 500 });
    await expectKind(chatJson(settings, messages, fetchImpl), "server");
  });

  it("maps thrown fetch (CORS/network) to network", async () => {
    const fetchImpl = async () => {
      throw new TypeError("Failed to fetch");
    };
    await expectKind(chatJson(settings, messages, fetchImpl), "network");
  });

  it("treats finish_reason length as truncated without retrying", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return okResponse('{"partial":', "length");
    };
    await expectKind(chatJson(settings, messages, fetchImpl), "truncated");
    expect(calls).toBe(1);
  });

  it("retries once on empty content, then succeeds", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return calls === 1 ? okResponse("") : okResponse('{"ok": true}');
    };
    expect(await chatJson(settings, messages, fetchImpl)).toEqual({ ok: true });
    expect(calls).toBe(2);
  });

  it("fails with badjson after two unparseable responses", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return okResponse("not json at all");
    };
    await expectKind(chatJson(settings, messages, fetchImpl), "badjson");
    expect(calls).toBe(2);
  });
});

describe("testConnection", () => {
  it("passes on 200 from /models", async () => {
    let url = "";
    const fetchImpl = async (u: RequestInfo | URL) => {
      url = String(u);
      return new Response("{}", { status: 200 });
    };
    await testConnection(settings, fetchImpl);
    expect(url).toBe("https://api.example.com/models");
  });

  it("maps 401 to auth", async () => {
    const fetchImpl = async () => new Response("no", { status: 401 });
    await expectKind(testConnection(settings, fetchImpl), "auth");
  });
});
