import React, { useState } from 'react';
import { MessageCircle, Handshake, Clock } from 'lucide-react';
import ModalShell from '../shared/ModalShell.jsx';
import { useTaskStore } from '../../store/useTaskStore.js';
import { useUiStore } from '../../store/useUiStore.js';
import { useLeadStore } from '../../store/useLeadStore.js';
import { apiSnoozeCollectionRegua } from '../../lib/studentPaymentsApi.js';
import { buildCollectionTaskTitle, buildCollectionTaskDescription } from '../../lib/collectionRules.js';
import { formatBRL } from '../../lib/moneyBr.js';
import { friendlyError } from '../../lib/errorMessages.js';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';

function endOfMonthLabel(ym) {
  const s = String(ym || '').trim().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(s)) return 'o fim do mês';
  const [y, m] = s.split('-').map(Number);
  const last = new Date(y, m, 0);
  if (Number.isNaN(last.getTime())) return 'o fim do mês';
  return last.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function waMeUrl(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  const n = digits.startsWith('55') ? digits : `55${digits}`;
  return `https://wa.me/${n}`;
}

/**
 * Ações rápidas de cobrança (WhatsApp, negociar, adiar régua).
 */
export default function CobrancaRowActions({
  studentId,
  studentName,
  phone,
  stage,
  daysOverdue,
  amount,
  currentMonth,
  busy = false,
  onBusyChange,
  onSnoozed,
  compact = false,
}) {
  const createTask = useTaskStore((s) => s.createTask);
  const addToast = useUiStore((s) => s.addToast);
  const [negotiateOpen, setNegotiateOpen] = useState(false);
  const [negotiateNote, setNegotiateNote] = useState('');
  const [savingNegotiate, setSavingNegotiate] = useState(false);
  const [snoozeConfirmOpen, setSnoozeConfirmOpen] = useState(false);

  const wa = waMeUrl(phone);
  const leadName = String(studentName || '').trim() || 'Aluno';
  const rule = stage || { label: 'Negociação', day: daysOverdue };

  const closeNegotiateModal = () => {
    if (savingNegotiate) return;
    setNegotiateOpen(false);
    setNegotiateNote('');
  };

  const submitNegotiate = async () => {
    if (savingNegotiate) return;
    const note = String(negotiateNote || '').trim();
    setSavingNegotiate(true);
    onBusyChange?.(studentId);
    try {
      const title = buildCollectionTaskTitle(
        rule || { label: 'Negociação', day: daysOverdue },
        leadName
      );
      const description = `${buildCollectionTaskDescription(
        rule || { day: daysOverdue, label: 'Negociação', defaultMessage: '' },
        leadName
      )}\n---\nNegociação manual${note ? `: ${note}` : ''}`;
      await createTask({
        title: title.replace('cobrança', 'negociação'),
        description,
        status: 'pending',
        due_date: new Date().toISOString().slice(0, 10),
        lead_id: studentId,
        lead_name: leadName,
      });
      addToast({ type: 'success', message: 'Tarefa de negociação criada.' });
      closeNegotiateModal();
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSavingNegotiate(false);
      onBusyChange?.(null);
    }
  };

  const handleSnooze = async () => {
    onBusyChange?.(studentId);
    try {
      const academyId = useLeadStore.getState().academyId;
      await apiSnoozeCollectionRegua(studentId, currentMonth, academyId);
      addToast({
        type: 'success',
        message: 'Régua adiada para este aluno até o fim do mês — o cron não criará novas tarefas.',
      });
      setSnoozeConfirmOpen(false);
      onSnoozed?.();
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'action') });
    } finally {
      onBusyChange?.(null);
    }
  };

  const btnClass = compact
    ? 'btn-outline btn-sm mensal-inadimplencia-btn'
    : 'btn-outline mensal-inadimplencia-btn';

  return (
    <>
      <div className="mensal-inadimplencia-row__actions cobranca-row-actions">
        {wa ? (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className={btnClass}
          >
            <MessageCircle size={14} />
            {compact ? 'WhatsApp' : 'Abrir WhatsApp'}
          </a>
        ) : (
          <span className="text-small text-muted" title="Cadastre telefone no aluno">
            Sem telefone
          </span>
        )}
        <button
          type="button"
          className={btnClass}
          disabled={busy}
          onClick={() => {
            setNegotiateOpen(true);
            setNegotiateNote('');
          }}
        >
          <Handshake size={14} />
          Negociar
        </button>
        <button
          type="button"
          className={btnClass}
          disabled={busy}
          onClick={() => setSnoozeConfirmOpen(true)}
        >
          <Clock size={14} />
          Adiar régua
        </button>
      </div>

      <ConfirmDialog
        open={snoozeConfirmOpen}
        title={`Adiar régua · ${leadName}`}
        description={`O cron não criará novas tarefas de cobrança para este aluno até ${endOfMonthLabel(currentMonth)}.`}
        confirmLabel="Adiar régua"
        confirmVariant="primary"
        loading={busy}
        onClose={() => {
          if (!busy) setSnoozeConfirmOpen(false);
        }}
        onConfirm={() => void handleSnooze()}
      />

      <ModalShell
        open={negotiateOpen}
        title={`Negociar · ${leadName}`}
        onClose={closeNegotiateModal}
        closeOnOverlay={!savingNegotiate}
        closeOnEsc={!savingNegotiate}
        maxWidth={480}
        className="navi-modal-overlay--form mensal-negotiate-overlay"
        dialogClassName="mensal-negotiate-modal"
        footer={
          <div className="mensal-negotiate-modal__actions" style={{ width: '100%' }}>
            <button
              type="button"
              className="btn-outline"
              onClick={closeNegotiateModal}
              disabled={savingNegotiate}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => void submitNegotiate()}
              disabled={savingNegotiate}
            >
              {savingNegotiate ? 'Salvando…' : 'Salvar e criar tarefa'}
            </button>
          </div>
        }
      >
        <label className="mensal-modal-field-label" htmlFor="cobranca-negotiate-note">
          Nota da negociação (opcional)
        </label>
        <textarea
          id="cobranca-negotiate-note"
          className="mensal-modal-textarea"
          rows={4}
          value={negotiateNote}
          onChange={(e) => setNegotiateNote(e.target.value)}
          placeholder="Ex.: combinado parcelamento em 2x até dia 15"
          disabled={savingNegotiate}
        />
        {!compact && amount > 0 ? (
          <p className="text-small text-muted" style={{ marginTop: 8 }}>
            Total em aberto: {formatBRL(amount)}
          </p>
        ) : null}
      </ModalShell>
    </>
  );
}
