from __future__ import annotations

import asyncio
from typing import Any

import httpx


class CoreClient:
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.http = httpx.AsyncClient(timeout=60)

    async def wait_ready(self, seconds: float = 20) -> None:
        deadline = asyncio.get_running_loop().time() + seconds
        while True:
            try:
                response = await self.http.get(f"{self.base_url}/modules")
                if response.status_code == 200:
                    return
            except httpx.HTTPError:
                pass
            if asyncio.get_running_loop().time() >= deadline:
                raise RuntimeError("yumeCore 未就绪")
            await asyncio.sleep(0.2)

    async def read(
        self,
        module_id: str,
        entity: str,
        filter: dict[str, Any] | None = None,
        limit: int = 100,
    ) -> dict[str, Any]:
        response = await self.http.post(
            f"{self.base_url}/read",
            json={
                "module_id": module_id,
                "entity": entity,
                "filter": filter or {},
                "limit": limit,
            },
        )
        response.raise_for_status()
        return response.json()

    async def write(
        self,
        module_id: str,
        entity: str,
        op: str,
        data: dict[str, Any],
    ) -> dict[str, Any]:
        response = await self.http.post(
            f"{self.base_url}/write",
            json={
                "module_id": module_id,
                "entity": entity,
                "op": op,
                "data": data,
            },
        )
        response.raise_for_status()
        return response.json()

    async def devices(self) -> list[dict[str, Any]]:
        response = await self.http.get(f"{self.base_url}/devices")
        response.raise_for_status()
        return response.json()

    async def peers(self) -> list[dict[str, Any]]:
        response = await self.http.get(f"{self.base_url}/peers")
        response.raise_for_status()
        return response.json()

    async def pair(self, device_id: str) -> dict[str, Any]:
        response = await self.http.post(
            f"{self.base_url}/pair",
            json={"device_id": device_id},
        )
        response.raise_for_status()
        return response.json()

    async def pair_address(self, host: str, port: int) -> dict[str, Any]:
        response = await self.http.post(
            f"{self.base_url}/pair/address",
            json={"host": host, "port": port},
        )
        response.raise_for_status()
        return response.json()

    async def grant(self, peer_id: str, module_id: str, permission: str) -> None:
        response = await self.http.post(
            f"{self.base_url}/peers/{peer_id}/grant",
            json={"module_id": module_id, "resource_id": None, "permission": permission},
        )
        response.raise_for_status()

    async def grants(self, peer_id: str) -> list[dict[str, Any]]:
        response = await self.http.get(f"{self.base_url}/peers/{peer_id}/grants")
        response.raise_for_status()
        return response.json()

    async def revoke_grant(self, peer_id: str, module_id: str) -> None:
        response = await self.http.post(
            f"{self.base_url}/peers/{peer_id}/revoke",
            json={"module_id": module_id, "resource_id": None, "permission": "write"},
        )
        response.raise_for_status()

    async def sync_run(self, channel: str, peer_id: str | None, direction: str) -> dict[str, Any]:
        response = await self.http.post(
            f"{self.base_url}/sync/run",
            json={"channel": channel, "peer_id": peer_id, "direction": direction},
            timeout=120,
        )
        response.raise_for_status()
        return response.json()

    async def sync_conflicts(self) -> list[dict[str, Any]]:
        response = await self.http.get(f"{self.base_url}/sync/conflicts")
        response.raise_for_status()
        return response.json()

    async def close(self) -> None:
        await self.http.aclose()
