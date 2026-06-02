import React, { useMemo, useState } from 'react';
import { Braces } from 'lucide-react';
import {
  CONTRACT_TEMPLATE_VARIABLES,
  CONTRACT_VARIABLE_GROUPS,
} from '../../lib/contractTemplateVariables.js';
import {
  DropdownMenu,
  DropdownMenuPanel,
  DropdownMenuItem,
  DropdownMenuItemStatic,
  DropdownMenuLabel,
} from '../shared/menu';

interface ContractVariableMenuProps {
  onInsert: (key: string) => void;
  disabled?: boolean;
}

export default function ContractVariableMenu({ onInsert, disabled = false }: ContractVariableMenuProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const normalizedQuery = query.trim().toLowerCase();

  const filteredGroups = useMemo(() => {
    return CONTRACT_VARIABLE_GROUPS.map((group) => {
      const items = CONTRACT_TEMPLATE_VARIABLES.filter((v) => {
        if (v.group !== group.id) return false;
        if (!normalizedQuery) return true;
        const hay = `${v.label} ${v.key}`.toLowerCase();
        return hay.includes(normalizedQuery);
      });
      return { ...group, items };
    }).filter((g) => g.items.length > 0);
  }, [normalizedQuery]);

  const handleInsert = (key: string) => {
    onInsert(key);
    setOpen(false);
    setQuery('');
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} align="start" className="contract-variable-menu">
      <button
        type="button"
        className="contract-rich-editor-btn contract-variable-menu__trigger"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Inserir dados do aluno"
        onClick={() => !disabled && setOpen((v) => !v)}
      >
        <Braces size={16} aria-hidden />
        <span className="contract-rich-editor-btn-label">Inserir campo</span>
      </button>

      {open ? (
        <DropdownMenuPanel className="contract-variable-menu__panel" aria-label="Campos do contrato">
          <div className="contract-variable-menu__search-wrap">
            <input
              type="search"
              className="form-input contract-variable-menu__search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar: CPF, plano, responsável…"
              autoFocus
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>

          <div className="contract-variable-menu__list">
            {filteredGroups.length === 0 ? (
              <DropdownMenuItemStatic>Nenhum campo encontrado.</DropdownMenuItemStatic>
            ) : (
              filteredGroups.map((group) => (
                <div key={group.id} className="contract-variable-menu__group">
                  <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
                  {group.items.map((v) => (
                    <DropdownMenuItem
                      key={v.key}
                      title={`Inserir {{${v.key}}}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleInsert(v.key)}
                    >
                      <span className="contract-variable-menu__item-label">{v.label}</span>
                      <code className="contract-variable-menu__item-key">{`{{${v.key}}}`}</code>
                    </DropdownMenuItem>
                  ))}
                </div>
              ))
            )}
          </div>

          <p className="contract-variable-menu__hint text-small text-muted">
            Insere no cursor (destacado em roxo no modo Visual). Valores vêm do cadastro ao enviar.
          </p>
        </DropdownMenuPanel>
      ) : null}
    </DropdownMenu>
  );
}
