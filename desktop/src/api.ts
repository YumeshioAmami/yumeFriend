export const API_BASE =
  import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:47891/api/v1";

export type Friend = {
  id: string;
  name: string;
  personality: string;
  custom_instructions: string;
  created_at: string;
};

export type Message = {
  id: string;
  friend_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  status: "streaming" | "completed" | "error" | "partial";
  error_text?: string | null;
  created_at: string;
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

export function listMessages(friendId: string): Promise<ListResult<Message>> {
  return request(`/friends/${friendId}/messages`);
}

export function sendMessage(
  friendId: string,
  content: string,
): Promise<{ user_message: Message; reply_message: Message }> {
  return request(`/friends/${friendId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content, asset_ids: [], reply: true }),
  });
}

export function streamUrl(messageId: string): string {
  return `${API_BASE}/messages/${messageId}/stream`;
}

export function getSettings(): Promise<ListResult<{ key: string; value_json: string }>> {
  return request("/settings");
}

export async function saveSetting(key: string, value: string): Promise<void> {
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
