from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel

from yumefriend.core import CoreClient

router = APIRouter(prefix="/api/v1")

PUBLIC_DIR = Path(__file__).resolve().parents[2] / "public"
PRODUCT_ROOT = Path(__file__).resolve().parents[3]
USER_LIVE2D_DIR = PRODUCT_ROOT / "user_data" / "live2d"
USER_MODEL_SETTINGS_DIR = PRODUCT_ROOT / "user_data" / "live2d" / "model_settings"

PARAM_RANGES: dict[str, tuple[float, float, float]] = {
    "ParamEyeLOpen": (0.0, 1.0, 1.0),
    "ParamEyeROpen": (0.0, 1.0, 1.0),
    "ParamMouthOpenY": (0.0, 1.0, 0.0),
    "ParamCheek": (0.0, 1.0, 0.0),
    "ParamBreath": (0.0, 1.0, 0.5),
    "ParamAngleX": (-30.0, 30.0, 0.0),
    "ParamAngleY": (-30.0, 30.0, 0.0),
    "ParamAngleZ": (-30.0, 30.0, 0.0),
    "ParamBodyAngleX": (-10.0, 10.0, 0.0),
    "ParamBodyAngleY": (-10.0, 10.0, 0.0),
    "ParamBodyAngleZ": (-10.0, 10.0, 0.0),
}


class VisualDraft(BaseModel):
    kind: str
    name: str
    manifest_json: str = "{}"
    preview_asset_id: str | None = None


class Live2DSettingsDraft(BaseModel):
    settings: dict[str, Any]


def core(request: Request) -> CoreClient:
    return request.app.state.core


def resolve_public_path(model_url: str) -> Path | None:
    raw = model_url.removeprefix("./").lstrip("/")
    path = (PUBLIC_DIR / raw).resolve()
    if PUBLIC_DIR.resolve() not in path.parents or not path.exists():
        return None
    return path


def model_id_for_url(model_url: str) -> str | None:
    path = resolve_public_path(model_url)
    if path is None:
        return None
    return model_id_for_file(path)


def model_id_for_file(path: Path) -> str | None:
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


def iter_model_files() -> list[Path]:
    roots = (PUBLIC_DIR / "live2d", USER_LIVE2D_DIR)
    found = []
    for root in roots:
        if not root.is_dir():
            continue
        found.extend(
            path
            for path in root.rglob("*.model3.json")
            if not path.name.startswith("_")
            and "model_settings" not in path.parts
            and "runtime" not in path.parts
        )
    return sorted(found)


def unique_models() -> list[tuple[str, Path]]:
    result = []
    seen = set()
    for path in iter_model_files():
        model_id = model_id_for_file(path)
        if model_id is None or model_id in seen:
            continue
        seen.add(model_id)
        result.append((model_id, path))
    return result


def model_url_for_file(path: Path, request: Request) -> str:
    if PUBLIC_DIR.resolve() in path.resolve().parents:
        return public_model_url(path)
    model_id = model_id_for_file(path)
    return (
        str(request.base_url).rstrip("/")
        + f"/api/v1/live2d/models/{model_id}/files/{quote(path.name)}"
    )


def settings_for_model_file(path: Path) -> dict[str, Any] | None:
    model_id = model_id_for_file(path)
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


def portrait_expressions(manifest: dict[str, Any]) -> dict[str, str]:
    directory = str(manifest.get("directory") or "")
    if not directory:
        return dict(manifest.get("expressions") or {})
    root = resolve_public_path(directory)
    if root is None or not root.is_dir():
        return {}
    result = {}
    for path in sorted(root.iterdir()):
        if not path.is_file() or path.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
            continue
        result[path.stem] = public_model_url(path)
    return result


def labels_for_pack(pack: dict[str, Any] | None) -> tuple[list[str], str | None]:
    if not pack:
        return [], None
    try:
        manifest = json.loads(pack.get("manifest_json") or "{}")
    except json.JSONDecodeError:
        return [], None
    if pack.get("kind") == "portrait":
        labels = list(portrait_expressions(manifest).keys())
    else:
        model_id = str(manifest.get("model_id") or "")
        model_path = model_file_by_id(model_id) if model_id else None
        if model_path is None:
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
    for current_id, path in unique_models():
        if current_id == model_id:
            return path
    return None


