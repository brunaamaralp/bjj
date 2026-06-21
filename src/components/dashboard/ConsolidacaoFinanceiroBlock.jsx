import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { STUDENT_STATUS } from '../../lib/studentStatus.js';

const MAX_ROWS = 6;
const DUE_WINDOW_DAYS = 5; // "vence em N dias"
const OVERDUE_WINDOW_DAYS = 30;

/**
 * Retorna alunos com mensalidade vencida ou prestes a vencer.
 * Usa apenas o campo `dueDay` (1–31) do registro do aluno — sem nova API.
 */
function computeFinancialRows(students) {
  const today = new Date();
  const todayDay = today.getDate();
  const monthDays = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

  const overdue = [];
  const dueSoon = [];

  for (const s of students || []) {
    if (String(s?.studentStatus || '').trim() === STUDENT_STATUS.INACTIVE) continue;
    const dd = s.dueDay;
    if (!dd || dd < 1 || dd > 31) continue;

    const dayInMonth = Math.min(dd, monthDays);
    const delta = dayInMonth - todayDay; // negative = overdue this month

    if (delta >= 0 && delta <= DUE_WINDOW_DAYS) {
      dueSoon.push({ student: s, delta, dayInMonth });
    } else if (delta < 0 && delta >= -OVERDUE_WINDOW_DAYS) {
      overdue.push({ student: s, delta, dayInMonth });
    }
  }

  overdue.sort((a, b) => a.delta - b.delta); // more overdue first
  dueSoon.sort((a, b) => a.delta - b.delta); // sooner first

  return { overdue, dueSoon };
}

function waHref(phone) {
  return phone ? `https://wa.me/${String(phone).replace(/\D/g, '')}` : null;
}

function FinancialRow({ student, delta }) {
  const abs = Math.abs(delta);
  const isOverdue = delta < 0;
  const tone = isOverdue ? 'danger' : 'warn';
  const label = isOverdue
    ? `Atrasado ${abs} dia${abs !== 1 ? 's' : ''}`
    : delta === 0
    ? 'Vence hoje'
    : `Vence em ${delta} dia${delta !== 1 ? 's' : ''}`;

  const wa = waHref(student.phone);

  return (
    <div className="consolidacao-block__row">
      <Link to={`/student/${student.id}`} className="consolidacao-block__row-name">
        {student.name || '—'}
      </Link>
      <span className={`consolidacao-block__row-meta consolidacao-block__row-meta--${tone}`}>
        {label}
      </span>
      {wa ? (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className="consolidacao-block__wa-btn"
          aria-label={`WhatsApp para ${student.name}`}
        >
          WA
        </a>
      ) : (
        <span style={{ width: 42 }} />
      )}
    </div>
  );
}

/**
 * Bloco compacto de cobrança — mensalidades atrasadas e próximas de vencer.
 * @param {{ students: object[] }} props
 */
export default function ConsolidacaoFinanceiroBlock({ students }) {
  const { overdue, dueSoon } = useMemo(() => computeFinancialRows(students), [students]);

  const hasData = overdue.length > 0 || dueSoon.length > 0;
  const overdueSlice = overdue.slice(0, MAX_ROWS);
  const dueSoonSlice = dueSoon.slice(0, Math.max(0, MAX_ROWS - overdueSlice.length));

  return (
    <div className="consolidacao-block">
      <div className="consolidacao-block__header">
        <span className="consolidacao-block__title">
          💰 Financeiro da semana
        </span>
        <Link to="/financeiro" className="consolidacao-block__link">
          Ver mensalidades →
        </Link>
      </div>

      {!hasData && (
        <p className="consolidacao-block__empty">
          Nenhuma cobrança pendente nesta janela 🎉
        </p>
      )}

      {overdueSlice.length > 0 && (
        <>
          <p className="consolidacao-block__sub-label">Em atraso</p>
          {overdueSlice.map(({ student, delta }) => (
            <FinancialRow key={student.id} student={student} delta={delta} />
          ))}
        </>
      )}

      {dueSoonSlice.length > 0 && (
        <>
          <p className={`consolidacao-block__sub-label${overdueSlice.length > 0 ? ' consolidacao-block__sub-label--gap' : ''}`}>
            Vence em breve
          </p>
          {dueSoonSlice.map(({ student, delta }) => (
            <FinancialRow key={student.id} student={student} delta={delta} />
          ))}
        </>
      )}
    </div>
  );
}
