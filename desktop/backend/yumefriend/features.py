from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from yumefriend.core import CoreClient

router = APIRouter(prefix="/api/v1")


class MemoryDraft(BaseModel):
    content: str
    kind: str = "note"
    layer: str = "long_term"
    context: str | None = None
    importance: float = 0.5
    confidence: float = 0.5
    occurred_at: str | None = None
    expires_at: str | None = None


class MemoryPatch(BaseModel):
    content: str | None = None
    kind: str | None = None
    layer: str | None = None
    context: str | None = None
    importance: float | None = None
    confidence: float | None = None
    occurred_at: str | None = None
    expires_at: str | None = None


class RecallRequest(BaseModel):
    query: str
    limit: int = 10


class ScheduleDraft(BaseModel):
    title: str
    nature: str = "remind"
    date_local: str
    time_local: str | None = None
    advance_minutes: int = 0
    owner: str = "user"
    source: str = "ui"


class SchedulePatch(BaseModel):
    title: str | None = None
    nature: str | None = None
    date_local: str | None = None
    time_local: str | None = None
    advance_minutes: int | None = None
    owner: str | None = None
    state: str | None = None


class SettleRequest(BaseModel):
    reason: str


class ThoughtDraft(BaseModel):
    content: str
    kind: str = "casual"
    due_at: str | None = None
    schedule_id: str | None = None
    source: str = "model"


class ThoughtPatch(BaseModel):
    content: str | None = None
    kind: str | None = None
    due_at: str | None = None
    state: str | None = None
    expires_at: str | None = None


class ExpressionDraft(BaseModel):
    text: str
    kind: str = "phrase"
    situation: str = ""
    score: float = 1.0
    source: str = "user"


class StyleDraft(BaseModel):
    profile_json: str


def core(request: Request) -> CoreClient:
    return request.app.state.core


def now_utc() -> str:
    return datetime.now().astimezone().isoformat()


async def memory_event(
    client: CoreClient,
    friend_id: str,
    memory_id: str | None,
    action: str,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
) -> None:
    await client.write(
        "memory",
        "memory_events",
        "create",
        {
            "friend_id": friend_id,
            "memory_id": memory_id,
            "actor": "user",
            "action": action,
            "before_json": json.dumps(before, ensure_ascii=False) if before else None,
            "after_json": json.dumps(after, ensure_ascii=False) if after else None,
        },
    )


async def schedule_event(
    client: CoreClient,
    friend_id: str,
    schedule_id: str | None,
    action: str,
    actor: str = "user",
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
) -> None:
    await client.write(
        "schedule",
        "schedule_events",
        "create",
        {
            "friend_id": friend_id,
            "schedule_id": schedule_id,
            "actor": actor,
            "action": action,
            "before_json": json.dumps(before, ensure_ascii=False) if before else None,
            "after_json": json.dumps(after, ensure_ascii=False) if after else None,
        },
    )


async def read_one(
    client: CoreClient,
    module_id: str,
    entity: str,
    entity_id: str,
) -> dict[str, Any]:
    result = await client.read(module_id, entity, filter={"id": entity_id}, limit=1)
    if not result.get("items"):
        raise HTTPException(status_code=404, detail="not found")
    return result["items"][0]


@router.get("/friends/{friend_id}/memories")
async def list_memories(request: Request, friend_id: str) -> dict[str, Any]:
    result = await core(request).read(
        "memory",
        "memories",
        filter={"friend_id": friend_id},
        limit=500,
    )
    items = sorted(result.get("items", []), key=lambda item: item.get("updated_at", ""), reverse=True)
    return {"items": items, "next_cursor": None}


@router.post("/friends/{friend_id}/memories")
async def create_memory(request: Request, friend_id: str, draft: MemoryDraft) -> dict[str, Any]:
    client = core(request)
    result = await client.write(
        "memory",
        "memories",
        "create",
        {
            "friend_id": friend_id,
            "kind": draft.kind,
            "layer": draft.layer,
            "content": draft.content,
            "context": draft.context,
            "importance": draft.importance,
            "confidence": draft.confidence,
            "occurred_at": draft.occurred_at,
            "expires_at": draft.expires_at,
            "source_message_ids_json": "[]",
        },
    )
    record = result["record"]
    await memory_event(client, friend_id, record["id"], "create", after=record)
    return record


