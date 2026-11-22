import { create } from "zustand";
import {
  createFriend,
  getSettings,
  listFriends,
  listMessages,
  saveSetting,
  sendMessage,
  streamUrl,
  type Friend,
  type Message,
} from "./api";

export type Settings = {
  llm_base_url: string;
  llm_api_key: string;
  llm_model: string;
  tts_model: string;
  tts_voice: string;
  stt_model: string;
  image_model: string;
};

export type Panel =
  | "memory"
  | "schedule"
  | "thought"
  | "style"
  | "knowledge"
  | "search"
  | "screen"
  | "file"
  | null;

type AppState = {
  friends: Friend[];
  selectedId: string | null;
  messages: Message[];
  settings: Settings;
  loading: boolean;
  sending: boolean;
  error: string | null;
  createOpen: boolean;
  settingsOpen: boolean;
  panel: Panel;
  loadFriends: () => Promise<void>;
  selectFriend: (friendId: string) => Promise<void>;
  createFriend: (name: string, personality: string) => Promise<void>;
  sendMessage: (content: string, assetIds?: string[]) => Promise<void>;
  loadSettings: () => Promise<void>;
  saveSettings: (settings: Settings) => Promise<void>;
  setCreateOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setPanel: (panel: Panel) => void;
  refreshMessages: () => Promise<void>;
};

const emptySettings: Settings = {
  llm_base_url: "",
  llm_api_key: "",
  llm_model: "",
  tts_model: "",
  tts_voice: "",
  stt_model: "",
  image_model: "",
};

export const useApp = create<AppState>((set, get) => ({
  friends: [],
  selectedId: null,
  messages: [],
  settings: emptySettings,
  loading: false,
  sending: false,
  error: null,
  createOpen: false,
  settingsOpen: false,
  panel: null,

  loadFriends: async () => {
    set({ loading: true, error: null });
    try {
      const result = await listFriends();
      const selectedId = get().selectedId ?? result.items[0]?.id ?? null;
      set({ friends: result.items, selectedId });
      if (selectedId) {
        const messages = await listMessages(selectedId);
        set({ messages: messages.items });
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
      set({ messages: result.items });
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

  sendMessage: async (content, assetIds = []) => {
    const friendId = get().selectedId;
    if (!friendId || !content.trim() || get().sending) return;
    set({ sending: true, error: null });
    try {
      const result = await sendMessage(friendId, content, assetIds);
      set((state) => ({
        messages: [...state.messages, result.user_message, result.reply_message],
      }));
      const source = new EventSource(streamUrl(result.reply_message.id));
      let closed = false;

      source.addEventListener("delta", (event) => {
        const data = JSON.parse((event as MessageEvent).data) as { text: string };
        set((state) => ({
          messages: state.messages.map((message) =>
            message.id === result.reply_message.id
              ? { ...message, content: message.content + data.text }
              : message,
          ),
        }));
      });

      source.addEventListener("end", (event) => {
        const data = JSON.parse((event as MessageEvent).data) as { message: Message };
        set((state) => ({
          messages: state.messages.map((message) =>
            message.id === result.reply_message.id ? data.message : message,
          ),
        }));
        closed = true;
        source.close();
        set({ sending: false });
      });

      source.addEventListener("error", (event) => {
        const raw = (event as MessageEvent).data;
        if (!raw) return;
        const data = JSON.parse(raw) as { message: string };
        set((state) => ({
          messages: state.messages.map((message) =>
            message.id === result.reply_message.id
              ? { ...message, status: "error", error_text: data.message }
              : message,
          ),
          error: data.message,
        }));
        closed = true;
        source.close();
        set({ sending: false });
      });

      source.onerror = () => {
        if (!closed) {
          source.close();
          set({ sending: false });
        }
      };
    } catch (error) {
      set({ error: String(error), sending: false });
    }
  },

  loadSettings: async () => {
    try {
      const result = await getSettings();
      const values: Settings = { ...emptySettings };
      for (const item of result.items) {
        if (item.key in values) {
          values[item.key as keyof Settings] = JSON.parse(item.value_json);
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
      await saveSetting("tts_model", settings.tts_model);
      await saveSetting("tts_voice", settings.tts_voice);
      await saveSetting("stt_model", settings.stt_model);
      await saveSetting("image_model", settings.image_model);
      set({ settings, settingsOpen: false });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  setCreateOpen: (open) => set({ createOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setPanel: (panel) => set({ panel }),

  refreshMessages: async () => {
    const friendId = get().selectedId;
    if (!friendId || get().sending) return;
    try {
      const result = await listMessages(friendId);
      set({ messages: result.items });
    } catch {
      // keep current view
    }
  },
}));
