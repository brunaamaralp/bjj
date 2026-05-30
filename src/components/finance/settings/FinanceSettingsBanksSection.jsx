import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import ModalShell from '../../shared/ModalShell.jsx';
import EmptyState from '../../shared/EmptyState.jsx';

const EMPTY_BANK = { bankName: '', branch: '', account: '', accountName: '', pixKey: '' };

function bankCardLabel(acc) {
  const bank = String(acc?.bankName || '').trim();
  const pix = String(acc?.pixKey || '').trim();
  if (bank && pix) return `${bank} · PIX ${pix.slice(0, 12)}${pix.length > 12 ? '…' : ''}`;
  if (bank) return bank;
  if (pix) return `PIX ${pix}`;
  return 'Conta sem nome';
}

function bankCardSub(acc) {
  const parts = [];
  if (acc?.branch) parts.push(`Ag. ${acc.branch}`);
  if (acc?.account) parts.push(`Cc. ${acc.account}`);
  if (acc?.accountName) parts.push(acc.accountName);
  return parts.join(' · ') || 'Toque para completar os dados';
}

export default function FinanceSettingsBanksSection({
  financeConfig,
  onSaveBank,
  onRemoveRequest,
}) {
  const [editIdx, setEditIdx] = useState(null);
  const [draft, setDraft] = useState(EMPTY_BANK);
  const accounts = financeConfig.bankAccounts || [];

  const openEdit = (idx) => {
    setEditIdx(idx);
    setDraft({ ...EMPTY_BANK, ...(accounts[idx] || {}) });
  };

  const openNew = () => {
    setEditIdx('new');
    setDraft({ ...EMPTY_BANK });
  };

  const closeModal = () => {
    setEditIdx(null);
    setDraft(EMPTY_BANK);
  };

  const saveDraft = () => {
    if (editIdx == null) return;
    onSaveBank(editIdx, draft);
    closeModal();
  };

  return (
    <div className="finance-settings-section-body">
      <p className="text-small text-muted">
        Dados exibidos em comprovantes e orientações de pagamento.
      </p>

      {accounts.length === 0 ? (
        <EmptyState
          title="Nenhuma conta cadastrada"
          description="Adicione banco ou chave PIX para recebimentos."
          primaryAction={{ label: 'Adicionar conta', onClick: openNew }}
        />
      ) : (
        <div className="finance-settings-bank-list">
          {accounts.map((acc, idx) => (
            <div key={`bank-${idx}`} className="finance-settings-bank-card card">
              <button type="button" className="finance-settings-bank-card__main" onClick={() => openEdit(idx)}>
                <span className="finance-settings-bank-card__title">{bankCardLabel(acc)}</span>
                <span className="finance-settings-bank-card__sub text-small text-muted">{bankCardSub(acc)}</span>
              </button>
              <div className="finance-settings-bank-card__actions">
                <button type="button" className="btn-outline btn-sm" aria-label="Editar" onClick={() => openEdit(idx)}>
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  className="btn-outline btn-sm"
                  aria-label="Remover"
                  onClick={() => onRemoveRequest(idx)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {accounts.length > 0 ? (
        <button type="button" className="finance-settings-add-row edit-link" onClick={openNew}>
          <Plus size={16} aria-hidden />
          Adicionar conta
        </button>
      ) : null}

      <Link to="/financeiro?tab=movimentacoes" className="finance-config-context-link">
        Ver no Caixa →
      </Link>

      <ModalShell
        open={editIdx != null}
        title={editIdx === 'new' ? 'Nova conta' : 'Editar conta'}
        onClose={closeModal}
        maxWidth={480}
        footer={
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn-outline" onClick={closeModal}>
              Cancelar
            </button>
            <button type="button" className="btn-primary" onClick={saveDraft}>
              Aplicar
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="form-group">
            <label>Banco</label>
            <input
              className="form-input"
              value={draft.bankName || ''}
              onChange={(e) => setDraft((d) => ({ ...d, bankName: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>Agência</label>
            <input
              className="form-input"
              value={draft.branch || ''}
              onChange={(e) => setDraft((d) => ({ ...d, branch: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>Conta</label>
            <input
              className="form-input"
              value={draft.account || ''}
              onChange={(e) => setDraft((d) => ({ ...d, account: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>Titular</label>
            <input
              className="form-input"
              value={draft.accountName || ''}
              onChange={(e) => setDraft((d) => ({ ...d, accountName: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>Chave PIX</label>
            <input
              className="form-input"
              value={draft.pixKey || ''}
              onChange={(e) => setDraft((d) => ({ ...d, pixKey: e.target.value }))}
            />
          </div>
        </div>
      </ModalShell>
    </div>
  );
}
