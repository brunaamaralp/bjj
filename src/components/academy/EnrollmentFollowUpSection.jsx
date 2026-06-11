import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { databases, DB_ID, ACADEMIES_COL } from '../../lib/appwrite';
import { getAcademyDocument, invalidateAcademyDocumentCache } from '../../lib/getAcademyDocument.js';
import { useUiStore } from '../../store/useUiStore';
import { friendlyError } from '../../lib/errorMessages';
import { mergeEnrollmentFollowUpIntoSettings, readEnrollmentFollowUpTask } from '../../lib/enrollmentSettings';
import { parseAcademySettings } from '../../lib/stockSettings';
import StatusBanner from '../shared/StatusBanner.jsx';

/**
 * Aviso de migração quando ainda existe tarefa legada em academy.settings (fora dos templates).
 */
export default function EnrollmentFollowUpSection({
  academyId,
  academySettings,
  settingsLoading = false,
  onSettingsSaved,
}) {
  const addToast = useUiStore((s) => s.addToast);
  const usesSharedSettings = academySettings !== undefined;
  const [selfFollowUp, setSelfFollowUp] = useState(null);
  const [selfLoaded, setSelfLoaded] = useState(usesSharedSettings);
  const [saving, setSaving] = useState(false);

  const sharedFollowUp = useMemo(() => {
    if (!usesSharedSettings || settingsLoading) return null;
    return readEnrollmentFollowUpTask(academySettings);
  }, [usesSharedSettings, academySettings, settingsLoading]);

  const followUp = usesSharedSettings ? sharedFollowUp : selfFollowUp;
  const loaded = usesSharedSettings ? !settingsLoading : selfLoaded;

  useEffect(() => {
    if (!academyId || usesSharedSettings) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const doc = await getAcademyDocument(academyId);
        if (cancelled) return;
        setSelfFollowUp(readEnrollmentFollowUpTask(doc.settings));
      } catch (e) {
        console.error('[EnrollmentFollowUp]', e);
      } finally {
        if (!cancelled) setSelfLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [academyId, usesSharedSettings]);

  if (!loaded || !followUp) return null;

  const clearExtraTask = async () => {
    if (!academyId) return;
    setSaving(true);
    try {
      const doc = await getAcademyDocument(academyId);
      const base = parseAcademySettings(doc.settings);
      const merged = mergeEnrollmentFollowUpIntoSettings(base, null);
      const settingsRaw = JSON.stringify(merged);
      await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
        settings: settingsRaw,
      });
      invalidateAcademyDocumentCache(academyId);
      onSettingsSaved?.(settingsRaw);
      if (!usesSharedSettings) setSelfFollowUp(null);
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
