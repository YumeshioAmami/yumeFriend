from __future__ import annotations

import json
import os
import random
from datetime import datetime, timedelta
from typing import Any

from openai import AsyncOpenAI

from yumefriend.chat import load_model_config
from yumefriend.core import CoreClient
from yumefriend.life import read_life
from yumefriend.tools import bing_search


async def life_step(core: CoreClient, friend: dict[str, Any]) -> None:
    settings = await core.read("settings", "settings", limit=200)
    values = {}
    for item in settings.get("items", []):
        try:
            values[item["key"]] = json.loads(item["value_json"])
        except (json.JSONDecodeError, KeyError):
            pass
    share_chance = float(values.get("life_share_chance", 0.35))
    cooldown_minutes = float(values.get("life_cooldown_minutes", 120))

    life = await read_life(core, friend["id"])
    if life.get("paused_by_chat") and life.get("paused_until"):
        try:
            if datetime.fromisoformat(life["paused_until"]) > datetime.now().astimezone():
                return
        except ValueError:
            pass

    projects = await core.read(
        "life",
        "life_projects",
        filter={"friend_id": friend["id"]},
        limit=20,
    )
    project = next(
        (item for item in projects.get("items", []) if item.get("status") == "active"),
        None,
    )
    topic = project.get("topic") if project else "最近新闻"
    results = await bing_search(topic, 3)
    if not results:
        return

    now = datetime.now().astimezone().isoformat()
    selected = results[0]
    if project is None:
        created = await core.write(
            "life",
            "life_projects",
            "create",
            {
                "friend_id": friend["id"],
                "topic": topic,
                "status": "active",
                "source": "bing",
                "step_count": 0,
                "content_depth": "snippet",
            },
        )
        project = created["record"]

    activity = await core.write(
        "life",
        "life_activities",
        "create",
        {
            "friend_id": friend["id"],
            "project_id": project["id"],
            "device_id": os.getenv("YUMEFRIEND_DEVICE_ID", "desktop"),
            "kind": "web_read",
            "title": selected.get("title", ""),
            "status": "completed",
            "started_at": now,
            "finished_at": now,
            "summary": selected.get("snippet", ""),
            "observations_json": json.dumps([selected.get("snippet", "")], ensure_ascii=False),
            "tool_calls_json": json.dumps(
                [{"tool": "bing_search", "query": topic, "url": selected.get("url", "")}],
                ensure_ascii=False,
            ),
        },
    )
    record = activity["record"]
    await core.write(
        "life",
        "life_projects",
        "update",
        {
            "id": project["id"],
            "step_count": int(project.get("step_count", 0)) + 1,
            "reading_excerpt": selected.get("snippet", ""),
            "last_activity_at": now,
            "last_thought": selected.get("snippet", ""),
            "evidence_json": json.dumps(results, ensure_ascii=False),
        },
    )

    life_data = {
        "friend_id": friend["id"],
        "current_activity_id": record["id"],
        "last_activity_at": now,
        "last_observation": selected.get("snippet", ""),
    }
    op = "update" if life.get("created_at") else "create"
    await core.write("life", "friend_life", op, life_data)

    config = await load_model_config(core)
    if config is None or random.random() > share_chance:
        return
    last_share = life.get("last_share_at")
    if last_share:
        try:
            if datetime.fromisoformat(last_share) > datetime.now().astimezone() - timedelta(
                minutes=cooldown_minutes
            ):
                return
        except ValueError:
            pass

    client = AsyncOpenAI(base_url=config.base_url or None, api_key=config.api_key)
    try:
        try:
            response = await client.chat.completions.create(
                model=config.model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            f"你是「{friend['name']}」。你刚刚在网上看到：{selected.get('title', '')}。"
                            f"内容：{selected.get('snippet', '')}。"
                            "用 1～2 句话主动分享，先说看到的事，再说你自己的反应。不要像汇报。"
                        ),
                    }
                ],
                temperature=0.8,
            )
            text = (response.choices[0].message.content or "").strip()
        except Exception:  # noqa: BLE001
            return
    finally:
        await client.close()
    if not text:
        return
    await core.write(
        "chat",
        "messages",
        "create",
        {
            "friend_id": friend["id"],
            "role": "assistant",
            "kind": "chat",
            "content": text,
            "proactive": 1,
            "status": "completed",
        },
    )
    await core.write(
        "life",
        "friend_life",
        "update",
        {
            "friend_id": friend["id"],
            "pending_share": text,
            "last_share_at": now,
        },
    )
