import React from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  EXCEPTION_STATUS_KEYS,
  DEFAULT_EXCEPTION_STATUS_LABELS,
  EXCEPTION_STATUS_COLORS,
} from '../../lib/paymentExceptions.js';

export default function ExceptionStatusLabelsSection({ labels, onChange }) {
  return (
    <section className="mt-4 animate-in">
      <h3 className="navi-section-heading mb-2">
        <AlertTriangle size={18} color="var(--v500)" style={{ marginRight: 6, verticalAlign: 'middle' }} />
        Status de exceção
      </h3>
      <p className="text-small text-muted" style={{ marginBottom: 12 }}>
        Personalize os nomes exibidos na aba Exceções de Mensalidades. As regras de quando cada status aparece são
        definidas pelo sistema.
      </p>
      <div className="card" style={{ padding: 12 }}>
        <div className="flex-col" style={{ gap: 10 }}>
          {EXCEPTION_STATUS_KEYS.map((key) => {
            const colors = EXCEPTION_STATUS_COLORS[key];
            return (
              <div key={key} className="flex gap-2" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '4px 10px',
                    borderRadius: 20,
                    background: colors.bg,
                    color: colors.color,
                    minWidth: 100,
                    textAlign: 'center',
                  }}
                >
                  {labels[key] || DEFAULT_EXCEPTION_STATUS_LABELS[key]}
                </span>
                <input
                  className="form-input"
                  style={{ flex: 1, minWidth: 160 }}
                  value={labels[key] || ''}
                  placeholder={DEFAULT_EXCEPTION_STATUS_LABELS[key]}
                  onChange={(e) => onChange({ ...labels, [key]: e.target.value })}
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
