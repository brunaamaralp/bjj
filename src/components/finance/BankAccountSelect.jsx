import React, { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import { useLeadStore } from '../../store/useLeadStore';
import { friendlyError } from '../../lib/errorMessages';
import { listBankAccountLabels } from '../../lib/bankAccounts.js';
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
  labelStyle,
}) {
  const addToast = useUiStore((s) => s.addToast);
  const setFinanceConfig = useLeadStore((s) => s.setFinanceConfig);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ bankName: '', account: '' });
  const [showInline, setShowInline] = useState(false);

  const options = useMemo(() => listBankAccountLabels(financeConfig), [financeConfig]);

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

  const defaultLabelStyle = {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: 6,
  };

  return (
    <div className="bank-account-select">
      {label ? (
        <label htmlFor={id} style={labelStyle || defaultLabelStyle}>
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
        <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
          Valor anterior: «{value}» — selecione uma conta cadastrada ou cadastre abaixo.
        </p>
      ) : null}
      <button
        type="button"
        className="btn-ghost"
        disabled={disabled || saving}
        onClick={() => setShowInline((v) => !v)}
        style={{
          marginTop: 8,
          padding: '4px 0',
          fontSize: 12,
          fontWeight: 600,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Plus size={14} aria-hidden />
        {showInline ? 'Fechar cadastro' : 'Cadastrar nova conta'}
      </button>
      {showInline ? (
        <div
          style={{
            marginTop: 10,
            padding: 12,
            borderRadius: 'var(--radius-sm)',
            border: '0.5px solid var(--border-light)',
            background: 'var(--surface-hover)',
            display: 'grid',
            gap: 10,
          }}
        >
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Banco *</label>
            <input
              className="form-input"
              value={draft.bankName}
              disabled={saving}
              placeholder="Ex.: Sicoob, Nubank"
              onChange={(e) => setDraft((p) => ({ ...p, bankName: e.target.value }))}
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Número da conta</label>
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
            className="btn-primary"
            disabled={saving || !String(draft.bankName || '').trim()}
            onClick={() => void handleAdd()}
            style={{ justifySelf: 'start', minHeight: 40, fontSize: 13 }}
          >
            {saving ? 'Salvando…' : 'Adicionar conta'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
