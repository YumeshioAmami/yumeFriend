package com.yumefriend.app

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object LegacyMigration {
    fun prepare(context: Context): File? {
        val dbFile = File(context.filesDir, "yumefriend.db")
        if (!dbFile.exists() || !isLegacy(dbFile)) return null

        val backupDir = File(context.filesDir, "backups").apply { mkdirs() }
        val stamp = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(Date())
        val backup = File(backupDir, "yumefriend-legacy-$stamp.db")
        dbFile.copyTo(backup, overwrite = true)
        listOf("-wal", "-shm", "-journal").forEach { suffix ->
            val source = File(dbFile.path + suffix)
            if (source.exists()) source.copyTo(File(backup.path + suffix), overwrite = true)
        }

        val legacy = File(context.filesDir, "yumefriend.legacy.db")
        check(dbFile.renameTo(legacy)) { "无法保留老版数据库" }
        listOf("-wal", "-shm", "-journal").forEach { suffix ->
            val source = File(dbFile.path + suffix)
            if (source.exists()) source.renameTo(File(legacy.path + suffix))
        }
        return legacy
    }

    private fun isLegacy(dbFile: File): Boolean {
        val db = SQLiteDatabase.openDatabase(dbFile.path, null, SQLiteDatabase.OPEN_READONLY)
        return db.use {
            val columns = it.rawQuery("PRAGMA table_info(messages)", null).use { cursor ->
                buildSet {
                    while (cursor.moveToNext()) add(cursor.getString(1))
                }
            }
            "mode_at_send" in columns && "kind" !in columns
        }
    }
}
