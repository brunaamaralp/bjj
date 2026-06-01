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
      <div
        className="card mb-3"
        style={{ padding: '10px 14px', background: 'var(--surface-hover)', borderStyle: 'dashed' }}
        role="note"
      >
        <p className="text-small text-muted" style={{ margin: 0, lineHeight: 1.5 }}>
          Previsão baseada em lançamentos pendentes e mensalidades em aberto. Valores reais podem variar.
        </p>
      </div>

      <div className="flex gap-2 mb-3" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
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
        <span className="text-xs text-muted" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
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
        <div style={{ position: 'relative' }}>
          {contentBusy ? (
            <div
              className="text-small text-muted"
              style={{ position: 'absolute', right: 8, top: -6, zIndex: 2, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <RefreshCw size={14} className="navi-async-btn__spin" />
              Atualizando…
            </div>
          ) : null}
          <div style={contentBusy ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
          <div className="finance-forecast-summary">
            <div className="card finance-forecast-summary__card">
              <Wallet size={18} style={{ color: 'var(--v500)' }} aria-hidden />
              <div>
                <p className="text-xs text-muted">Saldo atual</p>
                <p className="finance-forecast-summary__value">{fmtMoney(data.opening_balance)}</p>
              </div>
            </div>
            <div className="card finance-forecast-summary__card">
              <TrendingUp size={18} style={{ color: '#3B6D11' }} aria-hidden />
              <div>
                <p className="text-xs text-muted">Entradas previstas</p>
                <p className="finance-forecast-summary__value" style={{ color: '#3B6D11' }}>
                  {fmtMoney(summary.expected_inflow)}
                </p>
              </div>
            </div>
            <div className="card finance-forecast-summary__card">
              <TrendingDown size={18} style={{ color: '#A32D2D' }} aria-hidden />
              <div>
                <p className="text-xs text-muted">Saídas previstas</p>
                <p className="finance-forecast-summary__value" style={{ color: '#A32D2D' }}>
                  {fmtMoney(summary.expected_outflow)}
                </p>
              </div>
            </div>
            <div className="card finance-forecast-summary__card">
              <Wallet size={18} aria-hidden />
              <div>
                <p className="text-xs text-muted">Saldo projetado</p>
                <p
                  className="finance-forecast-summary__value"
                  style={{ color: projectedPositive ? '#3B6D11' : '#A32D2D' }}
                >
                  {fmtMoney(projected)}
                </p>
              </div>
            </div>
          </div>

          <div className="card finance-forecast-chart-card mb-3">
            <h4 className="funil-section-subheading" style={{ margin: '0 0 12px' }}>
              Fluxo semanal
            </h4>
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
                  <Bar yAxisId="amount" dataKey="inflow" name="inflow" fill="#3B6D11" radius={[3, 3, 0, 0]} barSize={18} />
                  <Bar yAxisId="amount" dataKey="outflow" name="outflow" fill="#C2410C" radius={[3, 3, 0, 0]} barSize={18} />
                  <Line
                    yAxisId="balance"
                    type="monotone"
                    dataKey="balance"
                    name="balance"
                    stroke="var(--petroleo)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
            <div className="flex gap-3 mt-2 text-xs text-muted" style={{ flexWrap: 'wrap' }}>
              <span>
                <i style={{ display: 'inline-block', width: 10, height: 10, background: '#3B6D11', borderRadius: 2, marginRight: 4 }} />
                Entradas
              </span>
              <span>
                <i style={{ display: 'inline-block', width: 10, height: 10, background: '#C2410C', borderRadius: 2, marginRight: 4 }} />
                Saídas
              </span>
              <span>
                <i style={{ display: 'inline-block', width: 14, height: 2, background: 'var(--petroleo)', marginRight: 4, verticalAlign: 'middle' }} />
                Saldo acumulado
              </span>
            </div>
          </div>

          <div className="finance-forecast-weeks">
            {(data.weeks || []).map((week) => (
              <div key={week.week_start} className="card finance-forecast-week">
                <div className="finance-forecast-week__head">
                  <div>
                    <p className="funil-section-subheading" style={{ margin: 0 }}>
                      {fmtDateBr(week.week_start)} — {fmtDateBr(week.week_end)}
                    </p>
                    <p className="text-xs text-muted" style={{ margin: '4px 0 0' }}>
                      {week.items.length} item(ns)
                    </p>
                  </div>
                  <div className="text-small" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    <div>
                      <span style={{ color: '#3B6D11' }}>+{fmtMoney(week.expected_inflow)}</span>
                      {' · '}
                      <span style={{ color: '#A32D2D' }}>-{fmtMoney(week.expected_outflow)}</span>
                    </div>
                    <strong style={{ color: week.net >= 0 ? '#3B6D11' : '#A32D2D' }}>
                      = {fmtMoney(week.net)}
                    </strong>
                  </div>
                </div>
                {week.items.length === 0 ? (
                  <p className="text-small text-muted" style={{ margin: '12px 0 0' }}>
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
                          className="finance-forecast-week__amount"
                          style={{ color: item.flow === 'out' ? '#A32D2D' : '#3B6D11' }}
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
