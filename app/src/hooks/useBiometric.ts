import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../store/authStore';
import { generateKey } from '../crypto/encryption';

const VAULT_KEY = 'vault_key';

// Try SecureStore first, fall back to AsyncStorage (Expo Go on Android)
async function saveKey(key: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(VAULT_KEY, key);
  } catch {
    await AsyncStorage.setItem(VAULT_KEY, key);
  }
}

async function loadKey(): Promise<string | null> {
  try {
    const key = await SecureStore.getItemAsync(VAULT_KEY);
    if (key) return key;
  } catch {}
  // Fallback to AsyncStorage
  return AsyncStorage.getItem(VAULT_KEY);
}

async function initVaultKey(): Promise<string> {
  const existing = await loadKey();
  if (existing) return existing;
  const newKey = generateKey();
  await saveKey(newKey);
  return newKey;
}

export function useBiometric() {
  const { unlock, lock } = useAuthStore();

  const isSupported = async () => {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return compatible && enrolled;
  };

  const authenticate = async (): Promise<boolean> => {
    try {
      const supported = await isSupported();
      if (!supported) {
        const key = await initVaultKey();
        unlock(key);
        return true;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Vault',
        fallbackLabel: 'Use Passcode',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });

      if (result.success) {
        const key = await initVaultKey();
        unlock(key);
        return true;
      }

      lock();
      return false;
    } catch {
      lock();
      return false;
    }
  };

  const unlockDirect = async (): Promise<void> => {
    const key = await initVaultKey();
    unlock(key);
  };

  return { authenticate, unlockDirect, isSupported };
}
