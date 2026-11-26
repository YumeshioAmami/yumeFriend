@file:OptIn(ExperimentalMaterial3Api::class)

package com.yumefriend.app

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ActivityInfo
import android.content.res.Configuration
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.Image
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.yume.core.GrantRequest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonPrimitive
import org.json.JSONArray
import org.json.JSONObject

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 10)
        }
        val repository = (application as YumeApp).repository
        setContent { YumeRoot(repository) }
    }
}

private enum class ChatPanel {
    MEMORY,
    PERSONA,
    SCHEDULE,
    KNOWLEDGE,
}

@Composable
private fun YumeRoot(repository: YumeRepository) {
    var theme by remember { mutableStateOf(repository.loadTheme()) }
    var features by remember { mutableStateOf(repository.features()) }
    var friends by remember { mutableStateOf(repository.friends()) }
    var chatFriend by remember { mutableStateOf<Friend?>(null) }
    var tab by remember { mutableStateOf("friends") }
    val tabs = buildList {
        add("friends" to "朋友")
        if (features.schedule) add("schedule" to "日程")
        add("settings" to "设置")
    }

    fun reload() {
        friends = repository.friends()
        chatFriend = friends.find { it.id == chatFriend?.id }
    }
    LaunchedEffect(features.schedule) {
        if (tab == "schedule" && !features.schedule) tab = "friends"
    }

    MaterialTheme(colorScheme = theme.scheme()) {
        if (chatFriend != null) {
            ChatScreen(
                repository = repository,
                friend = chatFriend!!,
                features = features,
                onBack = { chatFriend = null; reload() },
                onFriendUpdated = { reload() },
            )
        } else {
            Scaffold(
                bottomBar = {
                    Column {
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                        NavigationBar(
                            containerColor = MaterialTheme.colorScheme.background,
                            tonalElevation = 0.dp,
                        ) {
                            tabs.forEach { (key, label) ->
                                NavigationBarItem(
                                    selected = tab == key,
                                    onClick = { tab = key },
                                    icon = { Text(label.take(1)) },
                                    label = { Text(label) },
                                    colors = NavigationBarItemDefaults.colors(
                                        selectedIconColor = MaterialTheme.colorScheme.primary,
                                        selectedTextColor = MaterialTheme.colorScheme.primary,
                                        indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                                        unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                                        unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
                                    ),
                                )
                            }
                        }
                    }
                },
            ) { padding ->
                Box(Modifier.padding(padding)) {
                    when (tab) {
                        "friends" -> FriendsScreen(
                            repository = repository,
                            friends = friends,
                            onOpen = { chatFriend = it },
                            onChanged = { friends = repository.friends() },
                        )
                        "schedule" -> ScheduleTab(repository, friends)
                        else -> SettingsScreen(
                            repository = repository,
                            theme = theme,
                            features = features,
                            onThemeChanged = {
                                theme = it
                                repository.saveTheme(it)
                            },
                            onFeaturesChanged = { features = it },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun FriendsScreen(
    repository: YumeRepository,
    friends: List<Friend>,
    onOpen: (Friend) -> Unit,
    onChanged: () -> Unit,
) {
    var showCreate by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text("朋友", style = MaterialTheme.typography.headlineSmall)
                TextButton(onClick = { showCreate = true }) {
                    Text("＋ 创建朋友", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        }
        items(friends, key = { it.id }) { friend ->
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onOpen(friend) },
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Avatar(friend.name, friend.avatarAssetId, 36)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(friend.name, fontSize = 15.sp)
                        Text(
                            friend.personality.ifBlank { "还没聊过" },
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (friend.unreadCount > 0) {
                        Text(
                            "${friend.unreadCount}",
                            color = MaterialTheme.colorScheme.onPrimary,
                            fontSize = 10.sp,
                            modifier = Modifier
                                .background(MaterialTheme.colorScheme.primary, CircleShape)
                                .padding(horizontal = 5.dp, vertical = 2.dp),
                        )
                    }
                }
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            }
        }
    }
    if (showCreate) {
        FriendDialog("新建朋友", null, { showCreate = false }) { name, personality, instructions ->
            scope.launch {
                repository.createFriend(name, personality, instructions)
                showCreate = false
                onChanged()
            }
        }
    }
}

@Composable
private fun FriendDialog(
    title: String,
    initial: Friend?,
    onDismiss: () -> Unit,
    onSave: (String, String, String) -> Unit,
) {
    var name by remember { mutableStateOf(initial?.name.orEmpty()) }
    var personality by remember { mutableStateOf(initial?.personality.orEmpty()) }
    var instructions by remember { mutableStateOf(initial?.customInstructions.orEmpty()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(name, { name = it }, label = { Text("名字") }, singleLine = true)
                OutlinedTextField(personality, { personality = it }, label = { Text("人格") }, minLines = 3)
                OutlinedTextField(instructions, { instructions = it }, label = { Text("补充要求") }, minLines = 2)
            }
        },
        confirmButton = {
            TextButton(enabled = name.isNotBlank(), onClick = { onSave(name.trim(), personality, instructions) }) {
                Text("保存")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}

@Composable
private fun ChatScreen(
    repository: YumeRepository,
    friend: Friend,
    features: FeatureFlags,
    onBack: () -> Unit,
    onFriendUpdated: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var initialPage by remember { mutableStateOf(repository.messagePage(friend.id, null)) }
    var messages by remember { mutableStateOf(initialPage.items) }
    var nextCursor by remember { mutableStateOf(initialPage.nextCursor) }
    var draft by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var streamingId by remember { mutableStateOf<String?>(null) }
    var generationJob by remember { mutableStateOf<Job?>(null) }
    var panel by remember { mutableStateOf<ChatPanel?>(null) }
    var ttsReady by remember { mutableStateOf(false) }
    var speaking by remember { mutableStateOf(false) }
    var inCall by remember { mutableStateOf(false) }
    var recognizedText by remember { mutableStateOf<String?>(null) }
    var immersive by remember { mutableStateOf(false) }
    val mainHandler = remember { Handler(Looper.getMainLooper()) }
    val tts = remember { TextToSpeech(context) { status -> ttsReady = status == TextToSpeech.SUCCESS } }
    val recognizer = remember {
        SpeechRecognizer.createSpeechRecognizer(context).apply {
            setRecognitionListener(object : RecognitionListener {
                override fun onResults(results: Bundle?) {
                    val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
                    if (!text.isNullOrBlank()) {
                        draft = text
                        recognizedText = text
                    }
                }
                override fun onError(error: Int) = Unit
                override fun onReadyForSpeech(params: Bundle?) = Unit
                override fun onBeginningOfSpeech() = Unit
                override fun onRmsChanged(rmsdB: Float) = Unit
                override fun onBufferReceived(buffer: ByteArray?) = Unit
                override fun onEndOfSpeech() = Unit
                override fun onPartialResults(partialResults: Bundle?) = Unit
                override fun onEvent(eventType: Int, params: Bundle?) = Unit
            })
        }
    }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) startSpeech(recognizer)
    }
    DisposableEffect(tts) {
        tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {
                mainHandler.post { speaking = true }
            }

            override fun onDone(utteranceId: String?) {
                mainHandler.post { speaking = false }
            }

            override fun onError(utteranceId: String?) {
                mainHandler.post { speaking = false }
            }
        })
        onDispose {
            recognizer.destroy()
            tts.stop()
            tts.shutdown()
        }
    }
    LaunchedEffect(friend.id) {
        repository.markRead(friend.id)
    }
    fun beginSpeech() {
        if (sending || speaking) return
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED
        ) startSpeech(recognizer) else permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
    }
    fun speak(messageId: String, text: String) {
        if (!features.voice || !ttsReady || text.isBlank()) return
        val bubbles = text.split("<<<MSG>>>").map { it.trim() }.filter { it.isNotEmpty() }
        if (bubbles.isEmpty()) return
        repository.voiceById(friend.voiceId.orEmpty())?.engineVoice
            ?.let { engineName -> tts.voices?.find { it.name == engineName } }
            ?.let { tts.voice = it }
        tts.stop()
        bubbles.forEachIndexed { index, bubble ->
            tts.speak(
                bubble,
                if (index == 0) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD,
                null,
                "$messageId-$index",
            )
        }
    }
    fun runReply(events: kotlinx.coroutines.flow.Flow<ChatEvent>) {
        generationJob = scope.launch {
            sending = true
            var streamed = ""
            try {
                events.collect { event ->
                    when (event) {
                        is ChatEvent.Start -> {
                            val page = repository.messagePage(friend.id, null)
                            messages = page.items
                            nextCursor = page.nextCursor
                            streamingId = event.message.id
                            streamed = ""
                        }
                        is ChatEvent.Delta -> {
                            streamed += event.text
                            val id = streamingId ?: return@collect
                            messages = messages.map {
                                if (it.id == id) it.copy(content = streamed, status = "streaming") else it
                            }
                        }
                        is ChatEvent.End -> {
                            messages = messages.map { if (it.id == event.message.id) event.message else it }
                        }
                        is ChatEvent.Error -> {
                            messages = messages.map { if (it.id == event.message.id) event.message else it }
                        }
                    }
                }
                if (features.voice && (friend.voiceReplyEnabled || inCall) && ttsReady) {
                    messages.lastOrNull { it.role == "assistant" }?.let {
                        speak(it.id, it.content)
                    }
                }
            } catch (_: CancellationException) {
            } catch (error: Exception) {
                AppLog.record(context, "生成失败：${error.message}")
                streamingId?.let {
                    repository.updateMessage(it, error.message.orEmpty(), "error")
                }
            } finally {
                sending = false
                streamingId = null
                generationJob = null
                messages = repository.messagePage(friend.id, null).items
            }
        }
    }
    fun send() {
        val text = draft.trim()
        if (text.isBlank() || sending) return
        draft = ""
        AppLog.record(context, "发送消息：${friend.name}")
        runReply(repository.sendMessageStream(friend, text))
    }
    fun sendText(text: String) {
        if (text.isBlank() || sending) return
        draft = ""
        AppLog.record(context, "通话发送：${friend.name}")
        runReply(repository.sendMessageStream(friend, text))
    }
    fun hangUp() {
        inCall = false
        recognizer.cancel()
        tts.stop()
        speaking = false
    }
    LaunchedEffect(recognizedText, inCall) {
        val text = recognizedText ?: return@LaunchedEffect
        recognizedText = null
        if (inCall) sendText(text)
    }
    fun stop() {
        AppLog.record(context, "停止生成：${friend.name}")
        streamingId?.let { repository.stopMessage(it) }
        generationJob?.cancel()
    }
    fun loadEarlier() {
        val cursor = nextCursor ?: return
        val page = repository.messagePage(friend.id, cursor)
        messages = page.items + messages
        nextCursor = page.nextCursor
    }
    fun retry(assistantId: String) {
        val index = messages.indexOfFirst { it.id == assistantId }
        val user = messages.take(index).lastOrNull { it.role == "user" } ?: return
        runReply(repository.retryMessage(user.id))
    }

    if (immersive) {
        ImmersiveScreen(repository, friend, features, messages) { immersive = false }
        return
    }

    val currentPanel = panel
    if (currentPanel != null) {
        Column(Modifier.fillMaxSize()) {
            TopAppBar(
                title = { Text(currentPanel.name) },
                navigationIcon = { TextButton(onClick = { panel = null }) { Text("返回") } },
            )
            when (currentPanel) {
                ChatPanel.MEMORY -> MemoryPanel(repository, friend.id)
                ChatPanel.PERSONA -> PersonaPanel(repository, friend, features.voice, onFriendUpdated, onBack)
                ChatPanel.SCHEDULE -> SchedulePanel(repository, friend.id)
                ChatPanel.KNOWLEDGE -> KnowledgePanel(repository, friend.id)
            }
        }
        return
    }

    Column(Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextButton(onClick = onBack) {
                Text("返回", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
            }
            Avatar(friend.name, friend.avatarAssetId, 34)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(friend.name, fontSize = 22.sp)
                Text(
                    if (friend.presence) "现在在线 · 想聊点什么" else "不在场",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            buildList {
                if (features.memory) add("记忆" to ChatPanel.MEMORY)
                add("人格" to ChatPanel.PERSONA)
                if (features.schedule) add("日程" to ChatPanel.SCHEDULE)
                if (features.knowledge) add("知识" to ChatPanel.KNOWLEDGE)
            }.forEach { (label, target) ->
                Text(
                    label,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 12.sp,
                    modifier = Modifier.clickable { panel = target }.padding(vertical = 2.dp),
                )
            }
            if (features.voice) {
                Text(
                    if (speaking) "重播" else "语音",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 12.sp,
                    modifier = Modifier.clickable {
                        val text = messages.lastOrNull { it.role == "assistant" }?.content.orEmpty()
                        if (text.isNotBlank()) speak("reply", text)
                    }.padding(vertical = 2.dp),
                )
                if (speaking) {
                    Text(
                        "停止",
                        color = MaterialTheme.colorScheme.primary,
                        fontSize = 12.sp,
                        modifier = Modifier.clickable {
                            tts.stop()
                            speaking = false
                        }.padding(vertical = 2.dp),
                    )
                }
            }
            Text(
                "沉浸",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 12.sp,
                modifier = Modifier.clickable { immersive = true }.padding(vertical = 2.dp),
            )
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (nextCursor != null) {
                item {
                    TextButton(onClick = { loadEarlier() }) { Text("加载更早") }
                }
            }
            items(messages, key = { it.id }) { message ->
                MessageRow(
                    message,
                    friend.name,
                    friend.avatarAssetId,
                    features.voice,
                    ttsReady,
                    onRetry = { retry(message.id) },
                ) {
                    speak(message.id, message.content)
                }
            }
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (features.voice) {
                if (inCall) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(MaterialTheme.colorScheme.primaryContainer)
                            .pointerInput(sending, speaking, inCall) {
                                detectTapGestures(onPress = {
                                    if (!sending && !speaking) {
                                        beginSpeech()
                                        tryAwaitRelease()
                                        recognizer.stopListening()
                                    }
                                })
                            }
                            .padding(horizontal = 10.dp, vertical = 8.dp),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                painterResource(R.drawable.ic_mic),
                                contentDescription = "按住说话",
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(18.dp),
                            )
                            Spacer(Modifier.width(4.dp))
                            Text(if (speaking) "播放中" else "按住说话", fontSize = 12.sp)
                        }
                    }
                    IconButton(onClick = { hangUp() }, modifier = Modifier.size(36.dp)) {
                        Icon(
                            painterResource(R.drawable.ic_call),
                            contentDescription = "挂断",
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(20.dp),
                        )
                    }
                } else {
                    IconButton(onClick = { beginSpeech() }, modifier = Modifier.size(36.dp)) {
                        Icon(
                            painterResource(R.drawable.ic_mic),
                            contentDescription = "语音输入",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(20.dp),
                        )
                    }
                    IconButton(onClick = { inCall = true }, modifier = Modifier.size(36.dp)) {
                        Icon(
                            painterResource(R.drawable.ic_call),
                            contentDescription = "通话",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(20.dp),
                        )
                    }
                }
            }
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(12.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f))
                    .border(
                        1.dp,
                        MaterialTheme.colorScheme.outlineVariant,
                        RoundedCornerShape(12.dp),
                    )
                    .padding(horizontal = 12.dp, vertical = 8.dp),
            ) {
                BasicTextField(
                    value = draft,
                    onValueChange = { draft = it },
                    modifier = Modifier.fillMaxWidth(),
                    textStyle = MaterialTheme.typography.bodyMedium.copy(
                        color = MaterialTheme.colorScheme.onSurface,
                        fontSize = 14.sp,
                    ),
                    maxLines = 3,
                    decorationBox = { inner ->
                        if (draft.isBlank()) {
                            Text(
                                "说点什么……",
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                fontSize = 14.sp,
                            )
                        }
                        inner()
                    },
                )
            }
            if (sending) {
                Text(
                    "停止",
                    color = MaterialTheme.colorScheme.primary,
                    fontSize = 13.sp,
                    modifier = Modifier.clickable { stop() }.padding(horizontal = 8.dp, vertical = 8.dp),
                )
            } else {
                IconButton(
                    onClick = { send() },
                    enabled = draft.isNotBlank(),
                    modifier = Modifier.size(36.dp),
                ) {
                    Icon(
                        painterResource(R.drawable.ic_send),
                        contentDescription = "发送",
                        tint = if (draft.isNotBlank()) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        },
                        modifier = Modifier.size(20.dp),
                    )
                }
            }
        }
    }
}

