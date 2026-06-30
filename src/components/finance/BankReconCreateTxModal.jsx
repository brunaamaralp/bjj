import React, { useMemo, useState } from 'react';
import ModalShell from '../shared/ModalShell.jsx';
import SearchableGroupedSelect from '../shared/SearchableGroupedSelect.jsx';
import FieldError from '../shared/FieldError.jsx';
import {
  defaultCategoryForDirection,
  getCategoryOptionsByNature,
  resolveFinanceCategory,
} from '../../lib/financeCategories.js';

function BankReconCreateTxForm({ item, chartAccounts, busy, onClose, onConfirm }) {
  const direction = item?.direction === 'credit' ? 'in' : 'out';
  const [category, setCategory] = useState(() => defaultCategoryForDirection(direction).label);
  const [error, setError] = useState('');

  const categoryOptionGroups = useMemo(
    () => getCategoryOptionsByNature(direction === 'out' ? 'out' : 'in', chartAccounts),
    [direction, chartAccounts]
  );

  const handleConfirm = () => {
    const cat = resolveFinanceCategory(category, chartAccounts, { direction });
    if (!cat) {
      setError('Selecione uma categoria válida.');
      return;
    }
    if (cat.type === 'plan') {
      setError('Para mensalidade, vincule pelo Caixa com aluno/plano. Escolha outra categoria.');
      return;
    }
    onConfirm({ category });
  };

  const description = item?.description || 'esta linha';
  const amountLabel = item?.amount != null ? Number(item.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';

  return (
    <ModalShell
      open
      onClose={onClose}
      title="Criar lançamento"
      description={`Classifique a movimentação do extrato antes de conciliar.${amountLabel ? ` Valor: ${amountLabel}.` : ''}`}
      footer={
        <>
          <button type="button" className="btn-outline" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn-primary" disabled={busy} onClick={handleConfirm}>
            {busy ? 'Salvando…' : 'Criar e conciliar'}
          </button>
        </>
      }
    >
      <p className="text-small text-muted mb-3">{description}</p>
      <div className="form-group">
        <label htmlFor="bank-recon-create-category">Categoria</label>
        <SearchableGroupedSelect
          id="bank-recon-create-category"
          value={category}
          groups={categoryOptionGroups}
          getOptionValue={(c) => c.value || c.label}
          getOptionLabel={(c) => c.label}
          getOptionTitle={(c) => c.title || ''}
          placeholder="Digite para buscar categoria…"
          hint="Aporte, empréstimo e transferência não entram no faturamento operacional."
          hintId="bank-recon-create-category-hint"
          emptyMessage="Nenhuma categoria encontrada para essa busca."
          aria-invalid={error ? 'true' : undefined}
          onChange={(value) => {
            setCategory(value);
            setError('');
          }}
        />
        <FieldError id="bank-recon-create-category-error">{error}</FieldError>
      </div>
    </ModalShell>
  );
}

export default function BankReconCreateTxModal({
  open,
  item,
  chartAccounts = [],
  busy = false,
  onClose,
  onConfirm,
}) {
  if (!open || !item) return null;

  return (
    <BankReconCreateTxForm
      key={item.id}
      item={item}
      chartAccounts={chartAccounts}
      busy={busy}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
