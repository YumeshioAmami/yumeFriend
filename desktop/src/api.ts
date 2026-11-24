export const API_BASE =
  import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:47891/api/v1";

export type Friend = {
  id: string;
  name: string;
  personality: string;
  custom_instructions: string;
  avatar_asset_id?: string | null;
  presence?: number;
  voice_id?: string | null;
  voice_reply_enabled?: number;
  unread_count?: number;
  created_at: string;
  visual_mode?: string;
  visual_pack_id?: string | null;
  portrait_transform_json?: string | null;
  life_enabled?: number;
};

export type Message = {
  id: string;
  friend_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  status: "streaming" | "completed" | "error" | "partial";
  error_text?: string | null;
  created_at: string;
  image_asset_ids?: string[];
  voice_asset_ids?: string[];
  mood?: string | null;
  segments?: MoodUnit[];
  sources?: SearchHit[];
  tool_calls?: Array<Record<string, unknown>>;
};

export type MoodUnit = {
  bubble: number;
  text: string;
  mood?: string | null;
};

export type Memory = {
  id: string;
  friend_id: string;
  kind: string;
  layer: string;
  content: string;
  importance: number;
  updated_at: string;
};

export type Schedule = {
  id: string;
  friend_id: string;
  title: string;
  nature: string;
  date_local: string;
  time_local: string | null;
  advance_minutes: number;
  state: string;
  created_at: string;
};

export type Thought = {
  id: string;
  friend_id: string;
  content: string;
  kind: string;
  state: string;
  created_at: string;
};

export type ExpressionSample = {
  id: string;
  friend_id: string;
  kind: string;
  text: string;
  situation: string;
};

export type StyleProfile = {
  friend_id: string;
  profile_json: string;
  version: number;
};

export type Document = {
  id: string;
  friend_id: string;
  name: string;
  kind: string;
  chars: number;
  status: string;
};

export type SearchHit = {
  title?: string;
  url?: string;
  snippet?: string;
  text?: string;
  document_id?: string;
  seq?: number;
};

export type FileItem = {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
};

export type VisualPack = {
  id: string;
  kind: string;
  name: string;
  manifest_json: string;
  preview_asset_id?: string | null;
};

export type Voice = {
  id: string;
  name: string;
  provider: string;
  config_json: string;
  speed: number;
};

export type LifeState = {
  friend_life: {
    last_observation: string;
    paused_by_chat: number;
    paused_until?: string | null;
  };
  projects: Array<{ id: string; topic: string; status: string; step_count: number }>;
  activities: Array<{ id: string; title: string; summary: string; started_at: string }>;
};

type ListResult<T> = { items: T[]; next_cursor: string | null };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export function listFriends(): Promise<ListResult<Friend>> {
  return request("/friends");
}

