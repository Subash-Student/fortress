import { create } from 'zustand';

interface AuthState {
  isUnlocked: boolean;
  vaultKey: string | null;
  unlock: (key: string) => void;
  lock: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isUnlocked: false,
  vaultKey: null,
  unlock: (key) => set({ isUnlocked: true, vaultKey: key }),
  lock: () => set({ isUnlocked: false, vaultKey: null }),
}));
