export interface ParsedTransaction {
  amount: number;
  type: 'debit' | 'credit';
  counterparty: string;
  occurredAt: Date;
  bankHint: string;
  availableBalance?: number;
}

export interface BankParser {
  bankHint: string;
  test: (text: string) => boolean;
  parse: (text: string, receivedAt: Date) => ParsedTransaction | null;
}

export function toAmount(raw: string): number {
  return parseFloat(raw.replace(/,/g, ''));
}
