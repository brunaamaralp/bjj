import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { fetchAttendanceRetention } from '../../lib/attendanceRetentionApi.js';
import { friendlyError } from '../../lib/errorMessages.js';

const MAX_ROWS = 6;

function daysLabel(days) {
  if (days == null) return '—';
  const n = Number(days);
  if (!Number.isFinite(n)) return '—';
  return `${n} dia${n !== 1 ? 's' : ''} sem aparecer`;
}

function rowTone(daysWithoutCheckin) {
  const n = Number(daysWithoutCheckin);
  if (!Number.isFinite(n) || n < 8) return '';
  if (n <= 14) return 'warn';
  return 'danger';
}

/**
 * Bloco compacto de alunos em risco — usado no modo Consolidação.
 * @param {{ academyId: string }} props
 */
export default function ConsolidacaoAtRiskBlock({ academyId }) {
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!academyId) return;
    setLoading(true);
    setError('');
    try {
      const data = await fetchAttendanceRetention({ academyId });
      const atRisk = (data?.at_risk || []).slice(0, MAX_ROWS);
      setRows(atRisk);
    } catch (e) {
      setError(friendlyError(e, 'load'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [academyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const waHref = (phone) =>
    phone ? `https://wa.me/${String(phone).replace(/\D/g, '')}` : null;

  return (
    <div className="consolidacao-block">
      <div className="consolidacao-block__header">
        <span className="consolidacao-block__title">
          ⚠️ Alunos em risco de abandono
        </span>
        <Link to="/?tab=catraca&section=retencao" className="consolidacao-block__link">
          Ver relatório →
        </Link>
      </div>

      {loading && (
        <p className="consolidacao-block__empty">Carregando…</p>
      )}

      {!loading && error && (
        <p className="consolidacao-block__empty" style={{ color: 'var(--color-danger, #dc2626)' }}>
          {error}
        </p>
      )}

      {!loading && !error && rows?.length === 0 && (
        <p className="consolidacao-block__empty">Nenhum aluno em risco no momento 🎉</p>
      )}

      {!loading && !error && rows?.length > 0 && rows.map((row) => {
        const tone = rowTone(row.daysWithoutCheckin);
        const wa = waHref(row.phone);
        return (
          <div key={row.studentId || row.name} className="consolidacao-block__row">
            <Link
              to={`/student/${row.studentId}`}
              className="consolidacao-block__row-name"
            >
              {row.name || '—'}
            </Link>
            <span
              className={`consolidacao-block__row-meta${tone ? ` consolidacao-block__row-meta--${tone}` : ''}`}
            >
              {daysLabel(row.daysWithoutCheckin)}
            </span>
            {wa ? (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="consolidacao-block__wa-btn"
                aria-label={`WhatsApp para ${row.name}`}
              >
                WA
              </a>
            ) : (
              <span style={{ width: 42 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
