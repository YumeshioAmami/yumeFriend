import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  assetUrl,
  createMemory,
  createSample,
  createSchedule,
  createThought,
  createVisualPack,
  clearLogs,
  deleteDocument,
  deleteFile,
  deleteMemory,
  deleteSample,
  deleteSchedule,
  deleteThought,
  deleteVisualPack,
  doneThought,
  getLife,
  getLogs,
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
  settleSchedule,
  uploadDocument,
  uploadAsset,
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
import { Live2DCharacter } from "./Live2DCharacter";

const panelTitles: Record<Exclude<Panel, null>, string> = {
  memory: "记忆",
  schedule: "日程",
  knowledge: "知识",
  life: "生活",
  persona: "人格",
  logs: "日志",
};

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
    <aside className="drawer">
      <div className="drawer-head">
        <span className="text-sm font-medium text-[var(--text)]">{title}</span>
        <button className="text-xs text-[var(--muted)] hover:text-[var(--text)]" onClick={onClose}>
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

function parseManifest(manifestJson: string): { preview_url?: string; model_url?: string } {
  try {
    return JSON.parse(manifestJson) as { preview_url?: string; model_url?: string };
  } catch {
    return {};
  }
}

function VisualPanel({ friend }: { friend: Friend }) {
  const { loadFriends } = useApp();
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
  const manifestData = selected ? parseManifest(selected.manifest_json) : {};
  const preview =
    selected?.preview_asset_id
      ? assetUrl(selected.preview_asset_id)
      : (manifestData.preview_url ?? "");

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
        {selected?.kind === "live2d" && manifestData.model_url ? (
          <Live2DCharacter modelUrl={manifestData.model_url} speaking={false} />
        ) : preview ? (
          <img className="h-full w-full object-contain" src={preview} alt="外观预览" />
        ) : (
          <div className="text-5xl text-stone-300">{friend.name.slice(0, 1)}</div>
        )}
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

function LogPanel() {
  const [items, setItems] = useState<string[]>([]);
  const load = async () => {
    const result = await getLogs();
    setItems(result.items);
  };
  useEffect(() => {
    void load();
  }, []);
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          className="rounded border border-stone-300 px-3 py-1.5 text-xs text-stone-600"
          onClick={() => void load()}
        >
          刷新
        </button>
        <button
          className="rounded border border-red-200 px-3 py-1.5 text-xs text-red-500"
          onClick={async () => {
            await clearLogs();
            await load();
          }}
        >
          清空
        </button>
      </div>
      <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded bg-stone-950 p-3 font-mono text-[11px] leading-5 text-stone-200">
        {items.join("\n") || "暂无日志"}
      </pre>
    </div>
  );
}

function PersonaPanel({ friend }: { friend: Friend }) {
  const { loadFriends, deleteFriend } = useApp();
  const [name, setName] = useState(friend.name);
  const [personality, setPersonality] = useState(friend.personality);
  const [instructions, setInstructions] = useState(friend.custom_instructions);
  const [presence, setPresence] = useState(friend.presence ?? 1);
  const [avatarId, setAvatarId] = useState(friend.avatar_asset_id ?? null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setName(friend.name);
    setPersonality(friend.personality);
    setInstructions(friend.custom_instructions);
    setPresence(friend.presence ?? 1);
    setAvatarId(friend.avatar_asset_id ?? null);
  }, [
    friend.id,
    friend.name,
    friend.personality,
    friend.custom_instructions,
    friend.presence,
    friend.avatar_asset_id,
  ]);

  return (
    <div className="space-y-6">
      <section>
        <div className="panel-title">人格</div>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="avatar !h-16 !w-16 !text-2xl">
              {avatarId ? (
                <img src={assetUrl(avatarId)} alt={friend.name} />
              ) : (
                friend.name.slice(0, 1)
              )}
            </div>
            <label className="cursor-pointer rounded border border-stone-300 px-3 py-1.5 text-xs text-stone-600">
              上传头像
              <input
                className="hidden"
                type="file"
                accept="image/*"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const asset = await uploadAsset(file);
                  await patchFriend(friend.id, { avatar_asset_id: asset.id });
                  setAvatarId(asset.id);
                  await loadFriends();
                }}
              />
            </label>
          </div>
          <input
            className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
            value={name}
            placeholder="名字"
            onChange={(event) => setName(event.target.value)}
          />
          <textarea
            className="h-28 w-full resize-none rounded border border-stone-300 px-2 py-1.5 text-sm"
            placeholder="她是谁"
            value={personality}
            onChange={(event) => setPersonality(event.target.value)}
          />
          <textarea
            className="h-20 w-full resize-none rounded border border-stone-300 px-2 py-1.5 text-sm"
            placeholder="说话习惯和补充要求"
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
          />
          <label className="flex items-center gap-2 text-xs text-stone-600">
            <input
              type="checkbox"
              checked={presence === 1}
              onChange={(event) => setPresence(event.target.checked ? 1 : 0)}
            />
            在场（允许主动消息）
          </label>
          <button
            className="rounded bg-stone-800 px-3 py-1.5 text-xs text-white"
            onClick={async () => {
              await patchFriend(friend.id, {
                name,
                personality,
                custom_instructions: instructions,
                presence,
              });
              await loadFriends();
            }}
          >
            保存人格
          </button>
        </div>
      </section>
      <section>
        <div className="panel-title">风格与表达</div>
        <StylePanel friendId={friend.id} />
      </section>
      <section>
        <div className="panel-title">呈现</div>
        <VisualPanel friend={friend} />
      </section>
      <section>
        <div className="panel-title">删除朋友</div>
        {confirmDelete ? (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-stone-500">连同聊天、记忆等数据一起删除？</span>
            <button
              className="rounded bg-red-600 px-3 py-1.5 text-white"
              onClick={() => void deleteFriend(friend.id)}
            >
              确认删除
            </button>
            <button
              className="rounded border border-stone-300 px-3 py-1.5 text-stone-600"
              onClick={() => setConfirmDelete(false)}
            >
              取消
            </button>
          </div>
        ) : (
          <button
            className="rounded border border-red-200 px-3 py-1.5 text-xs text-red-500"
            onClick={() => setConfirmDelete(true)}
          >
            删除朋友
          </button>
        )}
      </section>
    </div>
  );
}

export function FeatureDrawer() {
  const { panel, setPanel, selectedId, friends } = useApp();
  if (!panel || (panel !== "logs" && !selectedId)) return null;
  const friendId = selectedId ?? "";
  const friend = friends.find((item) => item.id === selectedId);
  return (
    <Drawer title={panelTitles[panel]} onClose={() => setPanel(null)}>
      {panel === "memory" && <MemoryPanel friendId={friendId} />}
      {panel === "schedule" && (
        <>
          <SchedulePanel friendId={friendId} />
          <div className="panel-title mt-6">小纸条</div>
          <ThoughtPanel friendId={friendId} />
        </>
      )}
      {panel === "knowledge" && (
        <>
          <KnowledgePanel friendId={friendId} />
          <div className="panel-title mt-6">文件</div>
          <FilePanel />
        </>
      )}
      {panel === "persona" && friend && <PersonaPanel friend={friend} />}
      {panel === "life" && friend && <LifePanel friend={friend} />}
      {panel === "logs" && <LogPanel />}
    </Drawer>
  );
}
