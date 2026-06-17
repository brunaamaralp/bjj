import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { databases, DB_ID, ACADEMIES_COL } from '../../lib/appwrite';
import { getAcademyDocument, invalidateAcademyDocumentCache } from '../../lib/getAcademyDocument.js';
import { useUiStore } from '../../store/useUiStore';
import { friendlyError } from '../../lib/errorMessages';
import { parseAcademySettings } from '../../lib/stockSettings';
import {
  DEFAULT_FOLLOWUP_PLAYBOOK,
  mergeFollowupPlaybookIntoSettings,
  readFollowupPlaybook,
  validateFollowupPlaybook,
} from '../../lib/followupPlaybookDefaults';
import { describePlaybookStep } from '../../lib/followupState.js';
import { WHATSAPP_TEMPLATE_KEYS, WHATSAPP_TEMPLATE_LABELS } from '../../../lib/whatsappTemplateDefaults.js';
import './followup-playbook.css';

function formatPlaybookOffset(days) {
  const n = Number(days);
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n === 0) return 'No mesmo dia';
  if (n === 1) return '1 dia depois';
  return `${n} dias depois`;
}

const ACTION_TYPES = [
  { value: 'whatsapp_template', label: 'WhatsApp (template)' },
  { value: 'task', label: 'Criar tarefa' },
  { value: 'manual', label: 'Ação manual' },
];

function clonePlaybook(pb) {
  return {
    ...pb,
    attended: (pb.attended || []).map((s) => ({ ...s })),
    missed: (pb.missed || []).map((s) => ({ ...s })),
  };
}

function emptyStep(offset = 0) {
  return {
    offset_days: offset,
    action_type: 'whatsapp_template',
    template_key: 'dashboard_contact',
    skip_if_contacted: true,
  };
}

