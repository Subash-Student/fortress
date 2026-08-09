import React from 'react';
import { View, Text, Image } from 'react-native';
import { useThemeStore } from '../store/themeStore';

interface EmptyStateProps {
  title: string;
  description: string;
  iconUri?: string;
}

const DEFAULT_EMPTY_ICON = 'https://cdn-icons-png.flaticon.com/512/7486/7486744.png';

export default function EmptyState({ title, description, iconUri = DEFAULT_EMPTY_ICON }: EmptyStateProps) {
  const { colors, fonts } = useThemeStore();

  return (
    <View className="items-center justify-center py-10 px-5">
      <Image source={{ uri: iconUri }} className="w-20 h-20 resize-contain opacity-15 mb-5" />
      <Text 
        className="text-lg font-bold tracking-wide mb-2.5 text-center"
        style={{ fontFamily: fonts.brandBold, color: colors.text }}
      >
        {title}
      </Text>
      <Text 
        className="text-[13px] text-center leading-[18px]"
        style={{ color: colors.textMuted }}
      >
        {description}
      </Text>
    </View>
  );
}
