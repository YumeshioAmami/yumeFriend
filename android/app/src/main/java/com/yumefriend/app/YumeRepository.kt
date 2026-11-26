package com.yumefriend.app

import com.yume.core.ReadRequest
import com.yume.core.WriteOp
import com.yume.core.WriteRequest
import com.yume.core.YumeCore
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import java.time.Instant
import java.util.UUID

data class Friend(
    val id: String,
    val name: String,
    val personality: String,
    val customInstructions: String,
    val avatarAssetId: String?,
    val voiceId: String?,
    val voiceReplyEnabled: Boolean,
    val presence: Boolean,
    val createdAt: String,
)

data class Message(
    val id: String,
    val friendId: String,
    val role: String,
    val content: String,
    val status: String,
    val createdAt: String,
)

data class Memory(
    val id: String,
    val friendId: String,
    val kind: String,
    val layer: String,
    val content: String,
    val importance: Double,
)

data class Schedule(
    val id: String,
    val friendId: String,
    val title: String,
    val dateLocal: String,
    val timeLocal: String,
    val advanceMinutes: Int,
    val state: String,
)

data class KnowledgeDocument(
    val id: String,
    val friendId: String,
    val name: String,
    val kind: String,
    val chars: Int,
    val status: String,
)

data class DocumentHit(
    val documentId: String,
    val text: String,
)

