from __future__ import annotations

import io
from pathlib import Path
from typing import Any

from docx import Document as DocxDocument
from fastapi import APIRouter, File, HTTPException, Request, Response, UploadFile
from pydantic import BaseModel
from pypdf import PdfReader

from yumefriend.core import CoreClient

router = APIRouter(prefix="/api/v1")


class SearchBody(BaseModel):
    query: str
    limit: int = 10


def core(request: Request) -> CoreClient:
    return request.app.state.core


def chunk_text(text: str, size: int = 800, overlap: int = 100) -> list[str]:
    if not text:
        return []
    chunks = []
    step = size - overlap
    for start in range(0, len(text), step):
        chunk = text[start : start + size]
        if chunk.strip():
            chunks.append(chunk)
        if start + size >= len(text):
            break
    return chunks


def extract_text(name: str, data: bytes) -> tuple[str, str]:
    suffix = Path(name).suffix.lower()
    if suffix in {".txt", ".md", ".json", ".csv"}:
        return suffix.lstrip("."), data.decode("utf-8", errors="ignore")
    if suffix == ".pdf":
        reader = PdfReader(io.BytesIO(data))
        return "pdf", "\n".join(page.extract_text() or "" for page in reader.pages)
    if suffix == ".docx":
        document = DocxDocument(io.BytesIO(data))
        return "docx", "\n".join(paragraph.text for paragraph in document.paragraphs)
    if suffix in {".png", ".jpg", ".jpeg", ".webp"}:
        return "image", ""
    raise HTTPException(status_code=400, detail="unsupported document type")


async def read_doc(client: CoreClient, document_id: str) -> dict[str, Any]:
    result = await client.read("document", "documents", filter={"id": document_id}, limit=1)
    if not result.get("items"):
        raise HTTPException(status_code=404, detail="document not found")
    return result["items"][0]


async def write_chunks(client: CoreClient, document: dict[str, Any], text: str) -> None:
    chunks = chunk_text(text)
    existing = await client.read(
        "document",
        "document_chunks",
        filter={"document_id": document["id"]},
        limit=500,
    )
    by_seq = {int(item["seq"]): item for item in existing.get("items", [])}
    for seq, chunk in enumerate(chunks):
        data = {
            "document_id": document["id"],
            "friend_id": document["friend_id"],
            "seq": seq,
            "text": chunk,
        }
        if seq in by_seq:
            await client.write("document", "document_chunks", "update", data)
        else:
            await client.write("document", "document_chunks", "create", data)
    for seq in by_seq:
        if seq >= len(chunks):
            await client.write("document", "document_chunks", "update", {
                "document_id": document["id"],
                "seq": seq,
                "text": "",
            })


@router.get("/friends/{friend_id}/documents")
async def list_documents(request: Request, friend_id: str) -> dict[str, Any]:
    result = await core(request).read(
        "document",
        "documents",
        filter={"friend_id": friend_id},
        limit=200,
    )
    items = sorted(result.get("items", []), key=lambda item: item.get("created_at", ""), reverse=True)
    return {"items": items, "next_cursor": None}


@router.post("/friends/{friend_id}/documents")
async def upload_document(
    request: Request,
    friend_id: str,
    file: UploadFile = File(...),  # noqa: B008
) -> dict[str, Any]:
    client = core(request)
    data = await file.read()
    kind, text = extract_text(file.filename or "upload", data)
    result = await client.write(
        "document",
        "documents",
        "create",
        {
            "friend_id": friend_id,
            "name": file.filename or "upload",
            "kind": kind,
            "chars": len(text),
            "text": text,
            "status": "ready",
        },
    )
    document = result["record"]
    await write_chunks(client, document, text)
    return document


@router.get("/documents/{document_id}")
async def get_document(request: Request, document_id: str) -> dict[str, Any]:
    return await read_doc(core(request), document_id)


@router.delete("/documents/{document_id}", status_code=204)
async def delete_document(request: Request, document_id: str) -> Response:
    client = core(request)
    await read_doc(client, document_id)
    await client.write("document", "documents", "delete", {"id": document_id})
    return Response(status_code=204)


@router.get("/documents/{document_id}/chunks")
async def get_chunks(request: Request, document_id: str) -> dict[str, Any]:
    result = await core(request).read(
        "document",
        "document_chunks",
        filter={"document_id": document_id},
        limit=500,
    )
    items = sorted(result.get("items", []), key=lambda item: int(item.get("seq", 0)))
    return {"items": items, "next_cursor": None}


@router.post("/documents/{document_id}/reindex")
async def reindex(request: Request, document_id: str) -> dict[str, Any]:
    client = core(request)
    document = await read_doc(client, document_id)
    await write_chunks(client, document, document.get("text") or "")
    return document


@router.post("/friends/{friend_id}/documents/search")
async def search_documents(
    request: Request,
    friend_id: str,
    body: SearchBody,
) -> dict[str, Any]:
    result = await core(request).read(
        "document",
        "document_chunks",
        filter={"friend_id": friend_id},
        limit=500,
    )
    query = body.query.casefold()
    items = [
        item
        for item in result.get("items", [])
        if query in item.get("text", "").casefold()
    ][: max(1, body.limit)]
    return {"items": items, "next_cursor": None}
