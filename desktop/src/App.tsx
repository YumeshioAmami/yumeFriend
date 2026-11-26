import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  assetUrl,
  downloadLive2DRuntime,
  drawImage,
  getLive2DRuntimeStatus,
  getSyncConflicts,
  getSyncDevices,
  getSyncGrants,
  getSyncPeers,
  grantSyncModule,
  listVisualPacks,
  pairSyncAddress,
  pairSyncDevice,
  patchFriend,
  runSync,
  revokeSyncModule,
  saveSetting,
  synthesizeVoice,
  testModel,
  transcribeAudio,
  uploadAsset,
  type Friend,
  type Live2DRuntimeStatus,
  type Message,
  type SyncConflict,
  type SyncDevice,
  type SyncGrant,
  type SyncPeer,
} from "./api";
import { FeatureDrawer } from "./FeatureDrawer";
import { Live2DCharacter } from "./Live2DCharacter";
import { Live2DSettingsModal } from "./Live2DSettings";
import { LegalModal } from "./LegalModal";
import { useApp, type Settings, type Theme } from "./store";
import { VoiceSettings } from "./VoiceSettings";

const LIVE2D_PROPRIETARY_LICENSE =
  "https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html";
const LIVE2D_OPEN_LICENSE =
  "https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html";

const SYNC_MODULES = [
  ["friend", "朋友"],
  ["chat", "聊天"],
  ["memory", "记忆"],
  ["schedule", "日程"],
  ["thought", "想法"],
  ["expression", "风格"],
  ["document", "知识"],
  ["life", "生活"],
  ["visual", "呈现"],
] as const;

