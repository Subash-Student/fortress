import { BankParser, ParsedTransaction, toAmount } from '../types';

// "Dear UPI user A/C X0407 debited by 103.90 on date 14Jul26 trf to GRACE SUPER MARK Refno 619519547255 ..."
const DEBIT = /A\/C X\d+ debited by\s*([\d,]*\.?\d+)\s+on date\s+\w+\s+trf to\s+(.+?)\s+Refno\s+(\d+)/i;

// "Dear SBI User, your A/c X0407-credited by Rs.1 on 05Apr26 transfer from BROKENTUSK TECHNOLOGIES PVT LTD Ref No 609599882196 -SBI"
const CREDIT = /A\/c X\d+-credited by Rs\.?\s*([\d,]*\.?\d+)\s+on\s+\w+\s+transfer from\s+(.+?)\s+Ref No\s+(\d+)/i;

function parse(text: string, receivedAt: Date): ParsedTransaction | null {
  let match = text.match(DEBIT);
  if (match) {
    return {
      amount: toAmount(match[1]),
      type: 'debit',
      counterparty: match[2].trim(),
      occurredAt: receivedAt,
      bankHint: 'SBI',
    };
  }

  match = text.match(CREDIT);
  if (match) {
    return {
      amount: toAmount(match[1]),
      type: 'credit',
      counterparty: match[2].trim(),
      occurredAt: receivedAt,
      bankHint: 'SBI',
    };
  }

  return null;
}

export const sbiParser: BankParser = {
  bankHint: 'SBI',
  test: (text: string) => /\bSBI\b/i.test(text),
  parse,
};
