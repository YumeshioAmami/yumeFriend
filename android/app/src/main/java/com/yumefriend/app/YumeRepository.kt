package com.yumefriend.app

import com.yume.core.ReadRequest
import com.yume.core.WriteOp
import com.yume.core.WriteRequest
import com.yume.core.YumeCore
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
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
import org.json.JSONArray
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
    val unreadCount: Int = 0,
)

data class Message(
    val id: String,
    val friendId: String,
    val role: String,
    val content: String,
    val status: String,
    val createdAt: String,
    val sourcesJson: String = "",
    val toolCallsJson: String = "",
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

data class Voice(
    val id: String,
    val name: String,
    val engineVoice: String,
    val locale: String,
)

data class FeatureFlags(
    val memory: Boolean = true,
    val schedule: Boolean = true,
    val voice: Boolean = true,
    val knowledge: Boolean = true,
)

data class MessagePage(
    val items: List<Message>,
    val nextCursor: String?,
)

sealed interface ChatEvent {
    data class Start(val message: Message) : ChatEvent
    data class Delta(val text: String) : ChatEvent
    data class End(val message: Message) : ChatEvent
    data class Error(val message: Message) : ChatEvent
}

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

    fun friends(): List<Friend> {
        val unread = read("chat", "messages", limit = 1_000_000)
            .filter { it.str("role") != "user" && it.str("read_at").isBlank() }
            .groupingBy { it.str("friend_id") }
            .eachCount()
        return read("friend", "friends", limit = 500)
            .sortedBy { it.str("created_at") }
            .map {
                Friend("", "", "", "", null, null, false, true, "").fromJson(it)
                    .copy(unreadCount = unread[it.str("id")] ?: 0)
            }
    }

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

    fun updateFriendAvatar(friendId: String, assetId: String) {
        write(
            "friend",
            "friends",
            WriteOp.UPDATE,
            buildJsonObject {
                put("id", text(friendId))
                put("avatar_asset_id", text(assetId))
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

    private fun allMessages(friendId: String): List<Message> = read(
        "chat",
        "messages",
        mapOf("friend_id" to text(friendId)),
        1_000_000,
    ).sortedBy { it.str("created_at") }
        .map {
            Message(
                id = it.str("id"),
                friendId = it.str("friend_id"),
                role = it.str("role"),
                content = it.str("content"),
                status = it.str("status"),
                createdAt = it.str("created_at"),
                sourcesJson = it.str("sources_json"),
                toolCallsJson = it.str("tool_calls_json"),
            )
        }

    fun messages(friendId: String): List<Message> = allMessages(friendId).takeLast(200)

    fun messagePage(friendId: String, cursor: String?): MessagePage {
        val all = allMessages(friendId)
        val end = cursor?.let { id -> all.indexOfFirst { it.id == id }.takeIf { it >= 0 } } ?: all.size
        val start = (end - 200).coerceAtLeast(0)
        return MessagePage(all.subList(start, end), if (start > 0) all[start].id else null)
    }

    fun markRead(friendId: String) {
        read(
            "chat",
            "messages",
            mapOf(
                "friend_id" to text(friendId),
                "read_at" to JsonNull,
            ),
            1_000_000,
        ).filter { it.str("role") != "user" }.forEach {
            write(
                "chat",
                "messages",
                WriteOp.UPDATE,
                buildJsonObject {
                    put("id", text(it.str("id")))
                    put("read_at", text(now()))
                },
            )
        }
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

    fun addMemory(friendId: String, content: String): Memory =
        saveMemory(friendId, content, "fact", "user")

    private fun saveMemory(friendId: String, content: String, kind: String, actor: String): Memory {
        val id = UUID.randomUUID().toString()
        val now = now()
        val record = write(
            "memory",
            "memories",
            WriteOp.CREATE,
            buildJsonObject {
                put("id", text(id))
                put("friend_id", text(friendId))
                put("kind", text(kind))
                put("layer", text("long_term"))
                put("content", text(content))
                put("importance", number(0.6))
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
                put("actor", text(actor))
                put("action", text("create"))
                put("after_json", text(record.toString()))
                put("created_at", text(now))
            },
        )
        return Memory(id, friendId, kind, "long_term", content, 0.6)
    }

    fun updateMemory(memory: Memory, content: String) {
        val before = read(
            "memory",
            "memories",
            mapOf("id" to text(memory.id)),
            1,
        ).firstOrNull()
        val after = write(
            "memory",
            "memories",
            WriteOp.UPDATE,
            buildJsonObject {
                put("id", text(memory.id))
                put("content", text(content))
            },
        )
        memoryEvent(memory.friendId, memory.id, "update", before, after)
    }

    fun deleteMemory(memory: Memory) {
        val before = read(
            "memory",
            "memories",
            mapOf("id" to text(memory.id)),
            1,
        ).firstOrNull()
        write("memory", "memories", WriteOp.DELETE, buildJsonObject { put("id", text(memory.id)) })
        memoryEvent(memory.friendId, memory.id, "delete", before, null)
    }

    fun recallMemories(friendId: String, query: String): List<Memory> {
        val all = memories(friendId)
        val terms = query.split(Regex("[\\s,，。！？!?；;]+")).filter { it.length >= 2 }
        val hits = all.filter { memory ->
            terms.any { memory.content.contains(it, ignoreCase = true) }
        }
        val pinned = all.filter { it.layer == "pinned" }
        val important = all
            .filter { it.layer == "permanent" || it.layer == "long_term" }
            .sortedByDescending { it.importance }
            .take(8)
        return (pinned + hits + important).distinctBy { it.id }.take(20)
    }

    private fun memoryEvent(
        friendId: String,
        memoryId: String,
        action: String,
        before: JsonObject?,
        after: JsonObject?,
    ) {
        write(
            "memory",
            "memory_events",
            WriteOp.CREATE,
            buildJsonObject {
                put("id", text(UUID.randomUUID().toString()))
                put("friend_id", text(friendId))
                put("memory_id", text(memoryId))
                put("actor", text("user"))
                put("action", text(action))
                put("before_json", before?.let { text(it.toString()) } ?: JsonNull)
                put("after_json", after?.let { text(it.toString()) } ?: JsonNull)
                put("created_at", text(now()))
            },
        )
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

    fun createSchedule(friendId: String, title: String, date: String, time: String): Schedule {
        val id = UUID.randomUUID().toString()
        val record = write(
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
        )!!
        scheduleEvent(friendId, id, "create", null, record)
        return Schedule(
            id,
            friendId,
            title,
            date,
            time,
            record.int("advance_minutes"),
            record.str("state"),
        )
    }

    fun settleSchedule(schedule: Schedule, reason: String) {
        val before = scheduleRecord(schedule.id)
        val after = write(
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
        scheduleEvent(schedule.friendId, schedule.id, "settle", before, after)
    }

    fun updateSchedule(
        schedule: Schedule,
        title: String,
        date: String,
        time: String,
    ): Schedule {
        val before = scheduleRecord(schedule.id)
        val after = write(
            "schedule",
            "schedules",
            WriteOp.UPDATE,
            buildJsonObject {
                put("id", text(schedule.id))
                put("title", text(title))
                put("date_local", text(date))
                put("time_local", if (time.isBlank()) JsonNull else text(time))
            },
        )
        scheduleEvent(schedule.friendId, schedule.id, "update", before, after)
        return Schedule(
            schedule.id,
            schedule.friendId,
            title,
            date,
            time,
            schedule.advanceMinutes,
            schedule.state,
        )
    }

    fun deleteSchedule(schedule: Schedule) {
        val before = scheduleRecord(schedule.id)
        write("schedule", "schedules", WriteOp.DELETE, buildJsonObject { put("id", text(schedule.id)) })
        scheduleEvent(schedule.friendId, schedule.id, "delete", before, null)
    }

    fun pendingSchedules(): List<Schedule> = read(
        "schedule",
        "schedules",
        emptyMap(),
        1_000_000,
    ).mapNotNull(::toSchedule)

    fun scheduleById(id: String): Schedule? = scheduleRecord(id)?.let(::toSchedule)

    fun remindSchedule(id: String): String? {
        val record = scheduleRecord(id) ?: return null
        val schedule = toSchedule(record) ?: return null
        if (schedule.state !in setOf("pending", "active") || schedule.timeLocal.isBlank()) return null
        val reminded = read(
            "schedule",
            "schedule_events",
            mapOf("schedule_id" to text(id)),
        ).any { it.str("action") == "remind" }
        if (reminded) return null
        createMessage(
            schedule.friendId,
            "system",
            "日程提醒：${schedule.title}",
        )
        scheduleEvent(schedule.friendId, schedule.id, "remind", null, record, actor = "system")
        return schedule.title
    }

    private fun scheduleRecord(id: String): JsonObject? = read(
        "schedule",
        "schedules",
        mapOf("id" to text(id)),
        1,
    ).firstOrNull()

    private fun toSchedule(it: JsonObject): Schedule? {
        val id = it.str("id")
        if (id.isBlank()) return null
        return Schedule(
            id,
            it.str("friend_id"),
            it.str("title"),
            it.str("date_local"),
            it.str("time_local"),
            it.int("advance_minutes"),
            it.str("state"),
        )
    }

    private fun scheduleEvent(
        friendId: String,
        scheduleId: String,
        action: String,
        before: JsonObject?,
        after: JsonObject?,
        actor: String = "user",
    ) {
        write(
            "schedule",
            "schedule_events",
            WriteOp.CREATE,
            buildJsonObject {
                put("id", text(UUID.randomUUID().toString()))
                put("friend_id", text(friendId))
                put("schedule_id", text(scheduleId))
                put("actor", text(actor))
                put("action", text(action))
                put("before_json", before?.let { text(it.toString()) } ?: JsonNull)
                put("after_json", after?.let { text(it.toString()) } ?: JsonNull)
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
        var start = 0
        var index = 0
        while (start < content.length) {
            val end = (start + 800).coerceAtMost(content.length)
            write(
                "document",
                "document_chunks",
                WriteOp.CREATE,
                buildJsonObject {
                    put("document_id", text(documentId))
                    put("friend_id", text(friendId))
                    put("seq", number(index))
                    put("text", text(content.substring(start, end)))
                },
            )
            if (end == content.length) break
            start = end - 100
            index += 1
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

    fun voices(): List<Voice> = read("voice", "voices", limit = 500)
        .sortedBy { it.str("name") }
        .map {
            val config = runCatching {
                json.parseToJsonElement(it.str("config_json")) as JsonObject
            }.getOrNull()
            Voice(
                it.str("id"),
                it.str("name"),
                config?.str("engine_voice").orEmpty(),
                config?.str("locale").orEmpty(),
            )
        }

    fun voiceById(id: String): Voice? = voices().find { it.id == id }

    fun features(): FeatureFlags = FeatureFlags(
        memory = featureEnabled("feature_memory_enabled"),
        schedule = featureEnabled("feature_schedule_enabled"),
        voice = featureEnabled("feature_voice_enabled"),
        knowledge = featureEnabled("feature_knowledge_enabled"),
    )

    fun setFeature(key: String, enabled: Boolean) {
        putSetting(key, JsonPrimitive(enabled).toString())
    }

    private fun featureEnabled(key: String): Boolean {
        val raw = setting(key) ?: return true
        return raw.removeSurrounding("\"") == "true"
    }

    fun addVoice(name: String, engineVoice: String, locale: String): Voice {
        val id = UUID.randomUUID().toString()
        write(
            "voice",
            "voices",
            WriteOp.CREATE,
            buildJsonObject {
                put("id", text(id))
                put("name", text(name))
                put("provider", text("system"))
                put(
                    "config_json",
                    text(
                        buildJsonObject {
                            put("engine_voice", text(engineVoice))
                            put("locale", text(locale))
                        }.toString(),
                    ),
                )
                put("speed", number(1.0))
            },
        )
        return Voice(id, name, engineVoice, locale)
    }

    fun deleteVoice(voiceId: String) {
        write("voice", "voices", WriteOp.DELETE, buildJsonObject { put("id", text(voiceId)) })
    }

    fun bindVoice(friendId: String, voiceId: String?, replyEnabled: Boolean) {
        write(
            "friend",
            "friends",
            WriteOp.UPDATE,
            buildJsonObject {
                put("id", text(friendId))
                put("voice_id", voiceId?.let(::text) ?: JsonNull)
                put("voice_reply_enabled", number(if (replyEnabled) 1 else 0))
            },
        )
    }

    fun importLegacy(context: android.content.Context, dbFile: java.io.File) {
        LegacyImport.run(
            dbFile,
            create = { module, entity, data -> write(module, entity, WriteOp.CREATE, data) },
            putSetting = ::putSetting,
            saveAvatar = { relativePath ->
                relativePath?.let { AssetStore.saveFile(context, java.io.File(context.filesDir, it)) }
            },
        )
    }

    private suspend fun streamReply(
        friend: Friend,
        userText: String,
        assistantId: String,
        emit: suspend (ChatEvent) -> Unit,
        onDelta: (String) -> Unit,
    ) {
        try {
            val config = llmConfig() ?: error("请先在设置里填写模型")
            val memoryText = if (featureEnabled("feature_memory_enabled")) {
                recallMemories(friend.id, userText).joinToString("\n") { "- ${it.content}" }
            } else {
                ""
            }
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
            emit(ChatEvent.End(messageById(assistantId)!!))
            if (featureEnabled("feature_memory_enabled")) {
                CoroutineScope(Dispatchers.IO).launch {
                    extractMemories(friend.id, messages.filter { it.first != "system" }, reply, config)
                }
            }
        } catch (error: CancellationException) {
            withContext(NonCancellable) {
                streamingDrafts[assistantId]?.let { updateMessage(assistantId, it, "partial") }
            }
            throw error
        } catch (error: Exception) {
            updateMessage(assistantId, error.message.orEmpty(), "error")
            emit(ChatEvent.Error(messageById(assistantId)!!))
        } finally {
            streamingDrafts.remove(assistantId)
        }
    }

    private suspend fun extractMemories(
        friendId: String,
        history: List<Pair<String, String>>,
        assistantContent: String,
        config: LlmConfig,
    ) {
        try {
            val known = memories(friendId).map { it.content }.toMutableSet()
            val dialogue = history.takeLast(20)
                .joinToString("\n") { (role, content) -> "$role: $content" } +
                "\nassistant: $assistantContent"
            val reply = openAi.complete(
                config,
                listOf(
                    "system" to (
                        "从对话里提取值得长期记住的事实、偏好或约定。" +
                            "只返回 JSON 数组，每项格式 " +
                            "{\"content\":\"...\",\"kind\":\"fact|preference|promise|experience|insight\"}。" +
                            "没有可记的就返回 []。不要编造。"
                        ),
                    "user" to dialogue,
                ),
                temperature = 0.2,
            )
            val start = reply.indexOf('[')
            val end = reply.lastIndexOf(']')
            if (start < 0 || end < start) return
            val items = JSONArray(reply.substring(start, end + 1))
            for (index in 0 until minOf(items.length(), 3)) {
                val item = items.optJSONObject(index) ?: continue
                val content = item.optString("content").trim()
                if (content.isBlank() || content in known) continue
                val kind = item.optString("kind")
                    .takeIf { it in setOf("fact", "preference", "promise", "experience", "insight") }
                    ?: "fact"
                saveMemory(friendId, content, kind, "agent")
                known += content
            }
        } catch (_: Exception) {
        }
    }

    private val streamingDrafts = mutableMapOf<String, String>()

    fun sendMessageStream(friend: Friend, text: String): Flow<ChatEvent> = flow {
        createMessage(friend.id, "user", text)
        val assistant = createMessage(friend.id, "assistant", "", "streaming")
        streamingDrafts[assistant.id] = ""
        emit(ChatEvent.Start(assistant))
        var content = ""
        streamReply(friend, text, assistant.id, emit = { emit(it) }) { delta ->
            content += delta
            streamingDrafts[assistant.id] = content
        }
        return@flow
    }

    fun retryMessage(messageId: String): Flow<ChatEvent> = flow {
        val user = messageById(messageId) ?: error("消息不存在")
        val friend = friends().find { it.id == user.friendId } ?: error("朋友不存在")
        val assistant = createMessage(friend.id, "assistant", "", "streaming")
        streamingDrafts[assistant.id] = ""
        emit(ChatEvent.Start(assistant))
        var content = ""
        streamReply(friend, user.content, assistant.id, emit = { emit(it) }) { delta ->
            content += delta
            streamingDrafts[assistant.id] = content
        }
        return@flow
    }

    fun messageById(id: String): Message? = read(
        "chat",
        "messages",
        mapOf("id" to text(id)),
        1,
    ).firstOrNull()?.let {
        Message(
            it.str("id"),
            it.str("friend_id"),
            it.str("role"),
            it.str("content"),
            it.str("status"),
            it.str("created_at"),
            it.str("sources_json"),
            it.str("tool_calls_json"),
        )
    }

    fun stopMessage(messageId: String) {
        streamingDrafts[messageId]?.let { updateMessage(messageId, it, "partial") }
    }

    private fun now(): String = Instant.now().toString()
}
