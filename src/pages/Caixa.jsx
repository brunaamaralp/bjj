import React, { useEffect, useMemo, useState, useCallback } from 'react';

import { fetchFinanceSummary } from '../lib/financeTxApi.js';

import { getFinanceRegime } from '../lib/financeCompetence.js';

import { useSearchParams } from 'react-router-dom';

import { databases, DB_ID, ACADEMIES_COL } from '../lib/appwrite';

import { useLeadStore } from '../store/useLeadStore';

import { useUiStore } from '../store/useUiStore';

import { friendlyError } from '../lib/errorMessages';

import { resolveHubTab } from '../lib/hubTabs';

import {

  financeiroLegacyTabToSlug,

  buildFinanceiroAllowedLeafTabs,

  FINANCEIRO_SECTIONS,

} from '../lib/financeiroHubTabs.js';

import { useUserRole } from '../lib/useUserRole';

import TransacoesTab from '../components/finance/TransacoesTab.jsx';

import ForecastTab from '../components/finance/ForecastTab.jsx';

import ReconciliationTab from '../components/finance/ReconciliationTab.jsx';

import MonthlyClosingTab from '../components/finance/MonthlyClosingTab.jsx';

import CaixaAccountingPanel from '../components/finance/CaixaAccountingPanel.jsx';

import FinanceiroHubTabs from '../components/finance/FinanceiroHubTabs.jsx';
import VisaoGeralTab from '../components/finance/VisaoGeralTab.jsx';
import MensalidadesPanel from '../components/finance/MensalidadesPanel.jsx';
import ConfigTab from '../components/finance/ConfigTab.jsx';

import NlCommandBar, { NlCommandBarTrigger } from '../components/NlCommandBar';

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



const OWNER_EXTRA_LEAF = ['conciliacao', 'plano', 'razao', 'dre'];

const TAB_SUBTITLES = {

  [FINANCEIRO_SECTIONS.OVERVIEW]: 'Resumo financeiro da academia',

  [FINANCEIRO_SECTIONS.MENSALIDADES]: 'Cobrança e controle de mensalidades',

  [FINANCEIRO_SECTIONS.CONFIG]: 'Planos, taxas, contas e regras de cobrança',

  movimentacoes: 'Movimentações e lançamentos do dia a dia',

  previsao: 'Previsão de caixa com base em mensalidades em aberto e lançamentos pendentes',

  fechamento: 'Painel de conferência — não trava lançamentos nem gera documento de fechamento',

  conciliacao: 'Conciliação de extratos bancários com lançamentos do Nave',

  plano: 'Plano de contas',

  razao: 'Livro razão',

  dre: 'Demonstrações DRE e DFC',

};



/** Hub Financeiro (rota /financeiro). */

