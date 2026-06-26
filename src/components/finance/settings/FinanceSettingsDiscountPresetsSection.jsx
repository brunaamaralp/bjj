import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  DEFAULT_ENROLLMENT_DISCOUNT_PRESETS,
  formatPresetOptionLabel,
} from '../../../lib/enrollmentDiscountPresets.js';
import { DISCOUNT_TYPES } from '../../../lib/planBilling.js';

export default function FinanceSettingsDiscountPresetsSection({ presets = [], onChange }) {
  const list = Array.isArray(presets) ? presets : [];

  const updateAt = (idx, patch) => {
    const next = list.map((item, i) => (i === idx ? { ...item, ...patch } : item));
    onChange?.(next);
  };

  const addPreset = () => {
    onChange?.([
      ...list,
      {
        id: `preset_${Date.now()}`,
        label: '',
        type: DISCOUNT_TYPES.PERCENT,
        amount: 10,
      },
    ]);
  };

  const removeAt = (idx) => {
    onChange?.(list.filter((_, i) => i !== idx));
  };

  return (
    <div className="card" style={{ padding: 16, marginTop: 16 }}>
      <h4 className="finance-settings-subheading" style={{ margin: '0 0 6px' }}>
        Condições promocionais na matrícula
      </h4>
      <p className="text-small text-muted" style={{ margin: '0 0 14px', lineHeight: 1.45 }}>
        Atalhos exibidos ao matricular ou editar o desconto do aluno (ex.: família, segurança pública).
        O valor final sempre usa o <strong>preço do plano</strong> escolhido menos o percentual ou valor fixo.
      </p>

      {list.length === 0 ? (
        <p className="text-small text-muted" style={{ margin: '0 0 12px' }}>
          Nenhuma condição cadastrada. Adicione uma ou restaure os padrões.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {list.map((preset, idx) => (
            <div
              key={preset.id || idx}
              className="finance-settings-discount-preset-row"
              style={{
                display: 'grid',
                gap: 8,
                gridTemplateColumns: '1fr auto auto auto',
                alignItems: 'end',
              }}
            >
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Nome</label>
                <input
                  className="form-input"
                  value={preset.label || ''}
                  placeholder="Ex.: Família"
                  onChange={(e) => updateAt(idx, { label: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ margin: 0, minWidth: 120 }}>
                <label className="form-label">Tipo</label>
                <select
                  className="form-input"
                  value={preset.type === DISCOUNT_TYPES.FIXED ? DISCOUNT_TYPES.FIXED : DISCOUNT_TYPES.PERCENT}
                  onChange={(e) => updateAt(idx, { type: e.target.value })}
                >
                  <option value={DISCOUNT_TYPES.PERCENT}>%</option>
                  <option value={DISCOUNT_TYPES.FIXED}>R$</option>
                </select>
              </div>
              <div className="form-group" style={{ margin: 0, minWidth: 88 }}>
                <label className="form-label">Valor</label>
                <input
                  className="form-input"
                  type="text"
                  inputMode="decimal"
                  value={preset.amount ?? ''}
                  onChange={(e) => {
                    const raw = String(e.target.value || '').replace(',', '.');
                    const n = parseFloat(raw);
                    updateAt(idx, { amount: Number.isFinite(n) ? n : 0 });
                  }}
                />
              </div>
              <button
                type="button"
                className="btn-outline btn-sm"
                aria-label="Remover condição"
                onClick={() => removeAt(idx)}
                style={{ marginBottom: 2 }}
              >
                <Trash2 size={14} aria-hidden />
              </button>
              {preset.label ? (
                <p className="text-small text-muted" style={{ gridColumn: '1 / -1', margin: 0 }}>
                  Na matrícula: {formatPresetOptionLabel(preset)}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
        <button type="button" className="btn-outline btn-sm" onClick={addPreset}>
          <Plus size={14} aria-hidden />
          Adicionar condição
        </button>
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => onChange?.([...DEFAULT_ENROLLMENT_DISCOUNT_PRESETS])}
        >
          Restaurar padrões
        </button>
      </div>
    </div>
  );
}
