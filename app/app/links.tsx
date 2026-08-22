import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, Image, TextInput, ActivityIndicator, Alert, Modal, KeyboardAvoidingView, Platform, Keyboard, TouchableWithoutFeedback, Linking, RefreshControl, ScrollView, LayoutAnimation, UIManager } from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { useFocusEffect } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useThemeStore } from '../src/store/themeStore';
import { useAuthStore } from '../src/store/authStore';
import { encrypt } from '../src/crypto/encryption';
import * as LocalAuthentication from 'expo-local-authentication';
import HeaderBar from '../src/components/HeaderBar';
import EmptyState from '../src/components/EmptyState';
import { linksApi, authApi } from '../src/api/client';
import { useLinksQuery, useLinkTagsQuery, useLinksMutations, LinkItem } from '../src/hooks/useLinks';

const LINKS_LOGO = require('../assets/module_logos/links.png');
const YOUTUBE_PLACEHOLDER = 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?q=80&w=2874&auto=format&fit=crop';

export default function LinksScreen() {
  const { colors } = useThemeStore();
  const { vaultKey } = useAuthStore();
  const insets = useSafeAreaInsets();

  // Hidden State Access - Defaults to locked (false)
  const [showHidden, setShowHidden] = useState(false);
  const [isPromptingBiometrics, setIsPromptingBiometrics] = useState(false);

  // Auto-lock private hidden vault whenever user navigates away or presses Back
  useFocusEffect(
    useCallback(() => {
      return () => {
        setShowHidden(false);
      };
    }, [])
  );

  // TanStack Query for instant cached links & tags
  const { data: links = [], isLoading, isRefetching, refetch: refetchLinks } = useLinksQuery(showHidden);
  const { data: availableTags = [], refetch: refetchTags } = useLinkTagsQuery();
  const {
    saveLink: saveLinkMutation,
    updateLink: updateLinkMutation,
    toggleFavorite: toggleFavoriteMutation,
    toggleHide: toggleHideMutation,
    deleteLink: deleteLinkMutation,
    isSaving,
  } = useLinksMutations();

  // Filter & Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterFavorites, setFilterFavorites] = useState(false);

  // Tag Filter & Management State
  const [selectedFilterTags, setSelectedFilterTags] = useState<string[]>([]);
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);

  // Link Modal Tags State
  const [selectedModalTags, setSelectedModalTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  // 4-Digit Security PIN State
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pinMode, setPinMode] = useState<'create' | 'verify'>('verify');
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [isSubmittingPin, setIsSubmittingPin] = useState(false);

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<{title: string, thumbnail: string} | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [editingLink, setEditingLink] = useState<LinkItem | null>(null);

  // Keyboard height tracking for Android with smooth LayoutAnimation
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setKeyboardHeight(e.endCoordinates.height);
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setKeyboardHeight(0);
      }
    );
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const handleRefresh = async () => {
    await Promise.all([refetchLinks(), refetchTags()]);
  };

  // Debounce for URL preview
  useEffect(() => {
    if (!newUrl.startsWith('http')) {
      setPreviewData(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsPreviewLoading(true);
      try {
        const res = await linksApi.previewLink(newUrl);
        setPreviewData(res.data);
        if (res.data.title) {
          setCustomTitle(res.data.title);
        }
      } catch (err) {
        console.log('Preview failed', err);
        setPreviewData({ title: 'Unknown Link', thumbnail: '' });
        setCustomTitle('Unknown Link');
      } finally {
        setIsPreviewLoading(false);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [newUrl]);

  const handleOpenModal = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingLink(null);
    setNewUrl('');
    setCustomTitle('');
    setPreviewData(null);
    setIsFavorite(false);
    setIsHidden(false);
    setSelectedModalTags([]);
    setTagInput('');
    setModalVisible(true);
    refetchTags();
  };

  const handleOpenEditModal = (item: LinkItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingLink(item);
    setNewUrl(item.url);
    setCustomTitle(item.title);
    setPreviewData({ title: item.title, thumbnail: item.thumbnail });
    setIsFavorite(item.isFavorite);
    setIsHidden(item.isHidden);
    setSelectedModalTags(item.tags || []);
    setTagInput('');
    setModalVisible(true);
    refetchTags();
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setEditingLink(null);
    setNewUrl('');
    setCustomTitle('');
    setPreviewData(null);
    setIsHidden(false);
    setSelectedModalTags([]);
    setTagInput('');
  };

  const handleAddTag = (tagToAdd: string) => {
    const trimmed = tagToAdd.trim().replace(/^#/, '');
    if (trimmed && !selectedModalTags.includes(trimmed)) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const updated = [...selectedModalTags, trimmed];
      setSelectedModalTags(updated);
    }
    setTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedModalTags(selectedModalTags.filter(t => t !== tagToRemove));
  };

  const handleSave = async () => {
    if (!newUrl || !customTitle) {
      Alert.alert('Missing info', 'Please enter a valid URL and title.');
      return;
    }
    if (!vaultKey) {
      Alert.alert('Security Error', 'Encryption key not found. Please re-authenticate.');
      return;
    }

    try {
      const encryptedUrl = encrypt(newUrl, vaultKey);
      const encryptedTitle = encrypt(customTitle, vaultKey);
      const encryptedThumbnail = encrypt(previewData?.thumbnail || '', vaultKey);

      if (editingLink) {
        // Update existing link
        await updateLinkMutation({
          id: editingLink._id,
          data: {
            url: encryptedUrl,
            title: encryptedTitle,
            thumbnail: encryptedThumbnail,
            tags: selectedModalTags,
            isFavorite,
            isHidden,
          },
        });
      } else {
        // Create new link
        await saveLinkMutation({
          url: encryptedUrl,
          title: encryptedTitle,
          thumbnail: encryptedThumbnail,
          tags: selectedModalTags,
          isFavorite,
          isHidden,
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      handleCloseModal();
    } catch (err) {
      Alert.alert('Error', editingLink ? 'Failed to update link' : 'Failed to save link');
    }
  };

  const toggleFavoriteItem = async (id: string, currentStatus: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await toggleFavoriteMutation({ id, isFavorite: !currentStatus });
    } catch (err) {
      Alert.alert('Error', 'Could not update favorite status');
    }
  };

  const toggleHideItem = async (id: string, currentStatus: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await toggleHideMutation({ id, isHidden: !currentStatus });
    } catch (err) {
      Alert.alert('Error', 'Could not update hidden status');
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete Link', 'Are you sure you want to delete this link?', [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Delete', 
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteLinkMutation(id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (err) {
            Alert.alert('Error', 'Failed to delete');
          }
        }
      }
    ]);
  };

  const triggerHiddenModeAuth = async () => {
    setEnteredPin('');
    setPinError('');
    try {
      const res = await authApi.getPinStatus();
      setPinMode(res.data?.hasPin ? 'verify' : 'create');
    } catch (_) {
      setPinMode('create');
    }
    setPinModalVisible(true);
  };

  const handleKeyPress = (num: string) => {
    if (enteredPin.length < 4) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const nextPin = enteredPin + num;
      setEnteredPin(nextPin);
      setPinError('');
      if (nextPin.length === 4) {
        submitPin(nextPin);
      }
    }
  };

  const handleBackspace = () => {
    if (enteredPin.length > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setEnteredPin(enteredPin.slice(0, -1));
      setPinError('');
    }
  };

  const submitPin = async (pinValue: string) => {
    setIsSubmittingPin(true);
    try {
      if (pinMode === 'create') {
        await authApi.setPin(pinValue);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setPinModalVisible(false);
        setShowHidden(true);
      } else {
        const res = await authApi.verifyPin(pinValue);
        if (res.data?.valid) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setPinModalVisible(false);
          setShowHidden(true);
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setPinError(res.data?.error || 'Incorrect PIN');
          setEnteredPin('');
        }
      }
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setPinError(err.response?.data?.error || 'Incorrect PIN. Try again.');
      setEnteredPin('');
    } finally {
      setIsSubmittingPin(false);
    }
  };

  const handleScroll = (event: any) => {
    const yOffset = event.nativeEvent.contentOffset.y;
    // Over-drag threshold of -120px to trigger biometrics
    if (yOffset < -120 && !showHidden && !isPromptingBiometrics) {
      setIsPromptingBiometrics(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      triggerHiddenModeAuth();
    }
  };

  const renderItem = ({ item }: { item: LinkItem }) => {
    let domain = 'link';
    try {
      domain = new URL(item.url).hostname.replace('www.', '');
    } catch (_) {}

    const formattedDate = new Date(item.createdAt).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });

    return (
      <View className="mb-6" style={{ backgroundColor: colors.bg }}>
        <TouchableOpacity 
          activeOpacity={0.8}
          onPress={() => Linking.openURL(item.url)}
        >
          <Image 
            source={{ uri: item.thumbnail || YOUTUBE_PLACEHOLDER }}
            className="w-full h-56 rounded-xl"
            resizeMode="contain"
            style={{ backgroundColor: colors.surfaceHigh }}
          />
          <View className="flex-row justify-between items-start mt-3 px-2">
            <View className="flex-1 mr-3">
              <Text 
                className="text-base font-medium" 
                style={{ color: colors.text }}
                numberOfLines={2}
              >
                {item.title}
              </Text>
              <Text 
                className="text-xs mt-1 font-medium" 
                style={{ color: colors.textMuted }}
                numberOfLines={1}
              >
                {domain} • {formattedDate}
              </Text>

              {/* Link Tags Horizontal Scroll */}
              {item.tags && item.tags.length > 0 && (
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false} 
                  className="mt-2" 
                  contentContainerStyle={{ gap: 6 }}
                >
                  {item.tags.map((tag, idx) => (
                    <View 
                      key={idx} 
                      className="px-2.5 py-0.5 rounded-full border flex-row items-center" 
                      style={{ backgroundColor: colors.surfaceHigh, borderColor: colors.border }}
                    >
                      <Text className="text-xs font-semibold" style={{ color: colors.accent }}>
                        #{tag}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
            
            <View className="flex-row items-center space-x-2">
              {showHidden && (
                <TouchableOpacity
                  onPress={() => toggleHideItem(item._id, item.isHidden)}
                  className="p-2"
                >
                  <Ionicons
                    name={item.isHidden ? "eye-off-outline" : "eye-outline"}
                    size={22}
                    color={colors.textMuted}
                  />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => toggleFavoriteItem(item._id, item.isFavorite)}
                className="p-2"
              >
                <Ionicons
                  name={item.isFavorite ? "heart" : "heart-outline"}
                  size={22}
                  color={item.isFavorite ? colors.danger : colors.textMuted}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleOpenEditModal(item)}
                className="p-2"
              >
                <Ionicons name="pencil-outline" size={20} color={colors.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleDelete(item._id)}
                className="p-2"
              >
                <Ionicons name="trash-outline" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  const filteredLinks = links.filter((link) => {
    // STRICT ZERO-LEAK SECURITY FILTER:
    // If showHidden is false, absolutely NO hidden links can ever be shown.
    // If showHidden is true, only hidden links are shown.
    const matchesHidden = showHidden ? link.isHidden === true : !link.isHidden;
    if (!matchesHidden) return false;

    const matchesSearch = link.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          link.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (link.tags && link.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase())));
    const matchesFav = filterFavorites ? link.isFavorite : true;
    const matchesTags = selectedFilterTags.length === 0 || 
                        (link.tags && link.tags.some(t => selectedFilterTags.includes(t)));

    return matchesSearch && matchesFav && matchesTags;
  });

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }}>
      <View className="flex-1 px-4">
        <HeaderBar title="Links" logoUri={LINKS_LOGO} onTitleLongPress={triggerHiddenModeAuth} />

        {/* Search and Favorite / Tag Filter Bar */}
        <View className="flex-row items-center my-4">
          <View 
            className="flex-1 flex-row items-center h-12 px-3 rounded-xl border mr-2" 
            style={{ backgroundColor: colors.surface, borderColor: colors.border }}
          >
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              className="flex-1 ml-2 text-sm h-full"
              style={{ color: colors.text }}
              placeholder="Search title, URL, or #tag..."
              placeholderTextColor={colors.textDim}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} className="p-1">
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
          
          {/* Favorite Filter Toggle */}
          <TouchableOpacity
            className="w-12 h-12 rounded-xl border justify-center items-center mr-2"
            style={{
              backgroundColor: filterFavorites ? colors.accentDim : colors.surface,
              borderColor: filterFavorites ? colors.accent : colors.border
            }}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setFilterFavorites(!filterFavorites);
            }}
            activeOpacity={0.7}
          >
            <Ionicons
              name={filterFavorites ? "heart" : "heart-outline"}
              size={20}
              color={filterFavorites ? colors.accent : colors.textMuted}
            />
          </TouchableOpacity>

          {/* Tag Filter Button */}
          <TouchableOpacity
            className="w-12 h-12 rounded-xl border justify-center items-center relative"
            style={{
              backgroundColor: selectedFilterTags.length > 0 ? colors.accentDim : colors.surface,
              borderColor: selectedFilterTags.length > 0 ? colors.accent : colors.border
            }}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setIsFilterModalVisible(true);
            }}
            activeOpacity={0.7}
          >
            <Ionicons
              name="options-outline"
              size={20}
              color={selectedFilterTags.length > 0 ? colors.accent : colors.textMuted}
            />
            {selectedFilterTags.length > 0 && (
              <View 
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full items-center justify-center"
                style={{ backgroundColor: colors.accent }}
              >
                <Text className="text-[10px] font-bold text-white">
                  {selectedFilterTags.length}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Private Mode Banner */}
        {showHidden && (
          <View
            className="flex-row justify-between items-center px-4 py-3 rounded-xl mb-4"
            style={{
              backgroundColor: colors.accentDim,
              borderWidth: 1,
              borderColor: colors.accent,
            }}
          >
            <View className="flex-row items-center" style={{ gap: 8 }}>
              <Ionicons name="lock-open-outline" size={16} color={colors.accent} />
              <Text className="text-sm font-semibold" style={{ color: colors.accent }}>
                Private Vault Active
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowHidden(false);
              }}
              className="px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: colors.accent }}
            >
              <Text className="text-xs font-semibold" style={{ color: '#FFFFFF' }}>Exit</Text>
            </TouchableOpacity>
          </View>
        )}

        {isLoading ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : (
          <FlatList
            data={filteredLinks}
            keyExtractor={(item) => item._id}
            renderItem={renderItem}
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 100, paddingTop: 10 }}
            showsVerticalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            bounces={true}
            alwaysBounceVertical={true}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={handleRefresh}
                tintColor={colors.accent}
                colors={[colors.accent]}
              />
            }
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center" style={{ minHeight: 400 }}>
                <EmptyState
                  title={links.length === 0 ? "No saved links" : "No matches found"}
                  description={
                    links.length === 0
                      ? "Long-press the header logo to access private links, or tap + to add one."
                      : "Try adjusting your search query or filters."
                  }
                />
              </View>
            }
          />
        )}

        {/* FAB */}
        <TouchableOpacity
          className="absolute right-5 bottom-[30px] w-14 h-14 rounded-full items-center justify-center"
          style={{
            backgroundColor: colors.accent,
            shadowColor: colors.accent,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.4,
            shadowRadius: 12,
            elevation: 8,
          }}
          onPress={handleOpenModal}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={32} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Add Link Modal */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={handleCloseModal}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
          className="flex-1"
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={Keyboard.dismiss}
            className="flex-1 justify-end"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          >
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View 
                className="rounded-t-3xl p-6 shadow-xl" 
                style={[
                  { 
                    maxHeight: '94%',
                    backgroundColor: colors.surface,
                    paddingBottom: Math.max(insets.bottom + 16, 24)
                  },
                  Platform.OS === 'android' && keyboardHeight > 0 && { maxHeight: '100%' }
                ]}
              >
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                  contentContainerStyle={{ paddingBottom: Platform.OS === 'android' && keyboardHeight > 0 ? keyboardHeight : 40 }}
                >
                  <View className="flex-row justify-between items-center mb-6">
                    <Text className="text-xl font-semibold" style={{ color: colors.text }}>
                      {editingLink ? 'Edit Link' : 'Add New Link'}
                    </Text>
                    <TouchableOpacity onPress={handleCloseModal}>
                      <Ionicons name="close" size={24} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>

                  {/* URL Input */}
                  <View 
                    className="px-4 py-3 rounded-xl border mb-4 flex-row items-center"
                    style={{ backgroundColor: colors.bg, borderColor: colors.border }}
                  >
                    <Ionicons name="link-outline" size={20} color={colors.textMuted} className="mr-3" />
                    <TextInput
                      className="flex-1 text-base ml-2"
                      style={{ color: colors.text }}
                      placeholder="Paste link here..."
                      placeholderTextColor={colors.textDim}
                      value={newUrl}
                      onChangeText={setNewUrl}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                    />
                  </View>

                  {/* Preview Section - Shows Thumbnail Only */}
                  {isPreviewLoading && (
                    <View className="py-6 items-center">
                      <ActivityIndicator color={colors.accent} />
                      <Text className="mt-2 text-sm" style={{ color: colors.textMuted }}>Fetching preview...</Text>
                    </View>
                  )}

                  {!isPreviewLoading && previewData && (
                    <View className="mb-4 rounded-xl overflow-hidden relative" style={{ backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border }}>
                      {previewData?.thumbnail ? (
                        <Image source={{ uri: previewData.thumbnail }} className="w-full h-48" resizeMode="contain" style={{ backgroundColor: colors.surfaceHigh }} />
                      ) : (
                        <View className="w-full h-48 items-center justify-center" style={{ backgroundColor: colors.surfaceHigh }}>
                          <Ionicons name="image-outline" size={32} color={colors.textDim} />
                        </View>
                      )}
                      {/* Eye toggle button absolute overlay */}
                      <TouchableOpacity
                        className="absolute top-3 left-3 w-10 h-10 rounded-full justify-center items-center"
                        style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setIsHidden(!isHidden);
                        }}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={isHidden ? "eye-off" : "eye"}
                          size={20}
                          color={isHidden ? colors.danger : "#FFF"}
                        />
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Separate Input for Title */}
                  {previewData && (
                    <View className="mb-4">
                      <Text className="text-sm font-semibold mb-1 ml-1" style={{ color: colors.textMuted }}>
                        Title
                      </Text>
                      <View 
                        className="px-4 py-3 rounded-xl border flex-row items-center"
                        style={{ backgroundColor: colors.bg, borderColor: colors.border }}
                      >
                        <TextInput
                          className="flex-1 text-base"
                          style={{ color: colors.text }}
                          placeholder="Enter link title..."
                          placeholderTextColor={colors.textDim}
                          value={customTitle}
                          onChangeText={setCustomTitle}
                        />
                      </View>
                    </View>
                  )}

                  {/* Tags Input Section */}
                  <View className="mb-4">
                    <Text className="text-sm font-semibold mb-1 ml-1" style={{ color: colors.textMuted }}>
                      Tags
                    </Text>
                    
                    {/* Selected Tags Chips */}
                    {selectedModalTags.length > 0 && (
                      <View className="flex-row flex-wrap mb-2" style={{ gap: 6 }}>
                        {selectedModalTags.map((tag) => (
                          <View 
                            key={tag} 
                            className="px-3 py-1.5 rounded-full flex-row items-center" 
                            style={{ backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accent }}
                          >
                            <Text className="text-xs font-semibold mr-1" style={{ color: colors.accent }}>
                              #{tag}
                            </Text>
                            <TouchableOpacity onPress={() => handleRemoveTag(tag)} className="p-0.5">
                              <Ionicons name="close-circle" size={14} color={colors.accent} />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Tag Input Field */}
                    <View 
                      className="px-4 py-2.5 rounded-xl border flex-row items-center"
                      style={{ backgroundColor: colors.bg, borderColor: colors.border }}
                    >
                      <Ionicons name="pricetag-outline" size={18} color={colors.textMuted} className="mr-2" />
                      <TextInput
                        className="flex-1 text-base ml-2"
                        style={{ color: colors.text }}
                        placeholder="Type tag (e.g. Design, Tech)..."
                        placeholderTextColor={colors.textDim}
                        value={tagInput}
                        onChangeText={setTagInput}
                        onSubmitEditing={() => handleAddTag(tagInput)}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      {tagInput.trim().length > 0 && (
                        <TouchableOpacity 
                          className="px-3 py-1.5 rounded-lg"
                          style={{ backgroundColor: colors.accent }}
                          onPress={() => handleAddTag(tagInput)}
                        >
                          <Text className="text-xs font-bold text-white">+ Add</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Saved Tags Dropdown Suggestions (Only shows tags not yet selected) */}
                    {availableTags.filter(tag => !selectedModalTags.includes(tag)).length > 0 && (
                      <View className="mt-2">
                        <Text className="text-[11px] font-medium mb-1.5" style={{ color: colors.textMuted }}>
                          Saved Tags (Tap to add):
                        </Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                          {availableTags
                            .filter(tag => !selectedModalTags.includes(tag))
                            .map((tag) => (
                              <TouchableOpacity
                                key={tag}
                                className="px-3 py-1 rounded-full border flex-row items-center"
                                style={{
                                  backgroundColor: colors.surface,
                                  borderColor: colors.border,
                                }}
                                onPress={() => handleAddTag(tag)}
                                activeOpacity={0.7}
                              >
                                <Text className="text-xs font-medium" style={{ color: colors.textMuted }}>
                                  #{tag} +
                                </Text>
                              </TouchableOpacity>
                            ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>

                  {/* Favorite Toggle */}
                  <TouchableOpacity 
                    className="flex-row justify-between items-center mb-8 px-2 py-2"
                    onPress={() => setIsFavorite(!isFavorite)}
                  >
                    <Text className="text-base" style={{ color: colors.text }}>Mark as Favorite</Text>
                    <Ionicons 
                      name={isFavorite ? "heart" : "heart-outline"} 
                      size={28} 
                      color={isFavorite ? colors.danger : colors.textMuted} 
                    />
                  </TouchableOpacity>

                  {/* Save Button */}
                  <TouchableOpacity
                    className="w-full py-4 rounded-2xl items-center justify-center flex-row mb-4"
                    style={{ backgroundColor: (newUrl && customTitle) ? colors.accent : colors.surfaceHigh }}
                    onPress={handleSave}
                    disabled={!newUrl || !customTitle || isSaving}
                  >
                    {isSaving ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons name="checkmark" size={20} color={(newUrl && customTitle) ? '#FFFFFF' : colors.textMuted} style={{ marginRight: 6 }} />
                        <Text className="text-base font-semibold" style={{ color: (newUrl && customTitle) ? '#FFFFFF' : colors.textMuted }}>
                          {editingLink ? 'Update Link' : 'Save Link'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
      {/* 4-Digit Security PIN Modal */}
      <Modal
        visible={pinModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPinModalVisible(false)}
      >
        <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <View
            className="rounded-t-3xl p-6 items-center"
            style={{
              backgroundColor: colors.surface,
              paddingBottom: Math.max(insets.bottom + 16, 24),
            }}
          >
            {/* Top Handle / Close */}
            <View className="w-full flex-row justify-between items-center mb-4">
              <View className="w-8" />
              <View
                className="w-10 h-1.5 rounded-full"
                style={{ backgroundColor: colors.border }}
              />
              <TouchableOpacity onPress={() => setPinModalVisible(false)} className="p-1">
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Lock Icon */}
            <View
              className="w-16 h-16 rounded-full items-center justify-center mb-3 shadow-md"
              style={{ backgroundColor: colors.accentDim }}
            >
              <Ionicons
                name={pinMode === 'create' ? 'key-outline' : 'lock-closed-outline'}
                size={32}
                color={colors.accent}
              />
            </View>

            {/* Title & Description */}
            <Text className="text-xl font-bold mb-1" style={{ color: colors.text }}>
              {pinMode === 'create' ? 'Set Security PIN' : 'Private Vault PIN'}
            </Text>
            <Text className="text-sm text-center mb-6 px-4" style={{ color: colors.textMuted }}>
              {pinMode === 'create'
                ? 'Choose a 4-digit PIN to secure your private hidden links.'
                : 'Enter your 4-digit security PIN to unlock private links.'}
            </Text>

            {/* 4 PIN Dots */}
            <View className="flex-row items-center justify-center mb-6" style={{ gap: 16 }}>
              {[0, 1, 2, 3].map((idx) => {
                const isFilled = enteredPin.length > idx;
                return (
                  <View
                    key={idx}
                    className="w-5 h-5 rounded-full items-center justify-center"
                    style={{
                      backgroundColor: isFilled ? colors.accent : 'transparent',
                      borderWidth: isFilled ? 0 : 2,
                      borderColor: isFilled ? colors.accent : colors.textMuted,
                    }}
                  />
                );
              })}
            </View>

            {/* Error Message */}
            {!!pinError && (
              <Text className="text-sm font-semibold mb-4 text-center" style={{ color: colors.danger }}>
                {pinError}
              </Text>
            )}

            {/* Loader */}
            {isSubmittingPin ? (
              <ActivityIndicator color={colors.accent} size="large" className="my-6" />
            ) : (
              /* Keypad Grid (1-9, 0, Backspace) */
              <View className="w-full px-6">
                {[
                  ['1', '2', '3'],
                  ['4', '5', '6'],
                  ['7', '8', '9'],
                  ['', '0', 'backspace'],
                ].map((row, rIdx) => (
                  <View key={rIdx} className="flex-row justify-around mb-4">
                    {row.map((key, kIdx) => {
                      if (key === '') {
                        return <View key={kIdx} className="w-16 h-16" />;
                      }
                      if (key === 'backspace') {
                        return (
                          <TouchableOpacity
                            key={kIdx}
                            className="w-16 h-16 rounded-full items-center justify-center"
                            onPress={handleBackspace}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="backspace-outline" size={24} color={colors.textMuted} />
                          </TouchableOpacity>
                        );
                      }
                      return (
                        <TouchableOpacity
                          key={kIdx}
                          className="w-16 h-16 rounded-full items-center justify-center border"
                          style={{
                            backgroundColor: colors.surfaceHigh,
                            borderColor: colors.border,
                          }}
                          onPress={() => handleKeyPress(key)}
                          activeOpacity={0.7}
                        >
                          <Text className="text-2xl font-bold" style={{ color: colors.text }}>
                            {key}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Tag Filter Bottom Sheet Modal */}
      <Modal
        visible={isFilterModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsFilterModalVisible(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setIsFilterModalVisible(false)}
          className="flex-1 justify-end"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View 
              className="rounded-t-3xl p-6 shadow-xl max-h-[85%]" 
              style={{ 
                backgroundColor: colors.surface,
                paddingBottom: Math.max(insets.bottom + 16, 24)
              }}
            >
              {/* Drag Handle Notch */}
              <View className="w-12 h-1 rounded-full self-center mb-4 opacity-40" style={{ backgroundColor: colors.textMuted }} />

              {/* Header */}
              <View className="flex-row justify-between items-center mb-4 pb-3 border-b" style={{ borderColor: colors.border }}>
                <View className="flex-row items-center" style={{ gap: 8 }}>
                  <Ionicons name="funnel-outline" size={20} color={colors.accent} />
                  <Text className="text-lg font-bold" style={{ color: colors.text }}>
                    Filter by Tags
                  </Text>
                </View>
                <View className="flex-row items-center" style={{ gap: 12 }}>
                  {selectedFilterTags.length > 0 && (
                    <TouchableOpacity 
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedFilterTags([]);
                      }}
                    >
                      <Text className="text-xs font-bold" style={{ color: colors.danger }}>
                        Clear All
                      </Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => setIsFilterModalVisible(false)} className="p-1">
                    <Ionicons name="close" size={22} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Tags Multi-select Grid */}
              <ScrollView showsVerticalScrollIndicator={false} className="py-2 max-h-[350px]">
                {availableTags.length === 0 ? (
                  <View className="py-8 items-center">
                    <Ionicons name="pricetags-outline" size={32} color={colors.textDim} />
                    <Text className="text-sm text-center mt-2" style={{ color: colors.textMuted }}>
                      No saved tags yet. Add tags when creating or editing links!
                    </Text>
                  </View>
                ) : (
                  <View className="flex-row flex-wrap" style={{ gap: 10 }}>
                    {availableTags.map((tag) => {
                      const isSelected = selectedFilterTags.includes(tag);
                      return (
                        <TouchableOpacity
                          key={tag}
                          className="px-4 py-2.5 rounded-full border flex-row items-center"
                          style={{
                            backgroundColor: isSelected ? colors.accent : colors.bg,
                            borderColor: isSelected ? colors.accent : colors.border,
                          }}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            if (isSelected) {
                              setSelectedFilterTags(selectedFilterTags.filter(t => t !== tag));
                            } else {
                              setSelectedFilterTags([...selectedFilterTags, tag]);
                            }
                          }}
                          activeOpacity={0.7}
                        >
                          <Text 
                            className="text-sm font-semibold" 
                            style={{ color: isSelected ? '#FFFFFF' : colors.text }}
                          >
                            #{tag}
                          </Text>
                          {isSelected && (
                            <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </ScrollView>

              {/* Apply Action Button */}
              <TouchableOpacity
                className="w-full py-3.5 rounded-xl items-center justify-center mt-4"
                style={{ backgroundColor: colors.accent }}
                onPress={() => setIsFilterModalVisible(false)}
                activeOpacity={0.85}
              >
                <Text className="text-base font-semibold text-white">
                  Apply Filters ({selectedFilterTags.length})
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}
