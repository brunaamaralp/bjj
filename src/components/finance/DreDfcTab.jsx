import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, ChevronDown, Download, RefreshCw } from 'lucide-react';
import { fetchFinanceDfc, fetchFinanceDre } from '../../lib/financeTxApi.js';
import { DRE_DISPLAY_GROUPS, UNCLASSIFIED_DRE_GROUP } from '../../lib/financeCategories.js';
import { DFC_GROUP_ORDER } from '../../lib/financeDfcMapping.js';
import {
  formatMonthTitleCapitalized,
  formatPeriodRangeBr,
  monthPeriodBounds,
  overviewPeriodContext,
} from '../../lib/financeiroOverview.js';
import { buildDfcCsvMatrix, buildDreCsvMatrix } from '../../lib/financeStatementsExport.js';
import { downloadCsvMatrix } from '../../lib/reportsExport.js';
import { fmt } from './financeFmt.js';
import FinanceTabShell from './FinanceTabShell.jsx';
import HubTabBar from '../shared/HubTabBar.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import StatusBanner from '../shared/StatusBanner.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import FinanceLabelWithHint from './FinanceLabelWithHint.jsx';

const STATEMENT_VIEWS = {
  DRE: 'dre',
  DFC: 'dfc',
};

const STATEMENT_TABS = [
  { id: STATEMENT_VIEWS.DRE, label: 'DRE', shortLabel: 'DRE' },
  { id: STATEMENT_VIEWS.DFC, label: 'DFC', shortLabel: 'DFC' },
];

const DRE_TOTAL_LINES = new Set([
  'Receita Líquida',
  'Lucro Bruto',
  'Resultado Operacional',
  'Resultado Líquido',
]);

const DRE_EXPENSE_GROUPS = new Set([
  'Deduções',
  'CMV/CPV',
  'Despesas Operacionais',
  'Depreciação/Amortização',
  'Resultado Financeiro',
  UNCLASSIFIED_DRE_GROUP,
  'Imposto s/ Lucro',
]);

const DRE_PROFIT_LINES = new Set([
  'Receita Bruta',
  'Receita Líquida',
  'Lucro Bruto',
  'Resultado Operacional',
  'Resultado Líquido',
]);

function fmtDelta(n) {
  const v = Number(n || 0);
  if (Math.abs(v) < 0.01) return '—';
  const prefix = v > 0 ? '+' : '';
  return `${prefix}${fmt(v)}`;
}

function deltaClass(lineKey, delta, mode = 'neutral') {
  const v = Number(delta || 0);
  if (Math.abs(v) < 0.01) return 'finance-statements-delta--neutral';

  if (mode === 'profit') {
    return v > 0 ? 'finance-statements-delta--up' : 'finance-statements-delta--down';
  }
  if (mode === 'expense') {
    return v > 0 ? 'finance-statements-delta--down' : 'finance-statements-delta--up';
  }
  return 'finance-statements-delta--neutral';
}

function deltaModeForDreLine(lineName) {
  if (lineName === 'Resultado Líquido') return 'profit';
  if (DRE_PROFIT_LINES.has(lineName)) return 'neutral';
  if (DRE_EXPENSE_GROUPS.has(lineName)) return 'expense';
  return 'neutral';
}

function displayDreAmount(groupName, amount) {
  const raw = Number(amount || 0);
  if (DRE_TOTAL_LINES.has(groupName)) return raw;
  if (DRE_EXPENSE_GROUPS.has(groupName)) return -Math.abs(raw);
  return raw;
}

function visibleDreCategories(categories = []) {
  return categories.filter((cat) => Math.abs(Number(cat.amount ?? 0)) > 0.009);
}

function visibleDfcCategories(categories = []) {
  return categories.filter(
    (cat) =>
      Math.abs(Number(cat.net ?? 0)) > 0.009 ||
      Math.abs(Number(cat.inflow ?? 0)) > 0.009 ||
      Math.abs(Number(cat.outflow ?? 0)) > 0.009
  );
}

