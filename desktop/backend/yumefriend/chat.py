from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from openai import AsyncOpenAI

from yumefriend.assets import asset_data_url
from yumefriend.context import PromptContext, style_text
from yumefriend.core import CoreClient
from yumefriend.media import attach_asset, message_with_assets
from yumefriend.tools import execute_tool, native_tool_specs
from yumefriend.visual import labels_for_pack

BUBBLE_SEPARATOR = "<<<MSG>>>"
TOOL_OPEN = "<tool>"
TOOL_CLOSE = "</tool>"
MODULE_DIR = Path(__file__).resolve().parents[2] / "modules"


@dataclass
class ModelConfig:
    base_url: str
    api_key: str
    model: str


class BubbleSeparatorParser:
    def __init__(self) -> None:
        self.buffer = ""

    def feed(self, text: str) -> str:
        self.buffer += text
        visible: list[str] = []
        while True:
            index = self.buffer.find(BUBBLE_SEPARATOR)
            if index >= 0:
                visible.append(self.buffer[:index])
                visible.append("\n\n")
                self.buffer = self.buffer[index + len(BUBBLE_SEPARATOR) :]
                continue
            keep = 0
            for size in range(min(len(self.buffer), len(BUBBLE_SEPARATOR) - 1), 0, -1):
                if self.buffer.endswith(BUBBLE_SEPARATOR[:size]):
                    keep = size
                    break
            if keep:
                visible.append(self.buffer[:-keep])
                self.buffer = self.buffer[-keep:]
            else:
                visible.append(self.buffer)
                self.buffer = ""
            break
        return "".join(visible)

    def flush(self) -> str:
        text = self.buffer
        self.buffer = ""
        return text


class ToolTagParser:
    def __init__(self) -> None:
        self.buffer = ""
        self.in_tool = False
        self.calls: list[dict[str, Any]] = []

    def feed(self, text: str) -> str:
        self.buffer += text
        visible: list[str] = []
        while True:
            if self.in_tool:
                end = self.buffer.find(TOOL_CLOSE)
                if end < 0:
                    break
                raw = self.buffer[:end]
                self.buffer = self.buffer[end + len(TOOL_CLOSE) :]
                self.in_tool = False
                try:
                    parsed = json.loads(raw)
                    if isinstance(parsed, dict) and parsed.get("name"):
                        self.calls.append(
                            {
                                "name": str(parsed["name"]),
                                "arguments": parsed.get("arguments") or {},
                            }
                        )
                except json.JSONDecodeError:
                    pass
                continue
            start = self.buffer.find(TOOL_OPEN)
            if start >= 0:
                visible.append(self.buffer[:start])
                self.buffer = self.buffer[start + len(TOOL_OPEN) :]
                self.in_tool = True
                continue
            keep = 0
            for size in range(min(len(self.buffer), len(TOOL_OPEN) - 1), 0, -1):
                if self.buffer.endswith(TOOL_OPEN[:size]):
                    keep = size
                    break
            if keep:
                visible.append(self.buffer[:-keep])
                self.buffer = self.buffer[-keep:]
            else:
                visible.append(self.buffer)
                self.buffer = ""
            break
        return "".join(visible)

    def flush(self) -> str:
        if self.in_tool:
            self.buffer = ""
            self.in_tool = False
            return ""
        text = self.buffer
        self.buffer = ""
        return text


def visible_content(raw: str) -> str:
    return raw.replace(BUBBLE_SEPARATOR, "\n\n").strip()


def parse_units(raw: str) -> list[dict[str, Any]]:
    units: list[dict[str, Any]] = []
    for bubble_index, bubble in enumerate(raw.split(BUBBLE_SEPARATOR)):
        for line in bubble.splitlines():
            text = line.strip()
            if text:
                units.append({"bubble": bubble_index, "text": text, "mood": None})
    return units


def message_units(message: dict[str, Any]) -> list[dict[str, Any]]:
    try:
        stored = json.loads(message.get("segments_json") or "[]")
    except json.JSONDecodeError:
        stored = []
    if isinstance(stored, list) and stored:
        return [
            {
                "bubble": int(item.get("bubble", 0)),
                "text": str(item.get("text", "")),
                "mood": item.get("mood"),
            }
            for item in stored
            if item.get("text")
        ]
    return parse_units(str(message.get("content") or ""))


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


