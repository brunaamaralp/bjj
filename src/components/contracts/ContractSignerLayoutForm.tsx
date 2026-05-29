import React, { useMemo } from 'react';
import type { ContractSignerLayout, SignerLayoutSlot } from '../../../lib/contracts/contractSignerLayout.js';

interface ContractSignerLayoutFormProps {
  layout: ContractSignerLayout;
  onChange: (layout: ContractSignerLayout) => void;
  disabled?: boolean;
}

function updateSlot(
  layout: ContractSignerLayout,
  index: number,
  patch: Partial<SignerLayoutSlot>
): ContractSignerLayout {
  const slots = layout.slots.map((slot, i) => {
    if (i !== index) return slot;
    const next = { ...slot, ...patch };
    if ('includeName' in patch || 'includeDate' in patch) {
      const elements = [...(next.elements || [])];
      const sig = elements.find((el) => el.element === 'SIGNATURE') || {
        element: 'SIGNATURE' as const,
        x: index === 0 ? '25' : '75',
        y: '88',
        z: 'last' as const,
      };
      const baseX = sig.x;
      const rebuilt = [sig];
      if (next.includeName !== false) {
        rebuilt.push({ element: 'NAME', x: baseX, y: '92', z: 'last' });
      }
      if (next.includeDate) {
        rebuilt.push({ element: 'DATE', x: baseX, y: '95', z: 'last' });
      }
      next.elements = rebuilt;
    }
    return next;
  });
  return { ...layout, slots };
}

function updateElementCoord(
  layout: ContractSignerLayout,
  slotIndex: number,
  element: 'SIGNATURE' | 'NAME' | 'DATE',
  axis: 'x' | 'y',
  value: string
): ContractSignerLayout {
  const slots = layout.slots.map((slot, i) => {
    if (i !== slotIndex) return slot;
    const elements = (slot.elements || []).map((el) =>
      el.element === element ? { ...el, [axis]: value } : el
    );
    return { ...slot, elements };
  });
  return { ...layout, slots };
}

export default function ContractSignerLayoutForm({
  layout,
  onChange,
  disabled = false,
}: ContractSignerLayoutFormProps) {
  const activeCount = useMemo(
    () => layout.slots.filter((s) => s.enabled !== false).length,
    [layout.slots]
  );

  return (
    <fieldset className="contract-signer-layout card" disabled={disabled}>
      <legend className="task-field-label">Campos de assinatura (Autentique)</legend>
      <p className="text-small text-muted contract-signer-layout__hint">
        Posição em porcentagem na última página do PDF. Signatário 1 = slot esquerdo; signatário 2 =
        slot direito.
      </p>

      <div className="contract-signer-layout__grid">
        {layout.slots.map((slot, index) => {
          const signature = slot.elements?.find((el) => el.element === 'SIGNATURE');
          return (
            <div key={index} className="contract-signer-layout__slot">
              <div className="contract-signer-layout__slot-head">
                <label className="task-field-label" htmlFor={`sig-slot-label-${index}`}>
                  Slot {index + 1}
                </label>
                <label className="contract-signer-layout__toggle">
                  <input
                    type="checkbox"
                    checked={slot.enabled !== false}
                    onChange={(e) => onChange(updateSlot(layout, index, { enabled: e.target.checked }))}
                  />
                  <span>Ativo</span>
                </label>
              </div>

              <input
                id={`sig-slot-label-${index}`}
                className="form-input"
                value={slot.label}
                onChange={(e) => onChange(updateSlot(layout, index, { label: e.target.value }))}
                placeholder={index === 0 ? 'Contratante' : 'Contratada'}
              />

              <div className="contract-signer-layout__coords">
                <label>
                  <span className="text-small text-muted">X assinatura (%)</span>
                  <input
                    className="form-input"
                    type="number"
                    min={0}
                    max={100}
                    value={signature?.x ?? (index === 0 ? 25 : 75)}
                    onChange={(e) =>
                      onChange(
                        updateElementCoord(layout, index, 'SIGNATURE', 'x', String(e.target.value))
                      )
                    }
                  />
                </label>
                <label>
                  <span className="text-small text-muted">Y assinatura (%)</span>
                  <input
                    className="form-input"
                    type="number"
                    min={0}
                    max={100}
                    value={signature?.y ?? 88}
                    onChange={(e) =>
                      onChange(
                        updateElementCoord(layout, index, 'SIGNATURE', 'y', String(e.target.value))
                      )
                    }
                  />
                </label>
              </div>

              <div className="contract-signer-layout__flags">
                <label className="contract-signer-layout__toggle">
                  <input
                    type="checkbox"
                    checked={slot.includeName !== false}
                    onChange={(e) => onChange(updateSlot(layout, index, { includeName: e.target.checked }))}
                  />
                  <span>Incluir nome</span>
                </label>
                <label className="contract-signer-layout__toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(slot.includeDate)}
                    onChange={(e) => onChange(updateSlot(layout, index, { includeDate: e.target.checked }))}
                  />
                  <span>Incluir data</span>
                </label>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-small text-muted">
        Modelo configurado para <strong>{activeCount}</strong> signatário(s) no envio.
      </p>
    </fieldset>
  );
}
