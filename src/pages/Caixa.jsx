import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { fetchFinanceSummary } from '../lib/financeTxApi.js';
import { useSearchParams } from 'react-router-dom';
import { databases, DB_ID, ACADEMIES_COL } from '../lib/appwrite';
import { useLeadStore } from '../store/useLeadStore';
import { useUiStore } from '../store/useUiStore';
import { friendlyError } from '../lib/errorMessages';
import { resolveHubTab, caixaLegacyTabToSlug } from '../lib/hubTabs';
import { useUserRole } from '../lib/useUserRole';
import TransacoesTab from '../components/finance/TransacoesTab.jsx';
import MonthlyClosingTab from '../components/finance/MonthlyClosingTab.jsx';
import CaixaAccountingPanel from '../components/finance/CaixaAccountingPanel.jsx';
import HubTabBar from '../components/shared/HubTabBar.jsx';
import NlCommandBar, { NlCommandBarTrigger } from '../components/NlCommandBar';
import { FINANCE_PAGE_CSS } from '../components/finance/financePageStyles.js';

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

const MEMBER_TABS = new Set(['movimentacoes', 'fechamento']);
const OWNER_EXTRA = ['plano', 'razao', 'dre'];
const OWNER_TABS = new Set([...MEMBER_TABS, ...OWNER_EXTRA]);

const TAB_SUBTITLES = {
  movimentacoes: 'Movimentações e lançamentos do dia a dia',
  fechamento: 'Painel de conferência — não trava lançamentos nem gera documento de fechamento',
  plano: 'Plano de contas',
  razao: 'Livro razão',
  dre: 'Demonstrações DRE e DFC',
};

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
  const allowedTabs = isOwner ? OWNER_TABS : MEMBER_TABS;

  const rawTab = caixaLegacyTabToSlug(searchParams.get('tab'));
  const activeTab = resolveHubTab(rawTab, allowedTabs, 'movimentacoes');

  const academyName = useMemo(() => {
    const cur = (academyList || []).find((a) => a.id === academyId);
    return String(cur?.name || '').trim();
  }, [academyList, academyId]);

  useEffect(() => {
    const normalized = caixaLegacyTabToSlug(searchParams.get('tab'));
    if (!allowedTabs.has(normalized) || normalized !== activeTab) {
      setSearchParams({ tab: activeTab }, { replace: true });
    }
  }, [activeTab, allowedTabs, searchParams, setSearchParams]);

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

  const tabs = useMemo(() => {
    const items = [
      { id: 'movimentacoes', label: 'Movimentações' },
      ...(modules?.finance === true ? [{ id: 'fechamento', label: 'Fechamento mensal' }] : []),
    ];
    if (isOwner) {
      items.push(
        { id: 'plano', label: 'Plano de contas' },
        { id: 'razao', label: 'Razão' },
        { id: 'dre', label: 'DRE / DFC' }
      );
    }
    return items;
  }, [modules?.finance, isOwner]);

  const setTab = (id) => setSearchParams({ tab: id }, { replace: false });

  const subtitle = TAB_SUBTITLES[activeTab] || TAB_SUBTITLES.movimentacoes;

  const loadPeriodSummary = useCallback(async () => {
    if (!academyId) return;
    setSummaryLoading(true);
    try {
      const s = await fetchFinanceSummary({ academyId, from: periodFrom, to: periodTo });
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
    <div className="finance-page-root">
      <div className="finance-page-inner">
        <div className="animate-in">
          <h1 className="navi-page-title">Caixa</h1>
          <p className="navi-eyebrow" style={{ marginTop: 6, marginBottom: 14 }}>
            {subtitle}
            {academyName ? ` · ${academyName}` : ''}
          </p>
          {activeTab === 'movimentacoes' && (
            <div className="page-header-card">
              <div className="page-header-row">
                <NlCommandBarTrigger onClick={() => setNlOpen(true)} />
                <div style={{ flex: 1 }} />
              </div>
            </div>
          )}
        </div>

        <HubTabBar tabs={tabs} activeId={activeTab} onChange={setTab} ariaLabel="Caixa" />

        {academyId && activeTab === 'movimentacoes' ? (
          <div
            className="card finance-period-balance"
            style={{ marginBottom: 16, padding: '14px 18px' }}
            role="status"
            title="Mensalidade paga gera entrada automática no Caixa; mensalidade pendente não cria lançamento pendente aqui."
          >
            <div className="flex justify-between items-center gap-2" style={{ flexWrap: 'wrap' }}>
              <div>
                <p className="text-small text-muted" style={{ margin: 0 }}>
                  Saldo do período (entradas liquidadas − saídas)
                </p>
                <p className="navi-section-heading" style={{ margin: '4px 0 0', fontSize: '1.35rem' }}>
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
              <p className="text-small text-muted" style={{ margin: 0, maxWidth: 280 }}>
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
        {academyId && activeTab === 'fechamento' && modules?.finance === true ? (
          <MonthlyClosingTab
            academyId={academyId}
            academyName={academyName}
            financeConfig={financeConfig}
            modules={modules}
          />
        ) : null}
        {isOwner && OWNER_EXTRA.includes(activeTab) ? (
          <CaixaAccountingPanel activeTab={activeTab} onGoToRazao={() => setTab('razao')} />
        ) : null}
      </div>
      <style dangerouslySetInnerHTML={{ __html: FINANCE_PAGE_CSS }} />
      <NlCommandBar
        open={nlOpen}
        onOpenChange={setNlOpen}
        academyName={academyName}
        pendingTransactions={transactionsForNl}
      />
    </div>
  );
}
