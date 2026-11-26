package com.yumefriend.app

import android.app.Application
import com.yume.core.YumeCore
import com.yume.core.manifest.ManifestLoader
import com.yume.core.storage.openDatabase
import java.io.File
import java.util.UUID

class YumeApp : Application() {
    lateinit var repository: YumeRepository
        private set

    override fun onCreate() {
        super.onCreate()
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
    }
}
