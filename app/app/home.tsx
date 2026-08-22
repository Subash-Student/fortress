import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../src/store/themeStore';
import { MODULES } from '../src/config/modules';

export default function HomeScreen() {
  const { colors, fonts, themeMode, toggleTheme } = useThemeStore();

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }}>
      <View className="flex-1 px-5">
        {/* Header Bar */}
        <View className="flex-row items-center justify-between py-4 border-b" style={{ borderColor: colors.border }}>
          <Text className="text-xl font-bold tracking-[3px]" style={{ fontFamily: fonts.brandRegular, color: colors.textMuted }}>
            FORTRESS
          </Text>
          <TouchableOpacity 
            className="w-9 h-9 rounded-lg border items-center justify-center"
            style={{ backgroundColor: colors.surface, borderColor: colors.border }}
            onPress={toggleTheme} 
            activeOpacity={0.7}
          >
            <Ionicons 
              name={themeMode === 'dark' ? 'sunny' : 'moon'} 
              size={20} 
              color={colors.text} 
            />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerClassName="pt-9 pb-10" showsVerticalScrollIndicator={false}>
          {/* Dashboard Description */}
          <View className="mb-7">
            <Text className="text-sm tracking-[1px]" style={{ color: colors.textMuted, fontFamily: fonts.brandRegular }}>
              Welcome back Logan !
            </Text>
          </View>

          {/* Transparent Glassmorphic Container Box */}
          <View 
            className="rounded-3xl border p-6 flex-row flex-wrap gap-6 shadow-lg"
            style={{ 
              backgroundColor: colors.surface, 
              borderColor: colors.border,
              shadowColor: '#000000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.1,
              shadowRadius: 20
            }}
          >
            {MODULES.map((module) => (
              <TouchableOpacity
                key={module.id}
                className="items-center justify-center w-[72px] gap-2"
                onPress={() => router.push(module.route)}
                activeOpacity={0.75}
              >
                <View 
                  className="w-[68px] h-[68px] rounded-[18px] border items-center justify-center shadow-sm"
                  style={{ 
                    backgroundColor: colors.surfaceHigh, 
                    borderColor: colors.border,
                    shadowColor: colors.accent,
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.05,
                    shadowRadius: 4
                  }}
                >
                  <Image source={module.icon} className="w-[34px] h-[34px] resize-contain" />
                </View>
                <Text 
                  className="text-xs font-semibold tracking-[1px] text-center"
                  style={{ fontFamily: fonts.brandRegular, color: colors.text }}
                >
                  {module.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
