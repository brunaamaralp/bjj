import React, { useCallback, useEffect, useState } from 'react';
import { PlusCircle } from 'lucide-react';
import { databases, DB_ID, ACADEMIES_COL } from '../../lib/appwrite';
import { LEAD_STATUS } from '../../store/useLeadStore';
import { useUiStore } from '../../store/useUiStore';
import { useTerms } from '../../lib/terminology.js';
import { useUserRole } from '../../lib/useUserRole';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import {
  buildDefaultPipelineStages,
  cleanStagesForSave,
  DEFAULT_STAGE_SLA_DAYS,
  normalizePipelineStagesFromDoc,
} from '../../lib/pipelineStagesConfig.js';

export default function PipelineStagesSection({
  academyId,
  vertical = 'fitness',
  academyDataVersion = 0,
  academyForRole = {},
}) {
  const terms = useTerms();
  const addToast = useUiStore((s) => s.addToast);
  const role = useUserRole(academyForRole);
  const canEdit = role === 'owner';
  const [stages, setStages] = useState([]);
  const [saving, setSaving] = useState(false);
  const [confirmDefault, setConfirmDefault] = useState(false);

  const loadStages = useCallback(async () => {
    if (!academyId) return;
    try {
      const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
      setStages(normalizePipelineStagesFromDoc(doc.stagesConfig, { vertical, terms }));
    } catch (e) {
      console.error('[PipelineStagesSection]', e);
      addToast({ type: 'error', message: 'Não foi possível carregar as etapas do funil.' });
      setStages(buildDefaultPipelineStages(terms));
    }
  }, [academyId, vertical, terms, addToast]);

  useEffect(() => {
    void loadStages();
  }, [loadStages, academyDataVersion]);

  const saveStages = async () => {
    if (!academyId) return;
    setSaving(true);
    try {
      const cleaned = cleanStagesForSave(stages);
      await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
        stagesConfig: JSON.stringify(cleaned),
      });
      setStages(cleaned);
      addToast({ type: 'success', message: 'Etapas do funil salvas.' });
    } catch (e) {
      console.error('saveStages:', e);
      addToast({ type: 'error', message: 'Erro ao salvar etapas do funil.' });
    } finally {
      setSaving(false);
    }
  };

  const addStage = () => {
    const id = `custom-${Date.now()}`;
    setStages((prev) => [...prev, { id, label: 'Nova etapa', slaDays: DEFAULT_STAGE_SLA_DAYS }]);
  };

  const applyDefault = () => {
    setStages(
      buildDefaultPipelineStages(terms).map((s) => ({
        ...s,
        slaDays: s.slaDays ?? DEFAULT_STAGE_SLA_DAYS,
      }))
    );
    setConfirmDefault(false);
  };

  return (
    <div className="finance-settings-section-body">
      <p className="text-small text-muted" style={{ margin: '0 0 16px', lineHeight: 1.45 }}>
        Defina as colunas do funil de vendas. Alterações aparecem no Kanban após salvar.
      </p>
      <div className="stage-editor-head">
        <span>Nome da etapa</span>
        <span title="Alerta quando o interessado permanece mais dias que o limite nesta etapa">SLA (dias)</span>
      </div>
      {stages.map((st, idx) => (
        <div className="stage-row" key={st.id}>
          <input
            className="stage-input"
            value={st.label}
            disabled={!canEdit || st.id === LEAD_STATUS.MISSED || st.id === LEAD_STATUS.LOST}
            onChange={(e) => {
              const v = e.target.value;
              setStages((prev) => prev.map((s, i) => (i === idx ? { ...s, label: v } : s)));
            }}
          />
          <input
            className="stage-sla"
            type="number"
            min="1"
            value={st.slaDays ?? DEFAULT_STAGE_SLA_DAYS}
            disabled={!canEdit || st.id === LEAD_STATUS.MISSED || st.id === LEAD_STATUS.LOST}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              setStages((prev) => prev.map((s, i) => (i === idx ? { ...s, slaDays: v } : s)));
            }}
            title="SLA (dias)"
          />
        </div>
      ))}
      {canEdit ? (
        <div className="stage-actions">
          <button type="button" className="btn-secondary" onClick={addStage}>
            <PlusCircle size={14} /> Adicionar etapa
          </button>
          <button type="button" className="btn-outline" onClick={() => setConfirmDefault(true)}>
            Funil padrão
          </button>
          <div className="grow" />
          <button type="button" className="btn-primary" disabled={saving} onClick={() => void saveStages()}>
            {saving ? 'Salvando…' : 'Salvar etapas'}
          </button>
        </div>
      ) : (
        <p className="text-small text-light" style={{ marginTop: 12 }}>
          Somente o titular pode editar as etapas do funil.
        </p>
      )}

      <ConfirmDialog
        open={confirmDefault}
        title="Aplicar funil padrão?"
        description="As etapas atuais serão substituídas pelo modelo padrão. Clique em Salvar etapas para gravar."
        confirmLabel="Aplicar"
        onConfirm={applyDefault}
        onClose={() => setConfirmDefault(false)}
      />
    </div>
  );
}
