import React, { useMemo, useState } from 'react';
import { MessageCircle, Handshake, Clock } from 'lucide-react';
import { useTaskStore } from '../../store/useTaskStore.js';
import { useUiStore } from '../../store/useUiStore.js';
import { useLeadStore } from '../../store/useLeadStore.js';
import { apiSnoozeCollectionRegua } from '../../lib/studentPaymentsApi.js';
import { buildCollectionTaskTitle, buildCollectionTaskDescription } from '../../lib/collectionRules.js';
import { formatBRL } from '../../lib/moneyBr.js';

function waMeUrl(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  const n = digits.startsWith('55') ? digits : `55${digits}`;
  return `https://wa.me/${n}`;
}

export default function CollectionInadimplenciaPanel({
  students,
  studentOverdueMeta,
  paymentMap,
  collectionRules,
  currentMonth,
  financeConfig,
}) {
  const createTask = useTaskStore((s) => s.createTask);
  const addToast = useUiStore((s) => s.addToast);
  const [busyId, setBusyId] = useState(null);

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
      .slice(0, 30);
  }, [students, studentOverdueMeta, paymentMap]);

  if (!rows.length) return null;

  const handleNegotiate = async (row) => {
    const { student, rule } = row;
    const note = window.prompt('Nota da negociação (opcional):', '');
    if (note === null) return;
    setBusyId(student.id);
    try {
      const leadName = String(student.name || '').trim() || 'Aluno';
      const title = buildCollectionTaskTitle(rule || { label: 'Negociação', day: row.meta.daysOverdue }, leadName);
      const description = `${buildCollectionTaskDescription(
        rule || { day: row.meta.daysOverdue, label: 'Negociação', defaultMessage: '' },
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
    } catch (e) {
      addToast({ type: 'error', message: e?.message || 'Falha ao criar tarefa' });
    } finally {
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
      addToast({ type: 'error', message: e?.message || 'Falha ao adiar régua' });
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
          const wa = waMeUrl(row.student.phone);
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
                  onClick={() => void handleNegotiate(row)}
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
    </section>
  );
}
