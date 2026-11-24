import { create } from "zustand";
import {
  assetUrl,
  classifyMessageMoods,
  createFriend,
  deleteFriend as deleteFriendApi,
  getSettings,
  listFriends,
  listMessages,
  markFriendRead,
  retryMessage as retryMessageApi,
  saveSetting,
  sendMessage,
  stopMessage as stopMessageApi,
  streamUrl,
  synthesizeVoice,
  type Friend,
  type Message,
} from "./api";

export type Settings = {
  llm_base_url: string;
  llm_api_key: string;
  llm_model: string;
  tts_base_url: string;
  tts_api_key: string;
  tts_model: string;
  tts_voice: string;
  stt_base_url: string;
  stt_api_key: string;
  stt_model: string;
  image_model: string;
  update_url: string;
  ui_scale: number;
  voice_retention_days: number;
};

export type Theme = {
  color: "paper" | "moss" | "tea" | "sakura";
  mode: "light" | "dark";
};

export type Features = Record<string, boolean>;

export type Panel =
  | "memory"
  | "schedule"
  | "knowledge"
  | "life"
  | "persona"
  | "logs"
  | null;

type AppState = {
  friends: Friend[];
  selectedId: string | null;
  messages: Message[];
  settings: Settings;
  loading: boolean;
  sending: boolean;
  speaking: boolean;
  callActive: boolean;
  error: string | null;
  createOpen: boolean;
  settingsOpen: boolean;
  panel: Panel;
  immersive: boolean;
  theme: Theme;
  features: Features;
  loadFriends: () => Promise<void>;
  selectFriend: (friendId: string) => Promise<void>;
  createFriend: (name: string, personality: string) => Promise<void>;
  deleteFriend: (friendId: string) => Promise<void>;
  sendMessage: (content: string, assetIds?: string[]) => Promise<void>;
  loadSettings: () => Promise<void>;
  saveSettings: (settings: Settings) => Promise<void>;
  setCreateOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setPanel: (panel: Panel) => void;
  setImmersive: (open: boolean) => void;
  saveTheme: (theme: Theme) => Promise<void>;
  saveFeatures: (features: Features) => Promise<void>;
  playVoice: (assetIds: string[]) => Promise<void>;
  stopVoice: () => void;
  setCallActive: (active: boolean) => void;
  refreshMessages: () => Promise<void>;
  refreshUnread: () => Promise<void>;
  classifyMessage: (messageId: string) => Promise<void>;
  retryMessage: (messageId: string) => Promise<void>;
  stopMessage: (messageId: string) => Promise<void>;
};

const emptySettings: Settings = {
  llm_base_url: "",
  llm_api_key: "",
  llm_model: "",
  tts_base_url: "",
  tts_api_key: "",
  tts_model: "",
  tts_voice: "",
  stt_base_url: "",
  stt_api_key: "",
  stt_model: "",
  image_model: "",
  update_url: "",
  ui_scale: 1,
  voice_retention_days: 30,
};

let voiceToken = 0;
let voiceAudio: HTMLAudioElement | null = null;
let voiceResolve: (() => void) | null = null;

