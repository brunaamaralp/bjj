import React, { useState } from 'react';
import { syncControlIdStudent } from '../../lib/controlidApi';
import { useUiStore } from '../../store/useUiStore';

function badgeMeta(student) {
  const err = String(student.controlid_sync_error || '').trim();
  const synced = student.controlid_synced === true;
  const photo = String(student.photo_url || '').trim();

  if (err) {
    return { label: 'Catraca: erro', tone: 'danger', title: err };
  }
  if (synced) {
    return { label: 'Catraca: OK', tone: 'success', title: 'Sincronizado com a catraca' };
  }
  if (photo) {
    return { label: 'Catraca: pendente', tone: 'warning', title: 'Clique para sincronizar' };
  }
  return { label: 'Sem foto', tone: 'muted', title: 'Envie foto no perfil para sincronizar' };
}

const TONE_STYLES = {
  success: { bg: 'var(--success-light)', color: 'var(--success)' },
  warning: { bg: 'var(--warning-light)', color: 'var(--warning)' },
  danger: { bg: 'var(--danger-light)', color: 'var(--danger)' },
  muted: { bg: '#f1f5f9', color: '#64748b' },
};

export default function ControlIdSyncBadge({ academyId, student }) {
  const addToast = useUiStore((s) => s.addToast);
  const [busy, setBusy] = useState(false);
  const meta = badgeMeta(student);
  const style = TONE_STYLES[meta.tone] || TONE_STYLES.muted;
  const canSync = meta.tone === 'warning' || meta.tone === 'danger';

  const onClick = async (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (!canSync || busy || !academyId) return;
    setBusy(true);
    try {
      const data = await syncControlIdStudent(academyId, {
        leadId: student.id,
        photoUrl: student.photo_url,
      });
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
      disabled={!canSync || busy}
      onClick={canSync ? (ev) => void onClick(ev) : undefined}
      style={{
        marginTop: 6,
        fontSize: 11,
        fontWeight: 700,
        padding: '2px 8px',
        borderRadius: 999,
        border: 'none',
        background: style.bg,
        color: style.color,
        cursor: canSync ? 'pointer' : 'default',
        opacity: busy ? 0.7 : 1,
      }}
    >
      {busy ? 'Sincronizando…' : meta.label}
    </button>
  );
}
