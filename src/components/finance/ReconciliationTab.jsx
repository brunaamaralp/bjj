import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import './finance.css';
import './styles/recon-onboarding.css';
import { ArrowLeft, Check, FileSpreadsheet, Upload } from 'lucide-react';
import ImportStatementModal from './ImportStatementModal.jsx';
import BankReconPairRow from './BankReconPairRow.jsx';
import BankReconOrphanList, { formatSourceLabel } from './BankReconOrphanList.jsx';
import BankReconSelectionBar from './BankReconSelectionBar.jsx';
import BankReconKpiRow from './BankReconKpiRow.jsx';
import BankReconTour from './BankReconTour.jsx';
import BankReconNextPendingBar from './BankReconNextPendingBar.jsx';
import BankReconRegisterPaymentModal from './BankReconRegisterPaymentModal.jsx';
import BankReconRulesModal from './BankReconRulesModal.jsx';
import BankReconClosingHandoffCard from './BankReconClosingHandoffCard.jsx';
import {
  listBankStatements,
  getBankStatementDetail,
  confirmBankMatch,
  rememberBankPayer,
  confirmAllBankMatches,
  ignoreBankItem,
  manualReconcileTx,
  createTxFromBankItem,
  completeBankReconciliation,
} from '../../lib/bankReconciliationApi.js';
import { reconcileStudentPaymentMirrors } from '../../lib/financeTxApi.js';
import { friendlyError } from '../../lib/errorMessages';
import { useToast } from '../../hooks/useToast';
import useMediaQuery from '../../hooks/useMediaQuery.js';
import { useBankReconTour } from '../../hooks/useBankReconTour.js';
import { loadMergedFinanceConfigForAcademy } from '../../lib/prefetchFinanceConfig.js';
import { useLeadStore } from '../../store/useLeadStore';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import StatusBanner from '../shared/StatusBanner.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import ModalShell from '../shared/ModalShell.jsx';
import FinanceTabShell from './FinanceTabShell.jsx';
import SearchableSelect from '../shared/SearchableSelect.jsx';
import BankReconCreateTxModal from './BankReconCreateTxModal.jsx';
import { useAccountingStore } from '../../store/useAccountingStore';
import FinanceTxDetailDrawer from './FinanceTxDetailDrawer.jsx';
import { buildLeadNameById } from '../../lib/financeTxLeadNames.js';
import { formatReconTxSelectLabel } from '../../lib/financeReconTxLabel.js';
import { CASH_CLOSING_UPDATED_EVENT } from '../../lib/financeTermHints.js';

function closingHandoffDismissKey(statementId) {
  return `navi_recon_closing_handoff_dismiss_${String(statementId || '').trim()}`;
}

function fmtMoney(v) {
  try {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } catch {
    return `R$ ${Number(v || 0).toFixed(2)}`;
  }
}

function fmtDate(ymd) {
  const p = String(ymd || '').slice(0, 10).split('-');
  if (p.length !== 3) return '—';
  return `${p[2]}/${p[1]}/${p[0]}`;
}

const STATUS_LABELS = {
  pending: 'Pendente',
  partial: 'Parcial',
  reconciled: 'Conciliado',
};

const STATUS_BADGE_CLASS = {
  pending: 'finance-badge-pendente',
  partial: 'finance-badge-parcial',
  reconciled: 'finance-badge-pago',
};

const RECON_ERROR_MESSAGES = {
  direction_mismatch: 'A direção do lançamento não corresponde à linha do extrato.',
  amount_mismatch: 'O valor do lançamento não corresponde à linha do extrato.',
  bank_account_mismatch: 'A conta bancária não corresponde ao extrato.',
  tx_already_reconciled: 'Este lançamento já foi conciliado.',
  tx_not_settled: 'Só é possível vincular lançamentos liquidados.',
  reconciliation_schema_incomplete:
    'Conciliação indisponível: o banco de dados precisa do schema de conciliação. Rode o script de provisionamento ou fale com o suporte.',
  reconciliation_failed: 'Não foi possível concluir a conciliação. Tente novamente.',
};

function reconFriendlyError(err) {
  const code = String(err?.message || err || '').trim();
  if (RECON_ERROR_MESSAGES[code]) return RECON_ERROR_MESSAGES[code];
  if (/invalid document structure/i.test(code) || /unknown attribute/i.test(code)) {
    return RECON_ERROR_MESSAGES.reconciliation_schema_incomplete;
  }
  return friendlyError(err, 'action');
}