class YumeRepository(
    private val core: YumeCore,
    private val openAi: OpenAiClient = OpenAiClient(),
) {
    private val json = Json { ignoreUnknownKeys = true }

    private fun read(
        module: String,
        entity: String,
        filter: Map<String, JsonElement> = emptyMap(),
        limit: Int = 500,
    ): List<JsonObject> = core.read(
        ReadRequest(module, entity, filter, limit = limit),
    ).items

    private fun write(
        module: String,
        entity: String,
        op: WriteOp,
        data: JsonObject,
    ): JsonObject? = core.write(WriteRequest(module, entity, op, data)).record

    private fun text(value: String): JsonElement = JsonPrimitive(value)
    private fun number(value: Number): JsonElement = JsonPrimitive(value)
    private fun bool(value: Boolean): JsonElement = JsonPrimitive(value)

    private fun JsonObject.str(name: String): String =
        this[name]?.jsonPrimitive?.contentOrNull.orEmpty()

    private fun JsonObject.int(name: String): Int =
        this[name]?.jsonPrimitive?.longOrNull?.toInt() ?: 0

    private fun JsonObject.dbl(name: String): Double =
        this[name]?.jsonPrimitive?.doubleOrNull ?: 0.0

    private fun Friend.fromJson(item: JsonObject) = copy(
        id = item.str("id"),
        name = item.str("name"),
        personality = item.str("personality"),
        customInstructions = item.str("custom_instructions"),
        avatarAssetId = item.str("avatar_asset_id").ifBlank { null },
        voiceId = item.str("voice_id").ifBlank { null },
        voiceReplyEnabled = item.int("voice_reply_enabled") == 1,
        presence = item.int("presence") == 1,
        createdAt = item.str("created_at"),
    )

    fun friends(): List<Friend> = read("friend", "friends", limit = 500)
        .sortedBy { it.str("created_at") }
        .map { Friend("", "", "", "", null, null, false, true, "").fromJson(it) }

    suspend fun createFriend(name: String, personality: String, instructions: String): Friend {
        val id = UUID.randomUUID().toString()
        val record = write(
            "friend",
            "friends",
            WriteOp.CREATE,
            buildJsonObject {
                put("id", text(id))
                put("name", text(name))
                put("personality", text(personality))
                put("custom_instructions", text(instructions))
                put("avatar_asset_id", JsonNull)
                put("voice_id", JsonNull)
                put("voice_reply_enabled", number(0))
                put("presence", number(1))
                put("visual_mode", text("none"))
                put("visual_pack_id", JsonNull)
                put("life_enabled", number(0))
            },
        )!!
        write(
            "friend",
            "friend_states",
            WriteOp.CREATE,
            buildJsonObject { put("friend_id", text(id)) },
        )
        return Friend("", "", "", "", null, null, false, true, "").fromJson(record)
    }

    fun updateFriend(friend: Friend, name: String, personality: String, instructions: String) {
        write(
            "friend",
            "friends",
            WriteOp.UPDATE,
            buildJsonObject {
                put("id", text(friend.id))
                put("name", text(name))
                put("personality", text(personality))
                put("custom_instructions", text(instructions))
            },
        )
    }

    fun deleteFriend(friend: Friend) {
        val entities = listOf(
            "friend_states" to "friend_id",
            "messages" to "id",
            "memories" to "id",
            "schedules" to "id",
            "thoughts" to "id",
            "expression_samples" to "id",
            "documents" to "id",
            "life_projects" to "id",
            "life_activities" to "id",
        )
        for ((entity, key) in entities) {
            val module = when (entity) {
                "friend_states" -> "friend"
                "messages" -> "chat"
                "memories" -> "memory"
                "schedules" -> "schedule"
                "thoughts" -> "thought"
                "expression_samples" -> "expression"
                "documents" -> "document"
                else -> "life"
            }
            read(module, entity, mapOf("friend_id" to text(friend.id)), 10000).forEach {
                write(module, entity, WriteOp.DELETE, buildJsonObject { put(key, text(it.str(key))) })
            }
        }
        write("friend", "friends", WriteOp.DELETE, buildJsonObject { put("id", text(friend.id)) })
    }

    fun messages(friendId: String): List<Message> = read(
        "chat",
        "messages",
        mapOf("friend_id" to text(friendId)),
        10000,
    ).sortedBy { it.str("created_at") }
        .takeLast(200)
        .map {
            Message(
                id = it.str("id"),
                friendId = it.str("friend_id"),
                role = it.str("role"),
                content = it.str("content"),
                status = it.str("status"),
                createdAt = it.str("created_at"),
            )
        }

    fun createMessage(
        friendId: String,
        role: String,
        content: String,
        status: String = "completed",
    ): Message {
        val id = UUID.randomUUID().toString()
        val record = write(
            "chat",
            "messages",
            WriteOp.CREATE,
            buildJsonObject {
                put("id", text(id))
                put("friend_id", text(friendId))
                put("role", text(role))
                put("kind", text("chat"))
                put("content", text(content))
                put("proactive", number(0))
                put("status", text(status))
            },
        )!!
        return Message(id, friendId, role, content, status, record.str("created_at"))
    }

    fun updateMessage(id: String, content: String, status: String) {
        write(
            "chat",
            "messages",
            WriteOp.UPDATE,
            buildJsonObject {
                put("id", text(id))
                put("content", text(content))
                put("status", text(status))
            },
        )
    }

    fun memories(friendId: String): List<Memory> = read(
        "memory",
        "memories",
        mapOf("friend_id" to text(friendId)),
    ).sortedByDescending { it.str("updated_at") }
        .map {
            Memory(
                it.str("id"),
                it.str("friend_id"),
                it.str("kind"),
                it.str("layer"),
                it.str("content"),
                it.dbl("importance"),
            )
        }

    fun addMemory(friendId: String, content: String): Memory {
        val id = UUID.randomUUID().toString()
        val now = now()
        val record = write(
            "memory",
            "memories",
            WriteOp.CREATE,
            buildJsonObject {
                put("id", text(id))
                put("friend_id", text(friendId))
                put("kind", text("fact"))
                put("layer", text("long_term"))
                put("content", text(content))
                put("importance", number(0.5))
                put("confidence", number(0.6))
                put("source_message_ids_json", text("[]"))
            },
        )!!
        write(
            "memory",
            "memory_events",
            WriteOp.CREATE,
            buildJsonObject {
                put("id", text(UUID.randomUUID().toString()))
                put("friend_id", text(friendId))
                put("memory_id", text(id))
                put("actor", text("user"))
                put("action", text("create"))
                put("after_json", text(record.toString()))
                put("created_at", text(now))
            },
        )
        return Memory(id, friendId, "fact", "long_term", content, 0.5)
    }

    fun updateMemory(memory: Memory, content: String) {
        write(
            "memory",
            "memories",
            WriteOp.UPDATE,
            buildJsonObject {
                put("id", text(memory.id))
                put("content", text(content))
            },
        )
    }

    fun deleteMemory(memory: Memory) {
        write("memory", "memories", WriteOp.DELETE, buildJsonObject { put("id", text(memory.id)) })
    }

    fun schedules(friendId: String): List<Schedule> = read(
        "schedule",
        "schedules",
        mapOf("friend_id" to text(friendId)),
    ).sortedBy { it.str("date_local") + it.str("time_local") }
        .map {
            Schedule(
                it.str("id"),
                it.str("friend_id"),
                it.str("title"),
                it.str("date_local"),
                it.str("time_local"),
                it.int("advance_minutes"),
                it.str("state"),
            )
        }

    fun createSchedule(friendId: String, title: String, date: String, time: String) {
        val id = UUID.randomUUID().toString()
        write(
            "schedule",
            "schedules",
            WriteOp.CREATE,
            buildJsonObject {
                put("id", text(id))
                put("friend_id", text(friendId))
                put("title", text(title))
                put("nature", text("remind"))
                put("date_local", text(date))
                put("time_local", if (time.isBlank()) JsonNull else text(time))
                put("advance_minutes", number(0))
                put("state", text("pending"))
                put("owner", text("user"))
                put("source", text("ui"))
            },
        )
    }

    fun settleSchedule(schedule: Schedule, reason: String) {
        write(
            "schedule",
            "schedules",
            WriteOp.UPDATE,
            buildJsonObject {
                put("id", text(schedule.id))
                put("state", text("settled"))
                put("settled_at", text(now()))
                put("settled_reason", text(reason))
            },
        )
    }

    fun documents(friendId: String): List<KnowledgeDocument> = read(
        "document",
        "documents",
        mapOf("friend_id" to text(friendId)),
    ).map {
        KnowledgeDocument(
            it.str("id"),
            it.str("friend_id"),
            it.str("name"),
            it.str("kind"),
            it.int("chars"),
            it.str("status"),
        )
    }

    fun importDocument(friendId: String, name: String, kind: String, content: String) {
        val documentId = UUID.randomUUID().toString()
        write(
            "document",
            "documents",
            WriteOp.CREATE,
            buildJsonObject {
                put("id", text(documentId))
                put("friend_id", text(friendId))
                put("name", text(name))
                put("kind", text(kind))
                put("chars", number(content.length))
                put("text", text(content))
                put("status", text("ready"))
            },
        )
        val chunks = content.chunked(800)
        chunks.forEachIndexed { index, chunk ->
            write(
                "document",
                "document_chunks",
                WriteOp.CREATE,
                buildJsonObject {
                    put("document_id", text(documentId))
                    put("friend_id", text(friendId))
                    put("seq", number(index))
                    put("text", text(chunk))
                },
            )
        }
    }

    fun searchDocuments(friendId: String, query: String): List<DocumentHit> {
        if (query.isBlank()) return emptyList()
        return read(
            "document",
            "document_chunks",
            mapOf("friend_id" to text(friendId)),
            2000,
        ).filter { it.str("text").contains(query, ignoreCase = true) }
            .take(20)
            .map { DocumentHit(it.str("document_id"), it.str("text")) }
    }

    fun setting(key: String): String? = read(
        "settings",
        "settings",
        mapOf(
            "scope" to text("product"),
            "owner_id" to text("yumeFriend"),
            "key" to text(key),
        ),
        1,
    ).firstOrNull()?.str("value_json")

    fun putSetting(key: String, valueJson: String) {
        val existing = read(
            "settings",
            "settings",
            mapOf(
                "scope" to text("product"),
                "owner_id" to text("yumeFriend"),
                "key" to text(key),
            ),
            1,
        ).isNotEmpty()
        write(
            "settings",
            "settings",
            if (existing) WriteOp.UPDATE else WriteOp.CREATE,
            buildJsonObject {
                put("scope", text("product"))
                put("owner_id", text("yumeFriend"))
                put("key", text(key))
                put("value_json", text(valueJson))
            },
        )
    }

    fun llmConfig(): LlmConfig? {
        val base = setting("llm_base_url")?.removeSurrounding("\"") ?: return null
        val key = setting("llm_api_key")?.removeSurrounding("\"") ?: return null
        val model = setting("llm_model")?.removeSurrounding("\"") ?: return null
        if (base.isBlank() || key.isBlank() || model.isBlank()) return null
        return LlmConfig(base, key, model)
    }

    fun loadTheme(): AppTheme {
        val raw = setting("theme") ?: return AppTheme()
        return try {
            val value = json.parseToJsonElement(raw) as JsonObject
            AppTheme(value.str("color").ifBlank { "paper" }, value.str("mode").ifBlank { "light" })
        } catch (_: Exception) {
            AppTheme()
        }
    }

    fun saveTheme(theme: AppTheme) {
        putSetting(
            "theme",
            buildJsonObject {
                put("color", text(theme.color))
                put("mode", text(theme.mode))
            }.toString(),
        )
    }

    suspend fun generateReply(
        friend: Friend,
        userText: String,
        assistantId: String,
        onDelta: (String) -> Unit,
    ): String {
        val config = llmConfig() ?: error("请先在设置里填写模型")
        val memoryText = memories(friend.id).take(20).joinToString("\n") { "- ${it.content}" }
        val history = messages(friend.id)
            .filter { it.id != assistantId && it.content.isNotBlank() }
            .takeLast(20)
        val messages = mutableListOf<Pair<String, String>>()
        messages += "system" to buildString {
            append("你是「${friend.name}」。\n")
            append(friend.personality)
            if (friend.customInstructions.isNotBlank()) append("\n${friend.customInstructions}")
            if (memoryText.isNotBlank()) append("\n\n你记得：\n$memoryText")
        }
        history.forEach { messages += it.role to it.content }
        val reply = openAi.streamChat(config, messages, onDelta = onDelta)
        updateMessage(assistantId, reply, "completed")
        return reply
    }

    private fun now(): String = Instant.now().toString()
}
