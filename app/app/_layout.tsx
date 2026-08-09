import '../global.css';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as ScreenCapture from 'expo-screen-capture';
import { useFonts } from 'expo-font';
import { useAuthStore } from '../src/store/authStore';
import { useThemeStore } from '../src/store/themeStore';

export default function RootLayout() {
  const { isUnlocked } = useAuthStore();
  const { themeMode, loadTheme } = useThemeStore();
  const [fontsLoaded, fontError] = useFonts({
    'Orbitron-Bold': require('../assets/fonts/Orbitron-Bold.ttf'),
    'Orbitron-Regular': require('../assets/fonts/Orbitron-Regular.ttf'),
  });

  useEffect(() => {
    // Restore saved theme from storage before rendering
    loadTheme();
  }, []);

  useEffect(() => {
    console.log('[DEBUG] RootLayout rendering, fontsLoaded:', fontsLoaded, 'fontError:', fontError);
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    ScreenCapture.preventScreenCaptureAsync();
    return () => {
      ScreenCapture.allowScreenCaptureAsync();
    };
  }, []);

  const isReady = fontsLoaded || (fontError && fontError.message.includes('104'));

  if (!isReady) {
    return null;
  }

  return (
    <>
      <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#000000' },
          headerTintColor: '#FFFFFF',
          headerBackTitle: 'Back',
          contentStyle: { backgroundColor: '#000000' },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="home" options={{ headerShown: false }} />
        <Stack.Screen name="vault" options={{ title: 'Vault', headerShown: false }} />
        <Stack.Screen name="links" options={{ title: 'Links', headerShown: false }} />
      </Stack>
    </>
  );
}
