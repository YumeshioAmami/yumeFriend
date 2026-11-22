import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  assetUrl,
  captureScreen,
  createMemory,
  createSample,
  createSchedule,
  createThought,
  createVisualPack,
  deleteDocument,
  deleteFile,
  deleteMemory,
  deleteSample,
  deleteSchedule,
  deleteThought,
  deleteVisualPack,
  doneThought,
  getLife,
  getStyle,
  listDocuments,
  listFiles,
  listMemories,
  listSamples,
  listSchedules,
  listThoughts,
  listVisualPacks,
  moveFile,
  patchFriend,
  pauseLife,
  readFile,
  recallMemories,
  resumeLife,
  rollbackStyle,
  saveStyle,
  searchDocuments,
  searchWeb,
  settleSchedule,
  uploadDocument,
  updateMemory,
  updateSchedule,
  updateThought,
  writeFile,
  type Document,
  type ExpressionSample,
  type FileItem,
  type Friend,
  type LifeState,
  type Memory,
  type Schedule,
  type SearchHit,
  type Thought,
  type VisualPack,
} from "./api";
import { useApp, type Panel } from "./store";

const tabs: { id: Exclude<Panel, null>; label: string }[] = [
  { id: "memory", label: "记忆" },
  { id: "schedule", label: "日程" },
  { id: "thought", label: "想法" },
  { id: "style", label: "风格" },
  { id: "knowledge", label: "知识" },
  { id: "search", label: "搜索" },
  { id: "screen", label: "看屏" },
  { id: "file", label: "文件" },
  { id: "visual", label: "呈现" },
  { id: "life", label: "生活" },
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

function KnowledgePanel({ friendId }: { friendId: string }) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const result = await listDocuments(friendId);
      setDocuments(result.items);
    } catch (reason) {
      setError(String(reason));
    }
  };

  useEffect(() => {
    void load();
  }, [friendId]);

  return (
    <div className="space-y-4">
      <input
        type="file"
        className="w-full text-xs"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          try {
            await uploadDocument(friendId, file);
            await load();
          } catch (reason) {
            setError(String(reason));
          } finally {
            event.target.value = "";
          }
        }}
      />
      <div className="flex gap-2">
        <input
          className="min-w-0 flex-1 rounded border border-stone-300 px-2 py-1.5 text-xs"
          placeholder="检索资料"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          className="rounded border border-stone-300 px-3 py-1.5 text-xs text-stone-600"
          onClick={async () => {
            const result = await searchDocuments(friendId, query);
            setHits(result.items);
          }}
        >
          检索
        </button>
      </div>
      {hits.length > 0 && (
        <div className="space-y-2 rounded bg-stone-50 p-2">
          {hits.map((hit, index) => (
            <div key={`${hit.document_id}-${hit.seq}-${index}`} className="text-xs text-stone-600">
              {hit.text}
            </div>
          ))}
        </div>
      )}
      {error && <div className="text-xs text-red-600">{error}</div>}
      <div className="space-y-2">
        {documents.map((document) => (
          <div key={document.id} className="flex items-center gap-2 rounded border border-stone-200 p-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-stone-800">{document.name}</div>
              <div className="text-xs text-stone-400">
                {document.kind} · {document.chars} 字
              </div>
            </div>
            <button
              className="text-xs text-red-500"
              onClick={async () => {
                await deleteDocument(document.id);
                await load();
              }}
            >
              删除
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SearchPanel({ friendId }: { friendId: string }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchHit[]>([]);
  const [error, setError] = useState("");
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          className="min-w-0 flex-1 rounded border border-stone-300 px-2 py-1.5 text-xs"
          placeholder="搜索网页"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          className="rounded bg-stone-800 px-3 py-1.5 text-xs text-white"
          onClick={async () => {
            try {
              const result = await searchWeb(friendId, query);
              setItems(result.items);
            } catch (reason) {
              setError(String(reason));
            }
          }}
        >
          搜索
        </button>
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}
      <div className="space-y-3">
        {items.map((item) => (
          <a
            key={item.url}
            className="block rounded border border-stone-200 p-2 hover:bg-stone-50"
            href={item.url}
            target="_blank"
            rel="noreferrer"
          >
            <div className="text-sm text-stone-800">{item.title}</div>
            <div className="mt-1 text-xs text-stone-500">{item.snippet}</div>
          </a>
        ))}
      </div>
    </div>
  );
}

function ScreenPanel({ friendId }: { friendId: string }) {
  const [assetId, setAssetId] = useState("");
  return (
    <div className="space-y-4">
      <button
        className="rounded bg-stone-800 px-3 py-1.5 text-xs text-white"
        onClick={async () => {
          const result = await captureScreen(friendId);
          setAssetId(result.asset_id);
        }}
      >
        截取当前屏幕
      </button>
      {assetId && (
        <img
          className="w-full rounded border border-stone-200"
          src={assetUrl(assetId)}
          alt="屏幕截图"
        />
      )}
    </div>
  );
}

function FilePanel() {
  const [path, setPath] = useState("");
  const [items, setItems] = useState<FileItem[]>([]);
  const [selected, setSelected] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");

  const load = async (nextPath = path) => {
    try {
      const result = await listFiles(nextPath);
      setItems(result.items);
    } catch (reason) {
      setError(String(reason));
    }
  };

  useEffect(() => {
    void load("");
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          className="min-w-0 flex-1 rounded border border-stone-300 px-2 py-1.5 text-xs"
          placeholder="工作区路径"
          value={path}
          onChange={(event) => setPath(event.target.value)}
        />
        <button
          className="rounded border border-stone-300 px-3 py-1.5 text-xs text-stone-600"
          onClick={() => void load()}
        >
          打开
        </button>
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}
      <div className="space-y-1">
        {items.map((item) => (
          <button
            key={item.path}
            className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-stone-100"
            onClick={async () => {
              if (item.is_dir) {
                setPath(item.path);
                await load(item.path);
              } else {
                setSelected(item.path);
                const result = await readFile(item.path);
                setContent(result.content);
              }
            }}
          >
            <span className="truncate text-stone-700">
              {item.is_dir ? "📁 " : "📄 "}
              {item.name}
            </span>
            <span className="text-stone-400">{item.size}</span>
          </button>
        ))}
      </div>
      {selected && (
        <div className="space-y-2">
          <div className="text-xs text-stone-500">{selected}</div>
          <textarea
            className="h-40 w-full resize-none rounded border border-stone-300 px-2 py-1.5 font-mono text-xs"
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />
          <div className="flex gap-2">
            <button
              className="rounded bg-stone-800 px-3 py-1.5 text-xs text-white"
              onClick={async () => {
                await writeFile(selected, content);
                await load(path);
              }}
            >
              保存
            </button>
            <button
              className="rounded border border-stone-300 px-3 py-1.5 text-xs text-stone-600"
              onClick={async () => {
                const destination = window.prompt("移动到", selected);
                if (!destination) return;
                await moveFile(selected, destination);
                await load(path);
              }}
            >
              移动
            </button>
            <button
              className="rounded border border-red-200 px-3 py-1.5 text-xs text-red-500"
              onClick={async () => {
                await deleteFile(selected);
                setSelected("");
                await load(path);
              }}
            >
              删除
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function parsePreview(manifestJson: string): string {
  try {
    const parsed = JSON.parse(manifestJson) as { preview_url?: string };
    return parsed.preview_url ?? "";
  } catch {
    return "";
  }
}

function VisualPanel({ friend }: { friend: Friend }) {
  const { setImmersive, loadFriends } = useApp();
  const [packs, setPacks] = useState<VisualPack[]>([]);
  const [kind, setKind] = useState("portrait");
  const [name, setName] = useState("");
  const [manifest, setManifest] = useState('{"preview_url":""}');
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const result = await listVisualPacks();
      setPacks(result.items);
    } catch (reason) {
      setError(String(reason));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const selected = packs.find((pack) => pack.id === friend.visual_pack_id);
  const preview =
    selected?.preview_asset_id
      ? assetUrl(selected.preview_asset_id)
      : selected
        ? parsePreview(selected.manifest_json)
        : "";

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <select
          className="flex-1 rounded border border-stone-300 px-2 py-1.5 text-xs"
          value={friend.visual_mode}
          onChange={async (event) => {
            await patchFriend(friend.id, { visual_mode: event.target.value });
            await loadFriends();
          }}
        >
          <option value="live2d">Live2D</option>
          <option value="portrait">立绘</option>
          <option value="none">不显示</option>
        </select>
        <select
          className="flex-1 rounded border border-stone-300 px-2 py-1.5 text-xs"
          value={friend.visual_pack_id ?? ""}
          onChange={async (event) => {
            await patchFriend(friend.id, { visual_pack_id: event.target.value || null });
            await loadFriends();
          }}
        >
          <option value="">无外观包</option>
          {packs.map((pack) => (
            <option key={pack.id} value={pack.id}>
              {pack.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex aspect-[3/4] max-h-72 items-center justify-center overflow-hidden rounded border border-stone-200 bg-stone-50">
        {preview ? (
          <img className="h-full w-full object-contain" src={preview} alt="外观预览" />
        ) : (
          <div className="text-5xl text-stone-300">{friend.name.slice(0, 1)}</div>
        )}
      </div>
      <div className="flex gap-2">
        <button
          className="rounded bg-stone-800 px-3 py-1.5 text-xs text-white"
          onClick={() => setImmersive(true)}
        >
          沉浸
        </button>
        <button
          className="rounded border border-stone-300 px-3 py-1.5 text-xs text-stone-600"
          onClick={() => window.yumeFriend?.openPet?.()}
        >
          桌宠
        </button>
      </div>
      <div className="space-y-2 border-t border-stone-200 pt-3">
        <div className="flex gap-2">
          <select
            className="w-24 rounded border border-stone-300 px-2 py-1.5 text-xs"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <option value="portrait">立绘</option>
            <option value="live2d">Live2D</option>
          </select>
          <input
            className="min-w-0 flex-1 rounded border border-stone-300 px-2 py-1.5 text-xs"
            placeholder="名称"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <textarea
          className="h-20 w-full resize-none rounded border border-stone-300 px-2 py-1.5 font-mono text-xs"
          value={manifest}
          onChange={(event) => setManifest(event.target.value)}
        />
        <button
          className="rounded bg-stone-800 px-3 py-1.5 text-xs text-white"
          onClick={async () => {
            if (!name.trim()) return;
            try {
              await createVisualPack({ kind, name, manifest_json: manifest });
              setName("");
              await load();
            } catch (reason) {
              setError(String(reason));
            }
          }}
        >
          添加外观包
        </button>
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}
      <div className="space-y-1">
        {packs.map((pack) => (
          <div key={pack.id} className="flex items-center gap-2 rounded border border-stone-200 p-2">
            <span className="min-w-0 flex-1 truncate text-xs text-stone-600">
              {pack.kind} · {pack.name}
            </span>
            <button
              className="text-xs text-red-500"
              onClick={async () => {
                await deleteVisualPack(pack.id);
                await load();
              }}
            >
              删除
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function LifePanel({ friend }: { friend: Friend }) {
  const { loadFriends } = useApp();
  const [life, setLife] = useState<LifeState | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setLife(await getLife(friend.id));
    } catch (reason) {
      setError(String(reason));
    }
  };

  useEffect(() => {
    void load();
  }, [friend.id]);

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-xs text-stone-600">
        <input
          type="checkbox"
          checked={friend.life_enabled === 1}
          onChange={async (event) => {
            await patchFriend(friend.id, { life_enabled: event.target.checked ? 1 : 0 });
            await loadFriends();
          }}
        />
        开启生活线
      </label>
      <div className="flex gap-2">
        <button
          className="rounded border border-stone-300 px-3 py-1.5 text-xs text-stone-600"
          onClick={async () => {
            await pauseLife(friend.id);
            await load();
          }}
        >
          暂停
        </button>
        <button
          className="rounded border border-stone-300 px-3 py-1.5 text-xs text-stone-600"
          onClick={async () => {
            await resumeLife(friend.id);
            await load();
          }}
        >
          恢复
        </button>
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}
      {life && (
        <>
          <div className="rounded bg-stone-50 p-2 text-xs text-stone-600">
            最近观察：{life.friend_life.last_observation || "暂无"}
          </div>
          <div>
            <div className="mb-1 text-xs text-stone-500">生活项目</div>
            {life.projects.map((project) => (
              <div key={project.id} className="text-xs text-stone-600">
                {project.topic} · {project.status} · {project.step_count}
              </div>
            ))}
          </div>
          <div>
            <div className="mb-1 text-xs text-stone-500">活动</div>
            {life.activities.map((activity) => (
              <div key={activity.id} className="mt-1 rounded border border-stone-200 p-2">
                <div className="text-xs text-stone-800">{activity.title}</div>
                <div className="mt-1 text-[11px] text-stone-500">{activity.summary}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function FeatureDrawer() {
  const { panel, setPanel, selectedId, friends } = useApp();
  if (!panel || !selectedId) return null;
  const friend = friends.find((item) => item.id === selectedId);
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
      {panel === "knowledge" && <KnowledgePanel friendId={selectedId} />}
      {panel === "search" && <SearchPanel friendId={selectedId} />}
      {panel === "screen" && <ScreenPanel friendId={selectedId} />}
      {panel === "file" && <FilePanel />}
      {panel === "visual" && friend && <VisualPanel friend={friend} />}
      {panel === "life" && friend && <LifePanel friend={friend} />}
    </Drawer>
  );
}
