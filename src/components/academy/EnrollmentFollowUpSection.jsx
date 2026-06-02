import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { databases, DB_ID, ACADEMIES_COL } from '../../lib/appwrite';
import { useUiStore } from '../../store/useUiStore';
import { friendlyError } from '../../lib/errorMessages';
import { mergeEnrollmentFollowUpIntoSettings, readEnrollmentFollowUpTask } from '../../lib/enrollmentSettings';
import { parseAcademySettings } from '../../lib/stockSettings';
import StatusBanner from '../shared/StatusBanner.jsx';

/**
 * Aviso de migração quando ainda existe tarefa legada em academy.settings (fora dos templates).
 */
export default function EnrollmentFollowUpSection({ academyId }) {
  const addToast = useUiStore((s) => s.addToast);
  const [followUp, setFollowUp] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!academyId) return;
    let cancelled = false;
    (async () => {
      try {
        const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        if (cancelled) return;
        setFollowUp(readEnrollmentFollowUpTask(doc.settings));
      } catch (e) {
        console.error('[EnrollmentFollowUp]', e);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [academyId]);

  if (!loaded || !followUp) return null;

  const clearExtraTask = async () => {
    if (!academyId) return;
    setSaving(true);
    try {
      const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
      const base = parseAcademySettings(doc.settings);
      const merged = mergeEnrollmentFollowUpIntoSettings(base, null);
      await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
        settings: JSON.stringify(merged),
      });
      setFollowUp(null);
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
        <StatusBanner variant="warning" className="enrollment-followup-extra-task-banner">
          <p style={{ margin: 0 }}>
            Há uma tarefa adicional legada configurada ({followUp.title}, {followUp.days} dia
            {followUp.days === 1 ? '' : 's'} após a matrícula). Migre para um template com gatilho{' '}
            <strong>Matrícula</strong> em{' '}
            <Link to="/automacoes?tab=processos" className="edit-link" style={{ fontWeight: 600 }}>
              Automações → Processos
            </Link>{' '}
            e remova a configuração antiga abaixo.
          </p>
          <button type="button" className="btn-outline" disabled={saving} onClick={() => void clearExtraTask()}>
            Remover tarefa adicional
          </button>
        </StatusBanner>
      </div>
    </section>
  );
}
