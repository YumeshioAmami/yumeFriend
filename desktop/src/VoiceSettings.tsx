import { useEffect, useState } from "react";
import {
  createVoice,
  deleteVoice,
  listVoices,
  testVoice,
  updateVoice,
  type Voice,
} from "./api";
import { useApp } from "./store";

type VoiceDraft = {
  name: string;
  provider: string;
  config_json: string;
  speed: number;
};

const emptyDraft: VoiceDraft = {
  name: "",
  provider: "openai",
  config_json: "{\"voice\":\"alloy\"}",
  speed: 1,
};

export function VoiceSettings() {
  const playVoice = useApp((state) => state.playVoice);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [draft, setDraft] = useState<VoiceDraft>(emptyDraft);
  const [editingId, setEditingId] = useState("");

  const load = async () => {
    const result = await listVoices();
    setVoices(result.items);
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    if (!draft.name.trim()) return;
    if (editingId) {
      await updateVoice(editingId, draft);
    } else {
      await createVoice(draft);
    }
    setDraft(emptyDraft);
    setEditingId("");
    await load();
  };

  return (
    <div className="space-y-3">
      {voices.map((voice) => (
        <div
          key={voice.id}
          className="flex items-center justify-between gap-2 border-b border-[var(--border)] pb-2 text-xs"
        >
          <div className="min-w-0">
            <div className="truncate text-[var(--text)]">{voice.name}</div>
            <div className="text-[var(--muted)]">
              {voice.provider} · {voice.speed}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              className="text-[var(--muted)] hover:text-[var(--text)]"
              onClick={() => {
                setEditingId(voice.id);
                setDraft({
                  name: voice.name,
                  provider: voice.provider,
                  config_json: voice.config_json,
                  speed: voice.speed,
                });
              }}
            >
              编辑
            </button>
            <button
              type="button"
              className="text-[var(--muted)] hover:text-[var(--text)]"
              onClick={async () => {
                const result = await testVoice(voice.id, "你好，很高兴见到你。");
                await playVoice([result.asset_id]);
              }}
            >
              试听
            </button>
            <button
              type="button"
              className="text-red-500 hover:text-red-600"
              onClick={async () => {
                if (!window.confirm(`删除音色「${voice.name}」？`)) return;
                await deleteVoice(voice.id);
                await load();
              }}
            >
              删除
            </button>
          </div>
        </div>
      ))}
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-stone-500">
          名称
          <input
            className="mt-1 w-full px-3 py-2 text-sm"
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          />
        </label>
        <label className="text-xs text-stone-500">
          提供方
          <select
            className="mt-1 w-full px-3 py-2 text-sm"
            value={draft.provider}
            onChange={(event) =>
              setDraft((current) => ({ ...current, provider: event.target.value }))
            }
          >
            <option value="openai">openai</option>
            <option value="gpt_sovits">gpt_sovits</option>
            <option value="system">system</option>
            <option value="custom">custom</option>
          </select>
        </label>
        <label className="col-span-2 text-xs text-stone-500">
          配置 JSON
          <textarea
            className="mt-1 h-16 w-full resize-none px-3 py-2 font-mono text-xs"
            value={draft.config_json}
            onChange={(event) =>
              setDraft((current) => ({ ...current, config_json: event.target.value }))
            }
          />
        </label>
        <label className="text-xs text-stone-500">
          语速
          <input
            type="number"
            min="0.25"
            max="4"
            step="0.05"
            className="mt-1 w-full px-3 py-2 text-sm"
            value={draft.speed}
            onChange={(event) =>
              setDraft((current) => ({ ...current, speed: Number(event.target.value) }))
            }
          />
        </label>
        <div className="flex items-end gap-2">
          <button
            type="button"
            className="rounded bg-stone-800 px-3 py-1.5 text-xs text-white"
            onClick={() => void save()}
          >
            {editingId ? "保存音色" : "添加音色"}
          </button>
          {editingId && (
            <button
              type="button"
              className="rounded border border-stone-300 px-3 py-1.5 text-xs text-stone-600"
              onClick={() => {
                setEditingId("");
                setDraft(emptyDraft);
              }}
            >
              取消
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
