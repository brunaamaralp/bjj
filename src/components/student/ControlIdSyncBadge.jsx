import React, { useState } from 'react';
import { syncControlIdStudent } from '../../lib/controlidApi';
import { useUiStore } from '../../store/useUiStore';
import { resolveControlIdSyncBadgeMeta } from '../../lib/controlIdSyncBadgeMeta.js';

const TONE_STYLES = {
  success: { bg: 'var(--success-light)', color: 'var(--success)' },
  warning: { bg: 'var(--warning-light)', color: 'var(--warning)' },
  danger: { bg: 'var(--danger-light)', color: 'var(--danger)' },
  muted: { bg: 'var(--surface-hover)', color: 'var(--text-muted)' },
};

export default function ControlIdSyncBadge({ academyId, student, blockOverdueAccess = false }) {
  const addToast = useUiStore((s) => s.addToast);
  const [busy, setBusy] = useState(false);
  const meta = resolveControlIdSyncBadgeMeta(student, blockOverdueAccess);
  const style = TONE_STYLES[meta.tone] || TONE_STYLES.muted;

  const onSync = async (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (!meta.canSync || busy || !academyId) return;
    setBusy(true);
    try {
      const data = await syncControlIdStudent(academyId, {
        leadId: student.id,
        photoUrl: student.photo_url,
      });
      if (data.skipped_reason === 'overdue') {
        addToast({
          type: 'warning',
          message: data.erro || 'Aluno inadimplente — sincronização bloqueada na catraca.',
        });
        return;
      }
      if (!data.sucesso) throw new Error(data.erro || 'Falha na sincronização');
      addToast({ type: 'success', message: 'Aluno sincronizado com a catraca.' });
    } catch (err) {
      addToast({ type: 'error', message: err?.message || 'Erro ao sincronizar' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        marginTop: 6,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <span
        title={meta.title}
        style={{
          fontSize: 11,
          fontWeight: 700,
          padding: '2px 8px',
          borderRadius: 999,
          background: style.bg,
          color: style.color,
        }}
      >
        {meta.label}
      </span>
      {meta.canSync ? (
        <button
          type="button"
          className="btn-outline"
          title={meta.title}
          aria-label={busy ? 'Sincronizando…' : meta.actionAriaLabel || 'Sincronizar aluno na catraca'}
          disabled={busy}
          onClick={(ev) => void onSync(ev)}
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: '2px 8px',
            minHeight: 0,
            lineHeight: 1.3,
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? 'Sincronizando…' : meta.actionLabel || 'Sincronizar'}
        </button>
      ) : null}
    </div>
  );
}