@router.get("/memories/{memory_id}")
async def get_memory(request: Request, memory_id: str) -> dict[str, Any]:
    return await read_one(core(request), "memory", "memories", memory_id)


@router.patch("/memories/{memory_id}")
async def update_memory(request: Request, memory_id: str, draft: MemoryPatch) -> dict[str, Any]:
    client = core(request)
    before = await read_one(client, "memory", "memories", memory_id)
    patch = draft.model_dump(exclude_unset=True, exclude_none=True)
    if not patch:
        return before
    result = await client.write(
        "memory",
        "memories",
        "update",
        {"id": memory_id, **patch},
    )
    record = result["record"]
    await memory_event(client, before["friend_id"], memory_id, "update", before, record)
    return record


@router.delete("/memories/{memory_id}", status_code=204)
async def delete_memory(request: Request, memory_id: str) -> Response:
    client = core(request)
    before = await read_one(client, "memory", "memories", memory_id)
    await client.write("memory", "memories", "delete", {"id": memory_id})
    await memory_event(client, before["friend_id"], memory_id, "delete", before)
    return Response(status_code=204)


@router.post("/friends/{friend_id}/memories/recall")
async def recall_memory(
    request: Request,
    friend_id: str,
    draft: RecallRequest,
) -> dict[str, Any]:
    client = core(request)
    result = await client.read(
        "memory",
        "memories",
        filter={"friend_id": friend_id},
        limit=500,
    )
    query = draft.query.casefold()
    items = [
        item
        for item in result.get("items", [])
        if query in item.get("content", "").casefold()
        or query in (item.get("context") or "").casefold()
    ]
    items.sort(
        key=lambda item: (float(item.get("importance", 0)), item.get("updated_at", "")),
        reverse=True,
    )
    items = items[: max(1, draft.limit)]
    for item in items:
        item["last_recalled_at"] = now_utc()
        await client.write(
            "memory",
            "memories",
            "update",
            {"id": item["id"], "last_recalled_at": item["last_recalled_at"]},
        )
    return {"items": items, "next_cursor": None}


@router.get("/memories/{memory_id}/events")
async def memory_events(request: Request, memory_id: str) -> dict[str, Any]:
    result = await core(request).read(
        "memory",
        "memory_events",
        filter={"memory_id": memory_id},
        limit=200,
    )
    items = sorted(result.get("items", []), key=lambda item: item.get("created_at", ""))
    return {"items": items, "next_cursor": None}


def schedule_sort_key(item: dict[str, Any]) -> tuple[str, str]:
    return item.get("date_local", ""), item.get("time_local") or ""


@router.get("/friends/{friend_id}/schedules")
async def list_schedules(request: Request, friend_id: str) -> dict[str, Any]:
    result = await core(request).read(
        "schedule",
        "schedules",
        filter={"friend_id": friend_id},
        limit=500,
    )
    items = sorted(result.get("items", []), key=schedule_sort_key)
    return {"items": items, "next_cursor": None}


@router.get("/friends/{friend_id}/schedules/upcoming")
async def upcoming_schedules(request: Request, friend_id: str) -> dict[str, Any]:
    result = await core(request).read(
        "schedule",
        "schedules",
        filter={"friend_id": friend_id},
        limit=500,
    )
    now = datetime.now()
    items = []
    for item in result.get("items", []):
        if item.get("state") not in {"pending", "active"}:
            continue
        try:
            due = datetime.fromisoformat(
                f"{item['date_local']}T{item.get('time_local') or '23:59'}"
            )
        except ValueError:
            continue
        if due >= now:
            items.append(item)
    items.sort(key=schedule_sort_key)
    return {"items": items[:20], "next_cursor": None}


@router.post("/friends/{friend_id}/schedules", status_code=201)
async def create_schedule(
    request: Request,
    friend_id: str,
    draft: ScheduleDraft,
) -> dict[str, Any]:
    client = core(request)
    result = await client.write(
        "schedule",
        "schedules",
        "create",
        {
            "friend_id": friend_id,
            "title": draft.title,
            "nature": draft.nature,
            "date_local": draft.date_local,
            "time_local": draft.time_local,
            "advance_minutes": draft.advance_minutes,
            "state": "pending",
            "owner": draft.owner,
            "source": draft.source,
        },
    )
    record = result["record"]
    await schedule_event(client, friend_id, record["id"], "create", after=record)
    return record


