import ExpoModulesCore

// iOS has no SMS access API for third-party apps, so this module is a stub —
// the JS side gates all real usage behind Platform.OS === 'android'.
public class ExpenseSmsReaderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpenseSmsReader")

    Function("hasSmsPermission") { () -> Bool in
      return false
    }

    AsyncFunction("requestSmsPermission") { () -> [String: Any] in
      return ["status": "denied", "granted": false, "canAskAgain": false]
    }

    AsyncFunction("readSmsInbox") { (_ sinceTimestampMs: Double) -> [[String: Any]] in
      return []
    }

    Function("startListening") { () -> Void in
      // no-op — no iOS equivalent
    }

    AsyncFunction("drainPendingRealtimeSms") { () -> [[String: Any]] in
      return []
    }
  }
}
