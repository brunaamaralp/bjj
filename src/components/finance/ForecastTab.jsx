import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './finance.css';
import { Link } from 'react-router-dom';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Calendar, Clock, FileText, RefreshCw, Repeat, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { fetchFinanceForecast } from '../../lib/financeTxApi.js';
import {
  FORECAST_PERIOD_PRESETS,
  buildForecastChartRows,
  todayYmdLocal,
} from '../../lib/financeForecastCore.js';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import FinanceFiltersBar from './FinanceFiltersBar.jsx';
import FinanceTabShell from './FinanceTabShell.jsx';
import FinanceLabelWithHint from './FinanceLabelWithHint.jsx';
import { FINANCE_TERM_HINTS } from '../../lib/financeTermHints.js';
import { buildReceivablesSearchParams, RECEIVABLES_SECTIONS } from '../../lib/financeiroReceivablesSections.js';

const PRESETS = [
  { id: '30d', label: '30 dias' },
  { id: '4w', label: 'Próximas 4 semanas' },
  { id: '1m', label: 'Próximo mês', hint: '(mês civil seguinte)' },
  { id: '3m', label: 'Próximos 3 meses' },
];

const STATUS_LABELS = {
  projetado: 'Projetado',
  recorrente: 'Recorrente',
  esperado: 'Esperado',
  confirmado: 'Confirmado',
  awaiting: 'Aguardando',
  partial: 'Parcial',
};

function fmtMoney(v) {
  try {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } catch {
    return `R$ ${Number(v || 0).toFixed(2)}`;
  }
}

function fmtDateBr(ymd) {
  const p = String(ymd || '').slice(0, 10).split('-');
  if (p.length !== 3) return ymd || '—';
  return `${p[2]}/${p[1]}/${p[0]}`;
}

function TypeIcon({ type }) {
  if (type === 'mensalidade') return <Calendar size={14} aria-hidden />;
  if (type === 'recorrencia') return <Repeat size={14} aria-hidden />;
  if (type === 'contrato') return <FileText size={14} aria-hidden />;
  if (type === 'parcela' || type === 'liquidacao' || type === 'venda') return <Wallet size={14} aria-hidden />;
  return <Clock size={14} aria-hidden />;
}

