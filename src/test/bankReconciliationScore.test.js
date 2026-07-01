import { describe, expect, it } from 'vitest';
import {
  BANK_MATCH_SUGGEST_SCORE,
  scoreBankItemToTxBase,
  composeBankMatchScore,
  resolveBankMatchSuggestion,
  reconciliationDaysBetween,
} from '../lib/bankReconciliationScore.js';
import { scoreBankItemToTxDetailed } from '../../lib/server/bankReconciliationMatcher.js';
import { matchReconciliationItem, buildReconciliationIndex } from '../lib/bankReconciliationClientMatcher.js';

function fakeTx(overrides = {}) {
  return {
    id: 'tx1',
    gross: 100,
    net: 100,
    type: 'plan',
    direction: 'in',
    status: 'settled',
    settledAt: '2025-06-01',
    bankAccount: 'Sicoob',
    reconciled: false,
    ...overrides,
  };
}

function fakeItem(overrides = {}) {
  return {
    date: '2025-06-01',
    amount: 100,
    direction: 'credit',
    bank_account: 'Sicoob',
    ...overrides,
  };
}

describe('bankReconciliationScore — módulo unificado', () => {
  it('mesmo valor e mesmo dia → score 100', () => {
    expect(scoreBankItemToTxBase(fakeItem(), fakeTx())).toBe(100);
  });

  it('1 dia de diferença → score 85', () => {
    expect(
      scoreBankItemToTxBase(
        fakeItem({ date: '2025-06-02' }),
        fakeTx({ settledAt: '2025-06-01' })
      )
    ).toBe(85);
  });

  it('3 dias de diferença → score 70', () => {
    expect(
      scoreBankItemToTxBase(
        fakeItem({ date: '2025-06-04' }),
        fakeTx({ settledAt: '2025-06-01' })
      )
    ).toBe(70);
  });

  it('4 dias de diferença → score 0 (limite BANK_MATCH_MAX_DATE_DAYS=3)', () => {
    expect(
      scoreBankItemToTxBase(
        fakeItem({ date: '2025-06-05' }),
        fakeTx({ settledAt: '2025-06-01' })
      )
    ).toBe(0);
  });

  it('valor aproximado (5%) no mesmo dia → score 50', () => {
    expect(
      scoreBankItemToTxBase(
        fakeItem({ amount: 100 }),
        fakeTx({ gross: 104, net: 104 })
      )
    ).toBe(BANK_MATCH_SUGGEST_SCORE);
  });

  it('conta parcial limita score a 50 mesmo com valor+data perfeitos', () => {
    expect(
      scoreBankItemToTxBase(
        fakeItem({ bank_account: 'Sicoob' }),
        fakeTx({ bankAccount: '' })
      )
    ).toBe(BANK_MATCH_SUGGEST_SCORE);
  });
});

describe('bankReconciliationScore — paridade server vs client', () => {
  it('client matcher produz mesmo score base que server para par idêntico', () => {
    const item = {
      id: 'item-1',
      date: '2026-05-10',
      amount: 250,
      direction: 'credit',
      description: 'Pix João Silva',
      bank_account: 'Sicoob',
    };
    const tx = fakeTx({
      id: 'tx1',
      gross: 250,
      net: 250,
      settledAt: '2026-05-10',
      bankAccount: 'Sicoob',
    });

    const serverBase = scoreBankItemToTxBase(item, tx);
    const index = buildReconciliationIndex([tx]);
    const client = matchReconciliationItem(item, index);

    expect(serverBase).toBe(100);
    expect(client.displayMode).toBe('single');
    expect(client.candidates[0]?.score).toBe(100);
  });

  it('dois candidatos com mesmo rank_score → ambíguo (multi) em ambos os fluxos', () => {
    const item = {
      id: 'item-1',
      date: '2026-05-10',
      amount: 200,
      direction: 'credit',
      bank_account: 'Sicoob',
    };
    const txs = [
      fakeTx({ id: 'tx1', gross: 200, settledAt: '2026-05-10', lead_id: 'lead-a' }),
      fakeTx({ id: 'tx2', gross: 200, settledAt: '2026-05-10', lead_id: 'lead-b' }),
    ];

    const scored = txs.map((tx) => {
      const base = scoreBankItemToTxBase(item, tx);
      const composed = composeBankMatchScore(base);
      return { tx, ...composed };
    });
    const serverSuggestion = resolveBankMatchSuggestion(scored);
    expect(serverSuggestion.suggested_tx_id).toBeNull();
    expect(serverSuggestion.suggested_tx_candidates?.length).toBe(2);

    const client = matchReconciliationItem(item, buildReconciliationIndex(txs));
    expect(client.displayMode).toBe('multi');
    expect(client.suggestedTxId).toBeNull();
  });
});

