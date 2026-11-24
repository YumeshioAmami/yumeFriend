import {
  useEffect,
  useMemo,
  useRef,
  useState,
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
const MAX_SCALE = 1.8;

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
  const [hovered, setHovered] = useState(false);
  const [locked, setLocked] = useState(false);
  const [muted, setMuted] = useState(false);
  const [scale, setScale] = useState(1);
  const classifiedRef = useRef("");
  const playedRef = useRef("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  const controlsVisible = hovered || Boolean(draft) || sending;

  return (
    <div
      className={`pet-shell ${locked ? "pet-locked" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="pet-preview" title={locked ? "桌宠已锁定" : "拖动移动窗口"}>
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

      {!locked && (
        <div className="pet-top-ui">
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
          {controlsVisible && (
            <div className="pet-controls">
              <div className="pet-input">
                <input
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
              <div className="pet-actions">
                <button onClick={() => window.yumeFriend?.openMain?.()}>主界面</button>
                <button onClick={switchFriend} disabled={friends.length < 2}>
                  换朋友
                </button>
                <button onClick={() => setLocked(true)}>锁定</button>
                <button onClick={() => setMuted((value) => !value)}>
                  {muted ? "声音" : "静音"}
                </button>
                <button
                  onClick={() =>
                    setBubbleIndex((index) =>
                      bubbles.length ? (index + 1) % bubbles.length : 0,
                    )
                  }
                  disabled={bubbles.length < 2}
                >
                  下一句
                </button>
                <button onClick={() => adjustScale(scale - 0.1)}>－</button>
                <button onClick={() => adjustScale(scale + 0.1)}>＋</button>
                <button onClick={() => window.yumeFriend?.closePet?.()}>关闭</button>
              </div>
            </div>
          )}
        </div>
      )}

      {locked && (
        <button className="pet-unlock" onClick={() => setLocked(false)}>
          解锁
        </button>
      )}
    </div>
  );
}
