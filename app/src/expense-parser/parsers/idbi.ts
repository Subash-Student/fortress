import { BankParser, ParsedTransaction, toAmount } from '../types';

// IDBI Bank sends several distinct SMS shapes for what is functionally the same
// UPI debit/credit event, plus purely informational messages (MAB notices) that
// aren't transactions at all and should fall through unmatched.

// "IDBI Bank Acct XX373 debited for Rs 70.00 on 24-Jun-26; Bal Rs 530.32 LAYAM CAFE credited. UPI:125231703818. ..."
const DEBIT_WITH_PAYEE = /IDBI Bank Acct XX\d+ debited for Rs\s*([\d,]*\.?\d+)\s+on\s+[\w-]+;\s*Bal Rs\s*([\d,]*\.?\d+)\s+(.+?)\s+credited\.\s*UPI:(\d+)/i;

// "Dear Customer, Acct XX373 is credited with Rs 320.00 on 20-Aug-26 from SIRAJUDEEN. UPI:211302799792 Avl Bal Rs 1635.04-IDBI Bank"
const CREDIT_WITH_PAYER = /Acct XX\d+ is credited with Rs\s*([\d,]*\.?\d+)\s+on\s+[\w-]+\s+from\s+(.+?)\.\s*UPI:(\d+)\s+Avl Bal Rs\s*([\d,]*\.?\d+)/i;

// "IDBI Bank A/c NN49373 credited for INR 1190.00 thru UPI. Bal INR 1309.36 ..."
const CREDIT_GENERIC = /IDBI Bank A\/c \w+ credited for INR\s*([\d,]*\.?\d+)\s+thru UPI\.\s*Bal INR\s*([\d,]*\.?\d+)/i;

// "IDBI Bank A/C NN49373 debited INR. .47 Det:MAB_CHARGE_MAY-2026. Bal (incl. of chq in clg) INR. 175.04 ..."
const FEE_DEBIT = /IDBI Bank A\/C \w+ debited INR\.?\s*([\d,]*\.?\d+)\s+Det:([\w-]+)\.\s*Bal.*?INR\.?\s*([\d,]*\.?\d+)/i;

function parse(text: string, receivedAt: Date): ParsedTransaction | null {
  let match = text.match(DEBIT_WITH_PAYEE);
  if (match) {
    return {
      amount: toAmount(match[1]),
      type: 'debit',
      counterparty: match[3].trim(),
      occurredAt: receivedAt,
      bankHint: 'IDBI Bank',
      availableBalance: toAmount(match[2]),
    };
  }

  match = text.match(CREDIT_WITH_PAYER);
  if (match) {
    return {
      amount: toAmount(match[1]),
      type: 'credit',
      counterparty: match[2].trim(),
      occurredAt: receivedAt,
      bankHint: 'IDBI Bank',
      availableBalance: toAmount(match[4]),
    };
  }

  match = text.match(CREDIT_GENERIC);
  if (match) {
    return {
      amount: toAmount(match[1]),
      type: 'credit',
      counterparty: 'UPI Credit',
      occurredAt: receivedAt,
      bankHint: 'IDBI Bank',
      availableBalance: toAmount(match[2]),
    };
  }

  match = text.match(FEE_DEBIT);
  if (match) {
    return {
      amount: toAmount(match[1]),
      type: 'debit',
      counterparty: `IDBI Bank Charge (${match[2]})`,
      occurredAt: receivedAt,
      bankHint: 'IDBI Bank',
      availableBalance: toAmount(match[3]),
    };
  }

  return null;
}

export const idbiParser: BankParser = {
  bankHint: 'IDBI Bank',
  test: (text: string) => /IDBI Bank/i.test(text),
  parse,
};
