package com.yumefriend.app

import android.app.Application
import android.util.Log
import com.yume.core.YumeCore
import com.yume.core.manifest.ManifestLoader
import com.yume.core.storage.openDatabase
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.io.File
import java.util.UUID

class YumeApp : Application() {
    lateinit var repository: YumeRepository
        private set

    override fun onCreate() {
        super.onCreate()
        PDFBoxResourceLoader.init(this)
        val legacyDb = LegacyMigration.prepare(this)
        val modules = assets.list("")
            .orEmpty()
            .filter { it.endsWith(".json") }
            .map { name ->
                val text = assets.open(name).bufferedReader().use { it.readText() }
                ManifestLoader.load(text)
            }
        val preferences = getSharedPreferences("yumeFriend", MODE_PRIVATE)
        val deviceId = preferences.getString("device_id", null) ?: UUID.randomUUID().toString().also {
            preferences.edit().putString("device_id", it).apply()
        }
        val database = openDatabase(File(filesDir, "yumefriend.db").absolutePath)
        val core = YumeCore(modules, database, deviceId, "yumeFriend")
        repository = YumeRepository(core)
        legacyDb?.let {
            runCatching { repository.importLegacy(this, it) }
                .onSuccess { AppLog.record(this, "老版数据迁移完成") }
                .onFailure { error ->
                    Log.e("YumeApp", "老版数据迁移失败", error)
                    AppLog.record(this, "老版数据迁移失败：${error.message}")
                }
        }
        ScheduleAlarms.ensureChannel(this)
        AppLog.record(this, "应用启动")
        CoroutineScope(Dispatchers.IO).launch { ScheduleAlarms.refresh(this@YumeApp) }
    }
}
