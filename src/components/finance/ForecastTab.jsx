import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Calendar, Clock, RefreshCw, Repeat, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { fetchFinanceForecast } from '../../lib/financeTxApi.js';
import {
  FORECAST_PERIOD_PRESETS,
  buildForecastChartRows,
  todayYmdLocal,
} from '../../lib/financeForecastCore.js';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';

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

  const statusLabel = (status) => {
    const raw = String(status || '').trim();
    if (!raw) return '—';
    return STATUS_LABELS[raw] || `${raw.charAt(0).toUpperCase()}${raw.slice(1)}`;
  };

  if (!academyId) return null;

  return (
    <section className="mt-4 animate-in finance-forecast">
      <div className="card mb-3 finance-forecast-note" role="note">
        <p className="text-small text-muted finance-forecast-note__text">
          Previsão baseada em lançamentos pendentes e mensalidades em aberto. Valores reais podem variar.
        </p>
      </div>

      <div className="flex gap-2 mb-3 finance-forecast-toolbar">
        <span className="text-small text-muted">Período:</span>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`btn-outline btn-sm${preset === p.id ? ' finance-regime-active' : ''}`}
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
            className="btn-outline btn-sm"
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
      </div>

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
            <div className="finance-forecast-summary">
              <div className="card finance-forecast-summary__card">
                <Wallet size={18} className="finance-forecast-summary__icon--primary" aria-hidden />
                <div>
                  <p className="text-xs text-muted">Saldo atual</p>
                  <p className="finance-forecast-summary__value">{fmtMoney(data.opening_balance)}</p>
                </div>
              </div>
              <div className="card finance-forecast-summary__card">
                <TrendingUp size={18} className="finance-forecast-summary__value--positive" aria-hidden />
                <div>
                  <p className="text-xs text-muted">Entradas previstas</p>
                  <p className="finance-forecast-summary__value finance-forecast-summary__value--positive">
                    {fmtMoney(summary.expected_inflow)}
                  </p>
                </div>
              </div>
              <div className="card finance-forecast-summary__card">
                <TrendingDown size={18} className="finance-forecast-summary__value--negative" aria-hidden />
                <div>
                  <p className="text-xs text-muted">Saídas previstas</p>
                  <p className="finance-forecast-summary__value finance-forecast-summary__value--negative">
                    {fmtMoney(summary.expected_outflow)}
                  </p>
                </div>
              </div>
              <div className="card finance-forecast-summary__card">
                <Wallet size={18} aria-hidden />
                <div>
                  <p className="text-xs text-muted">Saldo projetado</p>
                  <p
                    className={`finance-forecast-summary__value ${
                      projectedPositive
                        ? 'finance-forecast-summary__value--positive'
                        : 'finance-forecast-summary__value--negative'
                    }`}
                  >
                    {fmtMoney(projected)}
                  </p>
                </div>
              </div>
            </div>

            <div className="card finance-forecast-chart-card mb-3">
              <h4 className="funil-section-subheading finance-forecast-chart-title">Fluxo semanal</h4>
              {chartRows.length === 0 ? (
                <p className="text-small text-muted">Nenhuma movimentação prevista no período.</p>
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
                          inflow: 'Entradas',
                          outflow: 'Saídas',
                          balance: 'Saldo acumulado',
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
                  Entradas
                </span>
                <span>
                  <i className="finance-forecast-legend__swatch finance-forecast-legend__swatch--outflow" />
                  Saídas
                </span>
                <span>
                  <i className="finance-forecast-legend__swatch finance-forecast-legend__swatch--balance" />
                  Saldo acumulado
                </span>
              </div>
            </div>

            <div className="finance-forecast-weeks">
              {(data.weeks || []).map((week) => (
                <div key={week.week_start} className="card finance-forecast-week">
                  <div className="finance-forecast-week__head">
                    <div>
                      <p className="funil-section-subheading finance-forecast-week__title">
                        {fmtDateBr(week.week_start)} — {fmtDateBr(week.week_end)}
                      </p>
                      <p className="text-xs text-muted finance-forecast-week__subtitle">
                        {week.items.length} item(ns)
                      </p>
                    </div>
                    <div className="text-small finance-forecast-week__totals">
                      <div>
                        <span className="finance-forecast-week__inflow">+{fmtMoney(week.expected_inflow)}</span>
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
                    <p className="text-small text-muted finance-forecast-week__empty">
                      Sem movimentações previstas nesta semana.
                    </p>
                  ) : (
                    <ul className="finance-forecast-week__list">
                      {week.items.map((item, idx) => (
                        <li key={`${week.week_start}-${idx}`} className="finance-forecast-week__item">
                          <span className="finance-forecast-week__icon" aria-hidden>
                            <TypeIcon type={item.type} />
                          </span>
                          <div className="finance-forecast-week__body">
                            {item.type === 'mensalidade' ? (
                              <Link
                                to={`/financeiro?tab=mensalidades&search=${encodeURIComponent(item.student_name || item.label || '')}`}
                                className="finance-forecast-week__link"
                              >
                                {item.label}
                              </Link>
                            ) : (
                              <span className="finance-forecast-week__label">{item.label}</span>
                            )}
                            <span className="text-xs text-muted">
                              {fmtDateBr(item.due_date)}
                              {' · '}
                              {statusLabel(item.status)}
                              {item.type === 'pendente' ? (
                                <>
                                  {' · '}
                                  <Link to="/financeiro?tab=movimentacoes" className="finance-forecast-week__link">
                                    Ver no Caixa
                                  </Link>
                                </>
                              ) : null}
                            </span>
                          </div>
                          <span
                            className={`finance-forecast-week__amount ${
                              item.flow === 'out'
                                ? 'finance-forecast-week__amount--out'
                                : 'finance-forecast-week__amount--in'
                            }`}
                          >
                            {item.flow === 'out' ? '−' : '+'}
                            {fmtMoney(item.amount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