export default function ForecastTab({ academyId }) {
  const [preset, setPreset] = useState('30d');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const range = useMemo(() => {
    const fn = FORECAST_PERIOD_PRESETS[preset] || FORECAST_PERIOD_PRESETS['30d'];
    return fn(todayYmdLocal());
  }, [preset]);

  const load = useCallback(
    async (refresh = false) => {
      if (!academyId) return;
      setLoading(true);
      setIsRefreshing(refresh);
      setError('');
      try {
        const body = await fetchFinanceForecast({
          academyId,
          from: range.from,
          to: range.to,
          refresh,
        });
        setData(body);
      } catch (e) {
        console.error(e);
        setError('Não foi possível carregar a previsão. Verifique a conexão e tente novamente.');
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [academyId, range.from, range.to]
  );

  useEffect(() => {
    void load(refreshToken > 0);
  }, [load, refreshToken]);

  useEffect(() => {
    const bump = () => setRefreshToken((t) => t + 1);
    window.addEventListener('navi-student-payment-updated', bump);
    window.addEventListener('navi-financial-tx-settled', bump);
    window.addEventListener('navi-finance-forecast-invalidate', bump);
    return () => {
      window.removeEventListener('navi-student-payment-updated', bump);
      window.removeEventListener('navi-financial-tx-settled', bump);
      window.removeEventListener('navi-finance-forecast-invalidate', bump);
    };
  }, []);

  const chartRows = useMemo(
    () => (data?.weeks ? buildForecastChartRows(data.weeks, data.opening_balance) : []),
    [data]
  );

  const summary = data?.summary || {};
  const inflowGross = Number(summary.expected_inflow_gross ?? summary.expected_inflow ?? 0);
  const inflowNet = Number(summary.expected_inflow ?? 0);
  const showNetInflow = Math.abs(inflowGross - inflowNet) >= 0.01;
  const projected = Number(data?.closing_balance ?? 0);
  const projectedPositive = projected >= 0;
  const cachedAtLabel = useMemo(() => {
    const raw = String(data?.cached_at || '').trim();
    if (!raw) return '';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }, [data?.cached_at]);
  const contentBusy = loading && Boolean(data);
  const openingBalanceHint =
    data?.opening_balance_source === 'bank'
      ? FINANCE_TERM_HINTS.saldoAtualBancario
      : FINANCE_TERM_HINTS.saldoAtualLedger;

  const statusLabel = (status) => {
    const raw = String(status || '').trim();
    if (!raw) return '—';
    return STATUS_LABELS[raw] || `${raw.charAt(0).toUpperCase()}${raw.slice(1)}`;
  };

  if (!academyId) return null;

  return (
    <FinanceTabShell panelClassName="finance-forecast">
      <FinanceFiltersBar className="finance-forecast-toolbar">
        <span className="text-small text-muted">Período:</span>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`finance-filter-pill${preset === p.id ? ' is-active' : ''}`}
            onClick={() => setPreset(p.id)}
            title={p.hint || undefined}
          >
            {p.label}
          </button>
        ))}
        <span className="text-xs text-muted finance-forecast-toolbar__meta">
          {isRefreshing ? 'Atualizando…' : cachedAtLabel ? `Atualizado às ${cachedAtLabel}` : '—'}
          <button
            type="button"
            className="btn-outline btn-sm navi-btn--toolbar"
            onClick={() => void load(true)}
            disabled={loading}
            aria-label="Atualizar previsão"
          >
            <RefreshCw size={14} className={loading ? 'navi-async-btn__spin' : ''} />
          </button>
        </span>
        {range.from && range.to ? (
          <span className="text-xs text-muted">
            {fmtDateBr(range.from)} — {fmtDateBr(range.to)}
          </span>
        ) : null}
      </FinanceFiltersBar>

      <p className="text-small text-muted finance-forecast__credit-hint">
        Datas de cartão e transferência consideram os dias para cair na conta configurados em{' '}
        <Link to="/empresa?tab=financeiro&section=formas-recebimento">Formas de recebimento</Link>.
      </p>

      {loading && !data ? <PageSkeleton variant="cards" rows={2} /> : null}
      {error ? (
        <ErrorBanner
          message="Não foi possível carregar a previsão. Verifique a conexão e tente novamente."
          onRetry={() => void load(true)}
          className="mb-3"
        />
      ) : null}

      {data ? (
        <div className={`finance-forecast-body${contentBusy ? ' finance-forecast-body--busy' : ''}`}>
          {contentBusy ? (
            <div className="text-small text-muted finance-forecast-refresh-overlay">
              <RefreshCw size={14} className="navi-async-btn__spin" />
              Atualizando…
            </div>
          ) : null}
          <div className="finance-forecast-body__content">
            <div className="finance-kpi-strip finance-forecast-summary">
              <div className="finance-kpi finance-kpi--hero">
                <p className="finance-kpi__label">
                  <FinanceLabelWithHint hint={openingBalanceHint}>
                    Saldo atual
                  </FinanceLabelWithHint>
                </p>
                <p className="finance-kpi__value">{fmtMoney(data.opening_balance)}</p>
              </div>
              <div className="finance-kpi">
                <p className="finance-kpi__label">
                  <FinanceLabelWithHint hint={FINANCE_TERM_HINTS.previsaoBrutoCliente}>
                    A receber do cliente
                  </FinanceLabelWithHint>
                </p>
                <p className="finance-kpi__value finance-value-positive">{fmtMoney(inflowGross)}</p>
              </div>
              {showNetInflow ? (
                <div className="finance-kpi">
                  <p className="finance-kpi__label">
                    <FinanceLabelWithHint hint={FINANCE_TERM_HINTS.previsaoLiquidoEstimado}>
                      Líquido estimado
                    </FinanceLabelWithHint>
                  </p>
                  <p className="finance-kpi__value finance-value-positive">{fmtMoney(inflowNet)}</p>
                </div>
              ) : null}
              <div className="finance-kpi">
                <p className="finance-kpi__label">Saídas previstas</p>
                <p className="finance-kpi__value finance-value-negative">{fmtMoney(summary.expected_outflow)}</p>
              </div>
              <div className="finance-kpi">
                <p className="finance-kpi__label">
                  <FinanceLabelWithHint hint={FINANCE_TERM_HINTS.projetado}>
                    Saldo projetado
                  </FinanceLabelWithHint>
                </p>
                <p
                  className={`finance-kpi__value ${
                    projectedPositive ? 'finance-value-positive' : 'finance-value-negative'
                  }`}
                >
                  {fmtMoney(projected)}
                </p>
              </div>
            </div>

            <div className="finance-card finance-forecast-chart-card mb-3">
              <h4 className="finance-tab__section-title finance-forecast-chart-title">Fluxo semanal</h4>
              {chartRows.length === 0 ? (
                <EmptyState
                  variant="embedded"
                  title="Nenhuma movimentação prevista no período"
                  description="Ajuste o período ou aguarde novos lançamentos e mensalidades em aberto."
                />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={chartRows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)" />
                    <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis
                      yAxisId="amount"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) =>
                        Number(v).toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
                      }
                    />
                    <YAxis yAxisId="balance" orientation="right" hide />
                    <Tooltip
                      formatter={(value, name) => {
                        const labels = {
                          inflow: 'A receber (bruto)',
                          outflow: 'Saídas',
                          balance: 'Saldo acumulado (líquido est.)',
                        };
                        return [fmtMoney(value), labels[name] || name];
                      }}
                      labelFormatter={(_, payload) => {
                        const p = payload?.[0]?.payload;
                        if (!p) return '';
                        return `${fmtDateBr(p.week_start)} — ${fmtDateBr(p.week_end)}`;
                      }}
                    />
                    <Bar
                      yAxisId="amount"
                      dataKey="inflow"
                      name="inflow"
                      fill="var(--finance-chart-inflow)"
                      radius={[3, 3, 0, 0]}
                      barSize={18}
                    />
                    <Bar
                      yAxisId="amount"
                      dataKey="outflow"
                      name="outflow"
                      fill="var(--finance-chart-outflow)"
                      radius={[3, 3, 0, 0]}
                      barSize={18}
                    />
                    <Line
                      yAxisId="balance"
                      type="monotone"
                      dataKey="balance"
                      name="balance"
                      stroke="var(--finance-chart-balance)"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
              <div className="flex gap-3 mt-2 text-xs text-muted finance-forecast-legend">
                <span>
                  <i className="finance-forecast-legend__swatch finance-forecast-legend__swatch--inflow" />
                  A receber do cliente (bruto)
                </span>
                <span>
                  <i className="finance-forecast-legend__swatch finance-forecast-legend__swatch--outflow" />
                  Saídas previstas
                </span>
                <span>
                  <i className="finance-forecast-legend__swatch finance-forecast-legend__swatch--balance" />
                  Saldo acumulado (líquido est.)
                </span>
              </div>
              <p className="text-xs text-muted mt-2 mb-0 finance-forecast-basis-note" role="note">
                {showNetInflow
                  ? `${FINANCE_TERM_HINTS.previsaoBrutoCliente} ${FINANCE_TERM_HINTS.previsaoLiquidoEstimado}`
                  : FINANCE_TERM_HINTS.previsaoMdrOpcional}
              </p>
            </div>

            <div className="finance-forecast-weeks">
              {(data.weeks || []).map((week) => (
                <div key={week.week_start} className="finance-card finance-forecast-week">
                  <div className="finance-forecast-week__head">
                    <div>
                      <p className="finance-tab__section-title finance-forecast-week__title">
                        {fmtDateBr(week.week_start)} — {fmtDateBr(week.week_end)}
                      </p>
                      <p className="text-xs text-muted finance-forecast-week__subtitle">
                        {week.items.length} item(ns)
                      </p>
                    </div>
                    <div className="text-small finance-forecast-week__totals">
                      <div>
                        <span className="finance-forecast-week__inflow">
                          +{fmtMoney(week.expected_inflow_gross ?? week.expected_inflow)}
                        </span>
                        {showNetInflow ? (
                          <>
                            {' '}
                            <span className="text-muted text-xs">
                              (líq. {fmtMoney(week.expected_inflow)})
                            </span>
                          </>
                        ) : null}
                        {' · '}
                        <span className="finance-forecast-week__outflow">-{fmtMoney(week.expected_outflow)}</span>
                      </div>
                      <strong
                        className={
                          week.net >= 0
                            ? 'finance-forecast-week__net--positive'
                            : 'finance-forecast-week__net--negative'
                        }
                      >
                        = {fmtMoney(week.net)}
                      </strong>
                    </div>
                  </div>
                  {week.items.length === 0 ? (
                    <EmptyState
                      variant="bare"
                      title="Sem movimentações previstas nesta semana"
                    />
                  ) : (
                    <ul className="finance-forecast-week__list">
                      {week.items.map((item, idx) => {
                        const itemGross =
                          item.flow === 'in' ? Number(item.amount_gross ?? item.amount) : null;
                        const itemNet = Number(item.amount ?? 0);
                        const showItemGross =
                          itemGross != null && Math.abs(itemGross - itemNet) >= 0.01;
                        return (
                        <li key={`${week.week_start}-${idx}`} className="finance-forecast-week__item">
                          <span className="finance-forecast-week__icon" aria-hidden>
                            <TypeIcon type={item.type} />
                          </span>
                          <div className="finance-forecast-week__body">
                            {item.type === 'mensalidade' ? (
                              <Link
                                to={`/financeiro?${buildReceivablesSearchParams({
                                  section: RECEIVABLES_SECTIONS.MENSALIDADES,
                                  search: item.student_name || item.label || '',
                                }).toString()}`}
                                className="finance-forecast-week__link"
                              >
                                {item.label}
                              </Link>
                            ) : (
                              <span className="finance-forecast-week__label">{item.label}</span>
                            )}
                            <span className="text-xs text-muted finance-forecast-week__status">
                              {fmtDateBr(item.due_date)}
                              {' · '}
                              {String(item.status || '').toLowerCase() === 'projetado' ? (
                                <FinanceLabelWithHint hint={FINANCE_TERM_HINTS.projetado}>
                                  {statusLabel(item.status)}
                                </FinanceLabelWithHint>
                              ) : (
                                statusLabel(item.status)
                              )}
                              {item.type === 'pendente' ? (
                                <>
                                  {' · '}
                                  <Link to="/financeiro?tab=movimentacoes" className="finance-forecast-week__link">
                                    Ver lançamentos
                                  </Link>
                                </>
                              ) : null}
                            </span>
                          </div>
                          <div
                            className={`finance-forecast-week__amount${
                              item.flow === 'out'
                                ? ' finance-forecast-week__amount--out'
                                : ' finance-forecast-week__amount--in'
                            }`}
                          >
                            <span>
                              {item.flow === 'out' ? '−' : '+'}
                              {fmtMoney(itemNet)}
                            </span>
                            {showItemGross ? (
                              <span className="finance-forecast-week__amount-gross text-xs text-muted">
                                bruto {fmtMoney(itemGross)}
                              </span>
                            ) : null}
                          </div>
                        </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </FinanceTabShell>
  );
}
