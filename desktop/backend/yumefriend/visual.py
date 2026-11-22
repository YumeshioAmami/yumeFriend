from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from yumefriend.core import CoreClient

router = APIRouter(prefix="/api/v1")


class VisualDraft(BaseModel):
    kind: str
    name: str
    manifest_json: str = "{}"
    preview_asset_id: str | None = None


def core(request: Request) -> CoreClient:
    return request.app.state.core


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
