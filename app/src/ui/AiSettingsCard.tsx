import { useState } from "react";
import { aiErrorMessage, testConnection } from "../ai/client";
import { clearApiKey, saveAiSettings, type AiSettings } from "../ai/settings";
import { HelpTip } from "./Help";

interface Props {
  settings: AiSettings;
  setSettings: (s: AiSettings) => void;
}

export function AiSettingsCard({ settings, setSettings }: Props) {
  const [status, setStatus] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const update = (patch: Partial<AiSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveAiSettings(next);
  };

  return (
    <div className="card">
      <h2>AI provider settings</h2>
      <div className="controls">
        <label>
          API key
          <input
            type="password"
            value={settings.apiKey}
            placeholder="sk-…"
            onChange={(e) => update({ apiKey: e.target.value })}
            style={{ minWidth: 220 }}
          />
        </label>
        <label>
          Base URL<HelpTip text="Any OpenAI-compatible provider works. DeepSeek is the default; you can point this at OpenAI, a local model server, or others." />
          <input
            type="text"
            value={settings.baseUrl}
            onChange={(e) => update({ baseUrl: e.target.value })}
            style={{ minWidth: 220 }}
          />
        </label>
        <label>
          Model
          <input
            type="text"
            value={settings.model}
            onChange={(e) => update({ model: e.target.value })}
            style={{ minWidth: 140 }}
          />
        </label>
        <button
          className="action"
          disabled={testing}
          onClick={async () => {
            setTesting(true);
            setStatus(null);
            try {
              await testConnection(settings);
              setStatus("✓ Connection works — key and URL are good.");
            } catch (err) {
              setStatus(aiErrorMessage(err));
            } finally {
              setTesting(false);
            }
          }}
        >
          {testing ? "Testing…" : "Test connection"}
        </button>
        <button className="action" onClick={() => setSettings(clearApiKey(settings))}>
          Clear key
        </button>
      </div>
      <div className="controls">
        <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={!settings.persistKey}
            onChange={(e) => update({ persistKey: !e.target.checked })}
          />
          Don't remember my key (cleared when this tab closes)
        </label>
      </div>
      {status && <div className={status.startsWith("✓") ? "subtle" : "error-box"}>{status}</div>}
      <div className="subtle">
        Your key is stored unencrypted in this browser only and sent solely to the base URL above — never to this
        site's servers (there are none). Anyone with access to this browser profile could read it, so prefer a
        low-limit key. Get a DeepSeek key at platform.deepseek.com.
      </div>
    </div>
  );
}
