from __future__ import annotations

import base64
import hashlib
import json
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

router = APIRouter(prefix="/api/v1")

PRODUCT_ROOT = Path(__file__).resolve().parents[3]
ASSET_ROOT = PRODUCT_ROOT / "user_data" / "assets"
INDEX_FILE = ASSET_ROOT / "index.json"


def load_index() -> dict[str, dict]:
    ASSET_ROOT.mkdir(parents=True, exist_ok=True)
    if not INDEX_FILE.exists():
        return {}
    return json.loads(INDEX_FILE.read_text(encoding="utf-8"))


def save_index(index: dict[str, dict]) -> None:
    INDEX_FILE.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")


def save_asset(data: bytes, mime: str, kind: str) -> dict:
    ASSET_ROOT.mkdir(parents=True, exist_ok=True)
    sha = hashlib.sha256(data).hexdigest()
    index = load_index()
    for asset_id, item in index.items():
        if item.get("sha256") == sha:
            return {"id": asset_id, **item}
    asset_id = str(uuid.uuid4())
    suffix = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
        "audio/mpeg": ".mp3",
        "audio/wav": ".wav",
    }.get(mime, ".bin")
    file_path = ASSET_ROOT / f"{asset_id}{suffix}"
    file_path.write_bytes(data)
    item = {
        "sha256": sha,
        "kind": kind,
        "mime": mime,
        "size": len(data),
        "path": file_path.name,
        "description": "",
    }
    index[asset_id] = item
    save_index(index)
    return {"id": asset_id, **item}


def get_asset(asset_id: str) -> tuple[dict, Path]:
    index = load_index()
    item = index.get(asset_id)
    if item is None:
        raise HTTPException(status_code=404, detail="asset not found")
    path = ASSET_ROOT / item["path"]
    if not path.exists():
        raise HTTPException(status_code=404, detail="asset file not found")
    return item, path


def asset_data_url(asset_id: str) -> str:
    item, path = get_asset(asset_id)
    data = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{item.get('mime', 'application/octet-stream')};base64,{data}"


@router.get("/assets/{asset_id}")
def asset_info(asset_id: str) -> dict:
    item, _ = get_asset(asset_id)
    return {"id": asset_id, **item}


@router.get("/assets/{asset_id}/content")
def asset_content(asset_id: str) -> FileResponse:
    item, path = get_asset(asset_id)
    return FileResponse(path, media_type=item.get("mime", "application/octet-stream"))


@router.post("/assets")
async def upload_asset(file: UploadFile = File(...)) -> dict:  # noqa: B008
    data = await file.read()
    mime = file.content_type or "application/octet-stream"
    kind = "image" if mime.startswith("image/") else "file"
    return save_asset(data, mime, kind)
