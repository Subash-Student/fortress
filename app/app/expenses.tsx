import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, TextInput, ActivityIndicator, Alert, Modal, KeyboardAvoidingView, Platform, Keyboard, TouchableWithoutFeedback, RefreshControl, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useThemeStore } from '../src/store/themeStore';
import { useAuthStore } from '../src/store/authStore';
import { encrypt, decrypt } from '../src/crypto/encryption';
import HeaderBar from '../src/components/HeaderBar';
import EmptyState from '../src/components/EmptyState';
import { expensesApi, bankAccountsApi } from '../src/api/client';
import {
  isSmsCaptureSupported,
  hasSmsPermission as checkSmsPermission,
  requestSmsPermission,
  syncSmsTransactions,
  getUnparsedQueue,
  dismissUnparsedEntry,
  UnparsedSmsEntry,
} from '../src/services/smsCapture';

const EXPENSES_LOGO = 'https://cdn-icons-png.flaticon.com/512/2830/2830284.png';
const SMS_PRIMER_DISMISSED_KEY = 'expense_sms_primer_dismissed';

interface TransactionItem {
  _id: string;
  amount: string;
  counterparty: string;
  notes: string;
  type: 'debit' | 'credit';
  category: string | null;
  bankAccountId: string | null;
  occurredAt: string;
  status: 'categorized' | 'needs_review';
}

interface BankAccountItem {
  _id: string;
  nickname: string;
  color: string;
}

