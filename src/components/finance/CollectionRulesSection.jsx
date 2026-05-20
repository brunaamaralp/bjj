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
    <section className="mt-4 animate-in mensal-collection-rules">
      <h3 className="navi-section-heading mb-2">
        <Bell size={18} color="var(--v500)" /> Régua de cobrança
      </h3>
      <p className="text-small text-muted mensal-collection-intro">
        Configure o que o sistema faz após o vencimento. O Nave <strong>não envia WhatsApp
        automaticamente</strong> — apenas cria tarefas e etiquetas para a equipe agir.
      </p>
      <div className="card">
        <div className="form-group mensal-collection-label-field">
          <label>Etiqueta de inadimplência</label>
          <input
            className="form-input"
            value={overdueLabel || DEFAULT_OVERDUE_LABEL}
            onChange={(e) => onOverdueLabelChange(e.target.value)}
            placeholder={DEFAULT_OVERDUE_LABEL}
            maxLength={30}
          />
          <span className="text-small text-muted">
            Aplicada automaticamente a partir de D+1 após o vencimento; removida ao regularizar o
            pagamento.
          </span>
        </div>

        <div className="mensal-collection-rules-list">
          {rules.map((rule, idx) => (
            <div key={`rule-${idx}-${rule.day}`} className="mensal-collection-rule-card">
              <p className="text-small mensal-collection-rule-process">
                {rule.escalate ? (
                  <>
                    <strong>{rule.day} dia(s) após o vencimento</strong> → escala para o responsável
                    da academia (tarefa + registro na timeline). Não envia WhatsApp automaticamente.
                  </>
                ) : (
                  <>
                    <strong>{rule.day} dia(s) após o vencimento</strong> → cria tarefa para a equipe
                    {rule.defaultMessage ? (
                      <>
                        {' '}
                        com esta mensagem: «{rule.defaultMessage.slice(0, 80)}
                        {rule.defaultMessage.length > 80 ? '…' : ''}»
                      </>
                    ) : (
                      ' (defina a mensagem sugerida abaixo)'
                    )}
                    . Não envia WhatsApp automaticamente.
                  </>
                )}
              </p>
              <div className="flex mensal-collection-rule-fields">
                <div className="form-group mensal-collection-rule-day">
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
                <div className="form-group mensal-collection-rule-label">
                  <label>Rótulo da etapa</label>
                  <input
                    className="form-input"
                    value={rule.label || ''}
                    onChange={(e) => updateRule(idx, { label: e.target.value })}
                  />
                </div>
                <label className="mensal-collection-escalate-check">
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
                >
                  <Trash2 size={16} />
                </button>
              </div>
              {!rule.escalate ? (
                <div className="form-group mensal-collection-rule-message">
                  <label>Mensagem padrão (use [nome] para o aluno)</label>
                  <textarea
                    className="form-input"
                    rows={3}
                    value={rule.defaultMessage ?? ''}
                    onChange={(e) => updateRule(idx, { defaultMessage: e.target.value })}
                    placeholder="Texto sugerido para WhatsApp ou contato presencial"
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <button type="button" className="btn-outline mt-3" onClick={addRule}>
          <Plus size={16} />
          Adicionar etapa
        </button>
      </div>
    </section>
  );
}
