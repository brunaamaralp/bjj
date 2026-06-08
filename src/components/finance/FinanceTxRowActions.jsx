import React from 'react';
import { CheckCircle2, Landmark, MoreHorizontal, Pencil, RotateCcw } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuPanel,
  DropdownMenuItem,
  DropdownMenuDivider,
} from '../shared/menu';

const EXPENSE_EDIT_TITLE = 'Despesas só podem ser editadas por titular ou administrador.';

function TxIconButton({ label, onClick, disabled, danger, title, children }) {
  return (
    <button
      type="button"
      className={`finance-tx-icon-btn${danger ? ' finance-tx-icon-btn--danger' : ''}`}
      aria-label={label}
      title={title || label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

/**
 * Ações de linha (desktop e mobile) para lançamento pendente, liquidado ou recorrência.
 */
export default function FinanceTxRowActions({
  txId,
  status,
  direction,
  canManageAdvanced,
  canAssignBank,
  showRecMenu,
  rowBusy,
  menuOpen,
  onMenuOpenChange,
  onEdit,
  onSettle,
  onCancel,
  onReverse,
  onAssignBank,
  onEditRecurrence,
  onCancelRecurrence,
  recurrenceCancelLoading,
  reverseLoading,
}) {
  const st = String(status || '').toLowerCase();
  const isPending = st === 'pending';
  const isSettled = st === 'settled';
  const showEdit = isPending && (canManageAdvanced || direction !== 'out');
  const editDisabled = isPending && direction === 'out' && !canManageAdvanced;
  const showAssignBank = isSettled && canAssignBank;
  const hasPrimary = isPending || showRecMenu || (isSettled && canManageAdvanced) || showAssignBank;

  if (!hasPrimary) {
    return <span className="text-small finance-tx-no-actions">—</span>;
  }

  const moreOpen = menuOpen === txId;
  const hasMoreItems = showRecMenu || (isPending && canManageAdvanced);

  return (
    <div className="finance-tx-actions-cell">
      {isPending ? (
        <>
          {showEdit ? (
            <TxIconButton label="Editar" onClick={onEdit} disabled={rowBusy} title={editDisabled ? EXPENSE_EDIT_TITLE : 'Editar'}>
              <Pencil size={16} aria-hidden />
            </TxIconButton>
          ) : editDisabled ? (
            <TxIconButton label="Editar" disabled title={EXPENSE_EDIT_TITLE}>
              <Pencil size={16} aria-hidden />
            </TxIconButton>
          ) : null}
          <TxIconButton label="Liquidar" onClick={onSettle} disabled={rowBusy} title="Liquidar">
            <CheckCircle2 size={16} aria-hidden />
          </TxIconButton>
        </>
      ) : null}

      {showAssignBank ? (
        <TxIconButton
          label="Conta bancária"
          onClick={onAssignBank}
          disabled={rowBusy}
          title="Atribuir ou corrigir conta bancária"
        >
          <Landmark size={16} aria-hidden />
        </TxIconButton>
      ) : null}

      {isSettled && canManageAdvanced ? (
        <TxIconButton
          label={reverseLoading ? 'Estornando…' : 'Estornar'}
          onClick={onReverse}
          disabled={rowBusy}
          danger
          title={reverseLoading ? 'Estornando…' : 'Estornar'}
        >
          <RotateCcw size={16} aria-hidden />
        </TxIconButton>
      ) : null}

      {hasMoreItems ? (
        <DropdownMenu
          open={moreOpen}
          onOpenChange={(next) => onMenuOpenChange(next ? txId : '')}
          className="finance-tx-actions-menu"
        >
          <button
            type="button"
            className="finance-tx-icon-btn"
            aria-label="Mais opções"
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            title="Mais opções"
            disabled={rowBusy}
            onClick={() => onMenuOpenChange(moreOpen ? '' : txId)}
          >
            <MoreHorizontal size={16} aria-hidden />
          </button>
          {moreOpen ? (
            <DropdownMenuPanel aria-label="Opções do lançamento">
              {showRecMenu ? (
                <>
                  <DropdownMenuItem onClick={onEditRecurrence}>Editar recorrência</DropdownMenuItem>
                  <DropdownMenuItem danger disabled={rowBusy} onClick={onCancelRecurrence}>
                    {recurrenceCancelLoading ? 'Cancelando…' : 'Cancelar recorrência'}
                  </DropdownMenuItem>
                  {(isPending || isSettled) && canManageAdvanced ? <DropdownMenuDivider /> : null}
                </>
              ) : null}
              {isPending && canManageAdvanced ? (
                <DropdownMenuItem danger disabled={rowBusy} onClick={onCancel}>
                  {rowBusy ? 'Cancelando…' : 'Cancelar lançamento'}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuPanel>
          ) : null}
        </DropdownMenu>
      ) : null}
    </div>
  );
}

export { EXPENSE_EDIT_TITLE };
