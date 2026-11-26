package com.yumefriend.app

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class LlmConfig(
    val baseUrl: String,
    val apiKey: String,
    val model: String,
)

class OpenAiClient {
    suspend fun streamChat(
        config: LlmConfig,
        messages: List<Pair<String, String>>,
        temperature: Double = 0.7,
        onDelta: (String) -> Unit,
    ): String = withContext(Dispatchers.IO) {
        val connection = request(config, messages, temperature, stream = true)
        val result = StringBuilder()
        connection.inputStream.bufferedReader().useLines { lines ->
            for (line in lines) {
                if (!line.startsWith("data:")) continue
                val data = line.removePrefix("data:").trim()
                if (data == "[DONE]") break
                val text = JSONObject(data)
                    .optJSONArray("choices")
                    ?.optJSONObject(0)
                    ?.optJSONObject("delta")
                    ?.optString("content")
                    .orEmpty()
                if (text.isNotEmpty()) {
                    result.append(text)
                    onDelta(text)
                }
            }
        }
        connection.disconnect()
        result.toString()
    }

    suspend fun complete(
        config: LlmConfig,
        messages: List<Pair<String, String>>,
        temperature: Double = 0.2,
    ): String = withContext(Dispatchers.IO) {
        val connection = request(config, messages, temperature, stream = false)
        val body = connection.inputStream.bufferedReader().readText()
        connection.disconnect()
        JSONObject(body)
            .optJSONArray("choices")
            ?.optJSONObject(0)
            ?.optJSONObject("message")
            ?.optString("content")
            .orEmpty()
    }

    private fun request(
        config: LlmConfig,
        messages: List<Pair<String, String>>,
        temperature: Double,
        stream: Boolean,
    ): HttpURLConnection {
        val url = URL("${config.baseUrl.trimEnd('/')}/chat/completions")
        val connection = url.openConnection() as HttpURLConnection
        connection.requestMethod = "POST"
        connection.connectTimeout = 30_000
        connection.readTimeout = 180_000
        connection.doOutput = true
        connection.setRequestProperty("Content-Type", "application/json")
        connection.setRequestProperty("Authorization", "Bearer ${config.apiKey}")
        val payload = JSONObject()
            .put("model", config.model)
            .put("temperature", temperature)
            .put("stream", stream)
            .put(
                "messages",
                JSONArray().apply {
                    messages.forEach { (role, content) ->
                        put(JSONObject().put("role", role).put("content", content))
                    }
                },
            )
        connection.outputStream.use { it.write(payload.toString().toByteArray()) }
        if (connection.responseCode !in 200..299) {
            val code = connection.responseCode
            val detail = connection.errorStream?.bufferedReader()?.readText().orEmpty()
            connection.disconnect()
            error("模型请求失败：$code $detail")
        }
        return connection
    }
}
