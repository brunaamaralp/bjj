import React, { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import { useLeadStore } from '../../store/useLeadStore';
import { friendlyError } from '../../lib/errorMessages';
import { listBankAccountLabels, resolveBankAccountForPayment, hasConfiguredBankAccounts } from '../../lib/bankAccounts.js';
import { refreshFinanceConfigForAcademy } from '../../lib/prefetchFinanceConfig.js';
import { appendBankAccountToAcademy } from '../../lib/academyBankAccounts.js';
import SearchableSelect from '../shared/SearchableSelect.jsx';

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
  emptyMessage = 'Nenhuma conta encontrada para essa busca.',
}) {
  const addToast = useUiStore((s) => s.addToast);
  const setFinanceConfig = useLeadStore((s) => s.setFinanceConfig);
  const storeFinanceConfig = useLeadStore((s) =>
    s.financeConfigAcademyId === academyId ? s.financeConfig : null
  );
  const resolvedFinanceConfig = storeFinanceConfig || financeConfig;
  const [saving, setSaving] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [draft, setDraft] = useState({ bankName: '', account: '' });
  const [showInline, setShowInline] = useState(false);

  const options = useMemo(() => listBankAccountLabels(resolvedFinanceConfig), [resolvedFinanceConfig]);
  const hasBanks = hasConfiguredBankAccounts(resolvedFinanceConfig);

  const selectOptions = useMemo(() => {
    const current = String(value || '').trim();
    const items = options.map((lbl) => ({ value: lbl, label: lbl }));
    if (current && !options.includes(current)) {
      items.unshift({ value: current, label: `${current} (cadastro anterior)` });
    }
    if (allowEmpty) {
      return [{ value: '', label: emptyLabel }, ...items];
    }
    return items;
  }, [options, allowEmpty, emptyLabel, value]);

  const inputClassName = className === 'form-input' ? '' : className;

  useEffect(() => {
    if (!academyId || saving || hasBanks) return;
    let cancelled = false;
    setLoadingAccounts(true);
    void refreshFinanceConfigForAcademy(academyId)
      .then((cfg) => {
        if (cancelled || !cfg) return;
        if (useLeadStore.getState().academyId === academyId) {
          setFinanceConfig(cfg, academyId);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingAccounts(false);
      });
    return () => {
      cancelled = true;
    };
  }, [academyId, saving, hasBanks, setFinanceConfig]);

  useEffect(() => {
    if (allowEmpty || saving || !options.length) return;
    const resolved = resolveBankAccountForPayment(value, resolvedFinanceConfig);
    if (resolved && resolved !== String(value || '').trim()) {
      onChange(resolved);
    }
  }, [allowEmpty, saving, options, value, resolvedFinanceConfig, onChange]);

  const handleAdd = async () => {
    if (saving || !academyId) return;
    setSaving(true);
    try {
      const { config, label: newLabel } = await appendBankAccountToAcademy(
        academyId,
        draft,
        resolvedFinanceConfig
      );
      setFinanceConfig(config, academyId);
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
      <SearchableSelect
        id={id}
        style={style}
        inputClassName={inputClassName}
        disabled={disabled || saving || loadingAccounts || (!allowEmpty && options.length === 0 && !loadingAccounts)}
        value={value || ''}
        options={selectOptions}
        placeholder={loadingAccounts ? 'Carregando contas…' : emptyLabel}
        emptyMessage={
          loadingAccounts
            ? 'Carregando contas…'
            : options.length === 0 && !allowEmpty
              ? 'Nenhuma conta cadastrada.'
              : emptyMessage
        }
        onChange={onChange}
      />
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
