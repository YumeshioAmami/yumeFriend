import { useEffect, useState } from "react";
import {
  assetUrl,
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
  const [latest, setLatest] = useState<Message | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    void Promise.all([listFriends(), listVisualPacks()]).then(([friends, packs]) => {
      const current = friends.items[0] ?? null;
      setFriend(current);
      const pack = packs.items.find((item) => item.id === current?.visual_pack_id);
      if (pack?.preview_asset_id) {
        setPreview(assetUrl(pack.preview_asset_id));
      } else if (pack) {
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
  }, []);

  useEffect(() => {
    if (!friend) return;
    const poll = async () => {
      const result = await listMessages(friend.id);
      setLatest(result.items.at(-1) ?? null);
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 3000);
    return () => window.clearInterval(timer);
  }, [friend]);

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
            speaking={latest?.status === "streaming"}
            className="h-full w-full"
          />
        ) : preview ? (
          <img src={preview} alt={friend?.name ?? ""} draggable={false} />
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
