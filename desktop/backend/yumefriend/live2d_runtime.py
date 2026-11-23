from __future__ import annotations

import json
import os
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter
from fastapi.responses import FileResponse, StreamingResponse

router = APIRouter(prefix="/api/v1/live2d/runtime")

PRODUCT_ROOT = Path(__file__).resolve().parents[3]
RUNTIME_DIR = PRODUCT_ROOT / "user_data" / "live2d" / "runtime"
RUNTIME_FILE = RUNTIME_DIR / "live2dcubismcore.min.js"
CORE_URL = "https://cubism.live2d.com/sdk-web/core/live2dcubismcore.min.js"
PROPRIETARY_LICENSE = (
    "https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html"
)
OPEN_LICENSE = (
    "https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html"
)


@router.get("/status")
def status() -> dict[str, Any]:
    available = RUNTIME_FILE.is_file() and RUNTIME_FILE.stat().st_size > 32 * 1024
    return {
        "available": available,
        "size": RUNTIME_FILE.stat().st_size if available else None,
        "license_urls": {
            "proprietary": PROPRIETARY_LICENSE,
            "open": OPEN_LICENSE,
        },
    }


@router.get("/core.js")
def core() -> FileResponse:
    return FileResponse(RUNTIME_FILE, media_type="application/javascript")


@router.post("/download")
def download() -> StreamingResponse:
    return StreamingResponse(stream_download(), media_type="application/x-ndjson")


async def stream_download() -> AsyncIterator[str]:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    temp = RUNTIME_FILE.with_suffix(".part")
    temp.unlink(missing_ok=True)
    received = 0
    try:
        async with (
            httpx.AsyncClient(timeout=60, follow_redirects=True) as client,
            client.stream("GET", CORE_URL) as response,
        ):
            response.raise_for_status()
            total = int(response.headers.get("content-length") or 0)
            with temp.open("wb") as handle:
                async for chunk in response.aiter_bytes(64 * 1024):
                    received += len(chunk)
                    handle.write(chunk)
                    yield json.dumps(
                        {"type": "progress", "received": received, "total": total}
                    ) + "\n"
        if received < 32 * 1024 or b"Live2D Cubism Core" not in temp.read_bytes()[:4096]:
            raise ValueError("下载内容不是有效的 Live2D 运行时")
        os.replace(temp, RUNTIME_FILE)
        yield json.dumps({"type": "done", "size": received}) + "\n"
    except Exception as error:  # noqa: BLE001
        temp.unlink(missing_ok=True)
        yield json.dumps({"type": "error", "message": str(error)}, ensure_ascii=False) + "\n"
