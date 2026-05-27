import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { databases, DB_ID, ACADEMIES_COL } from '../../lib/appwrite';
import { useUiStore } from '../../store/useUiStore';
import { friendlyError } from '../../lib/errorMessages';
import {
  DEFAULT_ENROLLMENT_FOLLOW_UP,
  mergeEnrollmentFollowUpIntoSettings,
  readEnrollmentFollowUpTask,
} from '../../lib/enrollmentSettings';
import { parseAcademySettings } from '../../lib/stockSettings';

/**
 * Orientação sobre pós-matrícula e tarefa adicional opcional (uma tarefa em academy.settings).
 * Oculta quando já existe template com gatilho Matrícula.
 */
export default function EnrollmentFollowUpSection({
  academyId,
  hasEnrollmentTemplate = false,
  templatesConfigurado = true,
}) {
  const addToast = useUiStore((s) => s.addToast);
  const [enabled, setEnabled] = useState(false);
  const [title, setTitle] = useState(DEFAULT_ENROLLMENT_FOLLOW_UP.title);
  const [days, setDays] = useState(String(DEFAULT_ENROLLMENT_FOLLOW_UP.days));
  const [saving, setSaving] = useState(false);
  const [hasExtraTask, setHasExtraTask] = useState(false);
  const [showExtraTask, setShowExtraTask] = useState(false);

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
          setHasExtraTask(true);
          setShowExtraTask(true);
        } else {
          setEnabled(false);
          setTitle(DEFAULT_ENROLLMENT_FOLLOW_UP.title);
          setDays(String(DEFAULT_ENROLLMENT_FOLLOW_UP.days));
          setHasExtraTask(false);
          setShowExtraTask(false);
        }
      } catch (e) {
        console.error('[EnrollmentFollowUp]', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [academyId]);

  if (hasEnrollmentTemplate) {
    return null;
  }

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
      setHasExtraTask(enabled);
      addToast({
        type: 'success',
        message: enabled ? 'Tarefa adicional salva.' : 'Tarefa adicional removida.',
      });
    } catch (e) {
      console.error('[EnrollmentFollowUp] save:', e);
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSaving(false);
    }
  };

  const clearExtraTask = async () => {
    setEnabled(false);
    setSaving(true);
    try {
      const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
      const base = parseAcademySettings(doc.settings);
      const merged = mergeEnrollmentFollowUpIntoSettings(base, null);
      await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
        settings: JSON.stringify(merged),
      });
      setHasExtraTask(false);
      setShowExtraTask(false);
      addToast({ type: 'success', message: 'Tarefa adicional removida.' });
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="empresa-section animate-in" style={{ marginTop: 16 }}>
      <div className="card" style={{ padding: 16, border: '1px solid var(--border-light)' }}>
        <h3 className="navi-section-heading" style={{ marginBottom: 6 }}>
          Processo ao matricular
        </h3>
        <p className="text-small text-muted" style={{ marginBottom: 12, lineHeight: 1.45 }}>
          Ao concluir a matrícula, o sistema aplica o template com gatilho <strong>Matrícula</strong> (várias
          tarefas com prazos em dias). Edite os passos em{' '}
          <Link to="/automacoes?tab=processos" className="edit-link" style={{ fontWeight: 600 }}>
            Automações → Processos
          </Link>
          — por exemplo: boas-vindas, grupo de WhatsApp, check-in em 30 dias.
        </p>
        {templatesConfigurado ? (
          <p className="text-small text-muted" style={{ marginBottom: 0, lineHeight: 1.45 }}>
            Se a academia ainda não tiver o processo de onboarding, use <strong>Restaurar padrões</strong> em{' '}
            <Link to="/automacoes?tab=processos" className="edit-link" style={{ fontWeight: 600 }}>
              Automações → Processos
            </Link>
            .
          </p>
        ) : null}

        {hasExtraTask ? (
          <div
            className="section-error"
            role="alert"
            style={{
              marginTop: 14,
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 8,
            }}
          >
            <span>
              Há uma tarefa adicional configurada fora dos templates. Recomendamos usar um template com gatilho{' '}
              <strong>Matrícula</strong> em{' '}
              <Link to="/automacoes?tab=processos" className="edit-link" style={{ fontWeight: 600 }}>
                Automações → Processos
              </Link>{' '}
              e remover a tarefa adicional abaixo.
            </span>
            <button type="button" className="btn-outline" disabled={saving} onClick={() => void clearExtraTask()}>
              Remover tarefa adicional
            </button>
          </div>
        ) : null}

        <button
          type="button"
          className="btn-ghost text-small"
          style={{ marginTop: 12, padding: 0, minHeight: 0 }}
          onClick={() => setShowExtraTask((v) => !v)}
        >
          {showExtraTask ? 'Ocultar tarefa adicional ao matricular' : 'Tarefa adicional ao matricular…'}
        </button>

        {showExtraTask ? (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-light)' }}>
            <p className="text-small text-muted" style={{ marginBottom: 12, lineHeight: 1.45 }}>
              Cria <strong>uma</strong> tarefa fixa após a matrícula (ex.: check-in em 7 dias), além do processo
              com template Matrícula. Prefira processos em Automações → Processos quando precisar de vários passos.
            </p>

            <label className="flex items-center gap-2" style={{ marginBottom: 12, fontSize: 14 }}>
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              Criar tarefa adicional após a matrícula
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
                {saving ? 'Salvando…' : 'Salvar tarefa adicional'}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
