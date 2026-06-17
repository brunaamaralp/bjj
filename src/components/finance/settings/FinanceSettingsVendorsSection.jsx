import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import EmptyState from '../../shared/EmptyState.jsx';
import FieldError from '../../shared/FieldError.jsx';
import { vendorCategoryOptions } from '../../../lib/financeVendors.js';

export default function FinanceSettingsVendorsSection({
  financeConfig,
  onUpdate,
  onAdd,
  onRemoveRequest,
}) {
  const vendors = financeConfig?.vendors || [];
  const categories = vendorCategoryOptions();
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

  return (
    <div className="finance-settings-section-body">
      <p className="text-small text-muted mb-3">
        Cadastre fornecedores recorrentes (água, luz, telefone) para autocompletar ao registrar contas a pagar.
      </p>

      {vendors.length === 0 ? (
        <EmptyState
          variant="embedded"
          title="Nenhum fornecedor cadastrado"
          description="Adicione fornecedores para agilizar o cadastro de contas fixas."
          primaryAction={{ label: 'Adicionar fornecedor', onClick: onAdd }}
        />
      ) : (
        <div className="finance-settings-vendors">
          {vendors.map((vendor, idx) => (
            <div key={vendor.id || idx} className="finance-settings-vendor card mb-2">
              <div className="form-stack">
                <div className="form-group">
                  <label htmlFor={`vendor-name-${idx}`}>Nome</label>
                  <input
                    id={`vendor-name-${idx}`}
                    className="form-input"
                    value={vendor.name || ''}
                    placeholder="Ex.: CPFL, Sabesp…"
                    onChange={(e) => {
                      setDraftError('');
                      onUpdate(idx, { name: e.target.value });
                    }}
                    onBlur={(e) => handleNameBlur(idx, e.target.value)}
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
              </div>
              <div className="finance-settings-vendor__actions mt-2">
                <button
                  type="button"
                  className="btn-ghost btn-sm text-danger"
                  onClick={() => onRemoveRequest(idx)}
                >
                  <Trash2 size={14} aria-hidden />
                  Remover
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {draftError ? <FieldError className="mt-2">{draftError}</FieldError> : null}

      {vendors.length > 0 ? (
        <button type="button" className="btn-outline btn-sm mt-3" onClick={onAdd}>
          <Plus size={14} aria-hidden />
          Adicionar fornecedor
        </button>
      ) : null}
    </div>
  );
}
