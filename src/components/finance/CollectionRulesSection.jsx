import React from 'react';
import { Bell, Plus, Trash2 } from 'lucide-react';
import { DEFAULT_COLLECTION_RULES, DEFAULT_OVERDUE_LABEL } from '../../lib/collectionRules.js';

export default function CollectionRulesSection({
  collectionRules,
  overdueLabel,
  onRulesChange,
  onOverdueLabelChange,
}) {
  const rules = Array.isArray(collectionRules) ? collectionRules : DEFAULT_COLLECTION_RULES;

  const updateRule = (idx, patch) => {
    const arr = rules.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    onRulesChange(arr);
  };

  const addRule = () => {
    const maxDay = rules.reduce((m, r) => Math.max(m, Number(r.day) || 0), 0);
    onRulesChange([
      ...rules,
      {
        day: maxDay + 7 || 1,
        label: 'Nova etapa',
        defaultMessage: '',
        escalate: false,
      },
    ]);
  };

  const removeRule = (idx) => {
    if (rules.length <= 1) return;
    onRulesChange(rules.filter((_, i) => i !== idx));
  };

  return (
    <section className="mt-4 animate-in" style={{ animationDelay: '0.08s' }}>
      <h3 className="navi-section-heading mb-2">
        <Bell size={18} color="var(--v500)" /> Régua de cobrança
      </h3>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.45 }}>
        Define prazos e mensagens padrão para inadimplência. O sistema cria tarefas para o atendente enviar
        manualmente (WhatsApp ou presencial) — sem envio automático.
      </p>
      <div className="card">
        <div className="form-group" style={{ marginBottom: 16 }}>
          <label>Etiqueta de inadimplência</label>
          <input
            className="form-input"
            value={overdueLabel || DEFAULT_OVERDUE_LABEL}
            onChange={(e) => onOverdueLabelChange(e.target.value)}
            placeholder={DEFAULT_OVERDUE_LABEL}
            maxLength={30}
          />
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, display: 'block' }}>
            Aplicada automaticamente a partir de D+1 após o vencimento; removida ao regularizar o pagamento.
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {rules.map((rule, idx) => (
            <div
              key={`rule-${idx}-${rule.day}`}
              style={{
                border: '0.5px solid var(--border-light, #e8e8ef)',
                borderRadius: 8,
                padding: 12,
                background: 'var(--surface-hover, #fafafa)',
              }}
            >
              <div className="flex" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div className="form-group" style={{ width: 100 }}>
                  <label>D+ (dias)</label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    className="form-input"
                    value={rule.day ?? ''}
                    onChange={(e) => updateRule(idx, { day: Number(e.target.value) || 1 })}
                  />
                </div>
                <div className="form-group" style={{ flex: 1, minWidth: 140 }}>
                  <label>Rótulo da etapa</label>
                  <input
                    className="form-input"
                    value={rule.label || ''}
                    onChange={(e) => updateRule(idx, { label: e.target.value })}
                  />
                </div>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 13,
                    marginBottom: 8,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={rule.escalate === true}
                    onChange={(e) =>
                      updateRule(idx, {
                        escalate: e.target.checked,
                        defaultMessage: e.target.checked ? '' : rule.defaultMessage,
                      })
                    }
                  />
                  Escalar para responsável
                </label>
                <button
                  type="button"
                  className="btn-ghost"
                  title="Remover etapa"
                  disabled={rules.length <= 1}
                  onClick={() => removeRule(idx)}
                  style={{ alignSelf: 'center' }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              {!rule.escalate ? (
                <div className="form-group" style={{ marginTop: 10, marginBottom: 0 }}>
                  <label>Mensagem padrão (use [nome] para o aluno)</label>
                  <textarea
                    className="form-input"
                    rows={3}
                    value={rule.defaultMessage ?? ''}
                    onChange={(e) => updateRule(idx, { defaultMessage: e.target.value })}
                    placeholder="Texto sugerido para WhatsApp ou contato presencial"
                  />
                </div>
              ) : (
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '8px 0 0' }}>
                  Nesta etapa é criada uma tarefa para o dono da academia e um registro na timeline do aluno.
                </p>
              )}
            </div>
          ))}
        </div>
        <button type="button" className="btn-outline mt-3" onClick={addRule}>
          <Plus size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
          Adicionar etapa
        </button>
      </div>
    </section>
  );
}
