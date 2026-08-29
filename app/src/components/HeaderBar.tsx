import React from 'react';
import { View, Text, TouchableOpacity, Image, ImageSourcePropType } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../store/themeStore';

interface HeaderBarProps {
  title: string;
  logoUri?: ImageSourcePropType | string;
  showBackButton?: boolean;
  onTitleLongPress?: () => void;
  rightAction?: React.ReactNode;
}

export default function HeaderBar({ title, logoUri, showBackButton = true, onTitleLongPress, rightAction }: HeaderBarProps) {
  const { colors, fonts, themeMode, toggleTheme } = useThemeStore();

  const renderLogo = () => {
    if (!logoUri) return null;
    const source = typeof logoUri === 'string' ? { uri: logoUri } : logoUri;
    return <Image source={source} className="w-6 h-6 resize-contain" />;
  };

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

      <TouchableOpacity
        activeOpacity={0.85}
        onLongPress={onTitleLongPress}
        delayLongPress={500}
      >
        <View className="flex-row items-center gap-2.5">
          {renderLogo()}
          <Text 
            className="text-lg font-bold tracking-[1.5px]" 
            style={{ fontFamily: fonts.brandBold, color: colors.text }}
          >
            {title}
          </Text>
        </View>
      </TouchableOpacity>

      <View className="flex-row items-center gap-2">
        {rightAction}
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
    </View>
  );
}
