import React, { useState } from 'react';
import { Plus, Trash2, UserPlus } from 'lucide-react';
import {
  appendPayerAlias,
  PAYER_ALIAS_MAX,
  titleCasePayerName,
} from '../../lib/studentPayerAliases.js';

const SOURCE_LABELS = {
  manual: 'Manual',
  learned: 'Aprendido',
  from_responsavel: 'Responsável',
};

export default function StudentPayerAliasesSection({
  aliases = [],
  responsavel = '',
  onChange,
  disabled = false,
  max = PAYER_ALIAS_MAX,
}) {
  const [draft, setDraft] = useState('');

  const addAlias = (display, source = 'manual') => {
    const result = appendPayerAlias(aliases, { display, source });
    if (result.error === 'limit_reached') return;
    if (result.added || result.updated) onChange?.(result.aliases);
    setDraft('');
  };

  const removeAlias = (normalized) => {
    onChange?.(aliases.filter((a) => a.normalized !== normalized));
  };

  const useResponsavel = () => {
    const name = String(responsavel || '').trim();
    if (!name) return;
    addAlias(name, 'from_responsavel');
  };

  return (
    <div className="profile-section-block student-payer-aliases-section">
      <h3 className="profile-section-heading">Quem costuma pagar</h3>
      <p className="text-small text-muted" style={{ margin: '0 0 12px', lineHeight: 1.45 }}>
        Nomes que aparecem no extrato bancário (PIX, TED etc.) e ajudam a conciliar mensalidades. O
        responsável cadastral pode ser outra pessoa.
      </p>

      {aliases.length > 0 ? (
        <ul className="student-payer-aliases-list" style={{ listStyle: 'none', margin: '0 0 12px', padding: 0 }}>
          {aliases.map((alias) => (
            <li
              key={alias.normalized}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                padding: '8px 0',
                borderBottom: '0.5px solid var(--border-light)',
              }}
            >
              <div>
                <span style={{ fontSize: 13, color: 'var(--text)' }}>{alias.display}</span>
                <span className="text-xs text-muted" style={{ marginLeft: 8 }}>
                  {SOURCE_LABELS[alias.source] || alias.source}
                </span>
              </div>
              {!disabled ? (
                <button
                  type="button"
                  className="btn-icon btn-icon--ghost"
                  aria-label={`Remover ${alias.display}`}
                  onClick={() => removeAlias(alias.normalized)}
                >
                  <Trash2 size={15} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-small text-muted" style={{ margin: '0 0 12px' }}>
          Nenhum pagador cadastrado ainda.
        </p>
      )}

      {!disabled ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            className="student-profile-data-input"
            placeholder="Nome como aparece no extrato"
            value={draft}
            maxLength={128}
            disabled={aliases.length >= max}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const v = titleCasePayerName(draft);
                if (v) addAlias(v, 'manual');
              }
            }}
            style={{ flex: '1 1 180px', minHeight: 40 }}
          />
          <button
            type="button"
            className="btn-outline btn-sm"
            disabled={!String(draft || '').trim() || aliases.length >= max}
            onClick={() => {
              const v = titleCasePayerName(draft);
              if (v) addAlias(v, 'manual');
            }}
          >
            <Plus size={14} /> Adicionar
          </button>
          {responsavel ? (
            <button type="button" className="btn-outline btn-sm" onClick={useResponsavel}>
              <UserPlus size={14} /> Usar responsável
            </button>
          ) : null}
        </div>
      ) : null}

      {!disabled && aliases.length >= max ? (
        <p className="text-xs text-muted" style={{ marginTop: 8 }}>
          Limite de {max} pagadores atingido.
        </p>
      ) : null}
    </div>
  );
}
