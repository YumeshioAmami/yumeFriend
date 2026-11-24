from __future__ import annotations

import io
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any

import httpx
from bs4 import BeautifulSoup
from fastapi import APIRouter, HTTPException, Request
from PIL import ImageGrab
from pydantic import BaseModel

from yumefriend.assets import save_asset
from yumefriend.core import CoreClient
from yumefriend.features import memory_event, schedule_event
from yumefriend.media import generate_image_asset

router = APIRouter(prefix="/api/v1")

PRODUCT_ROOT = Path(__file__).resolve().parents[3]
WORKSPACE = PRODUCT_ROOT / "user_data" / "workspace"

TOOL_SPECS = {
    "web_search": {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "联网搜索；返回标题、链接和摘要。",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "搜索词"},
                    "limit": {"type": "integer", "description": "结果数量，默认 5"},
                },
                "required": ["query"],
            },
        },
    },
    "look_screen": {
        "type": "function",
        "function": {
            "name": "look_screen",
            "description": "截取当前屏幕，返回图片附件。",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    "search_knowledge": {
        "type": "function",
        "function": {
            "name": "search_knowledge",
            "description": "检索当前朋友的知识库片段。",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "检索词"},
                    "limit": {"type": "integer", "description": "结果数量，默认 10"},
                },
                "required": ["query"],
            },
        },
    },
    "list_dir": {
        "type": "function",
        "function": {
            "name": "list_dir",
            "description": "列出工作区目录。",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string", "description": "工作区相对路径"}},
            },
        },
    },
    "read_file": {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "读取工作区文件。",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
            },
        },
    },
    "write_file": {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "写入工作区文件。",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string"}, "content": {"type": "string"}},
                "required": ["path", "content"],
            },
        },
    },
    "move_path": {
        "type": "function",
        "function": {
            "name": "move_path",
            "description": "移动工作区文件或目录。",
            "parameters": {
                "type": "object",
                "properties": {"src": {"type": "string"}, "dst": {"type": "string"}},
                "required": ["src", "dst"],
            },
        },
    },
    "delete_path": {
        "type": "function",
        "function": {
            "name": "delete_path",
            "description": "删除工作区文件或目录。",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
            },
        },
    },
    "save_memory": {
        "type": "function",
        "function": {
            "name": "save_memory",
            "description": "保存一条长期记忆或约定。",
            "parameters": {
                "type": "object",
                "properties": {
                    "content": {"type": "string"},
                    "kind": {"type": "string"},
                    "layer": {"type": "string"},
                    "importance": {"type": "number"},
                },
                "required": ["content"],
            },
        },
    },
    "recall_memory": {
        "type": "function",
        "function": {
            "name": "recall_memory",
            "description": "按关键词回忆记忆。",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "limit": {"type": "integer"},
                },
                "required": ["query"],
            },
        },
    },
    "update_memory": {
        "type": "function",
        "function": {
            "name": "update_memory",
            "description": "修改一条记忆。",
            "parameters": {
                "type": "object",
                "properties": {
                    "memory_id": {"type": "string"},
                    "content": {"type": "string"},
                    "kind": {"type": "string"},
                    "layer": {"type": "string"},
                    "importance": {"type": "number"},
                },
                "required": ["memory_id"],
            },
        },
    },
    "delete_memory": {
        "type": "function",
        "function": {
            "name": "delete_memory",
            "description": "删除一条记忆。",
            "parameters": {
                "type": "object",
                "properties": {"memory_id": {"type": "string"}},
                "required": ["memory_id"],
            },
        },
    },
    "add_schedule": {
        "type": "function",
        "function": {
            "name": "add_schedule",
            "description": "新增日程或提醒。",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "date_local": {"type": "string", "description": "YYYY-MM-DD"},
                    "time_local": {"type": "string", "description": "HH:MM"},
                    "advance_minutes": {"type": "integer"},
                },
                "required": ["title", "date_local"],
            },
        },
    },
    "list_schedules": {
        "type": "function",
        "function": {
            "name": "list_schedules",
            "description": "列出当前朋友的日程。",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    "update_schedule": {
        "type": "function",
        "function": {
            "name": "update_schedule",
            "description": "修改日程。",
            "parameters": {
                "type": "object",
                "properties": {
                    "schedule_id": {"type": "string"},
                    "title": {"type": "string"},
                    "date_local": {"type": "string"},
                    "time_local": {"type": "string"},
                    "advance_minutes": {"type": "integer"},
                    "state": {"type": "string"},
                },
                "required": ["schedule_id"],
            },
        },
    },
    "remove_schedule": {
        "type": "function",
        "function": {
            "name": "remove_schedule",
            "description": "删除日程。",
            "parameters": {
                "type": "object",
                "properties": {"schedule_id": {"type": "string"}},
                "required": ["schedule_id"],
            },
        },
    },
    "save_thought": {
        "type": "function",
        "function": {
            "name": "save_thought",
            "description": "保存一张小纸条。",
            "parameters": {
                "type": "object",
                "properties": {
                    "content": {"type": "string"},
                    "kind": {"type": "string"},
                    "due_at": {"type": "string"},
                },
                "required": ["content"],
            },
        },
    },
    "list_thoughts": {
        "type": "function",
        "function": {
            "name": "list_thoughts",
            "description": "列出小纸条。",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    "finish_thought": {
        "type": "function",
        "function": {
            "name": "finish_thought",
            "description": "完成一张小纸条。",
            "parameters": {
                "type": "object",
                "properties": {"thought_id": {"type": "string"}},
                "required": ["thought_id"],
            },
        },
    },
    "draw_image": {
        "type": "function",
        "function": {
            "name": "draw_image",
            "description": "生成一张图片并附在当前消息里。",
            "parameters": {
                "type": "object",
                "properties": {"prompt": {"type": "string"}},
                "required": ["prompt"],
            },
        },
    },
    "look_image": {
        "type": "function",
        "function": {
            "name": "look_image",
            "description": "查看当前朋友最近的一张图片，或指定 asset_id。",
            "parameters": {
                "type": "object",
                "properties": {"asset_id": {"type": "string"}},
            },
        },
    },
}

MODULE_TOOLS = {
    "search": ["web_search"],
    "screen": ["look_screen"],
    "document": ["search_knowledge"],
    "file": ["list_dir", "read_file", "write_file", "move_path", "delete_path"],
    "memory": ["save_memory", "recall_memory", "update_memory", "delete_memory"],
    "schedule": ["add_schedule", "list_schedules", "update_schedule", "remove_schedule"],
    "thought": ["save_thought", "list_thoughts", "finish_thought"],
    "image": ["draw_image", "look_image"],
}


class SearchBody(BaseModel):
    query: str
    limit: int = 5


class FileWriteBody(BaseModel):
    path: str
    content: str


class FileMoveBody(BaseModel):
    src: str
    dst: str


def safe_path(raw: str) -> Path:
    WORKSPACE.mkdir(parents=True, exist_ok=True)
    path = (WORKSPACE / raw.lstrip("/\\")).resolve()
    if WORKSPACE.resolve() not in path.parents and path != WORKSPACE.resolve():
        raise HTTPException(status_code=400, detail="path outside workspace")
    return path


@router.post("/friends/{friend_id}/search")
async def search(_: Request, friend_id: str, body: SearchBody) -> dict[str, Any]:
    return {"items": await bing_search(body.query, body.limit)}


async def bing_search(query: str, limit: int = 5) -> list[dict[str, Any]]:
    async with httpx.AsyncClient(
        timeout=20,
        headers={"User-Agent": "Mozilla/5.0"},
    ) as client:
        response = await client.get(
            "https://www.bing.com/search",
            params={"q": query},
        )
        response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")
    items = []
    for result in soup.select("li.b_algo")[: max(1, limit)]:
        link = result.select_one("h2 a")
        snippet = result.select_one(".b_caption p")
        if link is None:
            continue
        items.append(
            {
                "title": link.get_text(" ", strip=True),
                "url": link.get("href", ""),
                "snippet": snippet.get_text(" ", strip=True) if snippet else "",
            }
        )
    return items


def native_tool_specs(enabled_modules: set[str]) -> list[dict[str, Any]]:
    names = []
    for module_id, tool_names in MODULE_TOOLS.items():
        if module_id in enabled_modules:
            names.extend(tool_names)
    return [TOOL_SPECS[name] for name in names]


def capture_screen_asset() -> dict[str, Any]:
    image = ImageGrab.grab()
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return save_asset(buffer.getvalue(), "image/png", "image")


async def image_asset_belongs(core: CoreClient, friend_id: str, asset_id: str) -> bool:
    messages = await core.read(
        "chat",
        "messages",
        filter={"friend_id": friend_id},
        limit=500,
    )
    for message in messages.get("items", []):
        assets = await core.read(
            "chat",
            "message_assets",
            filter={"message_id": message["id"]},
            limit=20,
        )
        if any(
            item.get("asset_id") == asset_id and item.get("role") == "image"
            for item in assets.get("items", [])
        ):
            return True
    return False


async def execute_tool(
    core: CoreClient,
    name: str,
    arguments: dict[str, Any],
    friend_id: str,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    if name == "web_search":
        items = await bing_search(
            str(arguments.get("query") or ""),
            int(arguments.get("limit") or 5),
        )
        return {"items": items}, items
    if name == "look_screen":
        asset = capture_screen_asset()
        return {"asset_id": asset["id"], "description": ""}, []
    if name == "search_knowledge":
        query = str(arguments.get("query") or "").casefold()
        limit = max(1, int(arguments.get("limit") or 10))
        result = await core.read(
            "document",
            "document_chunks",
            filter={"friend_id": friend_id},
            limit=500,
        )
        items = [
            item
            for item in result.get("items", [])
            if query in item.get("text", "").casefold()
        ][:limit]
        return {"items": items}, []
    if name == "list_dir":
        target = safe_path(str(arguments.get("path") or ""))
        if not target.exists():
            raise ValueError("path not found")
        if target.is_file():
            return {
                "items": [
                    {
                        "name": target.name,
                        "path": str(target.relative_to(WORKSPACE)),
                        "is_dir": False,
                        "size": target.stat().st_size,
                    }
                ]
            }, []
        items = []
        for child in sorted(target.iterdir(), key=lambda item: (item.is_file(), item.name)):
            items.append(
                {
                    "name": child.name,
                    "path": str(child.relative_to(WORKSPACE)),
                    "is_dir": child.is_dir(),
                    "size": child.stat().st_size if child.is_file() else 0,
                }
            )
        return {"items": items}, []
    if name == "read_file":
        target = safe_path(str(arguments.get("path") or ""))
        if not target.is_file():
            raise ValueError("file not found")
        return {
            "path": str(target.relative_to(WORKSPACE)),
            "content": target.read_text(encoding="utf-8", errors="ignore"),
        }, []
    if name == "write_file":
        target = safe_path(str(arguments.get("path") or ""))
        content = str(arguments.get("content") or "")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        return {"path": str(target.relative_to(WORKSPACE)), "content": content}, []
    if name == "move_path":
        source = safe_path(str(arguments.get("src") or ""))
        destination = safe_path(str(arguments.get("dst") or ""))
        if not source.exists():
            raise ValueError("source not found")
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(source), str(destination))
        return {"src": str(source.relative_to(WORKSPACE)), "dst": str(destination.relative_to(WORKSPACE))}, []
    if name == "delete_path":
        target = safe_path(str(arguments.get("path") or ""))
        if not target.exists():
            raise ValueError("path not found")
        if target.is_dir():
            shutil.rmtree(target)
        else:
            target.unlink()
        return {"path": str(target.relative_to(WORKSPACE))}, []
    if name == "save_memory":
        result = await core.write(
            "memory",
            "memories",
            "create",
            {
                "friend_id": friend_id,
                "kind": str(arguments.get("kind") or "note"),
                "layer": str(arguments.get("layer") or "long_term"),
                "content": str(arguments.get("content") or ""),
                "importance": float(arguments.get("importance") or 0.5),
                "confidence": 0.5,
                "source_message_ids_json": "[]",
            },
        )
        record = result["record"]
        await memory_event(core, friend_id, record["id"], "create", after=record, actor="agent")
        return record, []
    if name == "recall_memory":
        query = str(arguments.get("query") or "").casefold()
        limit = max(1, int(arguments.get("limit") or 10))
        result = await core.read(
            "memory",
            "memories",
            filter={"friend_id": friend_id},
            limit=500,
        )
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
        items = items[:limit]
        for item in items:
            item["last_recalled_at"] = datetime.now().astimezone().isoformat()
            await core.write(
                "memory",
                "memories",
                "update",
                {"id": item["id"], "last_recalled_at": item["last_recalled_at"]},
            )
        return {"items": items}, []
    if name in {"update_memory", "delete_memory"}:
        memory_id = str(arguments.get("memory_id") or "")
        before_result = await core.read(
            "memory",
            "memories",
            filter={"id": memory_id},
            limit=1,
        )
        if not before_result.get("items"):
            raise ValueError("memory not found")
        before = before_result["items"][0]
        if before.get("friend_id") != friend_id:
            raise ValueError("memory not found")
        if name == "delete_memory":
            await core.write("memory", "memories", "delete", {"id": memory_id})
            await memory_event(core, friend_id, memory_id, "delete", before, actor="agent")
            return {"id": memory_id, "deleted": True}, []
        patch = {
            key: arguments[key]
            for key in ("content", "kind", "layer", "importance")
            if key in arguments
        }
        result = await core.write(
            "memory",
            "memories",
            "update",
            {"id": memory_id, **patch},
        )
        record = result["record"]
        await memory_event(core, friend_id, memory_id, "update", before, record, actor="agent")
        return record, []
    if name == "add_schedule":
        result = await core.write(
            "schedule",
            "schedules",
            "create",
            {
                "friend_id": friend_id,
                "title": str(arguments.get("title") or ""),
                "nature": "remind",
                "date_local": str(arguments.get("date_local") or ""),
                "time_local": arguments.get("time_local"),
                "advance_minutes": int(arguments.get("advance_minutes") or 0),
                "state": "pending",
                "owner": "user",
                "source": "model",
            },
        )
        record = result["record"]
        await schedule_event(core, friend_id, record["id"], "create", after=record, actor="agent")
        return record, []
    if name == "list_schedules":
        result = await core.read(
            "schedule",
            "schedules",
            filter={"friend_id": friend_id},
            limit=500,
        )
        items = sorted(
            result.get("items", []),
            key=lambda item: (item.get("date_local", ""), item.get("time_local") or ""),
        )
        return {"items": items}, []
    if name == "update_schedule":
        schedule_id = str(arguments.get("schedule_id") or "")
        before_result = await core.read(
            "schedule",
            "schedules",
            filter={"id": schedule_id},
            limit=1,
        )
        if not before_result.get("items"):
            raise ValueError("schedule not found")
        before = before_result["items"][0]
        if before.get("friend_id") != friend_id:
            raise ValueError("schedule not found")
        patch = {
            key: arguments[key]
            for key in (
                "title",
                "date_local",
                "time_local",
                "advance_minutes",
                "state",
            )
            if key in arguments
        }
        result = await core.write(
            "schedule",
            "schedules",
            "update",
            {"id": schedule_id, **patch},
        )
        record = result["record"]
        await schedule_event(core, friend_id, schedule_id, "update", before, record, actor="agent")
        return record, []
    if name == "remove_schedule":
        schedule_id = str(arguments.get("schedule_id") or "")
        before_result = await core.read(
            "schedule",
            "schedules",
            filter={"id": schedule_id},
            limit=1,
        )
        if not before_result.get("items"):
            raise ValueError("schedule not found")
        before = before_result["items"][0]
        if before.get("friend_id") != friend_id:
            raise ValueError("schedule not found")
        await core.write("schedule", "schedules", "delete", {"id": schedule_id})
        await schedule_event(core, friend_id, schedule_id, "delete", before, actor="agent")
        return {"id": schedule_id, "deleted": True}, []
    if name == "save_thought":
        result = await core.write(
            "thought",
            "thoughts",
            "create",
            {
                "friend_id": friend_id,
                "content": str(arguments.get("content") or ""),
                "kind": str(arguments.get("kind") or "casual"),
                "due_at": arguments.get("due_at"),
                "state": "pending",
                "source": "model",
            },
        )
        return result["record"], []
    if name == "list_thoughts":
        result = await core.read(
            "thought",
            "thoughts",
            filter={"friend_id": friend_id},
            limit=200,
        )
        items = sorted(
            result.get("items", []),
            key=lambda item: item.get("created_at", ""),
            reverse=True,
        )
        return {"items": items}, []
    if name == "finish_thought":
        thought_id = str(arguments.get("thought_id") or "")
        before_result = await core.read(
            "thought",
            "thoughts",
            filter={"id": thought_id},
            limit=1,
        )
        if not before_result.get("items") or before_result["items"][0].get("friend_id") != friend_id:
            raise ValueError("thought not found")
        result = await core.write(
            "thought",
            "thoughts",
            "update",
            {"id": thought_id, "state": "done", "said_at": datetime.now().astimezone().isoformat()},
        )
        return result["record"], []
    if name == "draw_image":
        asset = await generate_image_asset(core, str(arguments.get("prompt") or ""))
        return {"asset_id": asset["id"]}, []
    if name == "look_image":
        asset_id = str(arguments.get("asset_id") or "")
        if asset_id and not await image_asset_belongs(core, friend_id, asset_id):
            raise ValueError("image not found")
        if not asset_id:
            messages = await core.read(
                "chat",
                "messages",
                filter={"friend_id": friend_id},
                limit=200,
            )
            for message in sorted(
                messages.get("items", []),
                key=lambda item: item.get("created_at", ""),
                reverse=True,
            ):
                assets = await core.read(
                    "chat",
                    "message_assets",
                    filter={"message_id": message["id"]},
                    limit=20,
                )
                image = next(
                    (
                        item["asset_id"]
                        for item in assets.get("items", [])
                        if item.get("role") == "image"
                    ),
                    None,
                )
                if image:
                    asset_id = image
                    break
        if not asset_id:
            raise ValueError("image not found")
        return {"asset_id": asset_id, "description": ""}, []
    raise ValueError(f"unknown tool: {name}")


@router.post("/friends/{friend_id}/screen")
async def screen(_: Request, friend_id: str) -> dict[str, Any]:
    asset = capture_screen_asset()
    return {"asset_id": asset["id"], "description": ""}


@router.get("/files")
async def list_files(_: Request, path: str = "") -> dict[str, Any]:
    target = safe_path(path)
    if not target.exists():
        raise HTTPException(status_code=404, detail="path not found")
    if target.is_file():
        return {
            "items": [
                {
                    "name": target.name,
                    "path": str(target.relative_to(WORKSPACE)),
                    "is_dir": False,
                    "size": target.stat().st_size,
                }
            ]
        }
    items = []
    for child in sorted(target.iterdir(), key=lambda item: (item.is_file(), item.name)):
        items.append(
            {
                "name": child.name,
                "path": str(child.relative_to(WORKSPACE)),
                "is_dir": child.is_dir(),
                "size": child.stat().st_size if child.is_file() else 0,
            }
        )
    return {"items": items}


@router.get("/files/content")
async def read_file(_: Request, path: str) -> dict[str, Any]:
    target = safe_path(path)
    if not target.is_file():
        raise HTTPException(status_code=404, detail="file not found")
    return {"path": path, "content": target.read_text(encoding="utf-8", errors="ignore")}


@router.put("/files/content")
async def write_file(_: Request, body: FileWriteBody) -> dict[str, Any]:
    target = safe_path(body.path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(body.content, encoding="utf-8")
    return {"path": body.path, "content": body.content}


@router.post("/files/move")
async def move_file(_: Request, body: FileMoveBody) -> dict[str, Any]:
    source = safe_path(body.src)
    destination = safe_path(body.dst)
    if not source.exists():
        raise HTTPException(status_code=404, detail="source not found")
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(source), str(destination))
    return {"src": body.src, "dst": body.dst}


@router.delete("/files")
async def delete_file(_: Request, path: str) -> dict[str, Any]:
    target = safe_path(path)
    if not target.exists():
        raise HTTPException(status_code=404, detail="path not found")
    if target.is_dir():
        shutil.rmtree(target)
    else:
        target.unlink()
    return {"path": path}
