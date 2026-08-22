import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { EventSubscription } from 'expo-modules-core';
import ExpenseSmsReader, { RealtimeSmsEvent } from '../../modules/expense-sms-reader/src/ExpenseSmsReaderModule';
import { parseMessage } from '../expense-parser';
import { encrypt } from '../crypto/encryption';
import { expensesApi } from '../api/client';

const LAST_SYNCED_KEY = 'expense_sms_last_synced_at';
const REVIEW_QUEUE_KEY = 'expense_sms_unparsed_queue';

export interface UnparsedSmsEntry {
  id: string;
  address: string | null;
  body: string | null;
  date: number;
}

export interface SmsSyncResult {
  scanned: number;
  matched: number;
  unmatched: number;
  synced: number;
}

export function isSmsCaptureSupported(): boolean {
  return Platform.OS === 'android';
}

export async function hasSmsPermission(): Promise<boolean> {
  if (!isSmsCaptureSupported()) return false;
  return ExpenseSmsReader.hasSmsPermission();
}

export async function requestSmsPermission(): Promise<boolean> {
  if (!isSmsCaptureSupported()) return false;
  const result = await ExpenseSmsReader.requestSmsPermission();
  if (result.granted) {
    // Start listening immediately rather than waiting for the next foreground/background cycle.
    ExpenseSmsReader.startListening();
  }
  return result.granted;
}

async function getLastSyncedAt(): Promise<number> {
  const raw = await AsyncStorage.getItem(LAST_SYNCED_KEY);
  return raw ? parseInt(raw, 10) : 0;
}

async function setLastSyncedAt(timestamp: number): Promise<void> {
  await AsyncStorage.setItem(LAST_SYNCED_KEY, String(timestamp));
}

// Pushes the incremental-scan cursor forward so a later readSmsInbox() re-scan won't
// re-fetch a message that real-time capture already handled (it uses a different,
// content-derived sourceRef than the inbox scan's provider-id-based one, so the
// backend's sourceRef uniqueness check alone can't catch that particular overlap).
async function advanceLastSyncedAt(timestamp: number): Promise<void> {
  const current = await getLastSyncedAt();
  if (timestamp >= current) {
    await setLastSyncedAt(timestamp + 1);
  }
}

// Small stable hash (not cryptographic) used only to build a deterministic sourceRef
// for real-time events, which arrive without the SMS provider's row id.
function hashText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

export async function getUnparsedQueue(): Promise<UnparsedSmsEntry[]> {
  const raw = await AsyncStorage.getItem(REVIEW_QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function appendToUnparsedQueue(entries: UnparsedSmsEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const existing = await getUnparsedQueue();
  const existingIds = new Set(existing.map((e) => e.id));
  const merged = [...existing, ...entries.filter((e) => !existingIds.has(e.id))];
  await AsyncStorage.setItem(REVIEW_QUEUE_KEY, JSON.stringify(merged));
}

export async function dismissUnparsedEntry(id: string): Promise<void> {
  const existing = await getUnparsedQueue();
  await AsyncStorage.setItem(REVIEW_QUEUE_KEY, JSON.stringify(existing.filter((e) => e.id !== id)));
}

// Reads new SMS since the last sync (or the full inbox when fullHistory is true),
// runs each message through the parser registry, and pushes matched transactions
// to the backend (encrypted client-side, category left null so they land in the
// "Needs Review" inbox). Unmatched messages stay in a local-only queue — their
// raw text never leaves the device.
export async function syncSmsTransactions(vaultKey: string, fullHistory = false): Promise<SmsSyncResult> {
  if (!isSmsCaptureSupported()) {
    return { scanned: 0, matched: 0, unmatched: 0, synced: 0 };
  }

  const granted = await hasSmsPermission();
  if (!granted) {
    return { scanned: 0, matched: 0, unmatched: 0, synced: 0 };
  }

  const since = fullHistory ? 0 : await getLastSyncedAt();
  const messages = await ExpenseSmsReader.readSmsInbox(since);

  let matched = 0;
  let synced = 0;
  const unparsed: UnparsedSmsEntry[] = [];
  let maxDate = since;

  for (const msg of messages) {
    if (msg.date > maxDate) maxDate = msg.date;
    if (!msg.body) continue;

    const parsed = parseMessage(msg.body, new Date(msg.date));
    if (!parsed) {
      unparsed.push({ id: msg.id, address: msg.address, body: msg.body, date: msg.date });
      continue;
    }

    matched++;
    try {
      await expensesApi.saveTransaction({
        amount: encrypt(String(parsed.amount), vaultKey),
        counterparty: encrypt(parsed.counterparty, vaultKey),
        notes: encrypt('', vaultKey),
        type: parsed.type,
        category: null,
        bankAccountId: null,
        occurredAt: parsed.occurredAt.toISOString(),
        source: 'sms',
        sourceRef: `sms:${msg.id}`,
      });
      synced++;
    } catch (err: any) {
      // A 409 means this SMS was already synced on a previous scan (unique sourceRef) — expected, not an error.
      if (err?.response?.status !== 409) {
        console.error('Failed to sync SMS transaction:', err);
      }
    }
  }

  await appendToUnparsedQueue(unparsed);
  await setLastSyncedAt(maxDate);

  return { scanned: messages.length, matched, unmatched: unparsed.length, synced };
}

async function handleRealtimeSms(event: RealtimeSmsEvent, vaultKey: string): Promise<void> {
  if (!event?.body) return;

  const parsed = parseMessage(event.body, new Date(event.date));
  if (!parsed) {
    await appendToUnparsedQueue([{ id: `sms:rt:${event.date}:${hashText(event.body)}`, address: event.address, body: event.body, date: event.date }]);
    await advanceLastSyncedAt(event.date);
    return;
  }

  try {
    await expensesApi.saveTransaction({
      amount: encrypt(String(parsed.amount), vaultKey),
      counterparty: encrypt(parsed.counterparty, vaultKey),
      notes: encrypt('', vaultKey),
      type: parsed.type,
      category: null,
      bankAccountId: null,
      occurredAt: parsed.occurredAt.toISOString(),
      source: 'sms',
      sourceRef: `sms:rt:${event.date}:${hashText(event.body)}`,
    });
  } catch (err: any) {
    if (err?.response?.status !== 409) {
      console.error('Failed to sync realtime SMS transaction:', err);
    }
  }

  await advanceLastSyncedAt(event.date);
}

// Drains whatever the manifest-declared receiver captured while the app process was
// fully killed (nothing to do with the runtime listener above, which only works while
// the app is alive). Call once at app launch, right after the vault is unlocked.
export async function drainPendingRealtimeSms(vaultKey: string): Promise<number> {
  if (!isSmsCaptureSupported()) return 0;
  const pending = await ExpenseSmsReader.drainPendingRealtimeSms();
  for (const event of pending) {
    await handleRealtimeSms(event, vaultKey);
  }
  return pending.length;
}

// Subscribes to new SMS while this app process is alive (foreground or backgrounded —
// stops the moment Android kills the process). Call once, e.g. at app root, gated on
// the vault being unlocked; call .remove() on the returned subscription to stop.
export function subscribeToRealtimeSms(vaultKey: string): EventSubscription | null {
  if (!isSmsCaptureSupported()) return null;
  ExpenseSmsReader.startListening();
  return ExpenseSmsReader.addListener('onSmsReceived', (event) => {
    handleRealtimeSms(event, vaultKey);
  });
}
