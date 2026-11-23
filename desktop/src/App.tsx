import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  assetUrl,
  drawImage,
  listVisualPacks,
  synthesizeVoice,
  transcribeAudio,
  uploadAsset,
  type Friend,
  type Message,
} from "./api";
import { FeatureDrawer } from "./FeatureDrawer";
import { Live2DCharacter } from "./Live2DCharacter";
import { useApp, type Settings, type Theme } from "./store";

function formatDateDivider(value: string): string {
  const date = new Date(value);
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

function Avatar({ friend }: { friend: Friend }) {
  return (
    <div className="avatar !h-[28px] !w-[28px] !text-sm">{friend.name.slice(0, 1)}</div>
  );
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

const icons = {
  plus: <Icon><path d="M12 5v14M5 12h14" /></Icon>,
  image: (
    <Icon>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m21 15-5-5L5 20" />
    </Icon>
  ),
  mic: (
    <Icon>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </Icon>
  ),
  brush: (
    <Icon>
      <path d="m15 4 5 5-9 9H6v-5z" />
      <path d="m13 6 5 5" />
    </Icon>
  ),
};

function MessageRow({ message, friend }: { message: Message; friend: Friend }) {
  const assistant = message.role === "assistant";
  const refreshMessages = useApp((state) => state.refreshMessages);
  if (message.role === "system") {
    return (
      <div className="my-4 text-center text-[11px] text-[var(--muted)]">{message.content}</div>
    );
  }
  return (
    <div className={`msg-row ${assistant ? "assistant" : "user"}`}>
      {assistant && <Avatar friend={friend} />}
      <div className="msg-content">
        <div>
          {message.content}
          {message.status === "streaming" && <span className="ml-1 animate-pulse">▍</span>}
        </div>
        {message.image_asset_ids?.map((assetId) => (
          <img
            key={assetId}
            className="mt-2 max-h-72 rounded border border-stone-200"
            src={assetUrl(assetId)}
            alt="图片"
          />
        ))}
        {message.voice_asset_id && (
          <audio className="mt-2 h-8" controls src={assetUrl(message.voice_asset_id)} />
        )}
        {assistant && !message.voice_asset_id && message.content && (
          <button
            className="mt-2 text-[11px] text-stone-400 hover:text-stone-700"
            onClick={async () => {
              await synthesizeVoice(message.id);
              await refreshMessages();
            }}
          >
            念给我听
          </button>
        )}
        {message.error_text && (
          <div className="mt-1 text-[12px] text-red-600">{message.error_text}</div>
        )}
      </div>
    </div>
  );
}

function CreateFriendModal() {
  const { createOpen, setCreateOpen, createFriend } = useApp();
  const [name, setName] = useState("");
  const [personality, setPersonality] = useState("");

  if (!createOpen) return null;
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/15">
      <form
        className="modal-card w-[460px]"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          void createFriend(name.trim(), personality);
        }}
      >
        <h2 className="text-base font-medium text-stone-900">新建朋友</h2>
        <label className="mt-4 block text-xs text-stone-500">
          名字
          <input
            className="mt-1 w-full rounded border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-500"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="mt-3 block text-xs text-stone-500">
          人格
          <textarea
            className="mt-1 h-36 w-full resize-none rounded border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-500"
            value={personality}
            onChange={(event) => setPersonality(event.target.value)}
          />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded border border-stone-300 px-3 py-2 text-sm text-stone-600"
            onClick={() => setCreateOpen(false)}
          >
            取消
          </button>
          <button className="rounded bg-stone-800 px-3 py-2 text-sm text-white">创建</button>
        </div>
      </form>
    </div>
  );
}

