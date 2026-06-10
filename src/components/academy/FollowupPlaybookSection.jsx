import React, { useCallback, useEffect, useState } from 'react';
import { databases, DB_ID, ACADEMIES_COL } from '../../lib/appwrite';
import { useUiStore } from '../../store/useUiStore';
import { friendlyError } from '../../lib/errorMessages';
import { parseAcademySettings } from '../../lib/stockSettings';
import {
  DEFAULT_FOLLOWUP_PLAYBOOK,
  mergeFollowupPlaybookIntoSettings,
  readFollowupPlaybook,
} from '../../lib/followupPlaybookDefaults';
import { describePlaybookStep } from '../../lib/followupState.js';
import { WHATSAPP_TEMPLATE_LABELS } from '../../../lib/whatsappTemplateDefaults.js';

export default function FollowupPlaybookSection({ academyId }) {
  const addToast = useUiStore((s) => s.addToast);
  const [playbook, setPlaybook] = useState(DEFAULT_FOLLOWUP_PLAYBOOK);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!academyId) return;
    setLoading(true);
    try {
      const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
      setPlaybook(readFollowupPlaybook(doc.settings));
    } catch (e) {
      console.error('[FollowupPlaybook]', e);
      setPlaybook({ ...DEFAULT_FOLLOWUP_PLAYBOOK, attended: [...DEFAULT_FOLLOWUP_PLAYBOOK.attended], missed: [...DEFAULT_FOLLOWUP_PLAYBOOK.missed] });
    } finally {
      setLoading(false);
    }
  }, [academyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (next) => {
    if (!academyId) return;
    setSaving(true);
    try {
      const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
      const merged = mergeFollowupPlaybookIntoSettings(parseAcademySettings(doc.settings), next);
      await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
        settings: JSON.stringify(merged),
      });
      setPlaybook(next);
      addToast({ type: 'success', message: 'Playbook de retorno salvo.' });
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSaving(false);
    }
  };

  if (!academyId) return null;

  const renderTrack = (title, steps) => (
    <div className="followup-playbook-track">
      <h4 className="followup-playbook-track__title">{title}</h4>
      <ol className="followup-playbook-track__list">
        {(steps || []).map((step, i) => (
          <li key={`${title}-${step.offset_days}-${i}`}>
            <span className="followup-playbook-track__day">D+{step.offset_days}</span>
            <span>{describePlaybookStep(step)}</span>
            {step.action_type === 'whatsapp_template' && step.template_key ? (
              <span className="text-muted text-small">
                {' '}
                ({WHATSAPP_TEMPLATE_LABELS[step.template_key] || step.template_key})
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );

  return (
    <section className="empresa-section animate-in followup-playbook-section" style={{ marginTop: 16 }}>
      <div className="card" style={{ padding: 16 }}>
        <div className="followup-playbook-section__head">
          <div>
            <h3 className="navi-section-heading" style={{ margin: 0 }}>
              Playbook de retorno pós-aula
            </h3>
            <p className="text-small text-muted" style={{ marginTop: 6 }}>
              Padroniza as ações sugeridas no Dashboard para quem compareceu ou faltou à experimental.
            </p>
          </div>
          <label className="followup-playbook-section__toggle text-small">
            <input
              type="checkbox"
              checked={playbook.enabled !== false}
              disabled={loading || saving}
              onChange={(e) => void save({ ...playbook, enabled: e.target.checked })}
            />
            Playbook ativo
          </label>
        </div>

        {loading ? (
          <p className="text-small text-muted">Carregando…</p>
        ) : (
          <>
            {renderTrack('Compareceu', playbook.attended)}
            {renderTrack('Faltou', playbook.missed)}
            <div className="followup-playbook-section__actions">
              <button
                type="button"
                className="btn-outline"
                disabled={saving}
                onClick={() => void save({ ...DEFAULT_FOLLOWUP_PLAYBOOK, attended: [...DEFAULT_FOLLOWUP_PLAYBOOK.attended], missed: [...DEFAULT_FOLLOWUP_PLAYBOOK.missed] })}
              >
                Restaurar padrão
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