private fun startSpeech(recognizer: SpeechRecognizer) {
    recognizer.startListening(
        Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "zh-CN")
        },
    )
}

@Composable
private fun ImmersiveScreen(
    repository: YumeRepository,
    friend: Friend,
    features: FeatureFlags,
    initialMessages: List<Message>,
    onExit: () -> Unit,
) {
    val context = LocalContext.current
    val activity = context as? Activity
    val landscape = LocalConfiguration.current.orientation == Configuration.ORIENTATION_LANDSCAPE
    val scope = rememberCoroutineScope()
    var messages by remember { mutableStateOf(initialMessages) }
    var mode by remember { mutableStateOf("her") }
    var index by remember { mutableStateOf(0) }
    var draft by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var ttsReady by remember { mutableStateOf(false) }
    var speaking by remember { mutableStateOf(false) }
    var playedId by remember { mutableStateOf("") }
    val mainHandler = remember { Handler(Looper.getMainLooper()) }
    val tts = remember { TextToSpeech(context) { status -> ttsReady = status == TextToSpeech.SUCCESS } }
    val lastAssistant = messages.lastOrNull {
        it.role == "assistant" && it.status == "completed" && it.content.isNotBlank()
    }
    val visualPack = remember(friend.id, friend.visualPackId) {
        repository.visualPackById(friend.visualPackId ?: YumeRepository.PORTRAIT_PACK_ID)
    }
    val visualKind = if (friend.visualMode == "live2d") "live2d" else "portrait"
    val units = immersiveUnits(lastAssistant)
    val safeIndex = index.coerceIn(0, (units.size - 1).coerceAtLeast(0))
    val current = units.getOrNull(safeIndex).orEmpty()

    DisposableEffect(tts) {
        tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {
                mainHandler.post { speaking = true }
            }

            override fun onDone(utteranceId: String?) {
                mainHandler.post { speaking = false }
            }

            override fun onError(utteranceId: String?) {
                mainHandler.post { speaking = false }
            }
        })
        onDispose {
            tts.stop()
            tts.shutdown()
        }
    }
    DisposableEffect(Unit) {
        onDispose { activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED }
    }
    fun speak(messageId: String, text: String) {
        if (!features.voice || !ttsReady || text.isBlank()) return
        val bubbles = text.split("<<<MSG>>>").map { it.trim() }.filter { it.isNotEmpty() }
        repository.voiceById(friend.voiceId.orEmpty())?.engineVoice
            ?.let { engineName -> tts.voices?.find { it.name == engineName } }
            ?.let { tts.voice = it }
        tts.stop()
        bubbles.forEachIndexed { bubbleIndex, bubble ->
            tts.speak(
                bubble,
                if (bubbleIndex == 0) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD,
                null,
                "$messageId-$bubbleIndex",
            )
        }
    }
    LaunchedEffect(lastAssistant?.id, lastAssistant?.status, ttsReady) {
        if (lastAssistant?.status != "completed") return@LaunchedEffect
        index = 0
        mode = "her"
        if (playedId != lastAssistant.id) {
            playedId = lastAssistant.id
            speak(lastAssistant.id, lastAssistant.content)
        }
    }
    fun send() {
        val text = draft.trim()
        if (text.isBlank() || sending) return
        draft = ""
        scope.launch {
            sending = true
            try {
                repository.sendMessageStream(friend, text).collect { event ->
                    when (event) {
                        is ChatEvent.Start -> {
                            messages = repository.messagePage(friend.id, null).items
                            index = 0
                            mode = "her"
                        }
                        is ChatEvent.End, is ChatEvent.Error -> {
                            messages = repository.messagePage(friend.id, null).items
                        }
                        is ChatEvent.Delta -> Unit
                    }
                }
            } finally {
                sending = false
                messages = repository.messagePage(friend.id, null).items
            }
        }
    }
    fun advance() {
        if (mode != "her") return
        if (safeIndex < units.size - 1) index = safeIndex + 1 else mode = "me"
    }

    val currentMood = lastAssistant?.segments?.getOrNull(safeIndex)?.mood ?: "正常"
    val portraitPath = visualPack?.images?.get(currentMood)
        ?: visualPack?.images?.get("正常")
        ?: visualPack?.previewPath.orEmpty()
    val backgroundPath = if (visualKind == "live2d") visualPack?.previewPath.orEmpty() else portraitPath
    val visualModifier = Modifier
        .padding(bottom = if (landscape) 96.dp else 180.dp)
        .fillMaxWidth(if (landscape) 0.55f else 0.82f)
        .fillMaxHeight(if (landscape) 0.9f else 0.72f)
    val live2dHeight = LocalConfiguration.current.screenHeightDp.dp * if (landscape) 0.82f else 0.62f
    Box(Modifier.fillMaxSize().background(Color(0xFF0D0D10))) {
        if (backgroundPath.isNotBlank()) {
            AssetImage(
                backgroundPath,
                Modifier.fillMaxSize().alpha(0.18f).blur(24.dp),
                ContentScale.Crop,
            )
        }
        if (
            visualKind == "live2d" &&
            visualPack?.modelPath?.isNotBlank() == true &&
            Live2DRuntime.available(context)
        ) {
            Live2DView(
                visualPack.modelPath,
                Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth(if (landscape) 0.55f else 0.82f)
                    .height(live2dHeight),
            )
            Box(
                Modifier.fillMaxSize().clickable(enabled = mode == "her") { advance() },
            )
        } else if (portraitPath.isNotBlank()) {
            AssetImage(
                portraitPath,
                Modifier
                    .align(Alignment.BottomCenter)
                    .then(visualModifier)
                    .clickable(enabled = mode == "her") { advance() },
                ContentScale.Fit,
            )
        } else {
            Text(
                friend.name.take(1),
                color = Color.White.copy(alpha = 0.12f),
                fontSize = 160.sp,
                modifier = Modifier.align(Alignment.Center),
            )
        }
        Text(
            when {
                sending -> "正在说…"
                mode == "me" -> "轮到你"
                else -> "点一下继续"
            },
            color = Color.White.copy(alpha = 0.5f),
            fontSize = 12.sp,
            modifier = Modifier.align(Alignment.TopStart).statusBarsPadding().padding(20.dp),
        )
        Text(
            "退出沉浸",
            color = Color.White.copy(alpha = 0.7f),
            fontSize = 12.sp,
            modifier = Modifier
                .align(Alignment.TopEnd)
                .statusBarsPadding()
                .padding(16.dp)
                .border(1.dp, Color.White.copy(alpha = 0.2f), RoundedCornerShape(4.dp))
                .clickable(onClick = onExit)
                .padding(horizontal = 12.dp, vertical = 6.dp),
        )
        Text(
            if (landscape) "竖屏" else "横屏",
            color = Color.White.copy(alpha = 0.7f),
            fontSize = 12.sp,
            modifier = Modifier
                .align(Alignment.TopEnd)
                .statusBarsPadding()
                .padding(top = 16.dp, end = 116.dp)
                .border(1.dp, Color.White.copy(alpha = 0.2f), RoundedCornerShape(4.dp))
                .clickable {
                    activity?.requestedOrientation = if (landscape) {
                        ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
                    } else {
                        ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
                    }
                }
                .padding(horizontal = 12.dp, vertical = 6.dp),
        )
        Column(
            modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding(),
        ) {
            HorizontalDivider(color = Color.White.copy(alpha = 0.15f))
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0x8C000000))
                    .padding(horizontal = 24.dp, vertical = if (landscape) 10.dp else 16.dp),
            ) {
                Text(
                    if (mode == "her") friend.name else "我",
                    color = Color.White.copy(alpha = 0.65f),
                    fontSize = 13.sp,
                )
                Spacer(Modifier.height(6.dp))
                if (mode == "her") {
                    Text(
                        current.ifBlank { if (sending) "……" else "（她在等你说话）" },
                        color = Color.White,
                        fontSize = 16.sp,
                        lineHeight = 29.sp,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { advance() },
                    )
                    Text(
                        when {
                            safeIndex < units.size - 1 -> "▼ 点一下继续"
                            sending -> "正在说…"
                            speaking -> "播放中"
                            else -> "点一下轮到你 ▸"
                        },
                        color = Color.White.copy(alpha = 0.4f),
                        fontSize = 11.sp,
                        modifier = Modifier.align(Alignment.End),
                    )
                } else {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        BasicTextField(
                            value = draft,
                            onValueChange = { draft = it },
                            modifier = Modifier.weight(1f).padding(vertical = 8.dp),
                            textStyle = MaterialTheme.typography.bodyLarge.copy(
                                color = Color.White,
                                fontSize = 16.sp,
                            ),
                            maxLines = 3,
                            decorationBox = { inner ->
                                if (draft.isBlank()) {
                                    Text(
                                        "对 ${friend.name} 说……",
                                        color = Color.White.copy(alpha = 0.35f),
                                        fontSize = 16.sp,
                                    )
                                }
                                inner()
                            },
                        )
                        Text(
                            "说",
                            color = Color.White,
                            fontSize = 13.sp,
                            modifier = Modifier
                                .clickable(enabled = draft.isNotBlank() && !sending) { send() }
                                .padding(horizontal = 10.dp, vertical = 10.dp),
                        )
                    }
                }
            }
        }
    }
}

