import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../store/themeStore';

interface HeaderBarProps {
  title: string;
  logoUri?: string;
  showBackButton?: boolean;
}

export default function HeaderBar({ title, logoUri, showBackButton = true }: HeaderBarProps) {
  const { colors, fonts, themeMode, toggleTheme } = useThemeStore();

  return (
    <View className="flex-row items-center justify-between py-4 border-b" style={{ borderColor: colors.border }}>
      {showBackButton ? (
        <TouchableOpacity 
          className="w-9 h-9 rounded-lg border items-center justify-center" 
          style={{ backgroundColor: colors.surface, borderColor: colors.border }}
          onPress={() => router.back()} 
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
      ) : (
        <View className="w-9" />
      )}

      <View className="flex-row items-center gap-2.5">
        {logoUri && <Image source={{ uri: logoUri }} className="w-6 h-6 resize-contain" />}
        <Text 
          className="text-lg font-bold tracking-[1.5px]" 
          style={{ fontFamily: fonts.brandBold, color: colors.text }}
        >
          {title}
        </Text>
      </View>

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
  );
}
