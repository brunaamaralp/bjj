import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';

import { fetchFinanceSummary, fetchMonthlyClosing } from '../lib/financeTxApi.js';
import { CASH_CLOSING_UPDATED_EVENT } from '../lib/financeTermHints.js';

import { getFinanceRegime } from '../lib/financeCompetence.js';

import { useSearchParams, Navigate } from 'react-router-dom';

import { databases, DB_ID, ACADEMIES_COL } from '../lib/appwrite';

import { mergeFinanceConfigFromAcademyDoc } from '../lib/financeConfigStorage.js';
import { mergeCollectionIntoFinanceConfig, readCollectionSettingsFromAcademy } from '../lib/collectionRules.js';

import { useLeadStore } from '../store/useLeadStore';

import { useUiStore } from '../store/useUiStore';

import { friendlyError } from '../lib/errorMessages';

import { resolveHubTab } from '../lib/hubTabs';

import {

  financeiroLegacyTabToSlug,

  buildFinanceiroAllowedLeafTabs,

  getFinanceiroDefaultTab,

  FINANCEIRO_SECTIONS,

  isFinanceiroConfigTabSlug,

  isFinanceiroDreLegacyTab,

  EMPRESA_FINANCE_CONFIG_PATH,

  FINANCEIRO_EXTRATO_TAB,

  hasExplicitFinanceiroTabParam,

} from '../lib/financeiroHubTabs.js';

import { useUserRole } from '../lib/useUserRole';

import TransacoesTab from '../components/finance/TransacoesTab.jsx';

import ForecastTab from '../components/finance/ForecastTab.jsx';

import ReconciliationTab from '../components/finance/ReconciliationTab.jsx';

import MonthlyClosingTab from '../components/finance/MonthlyClosingTab.jsx';

import FinanceiroHubTabs from '../components/finance/FinanceiroHubTabs.jsx';
import VisaoGeralTab from '../components/finance/VisaoGeralTab.jsx';
import MensalidadesPanel from '../components/finance/MensalidadesPanel.jsx';
import CaixaAccountingPanel from '../components/finance/CaixaAccountingPanel.jsx';
import FinanceMonthPicker from '../components/finance/FinanceMonthPicker.jsx';

import { useNlPageContext } from '../hooks/useNlPageContext.js';
import PageHeader from '../components/layout/PageHeader.jsx';
import { currentMonthYm, monthPeriodBounds } from '../lib/financeiroOverview.js';

import '../components/finance/finance.css';



