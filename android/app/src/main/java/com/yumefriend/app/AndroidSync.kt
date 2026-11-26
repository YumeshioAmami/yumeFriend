package com.yumefriend.app

import android.content.Context
import com.yume.core.DeviceRecord
import com.yume.core.DiscoveredPeer
import com.yume.core.GrantRecord
import com.yume.core.GrantRequest
import com.yume.core.PairRequest
import com.yume.core.PairResult
import com.yume.core.PeerDiscovery
import com.yume.core.PeerRecord
import com.yume.core.SyncChange
import com.yume.core.SyncPullRequest
import com.yume.core.SyncPullResult
import com.yume.core.SyncPushRequest
import fi.iki.elonen.NanoHTTPD
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.time.Instant
import java.util.UUID
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

@Serializable
data class SyncRunResult(
    val pushed: Int = 0,
    val pulled: Int = 0,
    val assetsSent: Int = 0,
    val assetsReceived: Int = 0,
)

@Serializable
private data class RemoteAsset(
    val asset_id: String,
    val sha256: String,
    val mime: String = "",
)

@Serializable
private data class PeerInfo(
    val product_id: String,
    val device_id: String,
    val protocol_version: Int = 1,
)

object AndroidSyncRuntime {
    const val PORT = 47896

    @Volatile
    var discovered: List<DiscoveredPeer> = emptyList()
        private set

    private var context: Context? = null
    private var repository: YumeRepository? = null
    private var discovery: PeerDiscovery? = null
    private var server: PeerServer? = null
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    fun start(appContext: Context, repository: YumeRepository, deviceId: String) {
        if (server != null) return
        context = appContext.applicationContext
        this.repository = repository
        server = PeerServer(appContext.applicationContext, repository, deviceId).also {
            runCatching { it.start(NanoHTTPD.SOCKET_READ_TIMEOUT, false) }
        }
        discovery = runCatching {
            PeerDiscovery(
                productId = "yumeFriend",
                deviceId = deviceId,
                coreVersion = "0.2.0",
                port = PORT,
                onFound = { peer ->
                    if (peer.deviceId != deviceId && peer.protocolVersion == 1) {
                        discovered = (discovered.filterNot { it.deviceId == peer.deviceId } + peer)
                        repository.upsertDevice(
                            DeviceRecord(
                                id = peer.deviceId,
                                name = peer.productId,
                                kind = "unknown",
                                productId = peer.productId,
                                lastSeenAt = Instant.now().toString(),
                                createdAt = Instant.now().toString(),
                            ),
                        )
                    }
                },
                onLost = { deviceIdLost ->
                    discovered = discovered.filterNot { it.deviceId == deviceIdLost }
                },
            )
        }.getOrNull()
        runCatching { discovery?.start() }
    }

    fun stop() {
        discovery?.stop()
        discovery = null
        server?.stop()
        server = null
    }

    fun pair(context: Context, device: DiscoveredPeer): PairResult {
        val repo = repository ?: error("同步未启动")
        val response = httpJson(
            "POST",
            "http://${device.host}:${device.port}/peer/v1/pair/request",
            json.encodeToString(PairRequest("yumeFriend", deviceId(context), 1)).encodeToByteArray(),
            emptyMap(),
        )
        val result = json.decodeFromString<PairResult>(response.decodeToString())
        repo.createPeer(
            result.peerId,
            device.productId,
            device.deviceId,
            device.productId,
            "unknown",
            result.pairSecret,
        )
        repo.putSyncState("peer_address:${device.deviceId}", "${device.host}:${device.port}")
        repo.syncModuleIds().forEach { repo.grant(result.peerId, GrantRequest(it, null, "write")) }
        return result
    }

    fun pairAddress(context: Context, host: String, port: Int): PairResult {
        val repo = repository ?: error("同步未启动")
        val base = "http://$host:$port"
        val info = json.decodeFromString<PeerInfo>(
            httpJson("GET", "$base/peer/v1/info", null, emptyMap()).decodeToString(),
        )
        val response = httpJson(
            "POST",
            "$base/peer/v1/pair/request",
            json.encodeToString(PairRequest("yumeFriend", deviceId(context), 1)).encodeToByteArray(),
            emptyMap(),
        )
        val result = json.decodeFromString<PairResult>(response.decodeToString())
        discovered = (discovered.filterNot { it.deviceId == info.device_id }) + DiscoveredPeer(
            productId = info.product_id,
            deviceId = info.device_id,
            protocolVersion = info.protocol_version,
            coreVersion = "",
            host = host,
            port = port,
        )
        repo.createPeer(
            result.peerId,
            info.product_id,
            info.device_id,
            info.product_id,
            "unknown",
            result.pairSecret,
        )
        repo.putSyncState("peer_address:${info.device_id}", "$host:$port")
        repo.syncModuleIds().forEach { repo.grant(result.peerId, GrantRequest(it, null, "write")) }
        return result
    }

