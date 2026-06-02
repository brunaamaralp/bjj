import React, { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import { useLeadStore } from '../../store/useLeadStore';
import { friendlyError } from '../../lib/errorMessages';
import { listBankAccountLabels, resolveBankAccountForPayment } from '../../lib/bankAccounts.js';
import { appendBankAccountToAcademy } from '../../lib/academyBankAccounts.js';

/**
 * Seleção de conta bancária cadastrada na academia + cadastro inline.
 */
export default function BankAccountSelect({
  academyId,
  financeConfig,
  value,
  onChange,
  id,
  label = 'Conta',
  required = false,
  disabled = false,
  className = 'form-input',
  style,
  allowEmpty = false,
  emptyLabel = 'Selecione a conta…',
}) {
  const addToast = useUiStore((s) => s.addToast);
  const setFinanceConfig = useLeadStore((s) => s.setFinanceConfig);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ bankName: '', account: '' });
  const [showInline, setShowInline] = useState(false);

  const options = useMemo(() => listBankAccountLabels(financeConfig), [financeConfig]);

  useEffect(() => {
    if (allowEmpty || saving || !options.length) return;
    const resolved = resolveBankAccountForPayment(value, financeConfig);
    if (resolved && resolved !== String(value || '').trim()) {
      onChange(resolved);
    }
  }, [allowEmpty, saving, options, value, financeConfig, onChange]);

  const handleAdd = async () => {
    if (saving || !academyId) return;
    setSaving(true);
    try {
      const { config, label: newLabel } = await appendBankAccountToAcademy(
        academyId,
        draft,
        financeConfig
      );
      setFinanceConfig(config);
      onChange(newLabel);
      setDraft({ bankName: '', account: '' });
      setShowInline(false);
      addToast({ type: 'success', message: 'Conta bancária cadastrada.' });
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bank-account-select form-group">
      {label ? (
        <label htmlFor={id} className="form-label">
          {label}
          {required ? ' *' : null}
        </label>
      ) : null}
      <select
        id={id}
        className={className}
        style={style}
        disabled={disabled || saving}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      >
        {allowEmpty ? <option value="">{emptyLabel}</option> : null}
        {options.map((lbl) => (
          <option key={lbl} value={lbl}>
            {lbl}
          </option>
        ))}
        {!allowEmpty && options.length === 0 ? (
          <option value="" disabled>
            Nenhuma conta cadastrada
          </option>
        ) : null}
      </select>
      {value && !options.includes(value) ? (
        <p className="bank-account-select__legacy-hint">
          Valor anterior: «{value}» — selecione uma conta cadastrada ou cadastre abaixo.
        </p>
      ) : null}
      <button
        type="button"
        className="btn-ghost bank-account-select__toggle"
        disabled={disabled || saving}
        onClick={() => setShowInline((v) => !v)}
      >
        <Plus size={14} aria-hidden />
        {showInline ? 'Fechar cadastro' : 'Cadastrar nova conta'}
      </button>
      {showInline ? (
        <div className="bank-account-select__inline-panel">
          <div className="form-group bank-account-select__field">
            <label className="bank-account-select__field-label">Banco *</label>
            <input
              className="form-input"
              value={draft.bankName}
              disabled={saving}
              placeholder="Ex.: Sicoob, Nubank"
              onChange={(e) => setDraft((p) => ({ ...p, bankName: e.target.value }))}
            />
          </div>
          <div className="form-group bank-account-select__field">
            <label className="bank-account-select__field-label">Número da conta</label>
            <input
              className="form-input"
              value={draft.account}
              disabled={saving}
              placeholder="Opcional"
              onChange={(e) => setDraft((p) => ({ ...p, account: e.target.value }))}
            />
          </div>
          <button
            type="button"
            className="btn-primary bank-account-select__submit"
            disabled={saving || !String(draft.bankName || '').trim()}
            onClick={() => void handleAdd()}
          >
            {saving ? 'Salvando…' : 'Adicionar conta'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