private fun immersiveUnits(message: Message?): List<String> {
    if (message == null) return emptyList()
    if (message.segments.isNotEmpty()) {
        return message.segments.map { it.text.trim() }.filter { it.isNotEmpty() }
    }
    return message.content
        .split("<<<MSG>>>")
        .flatMap { it.split(Regex("\\n\\s*\\n")) }
        .map { it.trim() }
        .filter { it.isNotEmpty() }
}

@Composable
private fun MessageRow(
    message: Message,
    friendName: String,
    friendAvatarId: String?,
    voiceEnabled: Boolean,
    ttsReady: Boolean,
    onRetry: () -> Unit,
    onSpeak: () -> Unit,
) {
    val assistant = message.role == "assistant"
    val bubbles = message.content.split("<<<MSG>>>").map { it.trim() }.filter { it.isNotEmpty() }
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top,
    ) {
        if (assistant) {
            Avatar(friendName, friendAvatarId, 28)
            Spacer(Modifier.width(8.dp))
            Box(
                Modifier
                    .width(1.dp)
                    .height(22.dp)
                    .background(MaterialTheme.colorScheme.outlineVariant),
            )
            Spacer(Modifier.width(10.dp))
        }
        Column(
            modifier = Modifier.weight(1f).padding(vertical = 1.dp),
            horizontalAlignment = if (assistant) Alignment.Start else Alignment.End,
        ) {
            if (bubbles.isEmpty() && message.status == "streaming") {
                Text("……", style = MaterialTheme.typography.bodyLarge)
            }
            bubbles.forEachIndexed { index, bubble ->
                if (index > 0) Spacer(Modifier.height(4.dp))
                Text(
                    text = bubble,
                    style = MaterialTheme.typography.bodyLarge.copy(fontSize = 14.sp, lineHeight = 25.sp),
                )
            }
            sourceSummary(message.sourcesJson)?.let {
                Text(it, style = MaterialTheme.typography.bodySmall)
            }
            toolSummary(message.toolCallsJson)?.let {
                Text(it, style = MaterialTheme.typography.bodySmall)
            }
            if (assistant && voiceEnabled && message.content.isNotBlank() && ttsReady) {
                TextButton(onClick = onSpeak, modifier = Modifier.height(28.dp)) {
                    Text("朗读", style = MaterialTheme.typography.labelSmall)
                }
            }
            if (assistant && (message.status == "error" || message.status == "partial")) {
                TextButton(onClick = onRetry, modifier = Modifier.height(28.dp)) {
                    Text("重试", style = MaterialTheme.typography.labelSmall)
                }
            }
        }
    }
}

