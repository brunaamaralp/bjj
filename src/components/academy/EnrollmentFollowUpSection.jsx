import React, { useEffect, useState } from 'react';
import { databases, DB_ID, ACADEMIES_COL } from '../../lib/appwrite';
import { useUiStore } from '../../store/useUiStore';
import { friendlyError } from '../../lib/errorMessages';
import {
  DEFAULT_ENROLLMENT_FOLLOW_UP,
  mergeEnrollmentFollowUpIntoSettings,
  readEnrollmentFollowUpTask,
} from '../../lib/enrollmentSettings';
import { parseAcademySettings } from '../../lib/stockSettings';

export default function EnrollmentFollowUpSection({ academyId }) {
  const addToast = useUiStore((s) => s.addToast);
  const [enabled, setEnabled] = useState(false);
  const [title, setTitle] = useState(DEFAULT_ENROLLMENT_FOLLOW_UP.title);
  const [days, setDays] = useState(String(DEFAULT_ENROLLMENT_FOLLOW_UP.days));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!academyId) return;
    let cancelled = false;
    (async () => {
      try {
        const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        if (cancelled) return;
        const followUp = readEnrollmentFollowUpTask(doc.settings);
        if (followUp) {
          setEnabled(true);
          setTitle(followUp.title);
          setDays(String(followUp.days));
        } else {
          setEnabled(false);
          setTitle(DEFAULT_ENROLLMENT_FOLLOW_UP.title);
          setDays(String(DEFAULT_ENROLLMENT_FOLLOW_UP.days));
        }
      } catch (e) {
        console.error('[EnrollmentFollowUp]', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [academyId]);

  const save = async () => {
    if (!academyId) return;
    setSaving(true);
    try {
      const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
      const base = parseAcademySettings(doc.settings);
      const merged = enabled
        ? mergeEnrollmentFollowUpIntoSettings(base, {
            title: String(title || '').trim(),
            days: Number(days),
          })
        : mergeEnrollmentFollowUpIntoSettings(base, null);
      await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
        settings: JSON.stringify(merged),
      });
      addToast({ type: 'success', message: 'Acompanhamento pós-matrícula salvo.' });
    } catch (e) {
      console.error('[EnrollmentFollowUp] save:', e);
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="empresa-section animate-in" style={{ marginTop: 16 }}>
      <div className="card" style={{ padding: 16, border: '1px solid var(--border-light)' }}>
        <h4 className="navi-section-heading" style={{ marginBottom: 6 }}>
          Acompanhamento pós-matrícula
        </h4>
        <p className="text-small text-muted" style={{ marginBottom: 12, lineHeight: 1.45 }}>
          Ao matricular um lead, o Nave pode criar automaticamente uma tarefa vinculada ao aluno. Deixe desativado
          se não usar este fluxo.
        </p>

        <label className="flex items-center gap-2" style={{ marginBottom: 12, fontSize: 14 }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Criar tarefa automaticamente após a matrícula
        </label>

        {enabled && (
          <div className="flex-col gap-2" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="info-mini-label">Título da tarefa</label>
              <input
                className="form-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: Check-in de acompanhamento"
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="info-mini-label">Prazo (dias após a matrícula)</label>
              <input
                type="number"
                min={0}
                className="form-input"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                style={{ maxWidth: 120 }}
              />
            </div>
          </div>
        )}

        <div className="flex justify-end mt-3">
          <button type="button" className="btn-secondary" onClick={() => void save()} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </section>
  );
}