export function createFriend(input: {
  name: string;
  personality: string;
}): Promise<Friend> {
  return request("/friends", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listMessages(
  friendId: string,
  cursor?: string | null,
): Promise<ListResult<Message>> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return request(`/friends/${friendId}/messages${query}`);
}

export function sendMessage(
  friendId: string,
  content: string,
  assetIds: string[] = [],
): Promise<{ user_message: Message; reply_message: Message }> {
  return request(`/friends/${friendId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content, asset_ids: assetIds, reply: true }),
  });
}

export function streamUrl(messageId: string): string {
  return `${API_BASE}/messages/${messageId}/stream`;
}

export function classifyMessageMoods(
  messageId: string,
): Promise<{ mood: string | null; segments: MoodUnit[] }> {
  return request(`/messages/${messageId}/moods`, { method: "POST" });
}

export function stopMessage(messageId: string): Promise<{ ok: boolean }> {
  return request(`/messages/${messageId}/stop`, { method: "POST" });
}

export function retryMessage(messageId: string): Promise<{ reply_message: Message }> {
  return request(`/messages/${messageId}/retry`, { method: "POST" });
}

export function getSettings(): Promise<ListResult<{ key: string; value_json: string }>> {
  return request("/settings");
}

export async function saveSetting(key: string, value: unknown): Promise<void> {
  await request("/settings", {
    method: "PUT",
    body: JSON.stringify({
      scope: "product",
      owner_id: "yumeFriend",
      key,
      value_json: JSON.stringify(value),
    }),
  });
}

export function testModel(data: {
  base_url: string;
  api_key: string;
  model: string;
}): Promise<{ reply: string }> {
  return request("/settings/test", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function listMemories(friendId: string): Promise<ListResult<Memory>> {
  return request(`/friends/${friendId}/memories`);
}

export function createMemory(friendId: string, data: Record<string, unknown>): Promise<Memory> {
  return request(`/friends/${friendId}/memories`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateMemory(memoryId: string, data: Record<string, unknown>): Promise<Memory> {
  return request(`/memories/${memoryId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteMemory(memoryId: string): Promise<void> {
  return request(`/memories/${memoryId}`, { method: "DELETE" });
}

export function recallMemories(
  friendId: string,
  query: string,
): Promise<ListResult<Memory>> {
  return request(`/friends/${friendId}/memories/recall`, {
    method: "POST",
    body: JSON.stringify({ query, limit: 10 }),
  });
}

export function listSchedules(friendId: string): Promise<ListResult<Schedule>> {
  return request(`/friends/${friendId}/schedules`);
}

export function createSchedule(friendId: string, data: Record<string, unknown>): Promise<Schedule> {
  return request(`/friends/${friendId}/schedules`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateSchedule(
  scheduleId: string,
  data: Record<string, unknown>,
): Promise<Schedule> {
  return request(`/schedules/${scheduleId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteSchedule(scheduleId: string): Promise<void> {
  return request(`/schedules/${scheduleId}`, { method: "DELETE" });
}

export function settleSchedule(scheduleId: string, reason: string): Promise<Schedule> {
  return request(`/schedules/${scheduleId}/settle`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function listThoughts(friendId: string): Promise<ListResult<Thought>> {
  return request(`/friends/${friendId}/thoughts`);
}

export function createThought(friendId: string, data: Record<string, unknown>): Promise<Thought> {
  return request(`/friends/${friendId}/thoughts`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateThought(
  thoughtId: string,
  data: Record<string, unknown>,
): Promise<Thought> {
  return request(`/thoughts/${thoughtId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteThought(thoughtId: string): Promise<void> {
  return request(`/thoughts/${thoughtId}`, { method: "DELETE" });
}

export function doneThought(thoughtId: string): Promise<Thought> {
  return request(`/thoughts/${thoughtId}/done`, { method: "POST" });
}

export function listSamples(friendId: string): Promise<ListResult<ExpressionSample>> {
  return request(`/friends/${friendId}/expression-samples`);
}

export function createSample(
  friendId: string,
  data: Record<string, unknown>,
): Promise<ExpressionSample> {
  return request(`/friends/${friendId}/expression-samples`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function deleteSample(sampleId: string): Promise<void> {
  return request(`/expression-samples/${sampleId}`, { method: "DELETE" });
}

export function getStyle(friendId: string): Promise<StyleProfile> {
  return request(`/friends/${friendId}/style`);
}

export function saveStyle(friendId: string, profileJson: string): Promise<StyleProfile> {
  return request(`/friends/${friendId}/style`, {
    method: "PUT",
    body: JSON.stringify({ profile_json: profileJson }),
  });
}

export function rollbackStyle(friendId: string): Promise<StyleProfile> {
  return request(`/friends/${friendId}/style/rollback`, { method: "POST" });
}

export function listDocuments(friendId: string): Promise<ListResult<Document>> {
  return request(`/friends/${friendId}/documents`);
}

export async function uploadDocument(friendId: string, file: File): Promise<Document> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`${API_BASE}/friends/${friendId}/documents`, {
    method: "POST",
    body: form,
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<Document>;
}

export function deleteDocument(documentId: string): Promise<void> {
  return request(`/documents/${documentId}`, { method: "DELETE" });
}

export function searchDocuments(
  friendId: string,
  query: string,
): Promise<{ items: SearchHit[] }> {
  return request(`/friends/${friendId}/documents/search`, {
    method: "POST",
    body: JSON.stringify({ query, limit: 10 }),
  });
}

export function searchWeb(friendId: string, query: string): Promise<{ items: SearchHit[] }> {
  return request(`/friends/${friendId}/search`, {
    method: "POST",
    body: JSON.stringify({ query, limit: 5 }),
  });
}

export function captureScreen(
  friendId: string,
): Promise<{ asset_id: string; description: string }> {
  return request(`/friends/${friendId}/screen`, { method: "POST" });
}

export function assetUrl(assetId: string): string {
  return `${API_BASE}/assets/${assetId}/content`;
}

export function listFiles(path = ""): Promise<{ items: FileItem[] }> {
  return request(`/files?path=${encodeURIComponent(path)}`);
}

export function readFile(path: string): Promise<{ path: string; content: string }> {
  return request(`/files/content?path=${encodeURIComponent(path)}`);
}

export function writeFile(path: string, content: string): Promise<void> {
  return request("/files/content", {
    method: "PUT",
    body: JSON.stringify({ path, content }),
  });
}

export function moveFile(src: string, dst: string): Promise<void> {
  return request("/files/move", {
    method: "POST",
    body: JSON.stringify({ src, dst }),
  });
}

export function deleteFile(path: string): Promise<void> {
  return request(`/files?path=${encodeURIComponent(path)}`, { method: "DELETE" });
}

export async function uploadAsset(file: File | Blob): Promise<{ id: string }> {
  const form = new FormData();
  form.append("file", file, file instanceof File ? file.name : "audio.webm");
  const response = await fetch(`${API_BASE}/assets`, { method: "POST", body: form });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<{ id: string }>;
}

export async function transcribeAudio(blob: Blob): Promise<{ text: string }> {
  const form = new FormData();
  form.append("file", blob, "voice.webm");
  const response = await fetch(`${API_BASE}/speech/transcribe`, {
    method: "POST",
    body: form,
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<{ text: string }>;
}

export function synthesizeVoice(messageId: string): Promise<{ message: Message }> {
  return request(`/messages/${messageId}/voice`, { method: "POST" });
}

export function drawImage(friendId: string, prompt: string): Promise<Message> {
  return request(`/friends/${friendId}/draw`, {
    method: "POST",
    body: JSON.stringify({ prompt }),
  });
}

export function patchFriend(
  friendId: string,
  data: Record<string, unknown>,
): Promise<Friend> {
  return request(`/friends/${friendId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteFriend(friendId: string): Promise<void> {
  return request(`/friends/${friendId}`, { method: "DELETE" });
}

export function markFriendRead(friendId: string): Promise<{ updated: number }> {
  return request(`/friends/${friendId}/read`, { method: "POST" });
}

export function listVoices(): Promise<ListResult<Voice>> {
  return request("/voices");
}

export function createVoice(data: Record<string, unknown>): Promise<Voice> {
  return request("/voices", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateVoice(voiceId: string, data: Record<string, unknown>): Promise<Voice> {
  return request(`/voices/${voiceId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteVoice(voiceId: string): Promise<void> {
  return request(`/voices/${voiceId}`, { method: "DELETE" });
}

export function testVoice(voiceId: string, text: string): Promise<{ asset_id: string }> {
  return request(`/voices/${voiceId}/test`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export function listVisualPacks(): Promise<ListResult<VisualPack>> {
  return request("/visual-packs");
}

export function createVisualPack(data: Record<string, unknown>): Promise<VisualPack> {
  return request("/visual-packs", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function deleteVisualPack(packId: string): Promise<void> {
  return request(`/visual-packs/${packId}`, { method: "DELETE" });
}

export function getLife(friendId: string): Promise<LifeState> {
  return request(`/friends/${friendId}/life`);
}

export function pauseLife(friendId: string): Promise<void> {
  return request(`/friends/${friendId}/life/pause`, { method: "POST" });
}

export function resumeLife(friendId: string): Promise<void> {
  return request(`/friends/${friendId}/life/resume`, { method: "POST" });
}

export function getLogs(): Promise<{ items: string[] }> {
  return request("/logs");
}

export function clearLogs(): Promise<void> {
  return request("/logs", { method: "DELETE" });
}

export type Live2DRuntimeStatus = {
  available: boolean;
  size: number | null;
  license_urls: {
    proprietary: string;
    open: string;
  };
};

export type Live2DSettings = {
  default_label: string;
  base: Record<string, number>;
  labels: Array<{
    id: string;
    name: string;
    params: Record<string, number>;
    expressions: string[];
    transition_ms?: number | null;
  }>;
};

export type Live2DModel = {
  id: string;
  name: string;
  model_url: string;
  used_by: string[];
  source: string;
  has_settings: boolean;
  is_default: boolean;
};

export type Live2DParameter = {
  id: string;
  name: string;
  group_id: string;
  min: number;
  max: number;
  default: number;
};

export type Live2DSettingsResponse = {
  model: { id: string; model_url: string };
  settings: Live2DSettings;
  expressions: Live2DExpression[];
  parameters: Live2DParameter[];
};

export type Live2DExpression = {
  name: string;
  file: string;
  params: Array<{ id: string; value: number; blend: string }>;
};

export function listLive2DModels(): Promise<{ items: Live2DModel[] }> {
  return request("/live2d/models");
}

export function getLive2DSettings(
  modelId: string,
): Promise<Live2DSettingsResponse> {
  return request(`/live2d/models/${modelId}/settings`);
}

export function saveLive2DSettings(
  modelId: string,
  settings: Live2DSettings,
): Promise<{ settings: Live2DSettings }> {
  return request(`/live2d/models/${modelId}/settings`, {
    method: "PUT",
    body: JSON.stringify({ settings }),
  });
}

export function getLive2DRuntimeStatus(): Promise<Live2DRuntimeStatus> {
  return request("/live2d/runtime/status");
}

export async function downloadLive2DRuntime(
  onProgress: (received: number, total: number) => void,
): Promise<void> {
  const response = await fetch(`${API_BASE}/live2d/runtime/download`, { method: "POST" });
  if (!response.ok || !response.body) throw new Error(await response.text());
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as {
        type: "progress" | "done" | "error";
        received?: number;
        total?: number;
        message?: string;
      };
      if (event.type === "progress") {
        onProgress(event.received ?? 0, event.total ?? 0);
      } else if (event.type === "error") {
        throw new Error(event.message ?? "下载失败");
      }
    }
  }
}
