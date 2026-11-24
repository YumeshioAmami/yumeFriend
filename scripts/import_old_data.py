from __future__ import annotations

import asyncio
import json
import mimetypes
import sqlite3
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "desktop" / "backend"
sys.path.insert(0, str(BACKEND))

from yumefriend.assets import save_asset
from yumefriend.core import CoreClient

OLD_USER = Path(r"E:\Projects\yumeFriend-old\user_data")
NEW_USER = ROOT / "user_data"
OLD_DB = OLD_USER / "yumefriend.db"
CORE_URL = "http://127.0.0.1:47895/core/v1"


def json_text(value: Any, default: Any) -> str:
    if value is None:
        return json.dumps(default, ensure_ascii=False)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return json.dumps(default, ensure_ascii=False)
        try:
            return json.dumps(json.loads(text), ensure_ascii=False)
        except json.JSONDecodeError:
            return json.dumps(value, ensure_ascii=False)
    return json.dumps(value, ensure_ascii=False)


def mime_for(path: Path) -> str:
    return mimetypes.guess_type(str(path))[0] or "application/octet-stream"


def backup_target() -> Path:
    backup_dir = NEW_USER / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup = backup_dir / f"yumefriend-before-old-import-{datetime.now():%Y%m%d-%H%M%S}.db"
    source = sqlite3.connect(NEW_USER / "yumefriend.db")
    target = sqlite3.connect(backup)
    try:
        source.backup(target)
    finally:
        target.close()
        source.close()
    return backup