@Composable
private fun Avatar(name: String, assetId: String?, size: Int) {
    val context = LocalContext.current
    val bitmap = remember(assetId) {
        assetId?.let { AssetStore.file(context, it) }?.let { BitmapFactory.decodeFile(it.path) }
    }
    Box(
        modifier = Modifier
            .size(size.dp)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.secondaryContainer, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        if (bitmap != null) {
            Image(
                bitmap = bitmap.asImageBitmap(),
                contentDescription = name,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
            )
        } else {
            Text(
                name.take(1),
                color = MaterialTheme.colorScheme.onSecondaryContainer,
                fontSize = (size * 0.42).sp,
            )
        }
    }
}

@Composable
private fun AssetImage(
    path: String,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Fit,
) {
    val context = LocalContext.current
    val bitmap = remember(path) {
        if (path.isBlank()) return@remember null
        runCatching {
            context.assets.open(path).use { BitmapFactory.decodeStream(it) }
        }.getOrNull()
    }
    if (bitmap != null) {
        Image(
            bitmap = bitmap.asImageBitmap(),
            contentDescription = null,
            modifier = modifier,
            contentScale = contentScale,
        )
    } else {
        Box(modifier.background(MaterialTheme.colorScheme.surfaceVariant))
    }
}

private fun sourceSummary(raw: String): String? {
    if (raw.isBlank()) return null
    val items = runCatching { JSONArray(raw) }.getOrNull() ?: return null
    val titles = (0 until items.length()).mapNotNull { index ->
        val item = items.optJSONObject(index) ?: return@mapNotNull null
        item.optString("title").ifBlank { item.optString("url") }
    }
    return titles.takeIf { it.isNotEmpty() }?.joinToString(prefix = "来源：", separator = "；")
}

