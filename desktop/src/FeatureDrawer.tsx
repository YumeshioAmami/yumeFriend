import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  createMemory,
  createSample,
  createSchedule,
  createThought,
  deleteMemory,
  deleteSample,
  deleteSchedule,
  deleteThought,
  doneThought,
  getStyle,
  listMemories,
  listSamples,
  listSchedules,
  listThoughts,
  recallMemories,
  rollbackStyle,
  saveStyle,
  settleSchedule,
  updateMemory,
  updateSchedule,
  updateThought,
  type ExpressionSample,
  type Memory,
  type Schedule,
  type Thought,
} from "./api";
import { useApp, type Panel } from "./store";

const tabs: { id: Exclude<Panel, null>; label: string }[] = [
  { id: "memory", label: "记忆" },
  { id: "schedule", label: "日程" },
  { id: "thought", label: "想法" },
  { id: "style", label: "风格" },
];

function Drawer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <aside className="flex w-[420px] shrink-0 flex-col border-l border-stone-200 bg-white">
      <div className="flex h-14 items-center justify-between border-b border-stone-200 px-4">
        <span className="text-sm font-medium text-stone-800">{title}</span>
        <button className="text-xs text-stone-400 hover:text-stone-700" onClick={onClose}>
          关闭
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    </aside>
  );
}

