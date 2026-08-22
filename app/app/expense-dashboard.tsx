import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Modal, TextInput, TouchableWithoutFeedback, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useThemeStore } from '../src/store/themeStore';
import { useAuthStore } from '../src/store/authStore';
import { decryptField } from '../src/crypto/encryption';
import { expensesApi, bankAccountsApi } from '../src/api/client';
import HeaderBar from '../src/components/HeaderBar';
import EmptyState from '../src/components/EmptyState';
import {
  AnalyticsTransaction,
  AnalyticsBankAccount,
  BankAccountPurpose,
  PayCycle,
  detectPayCycles,
  getCurrentCycle,
  getPreviousCycle,
  computeSafeToSpend,
  computeProjectedCycleTotal,
  computeCategoryTrend,
  computeEnvelopeProgress,
  detectRecurringTransactions,
} from '../src/analytics/expenseAnalytics';

interface BankAccountItem extends AnalyticsBankAccount {
  nickname: string;
  bankName: string;
  last4: string;
  color: string;
}

const PURPOSE_LABELS: Record<BankAccountPurpose, string> = {
  monthly_expense: 'Monthly Expense',
  savings: 'Savings',
  bills_reserve: 'Bills Reserve',
  salary_source: 'Salary Source',
  other: 'Other',
};

const PURPOSE_OPTIONS: BankAccountPurpose[] = ['monthly_expense', 'savings', 'bills_reserve', 'salary_source', 'other'];

const formatCurrency = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

