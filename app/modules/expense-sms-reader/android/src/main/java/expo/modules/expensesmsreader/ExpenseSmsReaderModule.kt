package expo.modules.expensesmsreader

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Telephony
import androidx.core.content.ContextCompat
import expo.modules.interfaces.permissions.Permissions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val EVENT_SMS_RECEIVED = "onSmsReceived"

class ExpenseSmsReaderModule : Module() {
  private var receiver: BroadcastReceiver? = null
  private var isReceiverRegistered = false

  override fun definition() = ModuleDefinition {
    Name("ExpenseSmsReader")

    Events(EVENT_SMS_RECEIVED)

    // READ_SMS covers reading the existing inbox (readSmsInbox); RECEIVE_SMS covers the
    // real-time broadcast (registerSmsReceiver). Both are requested/checked together so
    // "enable SMS auto-capture" is a single permission step from the JS side.
    Function("hasSmsPermission") {
      val context = appContext.reactContext ?: return@Function false
      ContextCompat.checkSelfPermission(context, Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED &&
        ContextCompat.checkSelfPermission(context, Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED
    }

    AsyncFunction("requestSmsPermission") { promise: expo.modules.kotlin.Promise ->
      Permissions.askForPermissionsWithPermissionsManager(
        appContext.permissions, promise, Manifest.permission.READ_SMS, Manifest.permission.RECEIVE_SMS
      )
    }

    // Reads the device SMS inbox (content://sms/inbox), optionally only messages
    // received on/after `sinceTimestampMs` (epoch millis) for incremental re-scans.
    AsyncFunction("readSmsInbox") { sinceTimestampMs: Double, promise: expo.modules.kotlin.Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("ERR_NO_CONTEXT", "React context is unavailable", null)
        return@AsyncFunction
      }

      try {
        val results = mutableListOf<Map<String, Any?>>()
        val uri = Uri.parse("content://sms/inbox")
        val projection = arrayOf("_id", "address", "body", "date")
        val selection = "date >= ?"
        val selectionArgs = arrayOf(sinceTimestampMs.toLong().toString())

        context.contentResolver.query(uri, projection, selection, selectionArgs, "date ASC")?.use { cursor ->
          val idIdx = cursor.getColumnIndexOrThrow("_id")
          val addressIdx = cursor.getColumnIndexOrThrow("address")
          val bodyIdx = cursor.getColumnIndexOrThrow("body")
          val dateIdx = cursor.getColumnIndexOrThrow("date")

          while (cursor.moveToNext()) {
            results.add(
              mapOf(
                "id" to cursor.getString(idIdx),
                "address" to cursor.getString(addressIdx),
                "body" to cursor.getString(bodyIdx),
                "date" to cursor.getLong(dateIdx)
              )
            )
          }
        }

        promise.resolve(results)
      } catch (e: Exception) {
        promise.reject("ERR_SMS_READ", e.message ?: "Failed to read SMS inbox", e)
      }
    }

    // Reads and clears whatever SmsPersistReceiver (the manifest-declared receiver) saved
    // while the app process was fully killed. Call this once at app launch to catch up.
    AsyncFunction("drainPendingRealtimeSms") { promise: expo.modules.kotlin.Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.resolve(emptyList<Map<String, Any?>>())
        return@AsyncFunction
      }

      try {
        val prefs = context.getSharedPreferences(SmsPersistReceiver.PREFS_NAME, Context.MODE_PRIVATE)
        val raw = prefs.getString(SmsPersistReceiver.PENDING_KEY, "[]") ?: "[]"
        prefs.edit().remove(SmsPersistReceiver.PENDING_KEY).apply()

        val array = org.json.JSONArray(raw)
        val results = mutableListOf<Map<String, Any?>>()
        for (i in 0 until array.length()) {
          val obj = array.getJSONObject(i)
          results.add(
            mapOf(
              "address" to if (obj.isNull("address")) null else obj.getString("address"),
              "body" to if (obj.isNull("body")) null else obj.getString("body"),
              "date" to obj.optLong("date", 0L)
            )
          )
        }
        promise.resolve(results)
      } catch (e: Exception) {
        promise.reject("ERR_DRAIN_PENDING", e.message ?: "Failed to drain pending SMS queue", e)
      }
    }

    // Starts (or is a no-op if already started) a runtime-registered receiver that emits
    // `onSmsReceived` for every new SMS while this app process is alive — foreground or
    // backgrounded. It stops the moment Android kills the process; there is no manifest
    // (static) receiver here, so nothing is captured while the app is fully closed. Call
    // this right after permission is granted so listening starts without waiting for the
    // next app foreground/background cycle.
    Function("startListening") {
      registerSmsReceiver()
    }

    OnCreate {
      registerSmsReceiver()
    }

    OnActivityEntersForeground {
      registerSmsReceiver()
    }

    OnDestroy {
      unregisterSmsReceiver()
    }
  }

  private fun registerSmsReceiver() {
    if (isReceiverRegistered) return
    val context = appContext.reactContext ?: return

    val hasPermission = ContextCompat.checkSelfPermission(context, Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED
    if (!hasPermission) return

    val newReceiver = object : BroadcastReceiver() {
      override fun onReceive(receiverContext: Context?, intent: Intent?) {
        if (intent == null) return
        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        for (sms in messages) {
          sendEvent(
            EVENT_SMS_RECEIVED,
            mapOf(
              "address" to sms.originatingAddress,
              "body" to sms.messageBody,
              "date" to sms.timestampMillis
            )
          )
        }
      }
    }

    val filter = IntentFilter(Telephony.Sms.Intents.SMS_RECEIVED_ACTION)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.registerReceiver(newReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      context.registerReceiver(newReceiver, filter)
    }

    receiver = newReceiver
    isReceiverRegistered = true
  }

  private fun unregisterSmsReceiver() {
    val context = appContext.reactContext
    val currentReceiver = receiver
    if (context != null && currentReceiver != null) {
      try {
        context.unregisterReceiver(currentReceiver)
      } catch (e: IllegalArgumentException) {
        // Already unregistered — safe to ignore.
      }
    }
    receiver = null
    isReceiverRegistered = false
  }
}
