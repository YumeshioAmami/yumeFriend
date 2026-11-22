from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Request

from yumefriend.core import CoreClient

router = APIRouter(prefix="/api/v1")


def core(request: Request) -> CoreClient:
    return request.app.state.core


async def read_life(client: CoreClient, friend_id: str) -> dict[str, Any]:
    result = await client.read(
        "life",
        "friend_life",
        filter={"friend_id": friend_id},
        limit=1,
    )
    if result.get("items"):
        return result["items"][0]
    return {
        "friend_id": friend_id,
        "current_activity_id": None,
        "last_activity_at": None,
        "last_observation": "",
        "pending_share": "",
        "last_share_at": None,
        "paused_by_chat": 0,
        "paused_until": None,
    }


@router.get("/friends/{friend_id}/life")
async def get_life(request: Request, friend_id: str) -> dict[str, Any]:
    client = core(request)
    life = await read_life(client, friend_id)
    projects = await client.read(
        "life",
        "life_projects",
        filter={"friend_id": friend_id},
        limit=100,
    )
    activities = await client.read(
        "life",
        "life_activities",
        filter={"friend_id": friend_id},
        limit=100,
    )
    return {
        "friend_life": life,
        "projects": projects.get("items", []),
        "activities": activities.get("items", []),
    }


@router.get("/friends/{friend_id}/life/projects")
async def get_projects(request: Request, friend_id: str) -> dict[str, Any]:
    result = await core(request).read(
        "life",
        "life_projects",
        filter={"friend_id": friend_id},
        limit=100,
    )
    return {"items": result.get("items", []), "next_cursor": None}


@router.get("/friends/{friend_id}/life/activities")
async def get_activities(request: Request, friend_id: str) -> dict[str, Any]:
    result = await core(request).read(
        "life",
        "life_activities",
        filter={"friend_id": friend_id},
        limit=100,
    )
    items = sorted(
        result.get("items", []),
        key=lambda item: item.get("started_at", ""),
        reverse=True,
    )
    return {"items": items, "next_cursor": None}


@router.post("/friends/{friend_id}/life/pause")
async def pause_life(request: Request, friend_id: str) -> dict[str, Any]:
    client = core(request)
    life = await read_life(client, friend_id)
    data = {
        "friend_id": friend_id,
        "paused_by_chat": 1,
        "paused_until": datetime.now().astimezone().isoformat(),
    }
    op = "update" if life.get("created_at") else "create"
    result = await client.write("life", "friend_life", op, data)
    return result["record"]


@router.post("/friends/{friend_id}/life/resume")
async def resume_life(request: Request, friend_id: str) -> dict[str, Any]:
    client = core(request)
    life = await read_life(client, friend_id)
    data = {
        "friend_id": friend_id,
        "paused_by_chat": 0,
        "paused_until": None,
    }
    op = "update" if life.get("created_at") else "create"
    result = await client.write("life", "friend_life", op, data)
    return result["record"]
