import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import EmptyState from '../../shared/EmptyState.jsx';
import FieldError from '../../shared/FieldError.jsx';
import { vendorCategoryOptions } from '../../../lib/financeVendors.js';
import { buildPayablesPath, PAYABLES_SECTIONS } from '../../../lib/financeiroPayablesSections.js';

function formatVendorMeta(vendor) {
  const parts = [];
  if (vendor.defaultCategory) parts.push(vendor.defaultCategory);
  if (vendor.defaultDueDay) parts.push(`dia ${vendor.defaultDueDay}`);
  if (vendor.active === false) parts.push('Inativo');
  return parts.join(' · ') || 'Sem defaults';
}

function VendorListItem({
  vendor,
  idx,
  expanded,
  onToggle,
  onUpdate,
  onRemove,
  categories,
  onNameBlur,
}) {
  const name = String(vendor.name || '').trim() || 'Fornecedor sem nome';
  const meta = formatVendorMeta(vendor);

  return (
    <div className={`finance-settings-plan${expanded ? ' finance-settings-plan--open' : ''}`}>
      <button type="button" className="finance-settings-plan__head" onClick={onToggle} aria-expanded={expanded}>
        <span className="finance-settings-plan__name">{name}</span>
        <span
          className={`finance-settings-plan__price${vendor.active === false ? ' finance-settings-vendor__meta--inactive' : ''}`}
        >
          {meta}
        </span>
        {expanded ? <ChevronUp size={18} aria-hidden /> : <ChevronDown size={18} aria-hidden />}
      </button>
      {expanded ? (
        <div className="finance-settings-plan__body">
          <div className="form-group">
            <label htmlFor={`vendor-name-${idx}`}>Nome</label>
            <input
              id={`vendor-name-${idx}`}
              className="form-input"
              value={vendor.name || ''}
              placeholder="Ex.: CPFL, Sabesp…"
              onChange={(e) => onUpdate(idx, { name: e.target.value })}
              onBlur={(e) => onNameBlur(idx, e.target.value)}
            />
          </div>
          <div className="form-row form-row--2">
            <div className="form-group">
              <label htmlFor={`vendor-cat-${idx}`}>Categoria padrão</label>
              <select
                id={`vendor-cat-${idx}`}
                className="form-input"
                value={vendor.defaultCategory || ''}
                onChange={(e) => onUpdate(idx, { defaultCategory: e.target.value })}
              >
                <option value="">Nenhuma</option>
                {categories.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor={`vendor-day-${idx}`}>Dia de vencimento</label>
              <input
                id={`vendor-day-${idx}`}
                className="form-input"
                type="number"
                min={1}
                max={28}
                value={vendor.defaultDueDay ?? ''}
                placeholder="Ex.: 10"
                onChange={(e) => {
                  const n = Number(e.target.value);
                  onUpdate(idx, {
                    defaultDueDay:
                      Number.isFinite(n) && n >= 1 && n <= 28 ? Math.floor(n) : undefined,
                  });
                }}
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor={`vendor-active-${idx}`}>Status</label>
            <select
              id={`vendor-active-${idx}`}
              className="form-input"
              value={vendor.active === false ? 'inativo' : 'ativo'}
              onChange={(e) => onUpdate(idx, { active: e.target.value === 'ativo' })}
            >
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
          </div>
          <button
            type="button"
            className="btn-outline btn-sm finance-settings-plan__remove"
            onClick={() => onRemove(idx)}
          >
            <Trash2 size={14} aria-hidden />
            Remover fornecedor
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function FinanceSettingsVendorsSection({
  financeConfig,
  onUpdate,
  onAdd,
  onRemoveRequest,
}) {
  const vendors = financeConfig?.vendors || [];
  const categories = useMemo(() => vendorCategoryOptions(), []);
  const [expandedIdx, setExpandedIdx] = useState(null);
  const [draftError, setDraftError] = useState('');

  const handleNameBlur = (idx, value) => {
    const name = String(value || '').trim();
    if (!name) {
      setDraftError('Informe o nome do fornecedor.');
      return;
    }
    setDraftError('');
    onUpdate(idx, { name });
  };

  const handleAdd = () => {
    const nextIdx = vendors.length;
    onAdd();
    setExpandedIdx(nextIdx);
  };

  return (
    <div className="finance-settings-section-body">
      <p className="finance-settings-lead">
        Cadastre fornecedores recorrentes (água, luz, telefone) para autocompletar categoria e vencimento ao
        registrar contas em{' '}
        <Link to={buildPayablesPath({ section: PAYABLES_SECTIONS.CONTAS_FIXAS })} className="edit-link">
          A pagar
        </Link>
        .
      </p>

      {vendors.length === 0 ? (
        <EmptyState
          title="Nenhum fornecedor cadastrado"
          description="Adicione fornecedores para agilizar o cadastro de contas fixas."
          primaryAction={{ label: 'Adicionar fornecedor', onClick: handleAdd }}
        />
      ) : (
        <div className="finance-settings-plan-list card">
          {vendors.map((vendor, idx) => (
            <React.Fragment key={vendor.id || idx}>
              {idx > 0 ? <div className="finance-settings-group__sep" aria-hidden /> : null}
              <VendorListItem
                vendor={vendor}
                idx={idx}
                expanded={expandedIdx === idx}
                onToggle={() => setExpandedIdx((cur) => (cur === idx ? null : idx))}
                onUpdate={(i, patch) => {
                  setDraftError('');
                  onUpdate(i, patch);
                }}
                onRemove={onRemoveRequest}
                categories={categories}
                onNameBlur={handleNameBlur}
              />
            </React.Fragment>
          ))}
        </div>
      )}

      {draftError ? <FieldError className="mt-2">{draftError}</FieldError> : null}

      {vendors.length > 0 ? (
        <button type="button" className="finance-settings-add-row edit-link" onClick={handleAdd}>
          <Plus size={16} aria-hidden />
          Adicionar fornecedor
        </button>
      ) : null}

      <Link
        to={buildPayablesPath({ section: PAYABLES_SECTIONS.CONTAS_FIXAS })}
        className="finance-config-context-link"
      >
        Ver em A pagar →
      </Link>
    </div>
  );
}
