import React, { useState } from 'react';
import { syncControlIdStudent } from '../../lib/controlidApi';
import { useUiStore } from '../../store/useUiStore';
import { resolveControlIdSyncBadgeMeta } from '../../lib/controlIdSyncBadgeMeta.js';

const TONE_STYLES = {
  success: { bg: 'var(--success-light)', color: 'var(--success)' },
  warning: { bg: 'var(--warning-light)', color: 'var(--warning)' },
  danger: { bg: 'var(--danger-light)', color: 'var(--danger)' },
  muted: { bg: '#f1f5f9', color: '#64748b' },
};

export default function ControlIdSyncBadge({ academyId, student, blockOverdueAccess = false, inline = false }) {
  const addToast = useUiStore((s) => s.addToast);
  const [busy, setBusy] = useState(false);
  const meta = resolveControlIdSyncBadgeMeta(student, blockOverdueAccess);
  const style = TONE_STYLES[meta.tone] || TONE_STYLES.muted;

  const onClick = async (e) => {
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
    <button
      type="button"
      title={meta.title}
      disabled={!meta.canSync || busy}
      onClick={meta.canSync ? (ev) => void onClick(ev) : undefined}
      style={{
        marginTop: inline ? 0 : 6,
        fontSize: 11,
        fontWeight: 700,
        padding: '2px 8px',
        borderRadius: 999,
        border: 'none',
        background: style.bg,
        color: style.color,
        cursor: meta.canSync ? 'pointer' : 'default',
        opacity: busy ? 0.7 : 1,
      }}
    >
      {busy ? 'Sincronizando…' : meta.label}
    </button>
  );
}