function hasDfcGroupMovement(group) {
  if (!group) return false;
  return (
    Math.abs(Number(group.net || 0)) > 0.009 ||
    Math.abs(Number(group.inflow || 0)) > 0.009 ||
    Math.abs(Number(group.outflow || 0)) > 0.009 ||
    visibleDfcCategories(group.categories).length > 0
  );
}

function StatementRow({
  label,
  amount,
  delta,
  deltaMode = 'neutral',
  isTotal = false,
  warn = false,
  categories = [],
}) {
  const visibleCats = visibleDreCategories(categories);
  const hasChildren = visibleCats.length > 0;
  const rowClass = [
    'finance-statements-row',
    isTotal ? 'finance-statements-row--total' : '',
    hasChildren ? 'finance-statements-row--expandable' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const labelNode = (
    <span className="finance-statements-row__label">
      {label}
      {warn ? (
        <span
          className="badge badge-warning finance-reports-unclassified-badge"
          title="Há lançamentos com categoria não mapeada no plano de contas"
        >
          não classificado
        </span>
      ) : null}
    </span>
  );

  return (
    <div className="finance-statements-group">
      {hasChildren ? (
        <details className="finance-statements-details">
          <summary className={rowClass}>
            <span className="finance-statements-row__toggle">
              <ChevronDown size={16} className="finance-statements-row__chevron" aria-hidden />
              {labelNode}
            </span>
            <span className="finance-statements-row__value">{fmt(amount)}</span>
            <span className={`finance-statements-row__delta ${deltaClass(label, delta, deltaMode)}`}>
              {fmtDelta(delta)}
            </span>
          </summary>
          <ul className="finance-statements-categories">
            {visibleCats.map((cat) => (
              <li key={cat.key || cat.label} className="finance-statements-category">
                <span className="finance-statements-category__label">{cat.label}</span>
                <span className="finance-statements-category__value">{fmt(cat.amount)}</span>
                {cat.pctOfRevenue != null ? (
                  <span className="finance-statements-category__pct" title="% da receita bruta">
                    {Number(cat.pctOfRevenue).toFixed(1)}%
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <div className={rowClass}>
          {labelNode}
          <span className="finance-statements-row__value">{fmt(amount)}</span>
          <span className={`finance-statements-row__delta ${deltaClass(label, delta, deltaMode)}`}>
            {fmtDelta(delta)}
          </span>
        </div>
      )}
    </div>
  );
}

function DfcGroupRow({ label, group, delta }) {
  const visibleCats = visibleDfcCategories(group?.categories);
  const hasChildren = visibleCats.length > 0;
  const rowClass = [
    'finance-statements-row',
    'finance-statements-row--dfc',
    hasChildren ? 'finance-statements-row--expandable' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const cells = (
    <>
      <span className="finance-statements-row__inflow finance-value-positive">{fmt(group.inflow)}</span>
      <span className="finance-statements-row__outflow finance-value-negative">{fmt(group.outflow)}</span>
      <span className="finance-statements-row__value">{fmt(group.net)}</span>
      <span className={`finance-statements-row__delta ${deltaClass(label, delta, 'neutral')}`}>
        {fmtDelta(delta)}
      </span>
    </>
  );

  if (hasChildren) {
    return (
      <details className="finance-statements-details finance-statements-details--dfc">
        <summary className={rowClass}>
          <span className="finance-statements-row__toggle">
            <ChevronDown size={16} className="finance-statements-row__chevron" aria-hidden />
            <span className="finance-statements-row__label">{label}</span>
          </span>
          {cells}
        </summary>
        <ul className="finance-statements-categories finance-statements-categories--dfc">
          {visibleCats.map((cat) => (
            <li key={cat.key || cat.label} className="finance-statements-category">
              <span className="finance-statements-category__label">{cat.label}</span>
              <span className="finance-statements-category__inflow finance-value-positive">
                {fmt(cat.inflow)}
              </span>
              <span className="finance-statements-category__outflow finance-value-negative">
                {fmt(cat.outflow)}
              </span>
              <span className="finance-statements-category__value">{fmt(cat.net)}</span>
            </li>
          ))}
        </ul>
      </details>
    );
  }

  return (
    <div className={rowClass}>
      <span className="finance-statements-row__label">{label}</span>
      {cells}
    </div>
  );
}

function StatementsKpiStrip({ dreData, dfcData, loadingDfc, onOpenDfc }) {
  const dre = dreData?.statement?.dreData;
  const dreDelta = dreData?.delta?.lines;
  if (!dre) return null;

  const resultado = Number(dre['Resultado Líquido'] || 0);
  const resultadoDelta = dreDelta?.['Resultado Líquido'];

  return (
    <div className="finance-kpi-strip finance-statements-kpis">
      <div className="finance-kpi">
        <p className="finance-kpi__label">Receita bruta</p>
        <p className="finance-kpi__value">{fmt(dre['Receita Bruta'])}</p>
        <p className={`finance-statements-kpi__delta ${deltaClass('Receita Bruta', dreDelta?.['Receita Bruta'], 'neutral')}`}>
          {fmtDelta(dreDelta?.['Receita Bruta'])} vs mês ant.
        </p>
      </div>
      <div className="finance-kpi finance-kpi--hero">
        <p className="finance-kpi__label">Resultado líquido</p>
        <p
          className={`finance-kpi__value ${
            resultado >= 0 ? 'finance-value-positive' : 'finance-value-negative'
          }`}
        >
          {fmt(resultado)}
        </p>
        <p className={`finance-statements-kpi__delta ${deltaClass('Resultado Líquido', resultadoDelta, 'profit')}`}>
          {fmtDelta(resultadoDelta)} vs mês ant.
        </p>
      </div>
      <div className="finance-kpi">
        <p className="finance-kpi__label">
          <FinanceLabelWithHint hint="Fluxo de caixa líquido do período (aba DFC).">
            Variação de caixa
          </FinanceLabelWithHint>
        </p>
        {dfcData?.statement ? (
          <>
            <p
              className={`finance-kpi__value ${
                Number(dfcData.statement.variacaoCaixa || 0) >= 0
                  ? 'finance-value-positive'
                  : 'finance-value-negative'
              }`}
            >
              {fmt(dfcData.statement.variacaoCaixa)}
            </p>
            <p
              className={`finance-statements-kpi__delta ${deltaClass(
                'Variação de caixa',
                dfcData.delta?.lines?.variacaoCaixa,
                'profit'
              )}`}
            >
              {fmtDelta(dfcData.delta?.lines?.variacaoCaixa)} vs mês ant.
            </p>
          </>
        ) : loadingDfc ? (
          <p className="finance-kpi__value text-muted" aria-busy="true">
            …
          </p>
        ) : (
          <button type="button" className="finance-statements-kpi__link" onClick={onOpenDfc}>
            Ver na aba DFC
          </button>
        )}
      </div>
    </div>
  );
}

function DrePanel({ data, compareMonth, periodLabel }) {
  const statement = data?.statement;
  const delta = data?.delta;

  const rows = useMemo(() => {
    if (!statement?.dreData) return [];
    return DRE_DISPLAY_GROUPS.filter((g) => g !== 'EBITDA' && statement.dreData[g] !== undefined)
      .map((groupName) => {
        const isTotal = DRE_TOTAL_LINES.has(groupName);
        const raw = isTotal
          ? statement.dreData[groupName]
          : statement.groups?.[groupName]?.total ?? statement.dreData[groupName];
        const categories = isTotal ? [] : statement.groups?.[groupName]?.categories || [];
        return {
          groupName,
          amount: displayDreAmount(groupName, raw),
          rawAmount: Number(raw || 0),
          delta: delta?.lines?.[groupName],
          deltaMode: deltaModeForDreLine(groupName),
          isTotal,
          warn: groupName === UNCLASSIFIED_DRE_GROUP && Math.abs(Number(raw || 0)) > 0.009,
          categories,
        };
      })
      .filter((row) => {
        if (row.isTotal) return true;
        if (Math.abs(row.rawAmount) > 0.009) return true;
        return visibleDreCategories(row.categories).length > 0;
      });
  }, [statement, delta]);

  if (!statement) return null;

  return (
    <div
      className="finance-reports-block finance-statements-panel"
      role="tabpanel"
      id="finance-statements-panel-dre"
      aria-labelledby="finance-statements-panel-tab-dre"
    >
      <h4 className="finance-statements-panel__title">Demonstração do Resultado (DRE)</h4>
      <p className="finance-statements-panel__hint text-muted text-sm" role="note">
        {periodLabel} · regime de competência · receita bruta com taxas de cartão como despesa
        financeira implícita.
        {compareMonth ? ` Comparativo com ${formatMonthTitleCapitalized(compareMonth)}.` : null}
      </p>
      {statement.meta?.competenceFallbackCount > 0 ? (
        <StatusBanner variant="info" className="finance-statements-panel__banner">
          {statement.meta.competenceFallbackCount} lançamento(s) sem competência explícita usaram a
          data de liquidação.
        </StatusBanner>
      ) : null}
      <div className="finance-statements-table" aria-label="Demonstração do resultado">
        <div className="finance-statements-table__head">
          <span>Conta</span>
          <span>Valor</span>
          <span>
            <FinanceLabelWithHint hint="Diferença absoluta em reais em relação ao mês anterior.">
              vs mês ant.
            </FinanceLabelWithHint>
          </span>
        </div>
        {rows.map((row) => (
          <StatementRow
            key={row.groupName}
            label={row.groupName}
            amount={row.amount}
            delta={row.delta}
            deltaMode={row.deltaMode}
            isTotal={row.isTotal}
            warn={row.warn}
            categories={row.categories}
          />
        ))}
      </div>
    </div>
  );
}

function DfcPanel({ data, compareMonth, periodLabel }) {
  const statement = data?.statement;
  const delta = data?.delta;

  if (!statement) return null;

  const recon = statement.bankReconciliation || {};

  return (
    <div
      className="finance-reports-block finance-statements-panel"
      role="tabpanel"
      id="finance-statements-panel-dfc"
      aria-labelledby="finance-statements-panel-tab-dfc"
    >
      <h4 className="finance-statements-panel__title">Demonstração do Fluxo de Caixa (DFC)</h4>
      <p className="finance-statements-panel__hint text-muted text-sm" role="note">
        {periodLabel} · método direto · caixa por data de liquidação · valores líquidos (após taxas).
        {compareMonth ? ` Comparativo com ${formatMonthTitleCapitalized(compareMonth)}.` : null}
      </p>
      <div
        className="finance-statements-table finance-statements-table--dfc"
        aria-label="Fluxo de caixa"
      >
        <div className="finance-statements-table__head finance-statements-table__head--dfc">
          <span>Grupo</span>
          <span>Entradas</span>
          <span>Saídas</span>
          <span>Líquido</span>
          <span>
            <FinanceLabelWithHint hint="Diferença absoluta em reais em relação ao mês anterior.">
              vs mês ant.
            </FinanceLabelWithHint>
          </span>
        </div>
        {DFC_GROUP_ORDER.map((groupName) => {
          const group = statement.groups?.[groupName];
          if (!hasDfcGroupMovement(group)) return null;
          return (
            <DfcGroupRow
              key={groupName}
              label={groupName}
              group={group}
              delta={delta?.groups?.[groupName]?.net}
            />
          );
        })}
        <div className="finance-statements-row finance-statements-row--dfc finance-statements-row--total">
          <span className="finance-statements-row__label">Variação de caixa</span>
          <span className="finance-statements-row__inflow" aria-hidden />
          <span className="finance-statements-row__outflow" aria-hidden />
          <span className="finance-statements-row__value">{fmt(statement.variacaoCaixa)}</span>
          <span
            className={`finance-statements-row__delta ${deltaClass(
              'Variação de caixa',
              delta?.lines?.variacaoCaixa,
              'profit'
            )}`}
          >
            {fmtDelta(delta?.lines?.variacaoCaixa)}
          </span>
        </div>
      </div>
      {recon.saldoInicial != null ? (
        <div className="finance-statements-recon">
          <h5 className="finance-statements-recon__title">Conciliação bancária</h5>
          <dl className="finance-statements-recon__grid">
            <div>
              <dt>Saldo inicial</dt>
              <dd>{fmt(recon.saldoInicial)}</dd>
            </div>
            <div>
              <dt>Fluxo do período</dt>
              <dd>{fmt(recon.fluxoLiquido)}</dd>
            </div>
            <div>
              <dt>Saldo final</dt>
              <dd>{fmt(recon.saldoFinal)}</dd>
            </div>
          </dl>
          {recon.matches === true ? (
            <p className="finance-statements-recon__ok text-small text-muted" role="status">
              Saldo inicial + fluxo confere com saldo final.
            </p>
          ) : null}
          {recon.matches === false ? (
            <StatusBanner variant="warning" className="finance-statements-panel__banner">
              Saldo inicial + fluxo não coincide com saldo final — revise lançamentos ou contas sem
              alocação.
            </StatusBanner>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function hasDreMovement(data) {
  const dreData = data?.statement?.dreData || {};
  return Object.values(dreData).some((v) => Math.abs(Number(v)) > 0.009);
}

function hasDfcMovement(data) {
  const statement = data?.statement;
  if (!statement) return false;
  if (Math.abs(Number(statement.variacaoCaixa || 0)) > 0.009) return true;
  return DFC_GROUP_ORDER.some((g) => hasDfcGroupMovement(statement.groups?.[g]));
}

export default function DreDfcTab({ academyId, referenceMonth }) {
  const [view, setView] = useState(STATEMENT_VIEWS.DRE);
  const [dreData, setDreData] = useState(null);
  const [dfcData, setDfcData] = useState(null);
  const [loadingDre, setLoadingDre] = useState(false);
  const [loadingDfc, setLoadingDfc] = useState(false);
  const [errorDre, setErrorDre] = useState('');
  const [errorDfc, setErrorDfc] = useState('');
  const dfcLoadedMonthRef = useRef('');

  const periodLabel = useMemo(() => {
    const ctx = overviewPeriodContext(referenceMonth);
    return formatPeriodRangeBr(ctx.from, ctx.to, ctx.isCurrentMonth);
  }, [referenceMonth]);

  const loadDre = useCallback(async () => {
    if (!academyId || !referenceMonth) return;
    setLoadingDre(true);
    setErrorDre('');
    try {
      const res = await fetchFinanceDre({ academyId, month: referenceMonth });
      setDreData(res);
    } catch (e) {
      setDreData(null);
      setErrorDre(e?.message || 'Erro ao carregar DRE');
    } finally {
      setLoadingDre(false);
    }
  }, [academyId, referenceMonth]);

  const loadDfc = useCallback(async () => {
    if (!academyId || !referenceMonth) return;
    setLoadingDfc(true);
    setErrorDfc('');
    try {
      const res = await fetchFinanceDfc({ academyId, month: referenceMonth });
      setDfcData(res);
      dfcLoadedMonthRef.current = referenceMonth;
    } catch (e) {
      setDfcData(null);
      dfcLoadedMonthRef.current = '';
      setErrorDfc(e?.message || 'Erro ao carregar DFC');
    } finally {
      setLoadingDfc(false);
    }
  }, [academyId, referenceMonth]);

  useEffect(() => {
    dfcLoadedMonthRef.current = '';
    setDreData(null);
    setDfcData(null);
    void loadDre();
  }, [academyId, referenceMonth, loadDre]);

  useEffect(() => {
    if (view !== STATEMENT_VIEWS.DFC) return;
    if (dfcLoadedMonthRef.current === referenceMonth && dfcData?.month === referenceMonth) return;
    void loadDfc();
  }, [view, referenceMonth, dfcData?.month, loadDfc]);

  const handleOpenDfc = useCallback(() => {
    setView(STATEMENT_VIEWS.DFC);
  }, []);

  const loadActive = useCallback(async () => {
    if (view === STATEMENT_VIEWS.DRE) {
      await loadDre();
      return;
    }
    await loadDfc();
  }, [view, loadDre, loadDfc]);

  const loadAll = useCallback(async () => {
    await loadDre();
    if (view === STATEMENT_VIEWS.DFC || dfcLoadedMonthRef.current === referenceMonth) {
      await loadDfc();
    }
  }, [loadDre, loadDfc, view, referenceMonth]);

  const handleExport = useCallback(() => {
    if (view === STATEMENT_VIEWS.DRE) {
      if (!dreData?.statement) return;
      const { headers, rows, filename } = buildDreCsvMatrix(dreData);
      downloadCsvMatrix(headers, rows, filename);
      return;
    }
    if (!dfcData?.statement) return;
    const { headers, rows, filename } = buildDfcCsvMatrix(dfcData);
    downloadCsvMatrix(headers, rows, filename);
  }, [view, dreData, dfcData]);

  const activeData = view === STATEMENT_VIEWS.DRE ? dreData : dfcData;
  const activeError = view === STATEMENT_VIEWS.DRE ? errorDre : errorDfc;
  const activeLoading = view === STATEMENT_VIEWS.DRE ? loadingDre : loadingDfc;
  const hasMovement =
    view === STATEMENT_VIEWS.DRE ? hasDreMovement(dreData) : hasDfcMovement(dfcData);
  const canExport = view === STATEMENT_VIEWS.DRE ? Boolean(dreData?.statement) : Boolean(dfcData?.statement);
  const intro = compareMonthLabel(dreData?.compareMonth || dfcData?.compareMonth);
  const showKpis = Boolean(dreData?.statement) && !loadingDre && !errorDre;

  return (
    <FinanceTabShell
      panelClassName="finance-statements-tab"
      title="Demonstrativos"
      badge={
        intro ? (
          <span className="finance-statements-tab__period text-small text-muted">{intro}</span>
        ) : null
      }
      actions={
        <div className="finance-statements-actions">
          <button
            type="button"
            className="btn-action-ghost finance-statements-actions__btn"
            onClick={handleExport}
            disabled={!canExport || activeLoading}
          >
            <Download size={16} aria-hidden />
            Exportar CSV
          </button>
          <button
            type="button"
            className="btn-action-ghost finance-statements-actions__btn"
            onClick={() => void loadAll()}
            disabled={loadingDre || loadingDfc}
            aria-busy={loadingDre || loadingDfc}
          >
            <RefreshCw size={16} aria-hidden className={loadingDre || loadingDfc ? 'spin' : ''} />
            Atualizar
          </button>
        </div>
      }
      kpiStrip={
        showKpis ? (
          <StatementsKpiStrip
            dreData={dreData}
            dfcData={dfcData}
            loadingDfc={loadingDfc}
            onOpenDfc={handleOpenDfc}
          />
        ) : null
      }
      subNav={
        <HubTabBar
          tabs={STATEMENT_TABS}
          activeId={view}
          onChange={setView}
          ariaLabel="Tipo de demonstrativo"
          variant="secondary"
          size="sm"
          panelIdPrefix="finance-statements-panel-"
        />
      }
    >
      {activeError ? (
        <ErrorBanner message={activeError} onRetry={loadActive} className="finance-statements-panel__banner" />
      ) : null}
      {activeData?.truncated ? (
        <StatusBanner variant="warning" className="finance-statements-panel__banner">
          Período com muitos lançamentos — o resultado pode estar incompleto (limite de coleta).
        </StatusBanner>
      ) : null}

      {activeLoading ? (
        <PageSkeleton variant="list" rows={8} />
      ) : !activeError && !hasMovement ? (
        <EmptyState
          variant="default"
          tone="dashed"
          icon={BarChart3}
          title="Sem movimentação no período"
          description="Não há lançamentos classificados para este mês neste demonstrativo."
          role="status"
        />
      ) : view === STATEMENT_VIEWS.DRE ? (
        <DrePanel data={dreData} compareMonth={dreData?.compareMonth} periodLabel={periodLabel} />
      ) : (
        <DfcPanel data={dfcData} compareMonth={dfcData?.compareMonth} periodLabel={periodLabel} />
      )}
    </FinanceTabShell>
  );
}

function compareMonthLabel(compareMonth) {
  if (!compareMonth) return '';
  const { from, to } = monthPeriodBounds(compareMonth);
  return `Comparativo: ${formatPeriodRangeBr(from, to)}`;
}