export default function Caixa() {
  const [searchParams, setSearchParams] = useSearchParams();

  const academyId = useLeadStore((s) => s.academyId);

  const academyList = useLeadStore((s) => s.academyList);

  const modules = useLeadStore((s) => s.modules);

  const addToast = useUiStore((s) => s.addToast);

  const [financeConfig, setFinanceConfig] = useState(defaultFinanceConfig);

  const [nlOpen, setNlOpen] = useState(false);

  const [transactionsForNl, setTransactionsForNl] = useState([]);

  const [periodFrom, setPeriodFrom] = useState('');

  const [periodTo, setPeriodTo] = useState('');

  const [periodBalance, setPeriodBalance] = useState(null);

  const [summaryLoading, setSummaryLoading] = useState(false);



  const academyDoc = useMemo(() => {

    if (!academyId) return null;

    const a = (academyList || []).find((x) => x.id === academyId);

    if (!a) return null;

    return { ownerId: String(a.ownerId || ''), teamId: String(a.teamId || '') };

  }, [academyList, academyId]);



  const navRole = useUserRole(academyDoc);

  const isOwner = navRole === 'owner';

  const financeModule = modules?.finance === true;



  const allowedLeafTabs = useMemo(
    () => new Set(buildFinanceiroAllowedLeafTabs({ isOwner, financeModule })),
    [isOwner, financeModule]
  );

  const rawTab = financeiroLegacyTabToSlug(searchParams.get('tab'));

  const activeTab = resolveHubTab(rawTab, allowedLeafTabs, FINANCEIRO_SECTIONS.OVERVIEW);



  const academyName = useMemo(() => {

    const cur = (academyList || []).find((a) => a.id === academyId);

    return String(cur?.name || '').trim();

  }, [academyList, academyId]);



  useEffect(() => {

    const normalized = financeiroLegacyTabToSlug(searchParams.get('tab'));

    if (!allowedLeafTabs.has(normalized) || normalized !== activeTab) {

      setSearchParams({ tab: activeTab }, { replace: true });

    }

  }, [activeTab, allowedLeafTabs, searchParams, setSearchParams]);



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

        let cfg = null;

        try {

          cfg = doc.financeConfig

            ? typeof doc.financeConfig === 'string'

              ? JSON.parse(doc.financeConfig)

              : doc.financeConfig

            : null;

        } catch {

          cfg = null;

        }

        if (!cfg) {

          cfg = defaultFinanceConfig();

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



  const subtitle = TAB_SUBTITLES[activeTab] || TAB_SUBTITLES.movimentacoes;



  const loadPeriodSummary = useCallback(async () => {

    if (!academyId) return;

    setSummaryLoading(true);

    try {

      const s = await fetchFinanceSummary({

        academyId,

        from: periodFrom,

        to: periodTo,

        regime: getFinanceRegime(academyId),

      });

      setPeriodBalance(s);

    } catch {

      setPeriodBalance(null);

    } finally {

      setSummaryLoading(false);

    }

  }, [academyId, periodFrom, periodTo]);



  useEffect(() => {

    if (activeTab === 'movimentacoes' && academyId) void loadPeriodSummary();

  }, [activeTab, academyId, loadPeriodSummary]);



  return (

    <div className="finance-page-root navi-hub-page">

      <div className="finance-page-inner navi-hub-page__body">

        <header className="navi-hub-page__head animate-in">

          <h1 className="navi-page-title">Financeiro</h1>

          <p className="navi-eyebrow finance-hub-eyebrow">

            {subtitle}

            {academyName ? ` · ${academyName}` : ''}

          </p>

          {activeTab === 'movimentacoes' && (

            <div className="page-header-card">

              <div className="page-header-row">

                <NlCommandBarTrigger onClick={() => setNlOpen(true)} />

                <div className="finance-hub-header-spacer" />

              </div>

            </div>

          )}

        </header>



        <FinanceiroHubTabs

          activeLeafTab={activeTab}

          onLeafChange={setTab}

          access={{ isOwner, financeModule }}

        />



        {activeTab === FINANCEIRO_SECTIONS.OVERVIEW && academyId ? (
          <VisaoGeralTab academyId={academyId} financeModule={financeModule} modules={modules} />
        ) : null}

        {activeTab === FINANCEIRO_SECTIONS.MENSALIDADES && academyId ? (
          <MensalidadesPanel embedded />
        ) : null}



        {activeTab === FINANCEIRO_SECTIONS.CONFIG && isOwner && academyId ? (
          <ConfigTab academyId={academyId} />
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
                Atualiza conforme o filtro de datas em Movimentações.
              </p>
            </div>
          </div>

        ) : null}



        {academyId && activeTab === 'movimentacoes' ? (

          <TransacoesTab

            academyId={academyId}

            financeConfig={financeConfig}

            isOwner={isOwner}

            onTransactionsChange={setTransactionsForNl}

            periodFrom={periodFrom}

            periodTo={periodTo}

            onPeriodFiltersChange={(from, to) => {

              setPeriodFrom(from);

              setPeriodTo(to);

            }}

            onTxMutated={loadPeriodSummary}

          />

        ) : null}

        {academyId && activeTab === 'previsao' && financeModule ? (

          <ForecastTab academyId={academyId} />

        ) : null}

        {academyId && activeTab === 'conciliacao' && financeModule && isOwner ? (

          <ReconciliationTab academyId={academyId} />

        ) : null}

        {academyId && activeTab === 'fechamento' && financeModule ? (

          <MonthlyClosingTab

            academyId={academyId}

            academyName={academyName}

            financeConfig={financeConfig}

            modules={modules}

          />

        ) : null}

        {isOwner && OWNER_EXTRA_LEAF.includes(activeTab) ? (

          <CaixaAccountingPanel activeTab={activeTab} onGoToRazao={() => setTab('razao')} />

        ) : null}

      </div>

      <NlCommandBar

        open={nlOpen}

        onOpenChange={setNlOpen}

        academyName={academyName}

        pendingTransactions={transactionsForNl}

      />

    </div>

  );

}


