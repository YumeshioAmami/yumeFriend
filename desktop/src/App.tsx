import { useEffect, useState } from "react";
import type { Friend, Message } from "./api";
import { FeatureDrawer } from "./FeatureDrawer";
import { useApp, type Settings } from "./store";

function formatTime(value: string): string {
  const date = new Date(value);
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function Avatar({ friend }: { friend: Friend }) {
  return (
    <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-stone-200 text-sm text-stone-600">
      {friend.name.slice(0, 1)}
    </div>
  );
}

function MessageRow({ message, friend }: { message: Message; friend: Friend }) {
  const assistant = message.role === "assistant";
  return (
    <div className="flex gap-3 py-3">
      {assistant ? <Avatar friend={friend} /> : <div className="w-[30px] shrink-0" />}
      <div className="min-w-0 flex-1">
        <div className="mb-1 text-[11px] text-stone-400">{formatTime(message.created_at)}</div>
        <div className="whitespace-pre-wrap text-[14px] leading-7 text-stone-800">
          {message.content}
          {message.status === "streaming" && <span className="ml-1 animate-pulse">▍</span>}
        </div>
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
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/20">
      <form
        className="w-[460px] rounded-lg bg-white p-5 shadow-xl"
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

function SettingsModal() {
  const { settingsOpen, setSettingsOpen, settings, saveSettings } = useApp();
  const [draft, setDraft] = useState<Settings>(settings);

  useEffect(() => {
    if (settingsOpen) setDraft(settings);
  }, [settingsOpen, settings]);

  if (!settingsOpen) return null;
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/20">
      <form
        className="w-[520px] rounded-lg bg-white p-5 shadow-xl"
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
  const { friends, selectedId, messages, sending, error, sendMessage, setPanel } = useApp();
  const [draft, setDraft] = useState("");
  const friend = friends.find((item) => item.id === selectedId);

  if (!friend) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-stone-400">
        先创建一个朋友
      </div>
    );
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <div className="flex h-16 items-center justify-between border-b border-stone-200 px-6">
        <div>
          <div className="text-[15px] font-medium text-stone-900">{friend.name}</div>
          <div className="mt-0.5 text-[11px] text-stone-400">在线</div>
        </div>
        <div className="flex gap-1">
          {[
            ["memory", "记忆"],
            ["schedule", "日程"],
            ["thought", "想法"],
            ["style", "风格"],
          ].map(([id, label]) => (
            <button
              key={id}
              className="rounded px-2 py-1 text-xs text-stone-500 hover:bg-stone-100"
              onClick={() => setPanel(id as "memory" | "schedule" | "thought" | "style")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-8 py-4">
        {messages.length === 0 && (
          <div className="mt-16 text-center text-sm text-stone-400">还没有消息</div>
        )}
        {messages.map((message) => (
          <MessageRow key={message.id} message={message} friend={friend} />
        ))}
      </div>
      {error && <div className="px-8 pb-2 text-[12px] text-red-600">{error}</div>}
      <div className="border-t border-stone-200 p-4">
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.trim()) return;
            void sendMessage(draft);
            setDraft("");
          }}
        >
          <textarea
            className="h-20 flex-1 resize-none rounded border border-stone-300 px-3 py-2 text-sm leading-6 outline-none focus:border-stone-500"
            placeholder="说点什么……"
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
            className="h-9 rounded bg-stone-800 px-4 text-sm text-white disabled:bg-stone-300"
          >
            发送
          </button>
        </form>
      </div>
    </section>
  );
}

export default function App() {
  const {
    friends,
    selectedId,
    loading,
    error,
    createOpen,
    setCreateOpen,
    setSettingsOpen,
    loadFriends,
    loadSettings,
    selectFriend,
    refreshMessages,
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

  return (
    <div className="flex h-screen flex-col bg-stone-50 text-stone-900">
      <header className="flex h-14 items-center justify-between border-b border-stone-200 px-5">
        <div className="text-[15px] font-medium">yumeFriend</div>
        <button
          className="rounded px-3 py-1.5 text-sm text-stone-500 hover:bg-stone-100"
          onClick={() => setSettingsOpen(true)}
        >
          设置
        </button>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[260px] shrink-0 flex-col border-r border-stone-200 bg-stone-100/60">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-xs text-stone-500">朋友</span>
            <button
              className="rounded px-2 py-1 text-xs text-stone-600 hover:bg-stone-200"
              onClick={() => setCreateOpen(true)}
            >
              + 新建
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2">
            {loading && <div className="px-2 py-2 text-xs text-stone-400">加载中……</div>}
            {friends.map((friend) => (
              <button
                key={friend.id}
                className={`mb-1 flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm ${
                  friend.id === selectedId
                    ? "bg-white text-stone-900 shadow-sm"
                    : "text-stone-600 hover:bg-stone-200/60"
                }`}
                onClick={() => void selectFriend(friend.id)}
              >
                <Avatar friend={friend} />
                <span className="truncate">{friend.name}</span>
              </button>
            ))}
          </div>
          <div className="border-t border-stone-200 px-4 py-3 text-[11px] text-stone-400">
            阶段 3
          </div>
        </aside>
        <Chat />
        <FeatureDrawer />
      </div>
      {error && !createOpen && <div className="px-5 py-2 text-xs text-red-600">{error}</div>}
      <CreateFriendModal />
      <SettingsModal />
    </div>
  );
}
