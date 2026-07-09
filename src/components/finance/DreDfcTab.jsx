import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BarChart3, Download, RefreshCw } from 'lucide-react';
import { fetchFinanceCascade, fetchFinanceDfc, fetchFinanceDre } from '../../lib/financeTxApi.js';
import { DRE_DISPLAY_GROUPS, UNCLASSIFIED_DRE_GROUP } from '../../lib/financeCategories.js';
import { DFC_GROUP_ORDER } from '../../lib/financeDfcMapping.js';
import { FINANCE_REGIME } from '../../lib/financeCompetence.js';
import {
  buildFinanceLancamentosPath,
  FINANCE_STATEMENT_VIEWS,
} from '../../lib/financeiroHubTabs.js';
import {
  formatMonthTitleCapitalized,
  formatPeriodRangeBr,
  monthPeriodBounds,
  overviewPeriodContext,
} from '../../lib/financeiroOverview.js';
import { buildCascadeCsvMatrix, buildDfcCsvMatrix, buildDreCsvMatrix } from '../../lib/financeStatementsExport.js';
import {
  CASCADE_DISPLAY_ROWS,
  cascadeRowAmount,
  cascadeRowCategories,
} from '../../lib/financeCascadeDisplay.js';
import { downloadCsvMatrix } from '../../lib/reportsExport.js';
import { useToast } from '../../hooks/useToast.js';
import { fmt } from './financeFmt.js';
import FinanceTabShell from './FinanceTabShell.jsx';
import HubTabBar from '../shared/HubTabBar.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import StatusBanner from '../shared/StatusBanner.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import FinanceLabelWithHint from './FinanceLabelWithHint.jsx';

const STATEMENT_VIEWS = FINANCE_STATEMENT_VIEWS;

const STATEMENT_TABS = [
  { id: STATEMENT_VIEWS.DRE, label: 'DRE', shortLabel: 'DRE' },
  { id: STATEMENT_VIEWS.DFC, label: 'DFC', shortLabel: 'DFC' },
  { id: STATEMENT_VIEWS.CASCADE, label: 'Cascata', shortLabel: 'Cascata' },
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

function parseStatementViewParam(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === STATEMENT_VIEWS.DFC) return STATEMENT_VIEWS.DFC;
  if (v === STATEMENT_VIEWS.CASCADE) return STATEMENT_VIEWS.CASCADE;
  return STATEMENT_VIEWS.DRE;
}