async def load_tool_specs(core: CoreClient) -> list[dict[str, Any]]:
    result = await core.read("settings", "settings", limit=200)
    features: dict[str, Any] = {}
    for item in result.get("items", []):
        if item.get("key") == "features" and isinstance(item.get("value_json"), str):
            try:
                parsed = json.loads(item["value_json"])
                if isinstance(parsed, dict):
                    features = parsed
            except json.JSONDecodeError:
                pass

    def module_enabled(module_id: str) -> bool:
        if features.get(module_id) is False:
            return False
        path = MODULE_DIR / f"{module_id}.json"
        if not path.is_file():
            return False
        try:
            manifest = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return False
        return bool(manifest.get("capabilities"))

    module_ids = (
        "search",
        "screen",
        "document",
        "file",
        "memory",
        "schedule",
        "thought",
        "image",
    )
    return native_tool_specs({module_id for module_id in module_ids if module_enabled(module_id)})


async def describe_image(
    client: AsyncOpenAI,
    config: ModelConfig,
    asset_id: str,
) -> str:
    try:
        response = await client.chat.completions.create(
            model=config.model,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": "用两三句话客观描述这张屏幕截图的主要内容，不要编造。",
                        },
                        {
                            "type": "image_url",
                            "image_url": {"url": asset_data_url(asset_id)},
                        },
                    ],
                }
            ],
            temperature=0.2,
        )
        return (response.choices[0].message.content or "").strip()
    except Exception:  # noqa: BLE001
        return ""


def build_prompt(
    friend: dict[str, Any],
    history: list[dict[str, Any]],
    context: PromptContext,
    image_urls: list[str] | None = None,
    tool_specs: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
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
            "· 回复长度跟着话题走；可以短，也可以多个自然段展开；对方要短就短。\n"
            "· 用自然段落说话；对方要整理时再列点。\n"
            "· 需要分成多个气泡时，用 <<<MSG>>> 分隔。\n"
            "· 正文里不写情绪标签或内部标记。\n"
            "· 先接住对方的话，再说自己的想法。\n"
            "· 只输出说出口的话。"
        ),
        section("你记得的事", context.memories),
        section("你手头的资料", context.knowledge),
        section("你记着的日程", context.schedules),
        section("你还惦记着的一件事", context.thought),
        section("你学到的说话方式", style_text(context.style)),
        section("你的表达样本", context.expression),
        section("你最近在做的事", context.life),
        section("你现在的状态", context.state),
        f"# 现在\n当前时间：{now.strftime('%Y-%m-%d %H:%M')}（周{'一二三四五六日'[now.weekday()]}）",
    ]
    if tool_specs:
        tool_lines = "\n".join(
            f"- {spec['function']['name']}：{spec['function']['description']}"
            for spec in tool_specs
        )
        blocks.insert(
            -2,
            "# 后台能力\n"
            f"可用工具：\n{tool_lines}\n"
            "优先使用原生工具调用；不支持时只允许写："
            '<tool>{"name":"工具名","arguments":{...}}</tool>\n'
            "一次最多调用两个工具；拿到结果后直接用正文回答；正文只写对话。",
        )
    system = "\n\n".join(block for block in blocks if block)
    messages = [{"role": "system", "content": system}]
    for message in history[-40:]:
        role = message.get("role")
        content = message.get("content", "")
        if role in {"user", "assistant"} and content:
            messages.append({"role": role, "content": content})
    if image_urls:
        for index in range(len(messages) - 1, 0, -1):
            if messages[index]["role"] == "user":
                content = messages[index]["content"]
                messages[index] = {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": content},
                        *[
                            {"type": "image_url", "image_url": {"url": url}}
                            for url in image_urls
                        ],
                    ],
                }
                break
    return messages


