import React from 'react';
import { Link } from 'react-router-dom';

function waHref(phone) {
  return phone ? `https://wa.me/${String(phone).replace(/\D/g, '')}` : null;
}

function RelRow({ student, emoji, label }) {
  const wa = waHref(student.phone);
  return (
    <div className="consolidacao-block__row">
      <Link to={`/student/${student.id}`} className="consolidacao-block__row-name">
        {student.name || '—'}
      </Link>
      <span className="consolidacao-block__row-meta">
        {label} {emoji}
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
 * Bloco de relacionamento: aniversários do dia + jubileus de 1 ano de matrícula.
 * @param {{
 *   todayBirthdays: object[],
 *   oneYearAnniversaries: object[],
 * }} props
 */
export default function ConsolidacaoRelacionamentoBlock({ todayBirthdays, oneYearAnniversaries }) {
  const hasBirthdays = todayBirthdays.length > 0;
  const hasAnniversaries = oneYearAnniversaries.length > 0;
  const hasData = hasBirthdays || hasAnniversaries;

  return (
    <div className="consolidacao-block">
      <div className="consolidacao-block__header">
        <span className="consolidacao-block__title">
          🎂 Relacionamento
        </span>
      </div>

      {!hasData && (
        <p className="consolidacao-block__empty">Nenhum evento de relacionamento hoje</p>
      )}

      {hasBirthdays && (
        <>
          <p className="consolidacao-block__sub-label">Aniversariantes hoje</p>
          {todayBirthdays.map((s) => (
            <RelRow
              key={s.id || s.$id}
              student={s}
              emoji="🎂"
              label="Aniversário hoje"
            />
          ))}
        </>
      )}

      {hasAnniversaries && (
        <>
          <p className={`consolidacao-block__sub-label${hasBirthdays ? ' consolidacao-block__sub-label--gap' : ''}`}>
            1 ano de matrícula
          </p>
          {oneYearAnniversaries.map((s) => (
            <RelRow
              key={s.id || s.$id}
              student={s}
              emoji="🏆"
              label="1 ano de matrícula em breve"
            />
          ))}
        </>
      )}
    </div>
  );
}