@router.get("/schedules/{schedule_id}")
async def get_schedule(request: Request, schedule_id: str) -> dict[str, Any]:
    return await read_one(core(request), "schedule", "schedules", schedule_id)


@router.patch("/schedules/{schedule_id}")
async def update_schedule(
    request: Request,
    schedule_id: str,
    draft: SchedulePatch,
) -> dict[str, Any]:
    client = core(request)
    before = await read_one(client, "schedule", "schedules", schedule_id)
    patch = draft.model_dump(exclude_unset=True, exclude_none=True)
    if not patch:
        return before
    result = await client.write(
        "schedule",
        "schedules",
        "update",
        {"id": schedule_id, **patch},
    )
    record = result["record"]
    await schedule_event(client, before["friend_id"], schedule_id, "update", before=before, after=record)
    return record


@router.delete("/schedules/{schedule_id}", status_code=204)
async def delete_schedule(request: Request, schedule_id: str) -> Response:
    client = core(request)
    before = await read_one(client, "schedule", "schedules", schedule_id)
    await client.write("schedule", "schedules", "delete", {"id": schedule_id})
    await schedule_event(client, before["friend_id"], schedule_id, "delete", before=before)
    return Response(status_code=204)


@router.post("/schedules/{schedule_id}/settle")
async def settle_schedule(
    request: Request,
    schedule_id: str,
    draft: SettleRequest,
) -> dict[str, Any]:
    client = core(request)
    before = await read_one(client, "schedule", "schedules", schedule_id)
    result = await client.write(
        "schedule",
        "schedules",
        "update",
        {
            "id": schedule_id,
            "state": "settled",
            "settled_at": now_utc(),
            "settled_reason": draft.reason,
        },
    )
    record = result["record"]
    await schedule_event(
        client,
        before["friend_id"],
        schedule_id,
        "settle",
        before=before,
        after=record,
    )
    return record


@router.get("/schedules/{schedule_id}/events")
async def schedule_events(request: Request, schedule_id: str) -> dict[str, Any]:
    result = await core(request).read(
        "schedule",
        "schedule_events",
        filter={"schedule_id": schedule_id},
        limit=200,
    )
    items = sorted(result.get("items", []), key=lambda item: item.get("created_at", ""))
    return {"items": items, "next_cursor": None}


@router.get("/friends/{friend_id}/thoughts")
async def list_thoughts(request: Request, friend_id: str) -> dict[str, Any]:
    result = await core(request).read(
        "thought",
        "thoughts",
        filter={"friend_id": friend_id},
        limit=200,
    )
    items = sorted(result.get("items", []), key=lambda item: item.get("created_at", ""), reverse=True)
    return {"items": items, "next_cursor": None}


@router.post("/friends/{friend_id}/thoughts")
async def create_thought(
    request: Request,
    friend_id: str,
    draft: ThoughtDraft,
) -> dict[str, Any]:
    result = await core(request).write(
        "thought",
        "thoughts",
        "create",
        {
            "friend_id": friend_id,
            "content": draft.content,
            "kind": draft.kind,
            "due_at": draft.due_at,
            "schedule_id": draft.schedule_id,
            "state": "pending",
            "source": draft.source,
        },
    )
    return result["record"]


@router.get("/thoughts/{thought_id}")
async def get_thought(request: Request, thought_id: str) -> dict[str, Any]:
    return await read_one(core(request), "thought", "thoughts", thought_id)


@router.patch("/thoughts/{thought_id}")
async def update_thought(
    request: Request,
    thought_id: str,
    draft: ThoughtPatch,
) -> dict[str, Any]:
    before = await read_one(core(request), "thought", "thoughts", thought_id)
    patch = draft.model_dump(exclude_unset=True, exclude_none=True)
    if not patch:
        return before
    result = await core(request).write(
        "thought",
        "thoughts",
        "update",
        {"id": thought_id, **patch},
    )
    return result["record"]


@router.delete("/thoughts/{thought_id}", status_code=204)
async def delete_thought(request: Request, thought_id: str) -> Response:
    client = core(request)
    await read_one(client, "thought", "thoughts", thought_id)
    await client.write("thought", "thoughts", "delete", {"id": thought_id})
    return Response(status_code=204)


@router.post("/thoughts/{thought_id}/done")
async def done_thought(request: Request, thought_id: str) -> dict[str, Any]:
    await read_one(core(request), "thought", "thoughts", thought_id)
    result = await core(request).write(
        "thought",
        "thoughts",
        "update",
        {"id": thought_id, "state": "done", "said_at": now_utc()},
    )
    return result["record"]


