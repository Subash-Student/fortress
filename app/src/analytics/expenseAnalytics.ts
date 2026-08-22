export interface AnalyticsTransaction {
  _id: string;
  amount: number;
  counterparty: string;
  type: 'debit' | 'credit';
  category: string | null;
  bankAccountId: string | null;
  occurredAt: Date;
}

export type BankAccountPurpose = 'monthly_expense' | 'savings' | 'bills_reserve' | 'salary_source' | 'other';

export interface AnalyticsBankAccount {
  _id: string;
  nickname: string;
  bankName?: string;
  purpose: BankAccountPurpose;
  targetAmount: number | null;
}

export interface PayCycle {
  start: Date;
  end: Date; // exclusive
  isEstimated: boolean; // true when derived from the fallback anchor day, not a detected salary pattern
}

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function estimatedCycleFromAnchor(anchorDay: number, referenceDate: Date): PayCycle {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const day = referenceDate.getDate();

  const start = day >= anchorDay
    ? new Date(year, month, anchorDay)
    : new Date(year, month - 1, anchorDay);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);

  return { start, end, isEstimated: true };
}

// Walks credits chronologically looking for a recurring large deposit (salary) roughly
// once a month. Needs at least 2 detected events to trust the pattern; falls back to a
// calendar-style cycle anchored at `fallbackAnchorDay` otherwise.
export function detectPayCycles(
  transactions: AnalyticsTransaction[],
  bankAccounts: AnalyticsBankAccount[],
  fallbackAnchorDay: number,
  referenceDate: Date = new Date()
): { cycles: PayCycle[]; isDetected: boolean } {
  const salaryAccountIds = new Set(bankAccounts.filter((a) => a.purpose === 'salary_source').map((a) => a._id));
  const restrictToSalaryAccounts = salaryAccountIds.size > 0;

  const credits = transactions
    .filter((t) => t.type === 'credit' && (!restrictToSalaryAccounts || (t.bankAccountId && salaryAccountIds.has(t.bankAccountId))))
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  const debitAmounts = transactions.filter((t) => t.type === 'debit').map((t) => t.amount).sort((a, b) => a - b);
  const medianDebit = debitAmounts.length > 0 ? debitAmounts[Math.floor(debitAmounts.length / 2)] : 0;
  const salaryThreshold = Math.max(medianDebit * 3, 1000);

  const qualifying = credits.filter((c) => c.amount >= salaryThreshold);

  // Greedily pick at most one salary event per ~25+ day window.
  const salaryEvents: Date[] = [];
  for (const c of qualifying) {
    const last = salaryEvents[salaryEvents.length - 1];
    if (!last || daysBetween(last, c.occurredAt) >= 25) {
      salaryEvents.push(c.occurredAt);
    }
  }

  if (salaryEvents.length < 2) {
    return { cycles: [estimatedCycleFromAnchor(fallbackAnchorDay, referenceDate)], isDetected: false };
  }

  const cycles: PayCycle[] = [];
  for (let i = 0; i < salaryEvents.length - 1; i++) {
    cycles.push({ start: salaryEvents[i], end: salaryEvents[i + 1], isEstimated: false });
  }

  // The in-progress current cycle has no "next salary" yet — estimate its end from
  // the average length of previously detected cycles.
  const avgLength = cycles.reduce((sum, c) => sum + daysBetween(c.start, c.end), 0) / cycles.length;
  const lastEvent = salaryEvents[salaryEvents.length - 1];
  cycles.push({ start: lastEvent, end: addDays(lastEvent, Math.round(avgLength)), isEstimated: false });

  return { cycles, isDetected: true };
}

export function getCurrentCycle(cycles: PayCycle[], referenceDate: Date = new Date()): PayCycle {
  return cycles.find((c) => referenceDate >= c.start && referenceDate < c.end) || cycles[cycles.length - 1];
}

