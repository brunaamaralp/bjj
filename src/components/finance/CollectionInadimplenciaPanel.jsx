import React, { useMemo, useState } from 'react';
import { FINANCE_INADIMPLENCIA_LIST_LIMIT } from '../../lib/financeListLimits.js';
import { MessageCircle, Handshake, Clock } from 'lucide-react';
import ModalShell from '../shared/ModalShell.jsx';
import { useTaskStore } from '../../store/useTaskStore.js';
import { useUiStore } from '../../store/useUiStore.js';
import { useLeadStore } from '../../store/useLeadStore.js';
import { apiSnoozeCollectionRegua } from '../../lib/studentPaymentsApi.js';
import { buildCollectionTaskTitle, buildCollectionTaskDescription } from '../../lib/collectionRules.js';
import { formatBRL } from '../../lib/moneyBr.js';
import { friendlyError } from '../../lib/errorMessages.js';
import { buildWaMeUrl } from '../../lib/whatsappLinks.js';

export default function CollectionInadimplenciaPanel({
  students,
  studentOverdueMeta,
  paymentMap,
  currentMonth,
}) {
  const createTask = useTaskStore((s) => s.createTask);
  const addToast = useUiStore((s) => s.addToast);
  const [busyId, setBusyId] = useState(null);
  const [negotiateRow, setNegotiateRow] = useState(null);
  const [negotiateNote, setNegotiateNote] = useState('');
  const [savingNegotiate, setSavingNegotiate] = useState(false);

  const rows = useMemo(() => {
    return (students || [])
      .map((s) => {
        const meta = studentOverdueMeta[s.id];
        if (!meta) return null;
        const payment = paymentMap[s.id];
        const rule = meta.stage;
        return {
          student: s,
          meta,
          payment,
          rule,
          amount: meta.amount,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (b.meta.daysOverdue || 0) - (a.meta.daysOverdue || 0))
      .slice(0, FINANCE_INADIMPLENCIA_LIST_LIMIT);
  }, [students, studentOverdueMeta, paymentMap]);

  if (!rows.length) return null;

  const closeNegotiateModal = () => {
    if (savingNegotiate) return;
    setNegotiateRow(null);
    setNegotiateNote('');
  };

  const submitNegotiate = async () => {
    if (!negotiateRow || savingNegotiate) return;
    const { student, rule } = negotiateRow;
    const note = String(negotiateNote || '').trim();
    setSavingNegotiate(true);
    setBusyId(student.id);
    try {
      const leadName = String(student.name || '').trim() || 'Aluno';
      const title = buildCollectionTaskTitle(rule || { label: 'Negociação', day: negotiateRow.meta.daysOverdue }, leadName);
      const description = `${buildCollectionTaskDescription(
        rule || { day: negotiateRow.meta.daysOverdue, label: 'Negociação', defaultMessage: '' },
        leadName
      )}\n---\nNegociação manual${note ? `: ${note}` : ''}`;
      await createTask({
        title: title.replace('cobrança', 'negociação'),
        description,
        status: 'pending',
        due_date: new Date().toISOString().slice(0, 10),
        lead_id: student.id,
        lead_name: leadName,
      });
      addToast({ type: 'success', message: 'Tarefa de negociação criada.' });
      closeNegotiateModal();
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSavingNegotiate(false);
      setBusyId(null);
    }
  };

  const handleSnooze = async (studentId) => {
    setBusyId(studentId);
    try {
      const academyId = useLeadStore.getState().academyId;
      await apiSnoozeCollectionRegua(studentId, currentMonth, academyId);
      addToast({
        type: 'success',
        message: 'Régua adiada para este aluno até o fim do mês — o cron não criará novas tarefas.',
      });
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'action') });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="mensal-inadimplencia-panel card">
      <h2 className="navi-section-heading mensal-inadimplencia-panel__title">
        Inadimplência — ações rápidas
      </h2>
      <p className="text-small text-muted mensal-inadimplencia-panel__hint">
        WhatsApp abre conversa manual; negociação cria tarefa com nota; adiar pausa a régua automática neste mês.
      </p>
      <ul className="mensal-inadimplencia-list">
        {rows.map((row) => {
          const wa = buildWaMeUrl(row.student.phone);
          const busy = busyId === row.student.id;
          return (
            <li key={row.student.id} className="mensal-inadimplencia-row">
              <div className="mensal-inadimplencia-row__main">
                <strong>{row.student.name}</strong>
                <span className="text-small text-muted">
                  D+{row.meta.daysOverdue}
                  {row.rule?.label ? ` · ${row.rule.label}` : ''} · {formatBRL(row.amount)}
                </span>
              </div>
              <div className="mensal-inadimplencia-row__actions">
                {wa ? (
                  <a
                    href={wa}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-outline mensal-inadimplencia-btn"
                  >
                    <MessageCircle size={14} />
                    Abrir WhatsApp
                  </a>
                ) : (
                  <span className="text-small text-muted" title="Cadastre telefone no aluno">
                    Sem telefone
                  </span>
                )}
                <button
                  type="button"
                  className="btn-outline mensal-inadimplencia-btn"
                  disabled={busy}
                  onClick={() => {
                    setNegotiateRow(row);
                    setNegotiateNote('');
                  }}
                >
                  <Handshake size={14} />
                  Negociar
                </button>
                <button
                  type="button"
                  className="btn-outline mensal-inadimplencia-btn"
                  disabled={busy}
                  onClick={() => void handleSnooze(row.student.id)}
                >
                  <Clock size={14} />
                  Adiar régua
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <ModalShell
        open={Boolean(negotiateRow)}
        title={negotiateRow ? `Negociar · ${negotiateRow.student.name}` : ''}
        onClose={closeNegotiateModal}
        closeOnOverlay={!savingNegotiate}
        closeOnEsc={!savingNegotiate}
        maxWidth={480}
        className="navi-modal-overlay--form mensal-negotiate-overlay"
        dialogClassName="mensal-negotiate-modal"
        ariaLabelledBy="mensal-negotiate-title"
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
        <label className="mensal-modal-field-label" htmlFor="mensal-negotiate-note">
          Nota da negociação (opcional)
        </label>
        <textarea
          id="mensal-negotiate-note"
          className="mensal-modal-textarea"
          rows={4}
          value={negotiateNote}
          onChange={(e) => setNegotiateNote(e.target.value)}
          placeholder="Ex.: combinado parcelamento em 2x até dia 15"
          disabled={savingNegotiate}
        />
      </ModalShell>
    </section>
  );
}