async def generate_reply(
    core: CoreClient,
    streams: StreamRegistry,
    message_id: str,
    friend: dict[str, Any],
    history: list[dict[str, Any]],
    context: PromptContext,
    config: ModelConfig,
    image_urls: list[str] | None = None,
) -> None:
    streams.push(message_id, {"type": "start", "data": {"message_id": message_id}})
    client = AsyncOpenAI(base_url=config.base_url or None, api_key=config.api_key)
    raw_content = ""
    sources: list[dict[str, Any]] = []
    tool_calls: list[dict[str, Any]] = []
    attachment_index = 0
    cancelled = False
    try:
        tool_specs = await load_tool_specs(core)
        messages = build_prompt(friend, history, context, image_urls, tool_specs)
        for round_index in range(2):
            tool_parser = ToolTagParser()
            bubble_parser = BubbleSeparatorParser()
            round_text = ""
            native_calls: dict[int, dict[str, str]] = {}
            kwargs: dict[str, Any] = {
                "model": config.model,
                "messages": messages,
                "temperature": 0.7,
                "stream": True,
            }
            if tool_specs and round_index == 0:
                kwargs["tools"] = tool_specs
            try:
                try:
                    stream = await client.chat.completions.create(**kwargs)
                except Exception:
                    if "tools" not in kwargs:
                        raise
                    kwargs.pop("tools")
                    stream = await client.chat.completions.create(**kwargs)
                async for chunk in stream:
                    delta = chunk.choices[0].delta
                    content = delta.content or ""
                    if content:
                        visible = tool_parser.feed(content)
                        round_text += visible
                        out = bubble_parser.feed(visible)
                        if out:
                            streams.push(
                                message_id,
                                {"type": "delta", "data": {"text": out}},
                            )
                    for call in delta.tool_calls or []:
                        index = int(getattr(call, "index", 0) or 0)
                        slot = native_calls.setdefault(
                            index,
                            {"id": "", "name": "", "arguments": ""},
                        )
                        if getattr(call, "id", None):
                            slot["id"] = str(call.id)
                        function = getattr(call, "function", None)
                        if function is not None:
                            if getattr(function, "name", None):
                                slot["name"] = str(function.name)
                            if getattr(function, "arguments", None):
                                slot["arguments"] += str(function.arguments)
            except asyncio.CancelledError:
                cancelled = True

            tail = tool_parser.flush()
            round_text += tail
            out = bubble_parser.feed(tail)
            if out:
                streams.push(message_id, {"type": "delta", "data": {"text": out}})
            bubble_tail = bubble_parser.flush()
            if bubble_tail:
                streams.push(message_id, {"type": "delta", "data": {"text": bubble_tail}})
            raw_content += round_text
            if cancelled:
                break

            calls: list[dict[str, Any]] = []
            for slot in native_calls.values():
                if not slot["name"]:
                    continue
                try:
                    arguments = json.loads(slot["arguments"] or "{}")
                except json.JSONDecodeError:
                    arguments = {}
                calls.append(
                    {
                        "id": slot["id"] or f"tool_{len(tool_calls) + len(calls) + 1}",
                        "name": slot["name"],
                        "arguments": arguments,
                        "native": True,
                    }
                )
            if not calls:
                for call in tool_parser.calls:
                    calls.append(
                        {
                            "id": f"tool_{len(tool_calls) + len(calls) + 1}",
                            "name": call["name"],
                            "arguments": call["arguments"],
                            "native": False,
                        }
                    )
            if not calls:
                break

            results = []
            for call in calls:
                try:
                    result, found_sources = await execute_tool(
                        core,
                        call["name"],
                        call["arguments"],
                        friend["id"],
                    )
                except Exception as error:  # noqa: BLE001
                    result = {"error": str(error)}
                    found_sources = []
                sources.extend(found_sources)
                tool_calls.append(
                    {
                        "name": call["name"],
                        "arguments": call["arguments"],
                        "result": result,
                    }
                )
                if call["name"] in {"look_screen", "look_image"} and result.get("asset_id"):
                    result["description"] = await describe_image(
                        client,
                        config,
                        str(result["asset_id"]),
                    )
                if call["name"] in {"look_screen", "draw_image"} and result.get("asset_id"):
                    await attach_asset(
                        core,
                        message_id,
                        str(result["asset_id"]),
                        "image",
                        attachment_index,
                    )
                    attachment_index += 1
                results.append(
                    {
                        "id": call["id"],
                        "name": call["name"],
                        "result": result,
                    }
                )

            if any(call["native"] for call in calls):
                messages.append(
                    {
                        "role": "assistant",
                        "content": round_text or None,
                        "tool_calls": [
                            {
                                "id": call["id"],
                                "type": "function",
                                "function": {
                                    "name": call["name"],
                                    "arguments": json.dumps(
                                        call["arguments"],
                                        ensure_ascii=False,
                                    ),
                                },
                            }
                            for call in calls
                        ],
                    }
                )
                for item in results:
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": item["id"],
                            "content": json.dumps(item["result"], ensure_ascii=False),
                        }
                    )
            else:
                messages.append({"role": "assistant", "content": round_text or ""})
                messages.append(
                    {
                        "role": "system",
                        "content": "工具结果（后台）："
                        + json.dumps(results, ensure_ascii=False),
                    }
                )
            messages.append(
                {
                    "role": "system",
                    "content": "工具结果已返回。现在只写正文回答，不要再调用工具。",
                }
            )

        final = await core.write(
            "chat",
            "messages",
            "update",
            {
                "id": message_id,
                "content": visible_content(raw_content),
                "segments_json": json.dumps(parse_units(raw_content), ensure_ascii=False),
                "sources_json": json.dumps(sources, ensure_ascii=False),
                "tool_calls_json": json.dumps(tool_calls, ensure_ascii=False),
                "status": "partial" if cancelled else "completed",
            },
        )
        streams.push(
            message_id,
            {
                "type": "end",
                "data": {"message": await message_with_assets(core, final["record"])},
            },
        )
        if not cancelled:
            await extract_memories(
                core,
                client,
                config,
                friend["id"],
                history,
                visible_content(raw_content),
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


async def classify_message_moods(core: CoreClient, message_id: str) -> dict[str, Any]:
    result = await core.read("chat", "messages", filter={"id": message_id}, limit=1)
    if not result.get("items"):
        raise ValueError("message not found")
    message = result["items"][0]
    if message.get("role") != "assistant" or message.get("status") != "completed":
        raise ValueError("message is not a completed assistant reply")
    if message.get("mood"):
        return {"mood": message["mood"], "segments": message_units(message)}

    friend_id = str(message["friend_id"])
    friend_result = await core.read("friend", "friends", filter={"id": friend_id}, limit=1)
    if not friend_result.get("items"):
        raise ValueError("friend not found")
    friend = friend_result["items"][0]
    pack = None
    if friend.get("visual_pack_id"):
        pack_result = await core.read(
            "visual",
            "visual_packs",
            filter={"id": friend["visual_pack_id"]},
            limit=1,
        )
        pack = (pack_result.get("items") or [None])[0]

    labels, default_label = labels_for_pack(pack)
    units = message_units(message)
    if not units or not labels:
        return {"mood": None, "segments": units}

    fallback = default_label or labels[0]
    if len(labels) == 1:
        moods = [labels[0] for _ in units]
    else:
        history = await core.read(
            "chat",
            "messages",
            filter={"friend_id": friend_id},
            limit=500,
        )
        items = sorted(history.get("items", []), key=lambda item: item.get("created_at", ""))
        index = next(
            (position for position, item in enumerate(items) if item.get("id") == message_id),
            len(items),
        )
        user_text = next(
            (
                str(item.get("content", ""))
                for item in reversed(items[:index])
                if item.get("role") == "user"
            ),
            "",
        )
        numbered = "\n".join(
            f"{position}. {unit['text']}" for position, unit in enumerate(units, start=1)
        )
        config = await load_model_config(core)
        if config is None:
            moods = [fallback for _ in units]
        else:
            client = AsyncOpenAI(base_url=config.base_url or None, api_key=config.api_key)
            try:
                response = await client.chat.completions.create(
                    model=config.model,
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "你只做情绪分类。只输出 JSON 数组，不解释。"
                                "数组长度必须等于编号单元数，每项必须是可用标签之一。"
                                "同一话题、同一语气连续时沿用同一标签；"
                                "只有话题或语气明显变化才换，不强制每段不同。"
                            ),
                        },
                        {
                            "role": "user",
                            "content": (
                                f"可用标签：{'、'.join(labels)}\n\n"
                                f"本轮用户消息：{user_text}\n\n"
                                f"编号单元：\n{numbered}"
                            ),
                        },
                    ],
                    temperature=0,
                    max_tokens=256,
                )
                text = (response.choices[0].message.content or "").strip()
                start = text.find("[")
                end = text.rfind("]")
                parsed = json.loads(text[start : end + 1]) if start >= 0 and end >= start else []
                if (
                    isinstance(parsed, list)
                    and len(parsed) == len(units)
                    and all(str(item) in labels for item in parsed)
                ):
                    moods = [str(item) for item in parsed]
                else:
                    moods = [fallback for _ in units]
            except Exception:  # noqa: BLE001
                moods = [fallback for _ in units]
            finally:
                await client.close()

    for unit, mood in zip(units, moods, strict=True):
        unit["mood"] = mood
    last_mood = moods[-1]
    await core.write(
        "chat",
        "messages",
        "update",
        {
            "id": message_id,
            "mood": last_mood,
            "segments_json": json.dumps(units, ensure_ascii=False),
        },
    )
    return {"mood": last_mood, "segments": units}
