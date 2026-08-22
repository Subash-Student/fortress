import { BankParser, ParsedTransaction } from './types';
import { idbiParser } from './parsers/idbi';
import { hdfcParser } from './parsers/hdfc';
import { sbiParser } from './parsers/sbi';

const PARSERS: BankParser[] = [idbiParser, hdfcParser, sbiParser];

export function parseMessage(text: string, receivedAt: Date): ParsedTransaction | null {
  for (const parser of PARSERS) {
    if (parser.test(text)) {
      const result = parser.parse(text, receivedAt);
      if (result) return result;
    }
  }
  return null;
}

export type { ParsedTransaction } from './types';
