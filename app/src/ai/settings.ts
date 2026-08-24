export interface AiSettings {
  baseUrl: string;
  model: string;
  apiKey: string;
  /** false = keep the key in sessionStorage only (cleared when the tab closes). */
  persistKey: boolean;
}

export const DEFAULT_SETTINGS: AiSettings = {
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-chat",
  apiKey: "",
  persistKey: true,
};

const STORAGE_KEY = "pfsim.ai.v1";
const SESSION_KEY = "pfsim.ai.key.v1";

export function loadAiSettings(): AiSettings {
  const out = { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.baseUrl === "string" && parsed.baseUrl) out.baseUrl = parsed.baseUrl;
      if (typeof parsed.model === "string" && parsed.model) out.model = parsed.model;
      if (typeof parsed.apiKey === "string") out.apiKey = parsed.apiKey;
      if (typeof parsed.persistKey === "boolean") out.persistKey = parsed.persistKey;
    }
    if (!out.persistKey) {
      out.apiKey = sessionStorage.getItem(SESSION_KEY) ?? "";
    }
  } catch {
    // corrupted or unavailable storage: fall back to defaults
  }
  return out;
}

export function saveAiSettings(s: AiSettings): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...s, apiKey: s.persistKey ? s.apiKey : "" }),
    );
    if (s.persistKey) {
      sessionStorage.removeItem(SESSION_KEY);
    } else {
      sessionStorage.setItem(SESSION_KEY, s.apiKey);
    }
  } catch {
    // storage unavailable: settings still work for this page load
  }
}

export function clearApiKey(s: AiSettings): AiSettings {
  const next = { ...s, apiKey: "" };
  saveAiSettings(next);
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
  return next;
}
