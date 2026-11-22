from __future__ import annotations

import asyncio
import json
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Any

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from loguru import logger
from pydantic import BaseModel

from yumefriend import __version__
from yumefriend.chat import StreamRegistry, generate_reply, load_model_config
from yumefriend.context import load_prompt_context
from yumefriend.core import CoreClient
from yumefriend.features import router


class FriendDraft(BaseModel):
    name: str
    personality: str = ""
    custom_instructions: str = ""


class MessageDraft(BaseModel):
    content: str
    asset_ids: list[str] = []
    reply: bool = True


class SettingWrite(BaseModel):
    scope: str
    owner_id: str
    key: str
    value_json: str


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    core = CoreClient(os.getenv("YUMECORE_URL", "http://127.0.0.1:47895/core/v1"))
    await core.wait_ready()
    app.state.core = core
    app.state.streams = StreamRegistry()
    app.state.tasks = set()
    reminder = asyncio.create_task(reminder_loop(core))
    yield
    reminder.cancel()
    await core.close()


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)


def get_core(request: Request) -> CoreClient:
    return request.app.state.core


async def reminder_loop(core: CoreClient) -> None:
    while True:
        try:
            await check_reminders(core)
        except Exception:  # noqa: BLE001
            logger.exception("提醒扫描失败")
        await asyncio.sleep(30)


async def check_reminders(core: CoreClient) -> None:
    result = await core.read("schedule", "schedules", limit=500)
    now = datetime.now()
    for schedule in result.get("items", []):
        if schedule.get("state") not in {"pending", "active"} or not schedule.get("time_local"):
            continue
        try:
            due = datetime.fromisoformat(
                f"{schedule['date_local']}T{schedule['time_local']}"
            ) - timedelta(minutes=int(schedule.get("advance_minutes", 0)))
        except ValueError:
            continue
        if due > now or due < now - timedelta(hours=24):
            continue
        events = await core.read(
            "schedule",
            "schedule_events",
            filter={"schedule_id": schedule["id"]},
            limit=50,
        )
        if any(item.get("action") == "remind" for item in events.get("items", [])):
            continue
        await core.write(
            "chat",
            "messages",
            "create",
            {
                "friend_id": schedule["friend_id"],
                "role": "system",
                "kind": "notice",
                "content": f"日程提醒：{schedule['title']}",
                "proactive": 0,
                "status": "completed",
            },
        )
        await core.write(
            "schedule",
            "schedule_events",
            "create",
            {
                "friend_id": schedule["friend_id"],
                "schedule_id": schedule["id"],
                "actor": "system",
                "action": "remind",
                "after_json": json.dumps(schedule, ensure_ascii=False),
            },
        )


@app.get("/api/v1/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/v1/version")
def version() -> dict[str, str | int]:
    return {
        "app": __version__,
        "python": __version__,
        "yumeCore": "0.1.0",
        "protocol": 1,
    }


@app.get("/api/v1/friends")
async def friends(request: Request) -> dict[str, Any]:
    result = await get_core(request).read("friend", "friends", limit=200)
    items = sorted(result.get("items", []), key=lambda item: item.get("created_at", ""))
    return {"items": items, "next_cursor": None}


@app.post("/api/v1/friends")
async def create_friend(request: Request, draft: FriendDraft) -> dict[str, Any]:
    core = get_core(request)
    friend = await core.write(
        "friend",
        "friends",
        "create",
        {
            "name": draft.name,
            "personality": draft.personality,
            "custom_instructions": draft.custom_instructions,
        },
    )
    record = friend["record"]
    await core.write(
        "friend",
        "friend_states",
        "create",
        {"friend_id": record["id"]},
    )
    return record


@app.get("/api/v1/friends/{friend_id}/messages")
async def messages(request: Request, friend_id: str) -> dict[str, Any]:
    result = await get_core(request).read(
        "chat",
        "messages",
        filter={"friend_id": friend_id},
        limit=200,
    )
    items = sorted(result.get("items", []), key=lambda item: item.get("created_at", ""))
    return {"items": items, "next_cursor": None}


@app.post("/api/v1/friends/{friend_id}/messages")
async def send_message(
    request: Request,
    friend_id: str,
    draft: MessageDraft,
) -> dict[str, Any]:
    core = get_core(request)
    if not draft.content.strip():
        raise HTTPException(status_code=400, detail="content is empty")

    user = await core.write(
        "chat",
        "messages",
        "create",
        {
            "friend_id": friend_id,
            "role": "user",
            "kind": "chat",
            "content": draft.content,
            "proactive": 0,
            "status": "completed",
        },
    )
    if draft.reply:
        reply = await core.write(
            "chat",
            "messages",
            "create",
            {
                "friend_id": friend_id,
                "role": "assistant",
                "kind": "chat",
                "content": "",
                "proactive": 0,
                "status": "streaming",
            },
        )
        assistant = reply["record"]
        friend_result = await core.read(
            "friend",
            "friends",
            filter={"id": friend_id},
            limit=1,
        )
        history_result = await core.read(
            "chat",
            "messages",
            filter={"friend_id": friend_id},
            limit=80,
        )
        friend = friend_result["items"][0]
        history = sorted(
            history_result.get("items", []),
            key=lambda item: item.get("created_at", ""),
        )
        context = await load_prompt_context(core, friend_id)
        config = await load_model_config(core)
        streams: StreamRegistry = request.app.state.streams
        streams.create(assistant["id"])
        if config is None:
            await core.write(
                "chat",
                "messages",
                "update",
                {"id": assistant["id"], "status": "error", "error_text": "模型未配置"},
            )
            streams.push(
                assistant["id"],
                {"type": "error", "data": {"code": "model_error", "message": "模型未配置"}},
            )
            streams.finish(assistant["id"])
        else:
            task = asyncio.create_task(
                generate_reply(
                    core,
                    streams,
                    assistant["id"],
                    friend,
                    history,
                    context,
                    config,
                )
            )
            request.app.state.tasks.add(task)
            task.add_done_callback(request.app.state.tasks.discard)
    else:
        assistant = None

    return {"user_message": user["record"], "reply_message": assistant}


@app.get("/api/v1/messages/{message_id}/stream")
async def message_stream(request: Request, message_id: str) -> StreamingResponse:
    streams: StreamRegistry = request.app.state.streams
    queue = streams.queue(message_id)
    if queue is None:
        raise HTTPException(status_code=404, detail="stream not found")

    async def events() -> AsyncIterator[str]:
        try:
            while True:
                event = await queue.get()
                if event is None:
                    break
                yield (
                    f"event: {event['type']}\n"
                    f"data: {json.dumps(event['data'], ensure_ascii=False)}\n\n"
                )
        finally:
            streams.remove(message_id)

    return StreamingResponse(events(), media_type="text/event-stream")


@app.get("/api/v1/settings")
async def settings(request: Request) -> dict[str, Any]:
    result = await get_core(request).read("settings", "settings", limit=200)
    return result


@app.put("/api/v1/settings")
async def write_setting(request: Request, draft: SettingWrite) -> dict[str, Any]:
    core = get_core(request)
    existing = await core.read(
        "settings",
        "settings",
        filter={
            "scope": draft.scope,
            "owner_id": draft.owner_id,
            "key": draft.key,
        },
        limit=1,
    )
    data = {
        "scope": draft.scope,
        "owner_id": draft.owner_id,
        "key": draft.key,
        "value_json": draft.value_json,
    }
    result = await core.write(
        "settings",
        "settings",
        "update" if existing.get("items") else "create",
        data,
    )
    return result


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=int(os.getenv("YUMEFRIEND_PORT", "47891")))