export function getPreviousCycle(cycles: PayCycle[], currentCycle: PayCycle): PayCycle | null {
  const idx = cycles.indexOf(currentCycle);
  return idx > 0 ? cycles[idx - 1] : null;
}

export interface SafeToSpendResult {
  budgetTarget: number;
  spentSoFar: number;
  remaining: number;
  daysRemaining: number;
  safeToSpendToday: number | null; // null when no envelope has a target configured yet
  isOverBudget: boolean;
}

// The "Safe to Spend" formula: remaining budget divided across the days left in the cycle.
export function computeSafeToSpend(
  transactions: AnalyticsTransaction[],
  bankAccounts: AnalyticsBankAccount[],
  cycle: PayCycle,
  referenceDate: Date = new Date()
): SafeToSpendResult {
  const expenseAccounts = bankAccounts.filter((a) => a.purpose === 'monthly_expense');
  const expenseAccountIds = new Set(expenseAccounts.map((a) => a._id));
  const budgetTarget = expenseAccounts.reduce((sum, a) => sum + (a.targetAmount || 0), 0);
  const hasTarget = expenseAccounts.some((a) => a.targetAmount != null);

  const spentSoFar = transactions
    .filter((t) => t.type === 'debit' && t.bankAccountId && expenseAccountIds.has(t.bankAccountId) && t.occurredAt >= cycle.start && t.occurredAt < cycle.end && t.occurredAt <= referenceDate)
    .reduce((sum, t) => sum + t.amount, 0);

  const remaining = budgetTarget - spentSoFar;
  const daysRemaining = Math.max(1, Math.ceil(daysBetween(referenceDate, cycle.end)));

  return {
    budgetTarget,
    spentSoFar,
    remaining,
    daysRemaining,
    safeToSpendToday: hasTarget ? remaining / daysRemaining : null,
    isOverBudget: hasTarget && remaining < 0,
  };
}

export interface ProjectedCycleTotal {
  spentSoFar: number;
  projectedTotal: number;
}

// Deliberately simple linear burn-rate extrapolation — not recurring-transaction-aware.
export function computeProjectedCycleTotal(
  transactions: AnalyticsTransaction[],
  bankAccounts: AnalyticsBankAccount[],
  cycle: PayCycle,
  referenceDate: Date = new Date()
): ProjectedCycleTotal {
  const expenseAccountIds = new Set(bankAccounts.filter((a) => a.purpose === 'monthly_expense').map((a) => a._id));

  const spentSoFar = transactions
    .filter((t) => t.type === 'debit' && t.bankAccountId && expenseAccountIds.has(t.bankAccountId) && t.occurredAt >= cycle.start && t.occurredAt < cycle.end && t.occurredAt <= referenceDate)
    .reduce((sum, t) => sum + t.amount, 0);

  const daysElapsed = Math.max(1, daysBetween(cycle.start, referenceDate));
  const totalCycleDays = Math.max(1, daysBetween(cycle.start, cycle.end));

  return { spentSoFar, projectedTotal: (spentSoFar / daysElapsed) * totalCycleDays };
}

export interface CategoryTrendEntry {
  category: string;
  currentTotal: number;
  previousTotal: number;
  percentChange: number | null; // null (shown as "New") when previousTotal is 0
}

export function computeCategoryTrend(
  transactions: AnalyticsTransaction[],
  currentCycle: PayCycle,
  previousCycle: PayCycle | null
): CategoryTrendEntry[] {
  const sumByCategory = (start: Date, end: Date) => {
    const map = new Map<string, number>();
    for (const t of transactions) {
      if (t.type !== 'debit' || t.occurredAt < start || t.occurredAt >= end) continue;
      const cat = t.category || 'Uncategorized';
      map.set(cat, (map.get(cat) || 0) + t.amount);
    }
    return map;
  };

  const current = sumByCategory(currentCycle.start, currentCycle.end);
  const previous = previousCycle ? sumByCategory(previousCycle.start, previousCycle.end) : new Map<string, number>();
  const categories = new Set([...current.keys(), ...previous.keys()]);

  return Array.from(categories)
    .map((category) => {
      const currentTotal = current.get(category) || 0;
      const previousTotal = previous.get(category) || 0;
      return {
        category,
        currentTotal,
        previousTotal,
        percentChange: previousTotal === 0 ? null : ((currentTotal - previousTotal) / previousTotal) * 100,
      };
    })
    .sort((a, b) => b.currentTotal - a.currentTotal);
}

