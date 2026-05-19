import React, { useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import { friendlyError } from '../../lib/errorMessages';
import { uploadStudentPhoto, saveStudentPhotoUrl, isStudentPhotoUploadConfigured } from '../../lib/studentPhotoUpload';
import { syncControlIdStudent } from '../../lib/controlidApi';
import { createSessionJwt } from '../../lib/appwrite';

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

export default function StudentControlIdPhoto({
  academyId,
  leadId,
  photoUrl,
  controlidSynced,
  onPhotoSaved,
}) {
  const addToast = useUiStore((s) => s.addToast);
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState([]);

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

      let url = photoUrl;
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
    } catch (err) {
      addToast({ type: 'error', message: friendlyError(err, 'save') });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="card" style={{ padding: 16, marginTop: 12, border: '1px solid var(--border-light)' }}>
      <h4 className="navi-section-heading" style={{ marginBottom: 8 }}>Foto para catraca</h4>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: 12,
            background: 'var(--surface-hover)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {photoUrl ? (
            <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <Camera size={32} style={{ color: 'var(--text-muted)' }} aria-hidden />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/jpg" hidden onChange={(ev) => void onFile(ev)} />
          <button
            type="button"
            className="btn-secondary"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? 'Enviando…' : '📷 Enviar foto'}
          </button>
          <ul className="text-small text-muted" style={{ marginTop: 10, paddingLeft: 18, lineHeight: 1.5 }}>
            <li>Rosto centralizado</li>
            <li>Boa iluminação</li>
            <li>Sem óculos escuros</li>
          </ul>
          {feedback.length > 0 && (
            <ul style={{ marginTop: 10, fontSize: 13, listStyle: 'none', padding: 0 }}>
              {feedback.map((line, i) => (
                <li key={i} style={{ color: line.ok ? 'var(--success)' : 'var(--warning)' }}>
                  {line.ok ? '✓' : '⚠'} {line.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
