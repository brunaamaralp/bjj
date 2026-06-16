import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './finance.css';
import { ArrowLeft, Check, FileSpreadsheet, Upload } from 'lucide-react';
import ImportStatementModal from './ImportStatementModal.jsx';
import BankReconPairRow from './BankReconPairRow.jsx';
import BankReconOrphanList, { formatSourceLabel } from './BankReconOrphanList.jsx';
import BankReconSelectionBar from './BankReconSelectionBar.jsx';
import BankReconKpiRow from './BankReconKpiRow.jsx';
import {
  listBankStatements,
  getBankStatementDetail,
  confirmBankMatch,
  confirmAllBankMatches,
  ignoreBankItem,
  manualReconcileTx,
  createTxFromBankItem,
  completeBankReconciliation,
} from '../../lib/bankReconciliationApi.js';
import { reconcileStudentPaymentMirrors } from '../../lib/financeTxApi.js';
import { friendlyError } from '../../lib/errorMessages';
import { useToast } from '../../hooks/useToast';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import StatusBanner from '../shared/StatusBanner.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import FinanceTabShell from './FinanceTabShell.jsx';
import SearchableSelect from '../shared/SearchableSelect.jsx';

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
};

function reconFriendlyError(err) {
  const code = String(err?.message || err || '').trim();
  if (RECON_ERROR_MESSAGES[code]) return RECON_ERROR_MESSAGES[code];
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
  return `${fmtDate(tx.settledAt)} — ${fmtMoney(tx.gross)} — ${tx.planName || tx.category || 'Lançamento'}`;
}

export default function ReconciliationTab({ academyId }) {
  const toast = useToast();
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
    if (selectedId) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

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
      if (item.status === 'ignored') {
        ignored.push(item);
        continue;
      }
      if (item.status === 'matched') {
        auto.push({ item, tx: txById.get(item.matched_tx_id) });
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
        label: `${fmtDate(tx.settledAt)} — ${fmtMoney(tx.gross)} — ${tx.planName || tx.category || 'Lançamento'}`,
      })),
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

  const onImported = (statementId) => {
    setSelectedId(statementId);
    void refresh();
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

  const linkItemToTx = (itemId, txId) => {
    const tx = (detail?.navi_unmatched || []).find((t) => t.id === txId)
      || (detail?.navi_transactions || []).find((t) => t.id === txId);
    return run(() => confirmBankMatch(academyId, { item_id: itemId, transaction_id: txId }), {
      successMessage: `Linha conciliada com ${txLabel(tx, manualTxOptions)}`,
    });
  };

  const requestIgnore = (item) => {
    setPendingConfirm({
      type: 'ignore',
      itemId: item.id,
      label: item.description || 'esta linha',
    });
  };

  const requestCreateTx = (item) => {
    setPendingConfirm({
      type: 'create',
      itemId: item.id,
      label: item.description || 'esta linha',
    });
  };

  const executePendingConfirm = () => {
    if (!pendingConfirm) return;
    const { type, itemId } = pendingConfirm;
    setPendingConfirm(null);
    if (type === 'ignore') {
      void run(() => ignoreBankItem(academyId, itemId), { successMessage: 'Linha ignorada.' });
    } else if (type === 'create') {
      void run(() => createTxFromBankItem(academyId, { item_id: itemId }), {
        successMessage: 'Lançamento criado e conciliado.',
      });
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
          <BankReconKpiRow
            filename={st.filename}
            statusLabel={STATUS_LABELS[st.status] || st.status}
            formatLabel={st.source_format ? formatSourceLabel(st.source_format) : ''}
            periodLabel={`${fmtDate(st.period_start)} — ${fmtDate(st.period_end)}`}
            pendingCount={summary.pending_count}
            pendingAmount={summary.pending_amount}
            balanceGap={balanceGap}
            naviOrphanCount={summary.navi_orphan_count}
            balanceProof={balanceProof}
            reconciledCount={summary.reconciled_count}
            reconciledAmount={summary.reconciled_amount}
          />

          <div className="flex gap-2 mb-3 bank-recon-actions-head">
            {grouped.suggested.length > 0 ? (
              <button
                type="button"
                className="btn-outline btn-sm"
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

          <div className="bank-recon-columns">
            <div className="bank-recon-col">
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
              {grouped.suggested.map(({ item, tx }) => (
                <BankReconPairRow
                  key={item.id}
                  item={item}
                  tx={tx}
                  tone="suggested"
                  busy={busy}
                  onConfirm={() => linkItemToTx(item.id, item.suggested_tx_id || tx?.id)}
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
                  selected={selectedBankItemId === item.id}
                  busy={busy}
                  manualTxId={unmatchedTxByItem[item.id] || ''}
                  manualTxOptions={manualTxOptions}
                  onSelect={() => setSelectedBankItemId(item.id)}
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

            <div className="bank-recon-col">
              <h4 className="finance-tab__section-title">Lançamentos Nave</h4>
              <BankReconOrphanList
                orphans={detail.navi_unmatched || []}
                selectedItem={selectedBankItem}
                showAll={showAllOrphans}
                busy={busy}
                onToggleShowAll={setShowAllOrphans}
                onLinkToSelected={(txId) => {
                  if (!selectedBankItemId || !txId) return;
                  return linkItemToTx(selectedBankItemId, txId);
                }}
              />

              <div className="card mt-3 bank-recon-manual-card">
                <p className="text-xs text-muted mb-2">Conferir manualmente (sem linha no extrato)</p>
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
                  placeholder="Obrigatória para conferência manual"
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
                  Marcar como conferido
                </button>
              </div>
            </div>
          </div>

          {st.status !== 'reconciled' ? (
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
        </>
      ) : null}

      {error ? <ErrorBanner message={error} onRetry={() => void loadDetail(selectedId)} className="mt-2" /> : null}

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
      <ConfirmDialog
        open={pendingConfirm?.type === 'create'}
        title="Criar lançamento a partir desta linha?"
        description="Será criado um lançamento no Caixa com os dados do extrato e vinculado automaticamente a esta linha."
        confirmLabel="Criar e conciliar"
        confirmVariant="primary"
        loading={busy}
        onConfirm={executePendingConfirm}
        onClose={() => setPendingConfirm(null)}
      />
    </FinanceTabShell>
  );
}
