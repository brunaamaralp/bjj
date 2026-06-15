import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { searchStudentsForSale } from '../../lib/studentSaleSearch.js';
import FieldError from '../shared/FieldError.jsx';

function mapStudentHit(doc) {
  if (!doc) return null;
  const id = doc.$id || doc.id;
  if (!id) return null;
  return {
    id,
    name: String(doc.name || doc.nome || '').trim(),
    phone: String(doc.phone || doc.phone_number || '').trim(),
  };
}

/**
 * Busca de aluno via API para formulário de lançamento financeiro.
 */
export default function FinanceTxStudentField({
  academyId,
  value = '',
  leadId = '',
  onChange,
  disabled = false,
  id = 'finance-tx-student',
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    if (!academyId || query.trim().length < 2) {
      setSuggestions([]);
      setBusy(false);
      return undefined;
    }
    const q = query.trim();
    let cancelled = false;
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const hits = await searchStudentsForSale(academyId, q, { limit: 12 });
        if (cancelled) return;
        setSuggestions(hits.map(mapStudentHit).filter(Boolean));
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [academyId, query]);

  const trimmed = query.trim();
  const showDropdown = open && trimmed.length >= 2;

  return (
    <div className="form-group finance-tx-student-group">
      <label htmlFor={id}>Aluno (opcional)</label>
      <input
        id={id}
        name="finance_tx_student"
        className="form-input"
        type="search"
        autoComplete="off"
        spellCheck={false}
        placeholder="Nome ou telefone (mín. 2 caracteres)…"
        value={query}
        disabled={disabled}
        aria-expanded={showDropdown}
        aria-controls={`${id}-listbox`}
        aria-autocomplete="list"
        onChange={(e) => {
          const next = e.target.value;
          setQuery(next);
          setOpen(true);
          if (!next.trim()) onChange({ lead_id: '', name: '' });
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 180);
        }}
      />
      {busy ? (
        <p className="text-small finance-tx-student-group__hint" role="status">
          <Loader2 size={14} className="finance-tx-student-field__spinner" aria-hidden />
          Buscando alunos…
        </p>
      ) : trimmed.length > 0 && trimmed.length < 2 ? (
        <p className="text-small finance-tx-student-group__hint">Digite ao menos 2 caracteres…</p>
      ) : (
        <p className="text-small finance-tx-student-group__hint">
          Alunos matriculados ou marcados como aluno na base.
        </p>
      )}
      {leadId && trimmed ? (
        <p className="text-small finance-tx-student-field__selected" role="status">
          Aluno selecionado
        </p>
      ) : null}
      {showDropdown ? (
        suggestions.length > 0 ? (
          <div
            id={`${id}-listbox`}
            role="listbox"
            className="card finance-tx-student-dropdown navi-menu__panel"
          >
            {suggestions.map((l) => (
              <button
                key={l.id}
                type="button"
                role="option"
                className="btn-ghost finance-tx-student-dropdown__item navi-menu__item"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange({ lead_id: l.id, name: l.name });
                  setQuery(l.name || '');
                  setOpen(false);
                  setSuggestions([]);
                }}
              >
                <div className="finance-tx-student-dropdown__name">{l.name || '—'}</div>
                <div className="text-small finance-tx-student-dropdown__phone">{l.phone || '—'}</div>
              </button>
            ))}
          </div>
        ) : !busy ? (
          <div
            className="card text-small finance-tx-student-dropdown finance-tx-student-dropdown--empty"
            role="status"
          >
            Nenhum aluno encontrado para essa busca.
          </div>
        ) : null
      ) : null}
      <FieldError id={`${id}-error`} />
    </div>
  );
}