private fun toolSummary(raw: String): String? {
    if (raw.isBlank()) return null
    val names = runCatching {
        when {
            raw.trimStart().startsWith("[") -> {
                val items = JSONArray(raw)
                (0 until items.length()).mapNotNull { index ->
                    items.optJSONObject(index)?.optString("name")?.ifBlank { null }
                }
            }
            raw.trimStart().startsWith("{") -> {
                listOfNotNull(JSONObject(raw).optString("name").ifBlank { null })
            }
            else -> emptyList()
        }
    }.getOrDefault(emptyList())
    return names.takeIf { it.isNotEmpty() }?.joinToString(prefix = "工具：", separator = "、")
}

private fun openUrl(context: android.content.Context, url: String) {
    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
}

@Composable
private fun MemoryPanel(repository: YumeRepository, friendId: String) {
    val scope = rememberCoroutineScope()
    var items by remember { mutableStateOf(repository.memories(friendId)) }
    var content by remember { mutableStateOf("") }
    var editing by remember { mutableStateOf<Memory?>(null) }
    var query by remember { mutableStateOf("") }
    var shown by remember { mutableStateOf(items) }
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(content, { content = it }, Modifier.weight(1f), label = { Text("新记忆") })
            TextButton(
                enabled = content.isNotBlank(),
                onClick = {
                    scope.launch {
                        if (editing == null) repository.addMemory(friendId, content.trim())
                        else repository.updateMemory(editing!!, content.trim())
                        content = ""
                        editing = null
                        items = repository.memories(friendId)
                        shown = items
                    }
                },
            ) { Text(if (editing == null) "添加" else "保存") }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(query, { query = it }, Modifier.weight(1f), label = { Text("回忆关键词") })
            TextButton(onClick = {
                shown = if (query.isBlank()) items else repository.recallMemories(friendId, query)
            }) { Text("回忆") }
        }
        LazyColumn(Modifier.weight(1f).padding(top = 8.dp)) {
            items(shown, key = { it.id }) { memory ->
                Card(Modifier.fillMaxWidth().padding(bottom = 6.dp)) {
                    Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(memory.content, Modifier.weight(1f))
                        TextButton(onClick = { editing = memory; content = memory.content }) { Text("改") }
                        TextButton(onClick = {
                            scope.launch {
                                repository.deleteMemory(memory)
                                items = repository.memories(friendId)
                                shown = items
                            }
                        }) { Text("删") }
                    }
                }
            }
        }
    }
}

@Composable
private fun PersonaPanel(
    repository: YumeRepository,
    friend: Friend,
    voiceEnabled: Boolean,
    onSaved: () -> Unit,
    onDeleted: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf(friend.name) }
    var personality by remember { mutableStateOf(friend.personality) }
    var instructions by remember { mutableStateOf(friend.customInstructions) }
    var avatarId by remember(friend.id) { mutableStateOf(friend.avatarAssetId) }
    val visualPacks = remember(friend.id) { repository.visualPacks() }
    var visualMode by remember(friend.id) {
        mutableStateOf(if (friend.visualMode == "live2d") "live2d" else "portrait")
    }
    var visualPackId by remember(friend.id) {
        mutableStateOf(friend.visualPackId ?: YumeRepository.PORTRAIT_PACK_ID)
    }
    val voices = remember(friend.id) { repository.voices() }
    var voiceId by remember(friend.id) { mutableStateOf(friend.voiceId) }
    var voiceReplyEnabled by remember(friend.id) { mutableStateOf(friend.voiceReplyEnabled) }
    var voiceMenu by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    val avatarPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            val id = AssetStore.saveImage(context, uri)
            avatarId = id
            repository.updateFriendAvatar(friend.id, id)
            AppLog.record(context, "更新朋友头像：${friend.name}")
            onSaved()
        }
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Avatar(name, avatarId, 72)
            Spacer(Modifier.width(12.dp))
            TextButton(onClick = { avatarPicker.launch(arrayOf("image/*")) }) { Text("更换头像") }
        }
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(name, { name = it }, Modifier.fillMaxWidth(), label = { Text("名字") })
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(personality, { personality = it }, Modifier.fillMaxWidth(), label = { Text("人格") }, minLines = 5)
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(instructions, { instructions = it }, Modifier.fillMaxWidth(), label = { Text("补充要求") }, minLines = 3)
        Spacer(Modifier.height(12.dp))
        Text("呈现", style = MaterialTheme.typography.titleMedium)
        visualPacks.forEach { pack ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable {
                        visualMode = pack.kind
                        visualPackId = pack.id
                        repository.updateFriendVisual(friend.id, pack.kind, pack.id)
                        onSaved()
                    }
                    .padding(vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                AssetImage(
                    pack.previewPath,
                    Modifier
                        .size(width = 54.dp, height = 72.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant),
                )
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(pack.name)
                    Text(
                        if (pack.kind == "live2d") "Live2D" else "立绘",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                RadioButton(
                    selected = visualPackId == pack.id,
                    onClick = {
                        visualMode = pack.kind
                        visualPackId = pack.id
                        repository.updateFriendVisual(friend.id, pack.kind, pack.id)
                        onSaved()
                    },
                )
            }
        }
        if (visualMode == "live2d" && !Live2DRuntime.available(context)) {
            Text(
                "需要先在设置下载 Live2D 运行库",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodySmall,
            )
        }
        Spacer(Modifier.height(12.dp))
        if (voiceEnabled) {
            Text("声音", style = MaterialTheme.typography.titleMedium)
            Box {
                TextButton(onClick = { voiceMenu = true }) {
                    Text(voices.find { it.id == voiceId }?.name ?: "系统默认音色")
                }
                DropdownMenu(expanded = voiceMenu, onDismissRequest = { voiceMenu = false }) {
                    DropdownMenuItem(text = { Text("系统默认音色") }, onClick = {
                        voiceId = null
                        voiceMenu = false
                    })
                    voices.forEach { voice ->
                        DropdownMenuItem(text = { Text(voice.name) }, onClick = {
                            voiceId = voice.id
                            voiceMenu = false
                        })
                    }
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("回复默认带语音", modifier = Modifier.weight(1f))
                Switch(checked = voiceReplyEnabled, onCheckedChange = { voiceReplyEnabled = it })
            }
        }
        Spacer(Modifier.height(12.dp))
        Button(
            enabled = name.isNotBlank(),
            onClick = {
                scope.launch {
                    repository.updateFriend(friend, name.trim(), personality, instructions)
                    repository.bindVoice(friend.id, voiceId, voiceReplyEnabled)
                    onSaved()
                }
            },
        ) { Text("保存人格") }
        Spacer(Modifier.height(16.dp))
        TextButton(onClick = { confirmDelete = true }) {
            Text("删除朋友", color = MaterialTheme.colorScheme.error)
        }
    }
    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("删除朋友") },
            text = { Text("连同聊天和记忆一起删除「${friend.name}」？") },
            confirmButton = {
                TextButton(onClick = {
                    repository.deleteFriend(friend)
                    confirmDelete = false
                    onDeleted()
                }) { Text("删除") }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("取消") } },
        )
    }
}