const defaultFinanceConfig = () => ({

  cardFees: {

    pix: { percent: 0, fixed: 0 },

    debito: { percent: 0, fixed: 0 },

    credito_avista: { percent: 0, fixed: 0 },

    credito_parcelado: { '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0, '9': 0, '10': 0, '11': 0, '12': 0 },

  },

  bankAccounts: [],

  plans: [],

});



const TAB_SUBTITLES = {

  [FINANCEIRO_SECTIONS.OVERVIEW]: 'Resumo financeiro da academia',

  [FINANCEIRO_SECTIONS.MENSALIDADES]: 'Cobrança e controle de mensalidades',

  movimentacoes: 'Lançamentos do caixa — entradas, saídas e recorrências',

  previsao: 'Previsão de caixa com base em mensalidades em aberto e lançamentos pendentes',

  fechamento: 'Conferência do mês — não trava lançamentos',

  conciliacao: 'Conciliação de extratos bancários com lançamentos do Nave',

  [FINANCEIRO_EXTRATO_TAB]: 'Lançamentos contábeis e extrato por conta',

};



/** Hub Financeiro (rota /financeiro). */

export default function Caixa() {
  const [searchParams, setSearchParams] = useSearchParams();

  const academyId = useLeadStore((s) => s.academyId);

  const academyList = useLeadStore((s) => s.academyList);

  const modules = useLeadStore((s) => s.modules);

  const addToast = useUiStore((s) => s.addToast);

  const [financeConfig, setFinanceConfig] = useState(defaultFinanceConfig);

  const [transactionsForNl, setTransactionsForNl] = useState([]);

  const [referenceMonth, setReferenceMonth] = useState(() => currentMonthYm());

  const [periodFrom, setPeriodFrom] = useState('');

  const [periodTo, setPeriodTo] = useState('');

  const [periodBalance, setPeriodBalance] = useState(null);

  const [summaryLoading, setSummaryLoading] = useState(false);
  const summaryReqRef = useRef(0);
  const [conferredMonths, setConferredMonths] = useState(() => new Set());



  const academyDoc = useMemo(() => {

    if (!academyId) return null;

    const a = (academyList || []).find((x) => x.id === academyId);

    if (!a) return null;

    return { ownerId: String(a.ownerId || ''), teamId: String(a.teamId || '') };

  }, [academyList, academyId]);



  const navRole = useUserRole(academyDoc);

  const isOwner = navRole === 'owner';

  const isAdmin = navRole === 'admin';

  const financeModule = modules?.finance === true;



  const allowedLeafTabs = useMemo(
    () => new Set(buildFinanceiroAllowedLeafTabs({ navRole, financeModule })),
    [navRole, financeModule]
  );

  const tabParam = searchParams.get('tab');
  const hasExplicitTab = hasExplicitFinanceiroTabParam(tabParam);
  const defaultTab = getFinanceiroDefaultTab({ isOwner, isAdmin });
  const rawTab = financeiroLegacyTabToSlug(tabParam);

  if (isFinanceiroConfigTabSlug(rawTab)) {
    return <Navigate to={EMPRESA_FINANCE_CONFIG_PATH} replace />;
  }

  if (isFinanceiroDreLegacyTab(rawTab)) {
    return <Navigate to="/reports?tab=financeiro" replace />;
  }

  const activeTab = hasExplicitTab
    ? resolveHubTab(rawTab, allowedLeafTabs, defaultTab)
    : defaultTab;



  const academyName = useMemo(() => {

    const cur = (academyList || []).find((a) => a.id === academyId);

    return String(cur?.name || '').trim();

  }, [academyList, academyId]);

  const nlPageCtx = useMemo(
    () => ({
      context: 'financeiro',
      pendingTransactions: activeTab === 'movimentacoes' ? transactionsForNl : [],
    }),
    [activeTab, transactionsForNl]
  );
  useNlPageContext(nlPageCtx);

  useEffect(() => {
    if (!hasExplicitTab) {
      if (tabParam !== activeTab) {
        setSearchParams({ tab: activeTab }, { replace: true });
      }
      return;
    }
    const normalized = financeiroLegacyTabToSlug(tabParam);
    if (!allowedLeafTabs.has(normalized) || normalized !== activeTab) {
      setSearchParams({ tab: activeTab }, { replace: true });
    }
  }, [activeTab, allowedLeafTabs, hasExplicitTab, tabParam, setSearchParams]);

  useEffect(() => {
    if (!academyId || !financeModule) return undefined;
    let active = true;
    const ym = String(referenceMonth || '').trim();
    if (!ym) return undefined;
    const regime = getFinanceRegime(academyId);
    fetchMonthlyClosing({ academyId, month: ym, regime })
      .then((data) => {
        if (!active) return;
        setConferredMonths((prev) => {
          const next = new Set(prev);
          if (data?.cashClosing) next.add(ym);
          else next.delete(ym);
          return next;
        });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [academyId, referenceMonth, financeModule]);

  useEffect(() => {
    function onClosingUpdated(ev) {
      const ym = String(ev?.detail?.referenceMonth || '').trim();
      const aid = String(ev?.detail?.academyId || '').trim();
      if (!ym || (aid && aid !== academyId)) return;
      setConferredMonths((prev) => new Set(prev).add(ym));
    }
    window.addEventListener(CASH_CLOSING_UPDATED_EVENT, onClosingUpdated);
    return () => window.removeEventListener(CASH_CLOSING_UPDATED_EVENT, onClosingUpdated);
  }, [academyId]);



  useEffect(() => {

    if (!academyId) return;

    const st = useLeadStore.getState();

    if (st.financeConfig != null && st.financeConfigAcademyId === academyId) {

      Promise.resolve().then(() => setFinanceConfig(st.financeConfig));

      return;

    }

    const loadAid = academyId;

    databases

      .getDocument(DB_ID, ACADEMIES_COL, academyId)

      .then((doc) => {

        if (loadAid !== useLeadStore.getState().academyId) return;

        let cfg = mergeFinanceConfigFromAcademyDoc(doc);
        if (!cfg || Object.keys(cfg).length === 0) {
          cfg = defaultFinanceConfig();
        }
        if (!(cfg.plans?.length || cfg.bankAccounts?.length || cfg.cardFees)) {
          cfg = { ...defaultFinanceConfig(), ...cfg };
          if (
            typeof doc.debitPercentage !== 'undefined' ||
            typeof doc.creditPercentage !== 'undefined' ||
            typeof doc.creditInstallmentPercentage !== 'undefined'
          ) {
            const deb = Number(doc.debitPercentage ?? 0) || 0;
            const cre = Number(doc.creditPercentage ?? 0) || 0;
            const crePar = Number(doc.creditInstallmentPercentage ?? 0) || 0;
            const parcelasMap = {};
            for (let i = 2; i <= 12; i++) parcelasMap[String(i)] = crePar;
            cfg.cardFees = {
              pix: { percent: 0, fixed: 0 },
              debito: { percent: deb, fixed: 0 },
              credito_avista: { percent: cre, fixed: 0 },
              credito_parcelado: parcelasMap,
            };
          }
        }
        cfg = mergeCollectionIntoFinanceConfig(cfg, readCollectionSettingsFromAcademy(doc));

        if (loadAid !== useLeadStore.getState().academyId) return;

        setFinanceConfig(cfg);

        useLeadStore.getState().setFinanceConfig(cfg);

      })

      .catch((e) => {

        console.error(e);

        addToast({ type: 'error', message: friendlyError(e, 'action') });

      });

  }, [academyId, addToast]);



  const setTab = (id) => setSearchParams({ tab: id }, { replace: false });

  useEffect(() => {
    if (activeTab !== 'movimentacoes') return;
    const { from, to } = monthPeriodBounds(referenceMonth);
    setPeriodFrom((prev) => (prev === from ? prev : from));
    setPeriodTo((prev) => (prev === to ? prev : to));
  }, [activeTab, referenceMonth]);

  const handlePeriodFiltersChange = useCallback((from, to) => {
    setPeriodFrom((prev) => (prev === from ? prev : from));
    setPeriodTo((prev) => (prev === to ? prev : to));
  }, []);

  const handleTransactionsChange = useCallback((pending) => {
    setTransactionsForNl((prev) => {
      const next = Array.isArray(pending) ? pending : [];
      if (prev.length === next.length && prev.every((tx, i) => tx.id === next[i]?.id)) {
        return prev;
      }
      return next;
    });
  }, []);

  const subtitle = TAB_SUBTITLES[activeTab] || TAB_SUBTITLES.movimentacoes;



  const loadPeriodSummary = useCallback(async () => {
    if (!academyId || !periodFrom || !periodTo) return;

    const reqId = ++summaryReqRef.current;
    setSummaryLoading(true);

    try {

      const s = await fetchFinanceSummary({

        academyId,

        from: periodFrom,

        to: periodTo,

        regime: getFinanceRegime(academyId),

      });

      if (reqId !== summaryReqRef.current) return;
      setPeriodBalance(s);

    } catch {

      if (reqId !== summaryReqRef.current) return;
      setPeriodBalance(null);

    } finally {

      if (reqId === summaryReqRef.current) setSummaryLoading(false);

    }

  }, [academyId, periodFrom, periodTo]);



  useEffect(() => {

    if (activeTab === 'movimentacoes' && academyId) void loadPeriodSummary();

  }, [activeTab, academyId, loadPeriodSummary]);



  return (

    <div className="container navi-hub-page finance-page-root">

      <div className="finance-page-inner">

        <PageHeader
          className="navi-page-header--flush navi-hub-page__head"
          title="Financeiro"
          subtitle="Controle entradas, saídas e fechamentos."
          meta={
            activeTab === 'movimentacoes' ||
            activeTab === 'fechamento' ||
            activeTab === FINANCEIRO_SECTIONS.MENSALIDADES
              ? undefined
              : `${subtitle}${academyName ? ` · ${academyName}` : ''}`
          }
          actions={
            <FinanceMonthPicker
              value={referenceMonth}
              onChange={setReferenceMonth}
              isConferred={conferredMonths.has(referenceMonth)}
            />
          }
        />



        <FinanceiroHubTabs

          activeLeafTab={activeTab}

          onLeafChange={setTab}

          access={{ navRole, isOwner, financeModule }}

        />



        {activeTab === FINANCEIRO_SECTIONS.OVERVIEW && academyId ? (
          <VisaoGeralTab
            academyId={academyId}
            financeModule={financeModule}
            modules={modules}
            isOwner={isOwner}
            referenceMonth={referenceMonth}
          />
        ) : null}

        {activeTab === FINANCEIRO_SECTIONS.MENSALIDADES && academyId ? (
          <MensalidadesPanel
            embedded
            referenceMonth={referenceMonth}
            onReferenceMonthChange={setReferenceMonth}
          />
        ) : null}



        {academyId && activeTab === 'movimentacoes' ? (

          <div
            className="card finance-period-balance"
            role="status"
            title="Mensalidade paga gera entrada automática no Caixa; mensalidade pendente não cria lançamento pendente aqui."
          >
            <div className="flex justify-between items-center gap-2 finance-period-balance__row">
              <div>
                <p className="text-small text-muted finance-period-balance__label">
                  Saldo do período (entradas liquidadas − saídas)
                </p>
                <p className="navi-section-heading finance-period-balance__value">
                  {summaryLoading
                    ? '…'
                    : periodBalance != null
                      ? Number(periodBalance.periodBalance || 0).toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })
                      : '—'}
                </p>
              </div>
              <p className="text-small text-muted finance-period-balance__hint">
                Atualiza conforme o período De/Até em Lançamentos (o mês do cabeçalho define o intervalo inicial).
              </p>
            </div>
          </div>

        ) : null}



        {academyId && activeTab === 'movimentacoes' ? (

          <TransacoesTab
            academyId={academyId}
            financeConfig={financeConfig}
            isOwner={isOwner}
            isAdmin={isAdmin}
            highlightTxId={String(searchParams.get('tx') || '').trim()}
            onTransactionsChange={handleTransactionsChange}
            periodFrom={periodFrom}
            periodTo={periodTo}
            onPeriodFiltersChange={handlePeriodFiltersChange}
            onTxMutated={loadPeriodSummary}
          />

        ) : null}

        {academyId && activeTab === 'previsao' && financeModule && navRole !== 'member' ? (

          <ForecastTab academyId={academyId} />

        ) : null}

        {academyId && activeTab === 'conciliacao' && financeModule && isOwner ? (

          <ReconciliationTab academyId={academyId} />

        ) : null}

        {academyId && activeTab === 'fechamento' && financeModule && navRole !== 'member' ? (

          <MonthlyClosingTab
            academyId={academyId}
            academyName={academyName}
            financeConfig={financeConfig}
            modules={modules}
            referenceMonth={referenceMonth}
            onReferenceMonthChange={setReferenceMonth}
          />

        ) : null}

        {academyId && activeTab === FINANCEIRO_EXTRATO_TAB && isOwner && financeModule ? (
          <CaixaAccountingPanel scope="operational" isOwner={isOwner} />
        ) : null}

      </div>

    </div>

  );

}


