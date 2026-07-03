import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { X, Repeat } from 'lucide-react';
import {
  txDirection,
  displayGross,
  displayNet,
  displayFee,
  formatSignedMoney,
  labelForFinanceTxType,
  NATURE_STYLES,
} from '../../lib/financeTxDisplay.js';
import { formatPaymentMethod } from '../../lib/paymentMethodLabels.js';
import { formatSaleIdShort } from '../../lib/salesHistory.js';
import { resolveTxBankAccount } from '../../lib/bankAccountBalances.js';
import { txTemporalIso } from '../../lib/financeCompetence.js';
import {
  expectedSettlementYmd,
  formatYmdBr,
  txSettlementSubtitle,
} from '../../lib/financeTxSettlementDisplay.js';
import { defaultCategoryForTxType, resolveFinanceCategory } from '../../lib/financeCategories.js';
import { isRecurrenceTx, recurrenceTooltip } from '../../lib/financeRecurrence.js';
import { formatTxLeadCell, resolveTxLeadId, resolveTxLeadName } from '../../lib/financeTxLeadNames.js';
import { FINANCE_ORIGIN_STOCK_ENTRY } from '../../lib/financeOriginTypes.js';
import FinanceTxRowActions from './FinanceTxRowActions.jsx';
import FinanceTxJournalMirrorSection from './FinanceTxJournalMirrorSection.jsx';
import { canRegisterAnticipation } from '../../lib/financeAnticipation.js';
import '../../styles/tasks.css';
import './styles/tx-drawer.css';

function formatTxDateStr(iso) {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '—';
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
}

function formatMoneyBRL(value) {
  try {
    return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } catch {
    const n = Number(value);
    return Number.isFinite(n) ? `R$ ${n.toFixed(2).replace('.', ',')}` : '—';
  }
}

function statusBadge(status) {
  const st = String(status || '').toLowerCase();
  if (st === 'pending') return <span className="finance-badge-pendente">Pendente</span>;
  if (st === 'settled') return <span className="finance-badge-pago">Liquidado</span>;
  if (st === 'cancelled') return <span className="finance-badge-cancelado">Cancelado</span>;
  return <span className="finance-badge-neutro">{status || '—'}</span>;
}

function DetailField({ label, children }) {
  return (
    <div className="task-drawer-field finance-tx-drawer-field">
      <span className="task-drawer-label">{label}</span>
      <div className="task-drawer-value">{children}</div>
    </div>
  );
}

