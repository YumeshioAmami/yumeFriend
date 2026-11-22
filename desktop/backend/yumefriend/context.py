from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from yumefriend.core import CoreClient


@dataclass
class PromptContext:
    state: str = ""
    memories: str = ""
    knowledge: str = ""
    schedules: str = ""
    thought: str = ""
    style: str = ""
    expression: str = ""


async def load_prompt_context(
    core: CoreClient,
    friend_id: str,
    query: str = "",
) -> PromptContext:
    memories = await core.read(
        "memory",
        "memories",
        filter={"friend_id": friend_id},
        limit=500,
    )
    schedules = await core.read(
        "schedule",
        "schedules",
        filter={"friend_id": friend_id},
        limit=200,
    )
    thoughts = await core.read(
        "thought",
        "thoughts",
        filter={"friend_id": friend_id},
        limit=100,
    )
    style = await core.read(
        "expression",
        "style_profiles",
        filter={"friend_id": friend_id},
        limit=1,
    )
    samples = await core.read(
        "expression",
        "expression_samples",
        filter={"friend_id": friend_id, "kind": "voice"},
        limit=16,
    )
    state = await core.read(
        "friend",
        "friend_states",
        filter={"friend_id": friend_id},
        limit=1,
    )
    knowledge = await core.read(
        "document",
        "document_chunks",
        filter={"friend_id": friend_id},
        limit=500,
    )

    now = datetime.now().astimezone()
    memory_items = memories.get("items", [])
    pinned = [item for item in memory_items if item.get("layer") == "pinned"]
    long_term = sorted(
        [
            item
            for item in memory_items
            if item.get("layer") in {"permanent", "long_term"}
            and item.get("expires_at") is None
        ],
        key=lambda item: float(item.get("importance", 0)),
        reverse=True,
    )[:12]
    short_term = [
        item
        for item in memory_items
        if item.get("layer") == "short_term"
        and item.get("expires_at")
        and parse_time(item["expires_at"]) > now
    ]
    memory_lines = [f"- {item.get('content', '')}" for item in pinned + long_term + short_term]

    schedule_items = sorted(
        [
            item
            for item in schedules.get("items", [])
            if item.get("state") in {"pending", "active"}
        ],
        key=lambda item: (item.get("date_local", ""), item.get("time_local") or ""),
    )[:10]
    schedule_lines = [
        f"- {item.get('date_local', '')} {item.get('time_local') or ''} {item.get('title', '')}".strip()
        for item in schedule_items
    ]

    thought_items = sorted(
        [item for item in thoughts.get("items", []) if item.get("state") == "pending"],
        key=lambda item: item.get("created_at", ""),
        reverse=True,
    )

    style_item = (style.get("items") or [{}])[0]
    expression_lines = [
        f"- {item.get('text', '')}" for item in samples.get("items", [])
    ]
    knowledge_lines = []
    if query:
        for item in knowledge.get("items", []):
            text = item.get("text", "")
            if query.casefold() in text.casefold():
                knowledge_lines.append(f"- {text[:400]}")
            if len(knowledge_lines) >= 4:
                break

    return PromptContext(
        state=format_state((state.get("items") or [{}])[0]),
        memories="\n".join(memory_lines),
        knowledge="\n".join(knowledge_lines),
        schedules="\n".join(schedule_lines),
        thought=thought_items[0].get("content", "") if thought_items else "",
        style=style_item.get("profile_json", ""),
        expression="\n".join(expression_lines),
    )


def format_state(item: dict[str, Any]) -> str:
    labels = {
        "affect_json": "情绪",
        "energy": "精力",
        "concerns_json": "在意的事",
        "intent": "意图",
        "inner_note": "内心备注",
        "relationship_note": "关系状态",
        "open_loops_json": "没结束的话题",
        "active_thread": "当前主话题",
    }
    lines = []
    for key, label in labels.items():
        value = item.get(key)
        if value in (None, "", "[]", "{}"):
            continue
        lines.append(f"- {label}: {value}")
    return "\n".join(lines)


def parse_time(value: str) -> datetime:
    parsed = datetime.fromisoformat(value)
    return parsed.astimezone() if parsed.tzinfo is None else parsed


def style_text(raw: str) -> str:
    if not raw:
        return ""
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return raw
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False, indent=2)
