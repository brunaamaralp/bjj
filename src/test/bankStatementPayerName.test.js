import { describe, expect, it } from 'vitest';
import {
  extractPayerNameFromDescription,
  scorePayerNameMatch,
} from '../../lib/server/bankStatementPayerName.js';

describe('bankStatementPayerName', () => {
  it('extrai nome após prefixo PIX', () => {
    const r = extractPayerNameFromDescription('PIX RECEBIDO - JOSE SANTOS');
    expect(r?.normalized).toBe('JOSE SANTOS');
    expect(r?.display).toBe('Jose Santos');
  });

  it('retorna null para ruído', () => {
    expect(extractPayerNameFromDescription('123')).toBeNull();
    expect(extractPayerNameFromDescription('')).toBeNull();
  });

  it('score maior para alias conhecido', () => {
    const ctx = {
      lead_name: 'Pedro Santos',
      responsavel: 'Ana Santos',
      payer_aliases: [{ display: 'Jose Santos', normalized: 'JOSE SANTOS', source: 'learned' }],
    };
    const aliasScore = scorePayerNameMatch('PIX JOSE SANTOS', ctx);
    const leadScore = scorePayerNameMatch('PIX PEDRO SANTOS', ctx);
    expect(aliasScore).toBeGreaterThan(leadScore);
    expect(aliasScore).toBe(35);
  });
});
