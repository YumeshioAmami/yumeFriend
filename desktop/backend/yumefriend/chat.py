from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from openai import AsyncOpenAI

from yumefriend.context import PromptContext, style_text
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


def build_prompt(
    friend: dict[str, Any],
    history: list[dict[str, Any]],
    context: PromptContext,
) -> list[dict[str, str]]:
    now = datetime.now().astimezone()

    def section(title: str, body: str) -> str:
        return f"# {title}\n{body}" if body else ""

    blocks = [
        f"你是「{friend['name']}」。",
        section("你是谁", friend.get("personality", "")),
        section("你的说话习惯", friend.get("custom_instructions", "")),
        (
            "# 你说话的规矩\n"
            "· 像真人一样说话，用自然口气。\n"
            "· 回复通常 2～4 句；对方要短就短。\n"
            "· 先接住对方的话，再说自己的想法。\n"
            "· 只输出说出口的话。"
        ),
        section("你记得的事", context.memories),
        section("你记着的日程", context.schedules),
        section("你还惦记着的一件事", context.thought),
        section("你学到的说话方式", style_text(context.style)),
        section("你的表达样本", context.expression),
        section("你现在的状态", context.state),
        f"# 现在\n当前时间：{now.strftime('%Y-%m-%d %H:%M')}（周{'一二三四五六日'[now.weekday()]}）",
    ]
    system = "\n\n".join(block for block in blocks if block)
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
    context: PromptContext,
    config: ModelConfig,
) -> None:
    streams.push(message_id, {"type": "start", "data": {"message_id": message_id}})
    client = AsyncOpenAI(base_url=config.base_url or None, api_key=config.api_key)
    content = ""
    try:
        stream = await client.chat.completions.create(
            model=config.model,
            messages=build_prompt(friend, history, context),
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
        await extract_memories(
            core,
            client,
            config,
            friend["id"],
            history,
            content,
        )
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


async def extract_memories(
    core: CoreClient,
    client: AsyncOpenAI,
    config: ModelConfig,
    friend_id: str,
    history: list[dict[str, Any]],
    assistant_content: str,
) -> None:
    try:
        existing = await core.read(
            "memory",
            "memories",
            filter={"friend_id": friend_id},
            limit=500,
        )
        known = {item.get("content", "") for item in existing.get("items", [])}
        dialogue = "\n".join(
            f"{item.get('role')}: {item.get('content', '')}"
            for item in history[-20:]
            if item.get("role") in {"user", "assistant"} and item.get("content")
        )
        dialogue += f"\nassistant: {assistant_content}"
        response = await client.chat.completions.create(
            model=config.model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "从对话里提取值得长期记住的事实、偏好或约定。"
                        "只返回 JSON 数组，每项格式 "
                        '{"content":"...","kind":"fact|preference|promise|experience|insight"}。'
                        "没有可记的就返回 []。不要编造。"
                    ),
                },
                {"role": "user", "content": dialogue},
            ],
            temperature=0.2,
        )
        text = (response.choices[0].message.content or "").strip()
        start = text.find("[")
        end = text.rfind("]")
        if start < 0 or end < start:
            return
        items = json.loads(text[start : end + 1])
        for item in items[:3]:
            content = str(item.get("content", "")).strip()
            if not content or content in known:
                continue
            kind = item.get("kind") if item.get("kind") in {
                "fact",
                "preference",
                "promise",
                "experience",
                "insight",
            } else "note"
            memory = await core.write(
                "memory",
                "memories",
                "create",
                {
                    "friend_id": friend_id,
                    "kind": kind,
                    "layer": "long_term",
                    "content": content,
                    "importance": 0.6,
                    "confidence": 0.6,
                    "source_message_ids_json": "[]",
                },
            )
            await core.write(
                "memory",
                "memory_events",
                "create",
                {
                    "friend_id": friend_id,
                    "memory_id": memory["record"]["id"],
                    "actor": "agent",
                    "action": "create",
                    "after_json": json.dumps(memory["record"], ensure_ascii=False),
                },
            )
            known.add(content)
    except Exception:  # noqa: BLE001
        return
