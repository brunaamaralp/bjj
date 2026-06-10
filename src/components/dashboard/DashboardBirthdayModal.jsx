import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Cake, Loader2, MessageCircle } from 'lucide-react';
import ModalShell from '../shared/ModalShell.jsx';

/**
 * Lista de aniversariantes do dia (2+) — turma e parabéns por WhatsApp.
 */
export default function DashboardBirthdayModal({
  open,
  onClose,
  students,
  sendingStudentId,
  canSendWa,
  onSendWhatsApp,
}) {
  const navigate = useNavigate();
  const list = students || [];

  return (
    <ModalShell
      open={open}
      title={
        list.length > 0 ? (
          <span className="dashboard-birthday-modal__title">
            <Cake size={18} strokeWidth={2} aria-hidden />
            Aniversariantes hoje ({list.length})
          </span>
        ) : (
          'Aniversariantes hoje'
        )
      }
      onClose={onClose}
      maxWidth={520}
      dialogClassName="dashboard-birthday-modal"
    >
      {list.length === 0 ? (
        <p className="dashboard-birthday-modal__empty" role="status">
          Nenhum aniversariante hoje.
        </p>
      ) : (
        <ul className="dashboard-birthday-modal__list">
          {list.map((student) => {
            const turma = String(student.turma || student.className || '').trim() || '—';
            const studentId = String(student.id || '').trim();
            const hasPhone = Boolean(String(student.phone || '').trim());
            const waBusy = sendingStudentId === studentId;
            const waEnabled = canSendWa && hasPhone && !waBusy;

            return (
              <li key={student.id} className="dashboard-birthday-modal__item">
                <button
                  type="button"
                  className="dashboard-birthday-modal__info"
                  onClick={() => {
                    onClose();
                    navigate(`/student/${student.id}`);
                  }}
                >
                  <span className="dashboard-birthday-modal__name">{student.name}</span>
                  <span className="dashboard-birthday-modal__meta">Turma · {turma}</span>
                </button>
                <button
                  type="button"
                  className="btn-secondary dashboard-birthday-modal__wa"
                  disabled={!waEnabled}
                  title={
                    !hasPhone
                      ? 'Sem telefone cadastrado'
                      : !canSendWa
                        ? 'WhatsApp não configurado'
                        : 'Mandar parabéns'
                  }
                  onClick={() => onSendWhatsApp(student)}
                >
                  {waBusy ? (
                    <Loader2 size={14} className="spin-refresh" aria-hidden />
                  ) : (
                    <MessageCircle size={14} aria-hidden />
                  )}
                  Parabéns
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </ModalShell>
  );
}
