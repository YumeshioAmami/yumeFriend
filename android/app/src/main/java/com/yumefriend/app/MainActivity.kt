@file:OptIn(ExperimentalMaterial3Api::class)

package com.yumefriend.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonPrimitive

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
    var friends by remember { mutableStateOf(repository.friends()) }
    var chatFriend by remember { mutableStateOf<Friend?>(null) }
    var tab by remember { mutableStateOf(0) }

    fun reload() {
        friends = repository.friends()
        chatFriend = friends.find { it.id == chatFriend?.id }
    }

    MaterialTheme(colorScheme = theme.scheme()) {
        if (chatFriend != null) {
            ChatScreen(
                repository = repository,
                friend = chatFriend!!,
                onBack = { chatFriend = null; reload() },
                onFriendUpdated = { reload() },
            )
        } else {
            Scaffold(
                topBar = { TopAppBar(title = { Text("yumeFriend") }) },
                bottomBar = {
                    NavigationBar {
                        listOf("朋友", "日程", "设置").forEachIndexed { index, label ->
                            NavigationBarItem(
                                selected = tab == index,
                                onClick = { tab = index },
                                icon = { Text(label.take(1)) },
                                label = { Text(label) },
                            )
                        }
                    }
                },
            ) { padding ->
                Box(Modifier.padding(padding)) {
                    when (tab) {
                        0 -> FriendsScreen(
                            repository = repository,
                            friends = friends,
                            onOpen = { chatFriend = it },
                            onChanged = { friends = repository.friends() },
                        )
                        1 -> ScheduleTab(repository, friends)
                        else -> SettingsScreen(repository, theme) {
                            theme = it
                            repository.saveTheme(it)
                        }
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
    var deleteTarget by remember { mutableStateOf<Friend?>(null) }
    val scope = rememberCoroutineScope()
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text("朋友", style = MaterialTheme.typography.titleLarge)
                Button(onClick = { showCreate = true }) { Text("新建") }
            }
            Spacer(Modifier.height(12.dp))
        }
        items(friends, key = { it.id }) { friend ->
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 8.dp)
                    .clickable { onOpen(friend) },
            ) {
                Row(
                    modifier = Modifier.padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(friend.name.take(1), style = MaterialTheme.typography.titleLarge, modifier = Modifier.width(38.dp))
                    Column(Modifier.weight(1f)) {
                        Text(friend.name, fontWeight = FontWeight.Medium)
                        Text(
                            friend.personality.ifBlank { "还没聊过" },
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    TextButton(onClick = { deleteTarget = friend }) { Text("删除") }
                    if (friend.unreadCount > 0) {
                        Text("${friend.unreadCount}", color = MaterialTheme.colorScheme.primary)
                    }
                }
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
    deleteTarget?.let { friend ->
        AlertDialog(
            onDismissRequest = { deleteTarget = null },
            title = { Text("删除朋友") },
            text = { Text("连同聊天和记忆一起删除「${friend.name}」？") },
            confirmButton = {
                TextButton(onClick = {
                    scope.launch {
                        repository.deleteFriend(friend)
                        deleteTarget = null
                        onChanged()
                    }
                }) { Text("删除") }
            },
            dismissButton = { TextButton(onClick = { deleteTarget = null }) { Text("取消") } },
        )
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
    val tts = remember { TextToSpeech(context) { status -> ttsReady = status == TextToSpeech.SUCCESS } }
    val recognizer = remember {
        SpeechRecognizer.createSpeechRecognizer(context).apply {
            setRecognitionListener(object : RecognitionListener {
                override fun onResults(results: Bundle?) {
                    val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
                    if (!text.isNullOrBlank()) draft = text
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
    DisposableEffect(Unit) {
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
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED
        ) startSpeech(recognizer) else permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
    }
    fun speak(messageId: String, text: String) {
        if (!ttsReady || text.isBlank()) return
        repository.voiceById(friend.voiceId.orEmpty())?.engineVoice
            ?.let { engineName -> tts.voices?.find { it.name == engineName } }
            ?.let { tts.voice = it }
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, messageId)
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
                if (friend.voiceReplyEnabled && ttsReady) {
                    messages.lastOrNull { it.role == "assistant" }?.let {
                        speak(it.id, it.content)
                    }
                }
            } catch (_: CancellationException) {
            } catch (error: Exception) {
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
        runReply(repository.sendMessageStream(friend, text))
    }
    fun stop() {
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

    val currentPanel = panel
    if (currentPanel != null) {
        Column(Modifier.fillMaxSize()) {
            TopAppBar(
                title = { Text(currentPanel.name) },
                navigationIcon = { TextButton(onClick = { panel = null }) { Text("返回") } },
            )
            when (currentPanel) {
                ChatPanel.MEMORY -> MemoryPanel(repository, friend.id)
                ChatPanel.PERSONA -> PersonaPanel(repository, friend, onFriendUpdated)
                ChatPanel.SCHEDULE -> SchedulePanel(repository, friend.id)
                ChatPanel.KNOWLEDGE -> KnowledgePanel(repository, friend.id)
            }
        }
        return
    }

    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text(friend.name) },
            navigationIcon = { TextButton(onClick = onBack) { Text("返回") } },
        )
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            listOf(
                "记忆" to ChatPanel.MEMORY,
                "人格" to ChatPanel.PERSONA,
                "日程" to ChatPanel.SCHEDULE,
                "知识" to ChatPanel.KNOWLEDGE,
            ).forEach { (label, target) ->
                TextButton(onClick = { panel = target }) { Text(label) }
            }
            TextButton(onClick = {
                val text = messages.lastOrNull { it.role == "assistant" }?.content.orEmpty()
                if (text.isNotBlank()) speak("reply", text)
            }) { Text("语音") }
        }
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
                MessageRow(message, ttsReady, onRetry = { retry(message.id) }) {
                    speak(message.id, message.content)
                }
            }
        }
        HorizontalDivider()
        Row(
            modifier = Modifier.fillMaxWidth().padding(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextButton(onClick = { beginSpeech() }) { Text("说") }
            OutlinedTextField(
                value = draft,
                onValueChange = { draft = it },
                modifier = Modifier.weight(1f),
                placeholder = { Text("说点什么…") },
                maxLines = 3,
            )
            if (sending) TextButton(onClick = { stop() }) { Text("停止") }
            else TextButton(enabled = draft.isNotBlank(), onClick = { send() }) { Text("发送") }
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
private fun MessageRow(
    message: Message,
    ttsReady: Boolean,
    onRetry: () -> Unit,
    onSpeak: () -> Unit,
) {
    val assistant = message.role == "assistant"
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = if (assistant) Alignment.Start else Alignment.End,
    ) {
        Text(
            text = message.content.ifBlank { if (message.status == "streaming") "……" else "" },
            style = MaterialTheme.typography.bodyLarge,
        )
        if (assistant && message.content.isNotBlank() && ttsReady) {
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
private fun PersonaPanel(repository: YumeRepository, friend: Friend, onSaved: () -> Unit) {
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf(friend.name) }
    var personality by remember { mutableStateOf(friend.personality) }
    var instructions by remember { mutableStateOf(friend.customInstructions) }
    val voices = remember(friend.id) { repository.voices() }
    var voiceId by remember(friend.id) { mutableStateOf(friend.voiceId) }
    var voiceReplyEnabled by remember(friend.id) { mutableStateOf(friend.voiceReplyEnabled) }
    var voiceMenu by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        OutlinedTextField(name, { name = it }, Modifier.fillMaxWidth(), label = { Text("名字") })
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(personality, { personality = it }, Modifier.fillMaxWidth(), label = { Text("人格") }, minLines = 5)
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(instructions, { instructions = it }, Modifier.fillMaxWidth(), label = { Text("补充要求") }, minLines = 3)
        Spacer(Modifier.height(12.dp))
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
    onThemeChanged: (AppTheme) -> Unit,
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
    val voiceTts = remember { TextToSpeech(context) { status -> ttsReady = status == TextToSpeech.SUCCESS } }
    LaunchedEffect(ttsReady) {
        if (ttsReady) {
            systemVoices = voiceTts.voices.orEmpty()
                .filter { it.locale.language == "zh" || it.locale.language == "en" }
                .sortedBy { it.name }
                .take(30)
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
            }) { Text("保存模型") }
            TextButton(onClick = {
                scope.launch {
                    try {
                        val reply = OpenAiClient().complete(
                            LlmConfig(baseUrl, apiKey, model),
                            listOf("user" to "请只回复：连通正常"),
                        )
                        testState = reply.ifBlank { "连通正常" }
                    } catch (error: Exception) {
                        testState = error.message ?: "连接失败"
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
                    } catch (error: Exception) {
                        updateState = error.message ?: "检查失败"
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
                        } catch (error: Exception) {
                            updateState = error.message ?: "下载失败"
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
    }
}
