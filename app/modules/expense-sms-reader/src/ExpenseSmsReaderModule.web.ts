import { registerWebModule, NativeModule } from 'expo';

// SMS reading has no web equivalent — every method is a no-op/rejection so the
// rest of the app can import this module unconditionally on any platform.
class ExpenseSmsReaderModule extends NativeModule<{}> {
  hasSmsPermission(): boolean {
    return false;
  }

  async requestSmsPermission() {
    return { status: 'denied' as const, granted: false, canAskAgain: false };
  }

  async readSmsInbox(): Promise<never[]> {
    return [];
  }

  startListening(): void {
    // no-op — no web equivalent
  }

  async drainPendingRealtimeSms(): Promise<never[]> {
    return [];
  }
}

export default registerWebModule(ExpenseSmsReaderModule, 'ExpenseSmsReader');
