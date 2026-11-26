package com.yumefriend.app

import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import org.json.JSONObject
import java.io.File

object LegacyImport {
    private val memoryKinds = setOf(
        "fact", "preference", "promise", "experience", "insight", "correction", "note",
    )

    fun run(
        dbFile: File,
        create: (String, String, JsonObject) -> Unit,
        putSetting: (String, String) -> Unit,
    ) {
        val db = SQLiteDatabase.openDatabase(dbFile.path, null, SQLiteDatabase.OPEN_READONLY)
        db.use {
            eachRow(it, "friends") { row ->
                create(
                    "friend",
                    "friends",
                    buildJsonObject {
                        put("id", text(row.string("id")))
                        put("name", text(row.string("name")))
                        put("personality", text(row.string("personality")))
                        put("custom_instructions", text(row.string("custom_instructions")))
                        putIf("avatar_description", row.string("avatar_description"))
                        putIf("voice_id", row.string("voice_id"))
                        put("voice_reply_enabled", number(row.int("voice_reply_enabled") ?: 0))
                        put("presence", number(row.int("presence") ?: 1))
                        put("visual_mode", text("none"))
                        putIf("portrait_transform_json", row.string("portrait_transform"))
                        row.double("temperature")?.let { put("temperature", number(it)) }
                        put("life_enabled", number(0))
                        put("chat_pacing_enabled", number(0))
                        put("humanizer_enabled", number(0))
                        putIf("created_at", row.string("created_at"))
                        putIf("updated_at", row.string("updated_at") ?: row.string("created_at"))
                        putIf("deleted_at", row.string("deleted_at"))
                    },
                )
            }
            eachRow(it, "friend_states") { row ->
                create(
                    "friend",
                    "friend_states",
                    buildJsonObject {
                        put("friend_id", text(row.string("friend_id")))
                        put("affect_json", text(row.string("affect") ?: "{}"))
                        put("energy", number(row.double("energy") ?: 0.55))
                        put("concerns_json", text(row.string("concerns") ?: "[]"))
                        putIf("intent", row.string("intent"))
                        putIf("inner_note", row.string("inner_note"))
                        putIf("relationship_note", row.string("relationship_note"))
                        put("open_loops_json", text(row.string("open_loops") ?: "[]"))
                        putIf("active_thread", row.string("active_thread"))
                        putIf("updated_at", row.string("updated_at"))
                    },
                )
            }
            eachRow(it, "messages") { row ->
                val createdAt = row.string("created_at")
                create(
                    "chat",
                    "messages",
                    buildJsonObject {
                        put("id", text(row.string("id")))
                        put("friend_id", text(row.string("friend_id")))
                        put("role", text(row.string("role")))
                        put("kind", text("chat"))
                        put("content", text(row.string("content") ?: ""))
                        put("proactive", number(row.int("is_proactive") ?: 0))
                        put("status", text(row.string("stream_status") ?: "completed"))
                        putIf("mood", row.string("mood"))
                        putIf("segments_json", row.string("segments"))
                        putIf("sources_json", row.string("sources"))
                        putIf("tool_calls_json", row.string("tools_used"))
                        putIf("voice_status", row.string("audio_status"))
                        putIf("voice_error", row.string("audio_error"))
                        putIf("read_at", createdAt)
                        putIf("created_at", createdAt)
                    },
                )
            }
            eachRow(it, "memories") { row ->
                val tag = row.string("tag") ?: "note"
                create(
                    "memory",
                    "memories",
                    buildJsonObject {
                        put("id", text(row.string("id")))
                        put("friend_id", text(row.string("friend_id")))
                        put("kind", text(if (tag in memoryKinds) tag else "note"))
                        put("layer", text(row.string("layer") ?: "long_term"))
                        put("content", text(row.string("content") ?: ""))
                        putIf("context", row.string("context"))
                        put("importance", number(row.double("importance") ?: 0.5))
                        put("confidence", number(0.5))
                        put("source_message_ids_json", text("[]"))
                        putIf("expires_at", row.string("expires_at"))
                        putIf("created_at", row.string("created_at"))
                        putIf("updated_at", row.string("updated_at"))
                        putIf("deleted_at", row.string("deleted_at"))
                    },
                )
            }
            eachRow(it, "memory_events") { row ->
                create(
                    "memory",
                    "memory_events",
                    buildJsonObject {
                        put("id", text(row.string("id")))
                        put("friend_id", text(row.string("friend_id")))
                        putIf("memory_id", row.string("memory_id"))
                        put("actor", text(row.string("actor") ?: "system"))
                        put("action", text(row.string("action") ?: "create"))
                        putIf("before_json", row.string("before"))
                        putIf("after_json", row.string("after"))
                        putIf("created_at", row.string("created_at"))
                    },
                )
            }
            eachRow(it, "documents") { row ->
                create(
                    "document",
                    "documents",
                    buildJsonObject {
                        put("id", text(row.string("id")))
                        put("friend_id", text(row.string("friend_id")))
                        put("name", text(row.string("name")))
                        put("kind", text(row.string("kind") ?: "txt"))
                        put("chars", number(row.int("chars") ?: 0))
                        putIf("text", row.string("text"))
                        put("status", text(row.string("status") ?: "ready"))
                        putIf("error", row.string("error"))
                        putIf("created_at", row.string("created_at"))
                        putIf("updated_at", row.string("updated_at"))
                    },
                )
            }
            eachRow(it, "document_chunks") { row ->
                create(
                    "document",
                    "document_chunks",
                    buildJsonObject {
                        put("document_id", text(row.string("document_id")))
                        put("friend_id", text(row.string("friend_id")))
                        put("seq", number(row.int("seq") ?: 0))
                        put("text", text(row.string("text") ?: ""))
                        putIf("created_at", row.string("created_at"))
                    },
                )
            }
            eachRow(it, "schedules") { row ->
                create(
                    "schedule",
                    "schedules",
                    buildJsonObject {
                        put("id", text(row.string("id")))
                        put("friend_id", text(row.string("friend_id")))
                        put("title", text(row.string("title")))
                        put("nature", text(row.string("nature") ?: "remind"))
                        put("date_local", text(row.string("date")))
                        putIf("time_local", row.string("time"))
                        put("advance_minutes", number(row.int("advance_minutes") ?: 0))
                        put("state", text(row.string("state") ?: "pending"))
                        put("owner", text(row.string("owner") ?: "user"))
                        put("source", text(row.string("source") ?: "chat"))
                        putIf("settled_at", row.string("settled_at"))
                        putIf("settled_reason", row.string("settled_reason"))
                        putIf("created_at", row.string("created_at"))
                        putIf("updated_at", row.string("updated_at"))
                        putIf("deleted_at", row.string("deleted_at"))
                    },
                )
            }
            eachRow(it, "schedule_events") { row ->
                create(
                    "schedule",
                    "schedule_events",
                    buildJsonObject {
                        put("id", text(row.string("id")))
                        put("friend_id", text(row.string("friend_id")))
                        putIf("schedule_id", row.string("schedule_id"))
                        put("actor", text(row.string("actor") ?: "system"))
                        put("action", text(row.string("action") ?: "create"))
                        putIf("before_json", row.string("before"))
                        putIf("after_json", row.string("after"))
                        putIf("created_at", row.string("created_at"))
                    },
                )
            }
            eachRow(it, "thoughts") { row ->
                create(
                    "thought",
                    "thoughts",
                    buildJsonObject {
                        put("id", text(row.string("id")))
                        put("friend_id", text(row.string("friend_id")))
                        put("content", text(row.string("content") ?: ""))
                        put("kind", text(row.string("kind") ?: "casual"))
                        putIf("due_at", row.string("due_at"))
                        putIf("schedule_id", row.string("schedule_id"))
                        put("state", text(row.string("state") ?: "pending"))
                        put("source", text(row.string("source") ?: "model"))
                        putIf("said_at", row.string("said_at"))
                        putIf("expires_at", row.string("expires_at"))
                        putIf("created_at", row.string("created_at"))
                        putIf("updated_at", row.string("updated_at"))
                    },
                )
            }
            eachRow(it, "voices") { row ->
                create(
                    "voice",
                    "voices",
                    buildJsonObject {
                        put("id", text(row.string("id")))
                        put("name", text(row.string("name")))
                        put("provider", text("gpt_sovits"))
                        put(
                            "config_json",
                            text(
                                buildJsonObject {
                                    putIf("gpt_weights_path", row.string("gpt_weights_path"))
                                    putIf("sovits_weights_path", row.string("sovits_weights_path"))
                                    putIf("ref_audio_path", row.string("ref_audio_path"))
                                    putIf("prompt_text", row.string("prompt_text"))
                                }.toString(),
                            ),
                        )
                        put("speed", number(row.double("speed") ?: 1.0))
                        putIf("created_at", row.string("created_at"))
                        putIf("updated_at", row.string("updated_at"))
                    },
                )
            }
            importSettings(it, putSetting)
        }
    }

