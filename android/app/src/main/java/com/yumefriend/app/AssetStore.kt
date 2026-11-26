package com.yumefriend.app

import android.content.Context
import android.net.Uri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.UUID

object AssetStore {
    private val lock = Any()

    suspend fun saveImage(context: Context, uri: Uri): String = withContext(Dispatchers.IO) {
        val mime = context.contentResolver.getType(uri) ?: "image/*"
        val data = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
            ?: error("无法读取图片")
        saveBytes(context, data, mime)
    }

    fun saveFile(context: Context, file: File): String? {
        if (!file.exists()) return null
        val mime = when (file.extension.lowercase()) {
            "png" -> "image/png"
            "jpg", "jpeg" -> "image/jpeg"
            "webp" -> "image/webp"
            "gif" -> "image/gif"
            else -> "image/*"
        }
        return saveBytes(context, file.readBytes(), mime)
    }

    private fun saveBytes(context: Context, data: ByteArray, mime: String): String {
        val sha = MessageDigest.getInstance("SHA-256").digest(data)
            .joinToString("") { "%02x".format(it) }
        return synchronized(lock) {
            val directory = File(context.filesDir, "assets").apply { mkdirs() }
            val indexFile = File(directory, "index.json")
            val index = if (indexFile.exists()) JSONObject(indexFile.readText()) else JSONObject()
            index.keys().forEach { id ->
                if (index.getJSONObject(id).optString("sha256") == sha) return@synchronized id
            }
            val id = UUID.randomUUID().toString()
            val suffix = when (mime) {
                "image/png" -> ".png"
                "image/jpeg" -> ".jpg"
                "image/webp" -> ".webp"
                "image/gif" -> ".gif"
                else -> ".img"
            }
            val file = File(directory, "$id$suffix")
            file.writeBytes(data)
            index.put(
                id,
                JSONObject()
                    .put("sha256", sha)
                    .put("kind", "image")
                    .put("mime", mime)
                    .put("size", data.size)
                    .put("path", file.name)
                    .put("created_at", java.time.Instant.now().toString()),
            )
            indexFile.writeText(index.toString())
            id
        }
    }

    fun file(context: Context, assetId: String): File? {
        val directory = File(context.filesDir, "assets")
        val indexFile = File(directory, "index.json")
        if (!indexFile.exists()) return null
        val item = runCatching {
            JSONObject(indexFile.readText()).optJSONObject(assetId)
        }.getOrNull() ?: return null
        return File(directory, item.optString("path")).takeIf { it.exists() }
    }

    fun list(context: Context): List<LocalAssetInfo> {
        val directory = File(context.filesDir, "assets")
        val indexFile = File(directory, "index.json")
        if (!indexFile.exists()) return emptyList()
        val index = runCatching { JSONObject(indexFile.readText()) }.getOrNull() ?: return emptyList()
        return index.keys().asSequence().mapNotNull { id ->
            val item = index.optJSONObject(id) ?: return@mapNotNull null
            LocalAssetInfo(
                assetId = id,
                sha256 = item.optString("sha256"),
                kind = item.optString("kind"),
                mime = item.optString("mime"),
                size = item.optLong("size"),
            )
        }.toList()
    }

    fun saveIncoming(context: Context, sha: String, assetId: String, mime: String, data: ByteArray) {
        synchronized(lock) {
            val directory = File(context.filesDir, "assets").apply { mkdirs() }
            val indexFile = File(directory, "index.json")
            val index = if (indexFile.exists()) JSONObject(indexFile.readText()) else JSONObject()
            val suffix = when (mime) {
                "image/png" -> ".png"
                "image/jpeg" -> ".jpg"
                "image/webp" -> ".webp"
                "image/gif" -> ".gif"
                "audio/mpeg" -> ".mp3"
                "audio/wav" -> ".wav"
                else -> ".bin"
            }
            val file = File(directory, "$assetId$suffix")
            file.writeBytes(data)
            index.put(
                assetId,
                JSONObject()
                    .put("sha256", sha)
                    .put("kind", if (mime.startsWith("image/")) "image" else "file")
                    .put("mime", mime)
                    .put("size", data.size)
                    .put("path", file.name)
                    .put("created_at", java.time.Instant.now().toString()),
            )
            indexFile.writeText(index.toString())
        }
    }

    fun bytes(context: Context, sha: String): ByteArray? {
        val info = list(context).firstOrNull { it.sha256 == sha } ?: return null
        return file(context, info.assetId)?.readBytes()
    }
}

data class LocalAssetInfo(
    val assetId: String,
    val sha256: String,
    val kind: String,
    val mime: String,
    val size: Long,
)