@router.get("/friends/{friend_id}/expression-samples")
async def list_samples(request: Request, friend_id: str) -> dict[str, Any]:
    result = await core(request).read(
        "expression",
        "expression_samples",
        filter={"friend_id": friend_id},
        limit=200,
    )
    items = sorted(result.get("items", []), key=lambda item: item.get("created_at", ""), reverse=True)
    return {"items": items, "next_cursor": None}


@router.post("/friends/{friend_id}/expression-samples")
async def create_sample(
    request: Request,
    friend_id: str,
    draft: ExpressionDraft,
) -> dict[str, Any]:
    result = await core(request).write(
        "expression",
        "expression_samples",
        "create",
        {
            "friend_id": friend_id,
            "kind": draft.kind,
            "text": draft.text,
            "situation": draft.situation,
            "score": draft.score,
            "source": draft.source,
        },
    )
    return result["record"]


@router.delete("/expression-samples/{sample_id}", status_code=204)
async def delete_sample(request: Request, sample_id: str) -> Response:
    client = core(request)
    await read_one(client, "expression", "expression_samples", sample_id)
    await client.write("expression", "expression_samples", "delete", {"id": sample_id})
    return Response(status_code=204)


async def read_style(client: CoreClient, friend_id: str) -> dict[str, Any]:
    result = await client.read(
        "expression",
        "style_profiles",
        filter={"friend_id": friend_id},
        limit=1,
    )
    if result.get("items"):
        return result["items"][0]
    return {
        "friend_id": friend_id,
        "profile_json": "",
        "version": 0,
    }


@router.get("/friends/{friend_id}/style")
async def get_style(request: Request, friend_id: str) -> dict[str, Any]:
    return await read_style(core(request), friend_id)


@router.put("/friends/{friend_id}/style")
async def put_style(
    request: Request,
    friend_id: str,
    draft: StyleDraft,
) -> dict[str, Any]:
    client = core(request)
    before = await read_style(client, friend_id)
    version = int(before.get("version", 0)) + 1
    data = {
        "friend_id": friend_id,
        "profile_json": draft.profile_json,
        "version": version,
    }
    op = "update" if before.get("version", 0) else "create"
    result = await client.write("expression", "style_profiles", op, data)
    after = result["record"]
    await client.write(
        "expression",
        "style_events",
        "create",
        {
            "friend_id": friend_id,
            "event_type": "update",
            "summary": "手动更新说话方式",
            "before_version": int(before.get("version", 0)),
            "after_version": version,
            "before_profile_json": before.get("profile_json", ""),
            "after_profile_json": draft.profile_json,
        },
    )
    return after


@router.get("/friends/{friend_id}/style/events")
async def style_events(request: Request, friend_id: str) -> dict[str, Any]:
    result = await core(request).read(
        "expression",
        "style_events",
        filter={"friend_id": friend_id},
        limit=200,
    )
    items = sorted(result.get("items", []), key=lambda item: item.get("created_at", ""), reverse=True)
    return {"items": items, "next_cursor": None}


@router.post("/friends/{friend_id}/style/rollback")
async def rollback_style(request: Request, friend_id: str) -> dict[str, Any]:
    client = core(request)
    before = await read_style(client, friend_id)
    events = await client.read(
        "expression",
        "style_events",
        filter={"friend_id": friend_id},
        limit=200,
    )
    target = next(
        (
            item
            for item in sorted(
                events.get("items", []),
                key=lambda item: item.get("created_at", ""),
                reverse=True,
            )
            if item.get("before_profile_json")
        ),
        None,
    )
    if target is None:
        raise HTTPException(status_code=400, detail="没有可回滚的版本")
    version = int(before.get("version", 0)) + 1
    result = await client.write(
        "expression",
        "style_profiles",
        "update",
        {
            "friend_id": friend_id,
            "profile_json": target["before_profile_json"],
            "version": version,
        },
    )
    after = result["record"]
    await client.write(
        "expression",
        "style_events",
        "create",
        {
            "friend_id": friend_id,
            "event_type": "rollback",
            "summary": "回滚说话方式",
            "before_version": int(before.get("version", 0)),
            "after_version": version,
            "before_profile_json": before.get("profile_json", ""),
            "after_profile_json": target["before_profile_json"],
        },
    )
    return after
