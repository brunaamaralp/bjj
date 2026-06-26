import React, { useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import { friendlyError } from '../../lib/errorMessages';
import { uploadStudentPhoto, saveStudentPhotoUrl, isStudentPhotoUploadConfigured } from '../../lib/studentPhotoUpload';
import { syncControlIdStudent } from '../../lib/controlidApi';
import { createSessionJwt } from '../../lib/appwrite';
import ModalShell from '../shared/ModalShell.jsx';

function formatQualityFeedback(result) {
  const lines = [];
  if (result?.success === true) lines.push({ ok: true, text: 'Rosto detectado' });
  if (result?.errors && Array.isArray(result.errors)) {
    for (const err of result.errors) {
      lines.push({ ok: false, text: String(err) });
    }
  }
  if (result?.quality) {
    for (const [key, val] of Object.entries(result.quality)) {
      const label = key.replace(/_/g, ' ');
      lines.push({
        ok: val === 'good' || val === true,
        text: `${label}: ${val}`,
      });
    }
  }
  if (!lines.length && result?.success === false) {
    lines.push({ ok: false, text: 'Foto não aceita pela catraca' });
  }
  return lines;
}

/**
 * Avatar do perfil do aluno — exibe foto/iniciais e abre modal de upload quando catraca ativa.
 */
export default function StudentControlIdPhoto({
  academyId,
  leadId,
  photoUrl,
  initials = '',
  controlidSynced,
  enabled = false,
  onPhotoSaved,
}) {
  const addToast = useUiStore((s) => s.addToast);
  const inputRef = useRef(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState([]);

  const trimmedPhoto = String(photoUrl || '').trim();
  const interactive = enabled && Boolean(academyId && leadId);

  const testImage = async (file) => {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    const base64 = btoa(binary);
    const jwt = await createSessionJwt();
    const localBase = String(import.meta.env.VITE_CONTROLID_API_BASE || '').trim().replace(/\/+$/, '');
    const url = localBase
      ? `${localBase}/controlid/test-image`
      : '/api/leads?route=controlid_test_image';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'x-academy-id': academyId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ lead_id: leadId, image_base64: base64 }),
    });
    const data = await res.json();
    if (!data.sucesso) throw new Error(data.erro || 'Teste de foto falhou');
    return data.result;
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !leadId || !academyId) return;
    if (!file.type.startsWith('image/')) {
      addToast({ type: 'error', message: 'Selecione uma imagem JPG ou PNG.' });
      return;
    }
    setUploading(true);
    setFeedback([]);
    try {
      const quality = await testImage(file);
      setFeedback(formatQualityFeedback(quality));

      let url = trimmedPhoto;
      if (isStudentPhotoUploadConfigured()) {
        url = await uploadStudentPhoto(leadId, file);
      } else {
        addToast({
          type: 'warning',
          message: 'Bucket de fotos não configurado — defina VITE_APPWRITE_STUDENT_PHOTOS_BUCKET_ID.',
        });
        setUploading(false);
        return;
      }

      await saveStudentPhotoUrl(leadId, url);
      onPhotoSaved?.(url);

      if (controlidSynced) {
        const sync = await syncControlIdStudent(academyId, { leadId, photoUrl: url });
        if (!sync.sucesso) {
          addToast({ type: 'warning', message: sync.erro || 'Foto salva; falha ao enviar à catraca.' });
        } else {
          addToast({ type: 'success', message: 'Foto enviada à catraca.' });
        }
      } else {
        addToast({ type: 'success', message: 'Foto salva no perfil.' });
      }
      setModalOpen(false);
    } catch (err) {
      addToast({ type: 'error', message: friendlyError(err, 'save') });
    } finally {
      setUploading(false);
    }
  };

  const avatarContent = trimmedPhoto ? (
    <img
      src={trimmedPhoto}
      alt=""
      className="student-profile-hd__avatar-img"
      loading="lazy"
      decoding="async"
    />
  ) : (
    <span className="student-profile-hd__initials">{initials}</span>
  );

  const avatarNode = interactive ? (
    <button
      type="button"
      className="student-profile-hd__avatar student-profile-hd__avatar--interactive"
      onClick={() => setModalOpen(true)}
      aria-label={trimmedPhoto ? 'Alterar foto para catraca' : 'Enviar foto para catraca'}
      title="Foto para catraca"
    >
      {avatarContent}
      <span className="student-profile-hd__avatar-overlay" aria-hidden>
        <Camera size={18} />
      </span>
    </button>
  ) : (
    <div className="student-profile-hd__avatar">{avatarContent}</div>
  );

  return (
    <>
      {avatarNode}

      {interactive ? (
        <ModalShell
          open={modalOpen}
          title="Foto para catraca"
          onClose={() => {
            if (!uploading) setModalOpen(false);
          }}
          maxWidth={440}
        >
          <div className="student-profile-photo-modal">
            <div className="student-profile-photo-modal__preview">
              {trimmedPhoto ? (
                <img src={trimmedPhoto} alt="" loading="lazy" decoding="async" />
              ) : (
                <Camera size={36} style={{ color: 'var(--text-muted)' }} aria-hidden />
              )}
            </div>
            <div className="student-profile-photo-modal__body">
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/jpg"
                hidden
                onChange={(ev) => void onFile(ev)}
              />
              <button
                type="button"
                className="btn-secondary"
                disabled={uploading}
                onClick={() => inputRef.current?.click()}
              >
                {uploading ? 'Enviando…' : trimmedPhoto ? 'Trocar foto' : 'Enviar foto'}
              </button>
              <ul className="text-small text-muted student-profile-photo-modal__tips">
                <li>Rosto centralizado</li>
                <li>Boa iluminação</li>
                <li>Sem óculos escuros</li>
              </ul>
              {feedback.length > 0 ? (
                <ul className="student-profile-photo-modal__feedback">
                  {feedback.map((line, i) => (
                    <li
                      key={i}
                      className={
                        line.ok
                          ? 'student-profile-photo-modal__feedback-ok'
                          : 'student-profile-photo-modal__feedback-warn'
                      }
                    >
                      {line.ok ? '✓' : '⚠'} {line.text}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </ModalShell>
      ) : null}
    </>
  );
}
