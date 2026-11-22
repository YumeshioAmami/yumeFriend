import { useEffect, useState } from "react";
import { listFriends, type Friend } from "./api";

export default function PetWindow() {
  const [friend, setFriend] = useState<Friend | null>(null);

  useEffect(() => {
    void listFriends().then((result) => setFriend(result.items[0] ?? null));
  }, []);

  return (
    <div className="flex h-screen w-screen select-none flex-col items-center justify-center rounded-full bg-transparent">
      <button
        className="flex h-40 w-40 flex-col items-center justify-center rounded-full border border-white/40 bg-white/80 shadow-xl backdrop-blur"
        onClick={() => window.yumeFriend?.closePet?.()}
        title="关闭桌宠"
      >
        <div className="text-5xl text-stone-600">{friend?.name.slice(0, 1) ?? "?"}</div>
        <div className="mt-2 text-xs text-stone-500">{friend?.name ?? "yumeFriend"}</div>
      </button>
    </div>
  );
}
