import { describe, expect, it } from 'vitest';
import {
  normalizePayerName,
  parsePayerAliasesJson,
  appendPayerAlias,
  aliasExists,
  resolveStudentPayerDisplayName,
  PAYER_ALIAS_MAX,
} from '../lib/studentPayerAliases.js';

describe('studentPayerAliases', () => {
  it('normalizePayerName remove acentos e pontuação', () => {
    expect(normalizePayerName('José Santos-Filho')).toBe('JOSE SANTOS FILHO');
  });

  it('parsePayerAliasesJson tolera inválido', () => {
    expect(parsePayerAliasesJson(null)).toEqual([]);
    expect(parsePayerAliasesJson('not-json')).toEqual([]);
    expect(parsePayerAliasesJson('[{"display":"A","normalized":"A","source":"manual"}]')).toHaveLength(1);
  });

  it('appendPayerAlias dedupe por normalized', () => {
    const first = appendPayerAlias([], { display: 'Jose Santos', source: 'learned' });
    expect(first.added).toBe(true);
    const second = appendPayerAlias(first.aliases, { display: 'José Santos', source: 'manual' });
    expect(second.added).toBe(false);
    expect(second.aliases).toHaveLength(1);
    expect(second.aliases[0].source).toBe('manual');
  });

  it('limite de 10 aliases', () => {
    let aliases = [];
    for (let i = 0; i < PAYER_ALIAS_MAX; i++) {
      const r = appendPayerAlias(aliases, { display: `Pessoa ${i}`, source: 'manual' });
      aliases = r.aliases;
    }
    const overflow = appendPayerAlias(aliases, { display: 'Extra', source: 'manual' });
    expect(overflow.error).toBe('limit_reached');
    expect(overflow.aliases).toHaveLength(PAYER_ALIAS_MAX);
  });

  it('aliasExists', () => {
    const aliases = [{ display: 'Maria', normalized: 'MARIA', source: 'manual' }];
    expect(aliasExists(aliases, 'maria')).toBe(true);
    expect(aliasExists(aliases, 'joao')).toBe(false);
  });

  describe('resolveStudentPayerDisplayName', () => {
    it('prioriza o primeiro alias com display', () => {
      expect(
        resolveStudentPayerDisplayName({
          payerAliases: [
            { display: '  ', normalized: 'X' },
            { display: 'Pix Maria', normalized: 'PIX MARIA' },
          ],
          responsavel: 'Resp',
          parentName: 'Pai',
        })
      ).toBe('Pix Maria');
    });

    it('usa responsavel quando nao ha alias', () => {
      expect(
        resolveStudentPayerDisplayName({
          payerAliases: [],
          responsavel: '  Ana Mae  ',
          parentName: 'Outro',
        })
      ).toBe('Ana Mae');
    });

    it('usa parentName como terceiro fallback', () => {
      expect(
        resolveStudentPayerDisplayName({
          responsavel: '',
          parentName: 'Carlos Pai',
        })
      ).toBe('Carlos Pai');
    });

    it('retorna string vazia quando nao ha dados', () => {
      expect(resolveStudentPayerDisplayName({})).toBe('');
      expect(resolveStudentPayerDisplayName(null)).toBe('');
    });
  });
});
