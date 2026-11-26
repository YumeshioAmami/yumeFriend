package com.yumefriend.app

import android.content.Context
import android.graphics.Color
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.view.ViewGroup
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color as ComposeColor
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.viewinterop.AndroidView
import androidx.webkit.WebViewAssetLoader
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

object Live2DRuntime {
    const val CORE_URL = "https://cubism.live2d.com/sdk-web/core/05/live2dcubismcore.min.js"
    const val PROPRIETARY_LICENSE_URL =
        "https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html"
    const val OPEN_LICENSE_URL =
        "https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html"

    fun coreFile(context: Context): File = File(context.filesDir, "live2d/live2dcubismcore.min.js")

    fun available(context: Context): Boolean = coreFile(context).exists()

    suspend fun download(context: Context, onProgress: (Int) -> Unit): File = withContext(Dispatchers.IO) {
        val connection = URL(CORE_URL).openConnection() as HttpURLConnection
        connection.connectTimeout = 20_000
        connection.readTimeout = 60_000
        try {
            val total = connection.contentLengthLong
            val file = coreFile(context)
            file.parentFile?.mkdirs()
            connection.inputStream.use { input ->
                file.outputStream().use { output ->
                    val buffer = ByteArray(8192)
                    var written = 0L
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        output.write(buffer, 0, read)
                        written += read
                        if (total > 0) onProgress((written * 100 / total).toInt())
                    }
                }
            }
            onProgress(100)
            file
        } finally {
            connection.disconnect()
        }
    }
}

@Composable
fun Live2DView(modelPath: String, modifier: Modifier = Modifier) {
    val context = androidx.compose.ui.platform.LocalContext.current
    if (!Live2DRuntime.available(context)) {
        Box(modifier, contentAlignment = Alignment.Center) {
            Text("请先在设置下载 Live2D 运行库", color = ComposeColor.White.copy(alpha = 0.55f))
        }
        return
    }
    val assetLoader = remember {
        WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context))
            .addPathHandler("/files/", WebViewAssetLoader.InternalStoragePathHandler(context, context.filesDir))
            .build()
    }
    val webView = remember {
        WebView(context).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            setBackgroundColor(Color.TRANSPARENT)
            settings.javaScriptEnabled = true
            settings.allowContentAccess = true
            settings.allowFileAccess = false
            isVerticalScrollBarEnabled = false
            isHorizontalScrollBarEnabled = false
            isClickable = false
            isFocusable = false
        }
    }
    var ready by remember { mutableStateOf(false) }
    DisposableEffect(webView) {
        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest,
            ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

            override fun onPageFinished(view: WebView, url: String) {
                ready = true
            }
        }
        webView.loadUrl("https://appassets.androidplatform.net/assets/live2d/live2d.html")
        onDispose { webView.destroy() }
    }
    LaunchedEffect(ready, modelPath) {
        if (!ready) return@LaunchedEffect
        val coreUrl = "https://appassets.androidplatform.net/files/live2d/live2dcubismcore.min.js"
        val modelUrl = "https://appassets.androidplatform.net/assets/${modelPath.trimStart('/')}"
        webView.evaluateJavascript(
            "window.startLive2D(${JSONObject.quote(coreUrl)}, ${JSONObject.quote(modelUrl)});",
            null,
        )
    }
    AndroidView(
        factory = { webView },
        modifier = modifier.onSizeChanged { size ->
            if (size.width > 0 && size.height > 0) {
                webView.post {
                    webView.evaluateJavascript(
                        "window.dispatchEvent(new Event('resize'));",
                        null,
                    )
                }
            }
        },
    )
}
