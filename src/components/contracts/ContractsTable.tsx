import React from 'react';
import { Eye } from 'lucide-react';
import type { ContractListItem } from '../../features/contracts/types.js';
import ContractStatusBadge from './ContractStatusBadge.js';
import EmptyState from '../shared/EmptyState.jsx';

interface ContractsTableProps {
  rows: ContractListItem[];
  onOpen: (id: string) => void;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
}

export default function ContractsTable({ rows, onOpen }: ContractsTableProps) {
  if (!rows.length) {
    return (
      <EmptyState
        variant="embedded"
        title="Nenhum contrato encontrado"
        description="Envie o primeiro contrato para assinatura digital."
      />
    );
  }

  return (
    <div className="contracts-table-wrap">
      <table className="contracts-table">
        <thead>
          <tr>
            <th>Nome do contrato</th>
            <th>Aluno</th>
            <th>Status</th>
            <th>Signatários</th>
            <th>Data de envio</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const signed = row.signersSigned ?? 0;
            const total = row.signersTotal ?? 0;
            return (
              <tr key={row.$id} className="contracts-table-row" onClick={() => onOpen(row.$id)}>
                <td data-label="Contrato">
                  <span className="contracts-table-name">{row.name}</span>
                  {row.sandbox ? <span className="contracts-sandbox-tag contracts-sandbox-tag--inline">Sandbox</span> : null}
                </td>
                <td data-label="Aluno">{row.studentName || '—'}</td>
                <td data-label="Status">
                  <ContractStatusBadge status={row.displayStatus} />
                </td>
                <td data-label="Signatários">
                  <span className="contracts-signers-pill">
                    {signed}/{total || '—'} assinados
                  </span>
                </td>
                <td data-label="Enviado">{formatDate(row.createdAt)}</td>
                <td data-label="Ações">
                  <button
                    type="button"
                    className="btn-outline contracts-table-action"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(row.$id);
                    }}
                  >
                    <Eye size={14} />
                    Ver
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
