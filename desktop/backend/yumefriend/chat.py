from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from typing import Any

from openai import AsyncOpenAI

from yumefriend.core import CoreClient


@dataclass
class ModelConfig:
    base_url: str
    api_key: str
    model: str


class StreamRegistry:
    def __init__(self) -> None:
        self.queues: dict[str, asyncio.Queue[dict[str, Any] | None]] = {}

    def create(self, message_id: str) -> asyncio.Queue[dict[str, Any] | None]:
        queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()
        self.queues[message_id] = queue
        return queue

    def push(self, message_id: str, event: dict[str, Any]) -> None:
        queue = self.queues.get(message_id)
        if queue is not None:
            queue.put_nowait(event)

    def finish(self, message_id: str) -> None:
        queue = self.queues.get(message_id)
        if queue is not None:
            queue.put_nowait(None)

    def queue(self, message_id: str) -> asyncio.Queue[dict[str, Any] | None] | None:
        return self.queues.get(message_id)

    def remove(self, message_id: str) -> None:
        self.queues.pop(message_id, None)


async def load_model_config(core: CoreClient) -> ModelConfig | None:
    result = await core.read("settings", "settings", limit=200)
    values: dict[str, str] = {}
    for item in result.get("items", []):
        key = item.get("key")
        raw = item.get("value_json")
        if isinstance(key, str) and isinstance(raw, str):
            try:
                values[key] = json.loads(raw)
            except json.JSONDecodeError:
                values[key] = raw
    base_url = values.get("llm_base_url", "")
    api_key = values.get("llm_api_key", "")
    model = values.get("llm_model", "")
    if not api_key or not model:
        return None
    return ModelConfig(base_url=base_url, api_key=api_key, model=model)


def build_prompt(friend: dict[str, Any], history: list[dict[str, Any]]) -> list[dict[str, str]]:
    system = (
        f"你是「{friend['name']}」。\n\n"
        f"# 你是谁\n{friend.get('personality', '')}\n\n"
        f"# 你的说话习惯\n{friend.get('custom_instructions', '')}\n\n"
        "# 你说话的规矩\n"
        "· 像真人一样说话，用自然口气。\n"
        "· 回复通常 2～4 句；对方要短就短。\n"
        "· 先接住对方的话，再说自己的想法。\n"
        "· 只输出说出口的话。"
    )
    messages = [{"role": "system", "content": system}]
    for message in history[-40:]:
        role = message.get("role")
        content = message.get("content", "")
        if role in {"user", "assistant"} and content:
            messages.append({"role": role, "content": content})
    return messages


async def generate_reply(
    core: CoreClient,
    streams: StreamRegistry,
    message_id: str,
    friend: dict[str, Any],
    history: list[dict[str, Any]],
    config: ModelConfig,
) -> None:
    streams.push(message_id, {"type": "start", "data": {"message_id": message_id}})
    client = AsyncOpenAI(base_url=config.base_url or None, api_key=config.api_key)
    content = ""
    try:
        stream = await client.chat.completions.create(
            model=config.model,
            messages=build_prompt(friend, history),
            temperature=0.7,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content or ""
            if not delta:
                continue
            content += delta
            streams.push(message_id, {"type": "delta", "data": {"text": delta}})

        final = await core.write(
            "chat",
            "messages",
            "update",
            {"id": message_id, "content": content, "status": "completed"},
        )
        streams.push(message_id, {"type": "end", "data": {"message": final.get("record")}})
    except Exception as error:  # noqa: BLE001
        await core.write(
            "chat",
            "messages",
            "update",
            {"id": message_id, "status": "error", "error_text": str(error)},
        )
        streams.push(
            message_id,
            {"type": "error", "data": {"code": "model_error", "message": str(error)}},
        )
    finally:
        streams.finish(message_id)
        await client.close()
