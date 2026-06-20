//  LiveActivityPlugin.kt
//  TEAM 3332 — Android analog of the iOS run Live Activity (619d)
//
//  The iOS feature shows a live lock-screen / Dynamic Island card with distance / time / pace.
//  Android has no Live Activity API, so the equivalent is an ONGOING NOTIFICATION that shows the
//  same live stats and updates as the run progresses. This plugin deliberately registers under the
//  SAME Capacitor jsName the iOS bridge uses — "LiveActivity" — so the existing JS helper in
//  app/src/app.jsx (LiveActivity.start / update / end) drives BOTH platforms with no JS changes:
//    • iOS   → ActivityKit Live Activity (LiveActivityPlugin.swift)
//    • Android→ this ongoing notification
//    • web / unsupported → JS no-op
//
//  Parity notes vs. iOS:
//    • Self-ticking time: iOS renders Text(style: .timer) so the clock ticks without app updates
//      (iOS rate-limits pushed updates). Android's equivalent is setUsesChronometer(true) +
//      setWhen(startMillis): the notification ticks the elapsed time on its own, so the time keeps
//      moving even while the WebView's JS timer is throttled in the background.
//    • "Run complete" end-flash: end() WITH final stats posts a brief (~4s) completion notification
//      (✓ Run complete + frozen final stats) then cancels; a BARE end() (the unmount-safety clear
//      when the user leaves mid-run) cancels immediately with no flash — same split as iOS.
//    • Deep-link: tapping the notification fires team3332://run, the same URL the iOS card uses;
//      the @capacitor/app appUrlOpen handler in app.jsx then jumps to the record screen. Requires
//      the team3332 <intent-filter> in AndroidManifest.xml (see android-native-src/AndroidManifest-additions.xml).
//
//  This is NOT a foreground service and does not own location — the background-geolocation plugin
//  already runs the tracking foreground service and keeps the process alive while recording. This
//  notification is purely the live-stats surface, so there's no second foreground service to fight.
//
//  Wiring: register in MainActivity (registerPlugin(LiveActivityPlugin::class.java)) — Android has
//  no packageClassList, so there's no patch-native-config step. See LIVE-ACTIVITY-ANDROID-SETUP.md.

package com.team3332.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "LiveActivity")
class LiveActivityPlugin : Plugin() {

    companion object {
        private const val CHANNEL_ID = "team3332_run"
        private const val CHANNEL_NAME = "Run tracking"
        private const val NOTIF_ID = 33321
        private const val FINISH_FLASH_MS = 4000L
        private const val DEEP_LINK = "team3332://run"
    }

    // Anchor for the self-ticking chronometer. setWhen(this) makes the notification's timer tick
    // from the run's true start, independent of how often update() is called. Stored once on
    // start() and reused by every update() so the elapsed time stays continuous.
    private var baseWhenMs: Long = 0L
    private var activityType: String = "Run"
    private var running: Boolean = false

    private val mainHandler = Handler(Looper.getMainLooper())

    // ── helpers ──────────────────────────────────────────────────────────────

