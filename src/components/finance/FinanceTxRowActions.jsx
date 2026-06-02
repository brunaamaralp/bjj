import React from 'react';
import { MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuPanel,
  DropdownMenuItem,
  DropdownMenuDivider,
} from '../shared/menu';

const EXPENSE_EDIT_TITLE = 'Despesas só podem ser editadas por titular ou administrador.';

/**
 * Ações de linha (desktop) para lançamento pendente, liquidado ou recorrência.
 */
export default function FinanceTxRowActions({
  txId,
  status,
  direction,
  canManageAdvanced,
  showRecMenu,
  rowBusy,
  menuOpen,
  onMenuOpenChange,
  onEdit,
  onSettle,
  onCancel,
  onReverse,
  onEditRecurrence,
  onCancelRecurrence,
  recurrenceCancelLoading,
}) {
  const st = String(status || '').toLowerCase();
  const isPending = st === 'pending';
  const isSettled = st === 'settled';
  const showEdit = isPending && (canManageAdvanced || direction !== 'out');
  const editDisabled = isPending && direction === 'out' && !canManageAdvanced;
  const hasPrimary = isPending || showRecMenu || (isSettled && canManageAdvanced);

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
            <button
              type="button"
              className="btn-outline"
              onClick={onEdit}
              disabled={rowBusy}
              title={editDisabled ? EXPENSE_EDIT_TITLE : undefined}
            >
              Editar
            </button>
          ) : editDisabled ? (
            <button
              type="button"
              className="btn-outline"
              disabled
              title={EXPENSE_EDIT_TITLE}
            >
              Editar
            </button>
          ) : null}
          <button type="button" className="btn-outline" onClick={onSettle} disabled={rowBusy}>
            Liquidar
          </button>
        </>
      ) : null}

      {isSettled && canManageAdvanced ? (
        <button
          type="button"
          className="btn-outline finance-btn-danger-outline"
          onClick={onReverse}
          disabled={rowBusy}
        >
          {rowBusy ? 'Estornando…' : 'Estornar'}
        </button>
      ) : null}

      {hasMoreItems ? (
        <DropdownMenu
          open={moreOpen}
          onOpenChange={(next) => onMenuOpenChange(next ? txId : '')}
          className="finance-tx-actions-menu"
        >
          <button
            type="button"
            className="btn-outline"
            aria-label="Mais opções"
            aria-expanded={moreOpen}
            aria-haspopup="menu"
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