@router.get("/visual-packs")
async def list_packs(request: Request) -> dict[str, Any]:
    result = await core(request).read("visual", "visual_packs", limit=200)
    items = []
    for item in result.get("items", []):
        if item.get("kind") != "portrait":
            items.append(item)
            continue
        try:
            manifest = json.loads(item.get("manifest_json") or "{}")
        except json.JSONDecodeError:
            items.append(item)
            continue
        expressions = portrait_expressions(manifest)
        if expressions:
            manifest["expressions"] = expressions
            manifest["preview_url"] = expressions.get("正常") or next(iter(expressions.values()))
            item = {**item, "manifest_json": json.dumps(manifest, ensure_ascii=False)}
        items.append(item)
    return {"items": items, "next_cursor": None}


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
async def list_live2d_models(request: Request) -> dict[str, Any]:
    client = core(request)
    friends = (await client.read("friend", "friends", limit=500)).get("items", [])
    packs = (await client.read("visual", "visual_packs", limit=500)).get("items", [])
    pack_owners: dict[str, list[str]] = {}
    for friend in friends:
        if friend.get("visual_pack_id"):
            pack_owners.setdefault(str(friend["visual_pack_id"]), []).append(
                str(friend.get("name") or "")
            )
    model_owners: dict[str, list[str]] = {}
    for pack in packs:
        if pack.get("kind") != "live2d":
            continue
        try:
            manifest = json.loads(pack.get("manifest_json") or "{}")
        except json.JSONDecodeError:
            continue
        model_id = str(manifest.get("model_id") or "")
        if not model_id and manifest.get("model_url"):
            model_id = model_id_for_url(str(manifest["model_url"])) or ""
        if model_id:
            model_owners[model_id] = pack_owners.get(str(pack.get("id")), [])

    items = []
    for model_id, path in unique_models():
        settings = settings_for_model_file(path)
        items.append(
            {
                "id": model_id,
                "name": (settings or {}).get("display_name") or path.stem,
                "model_url": model_url_for_file(path, request),
                "used_by": sorted(set(model_owners.get(model_id, []))),
                "source": "bundled" if PUBLIC_DIR.resolve() in path.resolve().parents else "user_data",
                "has_settings": settings is not None,
                "is_default": path.parent.name == "yui",
            }
        )
    return {"items": items}


@router.get("/live2d/models/{model_id}/settings")
async def get_live2d_settings(request: Request, model_id: str) -> dict[str, Any]:
    path = model_file_by_id(model_id)
    if path is None:
        raise HTTPException(status_code=404, detail="model not found")
    settings = settings_for_model_file(path)
    if settings is None:
        raise HTTPException(status_code=404, detail="model settings not found")
    model_data = json.loads(path.read_text(encoding="utf-8"))
    refs = model_data.get("FileReferences") or {}
    expressions = []
    for item in refs.get("Expressions", []):
        params = []
        expression_file = path.parent / str(item.get("File") or "")
        if expression_file.is_file():
            try:
                expression = json.loads(expression_file.read_text(encoding="utf-8"))
                params = [
                    {
                        "id": op.get("Id", ""),
                        "value": op.get("Value", 0),
                        "blend": op.get("Blend", "Add"),
                    }
                    for op in expression.get("Parameters", [])
                ]
            except json.JSONDecodeError:
                params = []
        expressions.append(
            {
                "name": item.get("Name", ""),
                "file": item.get("File", ""),
                "params": params,
            }
        )
    parameters = []
    display_info = refs.get("DisplayInfo")
    if display_info:
        cdi_path = path.parent / display_info
        if cdi_path.is_file():
            cdi = json.loads(cdi_path.read_text(encoding="utf-8"))
            base = settings.get("base") or {}
            parameters = [
                {
                    "id": item.get("Id", ""),
                    "name": item.get("Name", ""),
                    "group_id": item.get("GroupId", ""),
                    "min": PARAM_RANGES.get(item.get("Id", ""), (-1.0, 1.0, 0.0))[0],
                    "max": PARAM_RANGES.get(item.get("Id", ""), (-1.0, 1.0, 0.0))[1],
                    "default": base.get(
                        item.get("Id", ""),
                        PARAM_RANGES.get(item.get("Id", ""), (-1.0, 1.0, 0.0))[2],
                    ),
                }
                for item in cdi.get("Parameters", [])
            ]
    return {
        "model": {"id": model_id, "model_url": model_url_for_file(path, request)},
        "settings": settings,
        "expressions": expressions,
        "parameters": parameters,
    }


@router.get("/live2d/models/{model_id}/files/{file_path:path}")
async def get_live2d_model_file(model_id: str, file_path: str) -> FileResponse:
    model_file = model_file_by_id(model_id)
    if model_file is None:
        raise HTTPException(status_code=404, detail="model not found")
    root = model_file.parent.resolve()
    target = (root / file_path).resolve()
    if root not in target.parents or not target.is_file():
        raise HTTPException(status_code=404, detail="file not found")
    return FileResponse(target)


@router.put("/live2d/models/{model_id}/settings")
async def save_live2d_settings(
    model_id: str,
    draft: Live2DSettingsDraft,
) -> dict[str, Any]:
    path = model_file_by_id(model_id)
    if path is None:
        raise HTTPException(status_code=404, detail="model not found")
    settings = draft.settings
    labels = settings.get("labels") or []
    names = {str(item.get("name")) for item in labels if item.get("name")}
    if not names or settings.get("default_label") not in names:
        raise HTTPException(status_code=400, detail="default label is required")
    USER_MODEL_SETTINGS_DIR.mkdir(parents=True, exist_ok=True)
    target = USER_MODEL_SETTINGS_DIR / f"{model_id}.json"
    target.write_text(
        json.dumps(settings, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return {"settings": settings}