    private fun manager(): NotificationManager =
        context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val mgr = manager()
            if (mgr.getNotificationChannel(CHANNEL_ID) == null) {
                val ch = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW)
                ch.description = "Shows your live distance, time and pace while a run is recording."
                ch.setShowBadge(false)
                ch.enableVibration(false)
                ch.setSound(null, null)
                mgr.createNotificationChannel(ch)
            }
        }
    }

    // Tapping the notification opens the app via the same deep link iOS uses. Falls back to a plain
    // app launch if nothing handles the scheme (the intent still targets our package).
    private fun contentIntent(): PendingIntent {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(DEEP_LINK)).apply {
            setPackage(context.packageName)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        var flags = PendingIntent.FLAG_UPDATE_CURRENT
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags = flags or PendingIntent.FLAG_IMMUTABLE
        }
        return PendingIntent.getActivity(context, 0, intent, flags)
    }

    // "3.21 mi · 8:42 /MI"  (pace) or "3.21 mi · 4.1 MPH" (walk)
    private fun statsLine(call: PluginCall): String {
        val miles = call.getDouble("distanceMiles") ?: 0.0
        val metricValue = call.getString("metricValue") ?: "—"
        val metricLabel = call.getString("metricLabel") ?: ""
        val miStr = String.format("%.2f mi", miles)
        return if (metricLabel.isEmpty()) "$miStr · $metricValue" else "$miStr · $metricValue $metricLabel"
    }

    private fun smallIcon(): Int {
        // Reuse the app's launcher/notification icon. android.R.drawable.ic_menu_compass is a safe
        // built-in fallback so this compiles even before a custom mono icon is added; swap for
        // R.drawable.ic_stat_run once a 24dp white run glyph exists (see setup doc).
        return android.R.drawable.ic_menu_compass
    }

    private fun postOngoing(call: PluginCall) {
        ensureChannel()
        val title = if (activityType == "Walk") "TEAM 3332 — Walk" else "TEAM 3332 — Run"
        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(smallIcon())
            .setContentTitle(title)
            .setContentText(statsLine(call))
            .setContentIntent(contentIntent())
            .setOngoing(true)                 // not swipe-dismissible while recording
            .setOnlyAlertOnce(true)           // silent updates — no buzz on every tick
            .setUsesChronometer(true)         // self-ticking elapsed time (iOS Text(.timer) analog)
            .setWhen(baseWhenMs)
            .setShowWhen(true)
            .setCategory(NotificationCompat.CATEGORY_WORKOUT)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setColor(0xFFD4AF37.toInt())     // TEAM 3332 gold
        notify(builder.build())
    }

    // NotificationManagerCompat.notify is a no-op (no crash) if POST_NOTIFICATIONS is denied on
    // Android 13+. We catch SecurityException defensively for good measure.
    private fun notify(notification: android.app.Notification) {
        try {
            NotificationManagerCompat.from(context).notify(NOTIF_ID, notification)
        } catch (_: SecurityException) {
            // notifications not permitted — recording continues unaffected
        }
    }

    // ── plugin API (mirrors LiveActivityPlugin.swift) ────────────────────────

    @PluginMethod
    fun isSupported(call: PluginCall) {
        val enabled = NotificationManagerCompat.from(context).areNotificationsEnabled()
        val ret = JSObject()
        ret.put("supported", enabled)
        call.resolve(ret)
    }

    @PluginMethod
    fun start(call: PluginCall) {
        activityType = if (call.getString("activityType") == "Walk") "Walk" else "Run"
        // Anchor the chronometer to the true start. elapsedSeconds is normally 0 at start, but if a
        // run is resumed we honor it so the ticking time is correct.
        val elapsed = call.getInt("elapsedSeconds") ?: 0
        baseWhenMs = System.currentTimeMillis() - elapsed.toLong() * 1000L
        running = true
        postOngoing(call)
        val ret = JSObject()
        ret.put("started", true)
        call.resolve(ret)
    }

    @PluginMethod
    fun update(call: PluginCall) {
        if (!running) { call.resolve(); return }
        postOngoing(call)
        call.resolve()
    }

    @PluginMethod
    fun end(call: PluginCall) {
        if (!running) { call.resolve(); return }
        running = false
        // end() WITH stats → brief "Run complete" flash; bare end() → cancel immediately. Matches iOS.
        val hasStats = call.getData().has("distanceMiles") || call.getData().has("elapsedSeconds")
        if (hasStats) {
            ensureChannel()
            val title = if (activityType == "Walk") "✓ Walk complete" else "✓ Run complete"
            val finished = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(smallIcon())
                .setContentTitle(title)
                .setContentText(statsLine(call))
                .setContentIntent(contentIntent())
                .setOngoing(false)
                .setAutoCancel(true)
                .setOnlyAlertOnce(true)
                .setUsesChronometer(false)    // freeze the final time
                .setWhen(baseWhenMs)
                .setShowWhen(true)
                .setCategory(NotificationCompat.CATEGORY_WORKOUT)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setColor(0xFFD4AF37.toInt())
                .build()
            notify(finished)
            mainHandler.postDelayed({
                try { NotificationManagerCompat.from(context).cancel(NOTIF_ID) } catch (_: Exception) {}
            }, FINISH_FLASH_MS)
        } else {
            try { NotificationManagerCompat.from(context).cancel(NOTIF_ID) } catch (_: Exception) {}
        }
        call.resolve()
    }

    // Safety: if the activity is torn down mid-run, clear any lingering notification.
    override fun handleOnDestroy() {
        super.handleOnDestroy()
        mainHandler.removeCallbacksAndMessages(null)
        try { NotificationManagerCompat.from(context).cancel(NOTIF_ID) } catch (_: Exception) {}
    }
}
