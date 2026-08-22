export interface NativeSmsMessage {
  id: string;
  address: string | null;
  body: string | null;
  date: number; // epoch ms, as recorded by the device SMS provider
}