async def main() -> None:
    backup = backup_target()
    print(f"backup: {backup}")

    old = sqlite3.connect(OLD_DB)
    old.row_factory = sqlite3.Row
    core = CoreClient(CORE_URL)
    await core.wait_ready()

    asset_cache: dict[str, str] = {}

    def import_asset(relative: str | None, kind: str) -> str | None:
        if not relative:
            return None
        if relative in asset_cache:
            return asset_cache[relative]
        path = OLD_USER / relative
        if not path.is_file():
            return None
        asset = save_asset(path.read_bytes(), mime_for(path), kind)
        asset_cache[relative] = asset["id"]
        return asset["id"]

    async def existing(module_id: str, entity: str, keys: tuple[str, ...]) -> set[Any]:
        result = await core.read(module_id, entity, limit=100000)
        values: set[Any] = set()
        for item in result.get("items", []):
            parsed = tuple(item.get(key) for key in keys)
            values.add(parsed[0] if len(parsed) == 1 else parsed)
        return values

    async def create(
        module_id: str,
        entity: str,
        key: str | tuple[str, ...],
        data: dict[str, Any],
        seen: set[Any],
    ) -> bool:
        keys = (key,) if isinstance(key, str) else key
        value = tuple(data.get(item) for item in keys)
        identity = value[0] if len(value) == 1 else value
        if identity in seen:
            return False
        await core.write(module_id, entity, "create", data)
        seen.add(identity)
        return True

    voices_seen = await existing("voice", "voices", ("id",))
    for row in old.execute("select * from voices"):
        config = {
            "gpt_weights_path": row["gpt_weights_path"],
            "sovits_weights_path": row["sovits_weights_path"],
            "ref_audio_path": row["ref_audio_path"],
            "prompt_text": row["prompt_text"],
        }
        await create(
            "voice",
            "voices",
            "id",
            {
                "id": row["id"],
                "name": row["name"],
                "provider": "gpt_sovits",
                "config_json": json.dumps(config, ensure_ascii=False),
                "speed": row["speed"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
            },
            voices_seen,
        )

    packs = await core.read("visual", "visual_packs", limit=100)
    yui = next((item for item in packs.get("items", []) if item.get("name") == "YUI"), None)
    yui_id = yui["id"] if yui else None

    friends = list(old.execute("select * from friends where deleted_at is null"))
    friends_seen = await existing("friend", "friends", ("id",))
    friend_by_id = {row["id"]: row for row in friends}
    for row in friends:
        await create(
            "friend",
            "friends",
            "id",
            {
                "id": row["id"],
                "name": row["name"],
                "personality": row["personality"] or "",
                "custom_instructions": row["custom_instructions"] or "",
                "avatar_asset_id": import_asset(row["avatar_path"], "image"),
                "avatar_description": row["avatar_description"],
                "voice_id": row["voice_id"],
                "voice_reply_enabled": row["voice_reply_enabled"],
                "presence": row["presence"],
                "visual_mode": row["visual_mode"] or "live2d",
                "visual_pack_id": yui_id,
                "portrait_transform_json": row["portrait_transform"],
                "temperature": row["temperature"],
                "life_enabled": row["life_enabled"],
                "chat_pacing_enabled": row["chat_pacing_enabled"],
                "humanizer_enabled": row["humanizer_enabled"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
            },
            friends_seen,
        )

    states_seen = await existing("friend", "friend_states", ("friend_id",))
    for row in old.execute("select * from friend_states"):
        friend = friend_by_id.get(row["friend_id"])
        await create(
            "friend",
            "friend_states",
            "friend_id",
            {
                "friend_id": row["friend_id"],
                "affect_json": json_text(row["affect"], {}),
                "energy": row["energy"],
                "concerns_json": json_text(row["concerns"], []),
                "intent": row["intent"],
                "inner_note": row["inner_note"],
                "relationship_note": row["relationship_note"],
                "open_loops_json": json_text(row["open_loops"], []),
                "active_thread": row["active_thread"],
                "last_catchup_at": friend["last_catchup_at"] if friend else None,
                "last_reflection_at": friend["last_reflection_at"] if friend else None,
                "created_at": row["updated_at"],
                "updated_at": row["updated_at"],
            },
            states_seen,
        )

    messages_seen = await existing("chat", "messages", ("id",))
    message_count = 0
    for row in old.execute("select * from messages order by created_at, id"):
        segments: list[dict[str, Any]] = []
        try:
            audio_segments = json.loads(row["audio_segments"] or "[]")
        except json.JSONDecodeError:
            audio_segments = []
        try:
            raw_segments = json.loads(row["segments"] or "[]")
        except json.JSONDecodeError:
            raw_segments = []
        if isinstance(raw_segments, list) and raw_segments:
            for index, item in enumerate(raw_segments):
                if isinstance(item, dict) and item.get("text"):
                    segments.append(
                        {
                            "bubble": int(item.get("bubble", item.get("index", index))),
                            "text": str(item["text"]),
                            "mood": item.get("mood"),
                        }
                    )
                elif isinstance(item, str) and item.strip():
                    segments.append({"bubble": index, "text": item.strip(), "mood": None})
        elif isinstance(audio_segments, list):
            for index, item in enumerate(audio_segments):
                if isinstance(item, dict) and item.get("text"):
                    segments.append(
                        {
                            "bubble": int(item.get("index", index)),
                            "text": str(item["text"]),
                            "mood": None,
                        }
                    )

        created = await create(
            "chat",
            "messages",
            "id",
            {
                "id": row["id"],
                "friend_id": row["friend_id"],
                "role": row["role"],
                "kind": "chat",
                "content": row["content"] or "",
                "proactive": row["is_proactive"] or 0,
                "status": row["stream_status"] or "completed",
                "mood": row["mood"],
                "segments_json": json.dumps(segments, ensure_ascii=False),
                "sources_json": json_text(row["sources"], []),
                "tool_calls_json": json_text(row["tools_used"], []),
                "voice_status": row["audio_status"],
                "voice_error": row["audio_error"],
                "read_at": row["created_at"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
            },
            messages_seen,
        )
        if not created:
            continue
        message_count += 1

        image_asset = import_asset(row["image_path"], "image")
        if image_asset:
            await core.write(
                "chat",
                "message_assets",
                "create",
                {
                    "message_id": row["id"],
                    "asset_id": image_asset,
                    "role": "image",
                    "position": 0,
                    "created_at": row["created_at"],
                },
            )
        audio_paths: list[str] = []
        if isinstance(audio_segments, list):
            audio_paths = [
                str(item["path"])
                for item in audio_segments
                if isinstance(item, dict) and item.get("path")
            ]
        if not audio_paths and row["audio_path"]:
            audio_paths = [row["audio_path"]]
        for position, audio_path in enumerate(audio_paths):
            audio_asset = import_asset(audio_path, "audio")
            if audio_asset:
                await core.write(
                    "chat",
                    "message_assets",
                    "create",
                    {
                        "message_id": row["id"],
                        "asset_id": audio_asset,
                        "role": "voice",
                        "position": position,
                        "created_at": row["created_at"],
                    },
                )
        if message_count % 250 == 0:
            print(f"messages: {message_count}")

    memory_kind = {"normal": "fact", "notebook": "note", "rp_play_style": "preference"}
    memories_seen = await existing("memory", "memories", ("id",))
    memories = list(old.execute("select * from memories where deleted_at is null"))
    for row in memories:
        await create(
            "memory",
            "memories",
            "id",
            {
                "id": row["id"],
                "friend_id": row["friend_id"],
                "kind": memory_kind.get(row["tag"], "note"),
                "layer": row["layer"],
                "content": row["content"],
                "context": row["context"],
                "importance": row["importance"],
                "confidence": 0.6,
                "occurred_at": row["created_at"],
                "source_message_ids_json": "[]",
                "expires_at": row["expires_at"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"] or row["created_at"],
            },
            memories_seen,
        )

    for row in old.execute("select * from friend_episodes where deleted_at is null"):
        await create(
            "memory",
            "memories",
            "id",
            {
                "id": row["id"],
                "friend_id": row["friend_id"],
                "kind": "insight",
                "layer": "long_term",
                "content": row["summary"],
                "context": row["meaning"],
                "importance": row["importance"],
                "confidence": row["confidence"],
                "occurred_at": row["occurred_at"],
                "source_message_ids_json": json_text(row["source_message_ids"], []),
                "created_at": row["created_at"],
                "updated_at": row["updated_at"] or row["created_at"],
            },
            memories_seen,
        )

    memory_events_seen = await existing("memory", "memory_events", ("id",))
    for row in old.execute("select * from memory_events"):
        await create(
            "memory",
            "memory_events",
            "id",
            {
                "id": row["id"],
                "friend_id": row["friend_id"],
                "memory_id": row["memory_id"],
                "actor": row["actor"],
                "action": row["action"],
                "before_json": json_text(row["before"], None),
                "after_json": json_text(row["after"], None),
                "created_at": row["created_at"],
            },
            memory_events_seen,
        )

    thoughts_seen = await existing("thought", "thoughts", ("id",))
    for row in old.execute("select * from thoughts"):
        await create(
            "thought",
            "thoughts",
            "id",
            {
                "id": row["id"],
                "friend_id": row["friend_id"],
                "content": row["content"],
                "kind": row["kind"],
                "due_at": row["due_at"],
                "schedule_id": row["schedule_id"],
                "state": row["state"],
                "source": row["source"],
                "said_at": row["said_at"],
                "expires_at": row["expires_at"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
            },
            thoughts_seen,
        )

    samples_seen = await existing("expression", "expression_samples", ("id",))
    for row in old.execute("select * from friend_expressions"):
        await create(
            "expression",
            "expression_samples",
            "id",
            {
                "id": row["id"],
                "friend_id": row["friend_id"],
                "kind": "phrase",
                "text": row["style"],
                "situation": row["situation"] or "",
                "score": row["score"],
                "source": row["source"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
            },
            samples_seen,
        )

    profiles_seen = await existing("expression", "style_profiles", ("friend_id",))
    for row in old.execute("select * from friend_style_profiles"):
        await create(
            "expression",
            "style_profiles",
            "friend_id",
            {
                "friend_id": row["friend_id"],
                "profile_json": row["profile_json"],
                "version": row["version"],
                "created_at": row["updated_at"],
                "updated_at": row["updated_at"],
            },
            profiles_seen,
        )

    style_events_seen = await existing("expression", "style_events", ("id",))
    for row in old.execute("select * from friend_style_events"):
        await create(
            "expression",
            "style_events",
            "id",
            {
                "id": row["id"],
                "friend_id": row["friend_id"],
                "event_type": row["event_type"],
                "summary": row["summary"],
                "changes_json": row["changes_json"],
                "before_version": row["before_version"],
                "after_version": row["after_version"],
                "before_profile_json": row["before_profile_json"],
                "after_profile_json": row["after_profile_json"],
                "created_at": row["created_at"],
            },
            style_events_seen,
        )

    documents_seen = await existing("document", "documents", ("id",))
    for row in old.execute("select * from documents"):
        asset_id = import_asset(row["path"], "image" if row["kind"] == "image" else "file")
        created = await create(
            "document",
            "documents",
            "id",
            {
                "id": row["id"],
                "friend_id": row["friend_id"],
                "name": row["name"],
                "kind": row["kind"],
                "asset_id": asset_id,
                "chars": row["chars"],
                "text": row["text"],
                "status": row["status"],
                "error": row["error"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
            },
            documents_seen,
        )
        if not created:
            continue
        for chunk in old.execute(
            "select * from document_chunks where document_id = ? order by seq",
            (row["id"],),
        ):
            await core.write(
                "document",
                "document_chunks",
                "create",
                {
                    "document_id": chunk["document_id"],
                    "friend_id": chunk["friend_id"],
                    "seq": chunk["seq"],
                    "text": chunk["text"],
                    "created_at": chunk["created_at"],
                },
            )

    projects_seen = await existing("life", "life_projects", ("id",))
    for row in old.execute("select * from life_projects"):
        await create(
            "life",
            "life_projects",
            "id",
            {
                "id": row["id"],
                "friend_id": row["friend_id"],
                "topic": row["topic"],
                "status": row["status"],
                "source": row["source"],
                "step_count": row["step_count"],
                "reading_excerpt": row["reading_excerpt"],
                "content_depth": row["content_depth"],
                "last_thought": row["last_thought"],
                "open_question": row["open_question"],
                "evidence_json": json_text(row["evidence"], []),
                "last_activity_at": row["last_activity_at"],
                "last_shared_at": row["last_shared_at"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
            },
            projects_seen,
        )

    activities_seen = await existing("life", "life_activities", ("id",))
    for row in old.execute("select * from life_activities"):
        await create(
            "life",
            "life_activities",
            "id",
            {
                "id": row["id"],
                "friend_id": row["friend_id"],
                "project_id": row["project_id"],
                "device_id": row["device_id"] or "",
                "kind": row["kind"],
                "title": row["title"],
                "status": row["status"],
                "started_at": row["started_at"],
                "ends_at": row["ends_at"],
                "finished_at": row["finished_at"],
                "summary": row["summary"],
                "observations_json": json_text(row["observations"], []),
                "tool_calls_json": json_text(row["tool_calls"], []),
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
            },
            activities_seen,
        )

    life_seen = await existing("life", "friend_life", ("friend_id",))
    for row in old.execute("select * from friend_life"):
        await create(
            "life",
            "friend_life",
            "friend_id",
            {
                "friend_id": row["friend_id"],
                "current_activity_id": row["current_activity_id"],
                "last_activity_at": row["last_activity_at"],
                "last_observation": row["last_observation"],
                "pending_share": row["pending_share"],
                "last_share_at": row["last_share_at"],
                "paused_by_chat": row["paused_by_chat"],
                "paused_until": row["paused_until"],
                "created_at": row["updated_at"],
                "updated_at": row["updated_at"],
            },
            life_seen,
        )

    print(
        f"imported friends={len(friends)} messages={message_count} "
        f"memories={len(memories)} thoughts={old.execute('select count(*) from thoughts').fetchone()[0]} "
        f"documents={old.execute('select count(*) from documents').fetchone()[0]} "
        f"life_projects={old.execute('select count(*) from life_projects').fetchone()[0]} "
        f"life_activities={old.execute('select count(*) from life_activities').fetchone()[0]}"
    )
    old.close()
    await core.close()


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    asyncio.run(main())
