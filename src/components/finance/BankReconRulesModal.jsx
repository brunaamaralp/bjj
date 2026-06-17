import React, { useEffect, useState } from 'react';
import ModalShell from '../shared/ModalShell.jsx';
import { disableReconPayerRule, listReconPayerRules } from '../../lib/bankReconciliationApi.js';
import { useToast } from '../../hooks/useToast';

export default function BankReconRulesModal({ open, academyId, onClose, onChanged }) {
  const toast = useToast();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState('');

  useEffect(() => {
    if (!open || !academyId) return;
    setLoading(true);
    void listReconPayerRules(academyId)
      .then((body) => setRules(body.rules || []))
      .catch(() => setRules([]))
      .finally(() => setLoading(false));
  }, [open, academyId]);

  const handleDisable = async (rule) => {
    const key = `${rule.lead_id}:${rule.normalized}`;
    if (busyId || !academyId) return;
    setBusyId(key);
    try {
      await disableReconPayerRule(academyId, {
        lead_id: rule.lead_id,
        normalized: rule.normalized,
      });
      setRules((prev) => prev.filter((r) => `${r.lead_id}:${r.normalized}` !== key));
      toast.success('Regra desativada.');
      onChanged?.();
    } catch (e) {
      toast.show({ type: 'error', message: String(e?.message || 'Erro ao desativar regra.') });
    } finally {
      setBusyId('');
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Regras de pagador"
      description="Nomes do extrato que o Nave sugere automaticamente para cada aluno."
      footer={
        <button type="button" className="btn-primary" onClick={onClose}>
          Fechar
        </button>
      }
    >
      {loading ? <p className="text-small text-muted">Carregando…</p> : null}
      {!loading && rules.length === 0 ? (
        <p className="text-small text-muted mb-0">Nenhuma regra ativa. Salve uma ao confirmar um vínculo manual.</p>
      ) : null}
      {!loading && rules.length > 0 ? (
        <ul className="bank-recon-rules-list">
          {rules.map((rule) => {
            const key = `${rule.lead_id}:${rule.normalized}`;
            return (
              <li key={key} className="bank-recon-rules-list__item">
                <div>
                  <p className="bank-recon-pair__title text-sm mb-0">{rule.display}</p>
                  <p className="text-xs text-muted mb-0">→ {rule.lead_name || 'Aluno'}</p>
                </div>
                <button
                  type="button"
                  className="btn-outline btn-sm"
                  disabled={busyId === key}
                  onClick={() => void handleDisable(rule)}
                >
                  Desativar
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </ModalShell>
  );
}
