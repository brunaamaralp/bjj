import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertSingleActiveEntrada,
  findInflatedCancelPairs,
  findOrphanReversals,
  getReversesId,
  linkedReversalIdsForOriginal,
  planValueCorrection,
  validateReversalLink,
} from '../../../lib/server/financeTxReversalIntegrity.js';

const mirrorCancelMocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
  updateDocument: vi.fn(),
  listDocuments: vi.fn(),
}));

vi.mock('node-appwrite', () => ({
  Query: {
    equal: (key, value) => ({ op: 'equal', key, value }),
    limit: (value) => ({ op: 'limit', value }),
  },
}));

vi.mock('../../../lib/server/academyAccess.js', () => ({
  DB_ID: 'db-test',
  databases: mirrorCancelMocks,
}));

function tx(overrides = {}) {
  return {
    $id: 'tx-default',
    status: 'settled',
    type: 'plan',
    category: 'Mensalidades',
    direction: 'in',
    gross: 100,
    fee: 0,
    net: 100,
    competence_month: '2026-06',
    lead_id: 'lead-1',
    ...overrides,
  };
}

function reversal(overrides = {}) {
  return tx({
    $id: 'tx-rev',
    type: 'refund',
    category: 'Cancelamentos',
    direction: 'out',
    origin_type: 'reversal',
    origin_id: 'tx-orig',
    planName: 'Estorno',
    ...overrides,
  });
}

describe('financeTxReversalIntegrity', () => {
  describe('corrigir_valor_nao_duplica', () => {
    it('corrigir valor de mensalidade liquidada deve editar in-place, não duplicar', () => {
      const existing = tx({ $id: 'tx-mensal', gross: 320.59, net: 320.59 });
      const plan = planValueCorrection({ existingTx: existing, newGross: 319 });
      expect(plan.mode).toBe('edit');
      expect(plan.patch.gross).toBe(319);

      const after = [
        { ...existing, ...plan.patch },
      ];
      const check = assertSingleActiveEntrada(after, {
        competenceMonth: '2026-06',
        leadId: 'lead-1',
        expectedGross: 319,
      });
      expect(check.ok).toBe(true);
    });

    it('rejeita estado Pedro Melo: entrada certa + entrada errada + estorno', () => {
      const pedro = [
        tx({ $id: 'tx-ok', gross: 319, net: 319, planName: 'Mensalidade 2026-06' }),
        tx({ $id: 'tx-wrong', gross: 320.59, net: 320.59, planName: 'Mensalidade 2026-06' }),
        reversal({
          $id: 'tx-estorno',
          origin_id: 'tx-wrong',
          gross: 320.59,
          net: 320.59,
          planName: 'Estorno',
        }),
      ];

      const check = assertSingleActiveEntrada(pedro, {
        competenceMonth: '2026-06',
        leadId: 'lead-1',
        expectedGross: 319,
      });
      expect(check.ok).toBe(false);
      expect(check.settledCount).toBe(2);
      expect(findInflatedCancelPairs(pedro).length).toBe(1);
    });
  });

  describe('estorno_tem_vinculo', () => {
    it('estorno canônico tem reverses_id via origin_id', () => {
      const rev = reversal({ origin_id: 'abc123' });
      expect(getReversesId(rev)).toBe('abc123');
    });

    it('estorno de salesUpdateItem sem vínculo falha validação', () => {
      const orphanRefund = tx({
        $id: 'tx-refund-sale',
        type: 'refund',
        category: 'Cancelamentos',
        direction: 'out',
        gross: 280.4,
        saleId: 'sale-heitor',
        note: 'Estorno parcial troca produto',
      });
      const byId = new Map([[tx({ $id: 'tx-orig' }).$id, tx({ $id: 'tx-orig' })]]);
      expect(validateReversalLink(orphanRefund, byId)).toBe('reversal_missing_reverses_id');
    });

    it('todo estorno criado por reverseSettledFinanceTx deve ter vínculo', () => {
      const orig = tx({ $id: 'tx-orig-1', gross: 239 });
      const rev = reversal({ $id: 'tx-rev-1', origin_id: 'tx-orig-1', gross: 239 });
      const byId = new Map([[orig.$id, { ...orig, status: 'cancelled' }]]);
      expect(validateReversalLink(rev, byId)).toBe('');
      expect(getReversesId(rev)).toBe('tx-orig-1');
    });
  });

  describe('apagar_entrada_remove_estorno', () => {
    it('cancelar entrada deve cascatear para estornos vinculados', () => {
      const origId = 'tx-orig-del';
      const txs = [
        tx({ $id: origId, gross: 729.8 }),
        reversal({ $id: 'tx-rev-linked', origin_id: origId, gross: 734.8 }),
      ];
      const linked = linkedReversalIdsForOriginal(origId, txs);
      expect(linked).toEqual(['tx-rev-linked']);

      const afterCascade = txs.map((t) =>
        linked.includes(t.$id) || t.$id === origId ? { ...t, status: 'cancelled' } : t
      );
      expect(findOrphanReversals(afterCascade)).toHaveLength(0);
    });

    it('detecta estorno órfão quando entrada foi cancelada mas estorno ficou ativo', () => {
      const txs = [
        tx({ $id: 'tx-gone', status: 'cancelled', gross: 239 }),
        reversal({
          $id: 'tx-orphan',
          origin_id: 'tx-gone',
          gross: 280.4,
          planName: 'Estorno',
        }),
      ];
      const orphans = findOrphanReversals(txs);
      expect(orphans).toHaveLength(0);

      const txsMissingOrig = [
        reversal({ $id: 'tx-orphan', origin_id: 'tx-deleted', gross: 280.4 }),
        tx({ $id: 'tx-good', gross: 239 }),
      ];
      expect(findOrphanReversals(txsMissingOrig)).toHaveLength(1);
      expect(findOrphanReversals(txsMissingOrig)[0].reason).toBe('reversal_orphan_original_missing');
    });
  });

  describe('reproduz_casos_junho', () => {
    it('Pedro Melo — dupla cobrança + estorno infla bruto', () => {
      const txs = [
        tx({ $id: 'pedro-ok', gross: 319, planName: 'Mensalidade 2026-06' }),
        tx({ $id: 'pedro-wrong', gross: 320.59, planName: 'Mensalidade 2026-06' }),
        reversal({
          $id: 'pedro-rev',
          origin_id: 'pedro-wrong',
          gross: 320.59,
        }),
      ];
      const pairs = findInflatedCancelPairs(txs);
      expect(pairs.length).toBe(1);
      expect(
        assertSingleActiveEntrada(txs, {
          competenceMonth: '2026-06',
          expectedGross: 319,
        }).ok
      ).toBe(false);
    });

    it('Heitor kimono — estorno órfão sem entrada correspondente', () => {
      const txs = [
        tx({
          $id: 'heitor-ok',
          gross: 239,
          saleId: 'sale-kimono',
          type: 'product_sale',
          category: 'Venda de produtos',
        }),
        reversal({
          $id: 'heitor-orphan',
          origin_id: 'heitor-deleted-wrong',
          gross: 280.4,
          saleId: 'sale-kimono',
        }),
      ];
      const orphans = findOrphanReversals(txs);
      expect(orphans).toHaveLength(1);
      expect(orphans[0].tx.$id).toBe('heitor-orphan');
    });

    it('fluxo corrigido não reproduz nenhum dos três padrões junho', () => {
      const fixed = [
        tx({ $id: 'only-one', gross: 319, planName: 'Mensalidade 2026-06' }),
      ];
      expect(
        assertSingleActiveEntrada(fixed, {
          competenceMonth: '2026-06',
          expectedGross: 319,
        }).ok
      ).toBe(true);
      expect(findOrphanReversals(fixed)).toHaveLength(0);
      expect(findInflatedCancelPairs(fixed)).toHaveLength(0);
    });

    it('Kimono — estorno parcial maior que entrada correta distorce líquido', () => {
      const txs = [
        tx({ $id: 'kimono-ok', gross: 729.8, saleId: 'sale-2' }),
        reversal({
          $id: 'kimono-orphan',
          origin_id: 'missing-wrong-entry',
          gross: 734.8,
          saleId: 'sale-2',
        }),
      ];
      const orphans = findOrphanReversals(txs);
      expect(orphans).toHaveLength(1);
      const netIn = txs
        .filter((t) => t.direction === 'in' && t.status === 'settled')
        .reduce((s, t) => s + t.gross, 0);
      const netOut = txs
        .filter((t) => t.direction === 'out' && t.status === 'settled')
        .reduce((s, t) => s + t.gross, 0);
      expect(round(netIn - netOut)).toBeLessThan(0);
    });
  });
});

