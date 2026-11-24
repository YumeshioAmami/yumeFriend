import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  assetUrl,
  classifyMessageMoods,
  listFriends,
  listMessages,
  listVisualPacks,
  sendMessage,
  synthesizeVoice,
  type Friend,
  type Message,
  type VisualPack,
} from "./api";
import { Live2DCharacter } from "./Live2DCharacter";

const MIN_SCALE = 0.6;
const MAX_SCALE = 5.4;

export default function PetWindow() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friend, setFriend] = useState<Friend | null>(null);
  const [preview, setPreview] = useState("");
  const [modelUrl, setModelUrl] = useState("");
  const [modelId, setModelId] = useState("");
  const [expressions, setExpressions] = useState<Record<string, string>>({});
  const [latest, setLatest] = useState<Message | null>(null);
  const [bubbleIndex, setBubbleIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [locked, setLocked] = useState(false);
  const [muted, setMuted] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const classifiedRef = useRef("");
  const playedRef = useRef("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const ignoreRef = useRef(true);
  const offsetDragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
    null,
  );

  const showPack = (pack?: VisualPack) => {
    setPreview("");
    setModelUrl("");
    setModelId("");
    setExpressions({});
    if (!pack) return;
    if (pack.preview_asset_id) {
      setPreview(assetUrl(pack.preview_asset_id));
      return;
    }
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
  };

  useEffect(() => {
    void Promise.all([
      listFriends(),
      listVisualPacks(),
      window.yumeFriend?.getPetScale?.() ?? Promise.resolve(1),
    ]).then(([friendResult, packResult, currentScale]) => {
      setFriends(friendResult.items);
      setScale(Number(currentScale) || 1);
      const friendId = new URLSearchParams(window.location.search).get("friend");
      const current =
        friendResult.items.find((item) => item.id === friendId) ??
        friendResult.items[0] ??
        null;
      setFriend(current);
      showPack(packResult.items.find((item) => item.id === current?.visual_pack_id));
    });
  }, []);

  useEffect(() => {
    if (!friend) return;
    const poll = async () => {
      const result = await listMessages(friend.id);
      setLatest(
        [...result.items].reverse().find((message) => message.role === "assistant") ?? null,
      );
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 3000);
    return () => window.clearInterval(timer);
  }, [friend]);

  useEffect(() => {
    setBubbleIndex(0);
  }, [latest?.id]);

  useEffect(() => {
    if (chatOpen) inputRef.current?.focus();
  }, [chatOpen]);

  useEffect(() => {
    const raw = localStorage.getItem("yf.pet.offset");
    if (!raw) return;
    try {
      const value = JSON.parse(raw) as { x?: number; y?: number };
      setOffset({ x: Number(value.x) || 0, y: Number(value.y) || 0 });
    } catch {
      setOffset({ x: 0, y: 0 });
    }
  }, []);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
      const hit = Boolean(target?.closest(".pet-hit"));
      setHovered(hit);
      if (ignoreRef.current !== !hit) {
        ignoreRef.current = !hit;
        void window.yumeFriend?.setPetIgnoreMouse?.(!hit);
      }
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  useEffect(() => {
    if (!latest || latest.status !== "completed" || latest.mood) return;
    if (classifiedRef.current === latest.id) return;
    classifiedRef.current = latest.id;
    void classifyMessageMoods(latest.id).then((result) => {
      setLatest((current) =>
        current
          ? { ...current, mood: result.mood, segments: result.segments }
          : current,
      );
    });
  }, [latest?.id, latest?.status, latest?.mood]);

  const bubbles = useMemo(() => {
    if (!latest) return [];
    if (latest.segments?.length) {
      const grouped = new Map<number, { texts: string[]; mood: string | null }>();
      for (const unit of latest.segments) {
        if (!unit.text) continue;
        const item = grouped.get(unit.bubble) ?? { texts: [], mood: null };
        item.texts.push(unit.text);
        if (unit.mood) item.mood = unit.mood;
        grouped.set(unit.bubble, item);
      }
      return [...grouped.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, item]) => ({ text: item.texts.join("\n"), mood: item.mood }));
    }
    return latest.content
      .split(/\n{2,}/)
      .map((text) => ({ text: text.trim(), mood: latest.mood ?? null }))
      .filter((item) => item.text);
  }, [latest]);

  const currentBubble =
    bubbles.length > 0 ? bubbles[Math.min(bubbleIndex, bubbles.length - 1)] : null;
  const lockedText = bubbles.map((item) => item.text).join("\n\n") || latest?.content || "";
  const currentMood = currentBubble?.mood ?? latest?.mood ?? "正常";
  const displayPreview = expressions[currentMood] || preview;

  const stopAudio = () => {
    audioRef.current?.pause();
    audioRef.current = null;
  };

  const playQueue = async (assetIds: string[]) => {
    stopAudio();
    for (const assetId of assetIds) {
      const audio = new Audio(assetUrl(assetId));
      audioRef.current = audio;
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error("语音播放失败"));
        void audio.play().catch(reject);
      });
    }
    audioRef.current = null;
  };

  useEffect(() => {
    if (muted) stopAudio();
  }, [muted]);

  useEffect(() => {
    if (!latest || latest.status !== "completed" || muted || !friend) return;
    if (playedRef.current === latest.id) return;
    playedRef.current = latest.id;
    void (async () => {
      if (await window.yumeFriend?.isMainFocused?.()) return;
      let assetIds = latest.voice_asset_ids ?? [];
      if (!assetIds.length && friend.voice_reply_enabled === 1 && friend.voice_id) {
        const result = await synthesizeVoice(latest.id);
        assetIds = result.message.voice_asset_ids ?? [];
        setLatest(result.message);
      }
      if (assetIds.length) await playQueue(assetIds);
    })().catch(() => undefined);
  }, [
    latest?.id,
    latest?.status,
    muted,
    friend?.id,
    friend?.voice_id,
    friend?.voice_reply_enabled,
  ]);

  const adjustScale = (value: number) => {
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(value.toFixed(3))));
    setScale(next);
    void window.yumeFriend?.setPetScale?.(next);
  };

  const saveOffset = (next: { x: number; y: number }) => {
    setOffset(next);
    localStorage.setItem("yf.pet.offset", JSON.stringify(next));
  };

  const startOffsetDrag = (event: ReactPointerEvent) => {
    if (!adjusting || locked) return;
    event.stopPropagation();
    offsetDragRef.current = {
      x: event.clientX,
      y: event.clientY,
      ox: offset.x,
      oy: offset.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveOffsetDrag = (event: ReactPointerEvent) => {
    const drag = offsetDragRef.current;
    if (!adjusting || !drag) return;
    event.stopPropagation();
    setOffset({
      x: drag.ox + event.clientX - drag.x,
      y: drag.oy + event.clientY - drag.y,
    });
  };

  const endOffsetDrag = (event: ReactPointerEvent) => {
    if (!offsetDragRef.current) return;
    event.stopPropagation();
    offsetDragRef.current = null;
    localStorage.setItem("yf.pet.offset", JSON.stringify(offset));
  };

  const switchFriend = () => {
    if (locked || friends.length < 2 || !friend) return;
    const index = friends.findIndex((item) => item.id === friend.id);
    const next = friends[(index + 1) % friends.length];
    setFriend(next);
    setLatest(null);
    playedRef.current = "";
    stopAudio();
    void listVisualPacks().then((result) => {
      showPack(result.items.find((item) => item.id === next.visual_pack_id));
    });
  };

  const submit = () => {
    if (!friend || !draft.trim() || sending || locked) return;
    setSending(true);
    const text = draft;
    setDraft("");
    void sendMessage(friend.id, text)
      .then(() => undefined)
      .finally(() => setSending(false));
  };

  return (
    <div className={`pet-shell ${locked ? "pet-locked" : ""}`}>
      <div
        className={`pet-preview ${locked ? "" : "pet-hit"} ${
          adjusting ? "pet-adjusting" : ""
        }`}
        title={locked ? "桌宠已锁定" : "拖动移动窗口"}
        onPointerDown={startOffsetDrag}
        onPointerMove={moveOffsetDrag}
        onPointerUp={endOffsetDrag}
        onPointerCancel={endOffsetDrag}
      >
        <div
          className="pet-visual"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
        >
          {friend?.visual_mode === "live2d" && modelUrl ? (
            <Live2DCharacter
              modelUrl={modelUrl}
              modelId={modelId}
              mood={currentMood}
              speaking={sending}
              className="h-full w-full"
            />
          ) : displayPreview ? (
            <img src={displayPreview} alt={friend?.name ?? ""} draggable={false} />
          ) : (
            <div className="pet-face">{friend?.name.slice(0, 1) ?? "?"}</div>
          )}
        </div>
      </div>

      <div className={`pet-rail pet-hit ${hovered ? "visible" : ""}`}>
        {!locked ? (
          <>
            <button onClick={() => window.yumeFriend?.openMain?.()}>主界面</button>
            <button onClick={switchFriend} disabled={friends.length < 2}>
              换朋友
            </button>
            <button
              className={chatOpen ? "active" : ""}
              onClick={() => setChatOpen((value) => !value)}
            >
              {chatOpen ? "收起" : "说话"}
            </button>
            <button
              onClick={() => {
                setLocked(true);
                setChatOpen(false);
              }}
            >
              锁定
            </button>
            <button onClick={() => setMuted((value) => !value)}>
              {muted ? "声音" : "静音"}
            </button>
            <button onClick={() => adjustScale(scale - 0.1)}>－</button>
            <button onClick={() => adjustScale(scale + 0.1)}>＋</button>
            <button
              className={adjusting ? "active" : ""}
              onClick={() => setAdjusting((value) => !value)}
            >
              {adjusting ? "完成" : "位置"}
            </button>
            {adjusting && <button onClick={() => saveOffset({ x: 0, y: 0 })}>复位</button>}
            <button onClick={() => window.yumeFriend?.closePet?.()}>关闭</button>
          </>
        ) : (
          <button onClick={() => setLocked(false)}>解锁</button>
        )}
      </div>

      {!locked && chatOpen && (
        <div className="pet-chat-panel pet-hit">
          <button className="pet-chat-close" onClick={() => setChatOpen(false)}>
            ×
          </button>
          {currentBubble?.text && (
            <div
              className="pet-bubble"
              onClick={() => {
                if (bubbles.length > 1) {
                  setBubbleIndex((index) => (index + 1) % bubbles.length);
                }
              }}
            >
              <div className="pet-name">{friend?.name}</div>
              {currentBubble.text}
            </div>
          )}
          <div className="pet-input">
            <input
              ref={inputRef}
              value={draft}
              placeholder="说点什么…"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
            />
            <button disabled={sending || !draft.trim()} onClick={submit}>
              发送
            </button>
          </div>
        </div>
      )}

      {locked && lockedText && (
        <div className="pet-chat-panel pet-readonly pet-hit">
          <div className="pet-bubble">
            <div className="pet-name">{friend?.name}</div>
            {lockedText}
          </div>
        </div>
      )}
    </div>
  );
}