export interface EnvelopeProgress {
  accountId: string;
  amount: number; // contributed (savings) or spent (everything else), up to referenceDate
  target: number | null;
}

// Savings envelopes track money moving IN (contributions toward the goal); every other
// purpose tracks money moving OUT (spend against the target) — both up to referenceDate
// so a past, fully-elapsed cycle and the in-progress current cycle are handled the same way.
export function computeEnvelopeProgress(
  transactions: AnalyticsTransaction[],
  account: AnalyticsBankAccount,
  cycle: PayCycle,
  referenceDate: Date
): EnvelopeProgress {
  const relevantType = account.purpose === 'savings' ? 'credit' : 'debit';
  const amount = transactions
    .filter((t) => t.type === relevantType && t.bankAccountId === account._id && t.occurredAt >= cycle.start && t.occurredAt < cycle.end && t.occurredAt <= referenceDate)
    .reduce((sum, t) => sum + t.amount, 0);

  return { accountId: account._id, amount, target: account.targetAmount };
}

export interface RecurringTransaction {
  counterparty: string;
  averageAmount: number;
  occurrences: number;
  cadenceDays: number;
  lastDate: Date;
  predictedNextDate: Date;
}

function normalizeCounterparty(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Groups debits by normalized counterparty, clusters by amount similarity within each
// group, and flags clusters with >=2 occurrences at a roughly consistent (7/14/30-day-ish)
// cadence as recurring — catches rent, subscriptions, and similar regular payments.
export function detectRecurringTransactions(transactions: AnalyticsTransaction[]): RecurringTransaction[] {
  const groups = new Map<string, AnalyticsTransaction[]>();
  for (const t of transactions) {
    if (t.type !== 'debit' || !t.counterparty) continue;
    const key = normalizeCounterparty(t.counterparty);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  const results: RecurringTransaction[] = [];

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

    const clusters: AnalyticsTransaction[][] = [];
    for (const t of sorted) {
      const cluster = clusters.find((c) => {
        const avg = c.reduce((sum, item) => sum + item.amount, 0) / c.length;
        const tolerance = Math.max(avg * 0.1, 50);
        return Math.abs(t.amount - avg) <= tolerance;
      });
      if (cluster) {
        cluster.push(t);
      } else {
        clusters.push([t]);
      }
    }

    for (const cluster of clusters) {
      if (cluster.length < 2) continue;

      const gaps: number[] = [];
      for (let i = 1; i < cluster.length; i++) {
        gaps.push(daysBetween(cluster[i - 1].occurredAt, cluster[i].occurredAt));
      }
      const avgGap = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;
      const consistentGaps = gaps.every((g) => Math.abs(g - avgGap) <= Math.max(avgGap * 0.2, 3));
      const nearStandardCadence = [7, 14, 30].some((c) => Math.abs(avgGap - c) <= c * 0.25);

      if (consistentGaps && nearStandardCadence) {
        const last = cluster[cluster.length - 1];
        results.push({
          counterparty: last.counterparty,
          averageAmount: cluster.reduce((sum, c) => sum + c.amount, 0) / cluster.length,
          occurrences: cluster.length,
          cadenceDays: Math.round(avgGap),
          lastDate: last.occurredAt,
          predictedNextDate: addDays(last.occurredAt, Math.round(avgGap)),
        });
      }
    }
  }

  return results.sort((a, b) => b.occurrences - a.occurrences);
}
