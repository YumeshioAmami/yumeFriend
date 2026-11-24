from __future__ import annotations

import base64
import json
from typing import Any

import httpx
from fastapi import APIRouter, File, HTTPException, Request, Response, UploadFile
from pydantic import BaseModel

from yumefriend.assets import save_asset
from yumefriend.core import CoreClient

router = APIRouter(prefix="/api/v1")


class VoiceDraft(BaseModel):
    name: str
    provider: str = "openai"
    config_json: str = "{}"
    speed: float = 1.0


class DrawDraft(BaseModel):
    prompt: str


def core(request: Request) -> CoreClient:
    return request.app.state.core


async def settings_map(core: CoreClient) -> dict[str, Any]:
    result = await core.read("settings", "settings", limit=200)
    values = {}
    for item in result.get("items", []):
        try:
            values[item["key"]] = json.loads(item["value_json"])
        except (json.JSONDecodeError, KeyError):
            values[item.get("key", "")] = item.get("value_json", "")
    return values


async def media_config(core: CoreClient, prefix: str) -> tuple[str, str, str]:
    values = await settings_map(core)
    base_url = values.get(f"{prefix}_base_url") or values.get("llm_base_url") or ""
    api_key = values.get(f"{prefix}_api_key") or values.get("llm_api_key") or ""
    model = values.get(f"{prefix}_model") or ""
    if not base_url or not api_key or not model:
        raise HTTPException(status_code=400, detail=f"{prefix} 未配置")
    return base_url.rstrip("/"), api_key, model


async def message_with_assets(core: CoreClient, message: dict[str, Any]) -> dict[str, Any]:
    assets = await core.read(
        "chat",
        "message_assets",
        filter={"message_id": message["id"]},
        limit=20,
    )
    images = [
        item["asset_id"]
        for item in assets.get("items", [])
        if item.get("role") == "image"
    ]
    voice = next(
        (item["asset_id"] for item in assets.get("items", []) if item.get("role") == "voice"),
        None,
    )
    try:
        segments = json.loads(message.get("segments_json") or "[]")
    except json.JSONDecodeError:
        segments = []
    try:
        sources = json.loads(message.get("sources_json") or "[]")
    except json.JSONDecodeError:
        sources = []
    try:
        tool_calls = json.loads(message.get("tool_calls_json") or "[]")
    except json.JSONDecodeError:
        tool_calls = []
    return {
        **message,
        "image_asset_ids": images,
        "voice_asset_id": voice,
        "segments": segments,
        "sources": sources,
        "tool_calls": tool_calls,
    }


async def attach_asset(
    core: CoreClient,
    message_id: str,
    asset_id: str,
    role: str,
    position: int = 0,
) -> None:
    await core.write(
        "chat",
        "message_assets",
        "create",
        {
            "message_id": message_id,
            "asset_id": asset_id,
            "role": role,
            "position": position,
        },
    )


@router.post("/speech/transcribe")
async def transcribe(
    request: Request,
    file: UploadFile = File(...),  # noqa: B008
) -> dict[str, str]:
    client = core(request)
    base_url, api_key, model = await media_config(client, "stt")
    data = await file.read()
    async with httpx.AsyncClient(timeout=120) as http:
        response = await http.post(
            f"{base_url}/audio/transcriptions",
            headers={"Authorization": f"Bearer {api_key}"},
            files={"file": (file.filename or "audio.webm", data, file.content_type or "audio/webm")},
            data={"model": model},
        )
        response.raise_for_status()
    return {"text": response.json().get("text", "")}


@router.post("/messages/{message_id}/voice")
async def synthesize(request: Request, message_id: str) -> dict[str, Any]:
    client = core(request)
    result = await client.read("chat", "messages", filter={"id": message_id}, limit=1)
    if not result.get("items"):
        raise HTTPException(status_code=404, detail="message not found")
    message = result["items"][0]
    text = message.get("content", "")
    base_url, api_key, model = await media_config(client, "tts")
    values = await settings_map(client)
    voice = values.get("tts_voice") or "alloy"
    async with httpx.AsyncClient(timeout=120) as http:
        response = await http.post(
            f"{base_url}/audio/speech",
            headers={"Authorization": f"Bearer {api_key}"},
            json={"model": model, "voice": voice, "input": text},
        )
        response.raise_for_status()
    asset = save_asset(response.content, "audio/mpeg", "audio")
    await attach_asset(client, message_id, asset["id"], "voice")
    updated = await client.write(
        "chat",
        "messages",
        "update",
        {"id": message_id, "voice_status": "ready"},
    )
    return {"asset_id": asset["id"], "message": await message_with_assets(client, updated["record"])}


@router.post("/friends/{friend_id}/draw")
async def draw(request: Request, friend_id: str, draft: DrawDraft) -> dict[str, Any]:
    client = core(request)
    asset = await generate_image_asset(client, draft.prompt)
    message = await client.write(
        "chat",
        "messages",
        "create",
        {
            "friend_id": friend_id,
            "role": "assistant",
            "kind": "chat",
            "content": "画好了。",
            "proactive": 0,
            "status": "completed",
        },
    )
    record = message["record"]
    await attach_asset(client, record["id"], asset["id"], "image")
    return await message_with_assets(client, record)


async def generate_image_asset(core: CoreClient, prompt: str) -> dict[str, Any]:
    base_url, api_key, model = await media_config(core, "image")
    async with httpx.AsyncClient(timeout=180) as http:
        response = await http.post(
            f"{base_url}/images/generations",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": model,
                "prompt": prompt,
                "size": "1024x1024",
                "response_format": "b64_json",
            },
        )
        response.raise_for_status()
    payload = response.json()
    encoded = payload.get("data", [{}])[0].get("b64_json")
    if not encoded:
        raise HTTPException(status_code=502, detail="图片生成结果为空")
    return save_asset(base64.b64decode(encoded), "image/png", "image")


@router.get("/voices")
async def list_voices(request: Request) -> dict[str, Any]:
    result = await core(request).read("voice", "voices", limit=200)
    return {"items": result.get("items", []), "next_cursor": None}


@router.post("/voices")
async def create_voice(request: Request, draft: VoiceDraft) -> dict[str, Any]:
    result = await core(request).write(
        "voice",
        "voices",
        "create",
        {
            "name": draft.name,
            "provider": draft.provider,
            "config_json": draft.config_json,
            "speed": draft.speed,
        },
    )
    return result["record"]


@router.patch("/voices/{voice_id}")
async def update_voice(request: Request, voice_id: str, draft: VoiceDraft) -> dict[str, Any]:
    result = await core(request).write(
        "voice",
        "voices",
        "update",
        {
            "id": voice_id,
            "name": draft.name,
            "provider": draft.provider,
            "config_json": draft.config_json,
            "speed": draft.speed,
        },
    )
    return result["record"]


@router.delete("/voices/{voice_id}", status_code=204)
async def delete_voice(request: Request, voice_id: str) -> Response:
    await core(request).write("voice", "voices", "delete", {"id": voice_id})
    return Response(status_code=204)
