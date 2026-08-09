import * as SecureStore from 'expo-secure-store';
import * as Application from 'expo-application';
import client from '../api/client';

const DEVICE_TOKEN_KEY = 'device_token';
const DEVICE_ID_KEY = 'device_id';

async function getOrCreateDeviceId(): Promise<string> {
  let id = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (!id) {
    id =
      Application.applicationId +
      '-' +
      Math.random().toString(36).slice(2) +
      Date.now().toString(36);
    await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  }
  return id;
}

export async function ensureDeviceToken(): Promise<void> {
  const existing = await SecureStore.getItemAsync(DEVICE_TOKEN_KEY);
  if (existing) return;

  const deviceId = await getOrCreateDeviceId();
  const res = await client.post('/auth/token', { deviceId });
  await SecureStore.setItemAsync(DEVICE_TOKEN_KEY, res.data.token);
}
