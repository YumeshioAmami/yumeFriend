from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from yumefriend.core import CoreClient

router = APIRouter(prefix="/api/v1")

PUBLIC_DIR = Path(__file__).resolve().parents[2] / "public"
PRODUCT_ROOT = Path(__file__).resolve().parents[3]
USER_MODEL_SETTINGS_DIR = PRODUCT_ROOT / "user_data" / "live2d" / "model_settings"


class VisualDraft(BaseModel):
    kind: str
    name: str
    manifest_json: str = "{}"
    preview_asset_id: str | None = None


def core(request: Request) -> CoreClient:
    return request.app.state.core


def resolve_public_path(model_url: str) -> Path | None:
    raw = model_url.removeprefix("./").lstrip("/")
    path = (PUBLIC_DIR / raw).resolve()
    if PUBLIC_DIR.resolve() not in path.parents or not path.is_file():
        return None
    return path


def model_id_for_url(model_url: str) -> str | None:
    path = resolve_public_path(model_url)
    if path is None:
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        moc = path.parent / data["FileReferences"]["Moc"]
        return hashlib.sha256(moc.read_bytes()).hexdigest()[:16]
    except (KeyError, OSError, json.JSONDecodeError):
        return None


def public_model_url(path: Path) -> str:
    return "./" + path.relative_to(PUBLIC_DIR).as_posix()


def iter_public_models() -> list[Path]:
    root = PUBLIC_DIR / "live2d"
    if not root.is_dir():
        return []
    return sorted(
        path
        for path in root.rglob("*.model3.json")
        if not path.name.startswith("_")
    )


def settings_for_model_file(path: Path) -> dict[str, Any] | None:
    model_id = model_id_for_url(public_model_url(path))
    if model_id is None:
        return None
    user_path = USER_MODEL_SETTINGS_DIR / f"{model_id}.json"
    bundled_path = path.parent / "model_settings.json"
    for candidate in (user_path, bundled_path):
        if candidate.is_file():
            try:
                return json.loads(candidate.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                return None
    return None


def labels_for_pack(pack: dict[str, Any] | None) -> tuple[list[str], str | None]:
    if not pack:
        return [], None
    try:
        manifest = json.loads(pack.get("manifest_json") or "{}")
    except json.JSONDecodeError:
        return [], None
    if pack.get("kind") == "portrait":
        labels = list((manifest.get("expressions") or {}).keys())
    else:
        model_url = str(manifest.get("model_url") or "")
        model_path = resolve_public_path(model_url) if model_url else None
        settings = settings_for_model_file(model_path) if model_path else None
        labels = [
            str(item.get("name"))
            for item in (settings or {}).get("labels", [])
            if item.get("name")
        ]
        if settings and settings.get("default_label") in labels:
            return labels, str(settings["default_label"])
    if not labels:
        return [], None
    default_label = "正常" if "正常" in labels else labels[0]
    return labels, default_label


def model_file_by_id(model_id: str) -> Path | None:
    for path in iter_public_models():
        if model_id_for_url(public_model_url(path)) == model_id:
            return path
    return None


@router.get("/visual-packs")
async def list_packs(request: Request) -> dict[str, Any]:
    result = await core(request).read("visual", "visual_packs", limit=200)
    return {"items": result.get("items", []), "next_cursor": None}


@router.post("/visual-packs")
async def create_pack(request: Request, draft: VisualDraft) -> dict[str, Any]:
    result = await core(request).write(
        "visual",
        "visual_packs",
        "create",
        {
            "kind": draft.kind,
            "name": draft.name,
            "manifest_json": draft.manifest_json,
            "preview_asset_id": draft.preview_asset_id,
        },
    )
    return result["record"]


@router.delete("/visual-packs/{pack_id}", status_code=204)
async def delete_pack(request: Request, pack_id: str) -> Response:
    client = core(request)
    result = await client.read(
        "visual",
        "visual_packs",
        filter={"id": pack_id},
        limit=1,
    )
    if not result.get("items"):
        raise HTTPException(status_code=404, detail="pack not found")
    await client.write("visual", "visual_packs", "delete", {"id": pack_id})
    return Response(status_code=204)


@router.get("/live2d/models")
async def list_live2d_models() -> dict[str, Any]:
    items = []
    for path in iter_public_models():
        model_id = model_id_for_url(public_model_url(path))
        if model_id is None:
            continue
        settings = settings_for_model_file(path)
        items.append(
            {
                "id": model_id,
                "name": (settings or {}).get("display_name") or path.stem,
                "model_url": public_model_url(path),
                "has_settings": settings is not None,
                "is_default": path.parent.name == "yui",
            }
        )
    return {"items": items}


@router.get("/live2d/models/{model_id}/settings")
async def get_live2d_settings(model_id: str) -> dict[str, Any]:
    path = model_file_by_id(model_id)
    if path is None:
        raise HTTPException(status_code=404, detail="model not found")
    settings = settings_for_model_file(path)
    if settings is None:
        raise HTTPException(status_code=404, detail="model settings not found")
    model_data = json.loads(path.read_text(encoding="utf-8"))
    refs = model_data.get("FileReferences") or {}
    expressions = [
        {"name": item.get("Name", ""), "file": item.get("File", "")}
        for item in refs.get("Expressions", [])
    ]
    parameters = []
    display_info = refs.get("DisplayInfo")
    if display_info:
        cdi_path = path.parent / display_info
        if cdi_path.is_file():
            cdi = json.loads(cdi_path.read_text(encoding="utf-8"))
            parameters = [
                {
                    "id": item.get("Id", ""),
                    "name": item.get("Name", ""),
                    "group_id": item.get("GroupId", ""),
                }
                for item in cdi.get("Parameters", [])
            ]
    return {
        "model": {"id": model_id, "model_url": public_model_url(path)},
        "settings": settings,
        "expressions": expressions,
        "parameters": parameters,
    }