@Composable
private fun SchedulePanel(repository: YumeRepository, friendId: String) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var items by remember { mutableStateOf(repository.schedules(friendId)) }
    var title by remember { mutableStateOf("") }
    var date by remember { mutableStateOf("") }
    var time by remember { mutableStateOf("") }
    var editing by remember { mutableStateOf<Schedule?>(null) }
    fun reset() {
        title = ""
        date = ""
        time = ""
        editing = null
    }
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(title, { title = it }, Modifier.weight(1f), label = { Text("日程") })
            TextButton(
                enabled = title.isNotBlank() && date.isNotBlank(),
                onClick = {
                    scope.launch {
                        val current = editing
                        val schedule = if (current == null) {
                            repository.createSchedule(friendId, title.trim(), date.trim(), time.trim())
                        } else {
                            ScheduleAlarms.cancel(context, current.id)
                            repository.updateSchedule(current, title.trim(), date.trim(), time.trim())
                        }
                        ScheduleAlarms.schedule(context, schedule)
                        reset()
                        items = repository.schedules(friendId)
                    }
                },
            ) { Text(if (editing == null) "添加" else "保存") }
            if (editing != null) TextButton(onClick = { reset() }) { Text("取消") }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(date, { date = it }, Modifier.weight(1f), label = { Text("YYYY-MM-DD") })
            OutlinedTextField(time, { time = it }, Modifier.weight(1f), label = { Text("HH:MM") })
        }
        LazyColumn(Modifier.weight(1f).padding(top = 8.dp)) {
            items(items, key = { it.id }) { schedule ->
                Card(Modifier.fillMaxWidth().padding(bottom = 6.dp)) {
                    Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(schedule.title)
                            Text("${schedule.dateLocal} ${schedule.timeLocal}", style = MaterialTheme.typography.bodySmall)
                        }
                        TextButton(onClick = {
                            editing = schedule
                            title = schedule.title
                            date = schedule.dateLocal
                            time = schedule.timeLocal
                        }) { Text("改") }
                        if (schedule.state != "settled") {
                            TextButton(onClick = {
                                scope.launch {
                                    ScheduleAlarms.cancel(context, schedule.id)
                                    repository.settleSchedule(schedule, "done")
                                    items = repository.schedules(friendId)
                                }
                            }) { Text("完成") }
                            TextButton(onClick = {
                                scope.launch {
                                    ScheduleAlarms.cancel(context, schedule.id)
                                    repository.settleSchedule(schedule, "放弃")
                                    items = repository.schedules(friendId)
                                }
                            }) { Text("放弃") }
                        }
                        TextButton(onClick = {
                            scope.launch {
                                ScheduleAlarms.cancel(context, schedule.id)
                                repository.deleteSchedule(schedule)
                                if (editing?.id == schedule.id) reset()
                                items = repository.schedules(friendId)
                            }
                        }) { Text("删") }
                    }
                }
            }
        }
    }
}

