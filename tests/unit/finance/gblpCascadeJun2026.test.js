/**
 * Validação GBLP jun/2026 — requer fixture gerada com:
 *   node --env-file=.env.local scripts/snapshot-cascade-gblp.mjs
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeCashFlowCascade } from '../../../src/lib/computeCashFlowCascade.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, 'gblp-cascade-jun2026.fixture.json');

const EXPECTED = {
  variacao_saldo: -3773.01,
  resultado_operacional: 2114.92,
  resultado_final: -1549.34,
};

function loadFixture() {
  if (!fs.existsSync(FIXTURE_PATH)) return null;
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf-8'));
}

describe('GBLP cascata jun/2026', () => {
  const fixture = loadFixture();
  const strict = process.env.GBLP_CASCADE_STRICT === '1';
  const run = fixture && strict ? it : it.skip;

  run('bate totais de referência com fixture exportada', () => {
    const period = { from: '2026-06-01', to: '2026-06-30' };
    const statement = computeCashFlowCascade(
      period,
      fixture.txs,
      fixture.accounts || null,
      fixture.bankBalances || null
    );

    expect(statement.cascadeData.resultado_operacional).toBe(EXPECTED.resultado_operacional);
    expect(statement.cascadeData.resultado_final).toBe(EXPECTED.resultado_final);
    expect(statement.bankReconciliation.variacaoSaldo).toBe(EXPECTED.variacao_saldo);
    expect(statement.bankReconciliation.matches).toBe(true);
  });
});
