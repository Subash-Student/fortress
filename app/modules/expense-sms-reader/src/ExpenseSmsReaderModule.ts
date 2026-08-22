import { NativeModule, requireNativeModule } from 'expo';
import { NativeSmsMessage } from './ExpenseSmsReader.types';

export interface SmsPermissionResponse {
  status: 'granted' | 'denied' | 'undetermined';
  granted: boolean;
  canAskAgain: boolean;
}

export interface RealtimeSmsEvent {
  address: string | null;
  body: string | null;
  date: number;
}

type ExpenseSmsReaderEvents = {
  onSmsReceived: (event: RealtimeSmsEvent) => void;
};

declare class ExpenseSmsReaderModule extends NativeModule<ExpenseSmsReaderEvents> {
  hasSmsPermission(): boolean;
  requestSmsPermission(): Promise<SmsPermissionResponse>;
  readSmsInbox(sinceTimestampMs: number): Promise<NativeSmsMessage[]>;
  // Starts the runtime SMS receiver so `onSmsReceived` fires without waiting for the
  // next app foreground/background cycle. Safe to call repeatedly (no-op if running).
  startListening(): void;
  // Reads and clears whatever the manifest-declared receiver captured while the app
  // process was fully killed. Call once at app launch.
  drainPendingRealtimeSms(): Promise<RealtimeSmsEvent[]>;
}

export default requireNativeModule<ExpenseSmsReaderModule>('ExpenseSmsReader');
