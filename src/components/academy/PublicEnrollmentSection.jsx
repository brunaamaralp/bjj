import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Link2, RefreshCw } from 'lucide-react';
import { databases, DB_ID, ACADEMIES_COL, createSessionJwt } from '../../lib/appwrite';
import { useUiStore } from '../../store/useUiStore';
import { friendlyError } from '../../lib/errorMessages';
import {
  readPublicEnrollment,
  mergePublicEnrollmentIntoSettings,
  buildPublicEnrollmentUrl,
} from '../../lib/publicEnrollmentSettings';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';

async function postEnrollmentConfig(academyId, body) {
  const token = String((await createSessionJwt()) || '').trim();
  if (!token) {
    const err = new Error('Sessão expirada. Faça login novamente.');
    err.code = 'session_required';
    throw err;
  }
  const res = await fetch('/api/leads?route=public-enrollment-config', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-academy-id': String(academyId || ''),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.erro || data?.message || 'Falha ao atualizar link');
    err.code = data?.erro;
    throw err;
  }
  return data;
}

export default function PublicEnrollmentSection({ academyId, academy, setAcademy, canEdit, embedded = false }) {
  const addToast = useUiStore((s) => s.addToast);
  const cfg = readPublicEnrollment(academy?.settings);
  const [enabled, setEnabled] = useState(cfg.enabled);
  const [shareToken, setShareToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [regenerateConfirmOpen, setRegenerateConfirmOpen] = useState(false);

  useEffect(() => {
    setEnabled(cfg.enabled);
  }, [cfg.enabled, academyId]);

  const shareUrl = shareToken ? buildPublicEnrollmentUrl(shareToken) : '';

  const syncFromServer = useCallback(
    async (nextEnabled, regenerate = false) => {
      if (!academyId || !canEdit) return;
      setBusy(true);
      try {
        const data = await postEnrollmentConfig(academyId, {
          enabled: nextEnabled,
          regenerate,
        });
        const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        const merged = mergePublicEnrollmentIntoSettings(doc.settings, {
          enabled: data.enabled === true,
          salt: readPublicEnrollment(doc.settings).salt,
        });
        setAcademy((a) => ({ ...a, settings: JSON.stringify(merged) }));
        setEnabled(data.enabled === true);
        setShareToken(String(data.token || '').trim());
        addToast({
          type: 'success',
          message: data.enabled ? 'Link de cadastro ativado.' : 'Link de cadastro desativado.',
        });
      } catch (e) {
        addToast({ type: 'error', message: friendlyError(e, 'save') });
      } finally {
        setBusy(false);
      }
    },
    [academyId, canEdit, setAcademy, addToast]
  );

  const handleToggle = () => {
    const next = !enabled;
    void syncFromServer(next, !cfg.salt && next);
  };

  const handleRegenerate = () => {
    setRegenerateConfirmOpen(true);
  };

  const handleCopy = async () => {
    if (!shareUrl) {
      addToast({ type: 'warning', message: 'Ative o link antes de copiar.' });
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      addToast({ type: 'success', message: 'Link copiado.' });
    } catch {
      addToast({ type: 'error', message: 'Não foi possível copiar. Selecione o link manualmente.' });
    }
  };

  const handleLoadLink = () => {
    if (!enabled) {
      addToast({ type: 'info', message: 'Ative o link para gerar a URL.' });
      return;
    }
    void syncFromServer(true, false);
  };

  return (
    <div className="card" style={{ marginTop: embedded ? 0 : 24, padding: embedded ? 16 : undefined }}>
      {!embedded ? (
      <div className="flex justify-between items-center flex-wrap gap-2" style={{ marginBottom: 8 }}>
        <h4 className="navi-section-heading" style={{ margin: 0, fontSize: 15 }}>
          Link de matrícula para alunos
        </h4>
        {enabled ? (
          <span className="funil-unsaved-pill" style={{ background: 'rgba(34, 197, 94, 0.12)', color: 'var(--success)' }}>
            Ativo
          </span>
        ) : (
          <span className="funil-unsaved-pill">Inativo</span>
        )}
      </div>
      ) : (
        <div className="flex justify-end" style={{ marginBottom: 8 }}>
          {enabled ? (
            <span className="funil-unsaved-pill" style={{ background: 'rgba(34, 197, 94, 0.12)', color: 'var(--success)' }}>
              Ativo
            </span>
          ) : (
            <span className="funil-unsaved-pill">Inativo</span>
          )}
        </div>
      )}
      <p className="text-small text-muted" style={{ lineHeight: 1.45, marginBottom: 14 }}>
        Compartilhe o link para o aluno (ou responsável) preencher a matrícula. Se já existir lead com o mesmo
        telefone, ele é convertido em aluno; caso contrário, um novo aluno ativo é criado na lista de alunos.
      </p>

      {canEdit ? (
        <>
          <label className="flex items-center gap-2" style={{ fontSize: 14, marginBottom: 12, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={enabled}
              disabled={busy}
              onChange={handleToggle}
            />
            <span>Permitir matrícula pelo link público</span>
          </label>

          <div className="flex gap-2 flex-wrap" style={{ marginBottom: 12 }}>
            <button type="button" className="btn-outline" disabled={busy || !enabled} onClick={handleLoadLink}>
              <Link2 size={16} aria-hidden />
              {shareUrl ? 'Atualizar link' : 'Gerar link'}
            </button>
            <button type="button" className="btn-outline" disabled={busy || !shareUrl} onClick={handleCopy}>
              <Copy size={16} aria-hidden />
              Copiar link
            </button>
            <button type="button" className="btn-outline" disabled={busy || !enabled} onClick={handleRegenerate}>
              <RefreshCw size={16} aria-hidden />
              Novo link
            </button>
          </div>

          {shareUrl ? (
            <div
              className="form-input"
              style={{
                fontSize: 13,
                wordBreak: 'break-all',
                padding: '10px 12px',
                background: 'var(--bg-subtle)',
              }}
            >
              {shareUrl}
            </div>
          ) : (
            <p className="text-small text-muted" style={{ margin: 0 }}>
              Ative e clique em &quot;Gerar link&quot; para obter a URL de compartilhamento.
            </p>
          )}
        </>
      ) : (
        <p className="text-small text-muted">Somente administradores podem configurar o link.</p>
      )}
      <ConfirmDialog
        open={regenerateConfirmOpen}
        title="Gerar novo link?"
        description="Gerar um novo link invalida o anterior. Continuar?"
        confirmLabel="Gerar novo link"
        onConfirm={() => {
          setRegenerateConfirmOpen(false);
          void syncFromServer(true, true);
        }}
        onClose={() => setRegenerateConfirmOpen(false)}
      />
    </div>
  );
}
