import { useEffect, useState } from "react";
import { assetUrl, listFriends, listVisualPacks, type Friend } from "./api";

export default function PetWindow() {
  const [friend, setFriend] = useState<Friend | null>(null);
  const [preview, setPreview] = useState("");

  useEffect(() => {
    void Promise.all([listFriends(), listVisualPacks()]).then(([friends, packs]) => {
      const current = friends.items[0] ?? null;
      setFriend(current);
      const pack = packs.items.find((item) => item.id === current?.visual_pack_id);
      if (pack?.preview_asset_id) {
        setPreview(assetUrl(pack.preview_asset_id));
      } else if (pack) {
        try {
          const manifest = JSON.parse(pack.manifest_json) as { preview_url?: string };
          setPreview(manifest.preview_url ?? "");
        } catch {
          setPreview("");
        }
      }
    });
  }, []);

  return (
    <div className="flex h-screen w-screen select-none flex-col items-center justify-center rounded-full bg-transparent">
      <button
        className="flex h-40 w-40 flex-col items-center justify-center rounded-full border border-white/40 bg-white/80 shadow-xl backdrop-blur"
        onClick={() => window.yumeFriend?.closePet?.()}
        title="关闭桌宠"
      >
        {preview ? (
          <img className="h-32 w-32 rounded-full object-cover" src={preview} alt={friend?.name ?? ""} />
        ) : (
          <div className="text-5xl text-stone-600">{friend?.name.slice(0, 1) ?? "?"}</div>
        )}
        <div className="mt-2 text-xs text-stone-500">{friend?.name ?? "yumeFriend"}</div>
      </button>
    </div>
  );
}
