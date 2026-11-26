package com.yumefriend.app

import android.content.Context
import java.io.File
import java.time.Instant

object AppLog {
    private val lock = Any()

    fun record(context: Context, message: String) {
        synchronized(lock) {
            val directory = File(context.filesDir, "logs").apply { mkdirs() }
            val file = File(directory, "app.log")
            file.appendText("${Instant.now()} $message\n")
        }
    }

    fun read(context: Context): List<String> {
        val file = File(File(context.filesDir, "logs"), "app.log")
        if (!file.exists()) return emptyList()
        return synchronized(lock) { file.readLines().takeLast(200) }
    }

    fun clear(context: Context) {
        synchronized(lock) {
            File(File(context.filesDir, "logs"), "app.log").delete()
        }
    }
}
