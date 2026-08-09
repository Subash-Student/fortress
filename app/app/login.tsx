import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Haptics from 'expo-haptics';
import { useThemeStore } from '../src/store/themeStore';
import { useAuthStore } from '../src/store/authStore';
import { deriveKey } from '../src/crypto/encryption';
import { authApi } from '../src/api/client';

export default function LoginScreen() {
  const { colors, fonts, themeMode, toggleTheme } = useThemeStore();
  const { unlock } = useAuthStore();
  const params = useLocalSearchParams();

  const [username, setUsername] = useState('Logan');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  useEffect(() => {
    checkBiometrics();
  }, []);

  const checkBiometrics = async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    const isAvailable = hasHardware && isEnrolled && params.biometrics === 'true';
    setBiometricAvailable(isAvailable);
    if (isAvailable) {
      handleBiometricUnlock();
    }
  };

  const handleBiometricUnlock = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock your Fortress Vault',
        fallbackLabel: 'Use Master Password',
        disableDeviceFallback: false,
      });

      if (result.success) {
        setLoading(true);
        const token = await SecureStore.getItemAsync('device_token');
        const key = await SecureStore.getItemAsync('vault_key');

        if (token && key) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          unlock(key);
          router.replace('/home');
        } else {
          Alert.alert('Session Error', 'Please log in with your credentials first.');
          setLoading(false);
        }
      }
    } catch (err) {
      console.log('Biometric authentication failed:', err);
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Fields Required', 'Please enter both username and Master Password.');
      return;
    }

    setLoading(true);
    try {
      const res = await authApi.login(username.trim(), password.trim());
      const { token } = res.data;
      const derivedKey = deriveKey(password.trim(), username.trim().toLowerCase());
      await SecureStore.setItemAsync('device_token', token);
      await SecureStore.setItemAsync('vault_key', derivedKey);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      unlock(derivedKey);
      router.replace('/home');
    } catch (err: any) {
      console.log('Login error:', err);
      const errMsg = err.response?.data?.error || 'Invalid credentials. Please try again.';
      Alert.alert('Access Denied', errMsg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const canUnlock = username.trim().length > 0 && password.trim().length > 0;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }}>
      {/* Top bar with theme toggle */}
      <View className="flex-row justify-end px-5 pt-2 pb-1">
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            toggleTheme();
          }}
          className="w-10 h-10 rounded-full items-center justify-center"
          style={{ backgroundColor: colors.surfaceHigh }}
          activeOpacity={0.7}
        >
          <Ionicons
            name={themeMode === 'dark' ? 'sunny-outline' : 'moon-outline'}
            size={20}
            color={colors.text}
          />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="flex-grow justify-center px-6 py-8"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo Title */}
          <View className="items-center mb-12">
            <Text
              className="text-4xl font-bold tracking-[6px] mb-2"
              style={{ fontFamily: fonts.brandRegular, color: colors.text }}
            >
              FORTRESS
            </Text>
            <Text
              className="text-xs font-semibold tracking-[2px]"
              style={{ fontFamily: fonts.brandRegular, color: colors.textMuted }}
            >
              SECURITY VAULT
            </Text>
          </View>

          {/* Form Card */}
          <View
            className="rounded-[28px] border p-6 gap-5"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              shadowColor: '#000000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: themeMode === 'dark' ? 0.4 : 0.1,
              shadowRadius: 20,
            }}
          >
            <Text
              className="text-center text-[15px] font-bold mb-1 tracking-[0.5px]"
              style={{ color: colors.text }}
            >
              Unlock Vault Profile
            </Text>

            {/* Username Input */}
            <View>
              <Text className="text-xs font-bold mb-2 tracking-[0.5px]" style={{ color: colors.textMuted }}>
                Username
              </Text>
              <View
                className="flex-row items-center border rounded-xl px-4 h-12"
                style={{ backgroundColor: colors.surfaceHigh, borderColor: colors.border }}
              >
                <TextInput
                  className="flex-grow text-sm font-medium"
                  style={{ color: colors.text }}
                  placeholder="Username"
                  placeholderTextColor={colors.textDim}
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* Password Input */}
            <View>
              <Text className="text-xs font-bold mb-2 tracking-[0.5px]" style={{ color: colors.textMuted }}>
                Master Password
              </Text>
              <View
                className="flex-row items-center border rounded-xl px-4 h-12"
                style={{ backgroundColor: colors.surfaceHigh, borderColor: colors.border }}
              >
                <TextInput
                  className="flex-grow text-sm font-medium"
                  style={{ color: colors.text }}
                  placeholder="Enter Master Password"
                  placeholderTextColor={colors.textDim}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={colors.textMuted}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Unlock Button — black/white, no violet */}
            <TouchableOpacity
              className="rounded-xl h-12 items-center justify-center mt-2"
              style={{
                backgroundColor: canUnlock ? colors.accent : colors.surfaceHigh,
                shadowColor: colors.accent,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: canUnlock ? 0.35 : 0,
                shadowRadius: 8,
              }}
              onPress={handleLogin}
              disabled={loading || !canUnlock}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text
                  className="text-sm font-bold tracking-[1px]"
                  style={{ color: canUnlock ? '#FFFFFF' : colors.textDim }}
                >
                  UNLOCK VAULT
                </Text>
              )}
            </TouchableOpacity>

            {/* Biometric Option */}
            {biometricAvailable && (
              <TouchableOpacity
                className="flex-row items-center justify-center gap-2 border rounded-xl h-12"
                style={{ borderColor: colors.border, backgroundColor: 'transparent' }}
                onPress={handleBiometricUnlock}
                disabled={loading}
                activeOpacity={0.7}
              >
                <Ionicons name="finger-print-outline" size={20} color={colors.accent} />
                <Text className="text-sm font-bold" style={{ color: colors.textMuted }}>
                  Biometric Unlock
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