    private fun importSettings(db: SQLiteDatabase, putSetting: (String, String) -> Unit) {
        var model: JSONObject? = null
        eachRow(db, "settings") { row ->
            val purposes = runCatching { JSONObject(row.string("purposes") ?: "{}") }.getOrNull()
            model = purposes?.optJSONObject("chat")
            row.int("voice_keep_days")?.let {
                putSetting("voice_retention_days", JsonPrimitive(it).toString())
            }
        }
        model?.let {
            putSetting("llm_base_url", JsonPrimitive(it.optString("base_url")).toString())
            putSetting("llm_api_key", JsonPrimitive(it.optString("api_key")).toString())
            putSetting("llm_model", JsonPrimitive(it.optString("model")).toString())
        }
    }

    private fun eachRow(db: SQLiteDatabase, table: String, block: (Row) -> Unit) {
        if (!db.tableExists(table)) return
        db.rawQuery("SELECT * FROM $table", null).use { cursor ->
            while (cursor.moveToNext()) block(Row(cursor))
        }
    }

    private fun SQLiteDatabase.tableExists(table: String): Boolean =
        rawQuery(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
            arrayOf(table),
        ).use { it.moveToFirst() }

    private fun text(value: String?): JsonPrimitive = JsonPrimitive(value ?: "")
    private fun number(value: Int): JsonPrimitive = JsonPrimitive(value)
    private fun number(value: Double): JsonPrimitive = JsonPrimitive(value)

    private fun JsonObjectBuilder.putIf(name: String, value: String?) {
        if (value != null) put(name, JsonPrimitive(value))
    }

    private class Row(private val cursor: Cursor) {
        fun string(name: String): String? {
            val index = cursor.getColumnIndex(name)
            return if (index < 0 || cursor.isNull(index)) null else cursor.getString(index)
        }

        fun int(name: String): Int? {
            val index = cursor.getColumnIndex(name)
            return if (index < 0 || cursor.isNull(index)) null else cursor.getInt(index)
        }

        fun double(name: String): Double? {
            val index = cursor.getColumnIndex(name)
            return if (index < 0 || cursor.isNull(index)) null else cursor.getDouble(index)
        }
    }
}