    fun runLan(
        context: Context,
        peer: PeerRecord,
        host: String,
        port: Int,
        direction: String,
    ): SyncRunResult {
        val repo = repository ?: error("同步未启动")
        val base = "http://$host:$port"
        val headers = mapOf("X-YF-Peer-Token" to peer.pairSecret)
        val remoteGrants = json.decodeFromString<List<GrantRecord>>(
            httpJson("GET", "$base/peer/v1/grants", null, headers).decodeToString(),
        )
        val pullModules = remoteGrants
            .filter { it.permission == "read" || it.permission == "write" }
            .map { it.moduleId }
            .distinct()
        val pushModules = remoteGrants.filter { it.permission == "write" }.map { it.moduleId }.toSet()
        var result = SyncRunResult()
        if (direction == "push" || direction == "both") {
            val cursor = repo.syncState("peer:${peer.id}:push_cursor")
            val local = repo.pull(SyncPullRequest(deviceId(context), cursor, pullModules))
            val changes = local.changes.filter { it.moduleId in pushModules }
            val tombstones = local.tombstones.filter { it.moduleId in pushModules }
            if (changes.isNotEmpty() || tombstones.isNotEmpty()) {
                httpJson(
                    "POST",
                    "$base/peer/v1/push",
                    json.encodeToString(SyncPushRequest(deviceId(context), cursor, changes, tombstones))
                        .encodeToByteArray(),
                    headers + ("Content-Type" to "application/json"),
                )
                result = result.copy(
                    pushed = changes.size + tombstones.size,
                    assetsSent = sendAssets(context, "$base/peer/v1", headers, collectAssetIds(changes), false),
                )
            }
            repo.putSyncState("peer:${peer.id}:push_cursor", local.cursor.orEmpty())
        }
        if (direction == "pull" || direction == "both") {
            val cursor = repo.syncState("peer:${peer.id}:pull_cursor")
            val response = httpJson(
                "POST",
                "$base/peer/v1/pull",
                json.encodeToString(SyncPullRequest(deviceId(context), cursor, pullModules)).encodeToByteArray(),
                headers + ("Content-Type" to "application/json"),
            )
            val pulled = json.decodeFromString<SyncPullResult>(response.decodeToString())
            repo.push(SyncPushRequest(deviceId(context), pulled.cursor, pulled.changes, pulled.tombstones))
            result = result.copy(
                pulled = pulled.changes.size + pulled.tombstones.size,
                assetsReceived = receiveAssets(context, "$base/peer/v1", headers, collectAssetIds(pulled.changes), false),
            )
            repo.putSyncState("peer:${peer.id}:pull_cursor", pulled.cursor.orEmpty())
        }
        return result
    }

    fun runServer(context: Context, url: String, token: String, direction: String): SyncRunResult {
        val repo = repository ?: error("同步未启动")
        val base = url.trimEnd('/')
        val headers = mapOf("X-YF-Server-Token" to token)
        val modules = repo.syncModuleIds()
        var result = SyncRunResult()
        if (direction == "push" || direction == "both") {
            val cursor = repo.syncState("server:push_cursor")
            val local = repo.pull(SyncPullRequest(deviceId(context), cursor, modules))
            if (local.changes.isNotEmpty() || local.tombstones.isNotEmpty()) {
                httpJson(
                    "POST",
                    "$base/server-sync/v1/push",
                    json.encodeToString(SyncPushRequest(deviceId(context), cursor, local.changes, local.tombstones))
                        .encodeToByteArray(),
                    headers + ("Content-Type" to "application/json"),
                )
                result = result.copy(
                    pushed = local.changes.size + local.tombstones.size,
                    assetsSent = sendAssets(
                        context,
                        "$base/server-sync/v1",
                        headers,
                        collectAssetIds(local.changes),
                        true,
                    ),
                )
            }
            repo.putSyncState("server:push_cursor", local.cursor.orEmpty())
        }
        if (direction == "pull" || direction == "both") {
            val cursor = repo.syncState("server:pull_cursor")
            val response = httpJson(
                "POST",
                "$base/server-sync/v1/pull",
                json.encodeToString(SyncPullRequest(deviceId(context), cursor, modules)).encodeToByteArray(),
                headers + ("Content-Type" to "application/json"),
            )
            val pulled = json.decodeFromString<SyncPullResult>(response.decodeToString())
            repo.push(SyncPushRequest(deviceId(context), pulled.cursor, pulled.changes, pulled.tombstones))
            result = result.copy(
                pulled = pulled.changes.size + pulled.tombstones.size,
                assetsReceived = receiveAssets(
                    context,
                    "$base/server-sync/v1",
                    headers,
                    collectAssetIds(pulled.changes),
                    true,
                ),
            )
            repo.putSyncState("server:pull_cursor", pulled.cursor.orEmpty())
        }
        return result
    }

