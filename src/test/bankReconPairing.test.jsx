import { describe, expect, it } from 'vitest';
import { formatSourceLabel } from '../components/finance/BankReconOrphanList.jsx';

describe('BankReconOrphanList formatSourceLabel', () => {
  it('maps known formats', () => {
    expect(formatSourceLabel('ofx')).toBe('OFX');
    expect(formatSourceLabel('xlsx')).toBe('Excel');
    expect(formatSourceLabel('pdf')).toBe('PDF');
    expect(formatSourceLabel('')).toBe('—');
  });
});
