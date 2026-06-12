import React, { useEffect, useState } from 'react';
import { databases, DB_ID, ACADEMIES_COL } from '../../lib/appwrite';
import { getAcademyDocument, invalidateAcademyDocumentCache } from '../../lib/getAcademyDocument.js';
import { useUiStore } from '../../store/useUiStore';
import { friendlyError } from '../../lib/errorMessages';
import {
  REPORT_KPI_GOAL_KEYS,
  REPORT_KPI_GOAL_META,
  mergeReportsKpiGoalsIntoSettings,
  parseReportsKpiGoals,
} from '../../../lib/reportsKpiGoals.js';
import { parseAcademySettings } from '../../lib/stockSettings';
import StatusBanner from '../shared/StatusBanner.jsx';

function buildDraftFromSettings(settingsRaw) {
  const parsed = parseReportsKpiGoals(settingsRaw);
  const draft = {};
  for (const key of REPORT_KPI_GOAL_KEYS) {
    const meta = REPORT_KPI_GOAL_META[key];
    const row = parsed[key];
    draft[key] = row?.target != null ? String(row.target) : String(meta.defaultTarget);
  }
  return draft;
}

export default function ReportsKpiGoalsSection({ academyId, canEdit }) {
  const addToast = useUiStore((s) => s.addToast);
  const [draft, setDraft] = useState(() => buildDraftFromSettings(null));
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!academyId) return undefined;
    let alive = true;
    getAcademyDocument(academyId)
      .then((doc) => {
        if (!alive) return;
        setDraft(buildDraftFromSettings(doc?.settings));
      })
      .catch(() => {
        if (alive) setDraft(buildDraftFromSettings(null));
      })
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [academyId]);

  const onSave = async () => {
    if (!academyId || !canEdit) return;
    setSaving(true);
    try {
      const goals = {};
      for (const key of REPORT_KPI_GOAL_KEYS) {
        const target = Number(draft[key]);
        if (!Number.isFinite(target) || target < 0) {
          addToast({ type: 'error', message: `Meta inválida para ${REPORT_KPI_GOAL_META[key].label}.` });
          return;
        }
        goals[key] = { target, direction: REPORT_KPI_GOAL_META[key].direction };
      }
      const doc = await getAcademyDocument(academyId);
      const base = parseAcademySettings(doc.settings);
      const merged = mergeReportsKpiGoalsIntoSettings(base, goals);
      const settingsRaw = JSON.stringify(merged);
      await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, { settings: settingsRaw });
      invalidateAcademyDocumentCache(academyId);
      addToast({ type: 'success', message: 'Metas de relatórios salvas.' });
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return <div className="empresa-skeleton-block" style={{ height: 200 }} aria-busy="true" />;
  }

  return (
    <div className="reports-kpi-goals-form">
      <StatusBanner variant="info" className="mb-4">
        Defina metas para colorir os KPIs nos relatórios (verde, amarelo, vermelho). Apenas titulares podem
        editar.
      </StatusBanner>
      <div className="reports-kpi-goals-grid">
        {REPORT_KPI_GOAL_KEYS.map((key) => {
          const meta = REPORT_KPI_GOAL_META[key];
          const hint =
            meta.direction === 'lower'
              ? 'Quanto menor, melhor'
              : 'Quanto maior, melhor';
          return (
            <label key={key} className="reports-kpi-goals-field">
              <span className="reports-kpi-goals-field__label">{meta.label}</span>
              <span className="reports-kpi-goals-field__hint">{hint}</span>
              <div className="reports-kpi-goals-field__input-wrap">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  className="input"
                  value={draft[key]}
                  disabled={!canEdit || saving}
                  onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
                />
                <span className="reports-kpi-goals-field__unit">{meta.unit}</span>
              </div>
            </label>
          );
        })}
      </div>
      {canEdit ? (
        <button type="button" className="btn-primary mt-4" disabled={saving} onClick={() => void onSave()}>
          {saving ? 'Salvando…' : 'Salvar metas'}
        </button>
      ) : (
        <p className="text-small text-muted mt-4">Somente o titular pode alterar as metas.</p>
      )}
    </div>
  );
}
