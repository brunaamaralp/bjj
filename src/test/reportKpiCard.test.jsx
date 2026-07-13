import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import ReportKpiCard from '../components/reports/shared/ReportKpiCard.jsx';

describe('ReportKpiCard', () => {
  it('despesas: trend negativo com direction lower renderiza is-good', () => {
    const { container } = render(
      <ReportKpiCard label="Despesas" value="R$ 80" trend={-20} trendDirection="lower" />
    );

    expect(screen.getByText('-20%')).toBeInTheDocument();
    expect(container.querySelector('.report-kpi-card__trend.is-good')).toBeTruthy();
  });

  it('recebido: trend negativo com direction higher renderiza is-bad', () => {
    const { container } = render(
      <ReportKpiCard label="Recebido" value="R$ 80" trend={-20} trendDirection="higher" />
    );

    expect(container.querySelector('.report-kpi-card__trend.is-bad')).toBeTruthy();
  });

  it('sem trendDirection mantém is-up/is-down legado', () => {
    const { container } = render(
      <ReportKpiCard label="Leads" value="12" trend={-5} />
    );

    expect(container.querySelector('.report-kpi-card__trend.is-down')).toBeTruthy();
    expect(container.querySelector('.report-kpi-card__trend.is-good')).toBeNull();
  });

  it('labelVariant sentence aplica classe sem uppercase', () => {
    const { container } = render(
      <ReportKpiCard
        label="A receber (jul. de 26)"
        labelVariant="sentence"
        value="R$ 500"
      />
    );

    expect(container.querySelector('.report-kpi-card__label--sentence')).toBeTruthy();
    expect(screen.getByText(/A receber \(jul\. de 26\)/i)).toBeInTheDocument();
  });
});