const FORMAT_ICONS = {
  ofx: FileSpreadsheet,
  csv: FileSpreadsheet,
  xlsx: FileSpreadsheet,
  pdf: Upload,
};

function txLabel(tx, options) {
  const fromOpts = options?.find((o) => o.value === tx?.id);
  if (fromOpts) return fromOpts.label;
  if (!tx) return 'lançamento';
  return formatReconTxSelectLabel(tx, { formatDate: fmtDate, formatMoney: fmtMoney });
}

export default function ReconciliationTab({ academyId }) {
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [statements, setStatements] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [busy, setBusy] = useState(false);
  const [manualTxId, setManualTxId] = useState('');
  const [manualNote, setManualNote] = useState('');
  const [completeNote, setCompleteNote] = useState('');
  const [error, setError] = useState('');
  const [mirrorReconcileResult, setMirrorReconcileResult] = useState(null);
  const [mirrorReconcileBusy, setMirrorReconcileBusy] = useState(false);
  const [selectedBankItemId, setSelectedBankItemId] = useState('');
  const [unmatchedTxByItem, setUnmatchedTxByItem] = useState({});
  const [showAllOrphans, setShowAllOrphans] = useState(false);
  const [focusPendingOnly, setFocusPendingOnly] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [createTxItem, setCreateTxItem] = useState(null);
  const [detailTx, setDetailTx] = useState(null);
  const [learnPayerPrompt, setLearnPayerPrompt] = useState(null);
  const [learnAutoSuggest, setLearnAutoSuggest] = useState(false);
  const [registerPaymentHint, setRegisterPaymentHint] = useState(null);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [mobilePanel, setMobilePanel] = useState('extrato');
  const [handoffDismissed, setHandoffDismissed] = useState(false);
  const dismissedLearnKeys = useRef(new Set());
  const chartAccounts = useAccountingStore((s) => s.accounts);
  const financeConfig = useLeadStore((s) =>
    s.financeConfigAcademyId === academyId ? s.financeConfig : null
  );
  const isMobileRecon = useMediaQuery('(max-width: 900px)');
  const tourBlockedByModal = Boolean(createTxItem || learnPayerPrompt || registerPaymentHint || showRulesModal);

  const { showTour, completeTour } = useBankReconTour({
    academyId,
    inDetail: Boolean(selectedId),
  });

  useEffect(() => {
    if (academyId) useAccountingStore.getState().loadByAcademy(academyId);
  }, [academyId]);

  useEffect(() => {
    if (!academyId || financeConfig) return;
    void loadMergedFinanceConfigForAcademy(academyId);
  }, [academyId, financeConfig]);

  const loadList = useCallback(async () => {
    if (!academyId) return;
    setLoading(true);
    setError('');
    try {
      const body = await listBankStatements(academyId);
      setStatements(body.statements || []);
    } catch (e) {
      console.error(e);
      setError(friendlyError(e, 'load'));
      setStatements([]);
    } finally {
      setLoading(false);
    }
  }, [academyId]);

  const loadDetail = useCallback(
    async (id) => {
      if (!academyId || !id) return;
      setDetailLoading(true);
      setError('');
      try {
        const body = await getBankStatementDetail(academyId, id);
        setDetail(body);
      } catch (e) {
        console.error(e);
        setError(friendlyError(e, 'load'));
        setDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [academyId]
  );

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    const sid = String(searchParams.get('statement') || '').trim();
    if (sid) setSelectedId(sid);
  }, [searchParams]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  useEffect(() => {
    if (!selectedId) {
      setHandoffDismissed(false);
      return;
    }
    try {
      setHandoffDismissed(sessionStorage.getItem(closingHandoffDismissKey(selectedId)) === '1');
    } catch {
      setHandoffDismissed(false);
    }
  }, [selectedId]);

  useEffect(() => {
    const onClosingUpdated = () => {
      if (selectedId) void loadDetail(selectedId);
    };
    window.addEventListener(CASH_CLOSING_UPDATED_EVENT, onClosingUpdated);
    return () => window.removeEventListener(CASH_CLOSING_UPDATED_EVENT, onClosingUpdated);
  }, [selectedId, loadDetail]);

  const dismissClosingHandoff = useCallback(() => {
    if (!selectedId) return;
    try {
      sessionStorage.setItem(closingHandoffDismissKey(selectedId), '1');
    } catch {
      /* ignore */
    }
    setHandoffDismissed(true);
  }, [selectedId]);

  useEffect(() => {
    setSelectedBankItemId('');
    setUnmatchedTxByItem({});
    setShowAllOrphans(false);
  }, [selectedId, detail?.items?.length]);

  const grouped = useMemo(() => {
    if (!detail?.items) return { auto: [], suggested: [], unmatched: [], ignored: [] };
    const txById = new Map((detail.navi_transactions || []).map((t) => [t.id, t]));
    const auto = [];
    const suggested = [];
    const unmatched = [];
    const ignored = [];

    for (const item of detail.items) {
      if (item.status === 'ignored' || item.status === 'duplicate') {
        ignored.push(item);
        continue;
      }
      if (item.status === 'matched') {
        auto.push({ item, tx: txById.get(item.matched_tx_id) });
        continue;
      }
      if (item.suggested_tx_candidates?.length >= 2) {
        suggested.push({ item, tx: null, candidates: item.suggested_tx_candidates });
        continue;
      }
      if (item.suggested_tx_id && item.match_score >= 50) {
        suggested.push({ item, tx: txById.get(item.suggested_tx_id) });
        continue;
      }
      unmatched.push({ item, tx: null });
    }
    return { auto, suggested, unmatched, ignored };
  }, [detail]);

  const manualTxOptions = useMemo(
    () =>
      (detail?.navi_unmatched || []).map((tx) => ({
        value: tx.id,
        label: formatReconTxSelectLabel(tx, { formatDate: fmtDate, formatMoney: fmtMoney }),
        searchText: (tx.search_keywords || []).join(' '),
      })),
    [detail?.navi_unmatched]
  );

  const unmatchedItems = useMemo(
    () => grouped.unmatched.map(({ item }) => item),
    [grouped.unmatched]
  );

  const leadNameById = useMemo(
    () => buildLeadNameById(detail?.navi_unmatched || [], []),
    [detail?.navi_unmatched]
  );

  const selectedBankItem = useMemo(
    () => detail?.items?.find((i) => i.id === selectedBankItemId) || null,
    [detail?.items, selectedBankItemId]
  );

  const refresh = async () => {
    await loadList();
    if (selectedId) await loadDetail(selectedId);
  };

  const onImported = (statementId, result) => {
    setSelectedId(statementId);
    void refresh();
    const parts = ['Extrato importado.'];
    if (result?.suggested_matches) {
      parts.push(`${result.suggested_matches} sugestão(ões).`);
    }
    if (result?.duplicate_count) {
      parts.push(`${result.duplicate_count} duplicata(s) ignorada(s).`);
    }
    if (result?.dedup_partial) {
      parts.push('Deduplicação parcial — extrato sem conta não verificou duplicatas por banco.');
    }
    toast.success(parts.join(' '));
  };

  const run = async (fn, { successMessage } = {}) => {
    setBusy(true);
    try {
      const result = await fn();
      await refresh();
      if (successMessage) {
        const msg = typeof successMessage === 'function' ? successMessage(result) : successMessage;
        if (msg) toast.success(msg);
      }
    } catch (e) {
      console.error(e);
      setError(reconFriendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const maybePromptLearnPayer = (learn_payer) => {
    if (!learn_payer || learn_payer.already_known) return;
    const key = `${learn_payer.lead_id}:${learn_payer.extracted_normalized}`;
    if (dismissedLearnKeys.current.has(key)) return;
    setLearnPayerPrompt(learn_payer);
  };

  const linkItemToTx = async (itemId, txId) => {
    if (!itemId || !txId) {
      setError('Selecione um lançamento para vincular.');
      return;
    }
    const tx = (detail?.navi_unmatched || []).find((t) => t.id === txId)
      || (detail?.navi_transactions || []).find((t) => t.id === txId);
    setBusy(true);
    try {
      const result = await confirmBankMatch(academyId, { item_id: itemId, transaction_id: txId });
      await refresh();
      toast.success(`Linha conciliada com ${txLabel(tx, manualTxOptions)}`);
      maybePromptLearnPayer(result.learn_payer);
    } catch (e) {
      console.error(e);
      setError(reconFriendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const closeLearnPayerPrompt = (remember = false) => {
    if (!learnPayerPrompt) return;
    const key = `${learnPayerPrompt.lead_id}:${learnPayerPrompt.extracted_normalized}`;
    dismissedLearnKeys.current.add(key);
    const payload = learnPayerPrompt;
    const autoSuggest = learnAutoSuggest;
    setLearnPayerPrompt(null);
    setLearnAutoSuggest(false);
    if (remember) {
      void rememberBankPayer(academyId, {
        lead_id: payload.lead_id,
        display: payload.extracted_display,
        auto_suggest: autoSuggest,
      })
        .then(() =>
          toast.success(
            autoSuggest ? 'Pagador e regra de sugestão salvos.' : 'Pagador salvo para este aluno.'
          )
        )
        .catch((e) => {
          console.error(e);
          toast.show({ type: 'error', message: reconFriendlyError(e) });
        });
    }
  };

  const selectBankItem = (itemId) => {
    setSelectedBankItemId(itemId);
    if (isMobileRecon && itemId) setMobilePanel('lancamentos');
  };

  const selectNextPending = () => {
    if (!unmatchedItems.length) return;
    const currentIdx = unmatchedItems.findIndex((item) => item.id === selectedBankItemId);
    const next = unmatchedItems[(currentIdx + 1) % unmatchedItems.length];
    if (next) selectBankItem(next.id);
  };

  const registerPaymentItem = useMemo(
    () =>
      registerPaymentHint && detail?.items
        ? detail.items.find((i) => i.pending_payment_hints?.some((h) => h.payment_id === registerPaymentHint.payment_id)) ||
          detail.items.find((i) => i.id === selectedBankItemId)
        : null,
    [registerPaymentHint, detail?.items, selectedBankItemId]
  );

  const requestIgnore = (item) => {
    setPendingConfirm({
      type: 'ignore',
      itemId: item.id,
      label: item.description || 'esta linha',
    });
  };

  const requestCreateTx = (item) => {
    setCreateTxItem(item);
  };

  const executePendingConfirm = () => {
    if (!pendingConfirm) return;
    const { type, itemId } = pendingConfirm;
    setPendingConfirm(null);
    if (type === 'ignore') {
      void run(() => ignoreBankItem(academyId, itemId), { successMessage: 'Linha ignorada.' });
    }
  };

  if (!academyId) return null;

  if (!selectedId) {
    const listActions = (
      <>
        <button type="button" className="btn-primary btn-sm" onClick={() => setShowImport(true)}>
          <Upload size={16} className="bank-recon-btn-icon" />
          Importar extrato
        </button>
        <button
          type="button"
          className="btn-outline btn-sm"
          disabled={mirrorReconcileBusy}
          onClick={() => {
            setMirrorReconcileBusy(true);
            setMirrorReconcileResult(null);
            void reconcileStudentPaymentMirrors(academyId)
              .then((r) => setMirrorReconcileResult(r))
              .catch((e) => setError(friendlyError(e, 'action')))
              .finally(() => setMirrorReconcileBusy(false));
          }}
        >
          {mirrorReconcileBusy ? 'Verificando…' : 'Verificar espelhos'}
        </button>
      </>
    );

    return (
      <FinanceTabShell
        panelClassName="bank-recon"
        title="Conciliação"
        actions={listActions}
        intro={
          <StatusBanner variant="info" className="finance-tab-intro">
            Importe o extrato do banco (OFX, CSV, Excel ou PDF), confira sugestões automáticas e vincule cada linha a
            um lançamento do Caixa. Itens sem correspondência podem ser vinculados manualmente, gerar novo lançamento ou
            ser ignorados.
          </StatusBanner>
        }
      >
        {mirrorReconcileResult ? (
          <StatusBanner variant={mirrorReconcileResult.failed > 0 ? 'warning' : 'success'} className="mb-3">
            {mirrorReconcileResult.repaired > 0
              ? `${mirrorReconcileResult.repaired} espelho(s) reparado(s). `
              : ''}
            {mirrorReconcileResult.failed > 0
              ? `${mirrorReconcileResult.failed} falha(s) — confira manualmente. `
              : mirrorReconcileResult.repaired === 0
                ? 'Nenhum espelho órfão encontrado nos pagamentos recentes.'
                : ''}
            ({mirrorReconcileResult.checked} verificados)
          </StatusBanner>
        ) : null}

        {loading ? <PageSkeleton variant="table" rows={4} columns={5} /> : null}
        {error ? <ErrorBanner message={error} onRetry={() => void loadList()} className="mb-3" /> : null}

        {!loading && statements.length === 0 && !error ? (
          <EmptyState
            variant="compact"
            icon={Upload}
            title="Nenhum extrato importado ainda"
            description="Importe um arquivo OFX, CSV, Excel ou PDF do seu banco para começar a conciliar."
            primaryAction={{ label: 'Importar extrato', onClick: () => setShowImport(true) }}
          />
        ) : null}

        {!loading && statements.length > 0 ? (
          <div className="finance-table-wrap">
            <table className="finance-table">
              <thead>
                <tr>
                  <th>Arquivo</th>
                  <th>Formato</th>
                  <th>Conta</th>
                  <th>Período</th>
                  <th>Importado em</th>
                  <th className="finance-num">Créditos</th>
                  <th className="finance-num">Débitos</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {statements.map((s) => {
                  const FormatIcon = FORMAT_ICONS[String(s.source_format || '').toLowerCase()] || FileSpreadsheet;
                  return (
                  <tr key={s.id}>
                    <td>{s.filename || '—'}</td>
                    <td>
                      <span className="bank-recon-format-cell">
                        <FormatIcon size={14} className="bank-recon-btn-icon" aria-hidden />
                        {formatSourceLabel(s.source_format)}
                        {s.parse_method === 'ai' ? ' (IA)' : ''}
                      </span>
                    </td>
                    <td title={s.bank_account || ''}>
                      {s.bank_account
                        ? s.bank_account.length > 20
                          ? `${s.bank_account.slice(0, 20)}…`
                          : s.bank_account
                        : '—'}
                    </td>
                    <td>
                      {fmtDate(s.period_start)} — {fmtDate(s.period_end)}
                    </td>
                    <td>{fmtDate(String(s.import_date || '').slice(0, 10))}</td>
                    <td className="finance-num">{fmtMoney(s.total_credit)}</td>
                    <td className="finance-num">{fmtMoney(s.total_debit)}</td>
                    <td>
                      <span className={STATUS_BADGE_CLASS[s.status] || 'finance-badge-neutro'}>
                        {STATUS_LABELS[s.status] || s.status}
                      </span>
                    </td>
                    <td>
                      <button type="button" className="btn-outline btn-sm" onClick={() => setSelectedId(s.id)}>
                        Abrir
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        <ImportStatementModal
          academyId={academyId}
          open={showImport}
          onClose={() => setShowImport(false)}
          onImported={onImported}
        />
      </FinanceTabShell>
    );
  }

  const summary = detail?.summary || {};
  const balanceProof = summary.balance_proof || null;
  const balanceGap = Number(balanceProof?.balance_gap ?? summary.balance_gap ?? summary.difference ?? 0);
  const st = detail?.statement;

  const workspaceEmpty =
    grouped.unmatched.length === 0 &&
    grouped.suggested.length === 0 &&
    Number(summary.pending_count || 0) === 0;

  return (
    <FinanceTabShell panelClassName="bank-recon">
      <button type="button" className="btn-outline btn-sm mb-3" onClick={() => setSelectedId('')}>
        <ArrowLeft size={14} className="bank-recon-btn-icon bank-recon-btn-icon--back" />
        Voltar aos extratos
      </button>

      {detailLoading ? <PageSkeleton variant="cards" rows={2} /> : null}

      {st && !detailLoading ? (
        <>
          <div data-recon-tour="kpi">
            <BankReconKpiRow
              filename={st.filename}
              statusLabel={STATUS_LABELS[st.status] || st.status}
              formatLabel={st.source_format ? formatSourceLabel(st.source_format) : ''}
              periodLabel={`${fmtDate(st.period_start)} — ${fmtDate(st.period_end)}`}
              bankAccountLabel={st.bank_account || ''}
              pendingCount={summary.pending_count}
              pendingAmount={summary.pending_amount}
              balanceGap={balanceGap}
              naviOrphanCount={summary.navi_orphan_count}
              balanceProof={balanceProof}
              reconciledCount={summary.reconciled_count}
              reconciledAmount={summary.reconciled_amount}
            />
          </div>

          {(detail.rules_applied || []).length > 0 ? (
            <StatusBanner variant="info" className="mb-3">
              {detail.rules_applied.length} regra(s) de pagador aplicável(is) neste extrato.{' '}
              <button type="button" className="btn-text btn-sm p-0" onClick={() => setShowRulesModal(true)}>
                Gerenciar regras
              </button>
            </StatusBanner>
          ) : null}

          {!st.bank_account ? (
            <StatusBanner variant="warning" className="mb-3">
              Este extrato não tem conta bancária associada — os lançamentos órfãos não estão filtrados por banco.
              Ao importar novos extratos, selecione a conta correspondente.
            </StatusBanner>
          ) : null}

          <div className="flex gap-2 mb-3 bank-recon-actions-head">
            {grouped.suggested.length > 0 ? (
              <button
                type="button"
                className="btn-outline btn-sm"
                data-recon-tour="confirm-all"
                disabled={busy || st.status === 'reconciled'}
                onClick={() =>
                  run(() => confirmAllBankMatches(academyId, st.id), {
                    successMessage: (r) => {
                      const n = r?.confirmed ?? grouped.suggested.length;
                      return `${n} sugestão(ões) confirmada(s).`;
                    },
                  })
                }
              >
                Confirmar sugestões ({grouped.suggested.length})
              </button>
            ) : null}
            <button
              type="button"
              className={`btn-outline btn-sm${focusPendingOnly ? ' btn-outline--active' : ''}`}
              onClick={() => setFocusPendingOnly((v) => !v)}
              aria-pressed={focusPendingOnly}
            >
              {focusPendingOnly ? 'Mostrar conciliados' : 'Focar pendências'}
            </button>
          </div>

          <BankReconSelectionBar
            item={selectedBankItem}
            onClear={() => setSelectedBankItemId('')}
            hasOrphans={(detail.navi_unmatched || []).length > 0}
          />

          {workspaceEmpty && st.status !== 'reconciled' ? (
            <StatusBanner variant="success" className="mb-3">
              Todas as linhas do extrato foram tratadas. Revise a prova de saldo e finalize a conciliação abaixo.
            </StatusBanner>
          ) : null}

          {isMobileRecon ? (
            <div className="bank-recon-mobile-tabs" role="tablist" aria-label="Painéis da conciliação">
              <button
                type="button"
                role="tab"
                aria-selected={mobilePanel === 'extrato'}
                className={`bank-recon-mobile-tabs__btn${mobilePanel === 'extrato' ? ' bank-recon-mobile-tabs__btn--active' : ''}`}
                onClick={() => setMobilePanel('extrato')}
              >
                Extrato
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mobilePanel === 'lancamentos'}
                className={`bank-recon-mobile-tabs__btn${mobilePanel === 'lancamentos' ? ' bank-recon-mobile-tabs__btn--active' : ''}`}
                onClick={() => setMobilePanel('lancamentos')}
              >
                Lançamentos
                {selectedBankItemId ? (
                  <span className="bank-recon-mobile-tabs__badge" aria-hidden>
                    1
                  </span>
                ) : null}
              </button>
            </div>
          ) : null}

          <div className="bank-recon-columns">
            <div
              className={`bank-recon-col${isMobileRecon && mobilePanel !== 'extrato' ? ' bank-recon-col--hidden-mobile' : ''}`}
              data-recon-tour="extrato-col"
            >
              <h4 className="finance-tab__section-title">Extrato bancário</h4>

              {grouped.auto.length > 0 && !focusPendingOnly ? <p className="text-xs text-muted mb-2">Já conciliados</p> : null}
              {!focusPendingOnly
                ? grouped.auto.map(({ item, tx }) => (
                <BankReconPairRow
                  key={item.id}
                  item={item}
                  tx={tx}
                  tone="auto"
                  busy={busy}
                  onConfirm={
                    item.status !== 'matched'
                      ? () => linkItemToTx(item.id, tx?.id)
                      : null
                  }
                />
              ))
                : null}

              {grouped.suggested.length > 0 ? (
                <p className="text-xs text-muted mb-2 mt-3">Sugestões — confirme antes de conciliar</p>
              ) : null}
              {grouped.suggested.map(({ item, tx, candidates }) => (
                <BankReconPairRow
                  key={item.id}
                  item={item}
                  tx={tx}
                  candidates={candidates}
                  tone="suggested"
                  busy={busy}
                  onConfirm={
                    !candidates?.length && (tx || item.suggested_tx_id)
                      ? () => void linkItemToTx(item.id, item.suggested_tx_id || tx?.id)
                      : null
                  }
                  onConfirmCandidate={(txId) => void linkItemToTx(item.id, txId)}
                  onIgnore={() => requestIgnore(item)}
                />
              ))}

              {grouped.unmatched.length > 0 ? (
                <p className="text-xs text-muted mb-2 mt-3">Sem correspondência</p>
              ) : null}
              {grouped.unmatched.map(({ item }) => (
                <BankReconPairRow
                  key={item.id}
                  item={item}
                  tone="unmatched"
                  reconStatementId={selectedId}
                  selected={selectedBankItemId === item.id}
                  busy={busy}
                  manualTxId={unmatchedTxByItem[item.id] || ''}
                  manualTxOptions={manualTxOptions}
                  onSelect={() => selectBankItem(item.id)}
                  onRegisterPayment={(hint) => {
                    selectBankItem(item.id);
                    setRegisterPaymentHint(hint);
                  }}
                  onManualTxChange={(txId) =>
                    setUnmatchedTxByItem((prev) => ({ ...prev, [item.id]: txId }))
                  }
                  onLinkManual={() => {
                    const txId = unmatchedTxByItem[item.id];
                    if (!txId) return;
                    return linkItemToTx(item.id, txId);
                  }}
                  onCreateTx={() => requestCreateTx(item)}
                  onIgnore={() => requestIgnore(item)}
                />
              ))}
            </div>

            <div
              className={`bank-recon-col${isMobileRecon && mobilePanel !== 'lancamentos' ? ' bank-recon-col--hidden-mobile' : ''}`}
              data-recon-tour="lancamentos-col"
            >
              <h4 className="finance-tab__section-title">Lançamentos Nave</h4>
              <BankReconOrphanList
                orphans={detail.navi_unmatched || []}
                selectedItem={selectedBankItem}
                showAll={showAllOrphans}
                busy={busy}
                onToggleShowAll={setShowAllOrphans}
                onViewDetails={setDetailTx}
                onLinkToSelected={(txId) => {
                  if (!selectedBankItemId || !txId) return;
                  return linkItemToTx(selectedBankItemId, txId);
                }}
              />

              <div className="card mt-3 bank-recon-manual-card">
                <p className="text-xs text-muted mb-2">
                  Vincular lançamento liquidado sem linha correspondente no extrato (não fecha o mês no caixa).
                </p>
                <label className="form-label text-xs" htmlFor="bank-recon-manual-tx">
                  Lançamento
                </label>
                <SearchableSelect
                  id="bank-recon-manual-tx"
                  className="mb-2"
                  value={manualTxId}
                  options={manualTxOptions}
                  placeholder="Digite para buscar lançamento…"
                  emptyMessage="Nenhum lançamento encontrado para essa busca."
                  disabled={busy || manualTxOptions.length === 0}
                  onChange={setManualTxId}
                />
                <label className="form-label text-xs" htmlFor="bank-recon-manual-note">
                  Justificativa
                </label>
                <textarea
                  id="bank-recon-manual-note"
                  className="form-input mb-2"
                  rows={2}
                  placeholder="Obrigatória para conciliação manual"
                  value={manualNote}
                  onChange={(e) => setManualNote(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-outline btn-sm"
                  disabled={busy || !manualTxId || !manualNote.trim()}
                  onClick={() =>
                    run(() =>
                      manualReconcileTx(academyId, {
                        transaction_id: manualTxId,
                        statement_id: st.id,
                        justification: manualNote,
                      })
                    )
                  }
                >
                  Conciliar manualmente
                </button>
              </div>
            </div>
          </div>

          <BankReconNextPendingBar
            unmatchedItems={unmatchedItems}
            selectedItemId={selectedBankItemId}
            busy={busy}
            onSelectNext={selectNextPending}
          />

          {!st.completed_at ? (
            <div className="card mt-4 bank-recon-complete-card">
              <h4 className="finance-tab__section-title bank-recon-complete-title">Finalizar conciliação</h4>
              <textarea
                className="form-input mb-2"
                rows={2}
                placeholder="Observações sobre diferenças não resolvidas (opcional)"
                value={completeNote}
                onChange={(e) => setCompleteNote(e.target.value)}
              />
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={() =>
                  run(
                    () =>
                      completeBankReconciliation(academyId, {
                        statement_id: st.id,
                        completion_note: completeNote,
                      }),
                    { successMessage: 'Conciliação finalizada.' }
                  )
                }
              >
                Finalizar conciliação
              </button>
            </div>
          ) : null}

          {st.completed_at && detail?.closingHints ? (
            <BankReconClosingHandoffCard
              closingHints={detail.closingHints}
              statementStatus={st.status}
              dismissed={handoffDismissed}
              onDismiss={dismissClosingHandoff}
            />
          ) : null}
        </>
      ) : null}

      {error ? <ErrorBanner message={error} onRetry={() => void loadDetail(selectedId)} className="mt-2" /> : null}

      <BankReconTour
        open={showTour && Boolean(st) && !detailLoading && !tourBlockedByModal}
        hasConfirmAll={grouped.suggested.length > 0}
        onComplete={completeTour}
        onSkip={completeTour}
      />

      <ModalShell
        open={Boolean(learnPayerPrompt)}
        onClose={() => closeLearnPayerPrompt(false)}
        title="Lembrar pagador?"
        description={
          learnPayerPrompt
            ? `O extrato indica "${learnPayerPrompt.extracted_display}" como pagador de ${learnPayerPrompt.lead_name || 'este aluno'}.`
            : ''
        }
        footer={
          <>
            <button type="button" className="btn-outline" disabled={busy} onClick={() => closeLearnPayerPrompt(false)}>
              Agora não
            </button>
            <button type="button" className="btn-primary" disabled={busy} onClick={() => closeLearnPayerPrompt(true)}>
              Salvar pagador
            </button>
          </>
        }
      >
        <label className="bank-recon-learn-rule text-sm">
          <input
            type="checkbox"
            checked={learnAutoSuggest}
            onChange={(e) => setLearnAutoSuggest(e.target.checked)}
          />
          Sempre sugerir este vínculo na conciliação
        </label>
      </ModalShell>
      <ConfirmDialog
        open={pendingConfirm?.type === 'ignore'}
        title="Ignorar linha do extrato?"
        description={`A linha "${pendingConfirm?.label || ''}" não será conciliada. Você pode reabrir o extrato depois se necessário.`}
        confirmLabel="Ignorar"
        confirmVariant="danger"
        loading={busy}
        onConfirm={executePendingConfirm}
        onClose={() => setPendingConfirm(null)}
      />
      <BankReconCreateTxModal
        open={Boolean(createTxItem)}
        item={createTxItem}
        chartAccounts={chartAccounts}
        busy={busy}
        onClose={() => setCreateTxItem(null)}
        onConfirm={({ category }) => {
          if (!createTxItem?.id) return;
          const itemId = createTxItem.id;
          setCreateTxItem(null);
          void run(() => createTxFromBankItem(academyId, { item_id: itemId, category }), {
            successMessage: 'Lançamento criado e conciliado.',
          });
        }}
      />
      <BankReconRegisterPaymentModal
        open={Boolean(registerPaymentHint)}
        hint={registerPaymentHint}
        bankItem={registerPaymentItem}
        statementId={selectedId}
        academyId={academyId}
        financeConfig={financeConfig}
        busy={busy}
        onClose={() => setRegisterPaymentHint(null)}
        onSuccess={(result) => {
          setRegisterPaymentHint(null);
          void refresh();
          toast.success('Mensalidade registrada e linha conciliada.');
          maybePromptLearnPayer(result.learn_payer);
        }}
      />
      <BankReconRulesModal
        open={showRulesModal}
        academyId={academyId}
        onClose={() => setShowRulesModal(false)}
        onChanged={() => void refresh()}
      />
      {detailTx ? (
        <FinanceTxDetailDrawer
          tx={detailTx}
          academyId={academyId}
          journalEntries={[]}
          leadNameById={leadNameById}
          chartAccounts={chartAccounts}
          canManageAdvanced={false}
          canAssignBankOnTx={() => false}
          rowBusy={false}
          menuOpenId=""
          onMenuOpenChange={() => {}}
          onClose={() => setDetailTx(null)}
          readOnly
          onEdit={() => {}}
          onSettle={() => {}}
          onCancel={() => {}}
          onReverse={() => {}}
          onAssignBank={() => {}}
          onEditRecurrence={() => {}}
          onCancelRecurrence={() => {}}
          recurrenceCancelLoadingId=""
          reverseLoadingId=""
        />
      ) : null}
    </FinanceTabShell>
  );
}
