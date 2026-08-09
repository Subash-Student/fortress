import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, Image, TextInput, ActivityIndicator, Alert, Modal, KeyboardAvoidingView, Platform, Keyboard, TouchableWithoutFeedback, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useThemeStore } from '../src/store/themeStore';
import { useAuthStore } from '../src/store/authStore';
import { encrypt, decrypt } from '../src/crypto/encryption';
import * as LocalAuthentication from 'expo-local-authentication';
import HeaderBar from '../src/components/HeaderBar';
import EmptyState from '../src/components/EmptyState';
import { linksApi } from '../src/api/client';

const LINKS_LOGO = 'https://cdn-icons-png.flaticon.com/512/9872/9872434.png';
const YOUTUBE_PLACEHOLDER = 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?q=80&w=2874&auto=format&fit=crop';

interface LinkItem {
  _id: string;
  url: string;
  title: string;
  thumbnail: string;
  isFavorite: boolean;
  isHidden: boolean;
  createdAt: string;
}

export default function LinksScreen() {
  const { colors } = useThemeStore();
  const { vaultKey } = useAuthStore();
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filter & Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterFavorites, setFilterFavorites] = useState(false);

  // Hidden State Access
  const [showHidden, setShowHidden] = useState(false);
  const [isPromptingBiometrics, setIsPromptingBiometrics] = useState(false);

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<{title: string, thumbnail: string} | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingLink, setEditingLink] = useState<LinkItem | null>(null);

  const fetchLinks = async () => {
    try {
      const res = await linksApi.getLinks();
      
      const decryptedLinks = res.data.map((item: any) => {
        if (!vaultKey) return item;
        try {
          return {
            ...item,
            url: item.url?.ciphertext ? decrypt(item.url.ciphertext, item.url.iv, vaultKey) : item.url,
            title: item.title?.ciphertext ? decrypt(item.title.ciphertext, item.title.iv, vaultKey) : item.title,
            thumbnail: item.thumbnail?.ciphertext ? decrypt(item.thumbnail.ciphertext, item.thumbnail.iv, vaultKey) : item.thumbnail,
          };
        } catch (e) {
          console.error("Failed to decrypt link", item._id);
          return item;
        }
      });

      setLinks(decryptedLinks);
    } catch (error) {
      console.error('Failed to load links', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLinks();
  }, []);

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
    setModalVisible(true);
  };

  const handleOpenEditModal = (item: LinkItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingLink(item);
    setNewUrl(item.url);
    setCustomTitle(item.title);
    setPreviewData({ title: item.title, thumbnail: item.thumbnail });
    setIsFavorite(item.isFavorite);
    setIsHidden(item.isHidden);
    setModalVisible(true);
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setEditingLink(null);
    setNewUrl('');
    setCustomTitle('');
    setPreviewData(null);
    setIsHidden(false);
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

    setIsSaving(true);
    try {
      const encryptedUrl = encrypt(newUrl, vaultKey);
      const encryptedTitle = encrypt(customTitle, vaultKey);
      const encryptedThumbnail = encrypt(previewData?.thumbnail || '', vaultKey);

      if (editingLink) {
        // Update existing link
        await linksApi.updateLink(editingLink._id, {
          url: encryptedUrl,
          title: encryptedTitle,
          thumbnail: encryptedThumbnail,
          isFavorite,
          isHidden,
        });
      } else {
        // Create new link
        await linksApi.saveLink({
          url: encryptedUrl,
          title: encryptedTitle,
          thumbnail: encryptedThumbnail,
          isFavorite,
          isHidden,
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      handleCloseModal();
      fetchLinks();
    } catch (err) {
      Alert.alert('Error', editingLink ? 'Failed to update link' : 'Failed to save link');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleFavoriteItem = async (id: string, currentStatus: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Optimistic update
    setLinks(links.map(l => l._id === id ? { ...l, isFavorite: !currentStatus } : l));
    
    try {
      await linksApi.toggleFavorite(id, !currentStatus);
    } catch (err) {
      // Revert if failed
      setLinks(links.map(l => l._id === id ? { ...l, isFavorite: currentStatus } : l));
      Alert.alert('Error', 'Could not update favorite status');
    }
  };

  const toggleHideItem = async (id: string, currentStatus: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Optimistic update
    setLinks(links.map(l => l._id === id ? { ...l, isHidden: !currentStatus } : l));
    
    try {
      await linksApi.toggleHide(id, !currentStatus);
    } catch (err) {
      // Revert
      setLinks(links.map(l => l._id === id ? { ...l, isHidden: currentStatus } : l));
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
            await linksApi.deleteLink(id);
            setLinks(links.filter(l => l._id !== id));
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (err) {
            Alert.alert('Error', 'Failed to delete');
          }
        }
      }
    ]);
  };

  const triggerHiddenModeAuth = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        Alert.alert(
          'Private Vault',
          'Biometrics not configured on this device. Authenticate directly?',
          [
            { text: 'Cancel', onPress: () => setIsPromptingBiometrics(false), style: 'cancel' },
            { 
              text: 'Unlock', 
              onPress: () => {
                setShowHidden(true);
                setIsPromptingBiometrics(false);
              } 
            }
          ]
        );
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to view hidden links',
        fallbackLabel: 'Use Passcode',
        cancelLabel: 'Cancel',
      });

      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowHidden(true);
      }
    } catch (err) {
      console.error('Biometric auth failed', err);
    } finally {
      setTimeout(() => {
        setIsPromptingBiometrics(false);
      }, 1500);
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
            resizeMode="cover"
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
    const matchesSearch = link.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          link.url.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFav = filterFavorites ? link.isFavorite : true;
    const matchesHidden = showHidden ? link.isHidden === true : link.isHidden !== true;
    return matchesSearch && matchesFav && matchesHidden;
  });

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }}>
      <View className="flex-1 px-4">
        <HeaderBar title="Links" logoUri={LINKS_LOGO} />

        {/* Search and Favorite Filter Bar */}
        <View className="flex-row items-center my-4">
          <View 
            className="flex-1 flex-row items-center h-12 px-3 rounded-xl border mr-3" 
            style={{ backgroundColor: colors.surface, borderColor: colors.border }}
          >
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              className="flex-1 ml-2 text-sm h-full"
              style={{ color: colors.text }}
              placeholder="Search by title or URL..."
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
          
          <TouchableOpacity
            className="w-12 h-12 rounded-xl border justify-center items-center"
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
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center" style={{ minHeight: 400 }}>
                <EmptyState
                  title={links.length === 0 ? "No saved links" : "No matches found"}
                  description={
                    links.length === 0
                      ? "Pull down to reveal private links, or tap + to add one."
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
      <Modal visible={modalVisible} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
              <View 
                className="rounded-t-3xl p-6 shadow-xl" 
                style={{ backgroundColor: colors.surface }}
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
                      <Image source={{ uri: previewData.thumbnail }} className="w-full h-48" resizeMode="cover" />
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
                  className="w-full py-4 rounded-2xl items-center justify-center flex-row"
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
                <View className="h-6" /> 
              </View>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}