function ThemeMenu() {
  const { theme, saveTheme } = useApp();
  const [open, setOpen] = useState(false);
  const colors: Array<{ id: Theme["color"]; label: string; dot: string }> = [
    { id: "paper", label: "纸", dot: "#c9b38d" },
    { id: "moss", label: "苔", dot: "#7f9a72" },
    { id: "tea", label: "茶", dot: "#a57b56" },
    { id: "sakura", label: "樱", dot: "#c98e9e" },
  ];
  return (
    <div className="relative">
      <button className="theme-dots" onClick={() => setOpen((current) => !current)}>
        <span className="theme-dot" style={{ background: "var(--accent)" }} />
        <span className="theme-dot" style={{ background: "#748d6b" }} />
        <span className="theme-dot" style={{ background: "#3a332d" }} />
      </button>
      {open && (
        <div className="theme-popover">
          <div className="mb-3 text-[11px] text-[var(--muted)]">主题颜色</div>
          <div className="grid grid-cols-4 gap-1">
            {colors.map((color) => (
              <button
                key={color.id}
                className={`theme-card ${theme.color === color.id ? "active" : ""}`}
                onClick={() => {
                  void saveTheme({ ...theme, color: color.id });
                  setOpen(false);
                }}
              >
                <span
                  className="theme-swatch"
                  style={{
                    background: `linear-gradient(135deg, var(--panel) 45%, ${color.dot} 46%)`,
                  }}
                />
                {color.label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            {(["light", "dark"] as const).map((mode) => (
              <button
                key={mode}
                className={`flex-1 rounded px-2 py-1.5 text-xs ${
                  theme.mode === mode
                    ? "bg-[var(--accent-soft)] text-[var(--text)]"
                    : "text-[var(--muted)]"
                }`}
                onClick={() => {
                  void saveTheme({ ...theme, mode });
                  setOpen(false);
                }}
              >
                {mode === "light" ? "浅色" : "深色"}
              </button>
            ))}
          </div>
          <div className="mt-2 border-t border-[var(--border)] pt-2 text-[11px] text-[var(--muted)]">
            当前：{theme.mode === "light" ? "浅色" : "深色"} ·{" "}
            {colors.find((color) => color.id === theme.color)?.label}
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsModal() {
  const {
    settingsOpen,
    setSettingsOpen,
    settings,
    saveSettings,
    features,
    saveFeatures,
    setPanel,
  } = useApp();
  const [draft, setDraft] = useState<Settings>(settings);
  const [updateStatus, setUpdateStatus] = useState("");

  useEffect(() => {
    if (settingsOpen) setDraft(settings);
  }, [settingsOpen, settings]);

  if (!settingsOpen) return null;
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/15">
      <form
        className="modal-card max-h-[85vh] w-[560px] overflow-y-auto"
        onSubmit={(event) => {
          event.preventDefault();
          void saveSettings(draft);
        }}
      >
        <h2 className="text-base font-medium text-stone-900">模型设置</h2>
        <label className="mt-4 block text-xs text-stone-500">
          Base URL
          <input
            className="mt-1 w-full rounded border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-500"
            placeholder="https://api.openai.com/v1"
            value={draft.llm_base_url}
            onChange={(event) =>
              setDraft((current) => ({ ...current, llm_base_url: event.target.value }))
            }
          />
        </label>
        <label className="mt-3 block text-xs text-stone-500">
          API Key
          <input
            type="password"
            className="mt-1 w-full rounded border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-500"
            value={draft.llm_api_key}
            onChange={(event) =>
              setDraft((current) => ({ ...current, llm_api_key: event.target.value }))
            }
          />
        </label>
        <label className="mt-3 block text-xs text-stone-500">
          模型
          <input
            className="mt-1 w-full rounded border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-500"
            placeholder="gpt-4o-mini"
            value={draft.llm_model}
            onChange={(event) =>
              setDraft((current) => ({ ...current, llm_model: event.target.value }))
            }
          />
        </label>
        <div className="mt-4 border-t border-stone-200 pt-3 text-xs text-stone-500">语音 / 图片</div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {([
            ["tts_model", "语音合成模型"],
            ["tts_voice", "音色"],
            ["stt_model", "语音识别模型"],
            ["image_model", "图片生成模型"],
          ] as const).map(([key, label]) => (
            <label key={key} className="block text-xs text-stone-500">
              {label}
              <input
                className="mt-1 w-full rounded border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-500"
                value={draft[key]}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, [key]: event.target.value }))
                }
              />
            </label>
          ))}
        </div>
        <label className="mt-3 block text-xs text-stone-500">
          更新地址
          <input
            className="mt-1 w-full rounded border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-500"
            value={draft.update_url}
            onChange={(event) =>
              setDraft((current) => ({ ...current, update_url: event.target.value }))
            }
          />
        </label>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            className="rounded border border-stone-300 px-3 py-1.5 text-xs text-stone-600"
            onClick={async () => {
              try {
                const result = await window.yumeFriend?.checkUpdate?.(draft.update_url);
                setUpdateStatus(result?.version ? `发现 ${result.version}` : "已是最新");
              } catch (reason) {
                setUpdateStatus(String(reason));
              }
            }}
          >
            检查更新
          </button>
          <button
            type="button"
            className="rounded border border-stone-300 px-3 py-1.5 text-xs text-stone-600"
            onClick={() => {
              setPanel("logs");
              setSettingsOpen(false);
            }}
          >
            查看日志
          </button>
          {updateStatus && <span className="text-xs text-stone-500">{updateStatus}</span>}
        </div>
        <div className="mt-4 border-t border-stone-200 pt-3">
          <div className="mb-2 text-xs text-stone-500">功能开关</div>
          <div className="grid grid-cols-3 gap-2">
            {[
              ["memory", "记忆"],
              ["schedule", "日程"],
              ["thought", "想法"],
              ["expression", "风格"],
              ["document", "知识"],
              ["search", "搜索"],
              ["screen", "看屏"],
              ["file", "文件"],
              ["image", "图片"],
              ["voice", "语音"],
              ["visual", "呈现"],
              ["life", "生活"],
            ].map(([id, label]) => (
              <label key={id} className="flex items-center gap-1 text-xs text-stone-600">
                <input
                  type="checkbox"
                  checked={features[id] !== false}
                  onChange={(event) =>
                    void saveFeatures({ ...features, [id]: event.target.checked })
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded border border-stone-300 px-3 py-2 text-sm text-stone-600"
            onClick={() => setSettingsOpen(false)}
          >
            取消
          </button>
          <button className="rounded bg-stone-800 px-3 py-2 text-sm text-white">保存</button>
        </div>
      </form>
    </div>
  );
}

function Chat() {
  const {
    friends,
    selectedId,
    messages,
    sending,
    error,
    sendMessage,
    setPanel,
    setImmersive,
    refreshMessages,
    features,
  } = useApp();
  const [draft, setDraft] = useState("");
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const friend = friends.find((item) => item.id === selectedId);

  if (!friend) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-stone-400">
        先创建一个朋友
      </div>
    );
  }

  return (
    <section className="chat-main">
      <div className="chat-head">
        <div className="min-w-0">
          <div className="chat-name truncate">{friend.name}</div>
          <div className="mt-1 text-[11px] text-[var(--muted)]">现在在线 · 想聊点什么</div>
        </div>
        <div className="feature-links">
          {([
            ["persona", "人格", ["friend", "expression", "visual"]],
            ["memory", "记忆", ["memory"]],
            ["schedule", "日程", ["schedule", "thought"]],
            ["knowledge", "知识", ["document", "file"]],
            ["life", "生活", ["life"]],
          ] as const)
            .filter(([, , keys]) => keys.some((key) => features[key] !== false))
            .map(([id, label], index) => (
              <span key={id} className="flex items-center">
                {index > 0 && (
                  <span className="px-1 text-[10px] text-[var(--muted)]">/</span>
                )}
                <button
                  className="feature-link"
                  onClick={() =>
                    setPanel(id as "persona" | "memory" | "schedule" | "knowledge" | "life")
                  }
                >
                  {label}
                </button>
              </span>
            ))}
          <span className="px-1 text-[10px] text-[var(--muted)]">/</span>
          <button className="feature-link" onClick={() => setImmersive(true)}>
            沉浸
          </button>
          <span className="px-1 text-[10px] text-[var(--muted)]">/</span>
          <button className="feature-link" onClick={() => window.yumeFriend?.openPet?.()}>
            桌宠
          </button>
        </div>
      </div>
      <div className="chat-scroll">
        <div className="chat-inner">
          {messages.length === 0 && (
            <div className="mt-16 text-center text-sm text-[var(--muted)]">还没有消息</div>
          )}
          {messages.length > 0 && (
            <div className="date-divider">{formatDateDivider(messages[0].created_at)}</div>
          )}
          {messages.map((message) => (
            <MessageRow key={message.id} message={message} friend={friend} />
          ))}
        </div>
      </div>
      {error && <div className="px-8 pb-2 text-[12px] text-red-600">{error}</div>}
      <div className="composer">
        {assetIds.length > 0 && (
          <div className="mb-2 flex gap-2">
            {assetIds.map((assetId) => (
              <img
                key={assetId}
                className="h-14 w-14 rounded border border-stone-200 object-cover"
                src={assetUrl(assetId)}
                alt="待发送图片"
              />
            ))}
          </div>
        )}
        <div className="composer-row">
          <label className="icon-button cursor-pointer">
            {icons.plus}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const asset = await uploadAsset(file);
                setAssetIds((current) => [...current, asset.id]);
                event.target.value = "";
              }}
            />
          </label>
          <label className="icon-button cursor-pointer">
            {icons.image}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const asset = await uploadAsset(file);
                setAssetIds((current) => [...current, asset.id]);
                event.target.value = "";
              }}
            />
          </label>
          <button
            className={`icon-button ${recording ? "!text-red-500" : ""}`}
            onClick={async () => {
              if (recording) {
                recorderRef.current?.stop();
                return;
              }
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
              const recorder = new MediaRecorder(stream);
              const chunks: Blob[] = [];
              recorder.ondataavailable = (event) => chunks.push(event.data);
              recorder.onstop = async () => {
                stream.getTracks().forEach((track) => track.stop());
                setRecording(false);
                try {
                  const result = await transcribeAudio(new Blob(chunks, { type: "audio/webm" }));
                  setDraft((current) => `${current}${result.text}`);
                } catch {
                  setDraft((current) => current);
                }
              };
              recorder.start();
              recorderRef.current = recorder;
              setRecording(true);
            }}
          >
            {icons.mic}
          </button>
          <button
            className="icon-button"
            onClick={async () => {
              const prompt = window.prompt("画什么？");
              if (!prompt) return;
              await drawImage(friend.id, prompt);
              await refreshMessages();
            }}
          >
            {icons.brush}
          </button>
          <form
            className="flex min-w-0 flex-1 items-end"
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.trim()) return;
            void sendMessage(draft, assetIds);
            setDraft("");
            setAssetIds([]);
          }}
        >
          <textarea
            className="composer-input"
            placeholder="说点什么……"
            rows={1}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button
            disabled={sending || !draft.trim()}
            className="send-button disabled:opacity-40"
          >
            发送
          </button>
          </form>
        </div>
      </div>
    </section>
  );
}

