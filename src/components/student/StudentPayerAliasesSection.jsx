import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import {
  appendPayerAlias,
  PAYER_ALIAS_MAX,
  titleCasePayerName,
} from '../../lib/studentPayerAliases.js';

function sourceHint(source) {
  if (source === 'learned') return 'Aprendido na conciliação bancária';
  if (source === 'from_responsavel') return 'Adicionado a partir do responsável';
  return null;
}

export default function StudentPayerAliasesSection({
  aliases = [],
  responsavel = '',
  onChange,
  onPersist,
  deferred = false,
  disabled = false,
  saving = false,
}) {
  const toast = useToast();
  const [draft, setDraft] = useState('');

  const applyAliases = async (next) => {
    onChange?.(next);
    if (!deferred && onPersist) {
      try {
        await onPersist(next);
      } catch {
        /* toast handled by caller */
      }
    }
  };

  const addAlias = async (display, source = 'manual') => {
    const result = appendPayerAlias(aliases, { display, source });
    if (result.error === 'limit_reached') {
      toast.show({ type: 'warning', message: `Limite de ${PAYER_ALIAS_MAX} pagadores atingido.` });
      return;
    }
    if (result.added || result.updated) {
      await applyAliases(result.aliases);
      setDraft('');
    }
  };

  const removeAlias = async (normalized) => {
    const next = aliases.filter((a) => a.normalized !== normalized);
    await applyAliases(next);
  };

  const useResponsavel = async () => {
    const name = String(responsavel || '').trim();
    if (!name) return;
    await addAlias(name, 'from_responsavel');
  };

  const canEdit = !disabled && !saving;
  const atLimit = aliases.length >= PAYER_ALIAS_MAX;

  return (
    <div className="profile-inline-field profile-inline-field--row student-payer-field">
      <span className="profile-inline-field__label">Quem paga (extrato)</span>
      <div className="profile-inline-field__body">
        {aliases.length > 0 ? (
          <div className="student-payer-chips" role="list" aria-label="Pagadores cadastrados">
            {aliases.map((alias) => {
              const hint = sourceHint(alias.source);
              return (
                <span
                  key={alias.normalized}
                  className="student-payer-chip"
                  role="listitem"
                  title={hint || undefined}
                >
                  <span className="student-payer-chip__label">{alias.display}</span>
                  {canEdit ? (
                    <button
                      type="button"
                      className="student-payer-chip__remove"
                      aria-label={`Remover ${alias.display}`}
                      onClick={() => void removeAlias(alias.normalized)}
                    >
                      <X size={12} aria-hidden />
                    </button>
                  ) : null}
                </span>
              );
            })}
          </div>
        ) : (
          <p className="student-payer-field__empty text-small text-muted">Nenhum pagador cadastrado</p>
        )}

        {canEdit ? (
          <div className="student-payer-field__add">
            <input
              type="text"
              className="student-payer-field__input"
              placeholder="Nome como aparece no PIX"
              value={draft}
              maxLength={128}
              disabled={atLimit}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const v = titleCasePayerName(draft);
                  if (v) void addAlias(v, 'manual');
                }
              }}
            />
            <button
              type="button"
              className="btn-outline btn-sm student-payer-field__add-btn"
              disabled={!String(draft || '').trim() || atLimit}
              onClick={() => {
                const v = titleCasePayerName(draft);
                if (v) void addAlias(v, 'manual');
              }}
            >
              <Plus size={14} aria-hidden />
              Adicionar
            </button>
            {responsavel ? (
              <button type="button" className="btn-outline btn-sm" onClick={() => void useResponsavel()}>
                Usar responsável
              </button>
            ) : null}
          </div>
        ) : null}

        <p className="student-payer-field__hint text-xs text-muted">
          Nomes que aparecem no PIX ou TED ao pagar a mensalidade. O responsável pode ser outra pessoa.
        </p>
      </div>
    </div>
  );
}
