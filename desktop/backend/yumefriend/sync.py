from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter(prefix="/api/v1")


class SyncPairRequest(BaseModel):
    device_id: str


class SyncPairAddressRequest(BaseModel):
    host: str
    port: int


class SyncGrantRequest(BaseModel):
    module_id: str
    permission: str = "write"


class SyncRunRequest(BaseModel):
    channel: str = "lan"
    peer_id: str | None = None
    direction: str = "both"


def core(request: Request):
    return request.app.state.core


@router.get("/sync/devices")
async def devices(request: Request) -> list[dict[str, Any]]:
    return await core(request).devices()


@router.get("/sync/peers")
async def peers(request: Request) -> list[dict[str, Any]]:
    return await core(request).peers()


@router.post("/sync/pair")
async def pair(request: Request, draft: SyncPairRequest) -> dict[str, Any]:
    return await core(request).pair(draft.device_id)


@router.post("/sync/pair-address")
async def pair_address(request: Request, draft: SyncPairAddressRequest) -> dict[str, Any]:
    return await core(request).pair_address(draft.host, draft.port)


@router.post("/sync/peers/{peer_id}/grant")
async def grant(request: Request, peer_id: str, draft: SyncGrantRequest) -> dict[str, bool]:
    await core(request).grant(peer_id, draft.module_id, draft.permission)
    return {"ok": True}


@router.get("/sync/peers/{peer_id}/grants")
async def grants(request: Request, peer_id: str) -> list[dict[str, Any]]:
    return await core(request).grants(peer_id)


@router.post("/sync/peers/{peer_id}/revoke")
async def revoke(request: Request, peer_id: str, draft: SyncGrantRequest) -> dict[str, bool]:
    await core(request).revoke_grant(peer_id, draft.module_id)
    return {"ok": True}


@router.post("/sync/run")
async def run(request: Request, draft: SyncRunRequest) -> dict[str, Any]:
    return await core(request).sync_run(draft.channel, draft.peer_id, draft.direction)


@router.get("/sync/conflicts")
async def conflicts(request: Request) -> list[dict[str, Any]]:
    return await core(request).sync_conflicts()