function ImmersiveOverlay() {
  const {
    immersive,
    setImmersive,
    friends,
    selectedId,
    messages,
    sendMessage,
    sending,
  } = useApp();
  const [preview, setPreview] = useState("");
  const [modelUrl, setModelUrl] = useState("");
  const [mode, setMode] = useState<"her" | "me">("her");
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const friend = friends.find((item) => item.id === selectedId);
  const lastAssistant = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");
  const paragraphs = (lastAssistant?.content ?? "")
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
  const safeIndex = Math.min(index, Math.max(0, paragraphs.length - 1));
  const current = paragraphs[safeIndex] ?? "";
  const canAdvance = safeIndex < paragraphs.length - 1;
  const replyKey = lastAssistant?.id ?? "";

  useEffect(() => {
    if (!immersive || !friend?.visual_pack_id) {
      setPreview("");
      setModelUrl("");
      return;
    }
    void listVisualPacks().then((result) => {
      const pack = result.items.find((item) => item.id === friend.visual_pack_id);
      if (!pack) return;
      if (pack.preview_asset_id) {
        setPreview(assetUrl(pack.preview_asset_id));
      } else {
        try {
          const manifest = JSON.parse(pack.manifest_json) as {
            preview_url?: string;
            model_url?: string;
          };
          setPreview(manifest.preview_url ?? "");
          setModelUrl(manifest.model_url ?? "");
        } catch {
          setPreview("");
          setModelUrl("");
        }
      }
    });
  }, [immersive, friend?.visual_pack_id]);

  useEffect(() => {
    setIndex(0);
    setMode("her");
  }, [replyKey]);

  useEffect(() => {
    if (!immersive || !lastAssistant?.voice_asset_id) return;
    const audio = audioRef.current;
    if (audio) {
      void audio.play().catch(() => undefined);
    }
  }, [immersive, replyKey, lastAssistant?.voice_asset_id]);

  if (!immersive || !friend) return null;
  return (
    <div className="fixed inset-0 z-30 flex flex-col overflow-hidden bg-stone-950 text-stone-100">
      <header className="flex items-center justify-between px-5 py-3">
        <span className="text-xs text-white/50">
          {sending ? "正在说…" : mode === "me" ? "轮到你" : "点一下继续"}
        </span>
        <button
          className="rounded border border-white/20 px-3 py-1 text-xs text-white/70"
          onClick={() => setImmersive(false)}
        >
          退出沉浸
        </button>
      </header>
      <div
        className="relative flex min-h-0 flex-1 items-end justify-center"
        onClick={() => {
          if (mode === "her") {
            if (canAdvance) setIndex((current) => current + 1);
            else setMode("me");
          }
        }}
      >
        {preview && (
          <img
            className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-20 blur-2xl"
            src={preview}
            alt=""
          />
        )}
        <div className="relative flex h-full w-full items-end justify-center">
          {friend.visual_mode === "live2d" && modelUrl ? (
            <Live2DCharacter
              modelUrl={modelUrl}
              speaking={sending || lastAssistant?.status === "streaming"}
              className="max-h-[82vh] max-w-[72vw]"
            />
          ) : preview ? (
            <img
              className="max-h-[82vh] max-w-[72vw] object-contain drop-shadow-[0_20px_60px_rgba(0,0,0,0.55)]"
              src={preview}
              alt={friend.name}
            />
          ) : (
            <div className="pb-40 text-[160px] text-white/15">{friend.name.slice(0, 1)}</div>
          )}
        </div>
      </div>
      <div
        className="relative z-10 shrink-0 border-t border-white/15 bg-black/55 px-8 py-4 backdrop-blur-sm"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="absolute -top-7 left-8 rounded-md border border-white/15 bg-black/70 px-3 py-0.5 text-[13px] text-white/90">
          {mode === "her" ? friend.name : "我"}
        </div>
        {mode === "her" ? (
          <div
            className="min-h-[76px] cursor-pointer whitespace-pre-wrap text-[16px] leading-[1.85] text-white"
            onClick={() => {
              if (canAdvance) setIndex((current) => current + 1);
              else setMode("me");
            }}
          >
            {current || (sending ? "……" : "（她在等你说话）")}
            <div className="mt-2 text-right text-[11px] text-white/45">
              {canAdvance
                ? "▼ 点一下继续"
                : sending
                  ? "正在说…"
                  : "点一下轮到你 ▸"}
            </div>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              autoFocus
              rows={2}
              className="h-[66px] flex-1 resize-none bg-transparent text-[16px] leading-[1.7] text-white outline-none placeholder:text-white/30"
              placeholder={`对 ${friend.name} 说…`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (!draft.trim()) return;
                  void sendMessage(draft);
                  setDraft("");
                  setMode("her");
                  setIndex(0);
                }
              }}
            />
            <button
              className="mb-1 rounded border border-white/20 px-3 py-1 text-xs text-white/70"
              onClick={() => setMode("her")}
            >
              听她说
            </button>
            <button
              className="mb-1 rounded bg-[var(--accent)] px-4 py-1 text-xs text-white disabled:opacity-40"
              disabled={!draft.trim() || sending}
              onClick={() => {
                void sendMessage(draft);
                setDraft("");
                setMode("her");
                setIndex(0);
              }}
            >
              说
            </button>
          </div>
        )}
      </div>
      {lastAssistant?.voice_asset_id && (
        <audio ref={audioRef} src={assetUrl(lastAssistant.voice_asset_id)} className="hidden" />
      )}
    </div>
  );
}

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const {
    friends,
    selectedId,
    loading,
    error,
    createOpen,
    setCreateOpen,
    setSettingsOpen,
    setPanel,
    loadFriends,
    loadSettings,
    selectFriend,
    refreshMessages,
    theme,
  } = useApp();

  useEffect(() => {
    void loadFriends();
    void loadSettings();
  }, [loadFriends, loadSettings]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshMessages();
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [refreshMessages]);

  useEffect(() => {
    document.documentElement.dataset.theme = `${theme.color}-${theme.mode}`;
  }, [theme]);

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="flex items-center gap-2">
          <button
            className="top-icon"
            title={sidebarOpen ? "收起朋友栏" : "展开朋友栏"}
            onClick={() => setSidebarOpen((current) => !current)}
          >
            ☰
          </button>
          <div className="brand">yumeFriend</div>
        </div>
        <ThemeMenu />
      </header>
      <div className="flex min-h-0 flex-1">
        {sidebarOpen && <aside className="sidebar">
          <button className="create-friend" onClick={() => setCreateOpen(true)}>
            ＋ 创建朋友
          </button>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading && <div className="px-4 py-2 text-xs text-[var(--muted)]">加载中……</div>}
            {friends.map((friend) => (
              <button
                key={friend.id}
                className={`friend-row ${friend.id === selectedId ? "active" : ""}`}
                onClick={() => void selectFriend(friend.id)}
              >
                <Avatar friend={friend} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-[var(--text)]">
                    {friend.name}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-[var(--muted)]">
                    {friend.personality || "还没聊过"}
                  </span>
                </span>
                <span className="self-start text-[10px] text-[var(--muted)]">
                  {friend.created_at
                    ? `${new Date(friend.created_at).getMonth() + 1}-${String(
                        new Date(friend.created_at).getDate(),
                      ).padStart(2, "0")}`
                    : ""}
                </span>
              </button>
            ))}
          </div>
          <div className="flex gap-4 border-t border-[var(--border)] px-4 py-3 text-[11px] text-[var(--muted)]">
            <button
              className="hover:text-[var(--accent)]"
              onClick={() => {
                setPanel(null);
                setSettingsOpen(true);
              }}
            >
              设置
            </button>
            <button
              className="hover:text-[var(--accent)]"
              onClick={() => {
                if (document.fullscreenElement) {
                  void document.exitFullscreen();
                } else {
                  void document.documentElement.requestFullscreen();
                }
              }}
            >
              全屏
            </button>
          </div>
        </aside>}
        <Chat />
        <FeatureDrawer />
      </div>
      {error && !createOpen && <div className="px-5 py-2 text-xs text-red-600">{error}</div>}
      <CreateFriendModal />
      <SettingsModal />
      <ImmersiveOverlay />
    </div>
  );
}
