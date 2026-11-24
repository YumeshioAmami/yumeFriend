import { useEffect, useRef, useState } from "react";
import {
  assetUrl,
  classifyMessageMoods,
  listFriends,
  listMessages,
  listVisualPacks,
  sendMessage,
  type Friend,
  type Message,
} from "./api";
import { Live2DCharacter } from "./Live2DCharacter";

export default function PetWindow() {
  const [friend, setFriend] = useState<Friend | null>(null);
  const [preview, setPreview] = useState("");
  const [modelUrl, setModelUrl] = useState("");
  const [modelId, setModelId] = useState("");
  const [expressions, setExpressions] = useState<Record<string, string>>({});
  const [mood, setMood] = useState<string | null>(null);
  const [latest, setLatest] = useState<Message | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const classifiedRef = useRef("");

  useEffect(() => {
    void Promise.all([listFriends(), listVisualPacks()]).then(([friends, packs]) => {
      const friendId = new URLSearchParams(window.location.search).get("friend");
      const current = friends.items.find((item) => item.id === friendId) ??
        friends.items[0] ??
        null;
      setFriend(current);
      const pack = packs.items.find((item) => item.id === current?.visual_pack_id);
      if (pack?.preview_asset_id) {
        setPreview(assetUrl(pack.preview_asset_id));
      } else if (pack) {
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
    if (!latest || latest.status !== "completed" || latest.mood) {
      setMood(latest?.mood ?? null);
      return;
    }
    if (classifiedRef.current === latest.id) return;
    classifiedRef.current = latest.id;
    void classifyMessageMoods(latest.id).then((result) => {
      setMood(result.mood);
      setLatest((current) =>
        current ? { ...current, mood: result.mood, segments: result.segments } : current,
      );
    });
  }, [latest?.id, latest?.status, latest?.mood]);

  const submit = () => {
    if (!friend || !draft.trim() || sending) return;
    setSending(true);
    void sendMessage(friend.id, draft)
      .then(() => setDraft(""))
      .finally(() => setSending(false));
  };

  return (
    <div className="pet-shell">
      <div
        className="pet-preview"
        onDoubleClick={() => window.yumeFriend?.openMain?.()}
        title="双击回到主界面"
      >
        {modelUrl ? (
          <Live2DCharacter
            modelUrl={modelUrl}
            modelId={modelId}
            mood={mood}
            speaking={latest?.status === "streaming"}
            className="h-full w-full"
          />
        ) : preview ? (
          <img
            src={expressions[mood ?? ""] || preview}
            alt={friend?.name ?? ""}
            draggable={false}
          />
        ) : (
          <div className="pet-face">{friend?.name.slice(0, 1) ?? "?"}</div>
        )}
      </div>
      {latest?.content && (
        <div className="pet-bubble pet-no-drag">
          <div className="pet-name">{friend?.name}</div>
          {latest.content}
        </div>
      )}
      <div className="pet-input pet-no-drag">
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
      <div className="pet-actions pet-no-drag">
        <button onClick={() => window.yumeFriend?.openMain?.()}>主界面</button>
        <button onClick={() => window.yumeFriend?.closePet?.()}>关闭</button>
      </div>
    </div>
  );
}