function formatDateDivider(value: string): string {
  const date = new Date(value);
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

function Avatar({ friend }: { friend: Friend }) {
  return (
    <div className="avatar !h-[28px] !w-[28px] !text-sm">
      {friend.avatar_asset_id ? (
        <img src={assetUrl(friend.avatar_asset_id)} alt={friend.name} />
      ) : (
        friend.name.slice(0, 1)
      )}
    </div>
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
  phone: (
    <Icon>
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.6a2 2 0 0 1-.5 2.1L8 9.7a16 16 0 0 0 6.3 6.3l1.3-1.3a2 2 0 0 1 2.1-.5c.8.3 1.7.6 2.6.7a2 2 0 0 1 1.7 2z" />
    </Icon>
  ),
};

function MessageRow({ message, friend }: { message: Message; friend: Friend }) {
  const assistant = message.role === "assistant";
  const refreshMessages = useApp((state) => state.refreshMessages);
  const retryMessage = useApp((state) => state.retryMessage);
  const playVoice = useApp((state) => state.playVoice);
  const stopVoice = useApp((state) => state.stopVoice);
  const [playing, setPlaying] = useState(false);
  if (message.role === "system") {
    return (
      <div className="my-4 text-center text-[11px] text-[var(--muted)]">{message.content}</div>
    );
  }
  const units = message.segments ?? [];
  const bubbles = units.length
    ? [...new Set(units.map((unit) => unit.bubble))].map((bubble) =>
        units
          .filter((unit) => unit.bubble === bubble)
          .map((unit) => unit.text)
          .join("\n"),
      )
    : [message.content];
  return (
    <div className={`msg-row ${assistant ? "assistant" : "user"}`}>
      {assistant && <Avatar friend={friend} />}
      <div className="msg-content">
        <div className="space-y-2">
          {bubbles.map((text, index) => (
            <div key={index} className="whitespace-pre-wrap">
              {text}
              {index === bubbles.length - 1 && message.status === "streaming" && (
                <span className="ml-1 animate-pulse">▍</span>
              )}
            </div>
          ))}
        </div>
        {message.image_asset_ids?.map((assetId) => (
          <img
            key={assetId}
            className="mt-2 max-h-72 rounded border border-stone-200"
            src={assetUrl(assetId)}
            alt="图片"
          />
        ))}
        {(message.voice_asset_ids?.length ?? 0) > 0 && (
          <button
            className="mt-2 text-[11px] text-stone-400 hover:text-stone-700"
            onClick={async () => {
              if (playing) {
                stopVoice();
                setPlaying(false);
                return;
              }
              setPlaying(true);
              await playVoice(message.voice_asset_ids ?? []);
              setPlaying(false);
            }}
          >
            {playing ? "停止" : "播放语音"}
          </button>
        )}
        {assistant && !(message.voice_asset_ids?.length ?? 0) && message.content && (
          <button
            className="mt-2 text-[11px] text-stone-400 hover:text-stone-700"
            onClick={async () => {
              const result = await synthesizeVoice(message.id);
              await refreshMessages();
              await playVoice(result.message.voice_asset_ids ?? []);
            }}
          >
            念给我听
          </button>
        )}
        {message.error_text && (
          <div className="mt-1 text-[12px] text-red-600">{message.error_text}</div>
        )}
        {assistant && message.status === "partial" && (
          <div className="mt-1 text-[11px] text-stone-400">（未说完）</div>
        )}
        {assistant && (message.status === "error" || message.status === "partial") && (
          <button
            className="mt-2 text-[11px] text-stone-500 hover:text-stone-800"
            onClick={() => void retryMessage(message.id)}
          >
            重试
          </button>
        )}
        {message.sources && message.sources.length > 0 && (
          <div className="mt-2 space-y-1 text-[11px]">
            {message.sources.map((source, index) => (
              <a
                key={`${source.url}-${index}`}
                className="block truncate text-[var(--accent)] underline"
                href={source.url}
                target="_blank"
                rel="noreferrer"
              >
                {source.title || source.url || `来源 ${index + 1}`}
              </a>
            ))}
          </div>
        )}
        {message.tool_calls && message.tool_calls.length > 0 && (
          <details className="mt-2 text-[11px] text-stone-400">
            <summary className="cursor-pointer">工具记录</summary>
            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-stone-100 p-2 text-[10px]">
              {JSON.stringify(message.tool_calls, null, 2)}
            </pre>
          </details>
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
  const [runtime, setRuntime] = useState<Live2DRuntimeStatus | null>(null);
  const [runtimeAgree, setRuntimeAgree] = useState(false);
  const [runtimeProgress, setRuntimeProgress] = useState("");
  const [runtimeMessage, setRuntimeMessage] = useState("");
  const [live2dOpen, setLive2dOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
  const [modelTest, setModelTest] = useState("");
  const [updateVersion, setUpdateVersion] = useState("");
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [syncDevices, setSyncDevices] = useState<SyncDevice[]>([]);
  const [syncPeers, setSyncPeers] = useState<SyncPeer[]>([]);
  const [syncConflicts, setSyncConflicts] = useState<SyncConflict[]>([]);
  const [syncMessage, setSyncMessage] = useState("");
  const [expandedSyncPeer, setExpandedSyncPeer] = useState<string | null>(null);
  const [syncGrants, setSyncGrants] = useState<SyncGrant[]>([]);
  const [manualSyncHost, setManualSyncHost] = useState("");
  const [manualSyncPort, setManualSyncPort] = useState("47896");
  const [tab, setTab] = useState<
    "models" | "appearance" | "voice" | "visual" | "sync" | "features" | "update" | "about"
  >("models");

  useEffect(() => {
    if (settingsOpen) setDraft(settings);
    if (settingsOpen) {
      void getLive2DRuntimeStatus().then(setRuntime).catch(() => setRuntime(null));
    }
  }, [settingsOpen, settings]);

  useEffect(() => {
    if (!settingsOpen) return;
    return window.yumeFriend?.onUpdateStatus?.((status) => {
      if (status.state === "downloading") {
        setUpdateStatus(`下载中 ${Math.round(status.percent ?? 0)}%`);
      }
      if (status.state === "downloaded") {
        setUpdateDownloaded(true);
        setUpdateStatus(`已下载 ${status.version ?? ""}`);
      }
      if (status.state === "error") {
        setUpdateStatus(status.message ?? "更新失败");
      }
    });
  }, [settingsOpen]);

  const refreshSync = async () => {
    const [devices, peers, conflicts] = await Promise.all([
      getSyncDevices(),
      getSyncPeers(),
      getSyncConflicts(),
    ]);
    setSyncDevices(devices);
    setSyncPeers(peers);
    setSyncConflicts(conflicts);
  };

  useEffect(() => {
    if (!settingsOpen || tab !== "sync") return;
    void refreshSync().catch((reason) => setSyncMessage(String(reason)));
    const timer = window.setInterval(() => {
      void refreshSync().catch(() => undefined);
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [settingsOpen, tab]);

  if (!settingsOpen) return null;
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/15">
      <div className="modal-card flex h-[78vh] w-[780px] flex-col overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <h2 className="text-base font-medium text-stone-900">设置</h2>
          <button
            type="button"
            className="text-xs text-[var(--muted)] hover:text-[var(--text)]"
            onClick={() => setSettingsOpen(false)}
          >
            关闭
          </button>
        </div>
        <div className="flex min-h-0 flex-1">
          <nav className="w-[136px] shrink-0 border-r border-[var(--border)] p-2">
            {([
              ["models", "模型"],
              ["appearance", "外观"],
              ["voice", "语音"],
              ["visual", "视觉"],
              ["sync", "同步"],
              ["features", "功能"],
              ["update", "更新"],
              ["about", "关于"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-xs ${
                  tab === id
                    ? "bg-[var(--accent-soft)] text-[var(--text)]"
                    : "text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
                }`}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="min-w-0 flex-1 overflow-y-auto p-5">
        {tab === "models" && (
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-4">
            <h3 className="text-sm font-medium text-[var(--text)]">聊天模型</h3>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              朋友平时说话用的 OpenAI 兼容接口。填服务地址、密钥和模型名即可。
            </p>
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
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            className="rounded border border-stone-300 px-3 py-1.5 text-xs text-stone-600"
            onClick={async () => {
              setModelTest("测试中…");
              try {
                const result = await testModel({
                  base_url: draft.llm_base_url,
                  api_key: draft.llm_api_key,
                  model: draft.llm_model,
                });
                setModelTest(result.reply || "连通正常");
              } catch (reason) {
                setModelTest(String(reason));
              }
            }}
          >
            测试模型
          </button>
          {modelTest && <span className="text-xs text-[var(--muted)]">{modelTest}</span>}
        </div>
          </section>
        )}
        {tab === "voice" && (
          <>
        <div className="mt-4 border-t border-stone-200 pt-3 text-xs text-stone-500">语音 / 图片</div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {([
            ["tts_base_url", "TTS Base URL"],
            ["tts_api_key", "TTS API Key"],
            ["tts_model", "语音合成模型"],
            ["tts_voice", "音色"],
            ["stt_base_url", "STT Base URL"],
            ["stt_api_key", "STT API Key"],
            ["stt_model", "语音识别模型"],
            ["image_model", "图片生成模型"],
          ] as const).map(([key, label]) => (
            <label key={key} className="block text-xs text-stone-500">
              {label}
              <input
                type={key.endsWith("api_key") ? "password" : "text"}
                className="mt-1 w-full rounded border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-500"
                value={draft[key]}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, [key]: event.target.value }))
                }
              />
            </label>
          ))}
        </div>
        <div className="mt-4 border-t border-stone-200 pt-3 text-xs text-stone-500">音色</div>
        <div className="mt-2">
          <VoiceSettings />
        </div>
        <label className="mt-3 block text-xs text-stone-500">
          语音保留天数
          <input
            type="number"
            min="0"
            className="mt-1 w-full rounded border border-stone-300 px-3 py-2 text-sm"
            value={draft.voice_retention_days}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                voice_retention_days: Number(event.target.value),
              }))
            }
          />
        </label>
          </>
        )}
        {tab === "appearance" && (
          <>
        <div className="mt-4 border-t border-stone-200 pt-3 text-xs text-stone-500">界面</div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-xs text-stone-500">
            缩放
            <select
              className="mt-1 w-full px-3 py-2 text-sm"
              value={draft.ui_scale}
              onChange={(event) =>
                setDraft((current) => ({ ...current, ui_scale: Number(event.target.value) }))
              }
            >
              {[0.8, 0.9, 1, 1.1, 1.2].map((scale) => (
                <option key={scale} value={scale}>
                  {Math.round(scale * 100)}%
                </option>
              ))}
            </select>
          </label>
        </div>
          </>
        )}
        {tab === "update" && (
          <>
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
                if (!result?.version || result.version === window.yumeFriend?.version) {
                  setUpdateVersion("");
                  setUpdateStatus("已是最新");
                } else {
                  setUpdateVersion(result.version);
                  setUpdateDownloaded(false);
                  setUpdateStatus(`发现 ${result.version}`);
                }
              } catch (reason) {
                setUpdateStatus(String(reason));
              }
            }}
          >
            检查更新
          </button>
          {updateVersion && !updateDownloaded && (
            <button
              type="button"
              className="rounded border border-stone-300 px-3 py-1.5 text-xs text-stone-600"
              onClick={async () => {
                setUpdateStatus("下载中…");
                try {
                  await window.yumeFriend?.downloadUpdate?.();
                } catch (reason) {
                  setUpdateStatus(String(reason));
                }
              }}
            >
              下载更新
            </button>
          )}
          {updateDownloaded && (
            <button
              type="button"
              className="rounded bg-stone-800 px-3 py-1.5 text-xs text-white"
              onClick={() => void window.yumeFriend?.installUpdate?.()}
            >
              安装并重启
            </button>
          )}
          {updateStatus && <span className="text-xs text-stone-500">{updateStatus}</span>}
        </div>
          </>
        )}
        {tab === "visual" && (
        <div className="mt-4 border-t border-stone-200 pt-3">
          <div className="mb-2 text-xs text-stone-500">Live2D 运行时</div>
          <div className="text-xs text-[var(--muted)]">
            状态：{runtime?.available ? "已安装" : "未安装"}
          </div>
          <div className="mt-2 flex gap-3 text-xs">
            <a
              className="text-[var(--accent)] underline"
              href={runtime?.license_urls.proprietary ?? LIVE2D_PROPRIETARY_LICENSE}
              target="_blank"
              rel="noreferrer"
            >
              专有软件许可协议
            </a>
            <a
              className="text-[var(--accent)] underline"
              href={runtime?.license_urls.open ?? LIVE2D_OPEN_LICENSE}
              target="_blank"
              rel="noreferrer"
            >
              开源软件许可协议
            </a>
          </div>
          <label className="mt-2 flex items-start gap-2 text-[11px] text-[var(--muted)]">
            <input
              type="checkbox"
              checked={runtimeAgree}
              onChange={(event) => setRuntimeAgree(event.target.checked)}
            />
            下载此运行时即表示同意 Live2D 官方许可协议
          </label>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={!runtimeAgree || runtimeProgress.startsWith("下载中")}
              className="rounded bg-stone-800 px-3 py-1.5 text-xs text-white disabled:opacity-40"
              onClick={async () => {
                setRuntimeProgress("下载中…");
                setRuntimeMessage("");
                try {
                  await downloadLive2DRuntime((received, total) => {
                    setRuntimeProgress(
                      total > 0
                        ? `下载中 ${Math.round((received / total) * 100)}%`
                        : `下载中 ${(received / 1024 / 1024).toFixed(1)} MB`,
                    );
                  });
                  const status = await getLive2DRuntimeStatus();
                  setRuntime(status);
                  setRuntimeProgress("");
                  setRuntimeMessage("下载完成");
                  window.dispatchEvent(new Event("yf-live2d-runtime-changed"));
                } catch (reason) {
                  setRuntimeProgress("");
                  setRuntimeMessage(String(reason));
                }
              }}
            >
              {runtime?.available ? "重新下载运行时" : "下载运行时"}
            </button>
            {runtimeProgress && (
              <span className="text-xs text-[var(--muted)]">{runtimeProgress}</span>
            )}
            {runtimeMessage && (
              <span className="text-xs text-[var(--muted)]">{runtimeMessage}</span>
            )}
            <button
              type="button"
              className="rounded border border-stone-300 px-3 py-1.5 text-xs text-stone-600"
              onClick={() => setLive2dOpen(true)}
            >
              编辑模型标签
            </button>
          </div>
        </div>
        )}
        {tab === "sync" && (
          <div className="space-y-3">
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-4">
              <h3 className="text-sm font-medium text-[var(--text)]">局域网同步</h3>
              <label className="mt-2 flex items-center gap-2 text-xs text-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={draft.sync_pairing_enabled}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      sync_pairing_enabled: event.target.checked,
                    }))
                  }
                />
                允许其他设备向我发起配对
              </label>
              <div className="mt-3 text-xs text-[var(--muted)]">发现的设备</div>
              {syncDevices.length === 0 && (
                <div className="mt-1 text-xs text-[var(--muted)]">暂无</div>
              )}
              {syncDevices.map((device) => {
                const paired = syncPeers.some((peer) => peer.device_id === device.id);
                return (
                  <div key={device.id} className="mt-2 flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-[var(--text)]">{device.product_id}</div>
                      <div className="text-[11px] text-[var(--muted)]">
                        {device.host}:{device.port}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={paired}
                      className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] disabled:opacity-40"
                      onClick={async () => {
                        setSyncMessage("正在配对…");
                        try {
                          await pairSyncDevice(device.id);
                          setSyncMessage("配对完成");
                          await refreshSync();
                        } catch (reason) {
                          setSyncMessage(String(reason));
                        }
                      }}
                    >
                      {paired ? "已配对" : "配对"}
                    </button>
                  </div>
                );
              })}
              <div className="mt-3 flex items-center gap-2">
                <input
                  className="min-w-0 flex-1 rounded border border-[var(--border)] bg-transparent px-2 py-1 text-xs"
                  placeholder="手动地址"
                  value={manualSyncHost}
                  onChange={(event) => setManualSyncHost(event.target.value)}
                />
                <input
                  className="w-20 rounded border border-[var(--border)] bg-transparent px-2 py-1 text-xs"
                  placeholder="端口"
                  value={manualSyncPort}
                  onChange={(event) => setManualSyncPort(event.target.value)}
                />
                <button
                  type="button"
                  className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)]"
                  onClick={async () => {
                    try {
                      await pairSyncAddress(manualSyncHost.trim(), Number(manualSyncPort));
                      setSyncMessage("手动配对完成");
                      await refreshSync();
                    } catch (reason) {
                      setSyncMessage(String(reason));
                    }
                  }}
                >
                  手动配对
                </button>
              </div>
            </section>
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-4">
              <h3 className="text-sm font-medium text-[var(--text)]">已配对设备</h3>
              {syncPeers.length === 0 && (
                <div className="mt-1 text-xs text-[var(--muted)]">暂无</div>
              )}
              {syncPeers.map((peer) => {
                const online = syncDevices.some((device) => device.id === peer.device_id);
                return (
                  <div key={peer.id} className="mt-2 flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-[var(--text)]">{peer.name}</div>
                      <div className="text-[11px] text-[var(--muted)]">
                        {online ? "在线" : "离线"}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={!online}
                      className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] disabled:opacity-40"
                      onClick={async () => {
                        setSyncMessage("正在同步…");
                        try {
                          const result = await runSync("lan", peer.id);
                          setSyncMessage(
                            `同步完成：拉取 ${result.pulled}，推送 ${result.pushed}`,
                          );
                          await refreshSync();
                        } catch (reason) {
                          setSyncMessage(String(reason));
                        }
                      }}
                    >
                      同步
                    </button>
                    <button
                      type="button"
                      className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)]"
                      onClick={async () => {
                        if (expandedSyncPeer === peer.id) {
                          setExpandedSyncPeer(null);
                          return;
                        }
                        setExpandedSyncPeer(peer.id);
                        setSyncGrants(await getSyncGrants(peer.id));
                      }}
                    >
                      模块
                    </button>
                  </div>
                );
              })}
              {expandedSyncPeer && (
                <div className="mt-3 rounded-xl border border-[var(--border)] p-3">
                  <div className="mb-2 text-xs text-[var(--muted)]">模块授权</div>
                  {SYNC_MODULES.map(([moduleId, label]) => {
                    const enabled = syncGrants.some(
                      (grant) => grant.module_id === moduleId && grant.permission === "write",
                    );
                    return (
                      <label
                        key={moduleId}
                        className="flex items-center gap-2 py-0.5 text-xs text-[var(--text)]"
                      >
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={async (event) => {
                            if (event.target.checked) {
                              await grantSyncModule(expandedSyncPeer, moduleId, "write");
                            } else {
                              await revokeSyncModule(expandedSyncPeer, moduleId);
                            }
                            setSyncGrants(await getSyncGrants(expandedSyncPeer));
                          }}
                        />
                        {label}
                      </label>
                    );
                  })}
                </div>
              )}
            </section>
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-4">
              <h3 className="text-sm font-medium text-[var(--text)]">服务器同步</h3>
              <label className="mt-2 block text-xs text-[var(--muted)]">
                服务器地址
                <input
                  className="mt-1 w-full rounded border border-[var(--border)] bg-transparent px-3 py-2 text-sm text-[var(--text)]"
                  value={draft.sync_server_url}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      sync_server_url: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="mt-2 block text-xs text-[var(--muted)]">
                Token
                <input
                  type="password"
                  className="mt-1 w-full rounded border border-[var(--border)] bg-transparent px-3 py-2 text-sm text-[var(--text)]"
                  value={draft.sync_server_token}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      sync_server_token: event.target.value,
                    }))
                  }
                />
              </label>
              <button
                type="button"
                className="mt-2 rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)]"
                onClick={async () => {
                  try {
                    await saveSetting("sync_pairing_enabled", draft.sync_pairing_enabled);
                    await saveSetting("sync_server_url", draft.sync_server_url);
                    await saveSetting("sync_server_token", draft.sync_server_token);
                    setSyncMessage("正在连接服务器…");
                    const result = await runSync("server", null);
                    setSyncMessage(
                      `服务器同步完成：拉取 ${result.pulled}，推送 ${result.pushed}`,
                    );
                    await refreshSync();
                  } catch (reason) {
                    setSyncMessage(String(reason));
                  }
                }}
              >
                保存并同步
              </button>
            </section>
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-4">
              <div className="text-sm font-medium text-[var(--text)]">
                冲突 {syncConflicts.length}
              </div>
              {syncConflicts.slice(0, 5).map((conflict) => (
                <div
                  key={`${conflict.module_id}-${conflict.entity_type}-${conflict.entity_id}`}
                  className="mt-1 text-[11px] text-[var(--muted)]"
                >
                  {conflict.module_id}/{conflict.entity_type}: {conflict.detail}
                </div>
              ))}
              {syncMessage && (
                <div className="mt-2 text-xs text-[var(--muted)]">{syncMessage}</div>
              )}
            </section>
          </div>
        )}
        {tab === "features" && (
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
        )}
        {tab === "about" && (
          <div className="space-y-3">
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-4">
              <div className="text-sm font-medium text-[var(--text)]">yumeFriend</div>
              <div className="mt-1 text-xs text-[var(--muted)]">
                版本 {window.yumeFriend?.version ?? "0.1.0"}
              </div>
            </section>
            <div className="flex gap-2">
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
              <button
                type="button"
                className="rounded border border-stone-300 px-3 py-1.5 text-xs text-stone-600"
                onClick={() => setLegalOpen(true)}
              >
                法律说明
              </button>
            </div>
          </div>
        )}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <button
            type="button"
            className="rounded border border-stone-300 px-3 py-2 text-sm text-stone-600"
            onClick={() => setSettingsOpen(false)}
          >
            取消
          </button>
          <button
            type="button"
            className="rounded bg-stone-800 px-3 py-2 text-sm text-white"
            onClick={() => void saveSettings(draft)}
          >
            保存
          </button>
        </div>
      <Live2DSettingsModal open={live2dOpen} onClose={() => setLive2dOpen(false)} />
      <LegalModal open={legalOpen} onClose={() => setLegalOpen(false)} />
      </div>
    </div>
  );
}

function Chat() {
  const {
    friends,
    selectedId,
    messages,
    sending,
    messageCursor,
    loadOlderMessages,
    error,
    sendMessage,
    setPanel,
    setImmersive,
    refreshMessages,
    features,
    stopMessage,
  } = useApp();
  const [draft, setDraft] = useState("");
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const [recording, setRecording] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const friend = friends.find((item) => item.id === selectedId);
  const streamingMessage = [...messages].reverse().find((message) => message.status === "streaming");

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
          <button
            className="feature-link"
            onClick={() => window.yumeFriend?.openPet?.(friend.id)}
          >
            桌宠
          </button>
        </div>
      </div>
      <div className="chat-scroll">
        <div className="chat-inner">
          {messageCursor && (
            <div className="mb-4 text-center">
              <button
                className="rounded border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)] hover:text-[var(--text)]"
                onClick={() => void loadOlderMessages()}
              >
                加载更早
              </button>
            </div>
          )}
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
          <button className="icon-button" onClick={() => setCallOpen(true)}>
            {icons.phone}
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
            if (sending || !draft.trim()) return;
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
            type={sending ? "button" : "submit"}
            disabled={!sending && !draft.trim()}
            className="send-button disabled:opacity-40"
            onClick={() => {
              if (sending && streamingMessage) {
                void stopMessage(streamingMessage.id);
              }
            }}
          >
            {sending ? "停止" : "发送"}
          </button>
          </form>
        </div>
      </div>
      {callOpen && <CallOverlay friend={friend} onClose={() => setCallOpen(false)} />}
    </section>
  );
}

function CallOverlay({ friend, onClose }: { friend: Friend; onClose: () => void }) {
  const {
    messages,
    sending,
    speaking,
    sendMessage,
    stopVoice,
    playVoice,
    setCallActive,
  } = useApp();
  const [stage, setStage] = useState<"idle" | "listening" | "transcribing">("idle");
  const [callError, setCallError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const cancelledRef = useRef(false);
  const lastAssistant = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");
  const spokenRef = useRef(
    [...messages]
      .reverse()
      .find((message) => message.role === "assistant" && message.status === "completed")?.id ?? "",
  );
  const busy = sending || speaking || stage === "transcribing";

  useEffect(() => {
    setCallActive(true);
    return () => setCallActive(false);
  }, [setCallActive]);

  useEffect(() => {
    if (
      !lastAssistant ||
      lastAssistant.id === spokenRef.current ||
      lastAssistant.status !== "completed"
    ) {
      return;
    }
    spokenRef.current = lastAssistant.id;
    const assetIds = lastAssistant.voice_asset_ids ?? [];
    if (assetIds.length) {
      void playVoice(assetIds);
      return;
    }
    void synthesizeVoice(lastAssistant.id)
      .then(async (result) => {
        useApp.setState((state) => ({
          messages: state.messages.map((message) =>
            message.id === result.message.id ? result.message : message,
          ),
        }));
        await playVoice(result.message.voice_asset_ids ?? []);
      })
      .catch((error) => setCallError(String(error)));
  }, [lastAssistant, playVoice]);

  const startTalking = async () => {
    if (busy || stage === "listening") return;
    setCallError("");
    cancelledRef.current = false;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      setCallError(String(error));
      return;
    }
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      if (cancelledRef.current) return;
      setStage("transcribing");
      try {
        const result = await transcribeAudio(new Blob(chunks, { type: "audio/webm" }));
        if (result.text.trim()) {
          void sendMessage(result.text.trim());
        }
      } catch (error) {
        setCallError(String(error));
      } finally {
        setStage("idle");
      }
    };
    recorder.start();
    recorderRef.current = recorder;
    setStage("listening");
  };

  const stopTalking = () => {
    if (stage !== "listening") return;
    recorderRef.current?.stop();
    setStage("transcribing");
  };

  const hangUp = () => {
    cancelledRef.current = true;
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
    stopVoice();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-stone-950 text-stone-100">
      <header className="flex items-center justify-between px-6 py-4">
        <span className="text-xs text-white/45">与 {friend.name} 通话中</span>
        <button
          className="rounded border border-white/20 px-3 py-1 text-xs text-white/70"
          onClick={hangUp}
        >
          挂断
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-10">
        <div className="avatar !h-28 !w-28 !text-5xl">
          {friend.avatar_asset_id ? (
            <img src={assetUrl(friend.avatar_asset_id)} alt={friend.name} />
          ) : (
            friend.name.slice(0, 1)
          )}
        </div>
        <div className="mt-4 font-serif text-2xl">{friend.name}</div>
        <div className="mt-8 max-h-56 max-w-2xl overflow-y-auto whitespace-pre-wrap text-center text-[15px] leading-8 text-white/75">
          {lastAssistant?.content || "……"}
        </div>
      </div>
      <div className="flex flex-col items-center pb-12">
        <button
          className={`h-20 w-20 rounded-full border text-sm transition ${
            stage === "listening"
              ? "border-red-400 bg-red-500/20 text-red-300"
              : "border-white/25 bg-white/10 text-white/80 disabled:opacity-35"
          }`}
          disabled={busy}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            void startTalking();
          }}
          onPointerUp={stopTalking}
          onPointerCancel={stopTalking}
        >
          {stage === "transcribing" ? "识别中" : sending ? "思考中" : speaking ? "说话中" : "按住说话"}
        </button>
        {callError && <div className="mt-3 text-xs text-red-300">{callError}</div>}
      </div>
    </div>
  );
}

type ImmersiveTransform = { scale: number; x: number; y: number };

const DEFAULT_IMMERSIVE_TRANSFORM: ImmersiveTransform = { scale: 1, x: 0, y: 0 };

function parseImmersiveTransform(raw?: string | null): ImmersiveTransform {
  try {
    const value = JSON.parse(raw || "{}") as Partial<ImmersiveTransform>;
    return {
      scale: Number(value.scale) || 1,
      x: Number(value.x) || 0,
      y: Number(value.y) || 0,
    };
  } catch {
    return DEFAULT_IMMERSIVE_TRANSFORM;
  }
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
    speaking,
    playVoice,
    classifyMessage,
  } = useApp();
  const [preview, setPreview] = useState("");
  const [modelUrl, setModelUrl] = useState("");
  const [modelId, setModelId] = useState("");
  const [expressions, setExpressions] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<"her" | "me">("her");
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [transform, setTransform] = useState(DEFAULT_IMMERSIVE_TRANSFORM);
  const [adjusting, setAdjusting] = useState(false);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const saveTimer = useRef<number | null>(null);
  const classifiedRef = useRef("");
  const playedRef = useRef("");
  const friend = friends.find((item) => item.id === selectedId);
  const lastAssistant = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");
  const units = lastAssistant?.segments?.length
    ? lastAssistant.segments
    : (lastAssistant?.content ?? "")
        .split(/\n+/)
        .map((text) => ({ bubble: 0, text: text.trim(), mood: null }))
        .filter((unit) => unit.text);
  const safeIndex = Math.min(index, Math.max(0, units.length - 1));
  const current = units[safeIndex]?.text ?? "";
  const currentMood = units[safeIndex]?.mood ?? lastAssistant?.mood ?? "正常";
  const displayPreview = expressions[currentMood] || preview;
  const canAdvance = safeIndex < units.length - 1;
  const replyKey = lastAssistant?.id ?? "";

  useEffect(() => {
    setTransform(parseImmersiveTransform(friend?.portrait_transform_json));
    setAdjusting(false);
  }, [friend?.id, friend?.portrait_transform_json]);

  const persistTransform = (next: ImmersiveTransform) => {
    setTransform(next);
    if (!friend) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void patchFriend(friend.id, {
        portrait_transform_json: JSON.stringify(next),
      });
    }, 600);
  };

  const startAdjust = (event: ReactPointerEvent) => {
    if (!adjusting) return;
    event.stopPropagation();
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      ox: transform.x,
      oy: transform.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveAdjust = (event: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!adjusting || !drag) return;
    event.stopPropagation();
    persistTransform({
      ...transform,
      x: drag.ox + event.clientX - drag.x,
      y: drag.oy + event.clientY - drag.y,
    });
  };

  const endAdjust = (event: ReactPointerEvent) => {
    if (!dragRef.current) return;
    event.stopPropagation();
    dragRef.current = null;
  };

  const wheelAdjust = (event: ReactWheelEvent) => {
    if (!adjusting) return;
    event.stopPropagation();
    const scale = Math.min(3, Math.max(0.3, transform.scale - event.deltaY / 800));
    persistTransform({ ...transform, scale: Number(scale.toFixed(3)) });
  };

  useEffect(() => {
    if (!immersive || !friend?.visual_pack_id) {
      setPreview("");
      setModelUrl("");
      setModelId("");
      setExpressions({});
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
            model_id?: string;
            expressions?: Record<string, string>;
          };
          setPreview(manifest.preview_url ?? "");
          setModelUrl(manifest.model_url ?? "");
          setModelId(manifest.model_id ?? "");
          setExpressions(manifest.expressions ?? {});
        } catch {
          setPreview("");
          setModelUrl("");
          setModelId("");
          setExpressions({});
        }
      }
    });
  }, [immersive, friend?.visual_pack_id]);

  useEffect(() => {
    if (!immersive || !lastAssistant || lastAssistant.mood) return;
    if (classifiedRef.current === lastAssistant.id) return;
    classifiedRef.current = lastAssistant.id;
    void classifyMessage(lastAssistant.id);
  }, [immersive, lastAssistant?.id, lastAssistant?.mood, classifyMessage]);

  useEffect(() => {
    setIndex(0);
    setMode("her");
  }, [replyKey]);

  useEffect(() => {
    if (!immersive || !lastAssistant || playedRef.current === lastAssistant.id) return;
    const assetIds = lastAssistant.voice_asset_ids ?? [];
    if (!assetIds.length) return;
    playedRef.current = lastAssistant.id;
    void playVoice(assetIds);
  }, [immersive, lastAssistant, playVoice]);

  if (!immersive || !friend) return null;
  return (
    <div className="fixed inset-0 z-30 flex flex-col overflow-hidden bg-stone-950 text-stone-100">
      <header className="flex items-center justify-between px-5 py-3">
        <span className="text-xs text-white/50">
          {sending ? "正在说…" : mode === "me" ? "轮到你" : "点一下继续"}
        </span>
        <div className="flex items-center gap-2">
          <button
            className={`rounded border px-3 py-1 text-xs ${
              adjusting
                ? "border-[var(--accent)] bg-[var(--accent)]/20 text-white"
                : "border-white/20 text-white/70"
            }`}
            onClick={() => setAdjusting((value) => !value)}
          >
            {adjusting ? "调整中" : "调整立绘"}
          </button>
          {adjusting && (
            <>
              <button
                className="rounded border border-white/20 px-2 py-1 text-xs text-white/75"
                onClick={() =>
                  persistTransform({
                    ...transform,
                    scale: Number(Math.max(0.3, transform.scale - 0.1).toFixed(3)),
                  })
                }
              >
                －
              </button>
              <button
                className="rounded border border-white/20 px-2 py-1 text-xs text-white/75"
                onClick={() =>
                  persistTransform({
                    ...transform,
                    scale: Number(Math.min(3, transform.scale + 0.1).toFixed(3)),
                  })
                }
              >
                ＋
              </button>
              <button
                className="rounded border border-white/20 px-2 py-1 text-xs text-white/75"
                onClick={() => persistTransform(DEFAULT_IMMERSIVE_TRANSFORM)}
              >
                复位
              </button>
            </>
          )}
          <button
            className="rounded border border-white/20 px-3 py-1 text-xs text-white/70"
            onClick={() => setImmersive(false)}
          >
            退出沉浸
          </button>
        </div>
      </header>
      <div
        className="relative flex min-h-0 flex-1 items-end justify-center"
        onClick={() => {
          if (adjusting) return;
          if (mode === "her") {
            if (canAdvance) setIndex((current) => current + 1);
            else setMode("me");
          }
        }}
      >
        {displayPreview && (
          <img
            className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-20 blur-2xl"
            src={displayPreview}
            alt=""
          />
        )}
        <div className="relative flex h-full w-full items-end justify-center">
          <div
            className={`flex h-full w-full items-end justify-center ${
              adjusting ? "ring-1 ring-white/35" : ""
            }`}
            style={{
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
              transformOrigin: "bottom center",
              cursor: adjusting ? "grab" : "default",
              touchAction: adjusting ? "none" : "auto",
            }}
            onPointerDown={startAdjust}
            onPointerMove={moveAdjust}
            onPointerUp={endAdjust}
            onPointerCancel={endAdjust}
            onWheel={wheelAdjust}
          >
            {friend.visual_mode === "live2d" && modelUrl ? (
              <Live2DCharacter
                modelUrl={modelUrl}
                modelId={modelId}
                mood={currentMood}
                speaking={speaking || sending || lastAssistant?.status === "streaming"}
                className="max-h-[82vh] max-w-[72vw]"
              />
            ) : displayPreview ? (
              <img
                className="max-h-[82vh] max-w-[72vw] object-contain drop-shadow-[0_20px_60px_rgba(0,0,0,0.55)]"
                src={displayPreview}
                alt={friend.name}
                draggable={false}
              />
            ) : (
              <div className="pb-40 text-[160px] text-white/15">{friend.name.slice(0, 1)}</div>
            )}
          </div>
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
    refreshUnread,
    theme,
    settings,
  } = useApp();

  useEffect(() => {
    void loadFriends();
    void loadSettings();
  }, [loadFriends, loadSettings]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshMessages();
      void refreshUnread();
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [refreshMessages, refreshUnread]);

  useEffect(() => {
    document.documentElement.dataset.theme = `${theme.color}-${theme.mode}`;
  }, [theme]);

  useEffect(() => {
    void window.yumeFriend?.setZoomFactor?.(settings.ui_scale);
  }, [settings.ui_scale]);

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
                {friend.unread_count ? (
                  <span className="unread-badge">
                    {friend.unread_count > 99 ? "99+" : friend.unread_count}
                  </span>
                ) : (
                  <span className="self-start text-[10px] text-[var(--muted)]">
                    {friend.created_at
                      ? `${new Date(friend.created_at).getMonth() + 1}-${String(
                          new Date(friend.created_at).getDate(),
                        ).padStart(2, "0")}`
                      : ""}
                  </span>
                )}
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