    private fun sendAssets(
        context: Context,
        base: String,
        headers: Map<String, String>,
        assetIds: Set<String>,
        server: Boolean,
    ): Int {
        if (assetIds.isEmpty()) return 0
        val remote = json.decodeFromString<AssetListPayload>(
            httpJson("GET", "$base/assets", null, headers).decodeToString(),
        ).items.associateBy { it.asset_id }
        val local = AssetStore.list(context).associateBy { it.assetId }
        var count = 0
        assetIds.forEach { id ->
            if (id in remote) return@forEach
            val info = local[id] ?: return@forEach
            if (server && info.mime.startsWith("audio/")) return@forEach
            val bytes = AssetStore.bytes(context, info.sha256) ?: return@forEach
            httpBytes(
                "POST",
                "$base/assets/${info.sha256}?asset_id=${encode(id)}&mime=${encode(info.mime)}",
                headers,
                bytes,
            )
            count += 1
        }
        return count
    }

    private fun receiveAssets(
        context: Context,
        base: String,
        headers: Map<String, String>,
        assetIds: Set<String>,
        server: Boolean,
    ): Int {
        if (assetIds.isEmpty()) return 0
        val local = AssetStore.list(context).associateBy { it.assetId }
        val remote = json.decodeFromString<AssetListPayload>(
            httpJson("GET", "$base/assets", null, headers).decodeToString(),
        ).items.associateBy { it.asset_id }
        var count = 0
        assetIds.forEach { id ->
            if (id in local) return@forEach
            val info = remote[id] ?: return@forEach
            if (server && info.mime.startsWith("audio/")) return@forEach
            val bytes = httpBytes("GET", "$base/assets/${info.sha256}", headers, null)
            AssetStore.saveIncoming(context, info.sha256, id, info.mime, bytes)
            count += 1
        }
        return count
    }

    private fun collectAssetIds(changes: List<SyncChange>): Set<String> {
        val result = mutableSetOf<String>()
        fun visit(value: JsonElement) {
            when (value) {
                is JsonObject -> value.forEach { (name, child) ->
                    if (name == "asset_id" || name.endsWith("_asset_id")) {
                        (child as? JsonPrimitive)?.content?.takeIf { it.isNotBlank() }?.let(result::add)
                    } else if (name == "asset_ids" || name.endsWith("_asset_ids")) {
                        (child as? JsonArray)?.forEach {
                            (it as? JsonPrimitive)?.content?.takeIf { text -> text.isNotBlank() }
                                ?.let(result::add)
                        }
                    } else visit(child)
                }
                is JsonArray -> value.forEach(::visit)
                else -> Unit
            }
        }
        changes.forEach { visit(it.data) }
        return result
    }

    private fun deviceId(context: Context): String =
        context.getSharedPreferences("yumeFriend", Context.MODE_PRIVATE)
            .getString("device_id", "")
            .orEmpty()

    private fun encode(value: String): String = URLEncoder.encode(value, Charsets.UTF_8.name())

    private fun httpJson(
        method: String,
        url: String,
        body: ByteArray?,
        headers: Map<String, String>,
    ): ByteArray = httpBytes(method, url, headers, body)

    private fun httpBytes(
        method: String,
        url: String,
        headers: Map<String, String>,
        body: ByteArray?,
    ): ByteArray {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.requestMethod = method
        connection.connectTimeout = 10_000
        connection.readTimeout = 60_000
        headers.forEach { (name, value) -> connection.setRequestProperty(name, value) }
        if (body != null) {
            connection.doOutput = true
            connection.outputStream.use { it.write(body) }
        }
        val code = connection.responseCode
        val stream = if (code in 200..299) connection.inputStream else connection.errorStream
        val data = stream?.use { it.readBytes() } ?: ByteArray(0)
        connection.disconnect()
        if (code !in 200..299) error("同步请求失败：$code ${data.decodeToString()}")
        return data
    }
}

@Serializable
private data class AssetListPayload(val items: List<RemoteAsset> = emptyList())

