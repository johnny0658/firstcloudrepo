import type { AiSettings } from "./settings";

export type AiErrorKind =
  | "no_key"
  | "network"
  | "auth"
  | "balance"
  | "rate"
  | "request"
  | "server"
  | "truncated"
  | "badjson";

export class AiError extends Error {
  kind: AiErrorKind;
  detail?: string;

  constructor(kind: AiErrorKind, message: string, detail?: string) {
    super(message);
    this.kind = kind;
    this.detail = detail;
  }
}

const KIND_MESSAGES: Record<AiErrorKind, string> = {
  no_key: "No API key set. Paste your API key in the settings above first.",
  network:
    "Could not reach the API. Possible causes: no internet connection, a wrong base URL, or the provider blocking browser requests (CORS). DeepSeek and OpenAI allow browser use; some providers don't.",
  auth: "The API key was rejected (401). Check that it's copied correctly and still active.",
  balance: "The provider reports insufficient balance on your account (402). Top up your account and retry.",
  rate: "Rate limited by the provider (429). Wait a moment and try again.",
  request: "The provider rejected the request (400). Check the model name in settings.",
  server: "The provider had an internal error (5xx). Try again shortly.",
  truncated:
    "The model's response was cut off before it finished. The document may be too complex — try a shorter statement.",
  badjson: "The model returned something that isn't valid JSON, twice in a row.",
};

export function aiErrorMessage(err: unknown): string {
  if (err instanceof AiError) return KIND_MESSAGES[err.kind];
  return err instanceof Error ? err.message : String(err);
}

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

function stripFences(text: string): string {
  const m = text.match(/^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/);
  return m ? m[1] : text;
}

function statusToError(status: number, body: string): AiError {
  if (status === 401 || status === 403) return new AiError("auth", KIND_MESSAGES.auth, body);
  if (status === 402) return new AiError("balance", KIND_MESSAGES.balance, body);
  if (status === 429) return new AiError("rate", KIND_MESSAGES.rate, body);
  if (status >= 500) return new AiError("server", KIND_MESSAGES.server, body);
  return new AiError("request", KIND_MESSAGES.request, body);
}

export type FetchLike = typeof fetch;

/**
 * OpenAI-compatible chat call in JSON mode. Returns the parsed JSON object.
 * Retries once automatically on empty content or unparseable JSON (a
 * documented occasional quirk of DeepSeek's JSON mode); a truncated response
 * (finish_reason "length") is a distinct error and is not retried.
 */
export async function chatJson(
  settings: AiSettings,
  messages: ChatMessage[],
  fetchImpl: FetchLike = fetch,
): Promise<unknown> {
  if (!settings.apiKey.trim()) throw new AiError("no_key", KIND_MESSAGES.no_key);

  const url = settings.baseUrl.replace(/\/+$/, "") + "/chat/completions";
  let lastErr: AiError | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    let resp: Response;
    try {
      resp = await fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: settings.model,
          messages,
          response_format: { type: "json_object" },
          temperature: 0,
          max_tokens: 8000,
        }),
      });
    } catch (err) {
      throw new AiError("network", KIND_MESSAGES.network, String(err));
    }
    if (!resp.ok) {
      throw statusToError(resp.status, (await resp.text()).slice(0, 500));
    }

    const payload = await resp.json();
    const choice = payload?.choices?.[0];
    if (choice?.finish_reason === "length") {
      throw new AiError("truncated", KIND_MESSAGES.truncated);
    }
    const content = choice?.message?.content;
    if (typeof content === "string" && content.trim()) {
      try {
        return JSON.parse(stripFences(content));
      } catch {
        lastErr = new AiError("badjson", KIND_MESSAGES.badjson, content.slice(0, 300));
      }
    } else {
      lastErr = new AiError("badjson", KIND_MESSAGES.badjson, "empty response content");
    }
  }
  throw lastErr ?? new AiError("badjson", KIND_MESSAGES.badjson);
}

/** Cheap end-to-end check of base URL + key + CORS before any real work. */
export async function testConnection(
  settings: AiSettings,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  if (!settings.apiKey.trim()) throw new AiError("no_key", KIND_MESSAGES.no_key);
  const url = settings.baseUrl.replace(/\/+$/, "") + "/models";
  let resp: Response;
  try {
    resp = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${settings.apiKey.trim()}` },
    });
  } catch (err) {
    throw new AiError("network", KIND_MESSAGES.network, String(err));
  }
  if (!resp.ok) throw statusToError(resp.status, (await resp.text()).slice(0, 500));
}
