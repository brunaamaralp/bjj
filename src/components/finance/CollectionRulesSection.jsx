import React from 'react';
import { Bell, Plus, Trash2 } from 'lucide-react';
import { DEFAULT_COLLECTION_RULES, DEFAULT_OVERDUE_LABEL } from '../../lib/collectionRules.js';

export default function CollectionRulesSection({
  collectionRules,
  onRulesChange,
  overdueLabel,
  onOverdueLabelChange,
  embedded = false,
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
    <section className="finance-config-section animate-in mensal-collection-rules">
      {!embedded ? (
        <h3 className="navi-section-heading finance-config-section__heading">
          <Bell size={18} className="finance-config-section__icon" aria-hidden />
          Régua de cobrança
        </h3>
      ) : null}
      <p
        className={`finance-config-section__hint mensal-collection-intro${embedded ? ' finance-settings-lead' : ' text-small text-muted'}`}
      >
        Configure o que o sistema faz após o vencimento. O Nave <strong>não envia WhatsApp automaticamente</strong> —
        apenas cria tarefas para a equipe agir.
      </p>
      <div className="finance-config-section__body">
        {typeof onOverdueLabelChange === 'function' ? (
          <div className="form-group mensal-collection-overdue-label">
            <label htmlFor="finance-overdue-label">Etiqueta de inadimplência</label>
            <input
              id="finance-overdue-label"
              className="form-input finance-compact-input"
              maxLength={30}
              value={overdueLabel ?? ''}
              placeholder={DEFAULT_OVERDUE_LABEL}
              onChange={(e) => onOverdueLabelChange(e.target.value)}
            />
            <p className="text-small text-muted">
              Exibida no badge do aluno quando a régua marca inadimplência. Alunos já marcados mantêm a
              etiqueta anterior até a próxima atualização automática.
            </p>
          </div>
        ) : null}
        <div className="mensal-collection-rules-list">
          {rules.map((rule, idx) => {
            const day = Number(rule.day) || 1;
            const label = String(rule.label || '').trim() || 'Etapa';
            return (
              <div key={`rule-${idx}-${rule.day}`} className="mensal-collection-rule-card">
                <button
                  type="button"
                  className="mensal-collection-rule-card__remove"
                  title="Remover etapa"
                  disabled={rules.length <= 1}
                  onClick={() => removeRule(idx)}
                  aria-label="Remover etapa"
                >
                  <Trash2 size={16} aria-hidden />
                </button>
                <div className="mensal-collection-rule-card__header">
                  <p className="mensal-collection-rule-card__title">
                    D+{day} — {label}
                  </p>
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
                </div>
                <div className="mensal-collection-rule-fields-inline">
                  <div className="form-group mensal-collection-rule-day">
                    <label>D+ (dias)</label>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      className="form-input finance-compact-input"
                      value={rule.day ?? ''}
                      onChange={(e) => updateRule(idx, { day: Number(e.target.value) || 1 })}
                    />
                  </div>
                  <div className="form-group mensal-collection-rule-label">
                    <label>Rótulo da etapa</label>
                    <input
                      className="form-input finance-compact-input"
                      value={rule.label || ''}
                      onChange={(e) => updateRule(idx, { label: e.target.value })}
                    />
                  </div>
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
            );
          })}
        </div>
        <button type="button" className="btn-outline mensal-collection-add-step" onClick={addRule}>
          <Plus size={14} aria-hidden />
          Adicionar etapa
        </button>
      </div>
    </section>
  );
}
