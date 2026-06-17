import { describe, expect, it } from 'vitest';
import {
  buildMirrorPlanName,
  formatCompetenceMonthShort,
  formatReconTxSelectLabel,
  formatReconTxShortTitle,
} from '../lib/financeReconTxLabel.js';

describe('financeReconTxLabel', () => {
  it('formatCompetenceMonthShort', () => {
    expect(formatCompetenceMonthShort('2026-06')).toBe('Jun/2026');
    expect(formatCompetenceMonthShort('')).toBe('');
  });

  it('buildMirrorPlanName combina aluno e plano', () => {
    expect(buildMirrorPlanName({ studentName: 'Pedro Santos', planName: 'Plano Kids' })).toBe(
      'Pedro Santos — Plano Kids'
    );
  });

  it('buildMirrorPlanName fallback sem aluno', () => {
    expect(buildMirrorPlanName({ planName: 'Mensal', refMonth: '2026-06' })).toBe('Mensal');
    expect(buildMirrorPlanName({ refMonth: '2026-06' })).toBe('Mensalidade 2026-06');
  });

  it('formatReconTxShortTitle inclui lead_name e competência', () => {
    const title = formatReconTxShortTitle({
      lead_name: 'Pedro Santos',
      planName: 'Plano Kids',
      competence_month: '2026-06',
    });
    expect(title).toBe('Pedro Santos — Plano Kids — Jun/2026');
  });

  it('formatReconTxShortTitle não duplica nome já no planName', () => {
    const title = formatReconTxShortTitle({
      lead_name: 'Pedro Santos',
      planName: 'Pedro Santos — Plano Kids',
      competence_month: '2026-06',
    });
    expect(title).toBe('Pedro Santos — Plano Kids — Jun/2026');
  });

  it('formatReconTxShortTitle usa Mensalidade — aluno quando categoria é genérica', () => {
    const title = formatReconTxShortTitle({
      lead_name: 'Ana Lima',
      category: 'Mensalidades',
      type: 'plan',
      competence_month: '2026-01',
    });
    expect(title).toBe('Mensalidade — Ana Lima — Jan/2026');
  });

  it('formatReconTxSelectLabel inclui data e valor', () => {
    const label = formatReconTxSelectLabel(
      {
        lead_name: 'Ana Lima',
        planName: 'Intermediário',
        competence_month: '2026-01',
        settledAt: '2026-01-15',
        gross: 200,
      },
      {
        formatDate: () => '15/01/2026',
        formatMoney: () => 'R$ 200,00',
      }
    );
    expect(label).toBe('15/01/2026 — R$ 200,00 — Ana Lima — Intermediário — Jan/2026');
  });
});