function round(n) {
  return Math.round(Number(n) * 100) / 100;
}

describe('handler contracts (Fase 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APPWRITE_FINANCIAL_TX_COLLECTION_ID = 'financial-tx-col';
    mirrorCancelMocks.listDocuments.mockImplementation(async (_db, _col, queries) => {
      const q = JSON.stringify(queries || []);
      if (q.includes('student_payment_troco')) return { documents: [] };
      if (q.includes('student_payment')) {
        return { documents: [{ $id: 'tx-main', status: 'settled' }] };
      }
      if (q.includes('reversal')) {
        return { documents: [{ $id: 'tx-rev', status: 'settled', origin_type: 'reversal', origin_id: 'tx-main' }] };
      }
      return { documents: [] };
    });
    mirrorCancelMocks.getDocument.mockImplementation(async (_db, _col, id) => ({
      $id: id,
      status: 'settled',
      origin_type: id === 'tx-rev' ? 'reversal' : 'student_payment',
      origin_id: id === 'tx-rev' ? 'tx-main' : 'pay-1',
    }));
    mirrorCancelMocks.updateDocument.mockResolvedValue({});
  });

  it('cancelFinancialTxMirrorsForPayment também cancela estornos vinculados à entrada', async () => {
    const { cancelFinancialTxMirrorsForPayment } = await import(
      '../../../lib/server/studentPaymentMirrorCancel.js'
    );

    await cancelFinancialTxMirrorsForPayment('pay-1', { explicitTxId: 'tx-main' });

    const updatedIds = mirrorCancelMocks.updateDocument.mock.calls.map((c) => c[2]);
    expect(updatedIds).toContain('tx-rev');
  });

  it('payload de estorno parcial em venda inclui reverses_id', async () => {
    const { buildSaleDeltaRefundPayload } = await import(
      '../../../lib/server/financeTxReversalIntegrity.js'
    );

    const payload = buildSaleDeltaRefundPayload({
      academyId: 'acad-1',
      vendaId: 'sale-1',
      originalTxId: 'tx-orig-sale',
      refundAmount: 41.4,
      method: 'pix',
      competenceMonth: '2026-06',
    });
    expect(getReversesId(payload)).toBe('tx-orig-sale');
    expect(payload.origin_type).toBe('reversal');
  });
});