@Composable
private fun KnowledgePanel(repository: YumeRepository, friendId: String) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var documents by remember { mutableStateOf(repository.documents(friendId)) }
    var query by remember { mutableStateOf("") }
    var hits by remember { mutableStateOf<List<DocumentHit>>(emptyList()) }
    var importError by remember { mutableStateOf("") }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            val name = uri.lastPathSegment ?: "文档"
            val (kind, text) = withContext(Dispatchers.IO) {
                DocumentText.read(context, uri, name)
            }
            if (text.isNotBlank()) {
                repository.importDocument(friendId, name, kind, text)
                documents = repository.documents(friendId)
                importError = ""
            } else {
                importError = "无法从文件中提取文本"
            }
        }
    }
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(query, { query = it }, Modifier.weight(1f), label = { Text("搜索知识") })
            TextButton(onClick = { hits = repository.searchDocuments(friendId, query) }) { Text("搜索") }
        }
        TextButton(onClick = {
            picker.launch(
                arrayOf(
                    "text/*",
                    "application/pdf",
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                ),
            )
        }) { Text("导入文档") }
        if (importError.isNotBlank()) Text(importError, style = MaterialTheme.typography.bodySmall)
        if (hits.isNotEmpty()) {
            Text("搜索结果", style = MaterialTheme.typography.titleSmall)
            hits.forEach { Text(it.text.take(180), style = MaterialTheme.typography.bodySmall) }
            HorizontalDivider()
        }
        LazyColumn(Modifier.weight(1f)) {
            items(documents, key = { it.id }) { document ->
                Card(Modifier.fillMaxWidth().padding(bottom = 6.dp)) {
                    Column(Modifier.padding(10.dp)) {
                        Text(document.name)
                        Text("${document.kind} · ${document.chars} 字", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}

@Composable
private fun ScheduleTab(repository: YumeRepository, friends: List<Friend>) {
    var friendId by remember(friends) { mutableStateOf(friends.firstOrNull()?.id.orEmpty()) }
    var menu by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("日程", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
            Box {
                TextButton(onClick = { menu = true }) {
                    Text(friends.find { it.id == friendId }?.name ?: "选择朋友")
                }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    friends.forEach { friend ->
                        DropdownMenuItem(text = { Text(friend.name) }, onClick = {
                            friendId = friend.id
                            menu = false
                        })
                    }
                }
            }
        }
        if (friendId.isNotBlank()) SchedulePanel(repository, friendId) else Text("先创建一个朋友")
    }
}

@Composable
private fun SettingsScreen(
    repository: YumeRepository,
    theme: AppTheme,
    features: FeatureFlags,
    onThemeChanged: (AppTheme) -> Unit,
    onFeaturesChanged: (FeatureFlags) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var baseUrl by remember { mutableStateOf(repository.setting("llm_base_url")?.removeSurrounding("\"").orEmpty()) }
    var apiKey by remember { mutableStateOf(repository.setting("llm_api_key")?.removeSurrounding("\"").orEmpty()) }
    var model by remember { mutableStateOf(repository.setting("llm_model")?.removeSurrounding("\"").orEmpty()) }
    var testState by remember { mutableStateOf("") }
    var ttsReady by remember { mutableStateOf(false) }
    var systemVoices by remember { mutableStateOf<List<android.speech.tts.Voice>>(emptyList()) }
    var savedVoices by remember { mutableStateOf(repository.voices()) }
    var updateUrl by remember { mutableStateOf(repository.setting("apk_update_url")?.removeSurrounding("\"").orEmpty()) }
    var updateInfo by remember { mutableStateOf<UpdateInfo?>(null) }
    var updateState by remember { mutableStateOf("") }
    var downloadProgress by remember { mutableStateOf(0) }
    var downloadedApk by remember { mutableStateOf<java.io.File?>(null) }
    var logs by remember { mutableStateOf(AppLog.read(context)) }
    var live2dReady by remember { mutableStateOf(Live2DRuntime.available(context)) }
    var live2dAccepted by remember { mutableStateOf(false) }
    var live2dDownloading by remember { mutableStateOf(false) }
    var live2dProgress by remember { mutableStateOf(0) }
    var live2dState by remember { mutableStateOf("") }
    var pairingAllowed by remember {
        mutableStateOf(repository.setting("sync_pairing_enabled")?.removeSurrounding("\"") == "true")
    }
    var serverUrl by remember {
        mutableStateOf(repository.setting("sync_server_url")?.removeSurrounding("\"").orEmpty())
    }
    var serverToken by remember {
        mutableStateOf(repository.setting("sync_server_token")?.removeSurrounding("\"").orEmpty())
    }
    var syncMessage by remember { mutableStateOf("") }
    var syncTick by remember { mutableStateOf(0) }
    var expandedPeerId by remember { mutableStateOf<String?>(null) }
    var manualSyncHost by remember { mutableStateOf("") }
    var manualSyncPort by remember { mutableStateOf("47896") }
    LaunchedEffect(Unit) {
        while (true) {
            delay(2_000)
            syncTick += 1
        }
    }
    val discoveredPeers = remember(syncTick) { AndroidSyncRuntime.discovered }
    val syncedPeers = remember(syncTick) { repository.peers() }
    val syncModules = remember { repository.syncModuleIds() }
    val conflicts = remember(syncTick) { repository.syncConflicts() }
    val voiceTts = remember { TextToSpeech(context) { status -> ttsReady = status == TextToSpeech.SUCCESS } }
    LaunchedEffect(ttsReady) {
        if (ttsReady) {
            systemVoices = voiceTts.voices.orEmpty()
                .filter { it.locale.language == "zh" || it.locale.language == "en" }
                .sortedBy { it.name }
                .take(8)
        }
    }
    DisposableEffect(Unit) {
        onDispose { voiceTts.shutdown() }
    }
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text("模型", style = MaterialTheme.typography.titleLarge)
        OutlinedTextField(baseUrl, { baseUrl = it }, Modifier.fillMaxWidth(), label = { Text("服务地址") })
        OutlinedTextField(apiKey, { apiKey = it }, Modifier.fillMaxWidth(), label = { Text("密钥") })
        OutlinedTextField(model, { model = it }, Modifier.fillMaxWidth(), label = { Text("模型名") })
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = {
                repository.putSetting("llm_base_url", JsonPrimitive(baseUrl).toString())
                repository.putSetting("llm_api_key", JsonPrimitive(apiKey).toString())
                repository.putSetting("llm_model", JsonPrimitive(model).toString())
                testState = "已保存"
                AppLog.record(context, "保存模型配置")
            }) { Text("保存模型") }
            TextButton(onClick = {
                scope.launch {
                    try {
                        val reply = OpenAiClient().complete(
                            LlmConfig(baseUrl, apiKey, model),
                            listOf("user" to "请只回复：连通正常"),
                        )
                        testState = reply.ifBlank { "连通正常" }
                        AppLog.record(context, "模型测试成功")
                    } catch (error: Exception) {
                        testState = error.message ?: "连接失败"
                        AppLog.record(context, "模型测试失败：${error.message}")
                    }
                }
            }) { Text("测试连接") }
        }
        if (testState.isNotBlank()) Text(testState, style = MaterialTheme.typography.bodySmall)
        HorizontalDivider()
        Text("主题", style = MaterialTheme.typography.titleLarge)
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            listOf("paper" to "纸", "moss" to "苔", "tea" to "茶", "sakura" to "樱").forEach { (color, label) ->
                TextButton(onClick = { onThemeChanged(theme.copy(color = color)) }) {
                    Text(label, fontWeight = if (theme.color == color) FontWeight.Bold else FontWeight.Normal)
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            TextButton(onClick = { onThemeChanged(theme.copy(mode = "light")) }) { Text("浅色") }
            TextButton(onClick = { onThemeChanged(theme.copy(mode = "dark")) }) { Text("深色") }
        }
        HorizontalDivider()
        Text("Live2D", style = MaterialTheme.typography.titleLarge)
        Text(
            if (live2dReady) "运行库已安装" else "运行库未安装，沉浸模式的 Live2D 不可用",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodySmall,
        )
        TextButton(onClick = { openUrl(context, Live2DRuntime.PROPRIETARY_LICENSE_URL) }) {
            Text("Live2D 专有软件许可协议")
        }
        TextButton(onClick = { openUrl(context, Live2DRuntime.OPEN_LICENSE_URL) }) {
            Text("Live2D 开放软件许可协议")
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(checked = live2dAccepted, onCheckedChange = { live2dAccepted = it })
            Text("我已阅读并同意上述协议")
        }
        Button(
            enabled = live2dAccepted && !live2dDownloading && !live2dReady,
            onClick = {
                scope.launch {
                    live2dDownloading = true
                    live2dState = "正在下载…"
                    try {
                        Live2DRuntime.download(context) { live2dProgress = it }
                        live2dReady = true
                        live2dState = "下载完成"
                        AppLog.record(context, "Live2D Core 下载完成")
                    } catch (error: Exception) {
                        live2dState = error.message ?: "下载失败"
                        AppLog.record(context, "Live2D Core 下载失败：${error.message}")
                    } finally {
                        live2dDownloading = false
                    }
                }
            },
        ) {
            Text(if (live2dReady) "已安装" else "下载运行库")
        }
        if (live2dDownloading) Text("下载 $live2dProgress%")
        if (live2dState.isNotBlank()) Text(live2dState, style = MaterialTheme.typography.bodySmall)
        HorizontalDivider()
        Text("同步", style = MaterialTheme.typography.titleLarge)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("允许其他设备配对", modifier = Modifier.weight(1f))
            Switch(
                checked = pairingAllowed,
                onCheckedChange = {
                    pairingAllowed = it
                    repository.putSetting("sync_pairing_enabled", JsonPrimitive(it).toString())
                },
            )
        }
        if (discoveredPeers.isNotEmpty()) {
            Text("发现的设备", style = MaterialTheme.typography.titleSmall)
            discoveredPeers.forEach { device ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(device.productId)
                        Text(device.host, style = MaterialTheme.typography.bodySmall)
                    }
                    TextButton(
                        enabled = syncedPeers.none { it.deviceId == device.deviceId },
                        onClick = {
                            scope.launch {
                                syncMessage = "正在配对…"
                                runCatching {
                                    withContext(Dispatchers.IO) {
                                        AndroidSyncRuntime.pair(context, device)
                                    }
                                }.onSuccess {
                                    syncMessage = "配对完成"
                                    syncTick += 1
                                }.onFailure {
                                    syncMessage = it.message ?: "配对失败"
                                }
                            }
                        },
                    ) { Text("配对") }
                }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                manualSyncHost,
                { manualSyncHost = it },
                Modifier.weight(1f),
                label = { Text("手动地址") },
                singleLine = true,
            )
            OutlinedTextField(
                manualSyncPort,
                { manualSyncPort = it },
                Modifier.width(100.dp),
                label = { Text("端口") },
                singleLine = true,
            )
            TextButton(
                enabled = manualSyncHost.isNotBlank(),
                onClick = {
                    scope.launch {
                        syncMessage = "正在手动配对…"
                        runCatching {
                            withContext(Dispatchers.IO) {
                                AndroidSyncRuntime.pairAddress(
                                    context,
                                    manualSyncHost.trim(),
                                    manualSyncPort.toIntOrNull() ?: 47896,
                                )
                            }
                        }.onSuccess {
                            syncMessage = "手动配对完成"
                            syncTick += 1
                        }.onFailure {
                            syncMessage = it.message ?: "手动配对失败"
                        }
                    }
                },
            ) { Text("配对") }
        }
        if (syncedPeers.isNotEmpty()) {
            Text("已配对设备", style = MaterialTheme.typography.titleSmall)
            syncedPeers.forEach { peer ->
                val remote = discoveredPeers.find { it.deviceId == peer.deviceId }
                val saved = repository.syncState("peer_address:${peer.deviceId}")
                    ?.split(":", limit = 2)
                val remoteHost = remote?.host ?: saved?.getOrNull(0)
                val remotePort = remote?.port ?: saved?.getOrNull(1)?.toIntOrNull()
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            peer.name,
                            modifier = Modifier.weight(1f).clickable {
                                expandedPeerId = if (expandedPeerId == peer.id) null else peer.id
                            },
                        )
                        Text(
                            if (remoteHost != null && remotePort != null) "可连接" else "离线",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            style = MaterialTheme.typography.bodySmall,
                        )
                        TextButton(
                            enabled = remoteHost != null && remotePort != null,
                            onClick = {
                                if (remoteHost == null || remotePort == null) return@TextButton
                                scope.launch {
                                    syncMessage = "正在同步…"
                                    runCatching {
                                        withContext(Dispatchers.IO) {
                                            AndroidSyncRuntime.runLan(
                                                context,
                                                peer,
                                                remoteHost,
                                                remotePort,
                                                "both",
                                            )
                                        }
                                    }.onSuccess { result ->
                                        syncMessage =
                                            "同步完成：拉取 ${result.pulled}，推送 ${result.pushed}"
                                        syncTick += 1
                                    }.onFailure {
                                        syncMessage = it.message ?: "同步失败"
                                    }
                                }
                            },
                        ) { Text("同步") }
                    }
                    if (expandedPeerId == peer.id) {
                        syncModules.forEach { moduleId ->
                            val enabled = repository.grants(peer.id)
                                .any { it.moduleId == moduleId && it.permission == "write" }
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(moduleId, modifier = Modifier.weight(1f))
                                Switch(
                                    checked = enabled,
                                    onCheckedChange = { allowed ->
                                        if (allowed) {
                                            repository.grant(peer.id, GrantRequest(moduleId, null, "write"))
                                        } else {
                                            repository.revokeGrant(peer.id, moduleId)
                                        }
                                        syncTick += 1
                                    },
                                )
                            }
                        }
                    }
                }
            }
        }
        OutlinedTextField(
            serverUrl,
            { serverUrl = it },
            Modifier.fillMaxWidth(),
            label = { Text("同步服务器地址") },
        )
        OutlinedTextField(
            serverToken,
            { serverToken = it },
            Modifier.fillMaxWidth(),
            label = { Text("服务器 token") },
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(onClick = {
                repository.putSetting("sync_server_url", JsonPrimitive(serverUrl).toString())
                repository.putSetting("sync_server_token", JsonPrimitive(serverToken).toString())
                syncMessage = "服务器配置已保存"
            }) { Text("保存服务器") }
            TextButton(
                enabled = serverUrl.isNotBlank() && serverToken.isNotBlank(),
                onClick = {
                    scope.launch {
                        syncMessage = "正在连接服务器…"
                        runCatching {
                            withContext(Dispatchers.IO) {
                                AndroidSyncRuntime.runServer(context, serverUrl, serverToken, "both")
                            }
                        }.onSuccess { result ->
                            syncMessage = "服务器同步完成：拉取 ${result.pulled}，推送 ${result.pushed}"
                            syncTick += 1
                        }.onFailure {
                            syncMessage = it.message ?: "服务器同步失败"
                        }
                    }
                },
            ) { Text("服务器同步") }
        }
        Text("冲突 ${conflicts.size}", style = MaterialTheme.typography.bodySmall)
        conflicts.take(3).forEach {
            Text(
                "${it.moduleId}/${it.entityType}：${it.detail}",
                style = MaterialTheme.typography.bodySmall,
            )
        }
        if (syncMessage.isNotBlank()) Text(syncMessage, style = MaterialTheme.typography.bodySmall)
        if (features.voice) {
            HorizontalDivider()
            Text("语音", style = MaterialTheme.typography.titleLarge)
            Text("使用 Android 系统 TTS / STT。", style = MaterialTheme.typography.bodySmall)
            Text("已保存音色", style = MaterialTheme.typography.titleSmall)
            savedVoices.forEach { voice ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(voice.name, Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    TextButton(onClick = {
                        repository.deleteVoice(voice.id)
                        savedVoices = repository.voices()
                    }) { Text("删") }
                }
            }
            Text("系统音色", style = MaterialTheme.typography.titleSmall)
            systemVoices.forEach { voice ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(voice.name, Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    TextButton(onClick = {
                        repository.addVoice(voice.name, voice.name, voice.locale.toLanguageTag())
                        savedVoices = repository.voices()
                    }) { Text("添加") }
                }
            }
        }
        HorizontalDivider()
        Text("功能", style = MaterialTheme.typography.titleLarge)
        FeatureSwitch("记忆", features.memory) {
            repository.setFeature("feature_memory_enabled", it)
            onFeaturesChanged(repository.features())
        }
        FeatureSwitch("日程提醒", features.schedule) {
            repository.setFeature("feature_schedule_enabled", it)
            if (it) {
                ScheduleAlarms.refresh(context)
            } else {
                repository.pendingSchedules().forEach { schedule -> ScheduleAlarms.cancel(context, schedule.id) }
            }
            onFeaturesChanged(repository.features())
        }
        FeatureSwitch("语音", features.voice) {
            repository.setFeature("feature_voice_enabled", it)
            onFeaturesChanged(repository.features())
        }
        FeatureSwitch("知识库", features.knowledge) {
            repository.setFeature("feature_knowledge_enabled", it)
            onFeaturesChanged(repository.features())
        }
        HorizontalDivider()
        Text("更新", style = MaterialTheme.typography.titleLarge)
        OutlinedTextField(
            updateUrl,
            { updateUrl = it },
            Modifier.fillMaxWidth(),
            label = { Text("latest.json 地址") },
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(onClick = {
                repository.putSetting("apk_update_url", JsonPrimitive(updateUrl).toString())
                updateState = "地址已保存"
                AppLog.record(context, "保存更新地址")
            }) { Text("保存地址") }
            TextButton(enabled = updateUrl.isNotBlank(), onClick = {
                scope.launch {
                    try {
                        val info = ApkUpdate.check(updateUrl.trim())
                        val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
                        val current = if (Build.VERSION.SDK_INT >= 28) {
                            packageInfo.longVersionCode
                        } else {
                            packageInfo.versionCode.toLong()
                        }
                        updateInfo = info
                        updateState = if (info.versionCode > current) {
                            "发现 ${info.versionName}：${info.notes}"
                        } else {
                            "已是最新版本"
                        }
                        AppLog.record(context, "检查更新：${info.versionName}")
                    } catch (error: Exception) {
                        updateState = error.message ?: "检查失败"
                        AppLog.record(context, "检查更新失败：${error.message}")
                    }
                }
            }) { Text("检查更新") }
        }
        updateInfo?.let { info ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = {
                    scope.launch {
                        try {
                            downloadedApk = ApkUpdate.download(context, info) { downloadProgress = it }
                            updateState = "下载完成"
                            AppLog.record(context, "更新下载完成：${info.versionName}")
                        } catch (error: Exception) {
                            updateState = error.message ?: "下载失败"
                            AppLog.record(context, "更新下载失败：${error.message}")
                        }
                    }
                }) { Text("下载更新") }
                downloadedApk?.let { file ->
                    TextButton(onClick = { ApkUpdate.install(context, file) }) { Text("安装") }
                }
            }
            if (downloadProgress in 1..99) Text("下载 $downloadProgress%")
        }
        if (updateState.isNotBlank()) Text(updateState, style = MaterialTheme.typography.bodySmall)
        HorizontalDivider()
        Text("日志", style = MaterialTheme.typography.titleLarge)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(onClick = { logs = AppLog.read(context) }) { Text("刷新") }
            TextButton(onClick = {
                AppLog.clear(context)
                logs = emptyList()
            }) { Text("清空") }
        }
        Text(
            logs.joinToString("\n").ifBlank { "暂无日志" },
            style = MaterialTheme.typography.bodySmall,
        )
    }
}

@Composable
private fun FeatureSwitch(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(label, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onChange)
    }
}