export default function ExpensesScreen() {
  const { colors } = useThemeStore();
  const { vaultKey } = useAuthStore();
  const insets = useSafeAreaInsets();
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterNeedsReview, setFilterNeedsReview] = useState(false);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [selectedFilterCategories, setSelectedFilterCategories] = useState<string[]>([]);
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);

  // Bank Accounts State
  const [bankAccounts, setBankAccounts] = useState<BankAccountItem[]>([]);
  const [newBankName, setNewBankName] = useState('');
  const [isAddingBank, setIsAddingBank] = useState(false);

  // SMS Capture State
  const [smsPermissionGranted, setSmsPermissionGranted] = useState(false);
  const [isSmsSyncing, setIsSmsSyncing] = useState(false);
  const [unparsedQueue, setUnparsedQueue] = useState<UnparsedSmsEntry[]>([]);
  const [isReviewQueueModalVisible, setIsReviewQueueModalVisible] = useState(false);
  const [isSmsPrimerVisible, setIsSmsPrimerVisible] = useState(false);
  const [isRequestingSmsPermission, setIsRequestingSmsPermission] = useState(false);

  // Add/Edit Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<TransactionItem | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [transactionType, setTransactionType] = useState<'debit' | 'credit'>('debit');
  const [counterpartyInput, setCounterpartyInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [occurredAt, setOccurredAt] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryInput, setCategoryInput] = useState('');
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const decryptField = (field: any): string => {
    if (!vaultKey || !field?.ciphertext) return '';
    try {
      return decrypt(field.ciphertext, field.iv, vaultKey);
    } catch (err) {
      console.error('Failed to decrypt field:', err);
      return '';
    }
  };

  const fetchTransactions = async () => {
    try {
      const res = await expensesApi.getTransactions();
      const decrypted = res.data.map((item: any) => ({
        ...item,
        amount: decryptField(item.amount),
        counterparty: decryptField(item.counterparty),
        notes: decryptField(item.notes),
      }));
      setTransactions(decrypted);
    } catch (err) {
      console.error('Failed to fetch transactions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await expensesApi.getUserCategories();
      if (Array.isArray(res.data?.categories)) {
        setAvailableCategories(res.data.categories);
      }
    } catch (err) {
      console.error('Failed to fetch categories:', err);
    }
  };

  const fetchBankAccounts = async () => {
    try {
      const res = await bankAccountsApi.getBankAccounts();
      setBankAccounts(res.data || []);
    } catch (err) {
      console.error('Failed to fetch bank accounts:', err);
    }
  };

  const refreshUnparsedQueue = async () => {
    const queue = await getUnparsedQueue();
    setUnparsedQueue(queue);
  };

  useEffect(() => {
    fetchTransactions();
    fetchCategories();
    fetchBankAccounts();

    if (isSmsCaptureSupported()) {
      checkSmsPermission().then(async (granted) => {
        setSmsPermissionGranted(granted);
        if (!granted) {
          const dismissed = await AsyncStorage.getItem(SMS_PRIMER_DISMISSED_KEY);
          if (!dismissed) setIsSmsPrimerVisible(true);
        }
      });
      refreshUnparsedQueue();
    }
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([fetchTransactions(), fetchCategories(), fetchBankAccounts()]);
    setIsRefreshing(false);
  };

  const handleEnableSmsCapture = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsRequestingSmsPermission(true);
    try {
      const granted = await requestSmsPermission();
      setSmsPermissionGranted(granted);
      setIsSmsPrimerVisible(false);
      await AsyncStorage.setItem(SMS_PRIMER_DISMISSED_KEY, 'true');
      if (!granted) {
        Alert.alert('Permission needed', 'SMS access was not granted, so transactions can\'t be auto-captured. You can try again anytime from the banner below.');
        return;
      }
      await handleSyncSms(true);
    } finally {
      setIsRequestingSmsPermission(false);
    }
  };

  const handleDismissSmsPrimer = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsSmsPrimerVisible(false);
    await AsyncStorage.setItem(SMS_PRIMER_DISMISSED_KEY, 'true');
  };

  const handleSyncSms = async (fullHistory = false) => {
    if (!vaultKey) return;
    setIsSmsSyncing(true);
    try {
      const result = await syncSmsTransactions(vaultKey, fullHistory);
      await Promise.all([fetchTransactions(), refreshUnparsedQueue()]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (fullHistory || result.scanned > 0) {
        Alert.alert(
          'SMS Scan Complete',
          `Scanned ${result.scanned} messages — ${result.synced} transaction${result.synced === 1 ? '' : 's'} captured, ${result.unmatched} unrecognized.`
        );
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to sync SMS transactions');
    } finally {
      setIsSmsSyncing(false);
    }
  };

  const handleDismissUnparsed = async (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await dismissUnparsedEntry(id);
    refreshUnparsedQueue();
  };

  const handleOpenModal = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingTransaction(null);
    setAmountInput('');
    setTransactionType('debit');
    setCounterpartyInput('');
    setNotesInput('');
    setOccurredAt(new Date());
    setSelectedCategory(null);
    setCategoryInput('');
    setSelectedBankAccountId(null);
    setNewBankName('');
    setIsAddingBank(false);
    setModalVisible(true);
    fetchCategories();
    fetchBankAccounts();
  };

  const handleOpenEditModal = (item: TransactionItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingTransaction(item);
    setAmountInput(item.amount);
    setTransactionType(item.type);
    setCounterpartyInput(item.counterparty);
    setNotesInput(item.notes);
    setOccurredAt(new Date(item.occurredAt));
    setSelectedCategory(item.category);
    setCategoryInput('');
    setSelectedBankAccountId(item.bankAccountId);
    setNewBankName('');
    setIsAddingBank(false);
    setModalVisible(true);
    fetchCategories();
    fetchBankAccounts();
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setEditingTransaction(null);
  };

  const handleSelectCategory = (category: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedCategory(selectedCategory === category ? null : category);
  };

  const handleAddCustomCategory = () => {
    const trimmed = categoryInput.trim();
    if (!trimmed) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!availableCategories.includes(trimmed)) {
      setAvailableCategories([...availableCategories, trimmed]);
    }
    setSelectedCategory(trimmed);
    setCategoryInput('');
  };

  const handleAddBank = async () => {
    const trimmed = newBankName.trim();
    if (!trimmed) return;
    try {
      const res = await bankAccountsApi.saveBankAccount({ nickname: trimmed });
      const created = res.data;
      setBankAccounts([...bankAccounts, created]);
      setSelectedBankAccountId(created._id);
      setNewBankName('');
      setIsAddingBank(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (err) {
      Alert.alert('Error', 'Failed to add bank account');
    }
  };

  const handleSave = async () => {
    const parsedAmount = parseFloat(amountInput);
    if (!amountInput || isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Missing info', 'Please enter a valid amount.');
      return;
    }
    if (!vaultKey) {
      Alert.alert('Security Error', 'Encryption key not found. Please re-authenticate.');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        amount: encrypt(amountInput, vaultKey),
        counterparty: encrypt(counterpartyInput, vaultKey),
        notes: encrypt(notesInput, vaultKey),
        type: transactionType,
        category: selectedCategory,
        bankAccountId: selectedBankAccountId,
        occurredAt: occurredAt.toISOString(),
      };

      if (editingTransaction) {
        await expensesApi.updateTransaction(editingTransaction._id, payload);
      } else {
        await expensesApi.saveTransaction(payload);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      handleCloseModal();
      fetchTransactions();
      fetchCategories();
    } catch (err) {
      Alert.alert('Error', editingTransaction ? 'Failed to update transaction' : 'Failed to save transaction');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete Transaction', 'Are you sure you want to delete this transaction?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await expensesApi.deleteTransaction(id);
            setTransactions(transactions.filter(t => t._id !== id));
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (err) {
            Alert.alert('Error', 'Failed to delete');
          }
        }
      }
    ]);
  };

  const getBankName = (bankAccountId: string | null) => {
    if (!bankAccountId) return null;
    return bankAccounts.find(b => b._id === bankAccountId)?.nickname || null;
  };

  const renderItem = ({ item }: { item: TransactionItem }) => {
    const formattedDate = new Date(item.occurredAt).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
    });
    const formattedTime = new Date(item.occurredAt).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
    const bankName = getBankName(item.bankAccountId);
    const isCredit = item.type === 'credit';

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => handleOpenEditModal(item)}
        className="flex-row items-center py-3.5 px-4 mb-3 rounded-xl border"
        style={{ backgroundColor: colors.surface, borderColor: colors.border }}
      >
        <View
          className="w-10 h-10 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: isCredit ? `${colors.success}22` : `${colors.danger}22` }}
        >
          <Ionicons
            name={isCredit ? 'arrow-down' : 'arrow-up'}
            size={18}
            color={isCredit ? colors.success : colors.danger}
          />
        </View>

        <View className="flex-1 mr-2">
          <Text className="text-sm font-medium" style={{ color: colors.text }} numberOfLines={1}>
            {item.counterparty || 'Unknown'}
          </Text>
          <Text className="text-xs mt-0.5" style={{ color: colors.textMuted }} numberOfLines={1}>
            {formattedDate} • {formattedTime}{bankName ? ` • ${bankName}` : ''}
          </Text>
          <View className="flex-row items-center mt-1.5" style={{ gap: 6 }}>
            {item.status === 'needs_review' ? (
              <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: `${colors.warning}22` }}>
                <Text className="text-[10px] font-semibold" style={{ color: colors.warning }}>Needs Review</Text>
              </View>
            ) : (
              <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: colors.surfaceHigh }}>
                <Text className="text-[10px] font-medium" style={{ color: colors.textMuted }}>{item.category}</Text>
              </View>
            )}
          </View>
        </View>

        <View className="items-end">
          <Text
            className="text-sm font-semibold"
            style={{ color: isCredit ? colors.success : colors.text }}
          >
            {isCredit ? '+' : '-'}₹{item.amount}
          </Text>
          <TouchableOpacity onPress={() => handleDelete(item._id)} className="p-1.5 mt-1">
            <Ionicons name="trash-outline" size={16} color={colors.textDim} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const filteredTransactions = transactions.filter((t) => {
    const matchesSearch =
      t.counterparty.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.notes.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.category || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesReview = filterNeedsReview ? t.status === 'needs_review' : true;
    const matchesCategory =
      selectedFilterCategories.length === 0 ||
      (t.category && selectedFilterCategories.includes(t.category));

    return matchesSearch && matchesReview && matchesCategory;
  });

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }}>
      <View className="flex-1 px-4">
        <HeaderBar title="Expenses" logoUri={EXPENSES_LOGO} />

        {/* SMS Auto-Capture Banner */}
        {isSmsCaptureSupported() && (
          <View className="mt-4">
            {!smsPermissionGranted ? (
              <TouchableOpacity
                className="flex-row items-center justify-between px-4 py-3 rounded-xl"
                style={{ backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accent }}
                onPress={() => setIsSmsPrimerVisible(true)}
                activeOpacity={0.8}
              >
                <View className="flex-row items-center flex-1 mr-2" style={{ gap: 8 }}>
                  <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.accent} />
                  <Text className="text-xs font-semibold flex-1" style={{ color: colors.accent }}>
                    Enable SMS auto-capture to import transactions
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.accent} />
              </TouchableOpacity>
            ) : (
              <View className="flex-row items-center" style={{ gap: 8 }}>
                <TouchableOpacity
                  className="flex-1 flex-row items-center justify-center py-2.5 rounded-xl border"
                  style={{ backgroundColor: colors.surface, borderColor: colors.border }}
                  onPress={() => handleSyncSms(false)}
                  disabled={isSmsSyncing}
                  activeOpacity={0.7}
                >
                  {isSmsSyncing ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <>
                      <Ionicons name="sync-outline" size={16} color={colors.accent} />
                      <Text className="text-xs font-semibold ml-2" style={{ color: colors.accent }}>Sync SMS</Text>
                    </>
                  )}
                </TouchableOpacity>
                {unparsedQueue.length > 0 && (
                  <TouchableOpacity
                    className="flex-row items-center px-3 py-2.5 rounded-xl"
                    style={{ backgroundColor: `${colors.warning}22` }}
                    onPress={() => setIsReviewQueueModalVisible(true)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="help-circle-outline" size={16} color={colors.warning} />
                    <Text className="text-xs font-semibold ml-1.5" style={{ color: colors.warning }}>
                      {unparsedQueue.length} unrecognized
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}

        {/* Search and Filter Bar */}
        <View className="flex-row items-center my-4">
          <View
            className="flex-1 flex-row items-center h-12 px-3 rounded-xl border mr-2"
            style={{ backgroundColor: colors.surface, borderColor: colors.border }}
          >
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              className="flex-1 ml-2 text-sm h-full"
              style={{ color: colors.text }}
              placeholder="Search receiver, notes, category..."
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

          {/* Needs Review Filter Toggle */}
          <TouchableOpacity
            className="w-12 h-12 rounded-xl border justify-center items-center mr-2"
            style={{
              backgroundColor: filterNeedsReview ? colors.accentDim : colors.surface,
              borderColor: filterNeedsReview ? colors.accent : colors.border
            }}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setFilterNeedsReview(!filterNeedsReview);
            }}
            activeOpacity={0.7}
          >
            <Ionicons
              name={filterNeedsReview ? 'alert-circle' : 'alert-circle-outline'}
              size={20}
              color={filterNeedsReview ? colors.accent : colors.textMuted}
            />
          </TouchableOpacity>

          {/* Category Filter Button */}
          <TouchableOpacity
            className="w-12 h-12 rounded-xl border justify-center items-center relative"
            style={{
              backgroundColor: selectedFilterCategories.length > 0 ? colors.accentDim : colors.surface,
              borderColor: selectedFilterCategories.length > 0 ? colors.accent : colors.border
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
              color={selectedFilterCategories.length > 0 ? colors.accent : colors.textMuted}
            />
            {selectedFilterCategories.length > 0 && (
              <View
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full items-center justify-center"
                style={{ backgroundColor: colors.accent }}
              >
                <Text className="text-[10px] font-bold text-white">
                  {selectedFilterCategories.length}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : (
          <FlatList
            data={filteredTransactions}
            keyExtractor={(item) => item._id}
            renderItem={renderItem}
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 100, paddingTop: 4 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={colors.accent}
                colors={[colors.accent]}
              />
            }
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center" style={{ minHeight: 400 }}>
                <EmptyState
                  title={transactions.length === 0 ? 'No transactions yet' : 'No matches found'}
                  description={
                    transactions.length === 0
                      ? 'Tap + to log your first expense or income.'
                      : 'Try adjusting your search query or filters.'
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

      {/* Add/Edit Transaction Modal */}
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
                className="rounded-t-3xl p-6 shadow-xl max-h-[90%]"
                style={{
                  backgroundColor: colors.surface,
                  paddingBottom: Math.max(insets.bottom + 16, 24)
                }}
              >
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                >
                  <View className="flex-row justify-between items-center mb-6">
                    <Text className="text-xl font-semibold" style={{ color: colors.text }}>
                      {editingTransaction ? 'Edit Transaction' : 'Add Transaction'}
                    </Text>
                    <TouchableOpacity onPress={handleCloseModal}>
                      <Ionicons name="close" size={24} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>

                  {/* Debit / Credit Toggle */}
                  <View className="flex-row mb-4 rounded-xl overflow-hidden border" style={{ borderColor: colors.border }}>
                    <TouchableOpacity
                      className="flex-1 py-3 items-center"
                      style={{ backgroundColor: transactionType === 'debit' ? colors.danger : colors.bg }}
                      onPress={() => setTransactionType('debit')}
                    >
                      <Text
                        className="text-sm font-semibold"
                        style={{ color: transactionType === 'debit' ? '#FFFFFF' : colors.textMuted }}
                      >
                        Expense
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className="flex-1 py-3 items-center"
                      style={{ backgroundColor: transactionType === 'credit' ? colors.success : colors.bg }}
                      onPress={() => setTransactionType('credit')}
                    >
                      <Text
                        className="text-sm font-semibold"
                        style={{ color: transactionType === 'credit' ? '#FFFFFF' : colors.textMuted }}
                      >
                        Income
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Amount Input */}
                  <View
                    className="px-4 py-3 rounded-xl border mb-4 flex-row items-center"
                    style={{ backgroundColor: colors.bg, borderColor: colors.border }}
                  >
                    <Text className="text-base font-semibold mr-2" style={{ color: colors.textMuted }}>₹</Text>
                    <TextInput
                      className="flex-1 text-base"
                      style={{ color: colors.text }}
                      placeholder="0.00"
                      placeholderTextColor={colors.textDim}
                      value={amountInput}
                      onChangeText={setAmountInput}
                      keyboardType="decimal-pad"
                    />
                  </View>

                  {/* Counterparty Input */}
                  <View className="mb-4">
                    <Text className="text-sm font-semibold mb-1 ml-1" style={{ color: colors.textMuted }}>
                      Receiver / Sender
                    </Text>
                    <View
                      className="px-4 py-3 rounded-xl border flex-row items-center"
                      style={{ backgroundColor: colors.bg, borderColor: colors.border }}
                    >
                      <TextInput
                        className="flex-1 text-base"
                        style={{ color: colors.text }}
                        placeholder="e.g. Ramesh Store, John Doe..."
                        placeholderTextColor={colors.textDim}
                        value={counterpartyInput}
                        onChangeText={setCounterpartyInput}
                      />
                    </View>
                  </View>

                  {/* Date & Time */}
                  <View className="mb-4">
                    <Text className="text-sm font-semibold mb-1 ml-1" style={{ color: colors.textMuted }}>
                      Date & Time
                    </Text>
                    <View className="flex-row" style={{ gap: 8 }}>
                      <TouchableOpacity
                        className="flex-1 px-4 py-3 rounded-xl border flex-row items-center"
                        style={{ backgroundColor: colors.bg, borderColor: colors.border }}
                        onPress={() => setShowDatePicker(true)}
                      >
                        <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
                        <Text className="text-sm ml-2" style={{ color: colors.text }}>
                          {occurredAt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        className="flex-1 px-4 py-3 rounded-xl border flex-row items-center"
                        style={{ backgroundColor: colors.bg, borderColor: colors.border }}
                        onPress={() => setShowTimePicker(true)}
                      >
                        <Ionicons name="time-outline" size={18} color={colors.textMuted} />
                        <Text className="text-sm ml-2" style={{ color: colors.text }}>
                          {occurredAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    {showDatePicker && (
                      <DateTimePicker
                        value={occurredAt}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'inline' : 'default'}
                        onChange={(_event, selected) => {
                          setShowDatePicker(Platform.OS === 'ios');
                          if (selected) {
                            const updated = new Date(occurredAt);
                            updated.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
                            setOccurredAt(updated);
                          }
                        }}
                      />
                    )}
                    {showTimePicker && (
                      <DateTimePicker
                        value={occurredAt}
                        mode="time"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(_event, selected) => {
                          setShowTimePicker(Platform.OS === 'ios');
                          if (selected) {
                            const updated = new Date(occurredAt);
                            updated.setHours(selected.getHours(), selected.getMinutes());
                            setOccurredAt(updated);
                          }
                        }}
                      />
                    )}
                  </View>

                  {/* Bank Account Picker */}
                  <View className="mb-4">
                    <Text className="text-sm font-semibold mb-1 ml-1" style={{ color: colors.textMuted }}>
                      Bank / Account
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                      {bankAccounts.map((bank) => {
                        const isSelected = selectedBankAccountId === bank._id;
                        return (
                          <TouchableOpacity
                            key={bank._id}
                            className="px-3 py-2 rounded-full border"
                            style={{
                              backgroundColor: isSelected ? colors.accent : colors.bg,
                              borderColor: isSelected ? colors.accent : colors.border,
                            }}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              setSelectedBankAccountId(isSelected ? null : bank._id);
                            }}
                          >
                            <Text className="text-xs font-semibold" style={{ color: isSelected ? '#FFFFFF' : colors.text }}>
                              {bank.nickname}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                      <TouchableOpacity
                        className="px-3 py-2 rounded-full border"
                        style={{ backgroundColor: colors.bg, borderColor: colors.border }}
                        onPress={() => setIsAddingBank(!isAddingBank)}
                      >
                        <Text className="text-xs font-semibold" style={{ color: colors.accent }}>+ New</Text>
                      </TouchableOpacity>
                    </ScrollView>
                    {isAddingBank && (
                      <View className="flex-row items-center mt-2" style={{ gap: 6 }}>
                        <TextInput
                          className="flex-1 px-3 py-2 rounded-xl border text-sm"
                          style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}
                          placeholder="Bank nickname (e.g. HDFC Savings)"
                          placeholderTextColor={colors.textDim}
                          value={newBankName}
                          onChangeText={setNewBankName}
                          onSubmitEditing={handleAddBank}
                        />
                        <TouchableOpacity
                          className="px-3 py-2 rounded-lg"
                          style={{ backgroundColor: colors.accent }}
                          onPress={handleAddBank}
                        >
                          <Text className="text-xs font-bold text-white">Add</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>

                  {/* Category Selection */}
                  <View className="mb-4">
                    <Text className="text-sm font-semibold mb-1 ml-1" style={{ color: colors.textMuted }}>
                      Category
                    </Text>
                    <View className="flex-row flex-wrap mb-2" style={{ gap: 6 }}>
                      {availableCategories.map((cat) => {
                        const isSelected = selectedCategory === cat;
                        return (
                          <TouchableOpacity
                            key={cat}
                            className="px-3 py-1.5 rounded-full border"
                            style={{
                              backgroundColor: isSelected ? colors.accent : colors.bg,
                              borderColor: isSelected ? colors.accent : colors.border,
                            }}
                            onPress={() => handleSelectCategory(cat)}
                          >
                            <Text className="text-xs font-semibold" style={{ color: isSelected ? '#FFFFFF' : colors.text }}>
                              {cat}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <View
                      className="px-4 py-2.5 rounded-xl border flex-row items-center"
                      style={{ backgroundColor: colors.bg, borderColor: colors.border }}
                    >
                      <Ionicons name="pricetag-outline" size={18} color={colors.textMuted} className="mr-2" />
                      <TextInput
                        className="flex-1 text-base ml-2"
                        style={{ color: colors.text }}
                        placeholder="Or type a custom category..."
                        placeholderTextColor={colors.textDim}
                        value={categoryInput}
                        onChangeText={setCategoryInput}
                        onSubmitEditing={handleAddCustomCategory}
                        autoCapitalize="words"
                      />
                      {categoryInput.trim().length > 0 && (
                        <TouchableOpacity
                          className="px-3 py-1.5 rounded-lg"
                          style={{ backgroundColor: colors.accent }}
                          onPress={handleAddCustomCategory}
                        >
                          <Text className="text-xs font-bold text-white">+ Add</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  {/* Notes Input */}
                  <View className="mb-6">
                    <Text className="text-sm font-semibold mb-1 ml-1" style={{ color: colors.textMuted }}>
                      Notes
                    </Text>
                    <View
                      className="px-4 py-3 rounded-xl border flex-row items-center"
                      style={{ backgroundColor: colors.bg, borderColor: colors.border }}
                    >
                      <TextInput
                        className="flex-1 text-base"
                        style={{ color: colors.text }}
                        placeholder="Optional notes..."
                        placeholderTextColor={colors.textDim}
                        value={notesInput}
                        onChangeText={setNotesInput}
                        multiline
                      />
                    </View>
                  </View>

                  {/* Save Button */}
                  <TouchableOpacity
                    className="w-full py-4 rounded-2xl items-center justify-center flex-row mb-4"
                    style={{ backgroundColor: amountInput ? colors.accent : colors.surfaceHigh }}
                    onPress={handleSave}
                    disabled={!amountInput || isSaving}
                  >
                    {isSaving ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons name="checkmark" size={20} color={amountInput ? '#FFFFFF' : colors.textMuted} style={{ marginRight: 6 }} />
                        <Text className="text-base font-semibold" style={{ color: amountInput ? '#FFFFFF' : colors.textMuted }}>
                          {editingTransaction ? 'Update Transaction' : 'Save Transaction'}
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

      {/* Category Filter Bottom Sheet Modal */}
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
              <View className="w-12 h-1 rounded-full self-center mb-4 opacity-40" style={{ backgroundColor: colors.textMuted }} />

              <View className="flex-row justify-between items-center mb-4 pb-3 border-b" style={{ borderColor: colors.border }}>
                <View className="flex-row items-center" style={{ gap: 8 }}>
                  <Ionicons name="funnel-outline" size={20} color={colors.accent} />
                  <Text className="text-lg font-bold" style={{ color: colors.text }}>
                    Filter by Category
                  </Text>
                </View>
                <View className="flex-row items-center" style={{ gap: 12 }}>
                  {selectedFilterCategories.length > 0 && (
                    <TouchableOpacity
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedFilterCategories([]);
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

              <ScrollView showsVerticalScrollIndicator={false} className="py-2 max-h-[350px]">
                {availableCategories.length === 0 ? (
                  <View className="py-8 items-center">
                    <Ionicons name="pricetags-outline" size={32} color={colors.textDim} />
                    <Text className="text-sm text-center mt-2" style={{ color: colors.textMuted }}>
                      No categories yet. Categorize a transaction first!
                    </Text>
                  </View>
                ) : (
                  <View className="flex-row flex-wrap" style={{ gap: 10 }}>
                    {availableCategories.map((cat) => {
                      const isSelected = selectedFilterCategories.includes(cat);
                      return (
                        <TouchableOpacity
                          key={cat}
                          className="px-4 py-2.5 rounded-full border flex-row items-center"
                          style={{
                            backgroundColor: isSelected ? colors.accent : colors.bg,
                            borderColor: isSelected ? colors.accent : colors.border,
                          }}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            if (isSelected) {
                              setSelectedFilterCategories(selectedFilterCategories.filter(c => c !== cat));
                            } else {
                              setSelectedFilterCategories([...selectedFilterCategories, cat]);
                            }
                          }}
                          activeOpacity={0.7}
                        >
                          <Text
                            className="text-sm font-semibold"
                            style={{ color: isSelected ? '#FFFFFF' : colors.text }}
                          >
                            {cat}
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

              <TouchableOpacity
                className="w-full py-3.5 rounded-xl items-center justify-center mt-4"
                style={{ backgroundColor: colors.accent }}
                onPress={() => setIsFilterModalVisible(false)}
                activeOpacity={0.85}
              >
                <Text className="text-base font-semibold text-white">
                  Apply Filters ({selectedFilterCategories.length})
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      {/* SMS Auto-Capture Permission Primer */}
      <Modal
        visible={isSmsPrimerVisible}
        transparent
        animationType="slide"
        onRequestClose={handleDismissSmsPrimer}
      >
        <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <View
            className="rounded-t-3xl p-6 items-center"
            style={{
              backgroundColor: colors.surface,
              paddingBottom: Math.max(insets.bottom + 16, 24),
            }}
          >
            <View className="w-12 h-1 rounded-full self-center mb-5 opacity-40" style={{ backgroundColor: colors.textMuted }} />

            <View
              className="w-16 h-16 rounded-full items-center justify-center mb-4"
              style={{ backgroundColor: colors.accentDim }}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={30} color={colors.accent} />
            </View>

            <Text className="text-xl font-bold mb-2 text-center" style={{ color: colors.text }}>
              Auto-Capture from Bank SMS
            </Text>
            <Text className="text-sm text-center mb-6 px-2" style={{ color: colors.textMuted }}>
              Fortress can read your bank's transaction messages so you don't have to log every expense by hand.
            </Text>

            <View className="w-full mb-6" style={{ gap: 14 }}>
              <View className="flex-row items-start" style={{ gap: 12 }}>
                <Ionicons name="phone-portrait-outline" size={18} color={colors.accent} style={{ marginTop: 1 }} />
                <Text className="text-xs flex-1" style={{ color: colors.textMuted }}>
                  Message parsing happens entirely on this device — nothing is sent anywhere just to read it.
                </Text>
              </View>
              <View className="flex-row items-start" style={{ gap: 12 }}>
                <Ionicons name="lock-closed-outline" size={18} color={colors.accent} style={{ marginTop: 1 }} />
                <Text className="text-xs flex-1" style={{ color: colors.textMuted }}>
                  Only the extracted amount, receiver, and date are encrypted and synced. The raw message text never leaves your phone.
                </Text>
              </View>
              <View className="flex-row items-start" style={{ gap: 12 }}>
                <Ionicons name="pricetag-outline" size={18} color={colors.accent} style={{ marginTop: 1 }} />
                <Text className="text-xs flex-1" style={{ color: colors.textMuted }}>
                  Captured transactions land in a "Needs Review" inbox — you still choose the category and notes yourself.
                </Text>
              </View>
            </View>

            <TouchableOpacity
              className="w-full py-4 rounded-2xl items-center justify-center flex-row mb-3"
              style={{ backgroundColor: colors.accent }}
              onPress={handleEnableSmsCapture}
              disabled={isRequestingSmsPermission}
              activeOpacity={0.85}
            >
              {isRequestingSmsPermission ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text className="text-base font-semibold text-white">Enable Auto-Capture</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity className="py-2" onPress={handleDismissSmsPrimer} disabled={isRequestingSmsPermission}>
              <Text className="text-sm font-medium" style={{ color: colors.textMuted }}>Not Now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Unrecognized SMS Review Queue Modal */}
      <Modal
        visible={isReviewQueueModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsReviewQueueModalVisible(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setIsReviewQueueModalVisible(false)}
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
              <View className="w-12 h-1 rounded-full self-center mb-4 opacity-40" style={{ backgroundColor: colors.textMuted }} />

              <View className="flex-row justify-between items-center mb-4 pb-3 border-b" style={{ borderColor: colors.border }}>
                <View className="flex-row items-center" style={{ gap: 8 }}>
                  <Ionicons name="help-circle-outline" size={20} color={colors.warning} />
                  <Text className="text-lg font-bold" style={{ color: colors.text }}>
                    Unrecognized Messages
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setIsReviewQueueModalVisible(false)} className="p-1">
                  <Ionicons name="close" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              <Text className="text-xs mb-3" style={{ color: colors.textMuted }}>
                These SMS didn't match a known bank format. They stay on your device — dismiss the ones that aren't transactions, or add the rest manually.
              </Text>

              <ScrollView showsVerticalScrollIndicator={false} className="max-h-[400px]">
                {unparsedQueue.map((entry) => (
                  <View
                    key={entry.id}
                    className="p-3 rounded-xl border mb-3"
                    style={{ backgroundColor: colors.bg, borderColor: colors.border }}
                  >
                    <Text className="text-xs font-semibold mb-1" style={{ color: colors.textMuted }}>
                      {entry.address || 'Unknown sender'} • {new Date(entry.date).toLocaleDateString()}
                    </Text>
                    <Text className="text-sm mb-2" style={{ color: colors.text }} numberOfLines={4}>
                      {entry.body}
                    </Text>
                    <TouchableOpacity
                      className="self-end px-3 py-1.5 rounded-lg"
                      style={{ backgroundColor: colors.surfaceHigh }}
                      onPress={() => handleDismissUnparsed(entry.id)}
                    >
                      <Text className="text-xs font-semibold" style={{ color: colors.textMuted }}>Dismiss</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}
