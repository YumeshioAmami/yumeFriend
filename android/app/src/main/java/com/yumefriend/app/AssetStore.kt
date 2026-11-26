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
}
