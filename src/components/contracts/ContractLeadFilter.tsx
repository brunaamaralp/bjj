import React, { useMemo, useRef, useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useLeadStore } from '../../store/useLeadStore.js';
import { isStudentRecord } from '../../lib/studentStatus.js';
import EmptyState from '../shared/EmptyState.jsx';

interface ContractLeadFilterProps {
  leadId: string;
  leadLabel: string;
  onChange: (leadId: string, leadLabel: string) => void;
}

export default function ContractLeadFilter({ leadId, leadLabel, onChange }: ContractLeadFilterProps) {
  const leads = useLeadStore((s) => s.leads);
  const [search, setSearch] = useState(leadLabel);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const students = useMemo(
    () => (leads || []).filter((l) => isStudentRecord(l)),
    [leads]
  );

  const options = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students
      .filter((l) => !q || String(l.name || '').toLowerCase().includes(q))
      .slice(0, 20);
  }, [students, search]);

  useEffect(() => {
    setSearch(leadLabel);
  }, [leadLabel]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div ref={wrapRef} className="contracts-lead-filter" style={{ position: 'relative', flex: 1, minWidth: 200 }}>
      <input
        type="text"
        className="form-input"
        placeholder="Buscar por aluno..."
        value={search}
        autoComplete="off"
        onChange={(e) => {
          setSearch(e.target.value);
          if (leadId) onChange('', '');
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        style={leadId ? { paddingRight: 32 } : undefined}
      />
      {leadId ? (
        <button
          type="button"
          className="contracts-lead-filter-clear"
          aria-label="Limpar aluno"
          onClick={() => {
            onChange('', '');
            setSearch('');
          }}
        >
          <X size={14} />
        </button>
      ) : null}
      {open ? (
        <div className="contracts-lead-filter-drop">
          {options.map((l) => (
            <button
              key={l.id}
              type="button"
              className="contracts-lead-filter-option"
              onMouseDown={() => {
                onChange(String(l.id), String(l.name || ''));
                setSearch(String(l.name || ''));
                setOpen(false);
              }}
            >
              <span className="contracts-lead-filter-name">{l.name}</span>
              {l.phone ? <span className="text-small text-muted">{l.phone}</span> : null}
            </button>
          ))}
          {options.length === 0 ? (
            <EmptyState variant="bare" title="Nenhum aluno encontrado" role="none" />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
