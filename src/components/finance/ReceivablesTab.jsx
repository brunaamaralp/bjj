import React, { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import { lazyWithRetry } from '../../lib/lazyWithRetry.js';
import './finance.css';
import { Link } from 'react-router-dom';
import { ArrowRight, RefreshCw, Wallet } from 'lucide-react';
import { fetchReceivablesCached } from '../../lib/financeTxApi.js';
import { FINANCE_TERM_HINTS } from '../../lib/financeTermHints.js';
import { RECEIVABLE_SOURCE } from '../../lib/receivablesAggregate.js';
import {
  RECEIVABLES_SECTIONS,
  RECEIVABLES_SECTION_LABELS,
} from '../../lib/financeiroReceivablesSections.js';
import { formatMonthTitleCapitalized } from '../../lib/financeiroOverview.js';
import FinanceLabelWithHint from './FinanceLabelWithHint.jsx';
import CobrancaPanel from './CobrancaPanel.jsx';
import FinanceTabShell from './FinanceTabShell.jsx';
import HubTabBar from '../shared/HubTabBar.jsx';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import StatusBanner from '../shared/StatusBanner.jsx';

const MensalidadesPanel = lazyWithRetry(() => import('./MensalidadesPanel.jsx'));

const RECEIVABLES_PAGE_SIZE = 80;

function fmtMoney(v) {
  try {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } catch {
    return `R$ ${Number(v || 0).toFixed(2)}`;
  }
}

function fmtCompactMoney(v) {
  const n = Number(v) || 0;
  if (n >= 1000) {
    try {
      return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact' });
    } catch {
      /* fall through */
    }
  }
  return fmtMoney(n);
}

function fmtDateBr(ymd) {
  const p = String(ymd || '').slice(0, 10).split('-');
  if (p.length !== 3) return '—';
  return `${p[2]}/${p[1]}/${p[0]}`;
}

function itemActionLink(item) {
  if (item.tx_id) {
    return `/financeiro?tab=movimentacoes&tx=${encodeURIComponent(item.tx_id)}`;
  }
  return `/financeiro?tab=${item.linkTab || 'movimentacoes'}`;
}

function statusLabel(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'overdue') return 'Em atraso';
  if (s === 'partial') return 'Parcial';
  if (s === 'awaiting') return 'Aguardando';
  if (s === 'pending') return 'Pendente';
  return 'Em aberto';
}

function receivablesDataWarningMessage(warnings) {
  if (!warnings || typeof warnings !== 'object') return null;
  const parts = [];
  if (warnings.pendingInflowTruncated) parts.push('lançamentos de entrada pendentes');
  if (warnings.deferredSalesTruncated) parts.push('vendas parceladas em aberto');
  if (warnings.paymentsMonthTruncated) parts.push('mensalidades do mês');
  if (warnings.cobrancaPaymentsTruncated) parts.push('pagamentos da fila de cobrança');
  if (parts.length === 0) return null;
  return `Dados parciais: limite de leitura atingido em ${parts.join(', ')}. Totais podem estar incompletos.`;
}

const VALID_SECTIONS = new Set(Object.values(RECEIVABLES_SECTIONS));

const SOURCE_BADGE_CLASS = {
  [RECEIVABLE_SOURCE.MENSALIDADE]: 'finance-badge-pago',
  [RECEIVABLE_SOURCE.LANCAMENTO]: 'finance-badge-pendente',
  [RECEIVABLE_SOURCE.VENDA]: 'finance-badge-aguardando',
};