const formatCycleRange = (cycle: PayCycle) =>
  `${cycle.start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${cycle.end.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;

const DECRYPT_CHUNK_SIZE = 50;

function ProgressRing({ progress, size, strokeWidth, color, trackColor }: { progress: number; size: number; strokeWidth: number; color: string; trackColor: string }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));
  const offset = circumference * (1 - clamped);

  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}

function ProgressBar({ progress, color, trackColor }: { progress: number; color: string; trackColor: string }) {
  const pct = Math.max(0, Math.min(100, progress * 100));
  return (
    <View className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: trackColor }}>
      <View style={{ width: `${pct}%`, backgroundColor: color, height: '100%' }} />
    </View>
  );
}

export default function ExpenseDashboardScreen() {
  const { colors, fonts } = useThemeStore();
  const { vaultKey } = useAuthStore();
  const insets = useSafeAreaInsets();

  const [transactions, setTransactions] = useState<AnalyticsTransaction[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountItem[]>([]);
  const [payCycleAnchorDay, setPayCycleAnchorDay] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCycleIndex, setSelectedCycleIndex] = useState<number | null>(null);

  const [isConfigModalVisible, setIsConfigModalVisible] = useState(false);
  const [configDrafts, setConfigDrafts] = useState<{ purpose: BankAccountPurpose; targetAmount: string }[]>([]);
  const [anchorDayDraft, setAnchorDayDraft] = useState('1');
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  const fetchData = async () => {
    try {
      const [txnRes, bankRes, anchorRes] = await Promise.all([
        expensesApi.getTransactions(),
        bankAccountsApi.getBankAccounts(),
        expensesApi.getPayCycleAnchor(),
      ]);

      setBankAccounts(bankRes.data || []);
      setPayCycleAnchorDay(anchorRes.data?.payCycleAnchorDay ?? 1);

      const rawItems = txnRes.data;
      let decrypted: AnalyticsTransaction[] = [];
      for (let i = 0; i < rawItems.length; i += DECRYPT_CHUNK_SIZE) {
        const batch = rawItems.slice(i, i + DECRYPT_CHUNK_SIZE).map((item: any) => ({
          _id: item._id,
          amount: parseFloat(decryptField(item.amount, vaultKey)) || 0,
          counterparty: decryptField(item.counterparty, vaultKey),
          type: item.type,
          category: item.category,
          bankAccountId: item.bankAccountId,
          occurredAt: new Date(item.occurredAt),
        }));
        decrypted = [...decrypted, ...batch];
        setTransactions(decrypted);
        setIsLoading(false);
        if (i + DECRYPT_CHUNK_SIZE < rawItems.length) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const { cycles, isDetected } = useMemo(
    () => detectPayCycles(transactions, bankAccounts, payCycleAnchorDay),
    [transactions, bankAccounts, payCycleAnchorDay]
  );

  useEffect(() => {
    if (cycles.length > 0) {
      const current = getCurrentCycle(cycles);
      setSelectedCycleIndex(cycles.indexOf(current));
    }
  }, [cycles.length]);

  const selectedCycle = selectedCycleIndex !== null ? cycles[selectedCycleIndex] : null;
  const previousCycle = selectedCycle ? getPreviousCycle(cycles, selectedCycle) : null;
  const isViewingCurrentCycle = selectedCycleIndex === cycles.length - 1;
  const referenceDate = isViewingCurrentCycle ? new Date() : (selectedCycle?.end ?? new Date());

  const safeToSpend = useMemo(
    () => (selectedCycle ? computeSafeToSpend(transactions, bankAccounts, selectedCycle, referenceDate) : null),
    [transactions, bankAccounts, selectedCycle, referenceDate]
  );

  const projected = useMemo(
    () => (selectedCycle ? computeProjectedCycleTotal(transactions, bankAccounts, selectedCycle, referenceDate) : null),
    [transactions, bankAccounts, selectedCycle, referenceDate]
  );

  const categoryTrend = useMemo(
    () => (selectedCycle ? computeCategoryTrend(transactions, selectedCycle, previousCycle) : []),
    [transactions, selectedCycle, previousCycle]
  );

  const recurring = useMemo(() => detectRecurringTransactions(transactions), [transactions]);

  const envelopeAccounts = useMemo(() => bankAccounts.filter((a) => a.purpose !== 'other' && a.purpose !== 'salary_source'), [bankAccounts]);

  const envelopeProgress = useMemo(
    () =>
      selectedCycle
        ? envelopeAccounts.map((a) => ({ account: a, progress: computeEnvelopeProgress(transactions, a, selectedCycle, referenceDate) }))
        : [],
    [transactions, envelopeAccounts, selectedCycle, referenceDate]
  );

  const monthlyExpenseAccount = bankAccounts.find((a) => a.purpose === 'monthly_expense');
  const hasAnyEnvelopeConfigured = bankAccounts.some((a) => a.targetAmount != null);

  const openConfigModal = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setConfigDrafts(
      bankAccounts.map((a) => ({
        purpose: a.purpose,
        targetAmount: a.targetAmount != null ? String(a.targetAmount) : '',
      }))
    );
    setAnchorDayDraft(String(payCycleAnchorDay));
    setIsConfigModalVisible(true);
  };

  const handleSaveConfig = async () => {
    setIsSavingConfig(true);
    try {
      await Promise.all([
        ...bankAccounts.map((account, idx) => {
          const draft = configDrafts[idx];
          return bankAccountsApi.updateBankAccount(account._id, {
            nickname: account.nickname,
            bankName: account.bankName,
            last4: account.last4,
            color: account.color,
            purpose: draft.purpose,
            targetAmount: draft.targetAmount.trim() ? parseFloat(draft.targetAmount) : null,
          });
        }),
        expensesApi.updatePayCycleAnchor(parseInt(anchorDayDraft, 10) || 1),
      ]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsConfigModalVisible(false);
      fetchData();
    } catch (err) {
      Alert.alert('Error', 'Failed to save envelope configuration');
    } finally {
      setIsSavingConfig(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }}>
        <View className="flex-1 px-4">
          <HeaderBar title="Analysis" />
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (transactions.length === 0) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }}>
        <View className="flex-1 px-4">
          <HeaderBar title="Analysis" />
          <View className="flex-1 items-center justify-center">
            <EmptyState title="Nothing to analyze yet" description="Log or capture a few transactions first, then come back here." />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const pacePct = safeToSpend && safeToSpend.budgetTarget > 0 ? safeToSpend.spentSoFar / safeToSpend.budgetTarget : 0;
  const paceColor = !safeToSpend?.budgetTarget
    ? colors.textMuted
    : safeToSpend.isOverBudget
    ? colors.danger
    : pacePct > 0.85
    ? colors.warning
    : colors.success;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }}>
      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <HeaderBar title="Analysis" />

        {/* Cycle Selector */}
        {selectedCycle && (
          <View className="flex-row items-center justify-between my-4 px-2">
            <TouchableOpacity
              disabled={selectedCycleIndex === 0}
              onPress={() => setSelectedCycleIndex((i) => Math.max(0, (i ?? 0) - 1))}
              className="p-2"
            >
              <Ionicons name="chevron-back" size={20} color={selectedCycleIndex === 0 ? colors.textDim : colors.text} />
            </TouchableOpacity>
            <View className="items-center">
              <Text className="text-sm font-semibold" style={{ color: colors.text }}>
                {formatCycleRange(selectedCycle)}
              </Text>
              {!isDetected && (
                <Text className="text-[10px] mt-0.5" style={{ color: colors.textDim }}>
                  Estimated — improves with more history
                </Text>
              )}
            </View>
            <TouchableOpacity
              disabled={selectedCycleIndex === cycles.length - 1}
              onPress={() => setSelectedCycleIndex((i) => Math.min(cycles.length - 1, (i ?? 0) + 1))}
              className="p-2"
            >
              <Ionicons name="chevron-forward" size={20} color={selectedCycleIndex === cycles.length - 1 ? colors.textDim : colors.text} />
            </TouchableOpacity>
          </View>
        )}

        {/* Hero: Safe to Spend */}
        <View className="rounded-3xl border p-6 items-center mb-4" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
          {!monthlyExpenseAccount || !hasAnyEnvelopeConfigured ? (
            <View className="items-center py-4">
              <Ionicons name="wallet-outline" size={28} color={colors.textDim} />
              <Text className="text-sm text-center mt-3 mb-4 px-4" style={{ color: colors.textMuted }}>
                Set up your envelopes to see your daily safe-to-spend pace.
              </Text>
              <TouchableOpacity className="px-4 py-2.5 rounded-xl" style={{ backgroundColor: colors.accent }} onPress={openConfigModal}>
                <Text className="text-sm font-semibold text-white">Configure Envelopes</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={{ position: 'relative' }}>
                <ProgressRing progress={pacePct} size={140} strokeWidth={12} color={paceColor} trackColor={colors.surfaceHigh} />
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                  <Text className="text-[11px] font-medium" style={{ color: colors.textMuted }}>
                    {safeToSpend?.isOverBudget ? 'Over by' : 'Safe to spend'}
                  </Text>
                  <Text className="text-2xl font-bold" style={{ color: paceColor, fontFamily: fonts.brandBold }}>
                    {safeToSpend?.isOverBudget
                      ? formatCurrency(Math.abs(safeToSpend.remaining))
                      : formatCurrency(safeToSpend?.safeToSpendToday || 0)}
                  </Text>
                  {!safeToSpend?.isOverBudget && (
                    <Text className="text-[10px]" style={{ color: colors.textDim }}>per day</Text>
                  )}
                </View>
              </View>
              <View className="flex-row justify-between w-full mt-5">
                <View className="items-center flex-1">
                  <Text className="text-xs" style={{ color: colors.textMuted }}>Spent</Text>
                  <Text className="text-sm font-semibold" style={{ color: colors.text }}>{formatCurrency(safeToSpend?.spentSoFar || 0)}</Text>
                </View>
                <View className="items-center flex-1">
                  <Text className="text-xs" style={{ color: colors.textMuted }}>Budget</Text>
                  <Text className="text-sm font-semibold" style={{ color: colors.text }}>{formatCurrency(safeToSpend?.budgetTarget || 0)}</Text>
                </View>
                <View className="items-center flex-1">
                  <Text className="text-xs" style={{ color: colors.textMuted }}>Days Left</Text>
                  <Text className="text-sm font-semibold" style={{ color: colors.text }}>{safeToSpend?.daysRemaining ?? '-'}</Text>
                </View>
              </View>
            </>
          )}
        </View>

        {/* Projected cycle-end total */}
        {monthlyExpenseAccount && hasAnyEnvelopeConfigured && projected && (
          <View className="rounded-2xl border p-4 mb-4 flex-row items-center justify-between" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
            <View className="flex-row items-center flex-1" style={{ gap: 10 }}>
              <Ionicons name="trending-up-outline" size={20} color={colors.accent} />
              <View className="flex-1">
                <Text className="text-xs" style={{ color: colors.textMuted }}>Projected cycle-end total</Text>
                <Text className="text-base font-semibold" style={{ color: colors.text }}>{formatCurrency(projected.projectedTotal)}</Text>
              </View>
            </View>
            {safeToSpend && safeToSpend.budgetTarget > 0 && (
              <Text
                className="text-xs font-semibold"
                style={{ color: projected.projectedTotal > safeToSpend.budgetTarget ? colors.danger : colors.success }}
              >
                {projected.projectedTotal > safeToSpend.budgetTarget ? '+' : ''}
                {formatCurrency(projected.projectedTotal - safeToSpend.budgetTarget)}
              </Text>
            )}
          </View>
        )}

        {/* Envelope summary cards */}
        {envelopeProgress.length > 0 && (
          <View className="mb-2">
            <View className="flex-row items-center justify-between mb-3 px-1">
              <Text className="text-base font-bold" style={{ color: colors.text }}>Envelopes</Text>
              <TouchableOpacity onPress={openConfigModal}>
                <Ionicons name="settings-outline" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            {envelopeProgress.map(({ account, progress }) => {
              const target = progress.target || 0;
              const pct = target > 0 ? progress.amount / target : 0;
              const isSavings = account.purpose === 'savings';
              const overTarget = !isSavings && target > 0 && progress.amount > target;
              const barColor = overTarget ? colors.danger : isSavings && pct >= 1 ? colors.success : colors.accent;

              return (
                <View key={account._id} className="rounded-2xl border p-4 mb-3" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
                  <View className="flex-row items-center justify-between mb-2">
                    <View className="flex-row items-center" style={{ gap: 8 }}>
                      <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: account.color }} />
                      <Text className="text-sm font-semibold" style={{ color: colors.text }}>{account.nickname}</Text>
                      <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: colors.surfaceHigh }}>
                        <Text className="text-[10px] font-medium" style={{ color: colors.textMuted }}>{PURPOSE_LABELS[account.purpose]}</Text>
                      </View>
                    </View>
                    <Text className="text-xs font-semibold" style={{ color: colors.textMuted }}>
                      {formatCurrency(progress.amount)}{target > 0 ? ` / ${formatCurrency(target)}` : ''}
                    </Text>
                  </View>
                  {target > 0 ? (
                    <ProgressBar progress={pct} color={barColor} trackColor={colors.surfaceHigh} />
                  ) : (
                    <Text className="text-[11px]" style={{ color: colors.textDim }}>No target set</Text>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Category breakdown / trend */}
        {categoryTrend.length > 0 && (
          <View className="mb-2">
            <Text className="text-base font-bold mb-3 px-1" style={{ color: colors.text }}>Category Breakdown</Text>
            <View className="rounded-2xl border p-4 mb-4" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
              {categoryTrend.slice(0, 8).map((entry) => {
                const maxTotal = categoryTrend[0]?.currentTotal || 1;
                return (
                  <View key={entry.category} className="mb-3">
                    <View className="flex-row items-center justify-between mb-1">
                      <Text className="text-xs font-medium" style={{ color: colors.text }}>{entry.category}</Text>
                      <View className="flex-row items-center" style={{ gap: 6 }}>
                        <Text className="text-xs font-semibold" style={{ color: colors.textMuted }}>{formatCurrency(entry.currentTotal)}</Text>
                        {entry.percentChange === null ? (
                          <View className="px-1.5 py-0.5 rounded" style={{ backgroundColor: colors.accentDim }}>
                            <Text className="text-[9px] font-bold" style={{ color: colors.accent }}>NEW</Text>
                          </View>
                        ) : (
                          <Text className="text-[10px] font-semibold" style={{ color: entry.percentChange > 0 ? colors.danger : colors.success }}>
                            {entry.percentChange > 0 ? '↑' : '↓'} {Math.abs(Math.round(entry.percentChange))}%
                          </Text>
                        )}
                      </View>
                    </View>
                    <ProgressBar progress={entry.currentTotal / maxTotal} color={colors.accent} trackColor={colors.surfaceHigh} />
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Recurring transactions */}
        {recurring.length > 0 && (
          <View className="mb-2">
            <Text className="text-base font-bold mb-3 px-1" style={{ color: colors.text }}>Recurring</Text>
            {recurring.slice(0, 6).map((r, idx) => (
              <View key={`${r.counterparty}-${idx}`} className="rounded-2xl border p-4 mb-3 flex-row items-center justify-between" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
                <View className="flex-1 mr-2">
                  <Text className="text-sm font-semibold" style={{ color: colors.text }} numberOfLines={1}>{r.counterparty}</Text>
                  <Text className="text-xs mt-0.5" style={{ color: colors.textMuted }}>
                    Every ~{r.cadenceDays}d • next around {r.predictedNextDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                  </Text>
                </View>
                <Text className="text-sm font-semibold" style={{ color: colors.text }}>{formatCurrency(r.averageAmount)}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Configure Envelopes Modal */}
      <Modal visible={isConfigModalVisible} transparent animationType="slide" onRequestClose={() => setIsConfigModalVisible(false)}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setIsConfigModalVisible(false)}
          className="flex-1 justify-end"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View
              className="rounded-t-3xl p-6 shadow-xl max-h-[88%]"
              style={{ backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom + 16, 24) }}
            >
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View className="flex-row justify-between items-center mb-6">
                  <Text className="text-xl font-semibold" style={{ color: colors.text }}>Configure Envelopes</Text>
                  <TouchableOpacity onPress={() => setIsConfigModalVisible(false)}>
                    <Ionicons name="close" size={24} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>

                {bankAccounts.map((account, idx) => (
                  <View key={account._id} className="mb-5 pb-5 border-b" style={{ borderColor: colors.border }}>
                    <Text className="text-sm font-semibold mb-2" style={{ color: colors.text }}>{account.nickname}</Text>

                    <View className="flex-row flex-wrap mb-3" style={{ gap: 6 }}>
                      {PURPOSE_OPTIONS.map((purpose) => {
                        const isSelected = configDrafts[idx]?.purpose === purpose;
                        return (
                          <TouchableOpacity
                            key={purpose}
                            className="px-3 py-1.5 rounded-full border"
                            style={{ backgroundColor: isSelected ? colors.accent : colors.bg, borderColor: isSelected ? colors.accent : colors.border }}
                            onPress={() => {
                              const next = [...configDrafts];
                              next[idx] = { ...next[idx], purpose };
                              setConfigDrafts(next);
                            }}
                          >
                            <Text className="text-xs font-semibold" style={{ color: isSelected ? '#FFFFFF' : colors.text }}>
                              {PURPOSE_LABELS[purpose]}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {configDrafts[idx]?.purpose !== 'other' && configDrafts[idx]?.purpose !== 'salary_source' && (
                      <View className="px-4 py-2.5 rounded-xl border flex-row items-center" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
                        <Text className="text-sm font-semibold mr-2" style={{ color: colors.textMuted }}>₹</Text>
                        <TextInput
                          className="flex-1 text-base"
                          style={{ color: colors.text }}
                          placeholder="Target amount per cycle"
                          placeholderTextColor={colors.textDim}
                          keyboardType="decimal-pad"
                          value={configDrafts[idx]?.targetAmount}
                          onChangeText={(text) => {
                            const next = [...configDrafts];
                            next[idx] = { ...next[idx], targetAmount: text };
                            setConfigDrafts(next);
                          }}
                        />
                      </View>
                    )}
                  </View>
                ))}

                <View className="mb-6">
                  <Text className="text-sm font-semibold mb-1 ml-1" style={{ color: colors.textMuted }}>
                    Fallback cycle start day (used only until a salary pattern is detected)
                  </Text>
                  <View className="px-4 py-2.5 rounded-xl border flex-row items-center" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
                    <TextInput
                      className="flex-1 text-base"
                      style={{ color: colors.text }}
                      keyboardType="number-pad"
                      value={anchorDayDraft}
                      onChangeText={setAnchorDayDraft}
                      maxLength={2}
                    />
                  </View>
                </View>

                <TouchableOpacity
                  className="w-full py-4 rounded-2xl items-center justify-center flex-row mb-2"
                  style={{ backgroundColor: colors.accent }}
                  onPress={handleSaveConfig}
                  disabled={isSavingConfig}
                >
                  {isSavingConfig ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text className="text-base font-semibold text-white">Save</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}