function MemoryPanel({ friendId }: { friendId: string }) {
  const [items, setItems] = useState<Memory[]>([]);
  const [content, setContent] = useState("");
  const [kind, setKind] = useState("note");
  const [layer, setLayer] = useState("long_term");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const result = await listMemories(friendId);
      setItems(result.items);
    } catch (reason) {
      setError(String(reason));
    }
  };

  useEffect(() => {
    void load();
  }, [friendId]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!content.trim()) return;
    try {
      if (editingId) {
        await updateMemory(editingId, { content, kind, layer });
      } else {
        await createMemory(friendId, { content, kind, layer });
      }
      setContent("");
      setEditingId(null);
      await load();
    } catch (reason) {
      setError(String(reason));
    }
  };

  return (
    <div className="space-y-4">
      <form className="space-y-2" onSubmit={submit}>
        <textarea
          className="h-20 w-full resize-none rounded border border-stone-300 px-2 py-1.5 text-sm"
          placeholder="记一件事……"
          value={content}
          onChange={(event) => setContent(event.target.value)}
        />
        <div className="flex gap-2">
          <select
            className="flex-1 rounded border border-stone-300 px-2 py-1.5 text-xs"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <option value="note">备注</option>
            <option value="fact">事实</option>
            <option value="preference">偏好</option>
            <option value="promise">约定</option>
            <option value="experience">经历</option>
          </select>
          <select
            className="flex-1 rounded border border-stone-300 px-2 py-1.5 text-xs"
            value={layer}
            onChange={(event) => setLayer(event.target.value)}
          >
            <option value="pinned">置顶</option>
            <option value="long_term">长期</option>
            <option value="short_term">短期</option>
          </select>
          <button className="rounded bg-stone-800 px-3 py-1.5 text-xs text-white">
            {editingId ? "保存" : "添加"}
          </button>
        </div>
      </form>
      <div className="flex gap-2">
        <input
          className="min-w-0 flex-1 rounded border border-stone-300 px-2 py-1.5 text-xs"
          placeholder="回忆关键词"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          className="rounded border border-stone-300 px-3 py-1.5 text-xs text-stone-600"
          onClick={async () => {
            const result = query.trim()
              ? await recallMemories(friendId, query.trim())
              : await listMemories(friendId);
            setItems(result.items);
          }}
        >
          回忆
        </button>
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="rounded border border-stone-200 p-2">
            <div className="text-xs text-stone-400">
              {item.layer} · {item.kind}
            </div>
            <div className="mt-1 whitespace-pre-wrap text-sm text-stone-800">{item.content}</div>
            <div className="mt-2 flex gap-2 text-xs">
              <button
                className="text-stone-500"
                onClick={() => {
                  setEditingId(item.id);
                  setContent(item.content);
                  setKind(item.kind);
                  setLayer(item.layer);
                }}
              >
                编辑
              </button>
              <button
                className="text-red-500"
                onClick={async () => {
                  await deleteMemory(item.id);
                  await load();
                }}
              >
                删除
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SchedulePanel({ friendId }: { friendId: string }) {
  const [items, setItems] = useState<Schedule[]>([]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const result = await listSchedules(friendId);
      setItems(result.items);
    } catch (reason) {
      setError(String(reason));
    }
  };

  useEffect(() => {
    void load();
  }, [friendId]);

  return (
    <div className="space-y-4">
      <form
        className="space-y-2"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!title.trim() || !date) return;
          const data = {
            title: title.trim(),
            date_local: date,
            time_local: time || null,
          };
          try {
            if (editingId) {
              await updateSchedule(editingId, data);
            } else {
              await createSchedule(friendId, data);
            }
            setTitle("");
            setDate("");
            setTime("");
            setEditingId(null);
            await load();
          } catch (reason) {
            setError(String(reason));
          }
        }}
      >
        <input
          className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
          placeholder="日程标题"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <div className="flex gap-2">
          <input
            type="date"
            className="min-w-0 flex-1 rounded border border-stone-300 px-2 py-1.5 text-xs"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
          <input
            type="time"
            className="w-28 rounded border border-stone-300 px-2 py-1.5 text-xs"
            value={time}
            onChange={(event) => setTime(event.target.value)}
          />
          <button className="rounded bg-stone-800 px-3 py-1.5 text-xs text-white">
            {editingId ? "保存" : "添加"}
          </button>
        </div>
      </form>
      {error && <div className="text-xs text-red-600">{error}</div>}
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="rounded border border-stone-200 p-2">
            <div className="text-sm text-stone-800">{item.title}</div>
            <div className="mt-1 text-xs text-stone-400">
              {item.date_local} {item.time_local ?? ""} · {item.state}
            </div>
            <div className="mt-2 flex gap-2 text-xs">
              <button
                className="text-stone-500"
                onClick={() => {
                  setEditingId(item.id);
                  setTitle(item.title);
                  setDate(item.date_local);
                  setTime(item.time_local ?? "");
                }}
              >
                编辑
              </button>
              {item.state === "pending" && (
                <>
                  <button
                    className="text-stone-500"
                    onClick={async () => {
                      await settleSchedule(item.id, "done");
                      await load();
                    }}
                  >
                    完成
                  </button>
                  <button
                    className="text-stone-500"
                    onClick={async () => {
                      await settleSchedule(item.id, "dropped");
                      await load();
                    }}
                  >
                    放弃
                  </button>
                </>
              )}
              <button
                className="text-red-500"
                onClick={async () => {
                  await deleteSchedule(item.id);
                  await load();
                }}
              >
                删除
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ThoughtPanel({ friendId }: { friendId: string }) {
  const [items, setItems] = useState<Thought[]>([]);
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = async () => {
    const result = await listThoughts(friendId);
    setItems(result.items);
  };

  useEffect(() => {
    void load();
  }, [friendId]);

  return (
    <div className="space-y-4">
      <form
        className="space-y-2"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!content.trim()) return;
          if (editingId) {
            await updateThought(editingId, { content });
          } else {
            await createThought(friendId, { content });
          }
          setContent("");
          setEditingId(null);
          await load();
        }}
      >
        <textarea
          className="h-20 w-full resize-none rounded border border-stone-300 px-2 py-1.5 text-sm"
          placeholder="写一张小纸条……"
          value={content}
          onChange={(event) => setContent(event.target.value)}
        />
        <button className="rounded bg-stone-800 px-3 py-1.5 text-xs text-white">
          {editingId ? "保存" : "添加"}
        </button>
      </form>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="rounded border border-stone-200 p-2">
            <div className="whitespace-pre-wrap text-sm text-stone-800">{item.content}</div>
            <div className="mt-1 text-xs text-stone-400">{item.state}</div>
            <div className="mt-2 flex gap-2 text-xs">
              <button
                className="text-stone-500"
                onClick={() => {
                  setEditingId(item.id);
                  setContent(item.content);
                }}
              >
                编辑
              </button>
              {item.state === "pending" && (
                <button
                  className="text-stone-500"
                  onClick={async () => {
                    await doneThought(item.id);
                    await load();
                  }}
                >
                  处理
                </button>
              )}
              <button
                className="text-red-500"
                onClick={async () => {
                  await deleteThought(item.id);
                  await load();
                }}
              >
                删除
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StylePanel({ friendId }: { friendId: string }) {
  const [profile, setProfile] = useState("");
  const [samples, setSamples] = useState<ExpressionSample[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const [style, sampleResult] = await Promise.all([
        getStyle(friendId),
        listSamples(friendId),
      ]);
      setProfile(style.profile_json);
      setSamples(sampleResult.items);
    } catch (reason) {
      setError(String(reason));
    }
  };

  useEffect(() => {
    void load();
  }, [friendId]);

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 text-xs text-stone-500">说话方式</div>
        <textarea
          className="h-32 w-full resize-none rounded border border-stone-300 px-2 py-1.5 text-sm"
          placeholder='例如 {"语气":"自然","句长":"短"}'
          value={profile}
          onChange={(event) => setProfile(event.target.value)}
        />
        <div className="mt-2 flex gap-2">
          <button
            className="rounded bg-stone-800 px-3 py-1.5 text-xs text-white"
            onClick={async () => {
              await saveStyle(friendId, profile);
              await load();
            }}
          >
            保存
          </button>
          <button
            className="rounded border border-stone-300 px-3 py-1.5 text-xs text-stone-600"
            onClick={async () => {
              try {
                const style = await rollbackStyle(friendId);
                setProfile(style.profile_json);
                await load();
              } catch (reason) {
                setError(String(reason));
              }
            }}
          >
            回滚
          </button>
        </div>
      </div>
      <div>
        <div className="mb-1 text-xs text-stone-500">表达样本</div>
        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded border border-stone-300 px-2 py-1.5 text-xs"
            placeholder="她平时会怎么说"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <button
            className="rounded bg-stone-800 px-3 py-1.5 text-xs text-white"
            onClick={async () => {
              if (!text.trim()) return;
              await createSample(friendId, { text: text.trim(), kind: "voice" });
              setText("");
              await load();
            }}
          >
            添加
          </button>
        </div>
        <div className="mt-2 space-y-2">
          {samples.map((sample) => (
            <div key={sample.id} className="flex items-start gap-2 text-sm">
              <span className="min-w-0 flex-1 text-stone-700">{sample.text}</span>
              <button
                className="text-xs text-red-500"
                onClick={async () => {
                  await deleteSample(sample.id);
                  await load();
                }}
              >
                删除
              </button>
            </div>
          ))}
        </div>
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}
    </div>
  );
}

export function FeatureDrawer() {
  const { panel, setPanel, selectedId } = useApp();
  if (!panel || !selectedId) return null;
  return (
    <Drawer title={tabs.find((tab) => tab.id === panel)?.label ?? ""} onClose={() => setPanel(null)}>
      <div className="mb-4 flex gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`rounded px-2 py-1 text-xs ${
              panel === tab.id ? "bg-stone-800 text-white" : "text-stone-500 hover:bg-stone-100"
            }`}
            onClick={() => setPanel(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {panel === "memory" && <MemoryPanel friendId={selectedId} />}
      {panel === "schedule" && <SchedulePanel friendId={selectedId} />}
      {panel === "thought" && <ThoughtPanel friendId={selectedId} />}
      {panel === "style" && <StylePanel friendId={selectedId} />}
    </Drawer>
  );
}
