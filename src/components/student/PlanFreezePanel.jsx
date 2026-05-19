import React from 'react';
import { Lock } from 'lucide-react';
import {
  freezeDaysLeftInPeriod,
  formatFreezeDateBr,
  effectiveFreezeDaysUsed,
  FREEZE_MAX_DAYS_PER_YEAR,
} from '../../lib/planFreeze.js';

export default function PlanFreezePanel({
  student,
  freezeReason = '',
  freezeHistoryCount = 0,
  onEndEarly,
  busy = false,
}) {
  const endYmd = String(student?.freeze_end || '').slice(0, 10);
  const daysLeft = freezeDaysLeftInPeriod(student);
  const used = effectiveFreezeDaysUsed(student);

  return (
    <div
      style={{
        border: '1px solid var(--border-light)',
        borderRadius: 12,
        padding: '14px 16px',
        marginBottom: 12,
        background: 'linear-gradient(135deg, #f8f7fc 0%, #eef2f7 100%)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <Lock size={20} color="#64748b" style={{ flexShrink: 0, marginTop: 2 }} aria-hidden />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Matrícula trancada</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
            Retorno previsto: {formatFreezeDateBr(endYmd)}
            {freezeReason ? (
              <>
                <br />
                Motivo: {freezeReason}
              </>
            ) : null}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            Historico: {freezeHistoryCount} trancamento{freezeHistoryCount === 1 ? '' : 's'} · {used} dias utilizados de{' '}
            {FREEZE_MAX_DAYS_PER_YEAR}
            <br />
            Dias restantes: {daysLeft}
          </div>
        </div>
        <button
          type="button"
          className="btn-outline btn-sm"
          style={{ flexShrink: 0, marginTop: 2 }}
          onClick={onEndEarly}
          disabled={busy}
        >
          Encerrar trancamento agora
        </button>
      </div>
    </div>
  );
}
