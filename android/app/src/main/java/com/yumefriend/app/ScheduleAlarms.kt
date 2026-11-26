package com.yumefriend.app

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

object ScheduleAlarms {
    private const val CHANNEL_ID = "schedule"
    private const val DAY_MS = 24 * 60 * 60 * 1000L

    fun ensureChannel(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "日程提醒", NotificationManager.IMPORTANCE_DEFAULT),
        )
    }

    fun refresh(context: Context) {
        val repository = (context.applicationContext as YumeApp).repository
        val now = System.currentTimeMillis()
        repository.pendingSchedules().forEach { schedule ->
            val due = dueAt(schedule) ?: return@forEach
            if (due > now) {
                schedule(context, schedule)
            } else if (due >= now - DAY_MS) {
                repository.remindSchedule(schedule.id)?.let { notify(context, schedule.id, it) }
            }
        }
    }

    fun schedule(context: Context, schedule: Schedule) {
        val due = dueAt(schedule) ?: return
        if (due <= System.currentTimeMillis()) return
        val alarm = context.getSystemService(AlarmManager::class.java)
        alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, due, pendingIntent(context, schedule.id))
    }

    fun cancel(context: Context, scheduleId: String) {
        val alarm = context.getSystemService(AlarmManager::class.java)
        alarm.cancel(pendingIntent(context, scheduleId))
    }

    fun notify(context: Context, scheduleId: String, title: String) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) return
        val open = PendingIntent.getActivity(
            context,
            scheduleId.hashCode(),
            Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_yume)
            .setContentTitle("日程提醒")
            .setContentText(title)
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        context.getSystemService(NotificationManager::class.java)
            .notify(scheduleId.hashCode(), notification)
    }

    private fun pendingIntent(context: Context, scheduleId: String): PendingIntent =
        PendingIntent.getBroadcast(
            context,
            scheduleId.hashCode(),
            Intent(context, ScheduleAlarmReceiver::class.java).putExtra("schedule_id", scheduleId),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    private fun dueAt(schedule: Schedule): Long? {
        if (schedule.timeLocal.isBlank()) return null
        return runCatching {
            LocalDate.parse(schedule.dateLocal)
                .atTime(LocalTime.parse(schedule.timeLocal))
                .atZone(ZoneId.systemDefault())
                .toInstant()
                .toEpochMilli() - schedule.advanceMinutes * 60_000L
        }.getOrNull()
    }
}

class ScheduleAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra("schedule_id") ?: return
        val repository = (context.applicationContext as YumeApp).repository
        repository.remindSchedule(id)?.let { ScheduleAlarms.notify(context, id, it) }
    }
}

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        ScheduleAlarms.refresh(context)
    }
}