export default function FinanceTxDetailDrawer({
  tx,
  academyId,
  journalEntries,
  leadNameById,
  chartAccounts,
  canManageAdvanced,
  canAssignBankOnTx,
  rowBusy,
  menuOpenId,
  onMenuOpenChange,
  onClose,
  onEdit,
  onSettle,
  onCancel,
  onReverse,
  onAssignBank,
  onEditRecurrence,
  onCancelRecurrence,
  recurrenceCancelLoadingId,
  reverseLoadingId,
  readOnly = false,
  anticipationTx = null,
  onAnticipate,
}) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!tx) return undefined;
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [tx, onClose]);

  if (!tx) return null;

  const dir = txDirection(tx);
  const nature = NATURE_STYLES[dir];
  const catBadge = (() => {
    const raw = String(tx.category || '').trim() || defaultCategoryForTxType(tx.type);
    const cat = resolveFinanceCategory(raw, chartAccounts);
    return cat?.label || raw || '—';
  })();
  const st = String(tx.status || '').toLowerCase();
  const rec = isRecurrenceTx(tx);
  const showRecMenu = canManageAdvanced && tx.is_recurrence_template === true;
  const leadId = resolveTxLeadId(tx);
  const leadName = resolveTxLeadName(tx, leadNameById);
  const leadCell = formatTxLeadCell(tx, leadNameById);
  const showMirror = canManageAdvanced && (chartAccounts?.length || 0) > 0;
  const showAnticipate =
    !readOnly &&
    canManageAdvanced &&
    canRegisterAnticipation(tx, { hasChild: Boolean(anticipationTx) }) &&
    typeof onAnticipate === 'function';
  const settlementYmd = expectedSettlementYmd(tx);
  const settlementHint = txSettlementSubtitle(tx);
  const settledAtYmd = String(tx.settledAt || '').slice(0, 10);

  return (
    <>
      <div
        role="presentation"
        className="task-drawer-backdrop finance-tx-drawer-backdrop"
        onMouseDown={onClose}
      />
      <aside
        className="task-drawer-panel finance-tx-drawer-panel"
        aria-labelledby="finance-tx-drawer-heading"
      >
        <div className="task-drawer-header">
          <h2 id="finance-tx-drawer-heading" className="task-drawer-heading">
            Detalhes do lançamento
          </h2>
          <button type="button" className="task-drawer-close" aria-label="Fechar" onClick={onClose}>
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="task-drawer-body finance-tx-drawer-body">
          <DetailField label="Data">
            <span className="finance-tx-date-cell">
              {formatTxDateStr(txTemporalIso(tx))}
              {rec ? (
                <Repeat
                  size={14}
                  aria-hidden
                  title={recurrenceTooltip(tx) || 'Lançamento recorrente'}
                  className="finance-tx-date-cell__icon"
                />
              ) : null}
            </span>
          </DetailField>
          <DetailField label="Natureza">
            <span
              className={
                dir === 'out'
                  ? 'finance-value-negative finance-tx-nature-label'
                  : 'finance-value-positive finance-tx-nature-label'
              }
            >
              {nature.label}
            </span>
          </DetailField>
          <DetailField label="Categoria">{catBadge}</DetailField>
          {String(tx.type || '').toLowerCase() === 'plan' ? (
            tx.planName ? <DetailField label="Plano">{tx.planName}</DetailField> : null
          ) : tx.planName ? (
            <DetailField label="Descrição">{tx.planName}</DetailField>
          ) : null}
          <DetailField label="Tipo">
            {String(tx.type || '').toLowerCase() === 'plan'
              ? 'Plano'
              : labelForFinanceTxType(tx.type)}
          </DetailField>
          <DetailField label="Aluno">
            {leadId ? (
              <button
                type="button"
                className="task-drawer-link"
                title={leadName === 'Aluno não encontrado' ? leadId : undefined}
                onClick={() => {
                  onClose();
                  navigate(`/student/${leadId}`);
                }}
              >
                {leadCell}
              </button>
            ) : (
              '—'
            )}
          </DetailField>
          <DetailField label="Valor bruto">
            <span className={dir === 'out' ? 'finance-amount-negative' : 'finance-amount-positive'}>
              {formatSignedMoney(displayGross(tx), dir)}
            </span>
          </DetailField>
          <DetailField label="Taxa">{formatMoneyBRL(displayFee(tx))}</DetailField>
          <DetailField label="Valor líquido">
            <span className={dir === 'out' ? 'finance-amount-negative' : 'finance-amount-positive'}>
              {formatSignedMoney(displayNet(tx), dir)}
            </span>
          </DetailField>
          <DetailField label="Método">
            {formatPaymentMethod(tx.method, tx.installments)}
          </DetailField>
          <DetailField label="Conta bancária">
            {tx.bankAccount || resolveTxBankAccount(tx) || '—'}
          </DetailField>
          <DetailField label="Status">{statusBadge(tx.status)}</DetailField>
          {settlementHint ? (
            <DetailField label={st === 'pending' ? 'Liquida em' : 'Crédito previsto em'}>
              {formatYmdBr(settlementYmd)}
            </DetailField>
          ) : null}
          {st === 'settled' && settledAtYmd && /^\d{4}-\d{2}-\d{2}$/.test(settledAtYmd) ? (
            <DetailField label="Liquidado em">{formatYmdBr(settledAtYmd)}</DetailField>
          ) : null}
          <DetailField label="Competência">{tx.competence_month || '—'}</DetailField>
          {tx.saleId ? (
            <DetailField label="Venda">{formatSaleIdShort(tx.saleId)}</DetailField>
          ) : null}
          {String(tx.origin_type || '').toLowerCase() === FINANCE_ORIGIN_STOCK_ENTRY &&
          String(tx.origin_id || '').trim() ? (
            <DetailField label="Entrada de estoque">
              <Link
                to={`/loja?tab=estoque&subtab=movimentos&move=${encodeURIComponent(String(tx.origin_id).trim())}`}
                className="task-drawer-link finance-tx-drawer-mirror__link"
                onClick={onClose}
              >
                Ver movimentação no estoque
              </Link>
            </DetailField>
          ) : null}
          {rec ? (
            <DetailField label="Recorrência">
              {recurrenceTooltip(tx) || 'Sim'}
            </DetailField>
          ) : null}
          {anticipationTx ? (
            <DetailField label="Antecipação">
              <span className="text-small">
                Taxa registrada: {formatMoneyBRL(Math.abs(Number(anticipationTx.gross) || 0))}
                {' · '}
                <Link
                  to={`/financeiro?tab=movimentacoes&tx=${encodeURIComponent(anticipationTx.id)}`}
                  className="finance-tx-drawer-mirror__link"
                >
                  Ver lançamento da taxa
                </Link>
              </span>
            </DetailField>
          ) : null}
          <DetailField label="Observação">
            <span className="task-drawer-value--multiline">
              {String(tx.note || '').trim() || '—'}
            </span>
          </DetailField>
          {showMirror ? (
            <FinanceTxJournalMirrorSection
              tx={tx}
              academyId={academyId}
              chartAccounts={chartAccounts}
              journalEntries={journalEntries}
            />
          ) : null}
        </div>
        {!readOnly ? (
          <div className="task-drawer-footer finance-tx-drawer-footer">
            {showAnticipate ? (
              <button type="button" className="btn-outline btn-sm mb-2" onClick={() => onAnticipate(tx)}>
                Registrar antecipação
              </button>
            ) : null}
            <FinanceTxRowActions
              txId={tx.id}
              status={st}
              direction={dir}
              canManageAdvanced={canManageAdvanced}
              canAssignBank={canAssignBankOnTx(tx)}
              showRecMenu={showRecMenu}
              rowBusy={rowBusy}
              menuOpen={menuOpenId}
              onMenuOpenChange={onMenuOpenChange}
              onEdit={onEdit}
              onSettle={onSettle}
              canSettle={tx.is_recurrence_template !== true}
              onCancel={onCancel}
              onReverse={onReverse}
              onAssignBank={onAssignBank}
              onEditRecurrence={onEditRecurrence}
              onCancelRecurrence={onCancelRecurrence}
              recurrenceCancelLoading={recurrenceCancelLoadingId === tx.id}
              reverseLoading={reverseLoadingId === tx.id}
            />
          </div>
        ) : null}
      </aside>
    </>
  );
}
