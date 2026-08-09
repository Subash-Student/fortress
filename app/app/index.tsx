import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Animated,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useThemeStore, ThemeColors } from '../src/store/themeStore';
import { authApi } from '../src/api/client';

type AppState = 'connecting' | 'unlocked' | 'error';

const BRAND_NAME = 'FORTRESS';

export default function SplashScreen() {
  const { colors, fonts } = useThemeStore();
  const styles = getStyles(colors, fonts);
  const [appState, setAppState] = useState<AppState>('connecting');

  // Staggered letters animation
  const letterAnims = useRef(BRAND_NAME.split('').map(() => new Animated.Value(0))).current;

  useEffect(() => {
    // Run staggered left-to-right letter reveal
    const anims = letterAnims.map((anim) =>
      Animated.timing(anim, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      })
    );
    Animated.stagger(80, anims).start();

    // Start connection check
    checkConnection();
  }, []);

  const checkConnection = async () => {
    setAppState('connecting');

    // Wait until backend health check is OK (silent retries)
    let isHealthy = false;
    while (!isHealthy) {
      try {
        const res = await authApi.healthCheck();
        if (res.data?.ok) {
          isHealthy = true;
        }
      } catch (err: any) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    try {
      // Check if session token exists
      const token = await SecureStore.getItemAsync('device_token');
      if (token) {
        // Verify token with backend
        const res = await authApi.checkSession();
        if (res.data?.valid) {
          // Session is valid. Go to Login screen with biometrics active
          setAppState('unlocked');
          setTimeout(() => {
            router.replace({ pathname: '/login', params: { biometrics: 'true' } });
          }, 100);
          return;
        }
      }
      
      // No token or invalid session: redirect to manual credentials login
      setAppState('unlocked');
      setTimeout(() => {
        router.replace('/login');
      }, 100);
    } catch (err: any) {
      console.log('[DEBUG] Session check failed, redirecting to login:', err.message);
      setAppState('unlocked');
      setTimeout(() => {
        router.replace('/login');
      }, 100);
    }
  };

  return (
    <View style={styles.container}>
      {/* Brand title container */}
      <View style={styles.brandContainer}>
        {BRAND_NAME.split('').map((letter, index) => {
          const anim = letterAnims[index];
          const opacity = anim;
          const translateY = anim.interpolate({
            inputRange: [0, 1],
            outputRange: [12, 0],
          });
          return (
            <Animated.Text
              key={index}
              style={[
                styles.letter,
                {
                  opacity,
                  transform: [{ translateY }],
                },
              ]}
            >
              {letter}
            </Animated.Text>
          );
        })}
      </View>

      {/* Connection / Auth Loader */}
      <View style={styles.footer}>
        {appState === 'connecting' && (
          <ActivityIndicator color={colors.accentSoft} size="large" />
        )}

        {appState === 'error' && (
          <View style={styles.errorContainer}>
            <TouchableOpacity style={styles.button} onPress={checkConnection} activeOpacity={0.8}>
              <Text style={styles.buttonText}>Retry Connection</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const getStyles = (colors: ThemeColors, fonts: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
    minHeight: 80,
  },
  letter: {
    fontFamily: fonts.brandRegular,
    color: colors.textMuted,
    fontSize: 38,
    fontWeight: '400',
    marginHorizontal: 7, // Emulates letterSpacing: 14
  },
  footer: {
    position: 'absolute',
    bottom: 80,
    left: 40,
    right: 40,
    alignItems: 'center',
    justifyContent: 'center',
    height: 60,
  },
  errorContainer: {
    width: '100%',
    alignItems: 'center',
  },
  button: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  buttonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
});