function CategoryLancamentosLink({ label, month, statementView, className = '' }) {
  const regime =
    statementView === STATEMENT_VIEWS.DRE ? FINANCE_REGIME.COMPETENCE : FINANCE_REGIME.CASH;
  const to = buildFinanceLancamentosPath({ month, category: label, regime });
  return (
    <Link
      to={to}
      className={['finance-statements-category__link', className].filter(Boolean).join(' ')}
      title={`Ver lançamentos: ${label}`}
    >
      {label}
    </Link>
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
  referenceMonth = '',
  statementView = STATEMENT_VIEWS.DRE,
}) {
  const visibleCats = visibleDreCategories(categories);
  const hasChildren = visibleCats.length > 0;
  const rowClass = [
    'finance-statements-row',
    isTotal ? 'finance-statements-row--total' : '',
    hasChildren ? 'finance-statements-row--group-header' : '',
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
      <div className={rowClass}>
        {labelNode}
        <span className="finance-statements-row__value">{fmt(amount)}</span>
        <span className={`finance-statements-row__delta ${deltaClass(label, delta, deltaMode)}`}>
          {fmtDelta(delta)}
        </span>
      </div>
      {hasChildren ? (
        <ul className="finance-statements-categories finance-statements-categories--open">
          {visibleCats.map((cat) => (
            <li key={cat.key || cat.label} className="finance-statements-category">
              <span className="finance-statements-category__label">
                <CategoryLancamentosLink
                  label={cat.label}
                  month={referenceMonth}
                  statementView={statementView}
                />
              </span>
              <span className="finance-statements-category__value">{fmt(cat.amount)}</span>
              {cat.pctOfRevenue != null ? (
                <span className="finance-statements-category__pct" title="% da receita bruta">
                  {Number(cat.pctOfRevenue).toFixed(1)}%
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function DfcGroupRow({ label, group, delta, referenceMonth = '' }) {
  const visibleCats = visibleDfcCategories(group?.categories);
  const hasChildren = visibleCats.length > 0;
  const rowClass = [
    'finance-statements-row',
    'finance-statements-row--dfc',
    hasChildren ? 'finance-statements-row--group-header' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const cells = (
    <>
      <span
        className="finance-statements-row__inflow finance-statements-row__metric finance-value-positive"
        data-label="Entradas"
      >
        {fmt(group.inflow)}
      </span>
      <span
        className="finance-statements-row__outflow finance-statements-row__metric finance-value-negative"
        data-label="Saídas"
      >
        {fmt(group.outflow)}
      </span>
      <span className="finance-statements-row__value finance-statements-row__metric" data-label="Líquido">
        {fmt(group.net)}
      </span>
      <span
        className={`finance-statements-row__delta finance-statements-row__metric ${deltaClass(label, delta, 'neutral')}`}
        data-label="vs mês ant."
      >
        {fmtDelta(delta)}
      </span>
    </>
  );

  return (
    <div className="finance-statements-group finance-statements-group--dfc">
      <div className={rowClass}>
        <span className="finance-statements-row__label">{label}</span>
        {cells}
      </div>
      {hasChildren ? (
        <ul className="finance-statements-categories finance-statements-categories--dfc finance-statements-categories--open">
          {visibleCats.map((cat) => (
            <li key={cat.key || cat.label} className="finance-statements-category">
              <span className="finance-statements-category__label">
                <CategoryLancamentosLink
                  label={cat.label}
                  month={referenceMonth}
                  statementView={STATEMENT_VIEWS.DFC}
                />
              </span>
              <span
                className="finance-statements-category__inflow finance-statements-row__metric finance-value-positive"
                data-label="Entradas"
              >
                {fmt(cat.inflow)}
              </span>
              <span
                className="finance-statements-category__outflow finance-statements-row__metric finance-value-negative"
                data-label="Saídas"
              >
                {fmt(cat.outflow)}
              </span>
              <span
                className="finance-statements-category__value finance-statements-row__metric"
                data-label="Líquido"
              >
                {fmt(cat.net)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
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

function DrePanel({ data, compareMonth, periodLabel, referenceMonth }) {
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
        {' '}
        Detalhamento por categoria (Mensalidades, Matrículas, despesas…) logo abaixo de cada linha.
      </p>
      <p className="finance-statements-panel__sign-note text-muted text-xs" role="note">
        Despesas e custos aparecem com sinal negativo; receitas e resultados permanecem positivos.
      </p>
      {statement.meta?.competenceFallbackCount > 0 ? (
        <StatusBanner variant="info" className="finance-statements-panel__banner">
          {statement.meta.competenceFallbackCount} lançamento(s) sem competência explícita usaram a
          data de liquidação.
        </StatusBanner>
      ) : null}
      <div className="finance-statements-table" aria-label="Demonstração do resultado">
        <div className="finance-statements-table__head">
          <span>Conta / categoria</span>
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
            referenceMonth={referenceMonth}
            statementView={STATEMENT_VIEWS.DRE}
          />
        ))}
      </div>
    </div>
  );
}

function DfcPanel({ data, compareMonth, periodLabel, referenceMonth }) {
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
        {' '}
        Categorias (Mensalidades, Matrículas, despesas…) aparecem indentadas sob cada grupo de fluxo.
      </p>
      <div
        className="finance-statements-table finance-statements-table--dfc"
        aria-label="Fluxo de caixa"
      >
        <div className="finance-statements-table__head finance-statements-table__head--dfc">
          <span>Grupo / categoria</span>
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
              referenceMonth={referenceMonth}
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

function CascadePanel({ data, compareMonth, periodLabel, referenceMonth }) {
  const statement = data?.statement;
  const delta = data?.delta;

  if (!statement) return null;

  const recon = statement.bankReconciliation || {};
  const unclassified = Number(statement.cascadeData?.nao_classificado || 0);

  const rows = CASCADE_DISPLAY_ROWS.map((row) => {
    const amount = cascadeRowAmount(statement, row);
    const categories = cascadeRowCategories(statement, row);
    const visibleCats = categories.filter((cat) => Math.abs(Number(cat.net ?? 0)) > 0.009);
    return {
      ...row,
      amount,
      delta: delta?.lines?.[row.key],
      categories: visibleCats,
      warn: row.warn && Math.abs(Number(amount || 0)) > 0.009,
    };
  }).filter((row) => {
    if (row.kind === 'total' || row.kind === 'recon') return true;
    if (Math.abs(Number(row.amount || 0)) > 0.009) return true;
    return row.categories.length > 0;
  });

  return (
    <div
      className="finance-reports-block finance-statements-panel"
      role="tabpanel"
      id="finance-statements-panel-cascade"
      aria-labelledby="finance-statements-panel-tab-cascade"
    >
      <h4 className="finance-statements-panel__title">Fluxo de Caixa Gerencial (cascata)</h4>
      <p className="finance-statements-panel__hint text-muted text-sm" role="note">
        {periodLabel} · regime de caixa · valores líquidos · receitas agregadas splitadas pela
        proporção serviço/produto do período.
        {compareMonth ? ` Comparativo com ${formatMonthTitleCapitalized(compareMonth)}.` : null}
      </p>
      {Math.abs(unclassified) > 0.009 ? (
        <StatusBanner variant="warning" className="finance-statements-panel__banner">
          Há lançamentos não classificados ({fmt(unclassified)}) — revise categorias ou o plano de
          contas.
        </StatusBanner>
      ) : null}
      <div className="finance-statements-table" aria-label="Fluxo de caixa gerencial">
        <div className="finance-statements-table__head">
          <span>Linha / categoria</span>
          <span>Valor</span>
          <span>
            <FinanceLabelWithHint hint="Diferença absoluta em reais em relação ao mês anterior.">
              vs mês ant.
            </FinanceLabelWithHint>
          </span>
        </div>
        {rows.map((row) => (
          <StatementRow
            key={row.key}
            label={row.label}
            amount={Number(row.amount || 0)}
            delta={row.delta}
            deltaMode={row.kind === 'total' ? 'profit' : 'neutral'}
            isTotal={row.kind === 'total' || row.kind === 'recon'}
            warn={row.warn}
            categories={row.categories.map((cat) => ({
              ...cat,
              amount: cat.net,
            }))}
            referenceMonth={referenceMonth}
            statementView={STATEMENT_VIEWS.CASCADE}
          />
        ))}
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
              <dt>Variação (contas)</dt>
              <dd>{fmt(recon.variacaoSaldo)}</dd>
            </div>
            <div>
              <dt>Saldo final</dt>
              <dd>{fmt(recon.saldoFinal)}</dd>
            </div>
          </dl>
          {recon.matches === true ? (
            <p className="finance-statements-recon__ok text-small text-muted" role="status">
              Variação classificada confere com variação das contas.
            </p>
          ) : null}
          {recon.matches === false ? (
            <StatusBanner variant="warning" className="finance-statements-panel__banner">
              Gap de {fmt(recon.gap)} entre fluxo classificado e variação das contas — verifique
              lançamentos não classificados ou exclusões (transferências).
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

function hasCascadeMovement(data) {
  const statement = data?.statement;
  if (!statement?.cascadeData) return false;
  if (Math.abs(Number(statement.cascadeData.variacao_classificada || 0)) > 0.009) return true;
  return CASCADE_DISPLAY_ROWS.some((row) => {
    const amount = cascadeRowAmount(statement, row);
    return Math.abs(Number(amount || 0)) > 0.009;
  });
}

export default function DreDfcTab({ academyId, referenceMonth }) {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get('view');
  const [view, setView] = useState(() => parseStatementViewParam(viewParam));
  const [dreData, setDreData] = useState(null);
  const [dfcData, setDfcData] = useState(null);
  const [cascadeData, setCascadeData] = useState(null);
  const [loadingDre, setLoadingDre] = useState(false);
  const [loadingDfc, setLoadingDfc] = useState(false);
  const [loadingCascade, setLoadingCascade] = useState(false);
  const [errorDre, setErrorDre] = useState('');
  const [errorDfc, setErrorDfc] = useState('');
  const [errorCascade, setErrorCascade] = useState('');
  const dfcLoadedMonthRef = useRef('');
  const cascadeLoadedMonthRef = useRef('');

  useEffect(() => {
    setView(parseStatementViewParam(viewParam));
  }, [viewParam]);

  const handleViewChange = useCallback(
    (nextView) => {
      const normalized = parseStatementViewParam(nextView);
      setView(normalized);
      const next = new URLSearchParams(searchParams);
      if (normalized === STATEMENT_VIEWS.DRE) {
        next.delete('view');
      } else {
        next.set('view', normalized);
      }
      if (next.toString() !== searchParams.toString()) {
        setSearchParams(next, { replace: true });
      }
    },
    [searchParams, setSearchParams]
  );

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

  const loadCascade = useCallback(async () => {
    if (!academyId || !referenceMonth) return;
    setLoadingCascade(true);
    setErrorCascade('');
    try {
      const res = await fetchFinanceCascade({ academyId, month: referenceMonth });
      setCascadeData(res);
      cascadeLoadedMonthRef.current = referenceMonth;
    } catch (e) {
      setCascadeData(null);
      cascadeLoadedMonthRef.current = '';
      setErrorCascade(e?.message || 'Erro ao carregar cascata');
    } finally {
      setLoadingCascade(false);
    }
  }, [academyId, referenceMonth]);

  useEffect(() => {
    dfcLoadedMonthRef.current = '';
    cascadeLoadedMonthRef.current = '';
    setDreData(null);
    setDfcData(null);
    setCascadeData(null);
    void loadDre();
  }, [academyId, referenceMonth, loadDre]);

  useEffect(() => {
    if (!dreData?.statement || !academyId || !referenceMonth) return;
    if (dfcLoadedMonthRef.current === referenceMonth && dfcData?.month === referenceMonth) return;
    void loadDfc();
  }, [dreData?.statement, academyId, referenceMonth, dfcData?.month, loadDfc]);

  useEffect(() => {
    if (view !== STATEMENT_VIEWS.DFC) return;
    if (dfcLoadedMonthRef.current === referenceMonth && dfcData?.month === referenceMonth) return;
    void loadDfc();
  }, [view, referenceMonth, dfcData?.month, loadDfc]);

  useEffect(() => {
    if (view !== STATEMENT_VIEWS.CASCADE) return;
    if (cascadeLoadedMonthRef.current === referenceMonth && cascadeData?.month === referenceMonth) {
      return;
    }
    void loadCascade();
  }, [view, referenceMonth, cascadeData?.month, loadCascade]);

  const handleOpenDfc = useCallback(() => {
    handleViewChange(STATEMENT_VIEWS.DFC);
  }, [handleViewChange]);

  const loadActive = useCallback(async () => {
    if (view === STATEMENT_VIEWS.DRE) {
      await loadDre();
      return;
    }
    if (view === STATEMENT_VIEWS.DFC) {
      await loadDfc();
      return;
    }
    await loadCascade();
  }, [view, loadDre, loadDfc, loadCascade]);

  const loadAll = useCallback(async () => {
    await loadDre();
    if (view === STATEMENT_VIEWS.DFC || dfcLoadedMonthRef.current === referenceMonth) {
      await loadDfc();
    }
    if (view === STATEMENT_VIEWS.CASCADE || cascadeLoadedMonthRef.current === referenceMonth) {
      await loadCascade();
    }
  }, [loadDre, loadDfc, loadCascade, view, referenceMonth]);

  const handleExportCsv = useCallback(() => {
    if (view === STATEMENT_VIEWS.DRE) {
      if (!dreData?.statement) return;
      const { headers, rows, filename } = buildDreCsvMatrix(dreData);
      downloadCsvMatrix(headers, rows, filename);
      toast.success('DRE exportada em CSV.');
      return;
    }
    if (view === STATEMENT_VIEWS.DFC) {
      if (!dfcData?.statement) return;
      const { headers, rows, filename } = buildDfcCsvMatrix(dfcData);
      downloadCsvMatrix(headers, rows, filename);
      toast.success('DFC exportada em CSV.');
      return;
    }
    if (!cascadeData?.statement) return;
    const { headers, rows, filename } = buildCascadeCsvMatrix(cascadeData);
    downloadCsvMatrix(headers, rows, filename);
    toast.success('Cascata exportada em CSV.');
  }, [view, dreData, dfcData, cascadeData, toast]);

  const handleExportPdf = useCallback(async () => {
    if (view !== STATEMENT_VIEWS.CASCADE || !academyId || !referenceMonth) return;
    try {
      const blob = await fetchFinanceCascade({
        academyId,
        month: referenceMonth,
        format: 'pdf',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fluxo-caixa-cascata-${referenceMonth}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Cascata exportada em PDF.');
    } catch (e) {
      toast.error(e?.message || 'Erro ao exportar PDF');
    }
  }, [view, academyId, referenceMonth, toast]);

  const activeData =
    view === STATEMENT_VIEWS.DRE
      ? dreData
      : view === STATEMENT_VIEWS.DFC
        ? dfcData
        : cascadeData;
  const activeError =
    view === STATEMENT_VIEWS.DRE
      ? errorDre
      : view === STATEMENT_VIEWS.DFC
        ? errorDfc
        : errorCascade;
  const activeLoading =
    view === STATEMENT_VIEWS.DRE
      ? loadingDre
      : view === STATEMENT_VIEWS.DFC
        ? loadingDfc
        : loadingCascade;
  const hasMovement =
    view === STATEMENT_VIEWS.DRE
      ? hasDreMovement(dreData)
      : view === STATEMENT_VIEWS.DFC
        ? hasDfcMovement(dfcData)
        : hasCascadeMovement(cascadeData);
  const canExport =
    view === STATEMENT_VIEWS.DRE
      ? Boolean(dreData?.statement)
      : view === STATEMENT_VIEWS.DFC
        ? Boolean(dfcData?.statement)
        : Boolean(cascadeData?.statement);
  const canExportPdf = view === STATEMENT_VIEWS.CASCADE && Boolean(cascadeData?.statement);
  const intro = compareMonthLabel(dreData?.compareMonth || dfcData?.compareMonth);
  const showKpis = Boolean(dreData?.statement) && !loadingDre && !errorDre;

  return (
    <FinanceTabShell
      panelClassName="finance-statements-tab"
      title="DRE, DFC e Cascata"
      kpiStripBare
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
            onClick={handleExportCsv}
            disabled={!canExport || activeLoading}
          >
            <Download size={16} aria-hidden />
            Exportar CSV
          </button>
          {canExportPdf ? (
            <button
              type="button"
              className="btn-action-ghost finance-statements-actions__btn"
              onClick={() => void handleExportPdf()}
              disabled={activeLoading}
            >
              <Download size={16} aria-hidden />
              Exportar PDF
            </button>
          ) : null}
          <button
            type="button"
            className="btn-action-ghost finance-statements-actions__btn"
            onClick={() => void loadAll()}
            disabled={loadingDre || loadingDfc || loadingCascade}
            aria-busy={loadingDre || loadingDfc || loadingCascade}
          >
            <RefreshCw
              size={16}
              aria-hidden
              className={loadingDre || loadingDfc || loadingCascade ? 'spin' : ''}
            />
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
          onChange={handleViewChange}
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
          description={
            view === STATEMENT_VIEWS.DRE
              ? 'Não há lançamentos de competência classificados neste mês na DRE.'
              : view === STATEMENT_VIEWS.DFC
                ? 'Não há movimentação de caixa classificada neste mês na DFC.'
                : 'Não há movimentação de caixa classificada neste mês na cascata gerencial.'
          }
          role="status"
        />
      ) : view === STATEMENT_VIEWS.DRE ? (
        <DrePanel
          data={dreData}
          compareMonth={dreData?.compareMonth}
          periodLabel={periodLabel}
          referenceMonth={referenceMonth}
        />
      ) : view === STATEMENT_VIEWS.DFC ? (
        <DfcPanel
          data={dfcData}
          compareMonth={dfcData?.compareMonth}
          periodLabel={periodLabel}
          referenceMonth={referenceMonth}
        />
      ) : (
        <CascadePanel
          data={cascadeData}
          compareMonth={cascadeData?.compareMonth}
          periodLabel={periodLabel}
          referenceMonth={referenceMonth}
        />
      )}
    </FinanceTabShell>
  );
}

function compareMonthLabel(compareMonth) {
  if (!compareMonth) return '';
  const { from, to } = monthPeriodBounds(compareMonth);
  return `Comparativo: ${formatPeriodRangeBr(from, to)}`;
}
