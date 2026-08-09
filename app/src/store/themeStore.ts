import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_KEY = 'app_theme_mode';

export interface ThemeColors {
  bg: string;
  surface: string;
  surfaceHigh: string;
  border: string;
  accent: string;
  accentSoft: string;
  accentDim: string;
  text: string;
  textMuted: string;
  textDim: string;
  danger: string;
  success: string;
  warning: string;
}

export const darkColors: ThemeColors = {
  bg: '#000000',
  surface: '#0A0A0F',
  surfaceHigh: '#13131A',
  border: '#1E1E2E',
  accent: '#3B82F6',
  accentSoft: '#60A5FA',
  accentDim: '#1E3A5F',
  text: '#FFFFFF',
  textMuted: '#A9A9B2',
  textDim: '#48484A',
  danger: '#FF453A',
  success: '#32D74B',
  warning: '#FF9F0A',
};

export const lightColors: ThemeColors = {
  bg: '#F5F7FF',
  surface: '#FFFFFF',
  surfaceHigh: '#EEF2FF',
  border: '#D1D9FF',
  accent: '#2563EB',
  accentSoft: '#3B82F6',
  accentDim: '#DBEAFE',
  text: '#0A0F1E',
  textMuted: '#4B5563',
  textDim: '#9CA3AF',
  danger: '#FF3B30',
  success: '#34C759',
  warning: '#FF9500',
};

export const fonts = {
  brandBold: 'Orbitron-Bold',
  brandRegular: 'Orbitron-Regular',
  regular: 'System',
  bold: 'System',
};

interface ThemeState {
  themeMode: 'dark' | 'light';
  colors: ThemeColors;
  fonts: typeof fonts;
  toggleTheme: () => void;
  loadTheme: () => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set) => ({
  themeMode: 'dark',
  colors: darkColors,
  fonts,
  toggleTheme: () => set((state) => {
    const nextMode = state.themeMode === 'dark' ? 'light' : 'dark';
    AsyncStorage.setItem(THEME_KEY, nextMode).catch(() => {});
    return {
      themeMode: nextMode,
      colors: nextMode === 'dark' ? darkColors : lightColors,
    };
  }),
  loadTheme: async () => {
    try {
      const saved = await AsyncStorage.getItem(THEME_KEY);
      const mode = saved === 'light' ? 'light' : 'dark';
      set({
        themeMode: mode,
        colors: mode === 'dark' ? darkColors : lightColors,
      });
    } catch {
      // Default to dark if storage fails
    }
  },
}));

export const colors = darkColors;