export default function FollowupPlaybookSection({
  embeddedInLayout = false,
  academyId,
  academySettings,
  settingsLoading = false,
  onSettingsSaved,
}) {
  const addToast = useUiStore((s) => s.addToast);
  const usesSharedSettings = academySettings !== undefined;
  const [playbook, setPlaybook] = useState(DEFAULT_FOLLOWUP_PLAYBOOK);
  const [draft, setDraft] = useState(null);
  const [activeTab, setActiveTab] = useState('attended');
  const [selfLoading, setSelfLoading] = useState(!usesSharedSettings);
  const [saving, setSaving] = useState(false);
  const loading = usesSharedSettings ? settingsLoading : selfLoading;

  useEffect(() => {
    if (!usesSharedSettings) return;
    if (settingsLoading) return;
    const pb = readFollowupPlaybook(academySettings);
    setPlaybook(pb);
    setDraft(null);
  }, [usesSharedSettings, academySettings, settingsLoading]);

  const load = useCallback(async () => {
    if (!academyId || usesSharedSettings) return;
    setSelfLoading(true);
    try {
      const doc = await getAcademyDocument(academyId);
      const pb = readFollowupPlaybook(doc.settings);
      setPlaybook(pb);
      setDraft(null);
    } catch (e) {
      console.error('[FollowupPlaybook]', e);
      setPlaybook(clonePlaybook(DEFAULT_FOLLOWUP_PLAYBOOK));
    } finally {
      setSelfLoading(false);
    }
  }, [academyId, usesSharedSettings]);

  useEffect(() => {
    void load();
  }, [load]);

  const editing = draft !== null;
  const view = editing ? draft : playbook;

  const persist = async (next) => {
    const errors = validateFollowupPlaybook(next);
    if (errors.length) {
      addToast({ type: 'error', message: errors[0] });
      return;
    }
    if (!academyId) return;
    setSaving(true);
    try {
      const doc = await getAcademyDocument(academyId);
      const merged = mergeFollowupPlaybookIntoSettings(parseAcademySettings(doc.settings), next);
      const settingsRaw = JSON.stringify(merged);
      await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
        settings: settingsRaw,
      });
      invalidateAcademyDocumentCache(academyId);
      onSettingsSaved?.(settingsRaw);
      setPlaybook(next);
      setDraft(null);
      addToast({ type: 'success', message: 'Acompanhamento pós-aula salvo.' });
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSaving(false);
    }
  };

  const updateStep = (track, index, patch) => {
    setDraft((prev) => {
      const base = prev || clonePlaybook(playbook);
      const steps = [...(base[track] || [])];
      steps[index] = { ...steps[index], ...patch };
      return { ...base, [track]: steps };
    });
  };

  const moveStep = (track, index, dir) => {
    setDraft((prev) => {
      const base = prev || clonePlaybook(playbook);
      const steps = [...(base[track] || [])];
      const j = index + dir;
      if (j < 0 || j >= steps.length) return base;
      [steps[index], steps[j]] = [steps[j], steps[index]];
      return { ...base, [track]: steps };
    });
  };

  const removeStep = (track, index) => {
    setDraft((prev) => {
      const base = prev || clonePlaybook(playbook);
      const steps = (base[track] || []).filter((_, i) => i !== index);
      return { ...base, [track]: steps };
    });
  };

  const addStep = (track) => {
    setDraft((prev) => {
      const base = prev || clonePlaybook(playbook);
      const steps = [...(base[track] || [])];
      const maxOffset = steps.reduce((m, s) => Math.max(m, Number(s.offset_days) || 0), 0);
      steps.push(emptyStep(maxOffset + 1));
      return { ...base, [track]: steps };
    });
  };

  if (!academyId) return null;

  const renderReadTrack = (title, steps) => (
    <div className="followup-playbook-track">
      <h4 className="followup-playbook-track__title">{title}</h4>
      <ol className="followup-playbook-track__list">
        {(steps || []).map((step, i) => (
          <li key={`${title}-${step.offset_days}-${i}`} className="followup-playbook-track__item">
            <span className="followup-playbook-track__day">{formatPlaybookOffset(step.offset_days)}</span>
            <span className="followup-playbook-track__action">{describePlaybookStep(step)}</span>
          </li>
        ))}
      </ol>
    </div>
  );

  const renderEditTrack = (track, title) => {
    const steps = view[track] || [];
    return (
      <div className="followup-playbook-track followup-playbook-track--edit">
        <h4 className="followup-playbook-track__title">{title}</h4>
        <div className="followup-playbook-steps">
          {steps.map((step, i) => (
            <div key={`${track}-${i}`} className="followup-playbook-step">
              <div className="followup-playbook-step__row">
                <label className="followup-playbook-step__field">
                  <span className="text-small text-muted" title="Quantos dias após a aula experimental">
                    Dias depois
                  </span>
                  <input
                    type="number"
                    min={0}
                    className="input followup-playbook-step__offset"
                    value={step.offset_days}
                    disabled={saving}
                    onChange={(e) =>
                      updateStep(track, i, { offset_days: Math.max(0, parseInt(e.target.value, 10) || 0) })
                    }
                  />
                </label>
                <label className="followup-playbook-step__field followup-playbook-step__field--grow">
                  <span className="text-small text-muted">Tipo</span>
                  <select
                    className="input"
                    value={step.action_type}
                    disabled={saving}
                    onChange={(e) => updateStep(track, i, { action_type: e.target.value })}
                  >
                    {ACTION_TYPES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="followup-playbook-step__order">
                  <button type="button" className="icon-btn" disabled={i === 0 || saving} onClick={() => moveStep(track, i, -1)} aria-label="Subir">
                    <ChevronUp size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    disabled={i === steps.length - 1 || saving}
                    onClick={() => moveStep(track, i, 1)}
                    aria-label="Descer"
                  >
                    <ChevronDown size={16} />
                  </button>
                  <button type="button" className="icon-btn" disabled={saving} onClick={() => removeStep(track, i)} aria-label="Remover">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              {step.action_type === 'whatsapp_template' ? (
                <label className="followup-playbook-step__field">
                  <span className="text-small text-muted">Template</span>
                  <select
                    className="input"
                    value={step.template_key || 'dashboard_contact'}
                    disabled={saving}
                    onChange={(e) => updateStep(track, i, { template_key: e.target.value })}
                  >
                    {WHATSAPP_TEMPLATE_KEYS.map((k) => (
                      <option key={k} value={k}>
                        {WHATSAPP_TEMPLATE_LABELS[k] || k}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {step.action_type === 'task' ? (
                <>
                  <label className="followup-playbook-step__field">
                    <span className="text-small text-muted">Título da tarefa</span>
                    <input
                      className="input"
                      value={step.task_title || ''}
                      disabled={saving}
                      onChange={(e) => updateStep(track, i, { task_title: e.target.value })}
                    />
                  </label>
                  <label className="followup-playbook-step__field">
                    <span className="text-small text-muted">Notas</span>
                    <input
                      className="input"
                      value={step.task_notes || ''}
                      disabled={saving}
                      onChange={(e) => updateStep(track, i, { task_notes: e.target.value })}
                    />
                  </label>
                </>
              ) : null}
              <label className="followup-playbook-step__check text-small">
                <input
                  type="checkbox"
                  checked={step.skip_if_contacted !== false}
                  disabled={saving}
                  onChange={(e) => updateStep(track, i, { skip_if_contacted: e.target.checked })}
                />
                Pular se já houve contato
              </label>
            </div>
          ))}
        </div>
        <button type="button" className="btn-outline followup-playbook-add" disabled={saving} onClick={() => addStep(track)}>
          <Plus size={14} aria-hidden /> Adicionar etapa
        </button>
      </div>
    );
  };

  return (
    <section
      className="empresa-section animate-in followup-playbook-section"
      style={{ marginTop: embeddedInLayout ? 0 : 16 }}
    >
      <div className="card" style={{ padding: 16 }}>
        <div className="followup-playbook-section__head">
          {!embeddedInLayout ? (
            <div>
              <h3 className="navi-section-heading" style={{ margin: 0 }}>
                Acompanhamento após a experimental
              </h3>
              <p className="text-small text-muted" style={{ marginTop: 6 }}>
                Define o que a recepção deve sugerir para cada lead depois da aula experimental — na tela{' '}
                <strong>Hoje</strong>, em <strong>Follow-ups pendentes</strong>. Cada etapa vira a próxima ação
                sugerida na lista.
              </p>
              <p className="text-small text-muted followup-playbook-reception-note">
                A etapa do dia seguinte (mensagem de retorno) pode ser enviada automaticamente pela automação{' '}
                <strong>Retorno no dia seguinte (compareceu)</strong>, em Configurações → Automações — desde que
                ainda não tenha havido contato com o lead.
              </p>
            </div>
          ) : (
            <div>
              <p className="text-small text-muted followup-playbook-reception-note" style={{ margin: 0 }}>
                A etapa do dia seguinte (mensagem de retorno) pode ser enviada automaticamente pela automação{' '}
                <strong>Retorno no dia seguinte (compareceu)</strong>, em Mensagens do funil — desde que ainda não
                tenha havido contato com o lead.
              </p>
            </div>
          )}
          <label className="followup-playbook-section__toggle text-small">
            <input
              type="checkbox"
              checked={view.enabled !== false}
              disabled={loading || saving}
              onChange={(e) => {
                const next = { ...(editing ? draft : playbook), enabled: e.target.checked };
                if (editing) setDraft(next);
                else void persist(next);
              }}
            />
            Acompanhamento ativo
          </label>
        </div>

        {loading ? (
          <p className="text-small text-muted">Carregando…</p>
        ) : editing ? (
          <>
            <div className="followup-playbook-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                className={`followup-playbook-tab${activeTab === 'attended' ? ' is-active' : ''}`}
                onClick={() => setActiveTab('attended')}
              >
                Compareceu
              </button>
              <button
                type="button"
                role="tab"
                className={`followup-playbook-tab${activeTab === 'missed' ? ' is-active' : ''}`}
                onClick={() => setActiveTab('missed')}
              >
                Faltou
              </button>
            </div>
            {activeTab === 'attended' ? renderEditTrack('attended', 'Compareceu') : renderEditTrack('missed', 'Faltou')}
            <p className="text-small text-muted followup-playbook-preview">
              Ex.: se o lead compareceu hoje, amanhã a tela Hoje sugere a mensagem de retorno — e a automação
              pode enviar sozinha, se ainda não houve contato.
            </p>
            <div className="followup-playbook-section__actions">
              <button type="button" className="btn-outline" disabled={saving} onClick={() => setDraft(null)}>
                Cancelar
              </button>
              <button type="button" className="btn" disabled={saving} onClick={() => void persist(draft)}>
                {saving ? 'Salvando…' : 'Salvar alterações'}
              </button>
            </div>
          </>
        ) : (
          <>
            {renderReadTrack('Compareceu', playbook.attended)}
            {renderReadTrack('Faltou', playbook.missed)}
            <div className="followup-playbook-section__actions">
              <button type="button" className="btn-outline" disabled={saving} onClick={() => setDraft(clonePlaybook(playbook))}>
                Personalizar etapas
              </button>
              <button
                type="button"
                className="btn-outline"
                disabled={saving}
                onClick={() =>
                  void persist({
                    ...DEFAULT_FOLLOWUP_PLAYBOOK,
                    attended: [...DEFAULT_FOLLOWUP_PLAYBOOK.attended],
                    missed: [...DEFAULT_FOLLOWUP_PLAYBOOK.missed],
                  })
                }
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
