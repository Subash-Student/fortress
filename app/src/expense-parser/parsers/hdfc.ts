import { BankParser, ParsedTransaction, toAmount } from '../types';

// "Sent Rs.204.25\nFrom HDFC Bank A/C *4352\nTo GRACE SUPER MARKET\nOn 21/07/26\nRef 126653005553\n..."
const SENT = /Sent\s+Rs\.?\s*([\d,]*\.?\d+)\s+From\s+HDFC Bank A\/C \*\d+\s+To\s+(.+?)\s+On\s+\d{2}\/\d{2}\/\d{2}\s+Ref\s+(\d+)/i;

// No confirmed sample yet for an HDFC credit ("Received Rs...") SMS shape, so credits
// via HDFC currently fall through unmatched into the review queue until one is supplied.

function parse(text: string, receivedAt: Date): ParsedTransaction | null {
  const match = text.match(SENT);
  if (match) {
    return {
      amount: toAmount(match[1]),
      type: 'debit',
      counterparty: match[2].trim(),
      occurredAt: receivedAt,
      bankHint: 'HDFC Bank',
    };
  }

  return null;
}

export const hdfcParser: BankParser = {
  bankHint: 'HDFC Bank',
  test: (text: string) => /HDFC Bank/i.test(text),
  parse,
};