export default function ReceivablesTab({
  academyId,
  referenceMonth,
  activeSection,
  defaultSection,
  onSectionChange,
  onReferenceMonthChange,
}) {
  const ym = String(referenceMonth || '').trim();
  const monthLabel = useMemo(() => formatMonthTitleCapitalized(ym), [ym]);
  const resolvedSection = useMemo(() => {
    if (VALID_SECTIONS.has(activeSection)) return activeSection;
    if (VALID_SECTIONS.has(defaultSection)) return defaultSection;
    return RECEIVABLES_SECTIONS.VISAO;
  }, [activeSection, defaultSection]);
  const handleSectionChange = onSectionChange || (() => {});

  const [loading, setLoading] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [cobrancaSummary, setCobrancaSummary] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const isMensalidadesSection = resolvedSection === RECEIVABLES_SECTIONS.MENSALIDADES;
  const isCobrancaSection = resolvedSection === RECEIVABLES_SECTIONS.COBRANCA;

  const load = useCallback(
    async (append = false) => {
      if (!academyId || !ym) return;
      // Mensalidades e Cobrança têm painéis próprios — não bloquear / duplicar o snapshot pesado.
      if (isMensalidadesSection || isCobrancaSection) return;
      const offset = append ? (data?.items?.length || 0) : 0;
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError('');
      }
      try {
        const body = await fetchReceivablesCached({
          academyId,
          month: ym,
          section: resolvedSection,
          limit: RECEIVABLES_PAGE_SIZE,
          offset,
          includeCobranca: false,
          force: refreshToken > 0 && !append,
        });
        setHasMore(Boolean(body?.pagination?.hasMore));
        if (body?.cobrancaSummary != null) {
          setCobrancaSummary(body.cobrancaSummary);
        }
        if (append) {
          setData((prev) => ({
            ...body,
            items: [...(prev?.items || []), ...(body?.items || [])],
          }));
        } else {
          setData(body);
        }
      } catch (e) {
        console.error('[ReceivablesTab]', e);
        if (!append) {
          setData(null);
          setError('Não foi possível carregar as contas a receber.');
        }
      } finally {
        if (append) setLoadingMore(false);
        else {
          setLoading(false);
          setLoadedOnce(true);
        }
      }
    },
    [
      academyId,
      ym,
      resolvedSection,
      refreshToken,
      data?.items?.length,
      isMensalidadesSection,
      isCobrancaSection,
    ]
  );

  useEffect(() => {
    if (isMensalidadesSection || isCobrancaSection) {
      setLoading(false);
      setLoadedOnce(true);
      setError('');
      return;
    }
    void load(false);
    // load omitido de propósito — espelha o padrão anterior (evita loop com data.items.length).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- academy/month/section/refresh
  }, [academyId, ym, resolvedSection, refreshToken, isMensalidadesSection, isCobrancaSection]);

  useEffect(() => {
    const bump = () => setRefreshToken((t) => t + 1);
    window.addEventListener('navi-student-payment-updated', bump);
    window.addEventListener('navi-financial-tx-settled', bump);
    return () => {
      window.removeEventListener('navi-student-payment-updated', bump);
      window.removeEventListener('navi-financial-tx-settled', bump);
    };
  }, []);

  const summary = data?.summary || { total: 0, bySource: {}, count: 0 };
  const bySource = useMemo(() => summary.bySource || {}, [summary.bySource]);

  const sectionTabs = useMemo(() => {
    const outrosTotal =
      (Number(bySource[RECEIVABLE_SOURCE.LANCAMENTO]) || 0) +
      (Number(bySource[RECEIVABLE_SOURCE.VENDA]) || 0);
    const withAmount = (baseLabel, amount) => `${baseLabel} · ${fmtCompactMoney(amount)}`;
    const cobrancaCount = Number(cobrancaSummary?.students) || 0;
    const cobrancaLabel =
      cobrancaCount > 0
        ? `${RECEIVABLES_SECTION_LABELS[RECEIVABLES_SECTIONS.COBRANCA]} (${cobrancaCount})`
        : RECEIVABLES_SECTION_LABELS[RECEIVABLES_SECTIONS.COBRANCA];
    return [
      {
        id: RECEIVABLES_SECTIONS.VISAO,
        label: withAmount(RECEIVABLES_SECTION_LABELS[RECEIVABLES_SECTIONS.VISAO], summary.total),
        shortLabel: RECEIVABLES_SECTION_LABELS[RECEIVABLES_SECTIONS.VISAO],
      },
      {
        id: RECEIVABLES_SECTIONS.MENSALIDADES,
        label: withAmount(
          RECEIVABLES_SECTION_LABELS[RECEIVABLES_SECTIONS.MENSALIDADES],
          bySource[RECEIVABLE_SOURCE.MENSALIDADE] || 0
        ),
        shortLabel: RECEIVABLES_SECTION_LABELS[RECEIVABLES_SECTIONS.MENSALIDADES],
      },
      {
        id: RECEIVABLES_SECTIONS.COBRANCA,
        label: cobrancaLabel,
        shortLabel: RECEIVABLES_SECTION_LABELS[RECEIVABLES_SECTIONS.COBRANCA],
      },
      {
        id: RECEIVABLES_SECTIONS.OUTROS,
        label: withAmount(RECEIVABLES_SECTION_LABELS[RECEIVABLES_SECTIONS.OUTROS], outrosTotal),
        shortLabel: RECEIVABLES_SECTION_LABELS[RECEIVABLES_SECTIONS.OUTROS],
      },
    ];
  }, [summary.total, bySource, cobrancaSummary?.students]);

  const items = useMemo(() => data?.items || [], [data?.items]);
  const dataWarningMessage = useMemo(
    () => receivablesDataWarningMessage(data?.dataWarnings),
    [data?.dataWarnings]
  );

  if (!academyId) {
    return <p className="text-small text-muted">Selecione uma academia.</p>;
  }

  // Nunca bloquear Mensalidades/Cobrança atrás do snapshot de "a receber".
  if (loading && !loadedOnce && !isMensalidadesSection && !isCobrancaSection) {
    return (
      <div className="mt-2">
        <PageSkeleton variant="table" rows={6} />
      </div>
    );
  }

  if (error && !isMensalidadesSection && !isCobrancaSection) {
    return <ErrorBanner message={error} onRetry={() => setRefreshToken((t) => t + 1)} />;
  }

  const refreshBtn = (
    <button
      type="button"
      className="btn-outline btn-sm receivables-tab__refresh"
      onClick={() => setRefreshToken((t) => t + 1)}
      disabled={loading}
      aria-busy={loading}
      aria-label="Atualizar contas a receber"
    >
      <RefreshCw size={14} className={loading ? 'navi-async-btn__spin' : ''} aria-hidden />
      <span className="receivables-tab__refresh-label">Atualizar</span>
    </button>
  );

  const cobrancaStudentCount = Number(cobrancaSummary?.students) || 0;
  const kpiStrip =
    resolvedSection === RECEIVABLES_SECTIONS.COBRANCA ? (
      <div className="finance-kpi finance-kpi--compact receivables-tab__total-kpi">
        <p className="finance-kpi__label">
          <FinanceLabelWithHint hint={FINANCE_TERM_HINTS.cobrancaFila}>
            Fila acumulada · últimos 12 meses
          </FinanceLabelWithHint>
        </p>
        <p className="finance-kpi__value finance-data">
          {fmtMoney(cobrancaSummary?.totalOpen || 0)}
        </p>
        {cobrancaStudentCount > 0 ? (
          <p className="finance-kpi__hint">
            {cobrancaStudentCount} inadimplente{cobrancaStudentCount !== 1 ? 's' : ''}
          </p>
        ) : (
          <p className="finance-kpi__hint">Nenhuma mensalidade em atraso na janela</p>
        )}
      </div>
    ) : (
      <div className="finance-kpi finance-kpi--compact receivables-tab__total-kpi">
        <p className="finance-kpi__label">
          <FinanceLabelWithHint hint={FINANCE_TERM_HINTS.aReceber}>
            Total a receber · {monthLabel}
          </FinanceLabelWithHint>
        </p>
        <p className="finance-kpi__value">{fmtMoney(summary.total)}</p>
        {summary.count > 0 ? (
          <p className="finance-kpi__hint">{summary.count} item(ns) em aberto</p>
        ) : null}
      </div>
    );

  const subNav = (
    <div className="receivables-tab__subnav-bar">
      <HubTabBar
        tabs={sectionTabs}
        activeId={resolvedSection}
        onChange={handleSectionChange}
        ariaLabel="Seções de contas a receber"
        variant="secondary"
        size="sm"
        fullWidth
        panelIdPrefix="receivables-"
        className="receivables-tab__subnav-tabs"
      />
      {refreshBtn}
    </div>
  );

  return (
    <FinanceTabShell
      panelClassName="receivables-tab finance-tab-panel--compact"
      kpiStrip={kpiStrip}
      subNav={subNav}
    >
      {dataWarningMessage ? (
        <StatusBanner variant="warning" className="mb-3">
          {dataWarningMessage}
        </StatusBanner>
      ) : null}

      {resolvedSection === RECEIVABLES_SECTIONS.MENSALIDADES ? (
        <Suspense fallback={<PageSkeleton variant="table" rows={8} />}>
          <MensalidadesPanel
            embedded
            sectionMode
            referenceMonth={referenceMonth}
            onReferenceMonthChange={onReferenceMonthChange}
          />
        </Suspense>
      ) : resolvedSection === RECEIVABLES_SECTIONS.COBRANCA ? (
        <CobrancaPanel
          academyId={academyId}
          onSectionChange={handleSectionChange}
          refreshToken={refreshToken}
          onSummaryChange={setCobrancaSummary}
        />
      ) : items.length === 0 ? (
        <EmptyState
          variant="compact"
          icon={Wallet}
          title="Nenhuma conta a receber nesta referência"
          description="Quando houver mensalidades, lançamentos ou vendas em aberto, eles aparecerão aqui."
          primaryAction={
            resolvedSection !== RECEIVABLES_SECTIONS.MENSALIDADES
              ? {
                  label: 'Ver mensalidades',
                  onClick: () => handleSectionChange(RECEIVABLES_SECTIONS.MENSALIDADES),
                }
              : undefined
          }
        />
      ) : (
        <div className="finance-table-wrap receivables-tab__table-wrap">
          <table className="finance-table receivables-tab__table">
            <thead>
              <tr>
                <th>Descrição</th>
                <th>Origem</th>
                <th>Vencimento</th>
                <th>Status</th>
                <th className="receivables-tab__col-amount">Valor</th>
                <th aria-label="Ação" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const mensalidadeInOverview =
                  resolvedSection === RECEIVABLES_SECTIONS.VISAO &&
                  item.source === RECEIVABLE_SOURCE.MENSALIDADE;
                const badgeClass = SOURCE_BADGE_CLASS[item.source] || 'finance-badge-pendente';
                return (
                  <tr key={item.id}>
                    <td>{item.label}</td>
                    <td>
                      <span className={badgeClass}>{item.sourceLabel}</span>
                    </td>
                    <td>{fmtDateBr(item.due_date)}</td>
                    <td>{statusLabel(item.status)}</td>
                    <td className="receivables-tab__col-amount finance-data">{fmtMoney(item.amount)}</td>
                    <td>
                      {mensalidadeInOverview ? (
                        <button
                          type="button"
                          className="receivables-tab__action receivables-tab__action-btn"
                          onClick={() =>
                            handleSectionChange(RECEIVABLES_SECTIONS.MENSALIDADES, {
                              search: item.label,
                            })
                          }
                        >
                          Abrir <ArrowRight size={12} aria-hidden />
                        </button>
                      ) : (
                        <Link to={itemActionLink(item)} className="receivables-tab__action">
                          Abrir <ArrowRight size={12} aria-hidden />
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {hasMore ? (
            <div className="receivables-tab__load-more-wrap">
              <button
                type="button"
                className="btn-outline btn-sm"
                onClick={() => void load(true)}
                disabled={loadingMore}
                aria-busy={loadingMore}
              >
                {loadingMore ? 'Carregando…' : 'Carregar mais'}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </FinanceTabShell>
  );
}
