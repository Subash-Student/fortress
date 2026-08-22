package expo.modules.expensesmsreader

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import org.json.JSONArray
import org.json.JSONObject

// Manifest-declared (static) receiver — unlike the runtime one registered by
// ExpenseSmsReaderModule, the OS can launch this even when the app process is fully
// killed. It has only a few seconds to run, so it must do the minimum: persist the
// message to SharedPreferences and return. No network calls, no JS bridge access —
// the app drains this queue itself the next time it launches (see
// ExpenseSmsReaderModule#drainPendingRealtimeSms).
class SmsPersistReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context?, intent: Intent?) {
    if (context == null || intent == null) return
    val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
    if (messages.isEmpty()) return

    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val pending = JSONArray(prefs.getString(PENDING_KEY, "[]") ?: "[]")

    for (sms in messages) {
      val entry = JSONObject()
      entry.put("address", sms.originatingAddress ?: JSONObject.NULL)
      entry.put("body", sms.messageBody ?: JSONObject.NULL)
      entry.put("date", sms.timestampMillis)
      pending.put(entry)
    }

    prefs.edit().putString(PENDING_KEY, pending.toString()).apply()
  }

  companion object {
    const val PREFS_NAME = "expense_sms_reader_pending"
    const val PENDING_KEY = "pending_messages"
  }
}