export const useApp = create<AppState>((set, get) => ({
  friends: [],
  selectedId: null,
  messages: [],
  settings: emptySettings,
  loading: false,
  sending: false,
  speaking: false,
  callActive: false,
  error: null,
  createOpen: false,
  settingsOpen: false,
  panel: null,
  immersive: false,
  theme: { color: "paper", mode: "light" },
  features: {},

  loadFriends: async () => {
    set({ loading: true, error: null });
    try {
      const result = await listFriends();
      const selectedId = get().selectedId ?? result.items[0]?.id ?? null;
      if (selectedId) {
        const messages = await listMessages(selectedId);
        await markFriendRead(selectedId);
        set({
          friends: result.items.map((friend) =>
            friend.id === selectedId ? { ...friend, unread_count: 0 } : friend,
          ),
          selectedId,
          messages: messages.items,
        });
      } else {
        set({ friends: result.items, selectedId });
      }
    } catch (error) {
      set({ error: String(error) });
    } finally {
      set({ loading: false });
    }
  },

  selectFriend: async (friendId) => {
    set({ selectedId: friendId, messages: [], error: null });
    try {
      const result = await listMessages(friendId);
      await markFriendRead(friendId);
      set((state) => ({
        messages: result.items,
        friends: state.friends.map((friend) =>
          friend.id === friendId ? { ...friend, unread_count: 0 } : friend,
        ),
      }));
    } catch (error) {
      set({ error: String(error) });
    }
  },

  createFriend: async (name, personality) => {
    set({ error: null });
    try {
      const friend = await createFriend({ name, personality });
      set((state) => ({
        friends: [...state.friends, friend],
        selectedId: friend.id,
        messages: [],
        createOpen: false,
      }));
    } catch (error) {
      set({ error: String(error) });
    }
  },

  deleteFriend: async (friendId) => {
    set({ error: null });
    try {
      await deleteFriendApi(friendId);
      const friends = get().friends.filter((friend) => friend.id !== friendId);
      const selectedId = friends[0]?.id ?? null;
      set({ friends, selectedId, messages: [], panel: null });
      if (selectedId) {
        const result = await listMessages(selectedId);
        set({ messages: result.items });
      }
    } catch (error) {
      set({ error: String(error) });
    }
  },

  sendMessage: async (content, assetIds = []) => {
    const friendId = get().selectedId;
    if (!friendId || !content.trim() || get().sending) return;
    set({ sending: true, error: null });
    try {
      const result = await sendMessage(friendId, content, assetIds);
      set((state) => ({
        messages: [...state.messages, result.user_message, result.reply_message],
      }));
      listenReply(result.reply_message);
    } catch (error) {
      set({ error: String(error), sending: false });
    }
  },

  retryMessage: async (messageId) => {
    if (get().sending) return;
    set({ sending: true, error: null });
    try {
      const result = await retryMessageApi(messageId);
      set((state) => ({
        messages: [...state.messages, result.reply_message],
      }));
      listenReply(result.reply_message);
    } catch (error) {
      set({ error: String(error), sending: false });
    }
  },

  stopMessage: async (messageId) => {
    try {
      await stopMessageApi(messageId);
    } catch (error) {
      set({ error: String(error) });
    }
  },

  classifyMessage: async (messageId) => {
    try {
      const result = await classifyMessageMoods(messageId);
      set((state) => ({
        messages: state.messages.map((message) =>
          message.id === messageId
            ? { ...message, mood: result.mood, segments: result.segments }
            : message,
        ),
      }));
    } catch (error) {
      set({ error: String(error) });
    }
  },

  loadSettings: async () => {
    try {
      const result = await getSettings();
      const values: Settings = { ...emptySettings };
      for (const item of result.items) {
        if (item.key in values) {
          (values as Record<string, unknown>)[item.key] = JSON.parse(item.value_json);
        }
        if (item.key === "theme") {
          set({ theme: JSON.parse(item.value_json) as Theme });
        }
        if (item.key === "features") {
          set({ features: JSON.parse(item.value_json) as Features });
        }
      }
      set({ settings: values });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  saveSettings: async (settings) => {
    try {
      await saveSetting("llm_base_url", settings.llm_base_url);
      await saveSetting("llm_api_key", settings.llm_api_key);
      await saveSetting("llm_model", settings.llm_model);
      await saveSetting("tts_base_url", settings.tts_base_url);
      await saveSetting("tts_api_key", settings.tts_api_key);
      await saveSetting("tts_model", settings.tts_model);
      await saveSetting("tts_voice", settings.tts_voice);
      await saveSetting("stt_base_url", settings.stt_base_url);
      await saveSetting("stt_api_key", settings.stt_api_key);
      await saveSetting("stt_model", settings.stt_model);
      await saveSetting("image_model", settings.image_model);
      await saveSetting("update_url", settings.update_url);
      await saveSetting("ui_scale", settings.ui_scale);
      await saveSetting("voice_retention_days", settings.voice_retention_days);
      set({ settings, settingsOpen: false });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  setCreateOpen: (open) => set({ createOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setPanel: (panel) => set({ panel }),
  setImmersive: (open) => set({ immersive: open }),
  saveTheme: async (theme) => {
    await saveSetting("theme", theme);
    set({ theme });
  },
  saveFeatures: async (features) => {
    await saveSetting("features", features);
    set({ features });
  },
  playVoice: async (assetIds) => {
    if (!assetIds.length) return;
    const token = ++voiceToken;
    voiceAudio?.pause();
    voiceResolve?.();
    set({ speaking: true });
    try {
      for (const assetId of assetIds) {
        if (token !== voiceToken) return;
        await new Promise<void>((resolve, reject) => {
          const audio = new Audio(assetUrl(assetId));
          voiceAudio = audio;
          voiceResolve = () => resolve();
          audio.onended = () => {
            voiceResolve = null;
            resolve();
          };
          audio.onerror = () => reject(new Error("语音播放失败"));
          void audio.play().catch(reject);
        });
      }
    } catch {
      // ignore playback errors
    } finally {
      if (token === voiceToken) {
        voiceAudio = null;
        voiceResolve = null;
        set({ speaking: false });
      }
    }
  },
  stopVoice: () => {
    voiceToken += 1;
    voiceAudio?.pause();
    voiceResolve?.();
    voiceAudio = null;
    voiceResolve = null;
    set({ speaking: false });
  },
  setCallActive: (active) => set({ callActive: active }),

  refreshMessages: async () => {
    const friendId = get().selectedId;
    if (!friendId || get().sending) return;
    try {
      const result = await listMessages(friendId);
      await markFriendRead(friendId);
      set((state) => ({
        messages: result.items,
        friends: state.friends.map((friend) =>
          friend.id === friendId ? { ...friend, unread_count: 0 } : friend,
        ),
      }));
    } catch {
      // keep current view
    }
  },

  refreshUnread: async () => {
    try {
      const result = await listFriends();
      set({ friends: result.items });
    } catch {
      // keep current view
    }
  },
}));

function listenReply(replyMessage: Message) {
  const source = new EventSource(streamUrl(replyMessage.id));
  let closed = false;

  source.addEventListener("delta", (event) => {
    const data = JSON.parse((event as MessageEvent).data) as { text: string };
    useApp.setState((state) => ({
      messages: state.messages.map((message) =>
        message.id === replyMessage.id
          ? { ...message, content: message.content + data.text }
          : message,
      ),
    }));
  });

  source.addEventListener("end", (event) => {
    const data = JSON.parse((event as MessageEvent).data) as { message: Message };
    useApp.setState((state) => ({
      messages: state.messages.map((message) =>
        message.id === replyMessage.id ? data.message : message,
      ),
      sending: false,
    }));
    closed = true;
    source.close();
    const state = useApp.getState();
    if (state.selectedId === data.message.friend_id) {
      void markFriendRead(data.message.friend_id).then(() => {
        useApp.setState((current) => ({
          friends: current.friends.map((item) =>
            item.id === data.message.friend_id ? { ...item, unread_count: 0 } : item,
          ),
        }));
      });
    }
    const friend = state.friends.find((item) => item.id === data.message.friend_id);
    if (
      data.message.status === "completed" &&
      !state.immersive &&
      !state.callActive &&
      friend?.voice_reply_enabled === 1 &&
      friend.voice_id
    ) {
      void (async () => {
        if (
          (await window.yumeFriend?.isPetOpen?.()) &&
          !(await window.yumeFriend?.isMainFocused?.())
        ) {
          return;
        }
        const result = await synthesizeVoice(data.message.id);
        useApp.setState((current) => ({
          messages: current.messages.map((message) =>
            message.id === result.message.id ? result.message : message,
          ),
        }));
        await state.playVoice(result.message.voice_asset_ids ?? []);
      })().catch(() => undefined);
    }
  });

  source.addEventListener("error", (event) => {
    const raw = (event as MessageEvent).data;
    if (!raw) return;
    const data = JSON.parse(raw) as { message: string };
    useApp.setState((state) => ({
      messages: state.messages.map((message) =>
        message.id === replyMessage.id
          ? { ...message, status: "error", error_text: data.message }
          : message,
      ),
      error: data.message,
      sending: false,
    }));
    closed = true;
    source.close();
  });

  source.onerror = () => {
    if (!closed) {
      source.close();
      useApp.setState({ sending: false });
    }
  };
}