describe('bankReconciliationScore — cenários de divergência legada (client ponderado 0–1)', () => {
  /**
   * Antes da unificação, o client aceitava até 5 dias com score parcial (0.6 em 2 dias).
   * O server zerava com dayDiff > 3. Após unificação, ambos seguem o server.
   */
  it('extrato 4 dias após liquidação: client antigo sugeriria; unificado não sugere', () => {
    const item = {
      id: 'item-1',
      date: '2026-05-14',
      amount: 100,
      direction: 'credit',
    };
    const tx = fakeTx({ gross: 100, settledAt: '2026-05-10' });
    expect(reconciliationDaysBetween(item.date, tx.settledAt)).toBe(4);
    expect(scoreBankItemToTxBase(item, tx)).toBe(0);

    const client = matchReconciliationItem(item, buildReconciliationIndex([tx]));
    expect(client.displayMode).toBe('none');
  });

  /**
   * Antes: Jaccard na descrição podia elevar score sem valor+data forte.
   * Unificado: descrição só entra via name_bonus no server (import), não no client.
   */
  it('descrição parecida sem valor exato: client antigo podia pontuar; unificado não', () => {
    const item = {
      id: 'item-1',
      date: '2026-05-10',
      amount: 150,
      direction: 'credit',
      description: 'Pix João Silva mensalidade',
    };
    const tx = fakeTx({
      gross: 100,
      settledAt: '2026-05-10',
      planName: 'Mensalidade João Silva',
    });
    expect(scoreBankItemToTxBase(item, tx)).toBe(0);
    const client = matchReconciliationItem(item, buildReconciliationIndex([tx]));
    expect(client.displayMode).toBe('none');
  });

  /**
   * Score unificado aceita aproximação 5% (score 50).
   * O índice client-side ainda pré-filtra por ±R$0,02 — pool não alterado nesta etapa.
   */
  it('valor 4% diferente no mesmo dia: score 50 no par direto; client index não acha candidato', () => {
    const item = {
      id: 'item-1',
      date: '2026-05-10',
      amount: 100,
      direction: 'credit',
    };
    const tx = fakeTx({ gross: 104, net: 104, settledAt: '2026-05-10' });
    expect(scoreBankItemToTxBase(item, tx)).toBe(50);

    const client = matchReconciliationItem(item, buildReconciliationIndex([tx]));
    expect(client.displayMode).toBe('none');
  });
});

describe('bankReconciliationScore — bônus de pagador permanece server-only', () => {
  it('server detailed pode elevar score com name_bonus; client base permanece sem bônus', () => {
    const item = fakeItem({ description: 'PIX RECEBIDO JOAO SILVA' });
    const tx = fakeTx({ lead_id: 'lead-1' });
    const payerContext = new Map([
      ['lead-1', { lead_name: 'João Silva', responsavel: '', payer_aliases: [] }],
    ]);

    const detailed = scoreBankItemToTxDetailed(item, tx, payerContext);
    expect(detailed.rank_score).toBeGreaterThan(100 - 1);

    const client = matchReconciliationItem(
      { id: 'i1', ...item },
      buildReconciliationIndex([tx])
    );
    expect(client.candidates[0]?.score).toBe(100);
    expect(client.candidates[0]?.score).toBeLessThan(detailed.rank_score);
  });
});
