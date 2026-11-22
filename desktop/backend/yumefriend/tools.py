from __future__ import annotations

import io
import shutil
from pathlib import Path
from typing import Any

import httpx
from bs4 import BeautifulSoup
from fastapi import APIRouter, HTTPException, Request
from PIL import ImageGrab
from pydantic import BaseModel

from yumefriend.assets import save_asset

router = APIRouter(prefix="/api/v1")

PRODUCT_ROOT = Path(__file__).resolve().parents[3]
WORKSPACE = PRODUCT_ROOT / "user_data" / "workspace"


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
    async with httpx.AsyncClient(
        timeout=20,
        headers={"User-Agent": "Mozilla/5.0"},
    ) as client:
        response = await client.get(
            "https://www.bing.com/search",
            params={"q": body.query},
        )
        response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")
    items = []
    for result in soup.select("li.b_algo")[: max(1, body.limit)]:
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
    return {"items": items}


@router.post("/friends/{friend_id}/screen")
async def screen(_: Request, friend_id: str) -> dict[str, Any]:
    image = ImageGrab.grab()
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    asset = save_asset(buffer.getvalue(), "image/png", "image")
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
