import React, { useMemo, useState } from 'react';
import ModalShell from '../shared/ModalShell.jsx';
import FieldError from '../shared/FieldError.jsx';
import { computeAnticipationFee } from '../../lib/acquirerFees.js';
import { resolveAcquirerFeesForAccount } from '../../lib/resolveAcquirerFees.js';
import { resolveTxBankAccount } from '../../lib/bankAccountBalances.js';
import { displayNet } from '../../lib/financeTxDisplay.js';

function fmtMoney(v) {
  try {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } catch {
    return `R$ ${Number(v || 0).toFixed(2)}`;
  }
}

function FinanceTxAnticipationForm({ tx, saving, suggested, onClose, onConfirm }) {
  const [feeAmount, setFeeAmount] = useState(() => (suggested > 0 ? String(suggested) : ''));

  const feeNum = Number(String(feeAmount).replace(',', '.'));
  const feeInvalid = !Number.isFinite(feeNum) || feeNum < 0.01 || feeNum > Math.abs(Number(displayNet(tx)) || 0);
  const netBase = Math.abs(Number(displayNet(tx)) || 0);

  return (
    <ModalShell
      open
      title="Registrar antecipação"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={saving || feeInvalid}
            onClick={() => onConfirm({ feeAmount: feeNum })}
          >
            {saving ? 'Salvando…' : 'Continuar'}
          </button>
        </>
      }
    >
      <p className="text-small text-muted">
        Será criada uma despesa de taxa de antecipação vinculada a este lançamento. O valor líquido
        do recebimento é {fmtMoney(netBase)}.
      </p>
      <div className="form-group mt-3">
        <label htmlFor="anticipation-fee">Taxa de antecipação (R$)</label>
        <input
          id="anticipation-fee"
          className="form-input"
          type="number"
          min={0.01}
          step="0.01"
          max={netBase}
          value={feeAmount}
          onChange={(e) => setFeeAmount(e.target.value)}
        />
        {feeInvalid && feeAmount !== '' ? (
          <FieldError>
            Informe um valor entre {fmtMoney(0.01)} e {fmtMoney(netBase)}.
          </FieldError>
        ) : null}
        {suggested > 0 ? (
          <p className="text-small text-muted">Sugestão com base na configuração: {fmtMoney(suggested)}</p>
        ) : (
          <p className="text-small text-muted">
            Configure a taxa de antecipação em Configurações → Taxas da operadora.
          </p>
        )}
      </div>
    </ModalShell>
  );
}

export default function FinanceTxAnticipationDialog({
  open,
  tx,
  financeConfig,
  saving,
  onClose,
  onConfirm,
}) {
  const netBase = useMemo(() => Math.abs(Number(displayNet(tx)) || 0), [tx]);
  const accountLabel = useMemo(
    () => String(tx?.bankAccount || resolveTxBankAccount(tx) || '').trim(),
    [tx]
  );
  const suggested = useMemo(() => {
    const fees = resolveAcquirerFeesForAccount(financeConfig, accountLabel);
    return computeAnticipationFee(netBase, fees);
  }, [netBase, financeConfig, accountLabel]);

  if (!open || !tx) return null;

  const txId = String(tx?.id || tx?.$id || '').trim();

  return (
    <FinanceTxAnticipationForm
      key={txId}
      tx={tx}
      saving={saving}
      suggested={suggested}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
