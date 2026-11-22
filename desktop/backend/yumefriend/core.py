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

    async def close(self) -> None:
        await self.http.aclose()
