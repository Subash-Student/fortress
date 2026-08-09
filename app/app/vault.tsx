import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  Image,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useThemeStore } from '../src/store/themeStore';
import { useAuthStore } from '../src/store/authStore';
import { encrypt, decrypt } from '../src/crypto/encryption';
import { vaultApi } from '../src/api/client';
import HeaderBar from '../src/components/HeaderBar';
import EmptyState from '../src/components/EmptyState';

const VAULT_LOGO = 'https://cdn-icons-png.flaticon.com/512/1804/1804429.png';

interface CredentialAccount {
  id: string;
  username: string;
  password: string;
  showPassword?: boolean;
}

interface VaultPlatform {
  id: string;
  name: string;
  logo: string;
  accounts: CredentialAccount[];
}

export default function VaultScreen() {
  const { colors, fonts } = useThemeStore();
  const { vaultKey } = useAuthStore();

  // Loading state
  const [loading, setLoading] = useState(true);

  // Vault data lists
  const [platforms, setPlatforms] = useState<VaultPlatform[]>([]);
  const [expandedPlatformId, setExpandedPlatformId] = useState<string | null>(null);

  // Fetch passwords on load
  useEffect(() => {
    loadVaultData();
  }, []);

  const loadVaultData = async () => {
    setLoading(true);
    try {
      const res = await vaultApi.getPlatforms();
      const rawPlatforms = res.data || [];
      
      const decryptedPlatforms = rawPlatforms.map((plat: any) => {
        return {
          id: plat.id || plat._id,
          name: plat.name,
          logo: plat.logo,
          accounts: (plat.accounts || []).map((acc: any) => {
            let username = '';
            let password = '';
            
            try {
              if (vaultKey) {
                username = decrypt(acc.username.ciphertext, acc.username.iv, vaultKey);
                password = decrypt(acc.password.ciphertext, acc.password.iv, vaultKey);
              }
            } catch (err) {
              console.error('Decryption failed for account', acc._id, err);
            }
            
            return {
              id: acc.id || acc._id,
              username,
              password,
              showPassword: false,
            };
          }),
        };
      });

      setPlatforms(decryptedPlatforms);
    } catch (err) {
      console.error('Failed to load vault data:', err);
      Alert.alert('Load Error', 'Failed to retrieve your passwords from the vault.');
    } finally {
      setLoading(false);
    }
  };

  // Search Provider state
  const [searchProvider, setSearchProvider] = useState<'pixabay' | 'pexels'>('pixabay');

  const activeKeyExists = searchProvider === 'pixabay'
    ? !!process.env.EXPO_PUBLIC_PIXABAY_API_KEY
    : !!process.env.EXPO_PUBLIC_PEXELS_API_KEY;

  // Copy success indicator
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modal Visibility
  const [modalVisible, setModalVisible] = useState(false);
  const [viewingPlatform, setViewingPlatform] = useState<VaultPlatform | null>(null);
  const [editingPlatformId, setEditingPlatformId] = useState<string | null>(null);

  // Modal Form Inputs
  const [platformName, setPlatformName] = useState('');
  const [selectedLogo, setSelectedLogo] = useState('');
  const [accounts, setAccounts] = useState<CredentialAccount[]>([
    { id: '1', username: '', password: '', showPassword: false },
  ]);

  // Image Search Suggestions
  const [imageSuggestions, setImageSuggestions] = useState<string[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);

  // Niagara UI States
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const [draggedLetter, setDraggedLetter] = useState<string | null>(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const containerHeight = useRef<number>(0);

  // Debounced image search triggered by platform name or search provider toggle
  useEffect(() => {
    if (!platformName.trim()) {
      setImageSuggestions([]);
      return;
    }
    const delayDebounceFn = setTimeout(() => {
      searchImages(platformName);
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [platformName, searchProvider]);

  const searchImages = async (query: string) => {
    const pixabayKey = process.env.EXPO_PUBLIC_PIXABAY_API_KEY;
    const pexelsKey = process.env.EXPO_PUBLIC_PEXELS_API_KEY;
    const activeKey = searchProvider === 'pixabay' ? pixabayKey : pexelsKey;

    console.log(`[DEBUG] activeKey for ${searchProvider} present:`, !!activeKey);
    if (!activeKey) {
      console.log(`[DEBUG] No API key configured for ${searchProvider}`);
      return;
    }

    setLoadingImages(true);
    try {
      if (searchProvider === 'pixabay') {
        const url = `https://pixabay.com/api/?key=${encodeURIComponent(pixabayKey!)}&q=${encodeURIComponent(query)}&image_type=all&per_page=5`;
        console.log('[DEBUG] Fetching from Pixabay:', url);
        const response = await fetch(url);
        console.log('[DEBUG] Pixabay Response Status:', response.status);
        if (response.ok) {
          const data = await response.json();
          console.log('[DEBUG] Pixabay returned hits count:', data.hits?.length);
          const urls = (data.hits || []).map((hit: any) => hit.previewURL);
          setImageSuggestions(urls);
        } else {
          const text = await response.text();
          console.log('[DEBUG] Pixabay Error response body:', text);
          Alert.alert('Pixabay API Error', 'Pixabay search query failed. Please verify your key.');
        }
      } else {
        const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5`;
        console.log('[DEBUG] Fetching from Pexels:', url);
        const response = await fetch(url, {
          headers: {
            Authorization: pexelsKey!,
          },
        });
        console.log('[DEBUG] Pexels Response Status:', response.status);
        if (response.ok) {
          const data = await response.json();
          console.log('[DEBUG] Pexels returned photos count:', data.photos?.length);
          const urls = (data.photos || []).map((photo: any) => photo.src.small || photo.src.tiny);
          setImageSuggestions(urls);
        } else {
          const text = await response.text();
          console.log('[DEBUG] Pexels Error response body:', text);
          Alert.alert('Pexels API Error', `Pexels request failed with status ${response.status}.`);
        }
      }
    } catch (error) {
      console.log(`[DEBUG] ${searchProvider} search query error:`, error);
    } finally {
      setLoadingImages(false);
    }
  };

  const toggleSearchProvider = () => {
    setSearchProvider(prev => prev === 'pixabay' ? 'pexels' : 'pixabay');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleManualImagePick = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Denied',
        'We need access to your camera roll to let you choose custom platform logos.'
      );
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedLogo(result.assets[0].uri);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err) {
      console.log('Image picking error:', err);
    }
  };

  // Add / Remove accounts inside the Modal
  const handleAddAccountInput = () => {
    setAccounts((prev) => [
      ...prev,
      { id: Date.now().toString(), username: '', password: '', showPassword: false },
    ]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleRemoveAccountInput = (idx: number) => {
    if (accounts.length === 1) return;
    setAccounts((prev) => prev.filter((_, i) => i !== idx));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const pasteModalUsername = async (idx: number) => {
    const text = await Clipboard.getStringAsync();
    if (!text) return;
    setAccounts((prev) =>
      prev.map((acc, i) => (i === idx ? { ...acc, username: text } : acc))
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const pasteModalPassword = async (idx: number) => {
    const text = await Clipboard.getStringAsync();
    if (!text) return;
    setAccounts((prev) =>
      prev.map((acc, i) => (i === idx ? { ...acc, password: text } : acc))
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const resetForm = () => {
    setPlatformName('');
    setSelectedLogo('');
    setImageSuggestions([]);
    setAccounts([{ id: '1', username: '', password: '', showPassword: false }]);
    setEditingPlatformId(null);
  };

  const handleSaveToVault = async () => {
    if (!platformName.trim()) {
      Alert.alert('Missing Field', 'Please enter the Platform name.');
      return;
    }

    const validAccounts = accounts.filter(
      (acc) => acc.username.trim() && acc.password.trim()
    );

    if (validAccounts.length === 0) {
      Alert.alert(
        'Missing Credentials',
        'Please add at least one account with both username and password.'
      );
      return;
    }

    if (!vaultKey) {
      Alert.alert('Security Error', 'Encryption key not found. Please re-authenticate.');
      return;
    }

    const platformAvatar =
      selectedLogo ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(
        platformName
      )}&background=7C3AED&color=fff&size=128&bold=true`;

    // Encrypt accounts client-side before sending
    const encryptedAccounts = validAccounts.map((acc) => {
      const encryptedUser = encrypt(acc.username, vaultKey);
      const encryptedPass = encrypt(acc.password, vaultKey);
      return {
        username: encryptedUser,
        password: encryptedPass,
      };
    });

    try {
      let res;
      if (editingPlatformId) {
        res = await vaultApi.updatePlatform(editingPlatformId, {
          name: platformName.trim(),
          logo: platformAvatar,
          accounts: encryptedAccounts,
        });
      } else {
        res = await vaultApi.savePlatform({
          name: platformName.trim(),
          logo: platformAvatar,
          accounts: encryptedAccounts,
        });
      }

      // Decrypt the newly saved platform from backend response to match our local shape
      const savedPlat = res.data;
      const decryptedPlat: VaultPlatform = {
        id: savedPlat.id || savedPlat._id,
        name: savedPlat.name,
        logo: savedPlat.logo,
        accounts: (savedPlat.accounts || []).map((acc: any, index: number) => ({
          id: acc.id || acc._id,
          username: validAccounts[index].username,
          password: validAccounts[index].password,
          showPassword: false,
        })),
      };

      setPlatforms((prev) => {
        if (editingPlatformId) {
          return prev.map(p => p.id === editingPlatformId ? decryptedPlat : p);
        }
        return [decryptedPlat, ...prev];
      });
      setModalVisible(false);
      resetForm();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.error('Failed to save to backend:', err);
      Alert.alert('Save Error', 'Failed to store your credentials in the backend database.');
    }
  };

  const handleEditPlatform = () => {
    if (!viewingPlatform) return;
    setEditingPlatformId(viewingPlatform.id);
    setPlatformName(viewingPlatform.name);
    setSelectedLogo(viewingPlatform.logo);
    // clone accounts so we don't mutate state directly
    setAccounts(viewingPlatform.accounts.map(acc => ({ ...acc, showPassword: false })));
    setViewingPlatform(null);
    setModalVisible(true);
  };

  // Niagara UI List calculations
  const letters = ['★', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

  const filteredPlatforms = React.useMemo(() => {
    if (!activeLetter) return platforms;
    return platforms.filter(
      (p) => p.name.trim().charAt(0).toUpperCase() === activeLetter
    );
  }, [platforms, activeLetter]);

  const groupedPlatforms = React.useMemo(() => {
    const sorted = [...filteredPlatforms].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    const groups: { [key: string]: VaultPlatform[] } = {};
    sorted.forEach((plat) => {
      const letter = plat.name.trim().charAt(0).toUpperCase();
      if (!groups[letter]) {
        groups[letter] = [];
      }
      groups[letter].push(plat);
    });
    return groups;
  }, [filteredPlatforms]);

  const handleTouch = (locationY: number, height: number) => {
    if (height <= 0 || letters.length === 0) return;
    const percent = Math.max(0, Math.min(1, locationY / height));
    const index = Math.floor(percent * letters.length);
    const letter = letters[Math.min(index, letters.length - 1)];

    if (letter && letter !== draggedLetter) {
      setDraggedLetter(letter);
      setActiveLetter(letter === '★' ? null : letter);
      setShowOverlay(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleTouchEnd = () => {
    setDraggedLetter(null);
    setTimeout(() => {
      setShowOverlay(false);
    }, 600);
  };

  const copyToClipboard = async (text: string, id: string) => {
    await Clipboard.setStringAsync(text);
    setCopiedId(id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const togglePasswordVisibility = (platformId: string, accountId: string) => {
    setPlatforms((prev) =>
      prev.map((plat) => {
        if (plat.id !== platformId) return plat;
        return {
          ...plat,
          accounts: plat.accounts.map((acc) =>
            acc.id === accountId ? { ...acc, showPassword: !acc.showPassword } : acc
          ),
        };
      })
    );
    if (viewingPlatform && viewingPlatform.id === platformId) {
      setViewingPlatform((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          accounts: prev.accounts.map((acc) => 
            acc.id === accountId ? { ...acc, showPassword: !acc.showPassword } : acc
          )
        };
      });
    }
  };

  const toggleModalPasswordVisibility = (idx: number) => {
    setAccounts((prev) =>
      prev.map((acc, i) =>
        i === idx ? { ...acc, showPassword: !acc.showPassword } : acc
      )
    );
  };

  const deletePlatform = (id: string, isFromModal = false) => {
    Alert.alert('Delete Credential', 'Are you sure you want to delete this credential platform?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await vaultApi.deletePlatform(id);
            setPlatforms((prev) => prev.filter((plat) => plat.id !== id));
            if (isFromModal) {
              setViewingPlatform(null);
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          } catch (err) {
            console.error('Failed to delete platform:', err);
            Alert.alert('Delete Error', 'Failed to delete the credential from the backend.');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }}>
      <View className="flex-1 px-5">
        {/* Generic Header Bar */}
        <HeaderBar title="Vault" logoUri={VAULT_LOGO} />

        {/* Credentials Platform list */}
        {loading ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator size="large" color={colors.text} />
          </View>
        ) : platforms.length === 0 ? (
          <View className="flex-1 justify-center">
            <EmptyState
              title="No passwords yet"
              description="Your vault is empty. Tap the + button to add credentials."
            />
          </View>
        ) : (
          <View className="flex-1 flex-row">
            {/* Grouped apps list on the left */}
            <ScrollView
              className="flex-grow flex-shrink pr-4"
              contentContainerClassName="pt-4 pb-[100px]"
              showsVerticalScrollIndicator={false}
            >
              {Object.keys(groupedPlatforms).map((letter) => (
                <View key={letter} className="mb-6">
                  {/* Large letter section header */}
                  <Text
                    className="text-lg font-bold mb-3 pl-3"
                    style={{ color: colors.text, fontFamily: fonts.brandBold }}
                  >
                    {letter}
                  </Text>

                  <View className="gap-3">
                    {groupedPlatforms[letter].map((plat) => {
                      return (
                        <TouchableOpacity
                          key={plat.id}
                          className="flex-row items-center py-2 px-3 rounded-2xl"
                          activeOpacity={0.7}
                          onPress={() => {
                            setViewingPlatform(plat);
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          }}
                        >
                          <Image 
                            source={{ uri: plat.logo }} 
                            className="w-12 h-12 rounded-2xl resize-contain" 
                            style={{ backgroundColor: colors.surfaceHigh }} 
                          />
                          <Text 
                            className="text-[16px] font-medium ml-4" 
                            style={{ color: colors.text }}
                          >
                            {plat.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}
            </ScrollView>

            {/* Right side: Alphabet Index Scrollbar */}
            <View
              className="w-7 items-center justify-center py-2"
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={(e) => {
                const { locationY } = e.nativeEvent;
                if (containerHeight.current > 0) {
                  handleTouch(locationY, containerHeight.current);
                }
              }}
              onResponderMove={(e) => {
                const { locationY } = e.nativeEvent;
                if (containerHeight.current > 0) {
                  handleTouch(locationY, containerHeight.current);
                }
              }}
              onResponderRelease={() => {
                handleTouchEnd();
              }}
              onLayout={(e) => {
                containerHeight.current = e.nativeEvent.layout.height;
              }}
            >
              {letters.map((letter) => {
                const isSelected = (letter === '★' && !activeLetter) || (letter === activeLetter);
                return (
                  <View
                    key={letter}
                    className="w-5 h-5 items-center justify-center rounded-full my-[0.5px]"
                    style={{
                      backgroundColor: isSelected ? colors.text : 'transparent',
                    }}
                  >
                    <Text
                      className="text-[9px] font-bold"
                      style={{
                        color: isSelected ? colors.bg : colors.textMuted,
                        fontFamily: fonts.brandRegular,
                      }}
                    >
                      {letter}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Giant Central Letter Overlay (Niagara Launcher Style) */}
        {showOverlay && draggedLetter && (
          <View 
            className="absolute inset-0 items-center justify-center z-50 pointer-events-none"
            style={{ backgroundColor: 'rgba(0,0,0,0.1)' }}
          >
            <View
            className="w-20 h-20 rounded-full items-center justify-center shadow-xl border border-[rgba(255,255,255,0.08)] animate-fade-in"
            style={{
              backgroundColor: colors.accent,
              shadowColor: colors.accent,
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.3,
              shadowRadius: 15,
            }}
          >
            <Text
              className="text-3xl font-bold"
              style={{ fontFamily: fonts.brandBold, color: '#FFFFFF' }}
            >
              {draggedLetter}
            </Text>
          </View>
          </View>
        )}

        {/* Floating Action Button (FAB) */}
        <TouchableOpacity
          className="absolute right-5 bottom-[30px] w-14 h-14 rounded-full items-center justify-center shadow-lg elevation-8"
          style={{
            backgroundColor: colors.accent,
            shadowColor: colors.accent,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.4,
            shadowRadius: 12
          }}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={32} color="#FFFFFF" />
        </TouchableOpacity>

        {/* Add Credential Modal Sheet */}
        <Modal
          visible={modalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setModalVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1 bg-black/75 justify-end"
          >
            <View 
              className="rounded-t-[32px] pt-4 px-6 pb-8 max-h-[90%] shadow-2xl"
              style={{ backgroundColor: colors.surface }}
            >
              {/* Sheet Drag Indicator Handle */}
              <View 
                className="w-10 h-1.5 rounded-full self-center mb-5" 
                style={{ backgroundColor: colors.border }} 
              />

              <View 
                className="flex-row items-center justify-between pb-4 border-b-[0.5px]"
                style={{ borderColor: colors.border }}
              >
                <Text 
                  className="text-lg font-bold tracking-[1px]"
                  style={{ fontFamily: fonts.brandBold, color: colors.text }}
                >
                  {editingPlatformId ? 'Edit Credential' : 'Add Credential'}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setModalVisible(false);
                    resetForm();
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={24} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              <ScrollView
                className="pt-5"
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* Platform Name Input */}
                <View className="mb-5">
                  <Text className="text-xs font-bold mb-2 tracking-[0.5px]" style={{ color: colors.textMuted }}>Platform Name</Text>
                  <View 
                    className="flex-row items-center border rounded-xl px-4 h-12 shadow-sm"
                    style={{ backgroundColor: colors.surface, borderColor: colors.border }}
                  >
                    <TextInput
                      className="flex-1 text-sm font-medium"
                      style={{ color: colors.text }}
                      placeholder="e.g. Spotify, Google, Netflix"
                      placeholderTextColor={colors.textDim}
                      value={platformName}
                      onChangeText={setPlatformName}
                    />
                  </View>
                </View>

                {/* Dynamic Image Search suggestions */}
                {!activeKeyExists && (
                  <View className="bg-[#FF9F0A]/10 border border-[#FF9F0A]/30 rounded-xl p-3 mb-5">
                    <Text className="text-xs leading-4 font-medium" style={{ color: colors.warning, fontFamily: fonts.brandRegular }}>
                      ⚠️ {searchProvider === 'pixabay' ? 'Pixabay' : 'Pexels'} API Key required. Set EXPO_PUBLIC_{searchProvider.toUpperCase()}_API_KEY in app/.env.
                    </Text>
                  </View>
                )}

                <View className="mb-[20px]">
                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-xs font-bold tracking-[0.5px]" style={{ color: colors.textMuted }}>Logo Suggestions</Text>
                    <TouchableOpacity 
                      onPress={toggleSearchProvider} 
                      className="flex-row items-center gap-1 px-2.5 py-1.5 rounded-lg"
                      style={{ backgroundColor: colors.border }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="refresh-outline" size={16} color={colors.text} />
                    </TouchableOpacity>
                  </View>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerClassName="gap-3.5 pb-2"
                  >
                    {/* Manual Upload Card */}
                    <TouchableOpacity
                      className="w-16 h-16 rounded-2xl border border-dashed overflow-hidden justify-center items-center shadow-sm"
                      style={{ borderColor: colors.border, backgroundColor: colors.surface }}
                      onPress={handleManualImagePick}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="add-outline" size={24} color={colors.text} />
                    </TouchableOpacity>

                    {loadingImages ? (
                      <View className="w-16 h-16 justify-center items-center">
                        <ActivityIndicator size="small" color={colors.text} />
                      </View>
                    ) : (
                      imageSuggestions.map((logoUrl, idx) => (
                        <TouchableOpacity
                          key={idx}
                          className="w-16 h-16 rounded-2xl border overflow-hidden justify-center items-center shadow-sm"
                          style={{ 
                            borderColor: selectedLogo === logoUrl ? colors.text : colors.border, 
                            backgroundColor: colors.surface 
                          }}
                          onPress={() => {
                            setSelectedLogo(logoUrl);
                          }}
                          activeOpacity={0.8}
                        >
                          <Image source={{ uri: logoUrl }} className="w-full h-full resize-cover" />
                        </TouchableOpacity>
                      ))
                    )}
                  </ScrollView>
                </View>

                {/* Accounts Credential List Editor */}
                <View className="flex-row items-center justify-between mt-2 mb-4">
                  <Text className="text-[15px] font-bold tracking-[0.5px]" style={{ fontFamily: fonts.brandBold, color: colors.text }}>Accounts</Text>
                  <TouchableOpacity
                    className="flex-row items-center gap-1.5"
                    onPress={handleAddAccountInput}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="person-add-outline" size={16} color={colors.text} />
                    <Text className="text-[13px] font-bold" style={{ color: colors.text }}>Add Account</Text>
                  </TouchableOpacity>
                </View>

                {accounts.map((acc, idx) => (
                  <View 
                    key={acc.id} 
                    className="rounded-2xl p-5 border mb-5 gap-4 shadow-sm"
                    style={{ 
                      backgroundColor: useThemeStore.getState().themeMode === 'light' ? '#F9F9FB' : colors.surfaceHigh, 
                      borderColor: colors.border 
                    }}
                  >
                    <View className="flex-row items-center justify-between">
                      <Text className="text-[11px] font-bold tracking-[0.5px]" style={{ color: colors.textMuted }}>Account #{idx + 1}</Text>
                      {accounts.length > 1 && (
                        <TouchableOpacity
                          onPress={() => handleRemoveAccountInput(idx)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="trash-outline" size={16} color={colors.danger} />
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Username Input */}
                    <View className="flex-row items-center gap-3">
                      <View 
                        className="flex-1 flex-row items-center border rounded-xl px-4 h-11 shadow-sm"
                        style={{ backgroundColor: colors.surface, borderColor: colors.border }}
                      >
                        <TextInput
                          className="flex-1 text-[13px] font-medium"
                          style={{ color: colors.text }}
                          placeholder="Username, email, or client ID"
                          placeholderTextColor={colors.textDim}
                          value={acc.username}
                          onChangeText={(val) =>
                            setAccounts((prev) =>
                              prev.map((a, i) => (i === idx ? { ...a, username: val } : a))
                            )
                          }
                          autoCapitalize="none"
                          autoCorrect={false}
                        />
                      </View>
                      <TouchableOpacity
                        className="w-11 h-11 border border-transparent rounded-xl items-center justify-center shadow-sm"
                        style={{ backgroundColor: colors.surface }}
                        onPress={() => pasteModalUsername(idx)}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name="clipboard-outline"
                          size={18}
                          color={colors.textMuted}
                        />
                      </TouchableOpacity>
                    </View>

                    {/* Password Input Group */}
                    <View className="flex-row items-center gap-3">
                      <View 
                        className="flex-1 flex-row items-center border rounded-xl px-4 h-11 shadow-sm"
                        style={{ backgroundColor: colors.surface, borderColor: colors.border }}
                      >
                        <TextInput
                          className="flex-1 text-[13px] font-medium"
                          style={{ color: colors.text }}
                          placeholder="Password"
                          placeholderTextColor={colors.textDim}
                          value={acc.password}
                          onChangeText={(val) =>
                            setAccounts((prev) =>
                              prev.map((a, i) => (i === idx ? { ...a, password: val } : a))
                            )
                          }
                          secureTextEntry={!acc.showPassword}
                          autoCapitalize="none"
                          autoCorrect={false}
                        />
                        <TouchableOpacity
                          className="px-1.5"
                          onPress={() => toggleModalPasswordVisibility(idx)}
                        >
                          <Ionicons
                            name={acc.showPassword ? 'eye-off-outline' : 'eye-outline'}
                            size={18}
                            color={colors.textMuted}
                          />
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity
                        className="w-11 h-11 border border-transparent rounded-xl items-center justify-center shadow-sm"
                        style={{ backgroundColor: colors.surface }}
                        onPress={() => pasteModalPassword(idx)}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name="clipboard-outline"
                          size={18}
                          color={colors.textMuted}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}

                <View className="h-10" />
              </ScrollView>

              {/* Modal footer action buttons */}
              <View 
                className="flex-row gap-4 pt-5 border-t-[0.5px]"
                style={{ borderColor: colors.border }}
              >
                <TouchableOpacity
                  className="flex-1 border rounded-xl h-12 items-center justify-center"
                  style={{ backgroundColor: 'transparent', borderColor: colors.border }}
                  onPress={() => {
                    setModalVisible(false);
                    resetForm();
                  }}
                  activeOpacity={0.7}
                >
                  <Text className="text-sm font-bold" style={{ color: colors.textMuted }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="flex-1 rounded-xl h-12 items-center justify-center shadow-lg"
                  style={{
                    backgroundColor: colors.accent,
                    shadowColor: colors.accent,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.3,
                    shadowRadius: 8
                  }}
                  onPress={handleSaveToVault}
                  activeOpacity={0.8}
                >
                  <Text className="text-sm font-bold" style={{ color: '#FFFFFF' }}>{editingPlatformId ? 'Update Vault' : 'Save to Vault'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* View Details Modal */}
        <Modal
          visible={!!viewingPlatform}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setViewingPlatform(null)}
        >
          <View className="flex-1 bg-black/75 justify-end">
            <View 
              className="rounded-t-[32px] pt-4 px-6 pb-8 max-h-[90%] shadow-2xl"
              style={{ backgroundColor: colors.surface }}
            >
              {/* Drag Handle */}
              <View 
                className="w-10 h-1.5 rounded-full self-center mb-5" 
                style={{ backgroundColor: colors.border }} 
              />
              
              {viewingPlatform && (
                <>
                  <View className="flex-row items-center justify-between pb-4 mb-4 border-b-[0.5px]" style={{ borderColor: colors.border }}>
                    <View className="flex-row items-center flex-1">
                      <Image source={{ uri: viewingPlatform.logo }} className="w-10 h-10 rounded-xl mr-3" style={{ backgroundColor: colors.surfaceHigh }} />
                      <Text className="text-xl font-bold flex-1" numberOfLines={1} style={{ fontFamily: fonts.brandBold, color: colors.text }}>
                        {viewingPlatform.name}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setViewingPlatform(null)}
                      activeOpacity={0.7}
                      className="p-1"
                    >
                      <Ionicons name="close-circle" size={26} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>

                  <ScrollView showsVerticalScrollIndicator={false} className="mb-4">
                    <View className="flex-row items-center justify-between mb-3">
                      <Text className="text-sm font-bold tracking-[0.5px]" style={{ color: colors.textMuted }}>Accounts ({viewingPlatform.accounts.length})</Text>
                    </View>

                    {viewingPlatform.accounts.map((acc, idx) => (
                      <View 
                        key={acc.id} 
                        className="rounded-2xl p-5 border mb-4 gap-4 shadow-sm"
                        style={{ backgroundColor: useThemeStore.getState().themeMode === 'light' ? '#F9F9FB' : colors.surfaceHigh, borderColor: colors.border }}
                      >
                        <View className="flex-row items-center justify-between">
                          <Text className="text-xs font-bold" style={{ color: colors.textMuted }}>Account #{idx + 1}</Text>
                        </View>
                        
                        <View className="flex-row items-center border rounded-xl px-4 h-12 shadow-sm" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
                          <Ionicons name="person-outline" size={18} color={colors.textMuted} className="mr-3" />
                          <Text className="flex-1 text-sm font-medium" numberOfLines={1} style={{ color: colors.text }}>{acc.username}</Text>
                          <TouchableOpacity onPress={() => copyToClipboard(acc.username, `user-${acc.id}`)} className="p-1">
                            <Ionicons name={copiedId === `user-${acc.id}` ? "checkmark" : "copy-outline"} size={20} color={copiedId === `user-${acc.id}` ? colors.success : colors.text} />
                          </TouchableOpacity>
                        </View>

                        <View className="flex-row items-center border rounded-xl px-4 h-12 shadow-sm" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
                          <Ionicons name="key-outline" size={18} color={colors.textMuted} className="mr-3" />
                          <Text className="flex-1 text-sm font-medium tracking-widest" numberOfLines={1} style={{ color: colors.text }}>
                            {acc.showPassword ? acc.password : '••••••••••••'}
                          </Text>
                          <TouchableOpacity onPress={() => togglePasswordVisibility(viewingPlatform.id, acc.id)} className="p-1 mr-1">
                            <Ionicons name={acc.showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => copyToClipboard(acc.password, `pass-${acc.id}`)} className="p-1 border-l pl-3 border-gray-200/20">
                            <Ionicons name={copiedId === `pass-${acc.id}` ? "checkmark" : "copy-outline"} size={20} color={copiedId === `pass-${acc.id}` ? colors.success : colors.text} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </ScrollView>

                  {/* Modal footer action buttons */}
                  <View 
                    className="flex-row gap-4 pt-5 border-t-[0.5px]"
                    style={{ borderColor: colors.border }}
                  >
                    <TouchableOpacity
                      className="flex-1 border rounded-xl h-12 items-center justify-center"
                      style={{ backgroundColor: 'transparent', borderColor: colors.danger }}
                      onPress={() => deletePlatform(viewingPlatform.id, true)}
                      activeOpacity={0.7}
                    >
                      <Text className="text-sm font-bold" style={{ color: colors.danger }}>Delete</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className="flex-1 rounded-xl h-12 items-center justify-center shadow-lg"
                      style={{
                        backgroundColor: colors.accent,
                        shadowColor: colors.accent,
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.3,
                        shadowRadius: 8
                      }}
                      onPress={handleEditPlatform}
                      activeOpacity={0.8}
                    >
                      <Text className="text-sm font-bold" style={{ color: '#FFFFFF' }}>Edit</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}
