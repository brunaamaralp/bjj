import React, { useMemo, useState } from 'react';
import type { ContractSignerLayout, SignerLayoutSlot } from '../../../lib/contracts/contractSignerLayout.js';

interface ContractSignerLayoutFormProps {
  layout: ContractSignerLayout;
  onChange: (layout: ContractSignerLayout) => void;
  disabled?: boolean;
}

const SLOT_COPY = [
  {
    title: 'Aluno ou responsável',
    hint: 'Recebe o link por e-mail ou WhatsApp e assina na Autentique.',
    labelPlaceholder: 'Ex.: Contratante',
    canDisable: false,
  },
  {
    title: 'Academia',
    hint: 'Segunda assinatura — em geral o responsável pela academia.',
    labelPlaceholder: 'Ex.: Contratada',
    canDisable: true,
    enableLabel: 'A academia também precisa assinar',
  },
] as const;

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

function SignerPreview({ layout }: { layout: ContractSignerLayout }) {
  return (
    <div className="contract-signer-preview" aria-hidden>
      <div className="contract-signer-preview__page">
        <div className="contract-signer-preview__lines">
          <span />
          <span />
          <span />
          <span className="contract-signer-preview__lines--short" />
        </div>
        <div className="contract-signer-preview__footer">
          {layout.slots.map((slot, index) => {
            const active = slot.enabled !== false;
            const x = slot.elements?.find((el) => el.element === 'SIGNATURE')?.x ?? (index === 0 ? '25' : '75');
            const left = `${Math.min(92, Math.max(4, Number(x) - 14))}%`;
            return (
              <div
                key={index}
                className={`contract-signer-preview__sig${active ? '' : ' contract-signer-preview__sig--off'}`}
                style={{ left }}
              >
                <span className="contract-signer-preview__sig-mark" />
                <span className="contract-signer-preview__sig-label">
                  {slot.label?.trim() || SLOT_COPY[index]?.title || `Assinatura ${index + 1}`}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-small text-muted contract-signer-preview__caption">
        Prévia do rodapé — a assinatura digital aparece no final do PDF.
      </p>
    </div>
  );
}

export default function ContractSignerLayoutForm({
  layout,
  onChange,
  disabled = false,
}: ContractSignerLayoutFormProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const activeCount = useMemo(
    () => layout.slots.filter((s) => s.enabled !== false).length,
    [layout.slots]
  );

  const summaryText =
    activeCount === 1
      ? 'Ao enviar, 1 pessoa receberá o link para assinar.'
      : `Ao enviar, ${activeCount} pessoas receberão links para assinar (uma de cada vez).`;

  return (
    <fieldset className="contract-signer-layout card" disabled={disabled}>
      <legend className="task-field-label">Quem assina este contrato?</legend>
      <p className="text-small text-muted contract-signer-layout__intro">
        O rodapé no texto do contrato (caixas tracejadas) mostra onde cada pessoa assina. Ao enviar, a
        Autentique preenche esses campos digitalmente — não use <code>{'{{assinatura}}'}</code> no texto.
      </p>

      <SignerPreview layout={layout} />

      <div className="contract-signer-layout__grid">
        {layout.slots.map((slot, index) => {
          const copy = SLOT_COPY[index] || SLOT_COPY[0];
          const signature = slot.elements?.find((el) => el.element === 'SIGNATURE');
          const enabled = slot.enabled !== false;

          return (
            <div
              key={index}
              className={`contract-signer-layout__slot${enabled ? '' : ' contract-signer-layout__slot--off'}`}
            >
              <div className="contract-signer-layout__slot-head">
                <div>
                  <p className="contract-signer-layout__slot-title">{copy.title}</p>
                  <p className="text-small text-muted contract-signer-layout__slot-hint">{copy.hint}</p>
                </div>
              </div>

              {copy.canDisable ? (
                <label className="contract-signer-layout__toggle contract-signer-layout__toggle--primary">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => onChange(updateSlot(layout, index, { enabled: e.target.checked }))}
                  />
                  <span>{copy.enableLabel}</span>
                </label>
              ) : null}

              {enabled ? (
                <>
                  <div className="form-group contract-signer-layout__field">
                    <label className="task-field-label" htmlFor={`sig-slot-label-${index}`}>
                      Texto abaixo da assinatura
                    </label>
                    <input
                      id={`sig-slot-label-${index}`}
                      className="form-input"
                      value={slot.label}
                      onChange={(e) => onChange(updateSlot(layout, index, { label: e.target.value }))}
                      placeholder={copy.labelPlaceholder}
                    />
                  </div>

                  <div className="contract-signer-layout__flags">
                    <label className="contract-signer-layout__toggle">
                      <input
                        type="checkbox"
                        checked={slot.includeName !== false}
                        onChange={(e) =>
                          onChange(updateSlot(layout, index, { includeName: e.target.checked }))
                        }
                      />
                      <span>Mostrar nome de quem assinou</span>
                    </label>
                    <label className="contract-signer-layout__toggle">
                      <input
                        type="checkbox"
                        checked={Boolean(slot.includeDate)}
                        onChange={(e) =>
                          onChange(updateSlot(layout, index, { includeDate: e.target.checked }))
                        }
                      />
                      <span>Mostrar data da assinatura</span>
                    </label>
                  </div>
                </>
              ) : null}

              {enabled && showAdvanced ? (
                <div className="contract-signer-layout__coords">
                  <p className="text-small text-muted contract-signer-layout__coords-label">
                    Posição fina no PDF (só ajuste se a assinatura sair do lugar na prévia)
                  </p>
                  <div className="contract-signer-layout__coords-grid">
                    <label>
                      <span className="text-small text-muted">Horizontal (%)</span>
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
                      <span className="text-small text-muted">Vertical (%)</span>
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
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="contract-signer-layout__footer">
        <p className="text-small contract-signer-layout__summary">{summaryText}</p>
        <button
          type="button"
          className="edit-link text-small contract-signer-layout__advanced-toggle"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? 'Ocultar ajuste de posição' : 'Ajuste avançado de posição no PDF'}
        </button>
      </div>
    </fieldset>
  );
}