private class PeerServer(
    private val context: Context,
    private val repository: YumeRepository,
    private val deviceId: String,
) : NanoHTTPD(AndroidSyncRuntime.PORT) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    override fun serve(session: IHTTPSession): Response {
        return try {
            val uri = session.uri
            if (uri == "/peer/v1/info" && session.method == Method.GET) {
                return text(
                    Response.Status.OK,
                    json.encodeToString(PeerInfo("yumeFriend", deviceId)),
                )
            }
            if (uri == "/peer/v1/pair/request" && session.method == Method.POST) {
                return pair(session)
            }
            val peer = peerFromToken(session.headers["x-yf-peer-token"])
                ?: return text(Response.Status.UNAUTHORIZED, """{"error":"token 无效"}""")
            when {
            uri == "/peer/v1/grants" && session.method == Method.GET ->
                text(Response.Status.OK, json.encodeToString(repository.grants(peer.id)))
            uri == "/peer/v1/pull" && session.method == Method.POST ->
                pull(session, peer)
            uri == "/peer/v1/push" && session.method == Method.POST ->
                push(session, peer)
            uri == "/peer/v1/assets" && session.method == Method.GET -> {
                val items = AssetStore.list(context).map {
                    RemoteAsset(it.assetId, it.sha256, it.mime)
                }
                text(Response.Status.OK, json.encodeToString(AssetListPayload(items)))
            }
            uri.startsWith("/peer/v1/assets/") && session.method == Method.GET -> {
                val sha = uri.removePrefix("/peer/v1/assets/")
                val bytes = AssetStore.bytes(context, sha)
                    ?: return text(Response.Status.NOT_FOUND, """{"error":"附件不存在"}""")
                newFixedLengthResponse(Response.Status.OK, "application/octet-stream", bytes.inputStream(), bytes.size.toLong())
            }
            uri.startsWith("/peer/v1/assets/") && session.method == Method.POST -> {
                val sha = uri.removePrefix("/peer/v1/assets/")
                val assetId = session.parameters["asset_id"]?.firstOrNull() ?: return text(
                    Response.Status.BAD_REQUEST,
                    """{"error":"缺少 asset_id"}""",
                )
                val mime = session.parameters["mime"]?.firstOrNull() ?: "application/octet-stream"
                val length = session.headers["content-length"]?.toIntOrNull() ?: 0
                val bytes = session.inputStream.readNBytes(length)
                AssetStore.saveIncoming(context, sha, assetId, mime, bytes)
                newFixedLengthResponse(Response.Status.NO_CONTENT, "text/plain", "")
            }
                else -> text(Response.Status.NOT_FOUND, """{"error":"not found"}""")
            }
        } catch (error: Exception) {
            text(Response.Status.INTERNAL_ERROR, error.stackTraceToString())
        }
    }

    private fun pair(session: IHTTPSession): Response {
        if (repository.setting("sync_pairing_enabled")?.removeSurrounding("\"") != "true") {
            return text(Response.Status.FORBIDDEN, """{"error":"目标设备未允许配对"}""")
        }
        val request = json.decodeFromString<PairRequest>(body(session))
        if (request.protocolVersion != 1) {
            return text(Response.Status.CONFLICT, """{"error":"协议版本不一致"}""")
        }
        val peerId = UUID.randomUUID().toString()
        val secret = UUID.randomUUID().toString()
        repository.createPeer(peerId, request.productId, request.deviceId, request.productId, "unknown", secret)
        repository.syncModuleIds().forEach {
            repository.grant(peerId, GrantRequest(it, null, "write"))
        }
        return text(Response.Status.OK, json.encodeToString(PairResult(peerId, secret)))
    }

    private fun pull(session: IHTTPSession, peer: PeerRecord): Response {
        val request = json.decodeFromString<SyncPullRequest>(body(session))
        if (request.deviceId != peer.deviceId) {
            return text(Response.Status.FORBIDDEN, """{"error":"device_id 不匹配"}""")
        }
        val allowed = repository.grants(peer.id)
            .filter { it.permission == "read" || it.permission == "write" }
            .map { it.moduleId }
            .toSet()
        val modules = if (request.moduleIds.isEmpty()) allowed.toList()
        else request.moduleIds.filter { it in allowed }
        return text(Response.Status.OK, json.encodeToString(repository.pull(request.copy(moduleIds = modules))))
    }

    private fun push(session: IHTTPSession, peer: PeerRecord): Response {
        val request = json.decodeFromString<SyncPushRequest>(body(session))
        if (request.deviceId != peer.deviceId) {
            return text(Response.Status.FORBIDDEN, """{"error":"device_id 不匹配"}""")
        }
        val writable = repository.grants(peer.id)
            .filter { it.permission == "write" }
            .map { it.moduleId }
            .toSet()
        return text(
            Response.Status.OK,
            json.encodeToString(
                repository.push(
                    request.copy(
                        changes = request.changes.filter { it.moduleId in writable },
                        tombstones = request.tombstones.filter { it.moduleId in writable },
                    ),
                ),
            ),
        )
    }

    private fun peerFromToken(token: String?): PeerRecord? =
        token?.let { value -> repository.peers().find { it.pairSecret == value } }

    private fun body(session: IHTTPSession): String {
        val files = HashMap<String, String>()
        session.parseBody(files)
        return files["postData"].orEmpty()
    }

    private fun text(status: Response.IStatus, body: String): Response =
        newFixedLengthResponse(status, "application/json; charset=utf-8", body)
}
