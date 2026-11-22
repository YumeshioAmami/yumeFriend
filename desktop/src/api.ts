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

type ListResult<T> = { items: T[]; next_cursor: string | null };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    throw new Error(await response.text());
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
